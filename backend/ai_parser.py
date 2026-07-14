"""AI parsing brain — Gemini (free tier by default).

- parse_universal(text, today_iso, member_names, corrections): free text / extracted text -> structured JSON
- parse_pdf_file(data, today_iso, member_names, corrections): raw PDF bytes -> structured JSON (native, keeps tables)
- parse_image_file(data, mime, today_iso, member_names, corrections): image bytes -> structured JSON

Swap boundary: to change AI provider, only edit this file.
Model can be overridden without a code change via the GEMINI_MODEL env var.
"""
import os
import json
import logging
import re

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

SYSTEM_PROMPT = """You are the parsing brain of a Personal & Family Life Operating System.

Given a document (bank statement, credit card bill, prescription, lab report, salary slip,
tax document, insurance policy, travel ticket, offer letter, certificate, financial or
supplement plan, etc.) or free-form text, produce ONE JSON object describing structured
records to upsert across the system.

Output schema (strict JSON, no prose, no markdown fences):
{
  "summary": "<one short human-readable line>",
  "module": "<primary type: finance|health|goals|travel|career|insurance|assets|plans|generic>",
  "modules": ["<ALL types present in the extracted data>"],
  "member_hint": "<name of the person this document primarily belongs to, or null>",
  "statement_period": {"start": "YYYY-MM-DD|null", "end": "YYYY-MM-DD|null", "label": "<e.g. 'April 2026', 'FY 2025-26', or null>"},
  "transactions": [
     {"member": "<name|null>", "date": "YYYY-MM-DD", "amount": 0, "type": "expense|income",
      "category": "<food|groceries|fuel|utilities|rent|salary|investment|medical|insurance|shopping|entertainment|travel|education|tax|other>",
      "merchant": "<string|null>", "note": "<string|null>"}
  ],
  "investments": [
     {"member": "<name|null>", "name": "<fund or stock name>", "kind": "mutual_fund|stock|fd|ppf|epf|nps|rsu|espp|crypto|other",
      "units": null, "current_value": null, "invested_value": null}
  ],
  "loans": [
     {"member": "<name|null>", "name": "<string>", "outstanding": 0, "emi": null, "rate": null}
  ],
  "lab_results": [
     {"member": "<name|null>", "date": "YYYY-MM-DD", "test": "<test name>",
      "value": null, "unit": "<string>", "reference_range": "<string|null>"}
  ],
  "prescriptions": [
     {"member": "<name|null>", "date": "YYYY-MM-DD", "doctor": "<string|null>",
      "medications": [{"name": "<string>", "dose": "<string>", "frequency": "<string>", "duration": "<string|null>"}],
      "notes": "<string|null>"}
  ],
  "vitals": [
     {"member": "<name|null>", "date": "YYYY-MM-DD", "kind": "bp|weight|sugar|heart_rate|temperature|spo2",
      "value": "<string or number>", "unit": "<string>"}
  ],
  "vaccinations": [
     {"member": "<name|null>", "date": "YYYY-MM-DD", "vaccine": "<string>", "dose": "<string|null>", "next_due": "YYYY-MM-DD|null", "notes": "<string|null>"}
  ],
  "insurance_policies": [
     {"member": "<name|null>", "name": "<policy name>", "policy_type": "life|health|term|vehicle|home|travel|other",
      "provider": "<string|null>", "sum_assured": null, "premium": null,
      "premium_frequency": "monthly|quarterly|yearly|null", "renewal_date": "YYYY-MM-DD|null", "notes": "<string|null>"}
  ],
  "assets": [
     {"member": "<name|null>", "name": "<string>", "kind": "property|vehicle|gold|other",
      "current_value": null, "purchase_value": null, "purchase_date": "YYYY-MM-DD|null", "notes": "<string|null>"}
  ],
  "trips": [
     {"member": "<name|null>", "name": "<string>", "destination": "<string>", "start_date": "YYYY-MM-DD|null",
      "end_date": "YYYY-MM-DD|null", "budget": null, "notes": "<string|null>"}
  ],
  "career_events": [
     {"member": "<name|null>", "date": "YYYY-MM-DD", "kind": "promotion|new_role|certification|achievement|review|raise",
      "title": "<string>", "company": "<string|null>", "ctc": null, "notes": "<string|null>"}
  ],
  "goals": [
     {"member": "<name|null>", "name": "<string>", "target_amount": 0, "current_amount": null,
      "target_date": "YYYY-MM-DD|null", "category": "<car|home|retirement|care|education|other>"}
  ],
  "supplements": [
     {"member": "<name|null>", "name": "<string>", "dose": "<string>", "frequency": "<string>",
      "start_date": "YYYY-MM-DD|null", "end_date": "YYYY-MM-DD|null", "notes": "<string|null>"}
  ],
  "plans": [
     {"member": "<name|null>", "name": "<unique plan name>", "plan_type": "financial|retirement|investment|budget|supplement|diet|fitness|treatment|other",
      "target_date": "YYYY-MM-DD|null", "notes": "<string|null>",
      "items": [{"title": "<string>", "detail": "<string|null>", "amount": null, "due_date": "YYYY-MM-DD|null"}]}
  ],
  "generic_entries": [
     {"member": "<name|null>", "category": "<short tag>", "title": "<string>", "data": {}}
  ],
  "confidence": 0.9
}

GENERAL RULES:
- Only include arrays that have items. Use INR. Strip currency symbols, return numbers.
- EVERY record has a "member" field: the person that specific record belongs to, matched to
  the known family member names when possible (match on first name, case-insensitive). If a
  record's person is unclear, set member to null -- NEVER guess a family member.
- Extract ALL relevant data from EVERY section of the document. A discharge summary has both
  health data (diagnosis, medications, lab values) AND finance data (bill amount, insurance
  claim) -- extract both. Never suppress data because the document has a primary type.
  "module" is the primary type; "modules" lists every type you actually extracted.
- Dates: use the date printed on/in the document for each record. Only if no date exists
  anywhere in the document, use today's date. Fill statement_period with the period the
  document covers (a monthly statement, a fiscal year, a single-day report).
- "confidence": your honest confidence that the extraction is complete and correctly
  attributed. Use < 0.7 when the document is unusual, blurry, or attribution is unclear.
- Output ONLY valid JSON, no commentary.

PAYSLIP RULES:
- A payslip covers ONE month. Extract ONLY the current-month column, NEVER the YTD
  (year-to-date) column. If both columns exist, the smaller figures are usually the month.
- Create: one income transaction for gross salary (category=salary); one expense transaction
  per deduction -- income tax/TDS (category=tax), PF (category=investment), health insurance
  premium (category=insurance) -- current month values only.
- Record net salary in the income transaction's note (e.g. "net: 245000").
- Do NOT annualize figures. Do NOT create career_events or goals from a payslip.
- statement_period = that month.

TAX DOCUMENT RULES (Form 16, ITR, tax computation):
- These show ANNUAL totals for a fiscal year. Do NOT split into monthly transactions.
- Create one expense transaction (category=tax) PER TAX SOURCE found: salary TDS, TCS,
  LRS/foreign remittance tax, RSU withholding, ESPP tax, advance tax -- each its own row,
  dated at fiscal year end, with the source named in the note.
- Optionally one income transaction for total annual gross income (note: "annual gross FY xx-xx").
- Do NOT create career_events. Annual gross income is NOT a CTC and NOT a raise.
- statement_period = the fiscal year.

LAB REPORT RULES:
- Extract EVERY test row into lab_results: test name, numeric value, unit, reference range,
  and the sample/report date printed on the report.
- The PATIENT name on the report is that record's member (and usually member_hint).
- If a value is textual (e.g. "Reactive", "Negative"), put the text in unit and value=null.
- A lab report can still contain finance data (an attached invoice) -- extract that too.

BANK / CREDIT CARD STATEMENT RULES:
- Extract every transaction row with its own date, amount, type and best-guess category.
- The account holder name is the member for all rows unless a row clearly names someone else.
- statement_period = the statement period printed on it.

INSURANCE DOCUMENT RULES:
- Policy documents/renewal notices -> insurance_policies entry (plus a premium-payment
  transaction only if the document shows a payment actually made).
- The insured person is the member; the policy owner is member_hint if different.

PLAN DOCUMENT RULES (financial plan, retirement plan, supplement/diet/fitness plan):
- Create ONE plans[] entry with a stable, unique name (e.g. "Retirement Plan 2026") so
  re-uploads update instead of duplicate. Put each plan line-item into items[].
- ALSO populate goals[] (for financial targets) and/or supplements[] (for supplement plans)
  from the plan contents, with clear unique names for upsert.

MIXED / UNKNOWN DOCUMENTS:
- Discharge summaries, health checkup packages, travel itineraries with payments: extract
  every category of data present, list all in modules.
- If nothing maps to a structured module, use generic_entries with a descriptive category.
"""


def _get_client():
    from google import genai
    return genai.Client(api_key=GEMINI_API_KEY)


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return {"summary": "Could not parse", "module": "generic", "confidence": 0.0}
    try:
        return json.loads(text[start:end + 1])
    except Exception as e:
        logger.error(f"JSON parse failed: {e}")
        return {"summary": "Could not parse", "module": "generic", "confidence": 0.0}


def _context_block(today_iso: str, member_names: list, corrections: list | None) -> str:
    lines = [
        f"Today's date is {today_iso}.",
        f"Known family members: {', '.join(member_names) if member_names else 'none'}.",
    ]
    if corrections:
        lines.append("")
        lines.append("LEARNED CORRECTIONS from the user's past reviews -- follow these over defaults:")
        for c in corrections[:10]:
            lines.append(f"- {c}")
    return "\n".join(lines)


def _generate(contents, today_iso: str, member_names: list, corrections: list | None) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    from google.genai import types
    client = _get_client()
    response = client.models.generate_content(
        model=DEFAULT_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT + "\n\n" + _context_block(today_iso, member_names, corrections),
            response_mime_type="application/json",
        ),
    )
    return _extract_json(response.text)


async def parse_universal(content: str, today_iso: str, member_names: list,
                          corrections: list | None = None) -> dict:
    user_text = f"INPUT:\n{content[:60000]}\n\nReturn strict JSON now."
    return _generate(user_text, today_iso, member_names, corrections)


async def parse_pdf_file(data: bytes, today_iso: str, member_names: list,
                         corrections: list | None = None) -> dict:
    """Send the PDF bytes natively so Gemini sees the real layout (tables, columns)."""
    from google.genai import types
    contents = [
        types.Part.from_bytes(data=data, mime_type="application/pdf"),
        "Parse this document and return strict JSON per the schema.",
    ]
    return _generate(contents, today_iso, member_names, corrections)


async def parse_image_file(data: bytes, mime_type: str, today_iso: str, member_names: list,
                           corrections: list | None = None) -> dict:
    from google.genai import types
    contents = [
        types.Part.from_bytes(data=data, mime_type=mime_type),
        "Read this image and return strict JSON per the schema.",
    ]
    parsed = _generate(contents, today_iso, member_names, corrections)
    parsed["_source"] = "vision"
    return parsed
