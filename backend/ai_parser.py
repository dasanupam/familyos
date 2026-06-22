"""AI parsing brain.

- parse_universal(text): free text / PDF text → structured JSON (Claude Sonnet 4.5)
- parse_image_file(path, mime): photo/image → structured JSON (Gemini multimodal)
Both return the same schema so the rest of the app is module-agnostic.
"""
import os
import json
import logging
import re
import tempfile
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
GEMINI_MODEL = "gemini-2.5-flash"

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
- Output ONLY valid JSON, no commentary.
"""


def _extract_json(text: str) -> dict:
    text = text.strip()
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


async def parse_universal(content: str, today_iso: str, member_names: list[str]) -> dict:
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"parse-{today_iso}",
        system_message=SYSTEM_PROMPT,
    ).with_model("anthropic", CLAUDE_MODEL)
    user_text = (
        f"Today's date is {today_iso}.\n"
        f"Known family members: {', '.join(member_names) if member_names else 'none'}.\n\n"
        f"INPUT:\n{content[:60000]}\n\n"
        f"Return strict JSON now."
    )
    response = await chat.send_message(UserMessage(text=user_text))
    text = response if isinstance(response, str) else str(response)
    return _extract_json(text)


async def parse_image_file(data: bytes, mime_type: str, today_iso: str, member_names: list[str]) -> dict:
    """Use Gemini multimodal to extract structured data from image."""
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    ext = mime_type.split("/")[-1].replace("jpeg", "jpg") or "png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"img-parse-{today_iso}",
            system_message=SYSTEM_PROMPT,
        ).with_model("gemini", GEMINI_MODEL)
        f = FileContentWithMimeType(file_path=tmp_path, mime_type=mime_type)
        msg = UserMessage(
            text=(f"Today's date is {today_iso}. Known members: {', '.join(member_names) or 'none'}. "
                  "Read this image (could be a prescription, lab report, receipt, ticket, certificate, etc.) "
                  "and return strict JSON per the schema."),
            file_contents=[f],
        )
        response = await chat.send_message(msg)
        text = response if isinstance(response, str) else str(response)
        return _extract_json(text)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
