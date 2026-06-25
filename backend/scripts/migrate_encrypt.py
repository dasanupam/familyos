#!/usr/bin/env python3
"""One-time migration script: encrypt plaintext fields in MongoDB.

Run AFTER setting ENCRYPTION_KEY in backend/.env:
    cd /app && python -m backend.scripts.migrate_encrypt

It is idempotent: already-encrypted values are skipped silently.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

import motor.motor_asyncio
from services.crypto_service import encrypt, encrypt_doc, _get_fernet

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME   = os.environ.get("DB_NAME", "familyos")

client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db     = client[DB_NAME]

MIGRATIONS = {
    "prescriptions":        ["doctor", "notes", "medications"],
    "lab_results":          ["unit", "reference_range"],
    "vitals":               ["unit"],
    "transactions":         ["merchant", "note"],
    "investments":          ["name"],
    "identity_documents":   ["doc_number", "issued_by"],
    "appointments":         ["doctor_name", "reason", "notes"],
}


async def migrate():
    if _get_fernet() is None:
        print("ERROR: ENCRYPTION_KEY not set. Set it in backend/.env first.")
        return

    for coll_name, fields in MIGRATIONS.items():
        coll = db[coll_name]
        docs = await coll.find({}, {"_id": 1, "id": 1, **{f: 1 for f in fields}}).to_list(10000)
        updated = 0
        for doc in docs:
            encrypted = encrypt_doc(coll_name, doc)
            changed = {f: encrypted[f] for f in fields if f in doc and encrypted.get(f) != doc.get(f)}
            if changed:
                await coll.update_one({"_id": doc["_id"]}, {"$set": changed})
                updated += 1
        print(f"  {coll_name}: {updated}/{len(docs)} documents encrypted")

    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
