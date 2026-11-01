#!/usr/bin/env python3
"""
Seal Restore Utility for Shop Billing Application.
Restores a backed-up authorized seal image to Supabase Storage (or local storage).
"""

import os
import sys
import mimetypes

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import ShopSettings
from app.services.storage_service import upload_seal


def restore_seal(seal_file_path: str):
    if not os.path.exists(seal_file_path):
        print(f"[!] Error: Seal image file not found: {seal_file_path}")
        sys.exit(1)

    mime = mimetypes.guess_type(seal_file_path)[0] or "image/png"
    with open(seal_file_path, "rb") as f:
        file_bytes = f.read()

    print(f"[*] Uploading seal ({len(file_bytes)} bytes) to storage...")
    storage_path = upload_seal(
        file_bytes=file_bytes,
        filename=os.path.basename(seal_file_path),
        content_type=mime,
    )

    db = SessionLocal()
    try:
        settings = db.query(ShopSettings).first()
        if not settings:
            settings = ShopSettings(id=1)
            db.add(settings)

        settings.seal_image_path = storage_path
        db.commit()
        print(f"[✓] Authorized seal restored successfully!")
        print(f"    New storage path in DB: {storage_path}")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 restore_seal.py <path_to_seal_image>")
        sys.exit(1)
    restore_seal(sys.argv[1])
