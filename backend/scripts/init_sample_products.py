#!/usr/bin/env python3
"""
Seeds sample inventory products into the database for immediate testing.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine, Base
from app.models import Product, ShopSettings
from app.services.stock_service import record_movement

SAMPLE_PRODUCTS = [
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
        "stock_quantity": 4.0,  # low stock for dashboard demo
    },
]


def seed_sample_products():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        added = 0
        for p_data in SAMPLE_PRODUCTS:
            existing = db.query(Product).filter(Product.code == p_data["code"]).first()
            if not existing:
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
                    notes="Initial test inventory seed",
                )
                added += 1

        db.commit()
        print(f"[✓] Successfully seeded {added} sample products.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_sample_products()
