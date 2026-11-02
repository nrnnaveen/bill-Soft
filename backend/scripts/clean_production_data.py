#!/usr/bin/env python3
"""
Production Data Reset & Cleanup Script
Purges all QA test records, test invoices, and test stock movements.
Seeds clean inventory catalog products and resets next_invoice_number to 1.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine
from app.models import Product, Invoice, InvoiceItem, StockMovement, ShopSettings
from app.services.stock_service import record_movement

CLEAN_CATALOG_PRODUCTS = [
    {
        "code": "EL-001",
        "name": "LED 20W Tube Light",
        "unit": "Nos",
        "selling_price": 240.00,
        "gst_rate": 18.0,
        "stock_quantity": 45.0,
    },
    {
        "code": "EL-002",
        "name": "Ceiling Fan 1200mm",
        "unit": "Nos",
        "selling_price": 1850.00,
        "gst_rate": 18.0,
        "stock_quantity": 12.0,
    },
    {
        "code": "CAB-01",
        "name": "Copper Cable 2.5 sq mm (90m Roll)",
        "unit": "Box",
        "selling_price": 1450.00,
        "gst_rate": 18.0,
        "stock_quantity": 8.0,
    },
    {
        "code": "SW-005",
        "name": "Modular Switch 6A",
        "unit": "Pcs",
        "selling_price": 35.00,
        "gst_rate": 18.0,
        "stock_quantity": 150.0,
    },
    {
        "code": "CON-10",
        "name": "PVC Conduit Pipe 25mm (3m)",
        "unit": "Mtr",
        "selling_price": 65.00,
        "gst_rate": 18.0,
        "stock_quantity": 25.0,
    },
]


def clean_and_seed_production():
    db = SessionLocal()
    try:
        print("[1/5] Removing all stock movements...")
        deleted_sm = db.query(StockMovement).delete()
        print(f"      Deleted {deleted_sm} stock movements.")

        print("[2/5] Removing all invoice items and invoices...")
        deleted_items = db.query(InvoiceItem).delete()
        deleted_invoices = db.query(Invoice).delete()
        print(f"      Deleted {deleted_items} invoice items and {deleted_invoices} invoices.")

        print("[3/5] Removing old test products...")
        deleted_products = db.query(Product).delete()
        print(f"      Deleted {deleted_products} products.")

        print("[4/5] Resetting ShopSettings next_invoice_number counter to 1...")
        settings = db.query(ShopSettings).filter(ShopSettings.id == 1).first()
        if not settings:
            settings = ShopSettings(id=1, next_invoice_number=1)
            db.add(settings)
        else:
            settings.next_invoice_number = 1
        db.flush()

        print("[5/5] Seeding clean production catalog products...")
        for p_data in CLEAN_CATALOG_PRODUCTS:
            prod = Product(
                code=p_data["code"],
                name=p_data["name"],
                unit=p_data["unit"],
                selling_price=p_data["selling_price"],
                gst_rate=p_data["gst_rate"],
                stock_quantity=p_data["stock_quantity"],
                is_active=True,
            )
            db.add(prod)
            db.flush()
            record_movement(
                db=db,
                product_id=prod.id,
                movement_type="INITIAL",
                quantity=prod.stock_quantity,
                balance_after=prod.stock_quantity,
                notes="Initial production stock seed",
            )

        db.commit()
        print("[✓] Production database cleanup and initialization completed successfully!")

        # Verify
        p_count = db.query(Product).count()
        inv_count = db.query(Invoice).count()
        sm_count = db.query(StockMovement).count()
        settings = db.query(ShopSettings).filter(ShopSettings.id == 1).first()

        print("\n=== VERIFICATION SUMMARY ===")
        print(f"Active Products: {p_count}")
        print(f"Invoices: {inv_count}")
        print(f"Stock Movements: {sm_count}")
        print(f"Next Invoice Number: {settings.next_invoice_number if settings else 'N/A'}")
        for p in db.query(Product).all():
            print(f"  - [{p.code}] {p.name}: ₹{p.selling_price} | Stock: {p.stock_quantity} {p.unit} | GST: {p.gst_rate}%")

    finally:
        db.close()


if __name__ == "__main__":
    clean_and_seed_production()
