from datetime import datetime, timezone
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException

from ..models import Product, Invoice, ShopSettings, StockMovement
from ..schemas import (
    SyncPushRequest, 
    SyncPushResponse, 
    SyncPullResponse, 
    ConflictReport, 
    ProductOut, 
    InvoiceSummaryOut, 
    ShopSettingsOut
)
from .billing_service import create_invoice_transactional
from .stock_service import record_movement


def process_push(db: Session, request: SyncPushRequest) -> SyncPushResponse:
    synced_invoices = []
    conflicts: List[ConflictReport] = []
    now = datetime.now(timezone.utc)

    # 1. Process Offline Invoices
    for inv_in in request.invoices:
        client_uuid = inv_in.client_uuid or f"offline-{inv_in.offline_invoice_number or id(inv_in)}"
        inv_in.client_uuid = client_uuid
        inv_in.device_id = request.device_id

        # Check if any product has low server stock before deduction
        for item in inv_in.items:
            prod = None
            if item.product_id:
                prod = db.query(Product).filter(Product.id == item.product_id).first()
            elif item.product_code:
                prod = db.query(Product).filter(Product.code == item.product_code).first()

            if prod and prod.stock_quantity < item.quantity:
                conflicts.append(
                    ConflictReport(
                        conflict_type="STOCK_SHORTAGE",
                        item_id=str(prod.id),
                        title=f"Concurrent Sale: Low Stock on '{prod.name}'",
                        details=(
                            f"Device '{request.device_id}' sold {item.quantity} {item.unit} via invoice {inv_in.offline_invoice_number or client_uuid}, "
                            f"but server stock was only {prod.stock_quantity} {prod.unit}. Stock balance is now negative."
                        ),
                        client_value=f"Sold {item.quantity}",
                        server_value=f"Available {prod.stock_quantity}",
                        timestamp=now,
                    )
                )

        try:
            # Atomic invoice creation allowing negative stock for offline sales records
            invoice = create_invoice_transactional(db, inv_in, allow_negative_stock=True)
            synced_invoices.append({
                "client_uuid": client_uuid,
                "offline_invoice_number": inv_in.offline_invoice_number,
                "server_invoice_number": invoice.invoice_number,
                "server_id": invoice.id,
            })
        except Exception as e:
            conflicts.append(
                ConflictReport(
                    conflict_type="INVOICE_SYNC_ERROR",
                    item_id=client_uuid,
                    title=f"Failed to sync offline bill {inv_in.offline_invoice_number}",
                    details=str(e),
                    timestamp=now,
                )
            )

    # 2. Process Offline Stock Adjustments
    for adj in request.stock_adjustments:
        prod = db.query(Product).filter(Product.id == adj.product_id).first()
        if prod:
            prod.stock_quantity = max(0.0, round(prod.stock_quantity + adj.quantity, 2))
            record_movement(
                db=db,
                product_id=prod.id,
                movement_type=adj.adjustment_type or "ADJUSTMENT_OFFLINE",
                quantity=adj.quantity,
                balance_after=prod.stock_quantity,
                notes=adj.notes or f"Offline stock adjustment from device {request.device_id}",
            )
            db.commit()

    # 3. Process Offline Added Products
    for prod_in in request.products:
        existing = db.query(Product).filter(Product.code == prod_in.code).first()
        if existing:
            conflicts.append(
                ConflictReport(
                    conflict_type="DUPLICATE_PRODUCT_CODE",
                    item_id=prod_in.code,
                    title=f"Product Code '{prod_in.code}' already exists on server",
                    details=f"Offline product '{prod_in.name}' could not overwrite existing '{existing.name}'.",
                    client_value=prod_in.name,
                    server_value=existing.name,
                    timestamp=now,
                )
            )
        else:
            new_prod = Product(
                code=prod_in.code,
                name=prod_in.name,
                unit=prod_in.unit,
                selling_price=prod_in.selling_price,
                gst_rate=prod_in.gst_rate,
                stock_quantity=prod_in.stock_quantity,
            )
            db.add(new_prod)
            db.commit()
            db.refresh(new_prod)
            record_movement(
                db=db,
                product_id=new_prod.id,
                movement_type="INITIAL",
                quantity=new_prod.stock_quantity,
                balance_after=new_prod.stock_quantity,
                notes=f"Created offline on device {request.device_id}",
            )

    return SyncPushResponse(
        success=True,
        synced_invoices=synced_invoices,
        conflicts=conflicts,
        message=f"Synced {len(synced_invoices)} invoices, {len(conflicts)} conflicts noted.",
        server_time=now,
    )


def process_pull(db: Session) -> SyncPullResponse:
    now = datetime.now(timezone.utc)
    products = db.query(Product).filter(Product.is_active == True).order_by(Product.name).all()
    
    settings = db.query(ShopSettings).filter(ShopSettings.id == 1).first()
    if not settings:
        settings = ShopSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    invoices = db.query(Invoice).order_by(Invoice.created_at.desc()).limit(100).all()
    invoice_summaries = [
        InvoiceSummaryOut(
            id=inv.id,
            invoice_number=inv.invoice_number,
            invoice_date=inv.invoice_date,
            customer_name=inv.customer_name,
            payment_mode=inv.payment_mode,
            is_gst_bill=inv.is_gst_bill,
            item_count=len(inv.items),
            total_amount=inv.total_amount,
        )
        for inv in invoices
    ]

    return SyncPullResponse(
        products=[ProductOut.from_orm(p) for p in products],
        settings=ShopSettingsOut.from_orm(settings),
        invoices=invoice_summaries,
        server_time=now,
    )
