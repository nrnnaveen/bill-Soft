from typing import List, Optional
from datetime import datetime, timezone, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from ..database import get_db
from ..models import Invoice, Product, InvoiceItem
from ..schemas import InvoiceCreate, InvoiceOut, InvoiceSummaryOut, DashboardStatsOut
from ..services.billing_service import create_invoice_transactional

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])


@router.post("", response_model=InvoiceOut, status_code=201)
def create_invoice(
    invoice_in: InvoiceCreate,
    db: Session = Depends(get_db),
):
    return create_invoice_transactional(db=db, invoice_in=invoice_in)


@router.get("", response_model=List[InvoiceSummaryOut])
def list_invoices(
    search: Optional[str] = Query(None, description="Search by invoice number or customer name"),
    db: Session = Depends(get_db),
):
    query = db.query(Invoice)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Invoice.invoice_number.ilike(term),
                Invoice.customer_name.ilike(term),
                Invoice.customer_phone.ilike(term)
            )
        )

    invoices = query.order_by(Invoice.created_at.desc()).all()

    result = []
    for inv in invoices:
        result.append(
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
        )
    return result


@router.get("/stats/dashboard")
def get_dashboard_stats(db: Session = Depends(get_db)):
    # Total active products
    total_products = db.query(Product).filter(Product.is_active == True).count()

    # Total current stock units
    total_stock_res = db.query(func.coalesce(func.sum(Product.stock_quantity), 0.0)).filter(Product.is_active == True).scalar()
    total_stock_units = float(total_stock_res or 0.0)

    # Today's date boundary in UTC
    now = datetime.now(timezone.utc)
    start_of_today = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)

    # Today's sales & bill count
    today_invoices = db.query(Invoice).filter(Invoice.created_at >= start_of_today).all()
    today_bills_count = len(today_invoices)
    today_sales = round(sum(inv.total_amount for inv in today_invoices), 2)

    # Low stock items (stock <= 5)
    low_stock_query = db.query(Product).filter(Product.is_active == True, Product.stock_quantity <= 5)
    low_stock_count = low_stock_query.count()
    low_stock_products = [
        {
            "id": p.id,
            "code": p.code,
            "name": p.name,
            "stock_quantity": p.stock_quantity,
            "unit": p.unit,
            "selling_price": p.selling_price,
        }
        for p in low_stock_query.order_by(Product.stock_quantity.asc()).limit(10).all()
    ]

    # Recent 5 invoices
    recent_invoices = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "invoice_date": inv.invoice_date,
            "customer_name": inv.customer_name,
            "total_amount": inv.total_amount,
            "payment_mode": inv.payment_mode,
            "is_gst_bill": inv.is_gst_bill,
        }
        for inv in db.query(Invoice).order_by(Invoice.created_at.desc()).limit(5).all()
    ]

    return {
        "total_products": total_products,
        "total_stock_units": total_stock_units,
        "today_sales": today_sales,
        "today_bills_count": today_bills_count,
        "low_stock_products_count": low_stock_count,
        "low_stock_products": low_stock_products,
        "recent_invoices": recent_invoices,
    }


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return invoice
