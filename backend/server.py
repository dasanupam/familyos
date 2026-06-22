"""Family Life OS – FastAPI backend.

Modules: Auth, Family Members, Universal Inbox (AI parsing),
Finance (transactions, investments, loans), Goals, FIRE, Health
(prescriptions, lab results, vitals), Documents (object storage),
Generic Entries (extensible modules).
"""
import os
import io
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, date
from typing import Optional, List, Any

from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response, Header
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import (
    hash_password, verify_password, create_token, get_current_user_id, decode_token
)
from storage import put_object, get_object, init_storage, guess_mime, APP_NAME
from ai_parser import parse_universal, parse_image_file

# ---------------- Setup ----------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Family Life OS")
api = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    return date.today().isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class MemberIn(BaseModel):
    name: str
    relation: Optional[str] = None
    color: Optional[str] = "#184A31"
    avatar_url: Optional[str] = None


class FireConfigIn(BaseModel):
    target_corpus: float
    monthly_savings: float
    expected_return_pct: float = 11.0
    current_corpus: Optional[float] = 0.0


class GoalIn(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0.0
    target_date: Optional[str] = None
    category: Optional[str] = "general"
    member_id: Optional[str] = None


class TransactionIn(BaseModel):
    member_id: str
    date: str
    amount: float
    type: str  # expense | income
    category: str
    merchant: Optional[str] = None
    note: Optional[str] = None
    trip_id: Optional[str] = None


class InvestmentIn(BaseModel):
    member_id: str
    name: str
    kind: str
    units: Optional[float] = None
    current_value: Optional[float] = None
    invested_value: Optional[float] = None


class LoanIn(BaseModel):
    member_id: str
    name: str
    outstanding: float
    emi: Optional[float] = None
    rate: Optional[float] = None


class LabResultIn(BaseModel):
    member_id: str
    date: str
    test: str
    value: float
    unit: Optional[str] = None
    reference_range: Optional[str] = None


class VitalIn(BaseModel):
    member_id: str
    date: str
    kind: str
    value: str
    unit: Optional[str] = None


class PrescriptionIn(BaseModel):
    member_id: str
    date: str
    doctor: Optional[str] = None
    medications: List[dict] = []
    notes: Optional[str] = None


class InboxIn(BaseModel):
    text: str
    member_id: Optional[str] = None


# ---------------- Auth ----------------
@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = new_id()
    await db.users.insert_one({
        "id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "password_hash": hash_password(body.password),
        "created_at": now_iso(),
    })
    # Seed first family member as the user themselves
    member_id = new_id()
    await db.members.insert_one({
        "id": member_id, "user_id": user_id, "name": body.name,
        "relation": "self", "color": "#184A31", "avatar_url": None, "created_at": now_iso(),
    })
    token = create_token(user_id)
    return {"token": token, "user": {"id": user_id, "email": body.email.lower(), "name": body.name}}


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}}


@api.get("/auth/me")
async def me(user_id: str = Depends(get_current_user_id)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ---------------- Family Members ----------------
@api.get("/members")
async def list_members(user_id: str = Depends(get_current_user_id)):
    items = await db.members.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    return items


@api.post("/members")
async def create_member(body: MemberIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.members.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/members/{member_id}")
async def delete_member(member_id: str, user_id: str = Depends(get_current_user_id)):
    res = await db.members.delete_one({"id": member_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"ok": True}


# ---------------- Generic helpers ----------------
async def _resolve_member(user_id: str, member_hint: Optional[str], default_member_id: Optional[str]) -> str:
    if default_member_id:
        m = await db.members.find_one({"id": default_member_id, "user_id": user_id})
        if m:
            return m["id"]
    if member_hint:
        m = await db.members.find_one({"user_id": user_id, "name": {"$regex": f"^{member_hint}$", "$options": "i"}})
        if m:
            return m["id"]
    # fallback: first member
    m = await db.members.find_one({"user_id": user_id})
    if not m:
        raise HTTPException(status_code=400, detail="No family member exists")
    return m["id"]


# ---------------- Universal Inbox ----------------
def _extract_pdf_text(data: bytes) -> str:
    import pdfplumber
    text_parts = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            if t:
                text_parts.append(t)
    return "\n".join(text_parts)


async def _apply_parsed(user_id: str, parsed: dict, default_member_id: Optional[str], document_id: Optional[str] = None) -> dict:
    """Persist whatever the AI returned into the right collections."""
    member_hint = parsed.get("member_hint")
    member_id = await _resolve_member(user_id, member_hint, default_member_id)
    counts = {"transactions": 0, "investments": 0, "loans": 0,
              "lab_results": 0, "prescriptions": 0, "vitals": 0,
              "trips": 0, "career_events": 0, "generic_entries": 0}

    def _base(extra: dict) -> dict:
        b = {"id": new_id(), "user_id": user_id, "member_id": member_id,
             "created_at": now_iso(), **extra}
        if document_id:
            b["origin_document_id"] = document_id
        return b

    for t in parsed.get("transactions", []) or []:
        await db.transactions.insert_one(_base({
            "date": t.get("date") or today_str(),
            "amount": float(t.get("amount", 0)),
            "type": t.get("type", "expense"),
            "category": t.get("category", "other"),
            "merchant": t.get("merchant"), "note": t.get("note"),
        }))
        counts["transactions"] += 1

    for inv in parsed.get("investments", []) or []:
        await db.investments.insert_one(_base({
            "name": inv.get("name", "Unknown"), "kind": inv.get("kind", "other"),
            "units": inv.get("units"), "current_value": inv.get("current_value"),
            "invested_value": inv.get("invested_value"),
        }))
        counts["investments"] += 1

    for loan in parsed.get("loans", []) or []:
        await db.loans.insert_one(_base({
            "name": loan.get("name", "Loan"),
            "outstanding": float(loan.get("outstanding", 0)),
            "emi": loan.get("emi"), "rate": loan.get("rate"),
        }))
        counts["loans"] += 1

    for lab in parsed.get("lab_results", []) or []:
        await db.lab_results.insert_one(_base({
            "date": lab.get("date") or today_str(),
            "test": lab.get("test", "Unknown"),
            "value": float(lab.get("value", 0)),
            "unit": lab.get("unit"), "reference_range": lab.get("reference_range"),
        }))
        counts["lab_results"] += 1

    for pres in parsed.get("prescriptions", []) or []:
        await db.prescriptions.insert_one(_base({
            "date": pres.get("date") or today_str(),
            "doctor": pres.get("doctor"),
            "medications": pres.get("medications", []),
            "notes": pres.get("notes"),
        }))
        counts["prescriptions"] += 1

    for v in parsed.get("vitals", []) or []:
        await db.vitals.insert_one(_base({
            "date": v.get("date") or today_str(),
            "kind": v.get("kind", "other"),
            "value": str(v.get("value", "")), "unit": v.get("unit"),
        }))
        counts["vitals"] += 1

    for tr in parsed.get("trips", []) or []:
        await db.trips.insert_one(_base({
            "name": tr.get("name", "Trip"),
            "destination": tr.get("destination", ""),
            "start_date": tr.get("start_date"), "end_date": tr.get("end_date"),
            "budget": tr.get("budget"), "notes": tr.get("notes"),
        }))
        counts["trips"] += 1

    for ev in parsed.get("career_events", []) or []:
        await db.career_events.insert_one(_base({
            "date": ev.get("date") or today_str(),
            "kind": ev.get("kind", "achievement"),
            "title": ev.get("title", ""), "company": ev.get("company"),
            "ctc": ev.get("ctc"), "notes": ev.get("notes"),
        }))
        counts["career_events"] += 1

    for g in parsed.get("generic_entries", []) or []:
        await db.generic_entries.insert_one(_base({
            "category": g.get("category", "note"),
            "title": g.get("title", "Note"),
            "data": g.get("data", {}),
        }))
        counts["generic_entries"] += 1

    return counts


@api.post("/inbox/text")
async def inbox_text(body: InboxIn, user_id: str = Depends(get_current_user_id)):
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    members = await db.members.find({"user_id": user_id}, {"_id": 0, "name": 1}).to_list(50)
    parsed = await parse_universal(body.text, today_str(), [m["name"] for m in members])
    counts = await _apply_parsed(user_id, parsed, body.member_id)
    await db.inbox_log.insert_one({
        "id": new_id(), "user_id": user_id, "kind": "text",
        "input_preview": body.text[:500], "parsed": parsed,
        "counts": counts, "created_at": now_iso(),
    })
    return {"parsed": parsed, "counts": counts}


@api.post("/inbox/file")
async def inbox_file(
    file: UploadFile = File(...),
    member_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user_id),
):
    data = await file.read()
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_type = file.content_type or guess_mime(filename)

    # Upload file to object storage FIRST so we have document_id for linking
    storage_path = f"{APP_NAME}/uploads/{user_id}/{new_id()}.{ext or 'bin'}"
    try:
        put_object(storage_path, data, content_type)
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=500, detail="Storage upload failed")

    doc_id = new_id()
    await db.documents.insert_one({
        "id": doc_id, "user_id": user_id, "member_id": member_id,
        "storage_path": storage_path, "original_filename": filename,
        "content_type": content_type, "size": len(data),
        "is_deleted": False, "created_at": now_iso(),
    })

    # Parse based on type
    members = await db.members.find({"user_id": user_id}, {"_id": 0, "name": 1}).to_list(50)
    member_names = [m["name"] for m in members]
    parsed = {"summary": f"Uploaded {filename}", "module": "generic", "confidence": 0.0}
    counts = {}

    try:
        if ext == "pdf":
            text = _extract_pdf_text(data)
            if text.strip():
                parsed = await parse_universal(text, today_str(), member_names)
        elif ext in ("txt", "csv", "json", "md"):
            text = data.decode("utf-8", errors="ignore")
            parsed = await parse_universal(text, today_str(), member_names)
        elif content_type.startswith("image/") or ext in ("jpg", "jpeg", "png", "webp", "gif"):
            parsed = await parse_image_file(data, content_type, today_str(), member_names)
    except Exception as e:
        logger.error(f"Parse error for {filename}: {e}")

    if parsed.get("confidence", 0) > 0 or parsed.get("module") != "generic":
        counts = await _apply_parsed(user_id, parsed, member_id, document_id=doc_id)

    await db.documents.update_one({"id": doc_id}, {"$set": {
        "parsed_summary": parsed.get("summary"), "counts": counts
    }})

    await db.inbox_log.insert_one({
        "id": new_id(), "user_id": user_id, "kind": "file",
        "input_preview": filename, "parsed": parsed, "counts": counts,
        "document_id": doc_id, "created_at": now_iso(),
    })
    return {"document_id": doc_id, "parsed": parsed, "counts": counts}


@api.get("/inbox/log")
async def inbox_log(user_id: str = Depends(get_current_user_id), limit: int = 20):
    items = await db.inbox_log.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items


# ---------------- Finance ----------------
def _filter_member(user_id: str, member_id: Optional[str]) -> dict:
    q = {"user_id": user_id}
    if member_id and member_id != "family":
        q["member_id"] = member_id
    return q


@api.get("/finance/transactions")
async def list_transactions(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    items = await db.transactions.find(_filter_member(user_id, member_id), {"_id": 0}).sort("date", -1).to_list(500)
    return items


@api.post("/finance/transactions")
async def create_transaction(body: TransactionIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/finance/transactions/{tx_id}")
async def delete_transaction(tx_id: str, user_id: str = Depends(get_current_user_id)):
    await db.transactions.delete_one({"id": tx_id, "user_id": user_id})
    return {"ok": True}


@api.get("/finance/investments")
async def list_investments(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    items = await db.investments.find(_filter_member(user_id, member_id), {"_id": 0}).to_list(500)
    return items


@api.post("/finance/investments")
async def create_investment(body: InvestmentIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.investments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/finance/investments/{inv_id}")
async def delete_investment(inv_id: str, user_id: str = Depends(get_current_user_id)):
    await db.investments.delete_one({"id": inv_id, "user_id": user_id})
    return {"ok": True}


@api.get("/finance/loans")
async def list_loans(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    items = await db.loans.find(_filter_member(user_id, member_id), {"_id": 0}).to_list(500)
    return items


@api.post("/finance/loans")
async def create_loan(body: LoanIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.loans.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/finance/loans/{lid}")
async def delete_loan(lid: str, user_id: str = Depends(get_current_user_id)):
    await db.loans.delete_one({"id": lid, "user_id": user_id})
    return {"ok": True}


@api.get("/finance/summary")
async def finance_summary(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    q = _filter_member(user_id, member_id)
    today = datetime.now(timezone.utc)
    month_start = today.replace(day=1).date().isoformat()

    txs = await db.transactions.find(q, {"_id": 0}).to_list(2000)
    income_month = sum(t["amount"] for t in txs if t["type"] == "income" and t["date"] >= month_start)
    expense_month = sum(t["amount"] for t in txs if t["type"] == "expense" and t["date"] >= month_start)

    investments = await db.investments.find(q, {"_id": 0}).to_list(500)
    invest_value = sum((i.get("current_value") or 0) for i in investments)

    loans = await db.loans.find(q, {"_id": 0}).to_list(500)
    debt = sum(ln.get("outstanding", 0) for ln in loans)

    net_worth = invest_value - debt
    # Category breakdown for current month
    cat_breakdown = {}
    for t in txs:
        if t["type"] == "expense" and t["date"] >= month_start:
            cat_breakdown[t["category"]] = cat_breakdown.get(t["category"], 0) + t["amount"]

    return {
        "income_month": income_month,
        "expense_month": expense_month,
        "savings_month": income_month - expense_month,
        "net_worth": net_worth,
        "invest_value": invest_value,
        "debt": debt,
        "category_breakdown": cat_breakdown,
    }


@api.get("/finance/monthly-trend")
async def monthly_trend(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    q = _filter_member(user_id, member_id)
    txs = await db.transactions.find(q, {"_id": 0}).to_list(5000)
    months: dict[str, dict] = {}
    for t in txs:
        m = t["date"][:7]
        bucket = months.setdefault(m, {"month": m, "income": 0, "expense": 0})
        if t["type"] == "income":
            bucket["income"] += t["amount"]
        else:
            bucket["expense"] += t["amount"]
    return sorted(months.values(), key=lambda x: x["month"])[-12:]


# ---------------- Goals ----------------
@api.get("/goals")
async def list_goals(user_id: str = Depends(get_current_user_id)):
    return await db.goals.find({"user_id": user_id}, {"_id": 0}).to_list(200)


@api.post("/goals")
async def create_goal(body: GoalIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.goals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/goals/{gid}")
async def update_goal(gid: str, body: dict, user_id: str = Depends(get_current_user_id)):
    await db.goals.update_one({"id": gid, "user_id": user_id}, {"$set": body})
    item = await db.goals.find_one({"id": gid}, {"_id": 0})
    return item


@api.delete("/goals/{gid}")
async def delete_goal(gid: str, user_id: str = Depends(get_current_user_id)):
    await db.goals.delete_one({"id": gid, "user_id": user_id})
    return {"ok": True}


# ---------------- FIRE ----------------
@api.get("/fire")
async def get_fire(user_id: str = Depends(get_current_user_id)):
    cfg = await db.fire_config.find_one({"user_id": user_id}, {"_id": 0})
    if not cfg:
        return None
    # Compute years to FIRE using compound formula on monthly savings
    target = cfg["target_corpus"]
    current = cfg.get("current_corpus") or 0
    monthly = cfg["monthly_savings"]
    r_annual = (cfg.get("expected_return_pct") or 11.0) / 100.0
    r_m = r_annual / 12.0
    months = 0
    bal = current
    while bal < target and months < 12 * 80:
        bal = bal * (1 + r_m) + monthly
        months += 1
    years = round(months / 12.0, 1)
    pct = min(100.0, round((current / target) * 100, 1)) if target > 0 else 0
    target_date = None
    if months < 12 * 80:
        from dateutil.relativedelta import relativedelta
        target_date = (datetime.now(timezone.utc) + relativedelta(months=months)).date().isoformat()
    return {**cfg, "years_to_fire": years, "progress_pct": pct, "target_date": target_date}


@api.post("/fire")
async def upsert_fire(body: FireConfigIn, user_id: str = Depends(get_current_user_id)):
    doc = body.model_dump()
    doc["user_id"] = user_id
    doc["updated_at"] = now_iso()
    await db.fire_config.update_one({"user_id": user_id}, {"$set": doc}, upsert=True)
    return await get_fire(user_id)


# ---------------- Health ----------------
@api.get("/health/prescriptions")
async def list_prescriptions(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return await db.prescriptions.find(_filter_member(user_id, member_id), {"_id": 0}).sort("date", -1).to_list(500)


@api.post("/health/prescriptions")
async def create_prescription(body: PrescriptionIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.prescriptions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/health/prescriptions/{pid}")
async def delete_prescription(pid: str, user_id: str = Depends(get_current_user_id)):
    await db.prescriptions.delete_one({"id": pid, "user_id": user_id})
    return {"ok": True}


@api.get("/health/labs")
async def list_labs(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return await db.lab_results.find(_filter_member(user_id, member_id), {"_id": 0}).sort("date", -1).to_list(2000)


@api.post("/health/labs")
async def create_lab(body: LabResultIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.lab_results.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/health/labs/{lid}")
async def delete_lab(lid: str, user_id: str = Depends(get_current_user_id)):
    await db.lab_results.delete_one({"id": lid, "user_id": user_id})
    return {"ok": True}


@api.get("/health/vitals")
async def list_vitals(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return await db.vitals.find(_filter_member(user_id, member_id), {"_id": 0}).sort("date", -1).to_list(2000)


@api.post("/health/vitals")
async def create_vital(body: VitalIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.vitals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/health/vitals/{vid}")
async def delete_vital(vid: str, user_id: str = Depends(get_current_user_id)):
    await db.vitals.delete_one({"id": vid, "user_id": user_id})
    return {"ok": True}


# ---------------- Documents ----------------
@api.get("/documents")
async def list_documents(user_id: str = Depends(get_current_user_id)):
    return await db.documents.find({"user_id": user_id, "is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, authorization: str = Header(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="auth required")
    token = auth_header.replace("Bearer ", "")
    user_id = decode_token(token)
    record = await db.documents.find_one({"id": doc_id, "user_id": user_id, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="Document not found")
    data, ct = get_object(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type", ct))


@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user_id: str = Depends(get_current_user_id)):
    await db.documents.update_one({"id": doc_id, "user_id": user_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}


# ---------------- Generic Entries (extensible modules) ----------------
@api.get("/generic")
async def list_generic(category: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    q = {"user_id": user_id}
    if category:
        q["category"] = category
    return await db.generic_entries.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/generic/categories")
async def generic_categories(user_id: str = Depends(get_current_user_id)):
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "category": "$_id", "count": 1}},
    ]
    cur = db.generic_entries.aggregate(pipeline)
    return [c async for c in cur]


# ---------------- Dashboard ----------------
@api.get("/dashboard/overview")
async def dashboard_overview(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    summary = await finance_summary(member_id, user_id)  # type: ignore
    members = await db.members.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    fire = await get_fire(user_id)  # type: ignore
    goals = await db.goals.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    recent_inbox = await db.inbox_log.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(5)
    q = _filter_member(user_id, member_id)
    recent_labs = await db.lab_results.find(q, {"_id": 0}).sort("date", -1).to_list(5)
    recent_meds = await db.prescriptions.find(q, {"_id": 0}).sort("date", -1).to_list(3)
    return {
        "summary": summary, "members": members, "fire": fire, "goals": goals,
        "recent_inbox": recent_inbox, "recent_labs": recent_labs, "recent_meds": recent_meds,
    }


# ---------------- Inline edits (PATCH) ----------------
PATCH_COLLECTIONS = {
    "transactions": db.transactions,
    "investments": db.investments,
    "loans": db.loans,
    "labs": db.lab_results,
    "vitals": db.vitals,
    "prescriptions": db.prescriptions,
    "trips": db.trips,
    "career-events": db.career_events,
}


@api.patch("/{kind}/{rid}")
async def patch_record(kind: str, rid: str, body: dict, user_id: str = Depends(get_current_user_id)):
    coll = PATCH_COLLECTIONS.get(kind)
    if coll is None:
        raise HTTPException(status_code=404, detail="Unknown kind")
    body.pop("id", None)
    body.pop("user_id", None)
    body.pop("_id", None)
    # Coerce known numeric fields
    for k in ("amount", "outstanding", "emi", "rate", "units", "current_value", "invested_value", "value", "budget", "ctc"):
        if k in body and body[k] not in (None, ""):
            try:
                body[k] = float(body[k])
            except Exception:
                pass
    await coll.update_one({"id": rid, "user_id": user_id}, {"$set": body})
    item = await coll.find_one({"id": rid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


# ---------------- Travel ----------------
class TripIn(BaseModel):
    member_id: str
    name: str
    destination: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: Optional[float] = None
    notes: Optional[str] = None


@api.get("/travel/trips")
async def list_trips(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return await db.trips.find(_filter_member(user_id, member_id), {"_id": 0}).sort("start_date", -1).to_list(500)


@api.post("/travel/trips")
async def create_trip(body: TripIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.trips.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/travel/trips/{tid}")
async def delete_trip(tid: str, user_id: str = Depends(get_current_user_id)):
    await db.trips.delete_one({"id": tid, "user_id": user_id})
    await db.transactions.update_many({"trip_id": tid, "user_id": user_id}, {"$unset": {"trip_id": ""}})
    return {"ok": True}


@api.get("/travel/trips/{tid}/summary")
async def trip_summary(tid: str, user_id: str = Depends(get_current_user_id)):
    trip = await db.trips.find_one({"id": tid, "user_id": user_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    txs = await db.transactions.find({"trip_id": tid, "user_id": user_id}, {"_id": 0}).to_list(1000)
    spend = sum(t["amount"] for t in txs if t["type"] == "expense")
    by_cat = {}
    for t in txs:
        if t["type"] == "expense":
            by_cat[t["category"]] = by_cat.get(t["category"], 0) + t["amount"]
    return {"trip": trip, "spend": spend, "transactions": txs, "by_category": by_cat,
            "budget_used_pct": round(spend / trip["budget"] * 100, 1) if trip.get("budget") else None}


# ---------------- Career ----------------
class CareerRoleIn(BaseModel):
    member_id: str
    company: str
    title: str
    start_date: str
    end_date: Optional[str] = None
    ctc: Optional[float] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class CareerEventIn(BaseModel):
    member_id: str
    date: str
    kind: str
    title: str
    company: Optional[str] = None
    ctc: Optional[float] = None
    notes: Optional[str] = None


class CareerSkillIn(BaseModel):
    member_id: str
    name: str
    level: int = 3
    category: Optional[str] = None


@api.get("/career/roles")
async def list_roles(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return await db.career_roles.find(_filter_member(user_id, member_id), {"_id": 0}).sort("start_date", -1).to_list(200)


@api.post("/career/roles")
async def create_role(body: CareerRoleIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.career_roles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/career/roles/{rid}")
async def delete_role(rid: str, user_id: str = Depends(get_current_user_id)):
    await db.career_roles.delete_one({"id": rid, "user_id": user_id})
    return {"ok": True}


@api.get("/career/events")
async def list_events(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return await db.career_events.find(_filter_member(user_id, member_id), {"_id": 0}).sort("date", -1).to_list(500)


@api.post("/career/events")
async def create_event(body: CareerEventIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.career_events.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/career/events/{eid}")
async def delete_event(eid: str, user_id: str = Depends(get_current_user_id)):
    await db.career_events.delete_one({"id": eid, "user_id": user_id})
    return {"ok": True}


@api.get("/career/skills")
async def list_skills(member_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return await db.career_skills.find(_filter_member(user_id, member_id), {"_id": 0}).to_list(500)


@api.post("/career/skills")
async def create_skill(body: CareerSkillIn, user_id: str = Depends(get_current_user_id)):
    doc = {"id": new_id(), "user_id": user_id, **body.model_dump(), "created_at": now_iso()}
    await db.career_skills.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/career/skills/{sid}")
async def delete_skill(sid: str, user_id: str = Depends(get_current_user_id)):
    await db.career_skills.delete_one({"id": sid, "user_id": user_id})
    return {"ok": True}


# ---------------- Document records (linked rows) ----------------
@api.get("/documents/{doc_id}/records")
async def document_records(doc_id: str, user_id: str = Depends(get_current_user_id)):
    out = {}
    for name, coll in [("transactions", db.transactions), ("investments", db.investments),
                       ("loans", db.loans), ("lab_results", db.lab_results),
                       ("prescriptions", db.prescriptions), ("vitals", db.vitals),
                       ("trips", db.trips), ("career_events", db.career_events)]:
        items = await coll.find({"user_id": user_id, "origin_document_id": doc_id}, {"_id": 0}).to_list(200)
        if items:
            out[name] = items
    return out


# ---------------- CSV Export ----------------
import csv as csv_module
from io import StringIO


def _to_csv(rows: list[dict]) -> str:
    if not rows:
        return ""
    keys = sorted({k for r in rows for k in r.keys()})
    buf = StringIO()
    w = csv_module.DictWriter(buf, fieldnames=keys)
    w.writeheader()
    for r in rows:
        w.writerow({k: (json.dumps(r.get(k)) if isinstance(r.get(k), (dict, list)) else r.get(k)) for k in keys})
    return buf.getvalue()


CSV_KINDS = {
    "transactions": db.transactions, "investments": db.investments, "loans": db.loans,
    "lab_results": db.lab_results, "vitals": db.vitals, "prescriptions": db.prescriptions,
    "trips": db.trips, "career_events": db.career_events, "goals": db.goals,
}


@api.get("/export/{kind}.csv")
async def export_csv(kind: str, authorization: str = Header(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="auth required")
    user_id = decode_token(auth_header.replace("Bearer ", ""))
    coll = CSV_KINDS.get(kind)
    if coll is None:
        raise HTTPException(status_code=404, detail="Unknown export kind")
    rows = await coll.find({"user_id": user_id}, {"_id": 0}).to_list(20000)
    body = _to_csv(rows)
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{kind}.csv"'})


import json  # ensure available


# ---------------- Net-worth snapshot + XIRR ----------------
@api.post("/finance/snapshot")
async def take_snapshot(user_id: str = Depends(get_current_user_id)):
    summary = await finance_summary(None, user_id)  # type: ignore
    snap = {
        "id": new_id(), "user_id": user_id, "date": today_str(),
        "net_worth": summary["net_worth"], "invest_value": summary["invest_value"],
        "debt": summary["debt"], "created_at": now_iso(),
    }
    await db.net_worth_snapshots.replace_one(
        {"user_id": user_id, "date": snap["date"]}, snap, upsert=True
    )
    return snap


@api.get("/finance/net-worth-series")
async def net_worth_series(user_id: str = Depends(get_current_user_id)):
    items = await db.net_worth_snapshots.find({"user_id": user_id}, {"_id": 0}).sort("date", 1).to_list(1000)
    return items


@api.get("/finance/investments/xirr")
async def investments_xirr(user_id: str = Depends(get_current_user_id)):
    # Simple absolute return per investment (true XIRR needs cashflow dates per buy lot).
    inv = await db.investments.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    out = []
    total_invested = 0
    total_current = 0
    for i in inv:
        cur = i.get("current_value") or 0
        inv_v = i.get("invested_value") or 0
        gain = cur - inv_v
        pct = (gain / inv_v * 100) if inv_v > 0 else None
        out.append({"id": i["id"], "name": i["name"], "kind": i["kind"],
                    "invested": inv_v, "current": cur, "gain": gain, "return_pct": pct})
        total_invested += inv_v
        total_current += cur
    overall = (total_current - total_invested) / total_invested * 100 if total_invested > 0 else None
    return {"items": out, "total_invested": total_invested, "total_current": total_current,
            "total_gain": total_current - total_invested, "overall_pct": overall}


# ---------------- Mount + middleware ----------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
