"""AI parsing brain — Gemini 2.5 Flash (free tier).

- parse_universal(text, today_iso, member_names): free text / PDF text → structured JSON
- parse_image_file(data, mime, today_iso, member_names): image bytes → structured JSON

Swap boundary: to change AI provider, only edit this file.
"""
import os
import json
import logging
import re

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
TEXT_MODEL = "gemini-2.5-flash"
VISION_MODEL = "gemini-2.5-flash"

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


def _get_client():
    from google import genai
    return genai.Client(api_key=GEMINI_API_KEY)


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
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    from google.genai import types
    client = _get_client()
    user_text = (
        f"Today's date is {today_iso}.\n"
        f"Known family members: {', '.join(member_names) if member_names else 'none'}.\n\n"
        f"INPUT:\n{content[:60000]}\n\n"
        f"Return strict JSON now."
    )
    response = client.models.generate_content(
        model=TEXT_MODEL,
        contents=user_text,
        config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
    )
    return _extract_json(response.text)


async def parse_image_file(data: bytes, mime_type: str, today_iso: str, member_names: list[str]) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    from google import genai
    from google.genai import types
    client = _get_client()
    prompt_text = (
        f"Today's date is {today_iso}. Known members: {', '.join(member_names) or 'none'}. "
        "Read this image (could be a prescription, lab report, receipt, ticket, certificate, etc.) "
        "and return strict JSON per the schema."
    )
    response = client.models.generate_content(
        model=VISION_MODEL,
        contents=[
            types.Part.from_bytes(data=data, mime_type=mime_type),
            prompt_text,
        ],
        config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
    )
    return _extract_json(response.text)
