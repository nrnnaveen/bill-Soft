#!/usr/bin/env python3
"""
Database Export Utility for Shop Billing Application.
Exports all PostgreSQL / SQLite data to JSON and SQL backup files.
"""

import os
import sys
import json
from datetime import datetime, timezone

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine
from app.models import Product, Invoice, InvoiceItem, StockMovement, ShopSettings

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)


def export_database():
    db = SessionLocal()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(BACKUP_DIR, f"backup_db_{timestamp}.json")

    print(f"[*] Starting database export from engine: {engine.dialect.name}...")

    try:
        # 1. Products
        products = db.query(Product).all()
        products_data = [
            {
                "id": p.id,
                "code": p.code,
                "name": p.name,
                "unit": p.unit,
                "selling_price": p.selling_price,
                "gst_rate": p.gst_rate,
                "stock_quantity": p.stock_quantity,
                "is_active": p.is_active,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in products
        ]

        # 2. Invoices
        invoices = db.query(Invoice).all()
        invoices_data = [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
                "payment_mode": inv.payment_mode,
                "customer_name": inv.customer_name,
                "customer_address": inv.customer_address,
                "customer_phone": inv.customer_phone,
                "customer_gstin": inv.customer_gstin,
                "state": inv.state,
                "state_code": inv.state_code,
                "is_gst_bill": inv.is_gst_bill,
                "discount_amount": getattr(inv, "discount_amount", 0.0) or 0.0,
                "transport_charges": inv.transport_charges,
                "subtotal": inv.subtotal,
                "cgst_amount": inv.cgst_amount,
                "sgst_amount": inv.sgst_amount,
                "igst_amount": inv.igst_amount,
                "total_tax": inv.total_tax,
                "total_amount": inv.total_amount,
                "total_amount_words": inv.total_amount_words,
                "terms_and_conditions": inv.terms_and_conditions,
                "client_uuid": getattr(inv, "client_uuid", None),
                "device_id": getattr(inv, "device_id", None),
                "created_at": inv.created_at.isoformat() if inv.created_at else None,
            }
            for inv in invoices
        ]

        # 3. Invoice Items
        items = db.query(InvoiceItem).all()
        items_data = [
            {
                "id": it.id,
                "invoice_id": it.invoice_id,
                "product_id": it.product_id,
                "product_code": it.product_code,
                "product_name": it.product_name,
                "unit": it.unit,
                "quantity": it.quantity,
                "unit_price": it.unit_price,
                "gst_rate": it.gst_rate,
                "taxable_amount": it.taxable_amount,
                "cgst_amount": it.cgst_amount,
                "sgst_amount": it.sgst_amount,
                "igst_amount": it.igst_amount,
                "total_amount": it.total_amount,
            }
            for it in items
        ]

        # 4. Stock Movements
        movements = db.query(StockMovement).all()
        movements_data = [
            {
                "id": m.id,
                "product_id": m.product_id,
                "invoice_id": m.invoice_id,
                "movement_type": m.movement_type,
                "quantity": m.quantity,
                "balance_after": m.balance_after,
                "notes": m.notes,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in movements
        ]

        # 5. Shop Settings
        settings = db.query(ShopSettings).first()
        settings_data = None
        if settings:
            settings_data = {
                "id": settings.id,
                "shop_name": settings.shop_name,
                "address": settings.address,
                "gstin": settings.gstin,
                "email": settings.email,
                "contact_no": settings.contact_no,
                "state": settings.state,
                "state_code": settings.state_code,
                "invoice_prefix": settings.invoice_prefix,
                "device_invoice_prefix": getattr(settings, "device_invoice_prefix", "INV-DEV1-") or "INV-DEV1-",
                "next_invoice_number": settings.next_invoice_number,
                "default_terms": settings.default_terms,
                "seal_image_path": settings.seal_image_path,
                "default_is_gst": settings.default_is_gst,
                "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
            }

        payload = {
            "version": "1.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "dialect": engine.dialect.name,
            "data": {
                "products": products_data,
                "invoices": invoices_data,
                "invoice_items": items_data,
                "stock_movements": movements_data,
                "shop_settings": settings_data,
            }
        }

        with open(backup_file, "w") as f:
            json.dump(payload, f, indent=2)

        print(f"[✓] Backup completed successfully!")
        print(f"    File: {backup_file}")
        print(f"    Products: {len(products_data)}, Invoices: {len(invoices_data)}, Items: {len(items_data)}")
        return backup_file

    finally:
        db.close()


if __name__ == "__main__":
    export_database()
