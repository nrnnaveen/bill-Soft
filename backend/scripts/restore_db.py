#!/usr/bin/env python3
"""
Database Restore Utility for Shop Billing Application.
Restores products, invoices, items, stock movements, and settings from a JSON backup.
"""

import os
import sys
import json
from datetime import datetime
from sqlalchemy.orm import Session

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine, Base
from app.models import Product, Invoice, InvoiceItem, StockMovement, ShopSettings


def parse_datetime(val):
    if not val:
        return None
    try:
        return datetime.fromisoformat(val)
    except Exception:
        return None


def restore_database(backup_file_path: str):
    if not os.path.exists(backup_file_path):
        print(f"[!] Error: Backup file not found: {backup_file_path}")
        sys.exit(1)

    print(f"[*] Reading backup file: {backup_file_path}")
    with open(backup_file_path, "r") as f:
        payload = json.load(f)

    data = payload.get("data", {})
    db = SessionLocal()

    print(f"[*] Restoring into database dialect: {engine.dialect.name}...")

    try:
        # Ensure tables exist
        Base.metadata.create_all(bind=engine)

        # Clear existing data in correct foreign key order
        db.query(StockMovement).delete()
        db.query(InvoiceItem).delete()
        db.query(Invoice).delete()
        db.query(Product).delete()
        db.query(ShopSettings).delete()
        db.flush()

        # 1. Restore Products
        for p in data.get("products", []):
            prod = Product(
                id=p["id"],
                code=p["code"],
                name=p["name"],
                unit=p["unit"],
                selling_price=p["selling_price"],
                gst_rate=p["gst_rate"],
                stock_quantity=p["stock_quantity"],
                is_active=p.get("is_active", True),
                created_at=parse_datetime(p.get("created_at")),
                updated_at=parse_datetime(p.get("updated_at")),
            )
            db.add(prod)
        db.flush()

        # 2. Restore Invoices
        for inv in data.get("invoices", []):
            invoice = Invoice(
                id=inv["id"],
                invoice_number=inv["invoice_number"],
                invoice_date=parse_datetime(inv.get("invoice_date")),
                payment_mode=inv.get("payment_mode", "Cash"),
                customer_name=inv.get("customer_name"),
                customer_address=inv.get("customer_address"),
                customer_phone=inv.get("customer_phone"),
                customer_gstin=inv.get("customer_gstin"),
                state=inv.get("state", "Tamilnadu"),
                state_code=inv.get("state_code", "33"),
                is_gst_bill=inv.get("is_gst_bill", True),
                discount_amount=inv.get("discount_amount", 0.0) or 0.0,
                transport_charges=inv.get("transport_charges", 0.0),
                subtotal=inv.get("subtotal", 0.0),
                cgst_amount=inv.get("cgst_amount", 0.0),
                sgst_amount=inv.get("sgst_amount", 0.0),
                igst_amount=inv.get("igst_amount", 0.0),
                total_tax=inv.get("total_tax", 0.0),
                total_amount=inv.get("total_amount", 0.0),
                total_amount_words=inv.get("total_amount_words"),
                terms_and_conditions=inv.get("terms_and_conditions"),
                client_uuid=inv.get("client_uuid"),
                device_id=inv.get("device_id"),
                created_at=parse_datetime(inv.get("created_at")),
            )
            db.add(invoice)
        db.flush()

        # 3. Restore Invoice Items
        for it in data.get("invoice_items", []):
            item = InvoiceItem(
                id=it["id"],
                invoice_id=it["invoice_id"],
                product_id=it.get("product_id"),
                product_code=it["product_code"],
                product_name=it["product_name"],
                unit=it["unit"],
                quantity=it["quantity"],
                unit_price=it["unit_price"],
                gst_rate=it.get("gst_rate", 0.0),
                taxable_amount=it["taxable_amount"],
                cgst_amount=it.get("cgst_amount", 0.0),
                sgst_amount=it.get("sgst_amount", 0.0),
                igst_amount=it.get("igst_amount", 0.0),
                total_amount=it["total_amount"],
            )
            db.add(item)
        db.flush()

        # 4. Restore Stock Movements
        for sm in data.get("stock_movements", []):
            movement = StockMovement(
                id=sm["id"],
                product_id=sm["product_id"],
                invoice_id=sm.get("invoice_id"),
                movement_type=sm["movement_type"],
                quantity=sm["quantity"],
                balance_after=sm["balance_after"],
                notes=sm.get("notes"),
                created_at=parse_datetime(sm.get("created_at")),
            )
            db.add(movement)
        db.flush()

        # 5. Restore Shop Settings
        s = data.get("shop_settings")
        if s:
            settings = ShopSettings(
                id=s.get("id", 1),
                shop_name=s["shop_name"],
                address=s["address"],
                gstin=s.get("gstin"),
                email=s.get("email"),
                contact_no=s.get("contact_no"),
                state=s.get("state", "Tamilnadu"),
                state_code=s.get("state_code", "33"),
                invoice_prefix=s.get("invoice_prefix", "INV-"),
                device_invoice_prefix=s.get("device_invoice_prefix", "INV-DEV1-"),
                next_invoice_number=s.get("next_invoice_number", 1),
                default_terms=s.get("default_terms", ""),
                seal_image_path=s.get("seal_image_path"),
                default_is_gst=s.get("default_is_gst", True),
                updated_at=parse_datetime(s.get("updated_at")),
            )
            db.add(settings)

        db.commit()
        print(f"[✓] Database successfully restored from {backup_file_path}!")

    except Exception as e:
        db.rollback()
        print(f"[!] Restore failed: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 restore_db.py <path_to_backup_json>")
        sys.exit(1)
    restore_database(sys.argv[1])
