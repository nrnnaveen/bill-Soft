#!/usr/bin/env python3
"""
Database Migration Runner for Shop Billing Application.
Executes pending SQL migrations against the configured SQLAlchemy database engine.
Ensures schema parity between SQLite development and Supabase PostgreSQL production.
"""

import os
import sys
from dotenv import load_dotenv
from sqlalchemy import text

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

sys.path.insert(0, BASE_DIR)
from app.database import engine, get_database_status

MIGRATIONS_DIR = os.path.join(BASE_DIR, "migrations")


def run_migrations():
    print("=" * 60)
    print("SHOP BILLING DATABASE MIGRATION RUNNER")
    print("=" * 60)

    db_status = get_database_status()
    print(f"[*] Target Database Engine: {db_status['engine']}")
    print(f"[*] Database Target: {db_status['database_target']}")
    print(f"[*] Connected & Verified: {db_status['connected']}")

    if not db_status["connected"]:
        print("[FAIL] Cannot execute migrations: Database connection is unavailable.")
        return False

    is_pg = db_status["is_cloud_database"]

    # Migration files to apply in sequence
    migration_files = [
        "001_initial_schema.sql",
        "002_rls_policies.sql",
    ]

    with engine.connect() as conn:
        for fname in migration_files:
            fpath = os.path.join(MIGRATIONS_DIR, fname)
            if not os.path.exists(fpath):
                print(f"[!] Warning: Migration file {fname} not found, skipping.")
                continue

            print(f"[*] Inspecting migration: {fname}")
            with open(fpath, "r") as f:
                sql_content = f.read()

            # If running on SQLite, skip PostgreSQL-specific blocks (DO $$ ... $$, RLS, etc.)
            if not is_pg:
                print(f"    [i] Dialect is SQLite. Running schema sync via SQLAlchemy inspector.")
                from app.database import init_db
                init_db()
                print(f"    [PASS] SQLite schema up to date.")
                continue

            # For PostgreSQL / Supabase, execute transactional SQL
            try:
                # Execute in an explicit transaction
                conn.execute(text(sql_content))
                conn.commit()
                print(f"    [PASS] Successfully applied {fname} to Supabase PostgreSQL.")
            except Exception as e:
                conn.rollback()
                print(f"    [FAIL] Error executing {fname}: {e}")
                return False

    print("=" * 60)
    print("MIGRATION EXECUTION COMPLETED")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
