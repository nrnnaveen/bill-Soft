#!/usr/bin/env python3
"""
Seal Backup Utility for Shop Billing Application.
Downloads and backs up the shop's authorized seal image from Supabase Storage (or local storage).
"""

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import ShopSettings
from app.services.storage_service import get_seal_bytes

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


def backup_seal():
    db = SessionLocal()
    try:
        settings = db.query(ShopSettings).first()
        if not settings or not settings.seal_image_path:
            print("[!] No authorized seal is currently registered in shop settings.")
            return None

        result = get_seal_bytes(settings.seal_image_path)
        if not result:
            print(f"[!] Could not retrieve seal bytes from path: {settings.seal_image_path}")
            return None

        data, mime = result
        ext = ".png" if "png" in mime else ".jpg"
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        dest = os.path.join(BACKUP_DIR, f"seal_backup_{timestamp}{ext}")

        with open(dest, "wb") as f:
            f.write(data)

        print(f"[✓] Authorized seal backed up successfully!")
        print(f"    Source path: {settings.seal_image_path}")
        print(f"    Backup file: {dest}")
        return dest
    finally:
        db.close()


if __name__ == "__main__":
    backup_seal()
