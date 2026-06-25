"""File storage service — Google Drive via OAuth refresh token (free tier).

Required env vars:
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REFRESH_TOKEN
  GOOGLE_DRIVE_FOLDER_ID

Swap boundary: to change storage provider, only edit this file.
"""
import os
import io
import uuid
import logging

logger = logging.getLogger(__name__)

FOLDER_ID = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")


def _get_drive_service():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = Credentials(
        token=None,
        refresh_token=os.environ.get("GOOGLE_REFRESH_TOKEN"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    )
    if not creds.valid:
        creds.refresh(Request())
    return build("drive", "v3", credentials=creds, cache_discovery=False)


async def upload_file(file_bytes: bytes, filename: str, mime_type: str, user_id: str = "shared") -> str:
    """Upload file bytes to Google Drive, return the Drive file ID."""
    from googleapiclient.http import MediaIoBaseUpload
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    unique_name = f"{uuid.uuid4()}.{ext}"
    service = _get_drive_service()
    file_metadata = {"name": unique_name, "parents": [FOLDER_ID]}
    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type, resumable=False)
    file = service.files().create(
        body=file_metadata, media_body=media, fields="id"
    ).execute()
    return file["id"]


async def get_file_content(file_id: str):
    """Return (bytes, content_type) for the given Drive file ID."""
    from googleapiclient.http import MediaIoBaseDownload
    service = _get_drive_service()
    meta = service.files().get(fileId=file_id, fields="mimeType").execute()
    mime = meta.get("mimeType", "application/octet-stream")
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue(), mime


async def get_file_url(file_id: str) -> str:
    """Return a Google Drive view URL for the file."""
    return f"https://drive.google.com/file/d/{file_id}/view"


async def delete_file(file_id: str) -> None:
    """Delete a file from Google Drive."""
    try:
        service = _get_drive_service()
        service.files().delete(fileId=file_id).execute()
    except Exception as e:
        logger.warning(f"delete_file failed for {file_id}: {e}")
