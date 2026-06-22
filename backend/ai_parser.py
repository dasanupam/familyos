"""AI-powered universal inbox parser using Claude Sonnet 4.5.

Takes free-form text or extracted document text and returns a structured
JSON object describing which module(s) to update.
"""
import os
import json
import logging
import re
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
MODEL_NAME = "claude-sonnet-4-5-20250929"

SYSTEM_PROMPT = """You are the parsing brain of a Personal & Family Life Operating System.

Given free-form text from a user (a sentence, a voice transcript, or text extracted from a PDF
such as a bank statement, credit card bill, prescription, lab report, etc.), produce a single
JSON object describing structured records to upsert across the system.

Output schema (strict JSON, no prose, no markdown fences):
{
  "summary": "<one short human-readable line>",
  "module": "finance" | "health" | "goals" | "generic",
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
      "value": "<string or number, e.g. '120/80' or 72>", "unit": "<string>"}
  ],
  "generic_entries": [
     {"category": "<short tag like 'travel', 'fitness', 'note'>",
      "title": "<string>", "data": { ...any structured key-values... }}
  ],
  "confidence": <number 0..1>
}

Rules:
- Only include arrays that have items; omit or leave empty otherwise.
- Use INR. Strip currency symbols. Amounts must be plain numbers.
- If a date is missing, use today's date.
- For bank statements with many lines, extract every transaction row.
- If the input does not clearly map to finance/health/goals, put it in generic_entries.
- Output ONLY valid JSON, no commentary, no markdown.
"""


def _extract_json(text: str) -> dict:
    # Strip code fences if any
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    # Find first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return {"summary": "Could not parse", "module": "generic", "confidence": 0.0}
    try:
        return json.loads(text[start:end + 1])
    except Exception as e:
        logger.error(f"JSON parse failed: {e}")
        return {"summary": "Could not parse", "module": "generic", "confidence": 0.0}


async def parse_universal(content: str, today_iso: str, member_names: list[str]) -> dict:
    """Parse free-form text into structured upsert payload."""
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")

    session_id = f"parse-{today_iso}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=SYSTEM_PROMPT,
    ).with_model("anthropic", MODEL_NAME)

    user_text = (
        f"Today's date is {today_iso}.\n"
        f"Known family members: {', '.join(member_names) if member_names else 'none'}.\n\n"
        f"INPUT:\n{content[:60000]}\n\n"
        f"Return strict JSON now."
    )

    response = await chat.send_message(UserMessage(text=user_text))
    text = response if isinstance(response, str) else str(response)
    parsed = _extract_json(text)
    return parsed
