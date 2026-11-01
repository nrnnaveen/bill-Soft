from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models import Product, StockMovement


def record_movement(
    db: Session,
    product_id: int,
    movement_type: str,
    quantity: float,
    balance_after: float,
    invoice_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> StockMovement:
    movement = StockMovement(
        product_id=product_id,
        invoice_id=invoice_id,
        movement_type=movement_type,
        quantity=quantity,
        balance_after=balance_after,
        notes=notes,
    )
    db.add(movement)
    return movement


def restock_product(
    db: Session,
    product_id: int,
    quantity: float,
    notes: Optional[str] = None,
) -> Product:
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Restock quantity must be greater than zero.")

    product = db.query(Product).filter(Product.id == product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    product.stock_quantity = round(product.stock_quantity + quantity, 2)
    record_movement(
        db=db,
        product_id=product.id,
        movement_type="RESTOCK",
        quantity=quantity,
        balance_after=product.stock_quantity,
        notes=notes or "Stock restocked",
    )
    db.commit()
    db.refresh(product)
    return product


def update_product_stock_direct(
    db: Session,
    product_id: int,
    new_quantity: float,
    notes: Optional[str] = None,
) -> Product:
    if new_quantity < 0:
        raise HTTPException(status_code=400, detail="Stock quantity cannot be negative.")

    product = db.query(Product).filter(Product.id == product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    diff = round(new_quantity - product.stock_quantity, 2)
    product.stock_quantity = new_quantity
    if diff != 0:
        record_movement(
            db=db,
            product_id=product.id,
            movement_type="ADJUSTMENT",
            quantity=diff,
            balance_after=new_quantity,
            notes=notes or "Manual inventory adjustment",
        )
    return product
