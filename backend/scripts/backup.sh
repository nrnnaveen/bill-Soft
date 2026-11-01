#!/usr/bin/env bash
# Quick backup script
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."
source .venv/bin/activate
echo "=========================================="
echo "Backing up Shop Billing Database & Seal..."
echo "=========================================="
python3 scripts/export_db.py
python3 scripts/backup_seal.py
echo "=========================================="
echo "Backup complete! Check the backend/backups folder."
echo "=========================================="
