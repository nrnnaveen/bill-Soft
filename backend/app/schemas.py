from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


# Product Schemas
class ProductBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50, description="Product Code / SKU")
    name: str = Field(..., min_length=1, max_length=200, description="Product Name")
    unit: str = Field("Nos", min_length=1, max_length=50, description="Unit (e.g. Nos, Kg, Pcs, Box)")
    selling_price: float = Field(..., ge=0, description="Selling price per unit")
    gst_rate: float = Field(18.0, ge=0, le=100, description="Applicable GST % (0, 5, 12, 18, 28)")
    stock_quantity: float = Field(0.0, ge=0, description="Available stock quantity")

    @field_validator("code")
    def clean_code(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("name")
    def clean_name(cls, v: str) -> str:
        return v.strip()


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    unit: Optional[str] = None
    selling_price: Optional[float] = Field(None, ge=0)
    gst_rate: Optional[float] = Field(None, ge=0, le=100)
    stock_quantity: Optional[float] = Field(None, ge=0)


class ProductRestock(BaseModel):
    quantity: float = Field(..., gt=0, description="Quantity to add to stock")
    notes: Optional[str] = Field("Stock arrival / Purchase", description="Reason or supplier invoice notes")


class ProductOut(ProductBase):
    id: int
    stock_quantity: float = Field(0.0, description="Current stock quantity (may be negative during overdraft)")
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Stock Movement Schemas
class StockMovementOut(BaseModel):
    id: int
    product_id: int
    invoice_id: Optional[int]
    movement_type: str
    quantity: float
    balance_after: float
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# Invoice Item Schemas
class InvoiceItemCreate(BaseModel):
    product_id: Optional[int] = None
    product_code: str
    product_name: str
    unit: str = "Nos"
    quantity: float = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    gst_rate: float = Field(0.0, ge=0, le=100)


class InvoiceItemOut(BaseModel):
    id: int
    invoice_id: int
    product_id: Optional[int]
    product_code: str
    product_name: str
    unit: str
    quantity: float
    unit_price: float
    gst_rate: float
    taxable_amount: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    total_amount: float

    class Config:
        from_attributes = True


# Invoice Schemas
class InvoiceCreate(BaseModel):
    payment_mode: str = Field("Cash", description="Cash, UPI, Card, Net Banking, Cheque")
    customer_name: Optional[str] = ""
    customer_address: Optional[str] = ""
    customer_phone: Optional[str] = ""
    customer_gstin: Optional[str] = ""
    state: Optional[str] = "Tamilnadu"
    state_code: Optional[str] = "33"
    is_gst_bill: bool = True
    discount_amount: float = Field(0.0, ge=0)
    transport_charges: float = Field(0.0, ge=0)
    items: List[InvoiceItemCreate] = Field(..., min_length=1)
    notes_terms: Optional[str] = None
    client_uuid: Optional[str] = None
    device_id: Optional[str] = None
    offline_invoice_number: Optional[str] = None


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    invoice_date: datetime
    payment_mode: str
    customer_name: Optional[str]
    customer_address: Optional[str]
    customer_phone: Optional[str]
    customer_gstin: Optional[str]
    state: str
    state_code: str
    is_gst_bill: bool
    discount_amount: float = 0.0
    transport_charges: float
    subtotal: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    total_tax: float
    total_amount: float
    total_amount_words: Optional[str]
    terms_and_conditions: Optional[str]
    client_uuid: Optional[str] = None
    device_id: Optional[str] = None
    created_at: datetime
    items: List[InvoiceItemOut]

    class Config:
        from_attributes = True


class InvoiceSummaryOut(BaseModel):
    id: int
    invoice_number: str
    invoice_date: datetime
    customer_name: Optional[str]
    payment_mode: str
    is_gst_bill: bool
    item_count: int
    total_amount: float

    class Config:
        from_attributes = True


# Shop Settings Schemas
class ShopSettingsBase(BaseModel):
    shop_name: str
    address: str
    gstin: Optional[str] = ""
    email: Optional[str] = ""
    contact_no: Optional[str] = ""
    state: str = "Tamilnadu"
    state_code: str = "33"
    invoice_prefix: str = "INV-"
    device_invoice_prefix: str = "INV-DEV1-"
    next_invoice_number: int = 1
    default_terms: str
    seal_image_path: Optional[str] = None
    default_is_gst: bool = True


class ShopSettingsUpdate(BaseModel):
    shop_name: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    email: Optional[str] = None
    contact_no: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    invoice_prefix: Optional[str] = None
    device_invoice_prefix: Optional[str] = None
    next_invoice_number: Optional[int] = Field(None, ge=1)
    default_terms: Optional[str] = None
    default_is_gst: Optional[bool] = None


class ShopSettingsOut(ShopSettingsBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True


# Synchronization Schemas
class SyncStockAdjustment(BaseModel):
    product_id: int
    adjustment_type: str  # "RESTOCK", "DAMAGE", "AUDIT"
    quantity: float
    notes: Optional[str] = None


class SyncPushRequest(BaseModel):
    device_id: str
    invoices: List[InvoiceCreate] = []
    stock_adjustments: List[SyncStockAdjustment] = []
    products: List[ProductCreate] = []


class ConflictReport(BaseModel):
    conflict_type: str  # "STOCK_SHORTAGE", "DUPLICATE_INVOICE", "PRICE_MISMATCH"
    item_id: Optional[str] = None
    title: str
    details: str
    client_value: Optional[str] = None
    server_value: Optional[str] = None
    timestamp: datetime


class SyncPushResponse(BaseModel):
    success: bool
    synced_invoices: List[dict]  # client_uuid -> server invoice_number
    conflicts: List[ConflictReport] = []
    message: str
    server_time: datetime


class SyncPullResponse(BaseModel):
    products: List[ProductOut]
    settings: ShopSettingsOut
    invoices: List[InvoiceSummaryOut]
    server_time: datetime


# Dashboard Statistics Schema
class DashboardStatsOut(BaseModel):
    total_products: int
    total_stock_units: float
    today_sales: float
    today_bills_count: int
    low_stock_products_count: int
