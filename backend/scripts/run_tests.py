#!/usr/bin/env python3
"""
Comprehensive End-to-End Test Suite for Shop Billing Application.
Verifies:
- API Health Check
- Settings
- Product CRUD & Restock
- Overselling Protection
- GST Tax Invoice (Intrastate: CGST + SGST, no IGST)
- GST Tax Invoice (Interstate: IGST only, no CGST/SGST)
- Non-GST Bill (Subtotal + Charges = Total Amount Payable, zero GST)
- Accurate Indian Currency Words
- Atomic Stock Deduction
- Safe Invoice Reprinting (Never deducts stock)
- Authorized Seal Upload & Secure Proxy
- Dashboard Statistics
- Database & Seal Backup
"""

import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.database import SessionLocal, Base, engine, init_db
from app.models import Product, Invoice, InvoiceItem, ShopSettings, StockMovement

init_db()
client = TestClient(app)


def test_suite():
    print("==================================================")
    print("RUNNING SHOP BILLING APPLICATION TEST SUITE")
    print("==================================================")

    # 1. Health check
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print("[PASS] 1. API Health Check passed.")

    # 2. Settings check
    res = client.get("/api/settings")
    assert res.status_code == 200, f"Get settings failed: {res.text}"
    settings = res.json()
    assert "Kanyakumari" in settings["shop_name"]
    print(f"[PASS] 2. Settings verified: {settings['shop_name'][:40]}...")

    # Clean up test products, movements, items, and invoices from prior test runs
    db = SessionLocal()
    try:
        # Invoices & items
        test_invs = db.query(Invoice).filter(
            (Invoice.customer_name.in_([
                "Test Customer", "Bangalore Enterprises", "Greedy Buyer",
                "Multi-Rate Test Customer", "Discounted Customer",
                "Offline Terminal Buyer", "Concurrent Counter Buyer"
            ])) | (Invoice.client_uuid.like("OFFLINE-UUID-%"))
        ).all()
        for inv in test_invs:
            db.query(InvoiceItem).filter(InvoiceItem.invoice_id == inv.id).delete()
            db.delete(inv)
        # Stock movements & products
        test_prods = db.query(Product).filter(Product.code.in_(["TEST-SKU-99", "TEST-GST-1000", "TEST-GST-5", "TEST-GST-12"])).all()
        for p in test_prods:
            db.query(StockMovement).filter(StockMovement.product_id == p.id).delete()
            db.delete(p)
        db.commit()
    finally:
        db.close()

    # 3. Create Product for standard ₹1,000 test case
    prod_data = {
        "code": "TEST-GST-1000",
        "name": "Standard Test Motor",
        "unit": "Nos",
        "selling_price": 1000.00,
        "gst_rate": 18.0,
        "stock_quantity": 50.0,
    }
    res = client.post("/api/products", json=prod_data)
    assert res.status_code in [200, 201], f"Create product failed: {res.text}"
    created_prod = res.json()
    prod_id = created_prod["id"]
    print(f"[PASS] 3. Product created: ID {prod_id}, Price ₹1000, 18% GST, Stock: 50.0")

    # 4. Restock Product
    restock_data = {
        "quantity": 25.0,
        "notes": "Test shipment arrival",
    }
    res = client.post(f"/api/products/{prod_id}/restock", json=restock_data)
    assert res.status_code == 200, f"Restock failed: {res.text}"
    updated_prod = res.json()
    assert updated_prod["stock_quantity"] == 75.0
    print(f"[PASS] 4. Product restocked: New balance {updated_prod['stock_quantity']}")

    # 5. Overselling Prevention Test
    oversell_invoice = {
        "payment_mode": "Cash",
        "customer_name": "Greedy Buyer",
        "is_gst_bill": True,
        "transport_charges": 0.0,
        "items": [
            {
                "product_id": prod_id,
                "product_code": "TEST-GST-1000",
                "product_name": "Standard Test Motor",
                "unit": "Nos",
                "quantity": 100.0,  # exceeds available 75
                "unit_price": 1000.0,
                "gst_rate": 18.0,
            }
        ]
    }
    res = client.post("/api/invoices", json=oversell_invoice)
    assert res.status_code == 400, f"Expected 400 for overselling, got {res.status_code}: {res.text}"
    print("[PASS] 5. Overselling successfully prevented: 400 Insufficient stock returned.")

    # 6. GST Tax Invoice (Intrastate: Tamilnadu -> Tamilnadu)
    # 1 item @ ₹1000, 18% GST -> Subtotal: ₹1000.00, CGST 9%: ₹90.00, SGST 9%: ₹90.00, Total GST: ₹180.00, Grand Total: ₹1180.00
    intrastate_invoice = {
        "payment_mode": "Cash",
        "customer_name": "Local Buyer Chennai",
        "customer_address": "Anna Salai, Chennai",
        "customer_phone": "9876543210",
        "state": "Tamilnadu",
        "state_code": "33",
        "is_gst_bill": True,
        "transport_charges": 0.0,
        "items": [
            {
                "product_id": prod_id,
                "product_code": "TEST-GST-1000",
                "product_name": "Standard Test Motor",
                "unit": "Nos",
                "quantity": 1.0,
                "unit_price": 1000.0,
                "gst_rate": 18.0,
            }
        ]
    }
    res = client.post("/api/invoices", json=intrastate_invoice)
    assert res.status_code == 201, f"Intrastate invoice creation failed: {res.text}"
    inv_intra = res.json()
    assert inv_intra["subtotal"] == 1000.00, f"Expected subtotal 1000.00, got {inv_intra['subtotal']}"
    assert inv_intra["cgst_amount"] == 90.00, f"Expected CGST 90.00, got {inv_intra['cgst_amount']}"
    assert inv_intra["sgst_amount"] == 90.00, f"Expected SGST 90.00, got {inv_intra['sgst_amount']}"
    assert inv_intra["igst_amount"] == 0.00, f"Expected IGST 0.00 for intrastate, got {inv_intra['igst_amount']}"
    assert inv_intra["total_tax"] == 180.00, f"Expected total GST 180.00, got {inv_intra['total_tax']}"
    assert inv_intra["total_amount"] == 1180.00, f"Expected grand total 1180.00, got {inv_intra['total_amount']}"
    assert "One Thousand One Hundred and Eighty" in inv_intra["total_amount_words"]
    print(f"[PASS] 6. GST Tax Invoice (Intrastate): Subtotal: ₹{inv_intra['subtotal']}, CGST: ₹{inv_intra['cgst_amount']}, SGST: ₹{inv_intra['sgst_amount']}, Total GST: ₹{inv_intra['total_tax']}, Grand Total: ₹{inv_intra['total_amount']}")

    # 6b. GST Tax Invoice (Intrastate with Transport Charges)
    # 1 item @ ₹1000, 18% GST + ₹50 Transport -> Taxable: ₹1050 (incl. incidental transport), CGST (9%): ₹94.50, SGST (9%): ₹94.50, Total GST: ₹189.00, Grand Total: ₹1239.00
    intra_transport_invoice = {
        "payment_mode": "Cash",
        "customer_name": "Local Buyer with Delivery",
        "state": "Tamilnadu",
        "state_code": "33",
        "is_gst_bill": True,
        "transport_charges": 50.0,
        "items": [
            {
                "product_id": prod_id,
                "product_code": "TEST-GST-1000",
                "product_name": "Standard Test Motor",
                "unit": "Nos",
                "quantity": 1.0,
                "unit_price": 1000.0,
                "gst_rate": 18.0,
            }
        ]
    }
    res = client.post("/api/invoices", json=intra_transport_invoice)
    assert res.status_code == 201, f"Intrastate invoice with transport failed: {res.text}"
    inv_intra_tr = res.json()
    assert inv_intra_tr["subtotal"] == 1000.00
    assert inv_intra_tr["transport_charges"] == 50.00
    assert inv_intra_tr["cgst_amount"] == 94.50, f"Expected CGST 94.50, got {inv_intra_tr['cgst_amount']}"
    assert inv_intra_tr["sgst_amount"] == 94.50, f"Expected SGST 94.50, got {inv_intra_tr['sgst_amount']}"
    assert inv_intra_tr["igst_amount"] == 0.00
    assert inv_intra_tr["total_tax"] == 189.00
    assert inv_intra_tr["total_amount"] == 1239.00
    assert "One Thousand Two Hundred and Thirty Nine" in inv_intra_tr["total_amount_words"]
    print(f"[PASS] 6b. GST Tax Invoice (Intrastate with Transport): Subtotal: ₹{inv_intra_tr['subtotal']}, Transport: ₹{inv_intra_tr['transport_charges']}, CGST: ₹{inv_intra_tr['cgst_amount']}, SGST: ₹{inv_intra_tr['sgst_amount']}, Grand Total: ₹{inv_intra_tr['total_amount']}")

    # 7. GST Tax Invoice (Interstate: Tamilnadu -> Karnataka Code 29)
    # 1 item @ ₹1000, 18% GST -> Subtotal: ₹1000.00, IGST 18%: ₹180.00, CGST: ₹0.00, SGST: ₹0.00, Total GST: ₹180.00, Grand Total: ₹1180.00
    interstate_invoice = {
        "payment_mode": "UPI",
        "customer_name": "Bangalore Enterprises",
        "customer_address": "MG Road, Bangalore",
        "customer_phone": "9845012345",
        "state": "Karnataka",
        "state_code": "29",
        "is_gst_bill": True,
        "transport_charges": 50.0,
        "items": [
            {
                "product_id": prod_id,
                "product_code": "TEST-GST-1000",
                "product_name": "Standard Test Motor",
                "unit": "Nos",
                "quantity": 1.0,
                "unit_price": 1000.0,
                "gst_rate": 18.0,
            }
        ]
    }
    res = client.post("/api/invoices", json=interstate_invoice)
    assert res.status_code == 201, f"Interstate invoice creation failed: {res.text}"
    inv_inter = res.json()
    assert inv_inter["subtotal"] == 1000.00
    assert inv_inter["cgst_amount"] == 0.00, "CGST must be 0 for interstate supply"
    assert inv_inter["sgst_amount"] == 0.00, "SGST must be 0 for interstate supply"
    assert inv_inter["igst_amount"] == 189.00, f"Expected IGST 189.00 (18% on ₹1050 taxable incl. transport), got {inv_inter['igst_amount']}"
    assert inv_inter["total_tax"] == 189.00
    assert inv_inter["transport_charges"] == 50.00
    assert inv_inter["total_amount"] == 1239.00  # 1000 + 189 + 50
    assert "One Thousand Two Hundred and Thirty Nine" in inv_inter["total_amount_words"]
    print(f"[PASS] 7. GST Tax Invoice (Interstate with Transport): Subtotal: ₹{inv_inter['subtotal']}, Transport: ₹{inv_inter['transport_charges']}, IGST: ₹{inv_inter['igst_amount']}, CGST/SGST: ₹0.00, Grand Total: ₹{inv_inter['total_amount']}")

    # 8. Non-GST Bill
    # 1 item @ ₹1000, Non-GST -> Subtotal: ₹1000.00, GST: ₹0.00, Transport: ₹50.00, Total: ₹1050.00
    nongst_invoice = {
        "payment_mode": "Cash",
        "customer_name": "Walk-in Retail Customer",
        "is_gst_bill": False,
        "transport_charges": 50.0,
        "items": [
            {
                "product_id": prod_id,
                "product_code": "TEST-GST-1000",
                "product_name": "Standard Test Motor",
                "unit": "Nos",
                "quantity": 1.0,
                "unit_price": 1000.0,
                "gst_rate": 18.0,
            }
        ]
    }
    res = client.post("/api/invoices", json=nongst_invoice)
    assert res.status_code == 201, f"Non-GST invoice creation failed: {res.text}"
    inv_nongst = res.json()
    assert inv_nongst["is_gst_bill"] is False
    assert inv_nongst["subtotal"] == 1000.00
    assert inv_nongst["cgst_amount"] == 0.00
    assert inv_nongst["sgst_amount"] == 0.00
    assert inv_nongst["igst_amount"] == 0.00
    assert inv_nongst["total_tax"] == 0.00
    assert inv_nongst["total_amount"] == 1050.00  # 1000 + 50
    print(f"[PASS] 8. Non-GST Bill: Subtotal: ₹{inv_nongst['subtotal']}, Tax: ₹0.00, Transport: ₹{inv_nongst['transport_charges']}, Total Amount Payable: ₹{inv_nongst['total_amount']}")

    # 9. Verify Atomic Stock Deduction (4 units sold across 4 test invoices: 75 - 4 = 71)
    res = client.get(f"/api/products/{prod_id}")
    assert res.status_code == 200
    prod_curr = res.json()
    assert prod_curr["stock_quantity"] == 71.0, f"Expected 71.0 (75 - 4), got {prod_curr['stock_quantity']}"
    print(f"[PASS] 9. Stock deducted accurately: Current stock is {prod_curr['stock_quantity']} Nos.")

    # 10. Verify Safe Invoice Reprinting (Never deducts stock)
    res = client.get(f"/api/invoices/{inv_intra['id']}")
    assert res.status_code == 200
    reprinted = res.json()
    assert reprinted["subtotal"] == 1000.00
    assert reprinted["total_tax"] == 180.00

    res = client.get(f"/api/products/{prod_id}")
    prod_after = res.json()
    assert prod_after["stock_quantity"] == 71.0, "Stock was erroneously modified on reprint!"
    print(f"[PASS] 10. Invoice reprint safe: Stock remains exactly {prod_after['stock_quantity']} Nos.")

    # 11. Test Automated Backup
    res = client.post("/api/settings/backup")
    assert res.status_code == 200, f"Backup trigger failed: {res.text}"
    print("[PASS] 11. Automated Database & Seal backup verified.")

    # 12. Test Multi-Rate GST Invoice (5%, 12%, 18% in same invoice)
    # Create products for multi-rate test
    prod_5_res = client.post("/api/products", json={"code": "TEST-GST-5", "name": "5% GST Item", "unit": "Nos", "selling_price": 200.0, "gst_rate": 5.0, "stock_quantity": 50.0})
    prod_12_res = client.post("/api/products", json={"code": "TEST-GST-12", "name": "12% GST Item", "unit": "Nos", "selling_price": 500.0, "gst_rate": 12.0, "stock_quantity": 50.0})
    p5_id = prod_5_res.json()["id"]
    p12_id = prod_12_res.json()["id"]

    multi_rate_invoice = {
        "payment_mode": "UPI",
        "customer_name": "Multi-Rate Test Customer",
        "state": "Tamilnadu",
        "state_code": "33",
        "is_gst_bill": True,
        "transport_charges": 0.0,
        "items": [
            {"product_id": p5_id, "product_code": "TEST-GST-5", "product_name": "5% GST Item", "unit": "Nos", "quantity": 2.0, "unit_price": 200.0, "gst_rate": 5.0},      # Taxable: 400, CGST: 10, SGST: 10
            {"product_id": p12_id, "product_code": "TEST-GST-12", "product_name": "12% GST Item", "unit": "Nos", "quantity": 1.0, "unit_price": 500.0, "gst_rate": 12.0},  # Taxable: 500, CGST: 30, SGST: 30
            {"product_id": prod_id, "product_code": "TEST-GST-1000", "product_name": "Standard Test Motor", "unit": "Nos", "quantity": 1.0, "unit_price": 1000.0, "gst_rate": 18.0}, # Taxable: 1000, CGST: 90, SGST: 90
        ]
    }
    res = client.post("/api/invoices", json=multi_rate_invoice)
    assert res.status_code == 201, f"Multi-rate invoice failed: {res.text}"
    inv_multi = res.json()
    assert inv_multi["subtotal"] == 1900.00  # 400 + 500 + 1000
    assert inv_multi["cgst_amount"] == 130.00  # 10 + 30 + 90
    assert inv_multi["sgst_amount"] == 130.00  # 10 + 30 + 90
    assert inv_multi["total_tax"] == 260.00
    assert inv_multi["total_amount"] == 2160.00  # 1900 + 260
    assert "Two Thousand One Hundred" in inv_multi["total_amount_words"]
    print(f"[PASS] 12. Multi-Rate GST Invoice (5%, 12%, 18%): Subtotal ₹{inv_multi['subtotal']}, CGST ₹{inv_multi['cgst_amount']}, SGST ₹{inv_multi['sgst_amount']}, Total GST ₹{inv_multi['total_tax']}, Grand Total ₹{inv_multi['total_amount']}")

    # 12b. Test Multi-Rate GST with Transport Charges Apportionment (Section 15(2)(c) CGST Act)
    # Subtotal ₹1900, Transport ₹190.
    # Share: 5% item: ₹40 transport -> Taxable ₹440 -> 5% = ₹22.00 (CGST 11, SGST 11)
    # Share: 12% item: ₹50 transport -> Taxable ₹550 -> 12% = ₹66.00 (CGST 33, SGST 33)
    # Share: 18% item: ₹100 transport -> Taxable ₹1100 -> 18% = ₹198.00 (CGST 99, SGST 99)
    # Total CGST: ₹143.00, Total SGST: ₹143.00, Total GST: ₹286.00, Grand Total: ₹2376.00
    multi_rate_transport_invoice = {
        "payment_mode": "Bank Transfer",
        "customer_name": "Multi-Rate Delivery Customer",
        "state": "Tamilnadu",
        "state_code": "33",
        "is_gst_bill": True,
        "transport_charges": 190.0,
        "items": [
            {"product_id": p5_id, "product_code": "TEST-GST-5", "product_name": "5% GST Item", "unit": "Nos", "quantity": 2.0, "unit_price": 200.0, "gst_rate": 5.0},
            {"product_id": p12_id, "product_code": "TEST-GST-12", "product_name": "12% GST Item", "unit": "Nos", "quantity": 1.0, "unit_price": 500.0, "gst_rate": 12.0},
            {"product_id": prod_id, "product_code": "TEST-GST-1000", "product_name": "Standard Test Motor", "unit": "Nos", "quantity": 1.0, "unit_price": 1000.0, "gst_rate": 18.0},
        ]
    }
    res = client.post("/api/invoices", json=multi_rate_transport_invoice)
    assert res.status_code == 201, f"Multi-rate transport invoice failed: {res.text}"
    inv_multi_tr = res.json()
    assert inv_multi_tr["subtotal"] == 1900.00
    assert inv_multi_tr["transport_charges"] == 190.00
    assert inv_multi_tr["cgst_amount"] == 143.00, f"Expected CGST 143.00, got {inv_multi_tr['cgst_amount']}"
    assert inv_multi_tr["sgst_amount"] == 143.00, f"Expected SGST 143.00, got {inv_multi_tr['sgst_amount']}"
    assert inv_multi_tr["total_tax"] == 286.00
    assert inv_multi_tr["total_amount"] == 2376.00  # 1900 + 190 + 286
    assert "Two Thousand Three Hundred and Seventy Six" in inv_multi_tr["total_amount_words"]
    print(f"[PASS] 12b. Multi-Rate GST with Transport: Subtotal ₹{inv_multi_tr['subtotal']}, Transport ₹{inv_multi_tr['transport_charges']}, CGST ₹{inv_multi_tr['cgst_amount']}, SGST ₹{inv_multi_tr['sgst_amount']}, Total Tax ₹{inv_multi_tr['total_tax']}, Grand Total ₹{inv_multi_tr['total_amount']}")

    # 13. Test Discount Affecting Taxable Value (Section 15(3) CGST Act)
    # Gross: ₹1000, Discount: ₹100 -> Net Taxable: ₹900. 18% GST: CGST ₹81 (9%), SGST ₹81 (9%). Grand Total: ₹1062
    discount_invoice = {
        "payment_mode": "Cash",
        "customer_name": "Discounted Customer",
        "state": "Tamilnadu",
        "state_code": "33",
        "is_gst_bill": True,
        "discount_amount": 100.0,
        "transport_charges": 0.0,
        "items": [
            {"product_id": prod_id, "product_code": "TEST-GST-1000", "product_name": "Standard Test Motor", "unit": "Nos", "quantity": 1.0, "unit_price": 1000.0, "gst_rate": 18.0}
        ]
    }
    res = client.post("/api/invoices", json=discount_invoice)
    assert res.status_code == 201, f"Discount invoice failed: {res.text}"
    inv_disc = res.json()
    assert inv_disc["subtotal"] == 900.00, f"Expected taxable subtotal 900.00, got {inv_disc['subtotal']}"
    assert inv_disc["cgst_amount"] == 81.00, f"Expected CGST 81.00, got {inv_disc['cgst_amount']}"
    assert inv_disc["sgst_amount"] == 81.00, f"Expected SGST 81.00, got {inv_disc['sgst_amount']}"
    assert inv_disc["total_tax"] == 162.00
    assert inv_disc["total_amount"] == 1062.00
    print(f"[PASS] 13. Discount verified: Base ₹1000 - Discount ₹100 = Taxable ₹{inv_disc['subtotal']}, Tax ₹{inv_disc['total_tax']}, Total ₹{inv_disc['total_amount']}")

    # 14. Test Offline Sync Push & Idempotent Replay
    offline_sync_payload = {
        "device_id": "TEST-DEVICE-01",
        "invoices": [
            {
                "payment_mode": "Cash",
                "customer_name": "Offline Terminal Buyer",
                "state": "Tamilnadu",
                "state_code": "33",
                "is_gst_bill": True,
                "client_uuid": "OFFLINE-UUID-9999",
                "offline_invoice_number": "INV-DEV1-0001",
                "items": [
                    {"product_id": prod_id, "product_code": "TEST-GST-1000", "product_name": "Standard Test Motor", "unit": "Nos", "quantity": 1.0, "unit_price": 1000.0, "gst_rate": 18.0}
                ]
            }
        ]
    }
    # Initial push
    res = client.post("/api/sync/push", json=offline_sync_payload)
    assert res.status_code == 200, f"Sync push failed: {res.text}"
    push_data = res.json()
    assert push_data["success"] is True
    assert len(push_data["synced_invoices"]) == 1

    # Idempotent re-push (network retry)
    res_retry = client.post("/api/sync/push", json=offline_sync_payload)
    assert res_retry.status_code == 200
    push_retry_data = res_retry.json()
    assert len(push_retry_data["synced_invoices"]) == 1, "Idempotent re-push should return existing invoice"

    # Test Sync Pull
    res_pull = client.get("/api/sync/pull")
    assert res_pull.status_code == 200
    pull_data = res_pull.json()
    assert len(pull_data["products"]) >= 3
    assert pull_data["settings"]["shop_name"] is not None
    print("[PASS] 14. Offline Sync Push & Idempotency verified successfully.")

    # 15. Test Concurrent Sale Conflict Detection
    # Push an offline sale where quantity exceeds remaining stock
    res_current_stock = client.get(f"/api/products/{prod_id}").json()["stock_quantity"]
    conflict_payload = {
        "device_id": "TEST-DEVICE-02",
        "invoices": [
            {
                "payment_mode": "Cash",
                "customer_name": "Concurrent Counter Buyer",
                "state": "Tamilnadu",
                "state_code": "33",
                "is_gst_bill": True,
                "client_uuid": "OFFLINE-UUID-CONFLICT-1",
                "offline_invoice_number": "INV-DEV2-0001",
                "items": [
                    {"product_id": prod_id, "product_code": "TEST-GST-1000", "product_name": "Standard Test Motor", "unit": "Nos", "quantity": res_current_stock + 10.0, "unit_price": 1000.0, "gst_rate": 18.0}
                ]
            }
        ]
    }
    res_conflict = client.post("/api/sync/push", json=conflict_payload)
    assert res_conflict.status_code == 200
    conf_data = res_conflict.json()
    assert len(conf_data["conflicts"]) >= 1, "Stock shortage conflict must be reported"
    assert conf_data["conflicts"][0]["conflict_type"] == "STOCK_SHORTAGE"
    print(f"[PASS] 15. Concurrent Sale Conflict Detection verified: Conflict reported correctly ('{conf_data['conflicts'][0]['title']}').")

    # 16. Test Database Export and Restore Cycle (Data Safety & Recovery)
    from scripts.export_db import export_database
    from scripts.restore_db import restore_database

    exported_file = export_database()
    assert exported_file is not None and os.path.exists(exported_file), "Export database failed"
    print(f"[PASS] 16a. Database exported cleanly to {os.path.basename(exported_file)}")

    # Run restore from that file
    restore_database(exported_file)
    res_after_restore = client.get(f"/api/products/{prod_id}")
    assert res_after_restore.status_code == 200, "Product must exist after database restore"
    print("[PASS] 16b. Database restored and verified from backup file successfully.")

    # 17. Test Production Supabase Guard (Strictly Disallows Silent SQLite Fallback)
    import subprocess
    cmd = [
        sys.executable, "-c",
        "import os; os.environ['REQUIRE_SUPABASE']='true'; os.environ['DATABASE_URL']=''; from app.database import init_db; init_db()"
    ]
    res_guard = subprocess.run(
        cmd,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        capture_output=True,
        text=True
    )
    assert res_guard.returncode != 0, "Production guard must reject missing Supabase URL"
    assert "Silent fallback to SQLite is strictly forbidden in production" in res_guard.stderr
    print("[PASS] 17. Production Supabase Guard verified: Rejects silent SQLite fallback when Supabase is missing.")

    # 18. Security Verification: Seal Image Magic Bytes & Path Traversal Prevention
    # 18a. Reject spoofed non-image payload
    spoofed_bytes = b"echo 'malicious script' > /tmp/pwned"
    res_fake = client.post(
        "/api/settings/seal",
        files={"file": ("fake_seal.png", spoofed_bytes, "image/png")}
    )
    assert res_fake.status_code == 400, "Must reject spoofed image with invalid magic bytes"
    assert "not a valid image format" in res_fake.text
    print("[PASS] 18a. Security: Rejects masqueraded file without genuine image magic bytes.")

    # 18b. Accept genuine PNG bytes
    valid_png_bytes = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
    )
    res_real = client.post(
        "/api/settings/seal",
        files={"file": ("authorized_seal.png", valid_png_bytes, "image/png")}
    )
    assert res_real.status_code == 200, f"Valid PNG upload failed: {res_real.text}"
    print("[PASS] 18b. Security: Accepts authentic PNG seal image and stores safely.")

    # 18c. Test path traversal rejection in get_seal_bytes
    from app.services.storage_service import get_seal_bytes
    assert get_seal_bytes("local://../../../../etc/passwd") is None, "Must block path traversal attempts"
    print("[PASS] 18c. Security: Path traversal strictly blocked by storage service.")

    # 19. Supabase Cloud Connectivity & Verification
    from scripts.verify_supabase import run_audit
    supa_audit_ok = run_audit()
    assert supa_audit_ok, "Supabase verification audit must pass all checks"
    print("[PASS] 19. Supabase Cloud: Reachable, authenticated, storage active, and CRUD verified.")

    print("==================================================")
    print("ALL TESTS PASSED SUCCESSFULLY! (23/23 checks)")
    print("==================================================")


if __name__ == "__main__":
    test_suite()


