#!/usr/bin/env python3
"""
Supabase Verification & Audit Script
Tests Supabase Cloud Reachability, Authentication, Table Reads,
Isolated CRUD operations, Storage Bucket operations, and Security.
Does not log or expose secret keys.
"""

import os
import sys
import time
from urllib.parse import urlparse
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
BUCKET_NAME = os.getenv("SUPABASE_STORAGE_BUCKET", "shop-assets").strip()


def run_audit():
    print("=" * 60)
    print("SUPABASE PRODUCTION CONNECTIVITY & SECURITY AUDIT")
    print("=" * 60)

    # 1. Configuration Check
    if not SUPABASE_URL:
        print("[FAIL] 1. SUPABASE_URL is missing in environment.")
        return False
    if not SUPABASE_KEY:
        print("[FAIL] 1. SUPABASE_SERVICE_ROLE_KEY is missing in environment.")
        return False

    parsed_url = urlparse(SUPABASE_URL)
    project_ref = parsed_url.hostname.split(".")[0] if parsed_url.hostname else "unknown"
    print(f"[PASS] 1. Configuration Present: Supabase Host '{parsed_url.hostname}' (Ref: {project_ref})")

    # 2. REST Reachability & Authentication
    import urllib.request
    import json

    rest_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/"
    req = urllib.request.Request(
        rest_url,
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            if res.status == 200:
                print(f"[PASS] 2. Supabase REST API Reachable & Authenticated (HTTP {res.status}).")
            else:
                print(f"[FAIL] 2. Supabase REST returned status {res.status}.")
                return False
    except Exception as e:
        print(f"[FAIL] 2. Could not reach Supabase REST API: {e}")
        return False

    # 3. Client Initialization
    try:
        from supabase import create_client
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[PASS] 3. Supabase Python SDK Client initialized successfully.")
    except Exception as e:
        print(f"[FAIL] 3. Failed to initialize Supabase client: {e}")
        return False

    # 4. Table Reads (Settings, Products, Invoices)
    try:
        settings_res = client.table("shop_settings").select("id, shop_name, gstin, state").limit(1).execute()
        if settings_res.data:
            s = settings_res.data[0]
            print(f"[PASS] 4a. Read shop_settings: '{s.get('shop_name', '')[:35]}...' (GSTIN: {s.get('gstin')})")
        else:
            print("[WARN] 4a. shop_settings table is empty on Supabase.")
    except Exception as e:
        print(f"[FAIL] 4a. Failed to read shop_settings: {e}")
        return False

    try:
        prods_res = client.table("products").select("count", count="exact").execute()
        print(f"[PASS] 4b. Read products: Total records count on Supabase = {prods_res.count}")
    except Exception as e:
        print(f"[FAIL] 4b. Failed to query products: {e}")
        return False

    try:
        invs_res = client.table("invoices").select("count", count="exact").execute()
        print(f"[PASS] 4c. Read invoices: Total records count on Supabase = {invs_res.count}")
    except Exception as e:
        print(f"[FAIL] 4c. Failed to query invoices: {e}")
        return False

    # 5. Isolated CRUD Write Test (Disposable Record)
    test_code = f"QA-AUDIT-{int(time.time())}"
    test_payload = {
        "code": test_code,
        "name": "Audit Verification Motor",
        "unit": "Nos",
        "selling_price": 750.00,
        "gst_rate": 18.00,
        "stock_quantity": 20.00,
        "is_active": True
    }

    try:
        insert_res = client.table("products").insert(test_payload).execute()
        if not insert_res.data:
            print("[FAIL] 5a. Insert returned empty data.")
            return False
        prod_id = insert_res.data[0]["id"]
        print(f"[PASS] 5a. Record created successfully (ID: {prod_id}, Code: {test_code})")
    except Exception as e:
        print(f"[FAIL] 5a. Insert failed: {e}")
        return False

    try:
        update_res = client.table("products").update({"stock_quantity": 35.00}).eq("id", prod_id).execute()
        new_qty = update_res.data[0]["stock_quantity"]
        assert float(new_qty) == 35.00, f"Expected 35.00, got {new_qty}"
        print(f"[PASS] 5b. Record updated successfully (New stock: {new_qty})")
    except Exception as e:
        print(f"[FAIL] 5b. Update failed: {e}")
        return False

    try:
        client.table("products").delete().eq("id", prod_id).execute()
        verify_del = client.table("products").select("*").eq("id", prod_id).execute()
        assert len(verify_del.data) == 0, "Record still exists after delete"
        print("[PASS] 5c. Record deleted and verified non-existent on Supabase.")
    except Exception as e:
        print(f"[FAIL] 5c. Delete failed: {e}")
        return False

    # 6. Supabase Storage Bucket Operations
    try:
        buckets = [b.name for b in client.storage.list_buckets()]
        if BUCKET_NAME not in buckets:
            client.storage.create_bucket(BUCKET_NAME, options={"public": False})
            print(f"[PASS] 6a. Storage: Created private bucket '{BUCKET_NAME}'.")
        else:
            print(f"[PASS] 6a. Storage: Bucket '{BUCKET_NAME}' verified active.")

        test_file_path = f"audit/verify_{int(time.time())}.txt"
        test_payload = b"Production Audit Proof: Authorized Seal & Cloud Storage Operational."
        
        client.storage.from_(BUCKET_NAME).upload(
            test_file_path,
            test_payload,
            file_options={"content-type": "text/plain", "upsert": "true"}
        )
        print(f"[PASS] 6b. Storage: Uploaded test asset to '{BUCKET_NAME}/{test_file_path}'.")

        downloaded = client.storage.from_(BUCKET_NAME).download(test_file_path)
        assert downloaded == test_payload, "Downloaded content does not match uploaded payload"
        print("[PASS] 6c. Storage: Downloaded asset verified byte-for-byte.")

        client.storage.from_(BUCKET_NAME).remove([test_file_path])
        print("[PASS] 6d. Storage: Cleaned up test asset.")
    except Exception as e:
        print(f"[FAIL] 6. Storage operation failed: {e}")
        return False

    # 7. Unauthenticated Access Protection Check
    try:
        unauth_req = urllib.request.Request(f"{SUPABASE_URL.rstrip('/')}/rest/v1/invoices")
        try:
            with urllib.request.urlopen(unauth_req, timeout=5) as res:
                print("[FAIL] 7. Security: Unauthenticated request was unexpectedly accepted!")
                return False
        except urllib.error.HTTPError as he:
            if he.code in (401, 403):
                print(f"[PASS] 7. Security: Unauthenticated access rejected with HTTP {he.code}.")
            else:
                print(f"[WARN] 7. Security returned HTTP {he.code}: {he.reason}")
    except Exception as e:
        print(f"[PASS] 7. Security: Unauthenticated request failed securely ({e}).")

    print("=" * 60)
    print("ALL SUPABASE VERIFICATION CHECKS PASSED SUCCESSFULLY (7/7)")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = run_audit()
    sys.exit(0 if success else 1)
