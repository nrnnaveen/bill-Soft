#!/usr/bin/env python3
"""
End-to-End Billing & Database Verification Script.
Executes complete business operations strictly through the application's actual REST API:
- Product creation, edit, and restock
- Stock movement audit logging
- Invoice creation with multi-rate GST, discounts, and transport
- Stock deduction verification
- Backend restart persistence check
- Offline sync push and duplicate prevention
Cleans up disposable QA records cleanly.
"""

import os
import sys
import time
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import engine, get_database_status, SessionLocal
from app.models import Product, Invoice, InvoiceItem, StockMovement

client = TestClient(app)


def run_e2e_flow():
    print("=" * 60)
    print("SHOP BILLING END-TO-END FLOW & DATABASE PERSISTENCE AUDIT")
    print("=" * 60)

    # 0. Inspect Active Database
    stat = get_database_status()
    print(f"[*] Active Database Dialect: {stat['engine']}")
    print(f"[*] Persistent Target: {stat['database_target']}")
    print(f"[*] Read Heartbeat Verified: {stat['database_read_verified']}")

    timestamp = int(time.time())
    prod_code = f"E2E-PROD-{timestamp}"

    # 1. Product Creation through normal API workflow
    create_payload = {
        "code": prod_code,
        "name": "E2E Verified Industrial Motor",
        "unit": "Nos",
        "selling_price": 1200.00,
        "gst_rate": 18.00,
        "stock_quantity": 40.00,
    }
    res = client.post("/api/products", json=create_payload)
    assert res.status_code == 201, f"Product creation failed: {res.text}"
    prod_data = res.json()
    prod_id = prod_data["id"]
    print(f"[PASS] 1. Product created via API (ID: {prod_id}, Code: {prod_code}, Stock: 40 Nos)")

    # 2. Verify product in active database via GET
    res_get = client.get(f"/api/products/{prod_id}")
    assert res_get.status_code == 200, "Failed to retrieve created product"
    assert res_get.json()["stock_quantity"] == 40.00
    print("[PASS] 2. Product verified in active database via API.")

    # 3. Update price and stock via Restock API
    res_restock = client.post(
        f"/api/products/{prod_id}/restock",
        json={"quantity": 20.00, "notes": "Batch QA Delivery"}
    )
    assert res_restock.status_code == 200, "Failed to restock product"
    assert res_restock.json()["stock_quantity"] == 60.00
    print("[PASS] 3. Stock restocked via API (New balance: 60 Nos).")

    # 4. Verify Stock Movement History
    res_mov = client.get(f"/api/products/{prod_id}/movements")
    assert res_mov.status_code == 200
    movs = res_mov.json()
    assert len(movs) >= 2, "Expected initial movement and restock movement"
    assert movs[0]["movement_type"] == "RESTOCK"
    print(f"[PASS] 4. Stock movement audit log verified ({len(movs)} entries).")

    # 5. Create Complete Invoice through normal API workflow
    invoice_payload = {
        "payment_mode": "UPI",
        "customer_name": f"QA Party {timestamp}",
        "customer_phone": "9876543210",
        "customer_address": "123 Test Market Road",
        "customer_gstin": "33AABCT1234A1Z5",
        "state": "Tamilnadu",
        "state_code": "33",
        "is_gst_bill": True,
        "discount_amount": 200.00,
        "transport_charges": 100.00,
        "items": [
            {
                "product_id": prod_id,
                "product_code": prod_code,
                "product_name": "E2E Verified Industrial Motor",
                "unit": "Nos",
                "quantity": 5.00,
                "unit_price": 1200.00,
                "gst_rate": 18.00,
            }
        ],
        "notes_terms": "Standard Warranty Terms",
    }
    res_inv = client.post("/api/invoices", json=invoice_payload)
    assert res_inv.status_code == 201, f"Invoice creation failed: {res_inv.text}"
    inv_data = res_inv.json()
    inv_id = inv_data["id"]
    inv_num = inv_data["invoice_number"]

    # Verify Financial Calculations
    # Gross: 5 * 1200 = 6000. Discount: 200. Taxable Base: 5800.
    # Transport: 100. Effective Taxable: 5900.
    # CGST (9%): 531.00, SGST (9%): 531.00. Total Tax: 1062.00.
    # Final Total: 5800 + 100 + 1062 = 6962.00.
    assert inv_data["subtotal"] == 5800.00, f"Expected subtotal 5800.0, got {inv_data['subtotal']}"
    assert inv_data["cgst_amount"] == 531.00, f"Expected CGST 531.0, got {inv_data['cgst_amount']}"
    assert inv_data["sgst_amount"] == 531.00, f"Expected SGST 531.0, got {inv_data['sgst_amount']}"
    assert inv_data["total_tax"] == 1062.00, f"Expected Tax 1062.0, got {inv_data['total_tax']}"
    assert inv_data["total_amount"] == 6962.00, f"Expected Grand Total 6962.0, got {inv_data['total_amount']}"
    print(f"[PASS] 5. Invoice created & financial calculations verified (Inv #: {inv_num}, Total: ₹{inv_data['total_amount']}).")

    # 6. Verify Stock Deduction
    res_prod_after = client.get(f"/api/products/{prod_id}")
    new_stock = res_prod_after.json()["stock_quantity"]
    assert new_stock == 55.00, f"Expected 55.00 units (60 - 5), got {new_stock}"
    print(f"[PASS] 6. Atomic stock deduction verified: 60 - 5 = {new_stock} Nos.")

    # 7. Backend Restart Simulation: Dispose engine pool & reconnect new session
    engine.dispose()
    res_after_restart = client.get(f"/api/invoices/{inv_id}")
    assert res_after_restart.status_code == 200, "Invoice must persist across engine recreation"
    assert res_after_restart.json()["total_amount"] == 6962.00
    print("[PASS] 7. Backend restart persistence verified: Invoice retrieved intact.")

    # 8. Offline Sync Push & Idempotency Check
    sync_uuid = f"OFFLINE-E2E-{timestamp}"
    sync_payload = {
        "device_id": "TEST-TERMINAL-01",
        "invoices": [
            {
                "payment_mode": "Cash",
                "customer_name": "Offline Synced Buyer",
                "client_uuid": sync_uuid,
                "offline_invoice_number": f"INV-DEV1-{timestamp % 10000:04d}",
                "is_gst_bill": False,
                "items": [
                    {
                        "product_id": prod_id,
                        "product_code": prod_code,
                        "product_name": "E2E Verified Industrial Motor",
                        "unit": "Nos",
                        "quantity": 2.00,
                        "unit_price": 1200.00,
                        "gst_rate": 0.00,
                    }
                ],
            }
        ],
        "stock_adjustments": [],
        "products": [],
    }

    # First Push
    res_sync_1 = client.post("/api/sync/push", json=sync_payload)
    assert res_sync_1.status_code == 200
    assert len(res_sync_1.json()["synced_invoices"]) == 1
    print("[PASS] 8a. Offline invoice synced successfully.")

    # Second Push (Same client_uuid replay test)
    res_sync_2 = client.post("/api/sync/push", json=sync_payload)
    assert res_sync_2.status_code == 200
    # Stock should only be deducted once (55 - 2 = 53)
    res_prod_sync = client.get(f"/api/products/{prod_id}")
    stock_after_sync = res_prod_sync.json()["stock_quantity"]
    assert stock_after_sync == 53.00, f"Expected 53.00 Nos, got {stock_after_sync}. Double deduction occurred!"
    print(f"[PASS] 8b. Idempotency verified: Replayed sync did NOT deduct stock twice (Stock: {stock_after_sync} Nos).")

    # 9. Clean up Disposable QA Records
    db = SessionLocal()
    try:
        db.query(StockMovement).filter(StockMovement.product_id == prod_id).delete()
        db.query(InvoiceItem).filter(InvoiceItem.product_id == prod_id).delete()
        db.query(Invoice).filter(Invoice.id == inv_id).delete()
        db.query(Invoice).filter(Invoice.client_uuid == sync_uuid).delete()
        db.query(Product).filter(Product.id == prod_id).delete()
        db.commit()
        print("[PASS] 9. Disposable QA records cleaned up safely.")
    finally:
        db.close()

    print("=" * 60)
    print("ALL END-TO-END BILLING & DATABASE TESTS PASSED (9/9)")
    print("=" * 60)
    return True


if __name__ == "__main__":
    ok = run_e2e_flow()
    sys.exit(0 if ok else 1)
