from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import Product, StockMovement
from ..schemas import ProductCreate, ProductUpdate, ProductOut, ProductRestock, StockMovementOut
from ..services.stock_service import restock_product, record_movement

router = APIRouter(prefix="/api/products", tags=["Products"])


@router.get("", response_model=List[ProductOut])
def list_products(
    search: Optional[str] = Query(None, description="Search by name or code"),
    active_only: bool = Query(True, description="Filter only active products"),
    db: Session = Depends(get_db),
):
    query = db.query(Product)
    if active_only:
        query = query.filter(Product.is_active == True)
    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Product.name.ilike(search_term),
                Product.code.ilike(search_term)
            )
        )
    return query.order_by(Product.name.asc()).all()


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(get_db),
):
    code = product_in.code.strip().upper()
    existing = db.query(Product).filter(Product.code == code).first()
    if existing:
        if not existing.is_active:
            # Reactivate
            existing.is_active = True
            existing.name = product_in.name
            existing.unit = product_in.unit
            existing.selling_price = product_in.selling_price
            existing.gst_rate = product_in.gst_rate
            existing.stock_quantity = product_in.stock_quantity
            db.commit()
            db.refresh(existing)
            return existing
        raise HTTPException(status_code=400, detail=f"Product with code '{code}' already exists.")

    product = Product(
        code=code,
        name=product_in.name.strip(),
        unit=product_in.unit.strip() or "Nos",
        selling_price=product_in.selling_price,
        gst_rate=product_in.gst_rate,
        stock_quantity=product_in.stock_quantity,
        is_active=True,
    )
    db.add(product)
    db.flush()

    # Record initial stock movement if quantity > 0
    if product.stock_quantity > 0:
        record_movement(
            db=db,
            product_id=product.id,
            movement_type="INITIAL",
            quantity=product.stock_quantity,
            balance_after=product.stock_quantity,
            notes="Initial product stock inventory",
        )

    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    if product_in.code is not None:
        new_code = product_in.code.strip().upper()
        if new_code != product.code:
            existing = db.query(Product).filter(Product.code == new_code).first()
            if existing and existing.id != product_id:
                raise HTTPException(status_code=400, detail=f"Product code '{new_code}' is already used.")
            product.code = new_code

    if product_in.name is not None:
        product.name = product_in.name.strip()
    if product_in.unit is not None:
        product.unit = product_in.unit.strip()
    if product_in.selling_price is not None:
        product.selling_price = product_in.selling_price
    if product_in.gst_rate is not None:
        product.gst_rate = product_in.gst_rate

    # If stock_quantity was explicitly modified via direct edit
    if product_in.stock_quantity is not None and product_in.stock_quantity != product.stock_quantity:
        diff = round(product_in.stock_quantity - product.stock_quantity, 2)
        product.stock_quantity = product_in.stock_quantity
        record_movement(
            db=db,
            product_id=product.id,
            movement_type="ADJUSTMENT",
            quantity=diff,
            balance_after=product.stock_quantity,
            notes="Direct inventory adjustment via product edit",
        )

    db.commit()
    db.refresh(product)
    return product


@router.post("/{product_id}/restock", response_model=ProductOut)
def restock(
    product_id: int,
    restock_in: ProductRestock,
    db: Session = Depends(get_db),
):
    return restock_product(
        db=db,
        product_id=product_id,
        quantity=restock_in.quantity,
        notes=restock_in.notes,
    )


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    # Soft delete to preserve historical integrity in stock movements & invoice snapshots
    product.is_active = False
    db.commit()
    return {"message": f"Product '{product.name}' ({product.code}) deactivated successfully."}


@router.get("/{product_id}/movements", response_model=List[StockMovementOut])
def get_product_movements(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    movements = (
        db.query(StockMovement)
        .filter(StockMovement.product_id == product_id)
        .order_by(StockMovement.created_at.desc())
        .limit(100)
        .all()
    )
    return movements
