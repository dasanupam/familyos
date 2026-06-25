"""Family Life OS – FastAPI backend v2.
Role-Based Access Control + Service Abstraction Layer.
"""
import os
import io
import uuid
import json
import logging
import csv as csv_module
from pathlib import Path
from datetime import datetime, timezone, date
from typing import Optional, List
from io import StringIO

from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response, Header
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import hash_password, verify_password, create_token, decode_token
from storage import init_storage, guess_mime
from services.storage_service import upload_file, get_file_content
from services.crypto_service import encrypt_doc, decrypt_doc, decrypt_list, encrypt, decrypt
from ai_parser import parse_universal, parse_image_file

# ── Setup ─────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
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


# ── Pydantic models ────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: str          # plain str so any format works at login time
    password: str


class MemberIn(BaseModel):
    name: str
    relation: Optional[str] = None
    color: Optional[str] = "#184A31"
    avatar_url: Optional[str] = None
    role: Optional[str] = "member"
    dob: Optional[str] = None


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
    domain: Optional[str] = "personal"


class TransactionIn(BaseModel):
    member_id: str
    date: str
    amount: float
    type: str
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
    purchase_date: Optional[str] = None


class LoanIn(BaseModel):
    member_id: str
    name: str
    outstanding: float
    emi: Optional[float] = None
    rate: Optional[float] = None


class LabResultIn(BaseModel):
    member_id: Optional[str] = None   # optional – falls back to linked_member_id
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
    systolic: Optional[float] = None
    diastolic: Optional[float] = None


class PrescriptionIn(BaseModel):
    member_id: str
    date: str
    doctor: Optional[str] = None
    medications: List[dict] = []
    notes: Optional[str] = None


class InboxIn(BaseModel):
    text: str
    member_id: Optional[str] = None


class SupplementIn(BaseModel):
    member_id: str
    name: str
    dose: str = ""
    frequency: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None


class TripIn(BaseModel):
    member_id: str
    name: str
    destination: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: Optional[float] = None
    notes: Optional[str] = None


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


# ── RBAC helpers ───────────────────────────────────────────────────────────────
def get_family_user_id(user: dict) -> str:
    """Return the admin user_id that owns all family data.
    For member-role users this is the admin they belong to."""
    return user.get("family_user_id") or user["id"]


def resolve_member_filter(user: dict, member_id_param: Optional[str] = None) -> dict:
    """Build a MongoDB filter dict that respects RBAC.

    Admin: can filter by any specific member or see all (no member filter).
    Member: always forced to their own linked_member_id; member_id_param is ignored.
    """
    family_uid = get_family_user_id(user)
    role = user.get("role", "admin")

    if role == "admin":
        q: dict = {"user_id": family_uid}
        if member_id_param and member_id_param != "family":
            q["member_id"] = member_id_param
        return q
    else:
        linked = user.get("linked_member_id")
        q = {"user_id": family_uid}
        if linked:
            q["member_id"] = linked
        return q


async def get_current_user(authorization: str = Header(None)) -> dict:
    """FastAPI dependency: return full user document (no password_hash)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    user_id = decode_token(token)
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(user: dict) -> None:
    if user.get("role") == "member":
        raise HTTPException(status_code=403, detail="Admin access required")


# ── Seed data ─────────────────────────────────────────────────────────────────
SEED_FAMILY = [
    {"name": "Anupam Das",     "relation": "self",    "role": "admin",  "dob": "1990-01-01",
     "email": "anupam@familyos.app",    "password": "Test@1234", "color": "#184A31"},
    {"name": "Abhilasha",      "relation": "spouse",  "role": "member", "dob": "1992-01-01",
     "email": "abhilasha@familyos.app", "password": "Test@1234", "color": "#4A7B61"},
    {"name": "Amal Kumar Das", "relation": "father",  "role": "member", "dob": "1960-01-01",
     "email": "amal@familyos.app",      "password": "Test@1234", "color": "#D19B4C"},
    {"name": "Kanak Lata Das", "relation": "mother",  "role": "member", "dob": "1962-01-01",
     "email": "kanak@familyos.app",     "password": "Test@1234", "color": "#C25942"},
    {"name": "Arindam Das",    "relation": "sibling", "role": "member", "dob": "1993-01-01",
     "email": "arindam@familyos.app",   "password": "Test@1234", "color": "#6B7D8E"},
]


async def seed_family_data() -> None:
    existing = await db.users.find_one({"email": "anupam@familyos.app"})
    if existing:
        logger.info("Seed data already present, skipping")
        return

    logger.info("Seeding LifeOS family data …")
    admin = SEED_FAMILY[0]
    admin_uid = new_id()
    admin_mid = new_id()

    await db.users.insert_one({
        "id": admin_uid, "email": admin["email"], "name": admin["name"],
        "password_hash": hash_password(admin["password"]),
        "role": "admin", "linked_member_id": admin_mid,
        "family_user_id": admin_uid, "created_at": now_iso(),
    })
    await db.members.insert_one({
        "id": admin_mid, "user_id": admin_uid, "name": admin["name"],
        "relation": admin["relation"], "color": admin["color"],
        "role": "admin", "dob": admin["dob"], "avatar_url": None, "created_at": now_iso(),
    })

    for m in SEED_FAMILY[1:]:
        mid = new_id()
        uid = new_id()
        await db.members.insert_one({
            "id": mid, "user_id": admin_uid, "name": m["name"],
            "relation": m["relation"], "color": m["color"],
            "role": m["role"], "dob": m["dob"], "avatar_url": None, "created_at": now_iso(),
        })
        await db.users.insert_one({
            "id": uid, "email": m["email"], "name": m["name"],
            "password_hash": hash_password(m["password"]),
            "role": "member", "linked_member_id": mid,
            "family_user_id": admin_uid, "created_at": now_iso(),
        })

    logger.info("Seed data created successfully")


# ── Auth ──────────────────────────────────────────────────────────────────────
@api.post("/auth/register")
async def register(body: RegisterIn):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = new_id()
    mid = new_id()
    await db.users.insert_one({
        "id": uid, "email": body.email.lower(), "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "admin", "linked_member_id": mid, "family_user_id": uid,
        "created_at": now_iso(),
    })
    await db.members.insert_one({
        "id": mid, "user_id": uid, "name": body.name,
        "relation": "self", "color": "#184A31", "avatar_url": None,
        "role": "admin", "created_at": now_iso(),
    })
    token = create_token(uid)
    return {
        "access_token": token,
        "user": {"id": uid, "email": body.email.lower(), "name": body.name,
                 "role": "admin", "linked_member_id": mid, "family_user_id": uid},
    }


@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"])
    user_resp = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return {"access_token": token, "user": user_resp}


@api.get("/auth/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user


# ── Family Members ─────────────────────────────────────────────────────────────
@api.get("/members")
async def list_members(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    items = await db.members.find({"user_id": get_family_user_id(current_user)}, {"_id": 0}).to_list(100)
    return items


@api.post("/members")
async def create_member(body: MemberIn, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.members.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/members/{member_id}")
async def delete_member(member_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    res = await db.members.delete_one({"id": member_id, "user_id": get_family_user_id(current_user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"ok": True}


# ── Internal helpers ───────────────────────────────────────────────────────────
async def _resolve_member(user: dict, member_hint: Optional[str], default_mid: Optional[str]) -> str:
    family_uid = get_family_user_id(user)
    if default_mid:
        m = await db.members.find_one({"id": default_mid, "user_id": family_uid})
        if m:
            return m["id"]
    if member_hint:
        m = await db.members.find_one({"user_id": family_uid,
                                       "name": {"$regex": f"^{member_hint}$", "$options": "i"}})
        if m:
            return m["id"]
    if user.get("role") == "member" and user.get("linked_member_id"):
        return user["linked_member_id"]
    m = await db.members.find_one({"user_id": family_uid})
    if not m:
        raise HTTPException(status_code=400, detail="No family member exists")
    return m["id"]


# ── Supplements ───────────────────────────────────────────────────────────────
@api.get("/health/supplements")
async def list_supplements(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.supplements.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("start_date", -1).to_list(500)


@api.post("/health/supplements")
async def create_supplement(body: SupplementIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.supplements.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/health/supplements/{sid}")
async def delete_supplement(sid: str, current_user: dict = Depends(get_current_user)):
    await db.supplements.delete_one({"id": sid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


@api.get("/health/active-medications")
async def active_medications(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    pres = await db.prescriptions.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date", -1).to_list(500)
    active: dict = {}
    for p in pres:
        for m in p.get("medications", []) or []:
            nm = (m.get("name") or "").strip()
            if not nm:
                continue
            if nm not in active or p["date"] > active[nm]["last_seen"]:
                active[nm] = {
                    "name": nm, "dose": m.get("dose"), "frequency": m.get("frequency"),
                    "duration": m.get("duration"), "doctor": p.get("doctor"),
                    "last_seen": p["date"], "first_seen": p["date"],
                    "prescription_id": p["id"], "member_id": p["member_id"],
                }
            else:
                active[nm]["first_seen"] = min(active[nm]["first_seen"], p["date"])
    return list(active.values())


# ── Universal Inbox ────────────────────────────────────────────────────────────
def _extract_pdf_text(data: bytes) -> str:
    import pdfplumber
    parts = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            if t:
                parts.append(t)
    return "\n".join(parts)


async def _apply_parsed(user: dict, parsed: dict, default_mid: Optional[str], doc_id: Optional[str] = None) -> dict:
    """Persist AI-parsed records to the correct collections."""
    if user.get("role") == "member" and not default_mid:
        default_mid = user.get("linked_member_id")

    family_uid = get_family_user_id(user)
    member_id = await _resolve_member(user, parsed.get("member_hint"), default_mid)

    counts = {k: 0 for k in ("transactions", "investments", "loans", "lab_results",
                              "prescriptions", "vitals", "trips", "career_events",
                              "goals", "supplements", "generic_entries")}

    def _base(extra: dict) -> dict:
        b = {"id": new_id(), "user_id": family_uid, "member_id": member_id,
             "created_at": now_iso(), **extra}
        if doc_id:
            b["origin_document_id"] = doc_id
        return b

    for t in parsed.get("transactions", []) or []:
        await db.transactions.insert_one(_base({
            "date": t.get("date") or today_str(), "amount": float(t.get("amount", 0)),
            "type": t.get("type", "expense"), "category": t.get("category", "other"),
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
            "name": loan.get("name", "Loan"), "outstanding": float(loan.get("outstanding", 0)),
            "emi": loan.get("emi"), "rate": loan.get("rate"),
        }))
        counts["loans"] += 1

    for lab in parsed.get("lab_results", []) or []:
        await db.lab_results.insert_one(_base({
            "date": lab.get("date") or today_str(), "test": lab.get("test", "Unknown"),
            "value": float(lab.get("value", 0)), "unit": lab.get("unit"),
            "reference_range": lab.get("reference_range"),
        }))
        counts["lab_results"] += 1

    for pres in parsed.get("prescriptions", []) or []:
        await db.prescriptions.insert_one(_base({
            "date": pres.get("date") or today_str(), "doctor": pres.get("doctor"),
            "medications": pres.get("medications", []), "notes": pres.get("notes"),
        }))
        counts["prescriptions"] += 1

    for v in parsed.get("vitals", []) or []:
        await db.vitals.insert_one(_base({
            "date": v.get("date") or today_str(), "kind": v.get("kind", "other"),
            "value": str(v.get("value", "")), "unit": v.get("unit"),
        }))
        counts["vitals"] += 1

    for tr in parsed.get("trips", []) or []:
        await db.trips.insert_one(_base({
            "name": tr.get("name", "Trip"), "destination": tr.get("destination", ""),
            "start_date": tr.get("start_date"), "end_date": tr.get("end_date"),
            "budget": tr.get("budget"), "notes": tr.get("notes"),
        }))
        counts["trips"] += 1

    for ev in parsed.get("career_events", []) or []:
        await db.career_events.insert_one(_base({
            "date": ev.get("date") or today_str(), "kind": ev.get("kind", "achievement"),
            "title": ev.get("title", ""), "company": ev.get("company"),
            "ctc": ev.get("ctc"), "notes": ev.get("notes"),
        }))
        counts["career_events"] += 1

    for goal in parsed.get("goals", []) or []:
        existing = await db.goals.find_one({"user_id": family_uid, "name": goal.get("name")})
        upd = {
            "target_amount": float(goal.get("target_amount") or 0),
            "current_amount": float(goal.get("current_amount") or (existing or {}).get("current_amount") or 0),
            "target_date": goal.get("target_date"),
            "category": goal.get("category", "general"),
            "origin_document_id": doc_id,
        }
        if existing:
            await db.goals.update_one({"id": existing["id"]}, {"$set": upd})
        else:
            await db.goals.insert_one(_base({"name": goal.get("name", "Goal"), **upd}))
        counts["goals"] += 1

    for sup in parsed.get("supplements", []) or []:
        existing = await db.supplements.find_one({"user_id": family_uid, "member_id": member_id, "name": sup.get("name")})
        upd = {
            "dose": sup.get("dose", ""), "frequency": sup.get("frequency", ""),
            "start_date": sup.get("start_date") or today_str(),
            "end_date": sup.get("end_date"), "notes": sup.get("notes"),
            "origin_document_id": doc_id,
        }
        if existing:
            await db.supplements.update_one({"id": existing["id"]}, {"$set": upd})
        else:
            await db.supplements.insert_one(_base({"name": sup.get("name", "Supplement"), **upd}))
        counts["supplements"] += 1

    for g in parsed.get("generic_entries", []) or []:
        await db.generic_entries.insert_one(_base({
            "category": g.get("category", "note"),
            "title": g.get("title", "Note"),
            "data": g.get("data", {}),
        }))
        counts["generic_entries"] += 1

    return counts


@api.post("/inbox/text")
async def inbox_text(body: InboxIn, current_user: dict = Depends(get_current_user)):
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    family_uid = get_family_user_id(current_user)
    members = await db.members.find({"user_id": family_uid}, {"_id": 0, "name": 1}).to_list(50)
    parsed = await parse_universal(body.text, today_str(), [m["name"] for m in members])
    counts = await _apply_parsed(current_user, parsed, body.member_id)
    await db.inbox_log.insert_one({
        "id": new_id(), "user_id": family_uid, "kind": "text",
        "input_preview": body.text[:500], "parsed": parsed, "counts": counts, "created_at": now_iso(),
    })
    return {"parsed": parsed, "counts": counts}


@api.post("/inbox/file")
async def inbox_file(
    file: UploadFile = File(...),
    member_id: Optional[str] = Form(None),
    dry_run: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Upload + parse a document. dry_run=true returns proposed records without saving them."""
    is_dry_run = dry_run in ("true", "1", "yes")
    data = await file.read()
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_type = file.content_type or guess_mime(filename)
    family_uid = get_family_user_id(current_user)

    try:
        storage_path = await upload_file(data, filename, content_type, family_uid)
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=500, detail="Storage upload failed")

    doc_id = new_id()
    await db.documents.insert_one({
        "id": doc_id, "user_id": family_uid, "member_id": member_id,
        "storage_path": storage_path, "original_filename": filename,
        "content_type": content_type, "size": len(data),
        "is_deleted": False, "created_at": now_iso(),
    })

    members = await db.members.find({"user_id": family_uid}, {"_id": 0, "name": 1}).to_list(50)
    member_names = [m["name"] for m in members]
    parsed: dict = {"summary": f"Uploaded {filename}", "module": "generic", "confidence": 0.0}
    is_image = content_type.startswith("image/") or ext in ("jpg", "jpeg", "png", "webp", "gif", "heic", "heif")
    counts: dict = {}

    try:
        if ext == "pdf":
            text = _extract_pdf_text(data)
            if text.strip():
                parsed = await parse_universal(text, today_str(), member_names)
        elif ext in ("txt", "csv", "json", "md"):
            text = data.decode("utf-8", errors="ignore")
            parsed = await parse_universal(text, today_str(), member_names)
        elif is_image:
            parsed = await parse_image_file(data, content_type, today_str(), member_names)
            parsed["_source"] = "vision"
    except Exception as e:
        logger.error(f"Parse error for {filename}: {e}")

    # In dry_run mode: store the document stub but do NOT create any records yet.
    # The client will show a confirm modal and call /inbox/apply.
    if is_dry_run:
        await db.documents.update_one({"id": doc_id}, {"$set": {
            "parsed_summary": parsed.get("summary"),
        }})
        return {"document_id": doc_id, "parsed": parsed, "proposed": True}

    if parsed.get("confidence", 0) > 0 or parsed.get("module") != "generic":
        counts = await _apply_parsed(current_user, parsed, member_id, doc_id=doc_id)

    await db.documents.update_one({"id": doc_id}, {"$set": {
        "parsed_summary": parsed.get("summary"), "counts": counts,
    }})
    await db.inbox_log.insert_one({
        "id": new_id(), "user_id": family_uid, "kind": "file",
        "input_preview": filename, "parsed": parsed, "counts": counts,
        "document_id": doc_id, "created_at": now_iso(),
    })
    return {"document_id": doc_id, "parsed": parsed, "counts": counts}


class ApplyInboxIn(BaseModel):
    parsed: dict
    doc_id: Optional[str] = None
    member_id: Optional[str] = None
    selected_types: Optional[List[str]] = None


@api.post("/inbox/apply")
async def inbox_apply(body: ApplyInboxIn, current_user: dict = Depends(get_current_user)):
    """Apply user-confirmed records from a dry-run parse. Writes to update_log."""
    ALL_RECORD_TYPES = [
        "transactions", "investments", "loans", "lab_results", "prescriptions",
        "vitals", "trips", "career_events", "goals", "supplements", "generic_entries",
    ]
    parsed = {**body.parsed}
    if body.selected_types is not None:
        for t in ALL_RECORD_TYPES:
            if t not in body.selected_types:
                parsed[t] = []

    counts = await _apply_parsed(current_user, parsed, body.member_id, doc_id=body.doc_id)
    family_uid = get_family_user_id(current_user)

    # Write to update_log
    await db.update_log.insert_one({
        "id": new_id(), "user_id": family_uid, "doc_id": body.doc_id,
        "applied_counts": counts, "parsed_summary": parsed.get("summary"),
        "selected_types": body.selected_types, "created_at": now_iso(),
    })

    # Finalise document record
    if body.doc_id:
        await db.documents.update_one({"id": body.doc_id}, {"$set": {
            "parsed_summary": parsed.get("summary"), "counts": counts,
        }})

    # Add to inbox_log so Overview shows the activity
    await db.inbox_log.insert_one({
        "id": new_id(), "user_id": family_uid, "kind": "file",
        "input_preview": parsed.get("summary", "")[:500],
        "parsed": parsed, "counts": counts,
        "document_id": body.doc_id, "created_at": now_iso(),
    })

    return {"counts": counts}


@api.get("/inbox/log")
async def inbox_log(current_user: dict = Depends(get_current_user), limit: int = 20):
    items = await db.inbox_log.find({"user_id": get_family_user_id(current_user)}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items


# ── Finance ────────────────────────────────────────────────────────────────────
async def _finance_summary_q(q: dict) -> dict:
    today = datetime.now(timezone.utc)
    month_start = today.replace(day=1).date().isoformat()
    txs = await db.transactions.find(q, {"_id": 0}).to_list(2000)
    income_m  = sum(t["amount"] for t in txs if t["type"] == "income"  and t["date"] >= month_start)
    expense_m = sum(t["amount"] for t in txs if t["type"] == "expense" and t["date"] >= month_start)
    investments = await db.investments.find(q, {"_id": 0}).to_list(500)
    invest_val  = sum((i.get("current_value") or 0) for i in investments)
    loans = await db.loans.find(q, {"_id": 0}).to_list(500)
    debt  = sum(ln.get("outstanding", 0) for ln in loans)
    cat_bd: dict = {}
    for t in txs:
        if t["type"] == "expense" and t["date"] >= month_start:
            cat_bd[t["category"]] = cat_bd.get(t["category"], 0) + t["amount"]
    return {
        "income_month": income_m, "expense_month": expense_m,
        "savings_month": income_m - expense_m,
        "net_worth": invest_val - debt, "invest_value": invest_val, "debt": debt,
        "category_breakdown": cat_bd,
    }


@api.get("/finance/transactions")
async def list_transactions(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    docs = await db.transactions.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date", -1).to_list(500)
    return decrypt_list("transactions", docs)


@api.post("/finance/transactions")
async def create_transaction(body: TransactionIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    store_doc = encrypt_doc("transactions", doc)
    await db.transactions.insert_one(store_doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.delete("/finance/transactions/{tx_id}")
async def delete_transaction(tx_id: str, current_user: dict = Depends(get_current_user)):
    await db.transactions.delete_one({"id": tx_id, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


@api.get("/finance/investments")
async def list_investments(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    docs = await db.investments.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(500)
    return decrypt_list("investments", docs)


@api.post("/finance/investments")
async def create_investment(body: InvestmentIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    store_doc = encrypt_doc("investments", doc)
    await db.investments.insert_one(store_doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.delete("/finance/investments/{inv_id}")
async def delete_investment(inv_id: str, current_user: dict = Depends(get_current_user)):
    await db.investments.delete_one({"id": inv_id, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


@api.get("/finance/loans")
async def list_loans(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.loans.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(500)


@api.post("/finance/loans")
async def create_loan(body: LoanIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.loans.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/finance/loans/{lid}")
async def delete_loan(lid: str, current_user: dict = Depends(get_current_user)):
    await db.loans.delete_one({"id": lid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


@api.get("/finance/summary")
async def finance_summary(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await _finance_summary_q(resolve_member_filter(current_user, member_id))


@api.get("/finance/monthly-trend")
async def monthly_trend(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    txs = await db.transactions.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(5000)
    months: dict = {}
    for t in txs:
        m = t["date"][:7]
        b = months.setdefault(m, {"month": m, "income": 0, "expense": 0})
        if t["type"] == "income":
            b["income"] += t["amount"]
        else:
            b["expense"] += t["amount"]
    return sorted(months.values(), key=lambda x: x["month"])[-12:]


# ── Goals ──────────────────────────────────────────────────────────────────────
@api.get("/goals")
async def list_goals(member_id: Optional[str] = None, domain: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    q = resolve_member_filter(current_user, member_id)
    if domain:
        q["domain"] = domain
    return await db.goals.find(q, {"_id": 0}).to_list(200)


@api.post("/goals")
async def create_goal(body: GoalIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.goals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/goals/{gid}")
async def update_goal(gid: str, body: dict, current_user: dict = Depends(get_current_user)):
    await db.goals.update_one({"id": gid, "user_id": get_family_user_id(current_user)}, {"$set": body})
    return await db.goals.find_one({"id": gid}, {"_id": 0})


@api.delete("/goals/{gid}")
async def delete_goal(gid: str, current_user: dict = Depends(get_current_user)):
    await db.goals.delete_one({"id": gid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


# ── FIRE ───────────────────────────────────────────────────────────────────────
async def _compute_fire(family_uid: str) -> Optional[dict]:
    cfg = await db.fire_config.find_one({"user_id": family_uid}, {"_id": 0})
    if not cfg:
        return None
    target  = cfg["target_corpus"]
    current = cfg.get("current_corpus") or 0
    monthly = cfg["monthly_savings"]
    r_m = ((cfg.get("expected_return_pct") or 11.0) / 100.0) / 12.0
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


@api.get("/fire")
async def get_fire(current_user: dict = Depends(get_current_user)):
    return await _compute_fire(get_family_user_id(current_user))


@api.post("/fire")
async def upsert_fire(body: FireConfigIn, current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    doc = {**body.model_dump(), "user_id": fuid, "updated_at": now_iso()}
    await db.fire_config.update_one({"user_id": fuid}, {"$set": doc}, upsert=True)
    return await _compute_fire(fuid)


# ── Health ─────────────────────────────────────────────────────────────────────
@api.get("/health/prescriptions")
async def list_prescriptions(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    docs = await db.prescriptions.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date", -1).to_list(500)
    return decrypt_list("prescriptions", docs)


@api.post("/health/prescriptions")
async def create_prescription(body: PrescriptionIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    store_doc = encrypt_doc("prescriptions", doc)
    await db.prescriptions.insert_one(store_doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.delete("/health/prescriptions/{pid}")
async def delete_prescription(pid: str, current_user: dict = Depends(get_current_user)):
    await db.prescriptions.delete_one({"id": pid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


@api.get("/health/labs")
async def list_labs(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.lab_results.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date", -1).to_list(2000)


@api.post("/health/labs")
async def create_lab(body: LabResultIn, current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    mid = body.member_id or current_user.get("linked_member_id")
    if not mid:
        m = await db.members.find_one({"user_id": fuid})
        mid = m["id"] if m else None
    if not mid:
        raise HTTPException(status_code=400, detail="member_id required")
    doc = {
        "id": new_id(), "user_id": fuid, "member_id": mid,
        "date": body.date, "test": body.test, "value": body.value,
        "unit": body.unit, "reference_range": body.reference_range,
        "created_at": now_iso(),
    }
    await db.lab_results.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/health/labs/{lid}")
async def delete_lab(lid: str, current_user: dict = Depends(get_current_user)):
    await db.lab_results.delete_one({"id": lid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


@api.get("/health/vitals")
async def list_vitals(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.vitals.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date", -1).to_list(2000)


@api.post("/health/vitals")
async def create_vital(body: VitalIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.vitals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/health/vitals/{vid}")
async def delete_vital(vid: str, current_user: dict = Depends(get_current_user)):
    await db.vitals.delete_one({"id": vid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


# ── Documents ──────────────────────────────────────────────────────────────────
@api.get("/documents")
async def list_documents(current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    return await db.documents.find({"user_id": fuid, "is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, authorization: str = Header(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="auth required")
    uid = decode_token(auth_header.replace("Bearer ", ""))
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    fuid = get_family_user_id(user)
    record = await db.documents.find_one({"id": doc_id, "user_id": fuid, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="Document not found")
    data, ct = await get_file_content(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type", ct))


@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    await db.documents.update_one({"id": doc_id, "user_id": get_family_user_id(current_user)}, {"$set": {"is_deleted": True}})
    return {"ok": True}


@api.get("/documents/{doc_id}/records")
async def document_records(doc_id: str, current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    out: dict = {}
    for name, coll in [
        ("transactions", db.transactions), ("investments", db.investments),
        ("loans", db.loans), ("lab_results", db.lab_results),
        ("prescriptions", db.prescriptions), ("vitals", db.vitals),
        ("trips", db.trips), ("career_events", db.career_events),
    ]:
        items = await coll.find({"user_id": fuid, "origin_document_id": doc_id}, {"_id": 0}).to_list(200)
        if items:
            out[name] = items
    return out


# ── Generic entries ────────────────────────────────────────────────────────────
@api.get("/generic")
async def list_generic(category: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    q: dict = {"user_id": fuid}
    if category:
        q["category"] = category
    return await db.generic_entries.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/generic/categories")
async def generic_categories(current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    pipeline = [
        {"$match": {"user_id": fuid}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "category": "$_id", "count": 1}},
    ]
    return [c async for c in db.generic_entries.aggregate(pipeline)]


# ── Dashboard ──────────────────────────────────────────────────────────────────
@api.get("/dashboard/overview")
async def dashboard_overview(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    q = resolve_member_filter(current_user, member_id)
    summary = await _finance_summary_q(q)
    members = await db.members.find({"user_id": fuid}, {"_id": 0}).to_list(100)
    fire    = await _compute_fire(fuid)
    goals   = await db.goals.find(q, {"_id": 0}).to_list(50)
    recent_inbox = await db.inbox_log.find({"user_id": fuid}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_labs  = await db.lab_results.find(q, {"_id": 0}).sort("date", -1).to_list(5)
    recent_meds  = await db.prescriptions.find(q, {"_id": 0}).sort("date", -1).to_list(3)
    return {
        "summary": summary, "members": members, "fire": fire, "goals": goals,
        "recent_inbox": recent_inbox, "recent_labs": recent_labs, "recent_meds": recent_meds,
    }


# ── Inline PATCH ───────────────────────────────────────────────────────────────
PATCH_COLLECTIONS = {
    "transactions": db.transactions, "investments": db.investments, "loans": db.loans,
    "labs": db.lab_results, "vitals": db.vitals, "prescriptions": db.prescriptions,
    "trips": db.trips, "career-events": db.career_events,
    "career-roles": db.career_roles, "career-skills": db.career_skills,
}


@api.patch("/{kind}/{rid}")
async def patch_record(kind: str, rid: str, body: dict, current_user: dict = Depends(get_current_user)):
    coll = PATCH_COLLECTIONS.get(kind)
    if coll is None:
        raise HTTPException(status_code=404, detail="Unknown kind")
    fuid = get_family_user_id(current_user)
    body.pop("id", None); body.pop("user_id", None); body.pop("_id", None)
    for k in ("amount", "outstanding", "emi", "rate", "units", "current_value", "invested_value", "value", "budget", "ctc"):
        if k in body and body[k] not in (None, ""):
            try:
                body[k] = float(body[k])
            except Exception:
                pass
    await coll.update_one({"id": rid, "user_id": fuid}, {"$set": body})
    item = await coll.find_one({"id": rid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


# ── Travel ─────────────────────────────────────────────────────────────────────
@api.get("/travel/trips")
async def list_trips(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.trips.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("start_date", -1).to_list(500)


@api.post("/travel/trips")
async def create_trip(body: TripIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.trips.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/travel/trips/{tid}")
async def delete_trip(tid: str, current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    await db.trips.delete_one({"id": tid, "user_id": fuid})
    await db.transactions.update_many({"trip_id": tid, "user_id": fuid}, {"$unset": {"trip_id": ""}})
    return {"ok": True}


@api.get("/travel/trips/{tid}/summary")
async def trip_summary(tid: str, current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    trip = await db.trips.find_one({"id": tid, "user_id": fuid}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    txs = await db.transactions.find({"trip_id": tid, "user_id": fuid}, {"_id": 0}).to_list(1000)
    spend = sum(t["amount"] for t in txs if t["type"] == "expense")
    by_cat: dict = {}
    for t in txs:
        if t["type"] == "expense":
            by_cat[t["category"]] = by_cat.get(t["category"], 0) + t["amount"]
    return {
        "trip": trip, "spend": spend, "transactions": txs, "by_category": by_cat,
        "budget_used_pct": round(spend / trip["budget"] * 100, 1) if trip.get("budget") else None,
    }


# ── Career ─────────────────────────────────────────────────────────────────────
@api.get("/career/roles")
async def list_roles(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.career_roles.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("start_date", -1).to_list(200)


@api.post("/career/roles")
async def create_role(body: CareerRoleIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.career_roles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/career/roles/{rid}")
async def delete_role(rid: str, current_user: dict = Depends(get_current_user)):
    await db.career_roles.delete_one({"id": rid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


@api.get("/career/events")
async def list_events(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.career_events.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date", -1).to_list(500)


@api.post("/career/events")
async def create_event(body: CareerEventIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.career_events.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/career/events/{eid}")
async def delete_event(eid: str, current_user: dict = Depends(get_current_user)):
    await db.career_events.delete_one({"id": eid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


@api.get("/career/skills")
async def list_skills(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.career_skills.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(500)


@api.post("/career/skills")
async def create_skill(body: CareerSkillIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.career_skills.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/career/skills/{sid}")
async def delete_skill(sid: str, current_user: dict = Depends(get_current_user)):
    await db.career_skills.delete_one({"id": sid, "user_id": get_family_user_id(current_user)})
    return {"ok": True}


# ── CSV Export ─────────────────────────────────────────────────────────────────
def _to_csv(rows: list) -> str:
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
    "trips": db.trips, "career_events": db.career_events, "career_roles": db.career_roles,
    "career_skills": db.career_skills, "goals": db.goals,
}


@api.get("/export/{kind}.csv")
async def export_csv(kind: str, authorization: str = Header(None), auth: str = Query(None)):
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    if not auth_header:
        raise HTTPException(status_code=401, detail="auth required")
    uid = decode_token(auth_header.replace("Bearer ", ""))
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    coll = CSV_KINDS.get(kind)
    if coll is None:
        raise HTTPException(status_code=404, detail="Unknown export kind")
    rows = await coll.find({"user_id": get_family_user_id(user)}, {"_id": 0}).to_list(20000)
    return Response(
        content=_to_csv(rows), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{kind}.csv"'},
    )


# ── Net-worth snapshot + XIRR ──────────────────────────────────────────────────
@api.post("/finance/snapshot")
async def take_snapshot(current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    summary = await _finance_summary_q({"user_id": fuid})
    snap = {
        "id": new_id(), "user_id": fuid, "date": today_str(),
        "net_worth": summary["net_worth"], "invest_value": summary["invest_value"],
        "debt": summary["debt"], "created_at": now_iso(),
    }
    await db.net_worth_snapshots.replace_one({"user_id": fuid, "date": snap["date"]}, snap, upsert=True)
    return snap


@api.get("/finance/net-worth-series")
async def net_worth_series(current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    return await db.net_worth_snapshots.find({"user_id": fuid}, {"_id": 0}).sort("date", 1).to_list(1000)


@api.get("/finance/investments/xirr")
async def investments_xirr(current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    inv = await db.investments.find({"user_id": fuid}, {"_id": 0}).to_list(500)
    out = []
    total_inv = total_cur = 0.0
    today = date.today()
    for i in inv:
        cur  = i.get("current_value") or 0
        invv = i.get("invested_value") or 0
        gain = cur - invv
        absolute_pct = (gain / invv * 100) if invv > 0 else None
        # Compute CAGR when purchase_date is available
        cagr = None
        purchase_date_str = i.get("purchase_date")
        if invv > 0 and cur > 0 and purchase_date_str:
            try:
                pd_date = date.fromisoformat(purchase_date_str)
                years = (today - pd_date).days / 365.25
                if years >= 0.083:  # at least 1 month
                    cagr = ((cur / invv) ** (1 / years) - 1) * 100
            except Exception:
                pass
        out.append({"id": i["id"], "name": i["name"], "kind": i["kind"],
                    "invested": invv, "current": cur, "gain": gain,
                    "return_pct": absolute_pct, "cagr": cagr,
                    "purchase_date": purchase_date_str})
        total_inv += invv
        total_cur += cur
    overall = (total_cur - total_inv) / total_inv * 100 if total_inv > 0 else None
    return {"items": out, "total_invested": total_inv, "total_current": total_cur,
            "total_gain": total_cur - total_inv, "overall_pct": overall}


# ── RSU Grants ────────────────────────────────────────────────────────────────
class RsuGrantIn(BaseModel):
    member_id: str
    company: str
    grant_date: str
    total_units: float
    cliff_months: int = 12
    vest_period_months: int = 48
    current_price: Optional[float] = None
    vested_units: Optional[float] = 0.0
    unvested_units: Optional[float] = None
    notes: Optional[str] = None

@api.get("/finance/rsu")
async def list_rsu(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    rows = await db.rsu_grants.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(200)
    for r in rows:
        unvested = r.get("unvested_units") or (r.get("total_units", 0) - (r.get("vested_units") or 0))
        r["projected_value"] = round(unvested * (r.get("current_price") or 0), 2)
    return rows

@api.post("/finance/rsu")
async def create_rsu(body: RsuGrantIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.rsu_grants.insert_one(d); d.pop("_id", None); return d

@api.put("/finance/rsu/{rid}")
async def update_rsu(rid: str, body: RsuGrantIn, current_user: dict = Depends(get_current_user)):
    await db.rsu_grants.update_one({"id": rid, "user_id": get_family_user_id(current_user)}, {"$set": body.model_dump()})
    return await db.rsu_grants.find_one({"id": rid}, {"_id": 0})

@api.delete("/finance/rsu/{rid}")
async def delete_rsu(rid: str, current_user: dict = Depends(get_current_user)):
    await db.rsu_grants.delete_one({"id": rid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── SIP Tracker ───────────────────────────────────────────────────────────────
class SipEntryIn(BaseModel):
    member_id: str
    fund_name: str
    folio_number: Optional[str] = None
    monthly_amount: float
    start_date: str
    status: str = "active"
    total_invested: Optional[float] = None
    current_value: Optional[float] = None
    xirr: Optional[float] = None
    last_nav_date: Optional[str] = None

@api.get("/finance/sip")
async def list_sip(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.sip_entries.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(200)

@api.post("/finance/sip")
async def create_sip(body: SipEntryIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.sip_entries.insert_one(d); d.pop("_id", None); return d

@api.put("/finance/sip/{sid}")
async def update_sip(sid: str, body: SipEntryIn, current_user: dict = Depends(get_current_user)):
    await db.sip_entries.update_one({"id": sid, "user_id": get_family_user_id(current_user)}, {"$set": body.model_dump()})
    return await db.sip_entries.find_one({"id": sid}, {"_id": 0})

@api.delete("/finance/sip/{sid}")
async def delete_sip(sid: str, current_user: dict = Depends(get_current_user)):
    await db.sip_entries.delete_one({"id": sid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Tax Records ───────────────────────────────────────────────────────────────
class TaxRecordIn(BaseModel):
    member_id: str
    financial_year: str
    income_salary: Optional[float] = None
    income_other: Optional[float] = None
    tds_deducted: Optional[float] = None
    advance_tax_paid: Optional[float] = None
    stcg: Optional[float] = None
    ltcg: Optional[float] = None
    estimated_liability: Optional[float] = None
    itr_status: str = "not_filed"
    itr_filing_date: Optional[str] = None
    notes: Optional[str] = None

@api.get("/finance/tax")
async def list_tax(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.tax_records.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("financial_year", -1).to_list(50)

@api.get("/finance/tax/current-year")
async def current_year_tax(current_user: dict = Depends(get_current_user)):
    today = date.today()
    fy = f"{today.year}-{str(today.year+1)[2:]}" if today.month >= 4 else f"{today.year-1}-{str(today.year)[2:]}"
    fuid = get_family_user_id(current_user)
    return await db.tax_records.find_one({"user_id": fuid, "financial_year": fy}, {"_id": 0})

@api.post("/finance/tax")
async def create_tax(body: TaxRecordIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.tax_records.insert_one(d); d.pop("_id", None); return d

@api.put("/finance/tax/{tid}")
async def update_tax(tid: str, body: TaxRecordIn, current_user: dict = Depends(get_current_user)):
    await db.tax_records.update_one({"id": tid, "user_id": get_family_user_id(current_user)}, {"$set": body.model_dump()})
    return await db.tax_records.find_one({"id": tid}, {"_id": 0})

@api.delete("/finance/tax/{tid}")
async def delete_tax(tid: str, current_user: dict = Depends(get_current_user)):
    await db.tax_records.delete_one({"id": tid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Insurance Policies ────────────────────────────────────────────────────────
class InsurancePolicyIn(BaseModel):
    member_id: str
    policy_type: str
    insurer: str
    policy_number: Optional[str] = None
    sum_assured: Optional[float] = None
    annual_premium: Optional[float] = None
    premium_due_date: Optional[str] = None
    policy_start: Optional[str] = None
    policy_end: Optional[str] = None
    nominee: Optional[str] = None
    document_drive_id: Optional[str] = None
    notes: Optional[str] = None

@api.get("/finance/insurance")
async def list_insurance(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.insurance_policies.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(200)

@api.post("/finance/insurance")
async def create_insurance(body: InsurancePolicyIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.insurance_policies.insert_one(d); d.pop("_id", None); return d

@api.put("/finance/insurance/{iid}")
async def update_insurance(iid: str, body: InsurancePolicyIn, current_user: dict = Depends(get_current_user)):
    await db.insurance_policies.update_one({"id": iid, "user_id": get_family_user_id(current_user)}, {"$set": body.model_dump()})
    return await db.insurance_policies.find_one({"id": iid}, {"_id": 0})

@api.delete("/finance/insurance/{iid}")
async def delete_insurance(iid: str, current_user: dict = Depends(get_current_user)):
    await db.insurance_policies.delete_one({"id": iid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Subscriptions ─────────────────────────────────────────────────────────────
class SubscriptionIn(BaseModel):
    member_id: str
    name: str
    category: str = "other"
    amount: float
    billing_cycle: str = "monthly"
    next_billing_date: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None

@api.get("/finance/subscriptions")
async def list_subscriptions(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.subscriptions.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(200)

@api.post("/finance/subscriptions")
async def create_subscription(body: SubscriptionIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.subscriptions.insert_one(d); d.pop("_id", None); return d

@api.put("/finance/subscriptions/{sid}")
async def update_subscription(sid: str, body: SubscriptionIn, current_user: dict = Depends(get_current_user)):
    await db.subscriptions.update_one({"id": sid, "user_id": get_family_user_id(current_user)}, {"$set": body.model_dump()})
    return await db.subscriptions.find_one({"id": sid}, {"_id": 0})

@api.delete("/finance/subscriptions/{sid}")
async def delete_subscription(sid: str, current_user: dict = Depends(get_current_user)):
    await db.subscriptions.delete_one({"id": sid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Budget ────────────────────────────────────────────────────────────────────
class BudgetIn(BaseModel):
    member_id: str
    month: str  # YYYY-MM
    category: str
    budgeted_amount: float

@api.get("/finance/budget")
async def list_budgets(month: Optional[str] = None, member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    q = resolve_member_filter(current_user, member_id)
    if month:
        q["month"] = month
    budgets = await db.budgets.find(q, {"_id": 0}).to_list(500)
    # Compute actual_amount from transactions for each budget row
    for b in budgets:
        tx_q = {"user_id": b["user_id"], "member_id": b["member_id"],
                "category": b["category"], "type": "expense"}
        txs = await db.transactions.find(tx_q, {"_id": 0, "amount": 1, "date": 1}).to_list(1000)
        b["actual_amount"] = sum(t["amount"] for t in txs if t.get("date", "")[:7] == b["month"])
    return budgets

@api.post("/finance/budget")
async def create_budget(body: BudgetIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.budgets.insert_one(d); d.pop("_id", None); return d

@api.put("/finance/budget/{bid}")
async def update_budget(bid: str, body: BudgetIn, current_user: dict = Depends(get_current_user)):
    await db.budgets.update_one({"id": bid, "user_id": get_family_user_id(current_user)}, {"$set": body.model_dump()})
    return await db.budgets.find_one({"id": bid}, {"_id": 0})

@api.delete("/finance/budget/{bid}")
async def delete_budget(bid: str, current_user: dict = Depends(get_current_user)):
    await db.budgets.delete_one({"id": bid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Appointments ──────────────────────────────────────────────────────────────
class AppointmentIn(BaseModel):
    member_id: str
    doctor_name: str
    speciality: Optional[str] = None
    appointment_date: str
    reason: Optional[str] = None
    notes: Optional[str] = None
    follow_up_date: Optional[str] = None
    linked_lab_result_ids: Optional[List[str]] = []

@api.get("/health/appointments")
async def list_appointments(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    docs = await db.appointments.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("appointment_date", 1).to_list(500)
    return decrypt_list("appointments", docs)

@api.post("/health/appointments")
async def create_appointment(body: AppointmentIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    store_doc = encrypt_doc("appointments", doc)
    await db.appointments.insert_one(store_doc); return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/health/appointments/{aid}")
async def update_appointment(aid: str, body: AppointmentIn, current_user: dict = Depends(get_current_user)):
    store = encrypt_doc("appointments", body.model_dump())
    await db.appointments.update_one({"id": aid, "user_id": get_family_user_id(current_user)}, {"$set": store})
    doc = await db.appointments.find_one({"id": aid}, {"_id": 0})
    return decrypt_doc("appointments", doc) if doc else {}

@api.delete("/health/appointments/{aid}")
async def delete_appointment(aid: str, current_user: dict = Depends(get_current_user)):
    await db.appointments.delete_one({"id": aid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Fitness Logs ──────────────────────────────────────────────────────────────
class FitnessLogIn(BaseModel):
    member_id: str
    date: str
    weight_kg: Optional[float] = None
    steps: Optional[int] = None
    workout_type: Optional[str] = None
    duration_mins: Optional[int] = None
    notes: Optional[str] = None

@api.get("/health/fitness")
async def list_fitness(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.fitness_logs.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date", -1).to_list(500)

@api.post("/health/fitness")
async def create_fitness(body: FitnessLogIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.fitness_logs.insert_one(d); d.pop("_id", None); return d

@api.delete("/health/fitness/{fid}")
async def delete_fitness(fid: str, current_user: dict = Depends(get_current_user)):
    await db.fitness_logs.delete_one({"id": fid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Vaccinations ──────────────────────────────────────────────────────────────
class VaccinationIn(BaseModel):
    member_id: str
    vaccine_name: str
    date_administered: str
    dose_number: Optional[int] = 1
    next_due_date: Optional[str] = None
    administered_by: Optional[str] = None
    notes: Optional[str] = None

@api.get("/health/vaccinations")
async def list_vaccinations(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.vaccinations.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date_administered", -1).to_list(500)

@api.post("/health/vaccinations")
async def create_vaccination(body: VaccinationIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.vaccinations.insert_one(d); d.pop("_id", None); return d

@api.delete("/health/vaccinations/{vid}")
async def delete_vaccination(vid: str, current_user: dict = Depends(get_current_user)):
    await db.vaccinations.delete_one({"id": vid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Identity Documents ────────────────────────────────────────────────────────
class IdentityDocIn(BaseModel):
    member_id: str
    doc_type: str  # aadhaar/pan/passport/driving_license/visa/other
    doc_number: Optional[str] = None
    issued_date: Optional[str] = None
    expiry_date: Optional[str] = None
    issued_by: Optional[str] = None
    drive_file_id: Optional[str] = None

@api.get("/identity")
async def list_identity(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    docs = await db.identity_documents.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(200)
    return decrypt_list("identity_documents", docs)

@api.post("/identity")
async def create_identity(body: IdentityDocIn, current_user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    store = encrypt_doc("identity_documents", doc)
    await db.identity_documents.insert_one(store); return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/identity/{did}")
async def update_identity(did: str, body: IdentityDocIn, current_user: dict = Depends(get_current_user)):
    store = encrypt_doc("identity_documents", body.model_dump())
    await db.identity_documents.update_one({"id": did, "user_id": get_family_user_id(current_user)}, {"$set": store})
    doc = await db.identity_documents.find_one({"id": did}, {"_id": 0})
    return decrypt_doc("identity_documents", doc) if doc else {}

@api.delete("/identity/{did}")
async def delete_identity(did: str, current_user: dict = Depends(get_current_user)):
    await db.identity_documents.delete_one({"id": did, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Properties & Assets ───────────────────────────────────────────────────────
class PropertyIn(BaseModel):
    member_id: str
    property_type: str  # residential/commercial/land/vehicle
    name: str
    address: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    current_estimated_value: Optional[float] = None
    rental_income_monthly: Optional[float] = None
    loan_linked_id: Optional[str] = None
    notes: Optional[str] = None

@api.get("/property")
async def list_property(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return await db.properties.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(200)

@api.post("/property")
async def create_property(body: PropertyIn, current_user: dict = Depends(get_current_user)):
    d = {"id": new_id(), "user_id": get_family_user_id(current_user), **body.model_dump(), "created_at": now_iso()}
    await db.properties.insert_one(d); d.pop("_id", None); return d

@api.put("/property/{pid}")
async def update_property(pid: str, body: PropertyIn, current_user: dict = Depends(get_current_user)):
    await db.properties.update_one({"id": pid, "user_id": get_family_user_id(current_user)}, {"$set": body.model_dump()})
    return await db.properties.find_one({"id": pid}, {"_id": 0})

@api.delete("/property/{pid}")
async def delete_property(pid: str, current_user: dict = Depends(get_current_user)):
    await db.properties.delete_one({"id": pid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Emergency Fund ────────────────────────────────────────────────────────────
class EmergencyFundIn(BaseModel):
    member_id: str
    target_months: int = 6
    monthly_expense_estimate: float
    current_amount: float
    account_name: Optional[str] = None

@api.get("/property/emergency-fund")
async def list_emergency_fund(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    rows = await db.emergency_fund.find(resolve_member_filter(current_user, member_id), {"_id": 0}).to_list(20)
    for r in rows:
        exp = r.get("monthly_expense_estimate") or 1
        r["target_amount"]    = r["target_months"] * exp
        r["coverage_months"]  = round(r.get("current_amount", 0) / exp, 1)
    return rows

@api.post("/property/emergency-fund")
async def create_emergency_fund(body: EmergencyFundIn, current_user: dict = Depends(get_current_user)):
    fuid = get_family_user_id(current_user)
    d = {"id": new_id(), "user_id": fuid, **body.model_dump(), "last_updated": today_str(), "created_at": now_iso()}
    await db.emergency_fund.insert_one(d); d.pop("_id", None)
    exp = body.monthly_expense_estimate or 1
    d["target_amount"]   = body.target_months * exp
    d["coverage_months"] = round(body.current_amount / exp, 1)
    return d

@api.put("/property/emergency-fund/{eid}")
async def update_emergency_fund(eid: str, body: EmergencyFundIn, current_user: dict = Depends(get_current_user)):
    upd = {**body.model_dump(), "last_updated": today_str()}
    await db.emergency_fund.update_one({"id": eid, "user_id": get_family_user_id(current_user)}, {"$set": upd})
    return await db.emergency_fund.find_one({"id": eid}, {"_id": 0})

@api.delete("/property/emergency-fund/{eid}")
async def delete_emergency_fund(eid: str, current_user: dict = Depends(get_current_user)):
    await db.emergency_fund.delete_one({"id": eid, "user_id": get_family_user_id(current_user)}); return {"ok": True}


# ── Labs Parameters ───────────────────────────────────────────────────────────
@api.get("/health/labs/parameters")
async def labs_parameters(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Return distinct lab test parameters with latest value, unit, reference range, and flagged status."""
    labs = await db.lab_results.find(resolve_member_filter(current_user, member_id), {"_id": 0}).sort("date", -1).to_list(5000)
    by_test: dict = {}
    for lab in labs:
        test = (lab.get("test") or "").strip()
        if test:
            by_test.setdefault(test, []).append(lab)
    result = []
    for test, entries in sorted(by_test.items()):
        entries.sort(key=lambda x: x.get("date", ""), reverse=True)
        latest = entries[0]
        flagged = False
        ref_range = latest.get("reference_range") or ""
        try:
            val = float(str(latest.get("value", "")).replace(",", ""))
            for sep in ("–", "-"):
                if sep in ref_range:
                    parts = ref_range.split(sep)
                    lo, hi = float(parts[0].strip()), float(parts[1].strip())
                    flagged = val < lo or val > hi
                    break
        except Exception:
            pass
        result.append({"test": test, "latest_value": latest.get("value"), "unit": latest.get("unit"),
                        "reference_range": ref_range, "latest_date": latest.get("date"),
                        "data_points": len(entries), "flagged": flagged, "member_id": latest.get("member_id")})
    return result


# ── Alerts ────────────────────────────────────────────────────────────────────
@api.get("/alerts")
async def get_alerts(current_user: dict = Depends(get_current_user)):
    from datetime import timedelta
    fuid = get_family_user_id(current_user)
    today_d = date.today()
    today_iso = today_d.isoformat()
    is_admin = current_user.get("role") == "admin"
    alerts: list = []

    members_list = await db.members.find({"user_id": fuid}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
    member_map = {m["id"]: m["name"] for m in members_list}
    check_mids = [m["id"] for m in members_list] if is_admin else ([current_user.get("linked_member_id")] if current_user.get("linked_member_id") else [])

    LAB_THRESHOLDS = [
        ("hba1c",                (">", 6.5,       "above normal")),
        ("vitamin d",            ("<", 20,         "deficient")),
        ("cholesterol",          (">", 200,        "high")),
        ("creatinine",           (">", 1.2,        "high")),
        ("fasting blood sugar",  (">", 100,        "high")),
        ("fbs",                  (">", 100,        "high")),
        ("tsh",                  ("range", (0.4, 4.5), "abnormal")),
    ]

    # ── Health alerts per member ──
    for mid in check_mids:
        mname = member_map.get(mid, "Family member")

        # Lab results out of range
        labs = await db.lab_results.find({"user_id": fuid, "member_id": mid}, {"_id": 0}).sort("date", -1).to_list(1000)
        seen: dict = {}
        for lab in labs:
            t = (lab.get("test") or "").strip()
            if t and t not in seen:
                seen[t] = lab
        for test, lab in seen.items():
            try:
                val = float(str(lab.get("value", "")).replace(",", ""))
            except Exception:
                continue
            ref_range = lab.get("reference_range") or ""
            flagged = False; flag_label = ""
            for sep in ("–", "-"):
                if sep in ref_range:
                    try:
                        lo, hi = (float(x.strip()) for x in ref_range.split(sep, 1))
                        if val < lo: flagged = True; flag_label = "below normal"
                        elif val > hi: flagged = True; flag_label = "above normal"
                    except Exception:
                        pass
                    break
            if not flagged:
                tl = test.lower()
                for key, (op, thr, label) in LAB_THRESHOLDS:
                    if key in tl:
                        if op == ">" and val > thr: flagged = True; flag_label = label
                        elif op == "<" and val < thr: flagged = True; flag_label = label
                        elif op == "range" and (val < thr[0] or val > thr[1]): flagged = True; flag_label = label
                        break
            if flagged:
                alerts.append({"type": "lab_out_of_range", "category": "health", "link": "/health",
                    "severity": "error", "date": lab.get("date", today_iso),
                    "title": f"{mname}'s {test} is {val} {lab.get('unit','') or ''} ({flag_label})",
                    "member_name": mname, "member_id": mid})

        # BP from vitals
        bp_v = await db.vitals.find({"user_id": fuid, "member_id": mid, "kind": "bp"}, {"_id": 0}).sort("date", -1).limit(1).to_list(1)
        for v in bp_v:
            val_str = str(v.get("value", ""))
            try:
                sys_v, dia_v = (float(x) for x in val_str.split("/"))
                if sys_v > 140 or dia_v > 90:
                    alerts.append({"type": "bp_high", "category": "health", "link": "/health",
                        "severity": "error" if sys_v > 160 else "warning", "date": v.get("date", today_iso),
                        "title": f"{mname}'s BP is {val_str} mmHg (high)", "member_name": mname, "member_id": mid})
            except Exception:
                pass

        # Appointments within 7 days
        c7 = (today_d + timedelta(days=7)).isoformat()
        appts_raw = await db.appointments.find({"user_id": fuid, "member_id": mid,
            "appointment_date": {"$gte": today_iso, "$lte": c7}}, {"_id": 0}).to_list(10)
        for a in decrypt_list("appointments", appts_raw):
            days_away = (date.fromisoformat(a["appointment_date"]) - today_d).days
            alerts.append({"type": "appointment", "category": "health", "link": "/health",
                "severity": "warning", "date": a["appointment_date"],
                "title": f"{mname} has an appointment with {a.get('doctor_name') or 'doctor'} in {days_away} day{'s' if days_away != 1 else ''}",
                "member_name": mname, "member_id": mid})

        # Vaccinations due
        c30 = (today_d + timedelta(days=30)).isoformat()
        for v in await db.vaccinations.find({"user_id": fuid, "member_id": mid, "next_due_date": {"$gte": today_iso, "$lte": c30}}, {"_id": 0}).to_list(10):
            alerts.append({"type": "vaccination_due", "category": "health", "link": "/health",
                "severity": "info", "date": v["next_due_date"],
                "title": f"{mname}'s {v.get('vaccine_name','')} vaccination is due",
                "member_name": mname, "member_id": mid})

        # SIP paused
        for s in await db.sip_entries.find({"user_id": fuid, "member_id": mid, "status": "paused"}, {"_id": 0}).to_list(20):
            alerts.append({"type": "sip_paused", "category": "finance", "link": "/finance",
                "severity": "warning", "date": today_iso,
                "title": f"{mname}'s {s.get('fund_name','')} SIP is paused",
                "member_name": mname, "member_id": mid})

        # RSU vesting soon (30 days)
        c30 = (today_d + timedelta(days=30)).isoformat()
        for r in await db.rsu_grants.find({"user_id": fuid, "member_id": mid}, {"_id": 0}).to_list(50):
            for ms in r.get("vest_schedule", []):
                vd = ms.get("date", "")
                if today_iso <= vd <= c30:
                    alerts.append({"type": "rsu_vesting", "category": "finance", "link": "/finance",
                        "severity": "info", "date": vd,
                        "title": f"{ms.get('units',0)} {r.get('company','')} RSU units vest on {vd} ({mname})",
                        "member_name": mname, "member_id": mid})

        # Goal off-track / overdue
        for g in await db.goals.find({"user_id": fuid, "member_id": mid, "target_date": {"$ne": None}}, {"_id": 0}).to_list(50):
            if not g.get("target_date"): continue
            try:
                td_d = date.fromisoformat(g["target_date"])
                ta = g.get("target_amount") or 1
                ca = g.get("current_amount") or 0
                actual_pct = ca / ta * 100
                if td_d < today_d and actual_pct < 100:
                    alerts.append({"type": "goal_overdue", "category": "finance", "link": "/goals",
                        "severity": "error", "date": g["target_date"],
                        "title": f"Goal overdue: '{g['name']}' is {round(100-actual_pct)}% behind ({mname})",
                        "member_name": mname, "member_id": mid})
                elif td_d >= today_d:
                    start_d = date.fromisoformat((g.get("created_at") or today_iso)[:10])
                    total_days = max(1, (td_d - start_d).days)
                    expected_pct = min(100, (today_d - start_d).days / total_days * 100)
                    if expected_pct - actual_pct > 20:
                        alerts.append({"type": "goal_off_track", "category": "finance", "link": "/goals",
                            "severity": "warning", "date": g["target_date"],
                            "title": f"Goal off-track: '{g['name']}' is {round(expected_pct - actual_pct)}% behind schedule ({mname})",
                            "member_name": mname, "member_id": mid})
            except Exception:
                pass

    # ── Finance alerts (family-wide) ──
    c7 = (today_d + timedelta(days=7)).isoformat()
    for s in await db.subscriptions.find({"user_id": fuid, "next_billing_date": {"$gte": today_iso, "$lte": c7}, "status": "active"}, {"_id": 0}).to_list(50):
        da = (date.fromisoformat(s["next_billing_date"]) - today_d).days
        mid = s.get("member_id", ""); mname = member_map.get(mid, "")
        prefix = f"{mname}'s " if mname else ""
        alerts.append({"type": "subscription_renewal", "category": "finance", "link": "/finance",
            "severity": "info", "date": s["next_billing_date"],
            "title": f"{prefix}{s.get('name','')} ₹{s.get('amount',0):,.0f} renews in {da} day{'s' if da != 1 else ''}",
            "member_name": mname, "member_id": mid})

    c60 = (today_d + timedelta(days=60)).isoformat()
    for i in await db.insurance_policies.find({"user_id": fuid, "policy_end": {"$gte": today_iso, "$lte": c60}}, {"_id": 0}).to_list(50):
        dl = (date.fromisoformat(i["policy_end"]) - today_d).days
        mid = i.get("member_id", ""); mname = member_map.get(mid, "")
        prefix = f"{mname}'s " if mname else ""
        alerts.append({"type": "insurance_expiry", "category": "finance", "link": "/finance",
            "severity": "error" if dl < 15 else "warning", "date": i["policy_end"],
            "title": f"{prefix}{i.get('insurer','')} {i.get('policy_type','')} policy expires in {dl} days",
            "member_name": mname, "member_id": mid})

    c90 = (today_d + timedelta(days=90)).isoformat()
    id_docs_raw = await db.identity_documents.find({"user_id": fuid, "expiry_date": {"$gte": today_iso, "$lte": c90}}, {"_id": 0}).to_list(50)
    for d_doc in decrypt_list("identity_documents", id_docs_raw):
        dl = (date.fromisoformat(d_doc["expiry_date"]) - today_d).days
        mid = d_doc.get("member_id", ""); mname = member_map.get(mid, "")
        prefix = f"{mname}'s " if mname else ""
        doc_type = d_doc.get('doc_type', '').replace('_', ' ').title()
        alerts.append({"type": "doc_expiry", "category": "finance", "link": "/health",
            "severity": "error" if dl < 30 else "warning", "date": d_doc["expiry_date"],
            "title": f"{prefix}{doc_type} expires in {dl} days",
            "member_name": mname, "member_id": mid})

    alerts.sort(key=lambda x: ({"error": 0, "warning": 1, "info": 2}.get(x.get("severity"), 3), x.get("date", "")))
    return alerts


# ── Extended Finance Summary ───────────────────────────────────────────────────
@api.get("/finance/summary/extended")
async def finance_summary_extended(member_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    q = resolve_member_filter(current_user, member_id)
    base = await _finance_summary_q(q)
    sips = await db.sip_entries.find(q, {"_id": 0}).to_list(200)
    sip_total_invested = sum(s.get("total_invested") or 0 for s in sips)
    sip_current_value  = sum(s.get("current_value") or 0 for s in sips)
    rsus = await db.rsu_grants.find(q, {"_id": 0}).to_list(200)
    rsu_unvested_value = sum(
        ((r.get("unvested_units") or (r.get("total_units",0) - (r.get("vested_units") or 0))) *
         (r.get("current_price") or 0))
        for r in rsus
    )
    ins = await db.insurance_policies.find(q, {"_id": 0}).to_list(200)
    insurance_total_coverage = sum(i.get("sum_assured") or 0 for i in ins)
    return {**base, "sip_total_invested": sip_total_invested, "sip_current_value": sip_current_value,
            "rsu_unvested_value": rsu_unvested_value, "insurance_total_coverage": insurance_total_coverage}


# ── Mount + middleware ─────────────────────────────────────────────────────────
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
    await seed_family_data()


@app.on_event("shutdown")
async def shutdown():
    client.close()
