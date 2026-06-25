"""File storage service abstraction layer.

All file I/O goes through here. Never call storage.put_object / get_object
directly from other files — use this module instead.

To migrate to Google Drive (GOOGLE_DRIVE_REFRESH_TOKEN env var), swap
this file only. Files will be stored in a 'LifeOS_Uploads' folder.
"""
import os
import uuid
import logging
from storage import put_object, get_object, APP_NAME

logger = logging.getLogger(__name__)


async def upload_file(file_bytes: bytes, filename: str, mime_type: str, user_id: str = "shared") -> str:
    """Upload file bytes and return a file_id (storage path string)."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    file_id = f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4()}.{ext}"
    put_object(file_id, file_bytes, mime_type)
    return file_id


async def get_file_content(file_id: str):
    """Return (bytes, content_type) for the given file_id / storage path."""
    return get_object(file_id)


async def get_file_url(file_id: str) -> str:
    """Return a reference for the file.
    Current backend serves files via the /api/documents/{id}/download endpoint.
    """
    return file_id


async def delete_file(file_id: str) -> None:
    """Delete a file. Currently a no-op; Emergent Object Storage does not
    expose a delete API. Swap this file to enable delete on migration."""
    logger.info(f"delete_file called for {file_id} — no-op in current backend")
