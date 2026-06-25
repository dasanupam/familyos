"""AI service abstraction layer — Gemini 2.5 Flash (free tier).

NOTE: server.py uses ai_parser.py directly for all AI calls.
This module is kept for any future service-layer use.

Swap boundary: to change AI provider, only edit this file.
"""
import os
import logging

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
TEXT_MODEL = "gemini-2.5-flash"
VISION_MODEL = "gemini-2.5-flash"


def _get_client():
    from google import genai
    return genai.Client(api_key=GEMINI_API_KEY)


async def complete_text(prompt: str, system: str = "") -> str:
    from google.genai import types
    client = _get_client()
    config = types.GenerateContentConfig(system_instruction=system) if system else None
    response = client.models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=config,
    )
    return response.text


async def complete_vision(prompt: str, image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    from google.genai import types
    client = _get_client()
    response = client.models.generate_content(
        model=VISION_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ],
    )
    return response.text
