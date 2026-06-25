"""AI service abstraction layer.

All LLM calls go through here. Never import emergentintegrations directly
from other files — use this module instead.

To migrate to free tier (google-generativeai SDK + GEMINI_API_KEY), swap
this file only. Everything else stays untouched.
"""
import os
import json
import logging
import re
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
GEMINI_MODEL = "gemini-2.5-flash"


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


async def parse_text(text: str, system_prompt: str, session_id: str = "parse-session") -> dict:
    """Call Claude LLM with plain text. Returns parsed JSON dict."""
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model("anthropic", CLAUDE_MODEL)
    response = await chat.send_message(UserMessage(text=text))
    raw = response if isinstance(response, str) else str(response)
    return _extract_json(raw)


async def parse_file(file_path: str, system_prompt: str, user_prompt: str = "", session_id: str = "file-session") -> dict:
    """Read a local text file and parse via LLM. Returns parsed JSON dict."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception as e:
        logger.error(f"Failed to read file {file_path}: {e}")
        return {"summary": "Could not read file", "module": "generic", "confidence": 0.0}
    full_text = f"{user_prompt}\n\n{content[:60000]}" if user_prompt else content[:60000]
    return await parse_text(full_text, system_prompt, session_id)


async def parse_image(file_path: str, mime_type: str, user_prompt: str, system_prompt: str, session_id: str = "img-session") -> dict:
    """Call Gemini multimodal with an image file. Returns parsed JSON dict."""
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model("gemini", GEMINI_MODEL)
    f = FileContentWithMimeType(file_path=file_path, mime_type=mime_type)
    msg = UserMessage(text=user_prompt, file_contents=[f])
    response = await chat.send_message(msg)
    raw = response if isinstance(response, str) else str(response)
    return _extract_json(raw)
