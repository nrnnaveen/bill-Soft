from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from .database import Base


def get_utc_now():
    return datetime.now(timezone.utc)


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(200), index=True, nullable=False)
    unit = Column(String(50), nullable=False, default="Nos")
    selling_price = Column(Float, nullable=False, default=0.0)
    gst_rate = Column(Float, nullable=False, default=18.0)  # e.g. 0, 5, 12, 18, 28
    stock_quantity = Column(Float, nullable=False, default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    stock_movements = relationship("StockMovement", back_populates="product", cascade="all, delete-orphan")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(50), unique=True, index=True, nullable=False)
    invoice_date = Column(DateTime, default=get_utc_now, nullable=False)
    payment_mode = Column(String(50), default="Cash")  # Cash, UPI, Card, Net Banking, Cheque
    customer_name = Column(String(200), nullable=True)
    customer_address = Column(Text, nullable=True)
    customer_phone = Column(String(50), nullable=True)
    customer_gstin = Column(String(50), nullable=True)
    state = Column(String(100), default="Tamilnadu")
    state_code = Column(String(20), default="33")
    is_gst_bill = Column(Boolean, default=True)
    discount_amount = Column(Float, default=0.0)
    transport_charges = Column(Float, default=0.0)
    subtotal = Column(Float, default=0.0)
    cgst_amount = Column(Float, default=0.0)
    sgst_amount = Column(Float, default=0.0)
    igst_amount = Column(Float, default=0.0)
    total_tax = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    total_amount_words = Column(Text, nullable=True)
    terms_and_conditions = Column(Text, nullable=True)
    client_uuid = Column(String(100), index=True, nullable=True)
    device_id = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    stock_movements = relationship("StockMovement", back_populates="invoice")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    product_code = Column(String(50), nullable=False)
    product_name = Column(String(200), nullable=False)
    unit = Column(String(50), nullable=False)
    quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    gst_rate = Column(Float, nullable=False, default=0.0)
    taxable_amount = Column(Float, nullable=False)
    cgst_amount = Column(Float, default=0.0)
    sgst_amount = Column(Float, default=0.0)
    igst_amount = Column(Float, default=0.0)
    total_amount = Column(Float, nullable=False)

    invoice = relationship("Invoice", back_populates="items")
    product = relationship("Product")


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    movement_type = Column(String(50), nullable=False)  # "SALE", "RESTOCK", "ADJUSTMENT", "INITIAL"
    quantity = Column(Float, nullable=False)  # negative for deduction, positive for addition
    balance_after = Column(Float, nullable=False)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    product = relationship("Product", back_populates="stock_movements")
    invoice = relationship("Invoice", back_populates="stock_movements")


class ShopSettings(Base):
    __tablename__ = "shop_settings"

    id = Column(Integer, primary_key=True, default=1)
    shop_name = Column(String(255), nullable=False, default="K.N. 181. Kanyakumari Mahathma Gandhi Human Resource Management & Skill Development Co-operative Society Ltd.")
    address = Column(Text, nullable=False, default="12-145, 142G/1, S.A. Complex, Pampanvilai Road, Asaripallam-629201, Kanyakumari Dist.")
    gstin = Column(String(50), nullable=True, default="33AAKAK0961H1ZP")
    email = Column(String(100), nullable=True, default="kmghrmsdcooperativesociety@gmail.com")
    contact_no = Column(String(50), nullable=True, default="8015913892")
    state = Column(String(100), nullable=False, default="Tamilnadu")
    state_code = Column(String(20), nullable=False, default="33")
    invoice_prefix = Column(String(20), nullable=False, default="INV-")
    device_invoice_prefix = Column(String(20), nullable=False, default="INV-DEV1-")
    next_invoice_number = Column(Integer, nullable=False, default=1)
    default_terms = Column(Text, nullable=False, default="1. Goods once sold will not be taken back.\n2. Any damages during Transport, report immediate in front of Driver / Delivery Person.\n3. Warranty norms as per the product with guide.")
    seal_image_path = Column(String(255), nullable=True)
    default_is_gst = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
