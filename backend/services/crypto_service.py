"""Application-level field encryption service.

Uses Fernet (AES-128 symmetric) from the `cryptography` package.
Key is read from the ENCRYPTION_KEY environment variable.

If ENCRYPTION_KEY is not set, all encrypt/decrypt calls are no-ops
(returns the value unchanged) so the app stays fully functional in
development without the key.

Usage:
    from services.crypto_service import encrypt, decrypt, encrypt_doc, decrypt_doc

    # Encrypt a single value before writing to MongoDB
    doc["doctor"] = encrypt(doc.get("doctor"))

    # Decrypt after reading from MongoDB
    doc["doctor"] = decrypt(doc.get("doctor"))

    # Bulk encrypt/decrypt a document's sensitive fields
    doc = encrypt_doc("prescriptions", doc)
    doc = decrypt_doc("prescriptions", doc)
"""
import os
import json
import logging

logger = logging.getLogger(__name__)

_fernet = None
_key_missing_logged = False


def _get_fernet():
    global _fernet, _key_missing_logged
    if _fernet is not None:
        return _fernet
    key = os.environ.get("ENCRYPTION_KEY", "").strip()
    if not key:
        if not _key_missing_logged:
            logger.info("ENCRYPTION_KEY not set — field encryption disabled (dev mode)")
            _key_missing_logged = True
        return None
    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(key.encode())
        logger.info("Field encryption enabled via ENCRYPTION_KEY")
        return _fernet
    except Exception as e:
        logger.warning(f"Invalid ENCRYPTION_KEY: {e} — encryption disabled")
        return None


def encrypt(value) -> str:
    """Encrypt a string value. Returns the encrypted base64 string.
    Handles None gracefully. Handles dicts/lists by JSON-serialising first."""
    if value is None:
        return None
    f = _get_fernet()
    if f is None:
        return value
    try:
        if not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        return f.encrypt(value.encode()).decode()
    except Exception as e:
        logger.warning(f"encrypt() failed: {e}")
        return value


def decrypt(value) -> str:
    """Decrypt a value previously encrypted with encrypt().
    Returns the original string. If the value is not encrypted
    (e.g. legacy plaintext data), returns it unchanged."""
    if value is None:
        return None
    f = _get_fernet()
    if f is None:
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except Exception:
        # Not encrypted (legacy data) — return as-is for backward compat
        return value


def decrypt_json(value):
    """Decrypt and JSON-parse a value (for encrypted lists such as medications)."""
    if value is None:
        return None
    raw = decrypt(value)
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return raw


# ── Per-collection field lists ──────────────────────────────────────────────

# Simple string fields to encrypt/decrypt
_STRING_FIELDS: dict[str, list[str]] = {
    "prescriptions": ["doctor", "notes"],
    "lab_results": ["unit", "reference_range"],
    "vitals": ["unit"],
    "transactions": ["merchant", "note"],
    "investments": ["name"],
    "identity_documents": ["doc_number", "issued_by"],
    "appointments": ["doctor_name", "reason", "notes"],
}

# JSON-serialised fields (lists/dicts stored as encrypted strings)
_JSON_FIELDS: dict[str, list[str]] = {
    "prescriptions": ["medications"],
}


def encrypt_doc(collection: str, doc: dict) -> dict:
    """Return a copy of *doc* with sensitive fields encrypted for *collection*."""
    if not doc:
        return doc
    doc = dict(doc)
    for field in _STRING_FIELDS.get(collection, []):
        if doc.get(field) is not None:
            doc[field] = encrypt(str(doc[field]))
    for field in _JSON_FIELDS.get(collection, []):
        if doc.get(field) is not None:
            doc[field] = encrypt(doc[field])  # encrypt() handles lists
    return doc


def decrypt_doc(collection: str, doc: dict) -> dict:
    """Return a copy of *doc* with sensitive fields decrypted for *collection*."""
    if not doc:
        return doc
    doc = dict(doc)
    for field in _STRING_FIELDS.get(collection, []):
        if doc.get(field) is not None:
            doc[field] = decrypt(doc[field])
    for field in _JSON_FIELDS.get(collection, []):
        if doc.get(field) is not None:
            doc[field] = decrypt_json(doc[field])
    return doc


def decrypt_list(collection: str, docs: list) -> list:
    """Decrypt all documents in a list."""
    return [decrypt_doc(collection, d) for d in docs]
