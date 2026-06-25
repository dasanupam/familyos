"""AI parsing brain — domain-specific prompting layer.

Calls services/ai_service for all LLM interactions.
Never imports from emergentintegrations directly.
"""
import os
import tempfile
import logging
from services.ai_service import parse_text, parse_image

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the parsing brain of a Personal & Family Life Operating System.

Given free-form text (a sentence, voice transcript, or text extracted from a document like a
bank statement, credit card bill, prescription, lab report, salary slip, travel ticket, job
offer letter, certificate, etc.), produce a single JSON object describing structured records
to upsert across the system.

Output schema (strict JSON, no prose, no markdown fences):
{
  "summary": "<one short human-readable line>",
  "module": "finance" | "health" | "goals" | "travel" | "career" | "generic",
  "member_hint": "<name or null>",
  "transactions": [
     {"date": "YYYY-MM-DD", "amount": <number, positive>, "type": "expense"|"income",
      "category": "<food|groceries|fuel|utilities|rent|salary|investment|medical|shopping|entertainment|travel|education|other>",
      "merchant": "<string|null>", "note": "<string|null>"}
  ],
  "investments": [
     {"name": "<fund or stock name>", "kind": "mutual_fund"|"stock"|"fd"|"crypto"|"other",
      "units": <number|null>, "current_value": <number|null>, "invested_value": <number|null>}
  ],
  "loans": [
     {"name": "<string>", "outstanding": <number>, "emi": <number|null>, "rate": <number|null>}
  ],
  "lab_results": [
     {"date": "YYYY-MM-DD", "test": "<HbA1c|TSH|LDL|HDL|Hemoglobin|Vitamin D|...>",
      "value": <number>, "unit": "<string>", "reference_range": "<string|null>"}
  ],
  "prescriptions": [
     {"date": "YYYY-MM-DD", "doctor": "<string|null>",
      "medications": [{"name": "<string>", "dose": "<string>", "frequency": "<string>",
                        "duration": "<string|null>"}],
      "notes": "<string|null>"}
  ],
  "vitals": [
     {"date": "YYYY-MM-DD", "kind": "bp"|"weight"|"sugar"|"heart_rate"|"temperature"|"spo2",
      "value": "<string or number>", "unit": "<string>"}
  ],
  "trips": [
     {"name": "<string>", "destination": "<string>", "start_date": "YYYY-MM-DD|null",
      "end_date": "YYYY-MM-DD|null", "budget": <number|null>, "notes": "<string|null>"}
  ],
  "career_events": [
     {"date": "YYYY-MM-DD", "kind": "promotion"|"new_role"|"certification"|"achievement"|"review"|"raise",
      "title": "<string>", "company": "<string|null>", "ctc": <number|null>, "notes": "<string|null>"}
  ],
  "goals": [
     {"name": "<string>", "target_amount": <number>, "current_amount": <number|null>,
      "target_date": "YYYY-MM-DD|null", "category": "<car|home|retirement|care|education|other>"}
  ],
  "supplements": [
     {"name": "<string>", "dose": "<string>", "frequency": "<string>",
      "start_date": "YYYY-MM-DD|null", "end_date": "YYYY-MM-DD|null", "notes": "<string|null>"}
  ],
  "generic_entries": [
     {"category": "<short tag>", "title": "<string>", "data": { ... }}
  ],
  "confidence": <number 0..1>
}

Rules:
- Only include arrays that have items.
- Use INR. Strip currency symbols, return numbers.
- If a date is missing, use today's date.
- For bank/credit-card statements with many rows, extract every transaction row.
- For ticket/itinerary docs, create a trip entry and any related transactions (booking fares).
- For offer/appointment letters, create a career_event with kind='new_role'.
- For certificates, kind='certification'.
- If you cannot map to any structured module, put it in generic_entries.
- For "financial plan" / "retirement plan" / "supplement plan" type docs, populate goals[] and/or supplements[] with the items the plan defines. Use clear unique names so re-uploads can upsert.
- Output ONLY valid JSON, no commentary.
"""


async def parse_universal(content: str, today_iso: str, member_names: list) -> dict:
    """Parse free-form text or extracted document text into structured JSON."""
    user_text = (
        f"Today's date is {today_iso}.\n"
        f"Known family members: {', '.join(member_names) if member_names else 'none'}.\n\n"
        f"INPUT:\n{content[:60000]}\n\n"
        f"Return strict JSON now."
    )
    return await parse_text(user_text, SYSTEM_PROMPT, session_id=f"parse-{today_iso}")


async def parse_image_file(data: bytes, mime_type: str, today_iso: str, member_names: list) -> dict:
    """Parse an image (photo of prescription, lab report, receipt, etc.) via Gemini multimodal Vision."""
    ext = mime_type.split("/")[-1].replace("jpeg", "jpg") or "png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        user_prompt = (
            f"Today's date is {today_iso}. "
            f"Known family members: {', '.join(member_names) or 'none'}. "
            "Carefully analyse this medical or financial image. "
            "If it is a lab report or blood test result: extract EVERY test parameter — test name, "
            "numeric value, unit (e.g. mg/dL, IU/L, %) and reference range. Put each in lab_results[]. "
            "If it is a prescription: extract doctor name, date, and EVERY medication with dose, "
            "frequency and duration. Put in prescriptions[]. "
            "If it is a receipt or bill: extract each line item as a transaction with amount. "
            "If it is a ticket or boarding pass: create a trip entry. "
            "For any other document extract relevant structured data. "
            "Return strict JSON per the schema. No prose, no markdown fences."
        )
        return await parse_image(
            tmp_path, mime_type, user_prompt, SYSTEM_PROMPT,
            session_id=f"img-{today_iso}"
        )
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
