import math
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..models import Product, Invoice, InvoiceItem, ShopSettings
from ..schemas import InvoiceCreate
from .stock_service import record_movement


def number_to_words_indian(num: float) -> str:
    """Converts a monetary amount into Indian currency words representation."""
    if num is None:
        return ""

    num = round(num, 2)
    rupees = int(num)
    paise = int(round((num - rupees) * 100))

    if rupees == 0 and paise == 0:
        return "Rupees Zero Only"

    units = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"
    ]
    tens = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
    ]

    def two_digits(n: int) -> str:
        if n == 0:
            return ""
        if n < 20:
            return units[n]
        rem = n % 10
        return (tens[n // 10] + (" " + units[rem] if rem > 0 else "")).strip()

    def three_digits(n: int) -> str:
        h = n // 100
        rem = n % 100
        res = ""
        if h > 0:
            res += units[h] + " Hundred"
            if rem > 0:
                res += " and "
        if rem > 0:
            res += two_digits(rem)
        return res.strip()

    parts = []
    # Crores (10,000,000)
    crores = rupees // 10000000
    rupees %= 10000000
    if crores > 0:
        parts.append(two_digits(crores) + " Crore")

    # Lakhs (100,000)
    lakhs = rupees // 100000
    rupees %= 100000
    if lakhs > 0:
        parts.append(two_digits(lakhs) + " Lakh")

    # Thousands (1,000)
    thousands = rupees // 1000
    rupees %= 1000
    if thousands > 0:
        parts.append(two_digits(thousands) + " Thousand")

    # Hundreds and remainder
    if rupees > 0:
        parts.append(three_digits(rupees))

    rupees_str = " ".join(parts).strip() if parts else "Zero"
    result = f"Rupees {rupees_str}"

    if paise > 0:
        paise_str = two_digits(paise)
        result += f" and {paise_str} Paise"

    result += " Only"
    return result


def create_invoice_transactional(
    db: Session, 
    invoice_in: InvoiceCreate, 
    allow_negative_stock: bool = False
) -> Invoice:
    """
    Creates an invoice and deducts stock in a single atomic database transaction.
    Validates stock availability before deducting.
    Supports client_uuid for idempotent offline sync retries.
    Apportions discounts across taxable items before GST calculation per Indian GST rules.
    """
    if not invoice_in.items:
        raise HTTPException(status_code=400, detail="Cannot generate bill with empty item list.")

    # 0. Check idempotent replay via client_uuid
    if invoice_in.client_uuid:
        existing = db.query(Invoice).filter(Invoice.client_uuid == invoice_in.client_uuid).first()
        if existing:
            return existing

    try:
        # 1. Fetch shop settings to get invoice numbering and terms
        settings = db.query(ShopSettings).filter(ShopSettings.id == 1).with_for_update().first()
        if not settings:
            settings = ShopSettings(id=1)
            db.add(settings)
            db.flush()

        prefix = settings.invoice_prefix or "INV-"
        current_counter = settings.next_invoice_number or 1

        # Determine unique invoice number
        if invoice_in.offline_invoice_number:
            candidate_num = invoice_in.offline_invoice_number.strip()
            # If offline invoice number is not in use, adopt it
            if db.query(Invoice).filter(Invoice.invoice_number == candidate_num).first() is None:
                invoice_number = candidate_num
            else:
                # Disambiguate if collision
                invoice_number = f"{candidate_num}-S{current_counter:02d}"
                settings.next_invoice_number = current_counter + 1
        else:
            invoice_number = f"{prefix}{current_counter:04d}"
            while db.query(Invoice).filter(Invoice.invoice_number == invoice_number).first() is not None:
                current_counter += 1
                invoice_number = f"{prefix}{current_counter:04d}"
            settings.next_invoice_number = current_counter + 1

        # 2. Check stock and validate for each item
        product_cache = {}
        for item in invoice_in.items:
            if item.product_id:
                product = db.query(Product).filter(Product.id == item.product_id).with_for_update().first()
                if not product:
                    raise HTTPException(status_code=404, detail=f"Product ID {item.product_id} not found.")
                if not product.is_active:
                    raise HTTPException(status_code=400, detail=f"Product {product.name} ({product.code}) is inactive.")
                
                # Check sufficient stock unless allow_negative_stock is set for offline sync
                if not allow_negative_stock and product.stock_quantity < item.quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Insufficient stock for '{product.name}' (Code: {product.code}). "
                            f"Available: {product.stock_quantity} {product.unit}, Requested: {item.quantity} {item.unit}."
                        )
                    )
                product_cache[item.product_id] = product
            else:
                # In case an item is added by code without product_id
                product = db.query(Product).filter(Product.code == item.product_code).with_for_update().first()
                if product:
                    if not product.is_active:
                        raise HTTPException(status_code=400, detail=f"Product {product.name} ({product.code}) is inactive.")
                    if not allow_negative_stock and product.stock_quantity < item.quantity:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Insufficient stock for '{product.name}' (Code: {product.code}). "
                                f"Available: {product.stock_quantity} {product.unit}, Requested: {item.quantity} {item.unit}."
                            )
                        )
                    product_cache[product.id] = product
                    item.product_id = product.id

        # 3. Determine Tax Treatment (Intrastate vs Interstate)
        shop_state = (settings.state or "Tamilnadu").strip().lower()
        shop_code = (settings.state_code or "33").strip()

        cust_state = (invoice_in.state or settings.state or "Tamilnadu").strip().lower()
        cust_code = (invoice_in.state_code or settings.state_code or "33").strip()

        # If customer state code or state name differs from shop, supply is Interstate (IGST)
        is_interstate = (
            (cust_code != "" and shop_code != "" and cust_code != shop_code)
            or (cust_state != "" and shop_state != "" and cust_state != shop_state)
        )

        is_gst = invoice_in.is_gst_bill

        # Calculate gross subtotal to apportion discount proportionally
        gross_subtotal = sum(round(item.unit_price * item.quantity, 2) for item in invoice_in.items)
        discount_amount = round(min(max(0.0, invoice_in.discount_amount or 0.0), gross_subtotal), 2)

        # 1. First pass: compute each item's gross, discount, and initial goods taxable amount
        goods_taxable_items = []
        allocated_discount = 0.0
        goods_subtotal = 0.0

        for i, item in enumerate(invoice_in.items):
            unit_price = round(item.unit_price, 2)
            quantity = round(item.quantity, 2)
            item_gross = round(unit_price * quantity, 2)

            # Proportional discount deduction before GST (Section 15(3) CGST Act)
            if discount_amount > 0 and gross_subtotal > 0:
                if i == len(invoice_in.items) - 1:
                    item_discount = round(discount_amount - allocated_discount, 2)
                else:
                    item_discount = round((item_gross / gross_subtotal) * discount_amount, 2)
                    allocated_discount += item_discount
            else:
                item_discount = 0.0

            taxable_base = round(max(0.0, item_gross - item_discount), 2)
            goods_subtotal += taxable_base
            goods_taxable_items.append({
                "item": item,
                "unit_price": unit_price,
                "quantity": quantity,
                "item_gross": item_gross,
                "item_discount": item_discount,
                "taxable_base": taxable_base,
            })

        goods_subtotal = round(goods_subtotal, 2)
        transport = round(invoice_in.transport_charges or 0.0, 2)

        # 2. Second pass: Apportion transport charges as incidental expenses into taxable value (Section 15(2)(c) CGST Act)
        allocated_transport = 0.0
        total_cgst = 0.0
        total_sgst = 0.0
        total_igst = 0.0
        invoice_items_models = []

        for i, entry in enumerate(goods_taxable_items):
            item = entry["item"]
            taxable_base = entry["taxable_base"]

            if is_gst and transport > 0 and goods_subtotal > 0:
                if i == len(goods_taxable_items) - 1:
                    item_transport = round(transport - allocated_transport, 2)
                else:
                    item_transport = round((taxable_base / goods_subtotal) * transport, 2)
                    allocated_transport += item_transport
            else:
                item_transport = 0.0

            # Effective taxable amount for this item (including incidental transport share per GST composite supply rules)
            item_effective_taxable = round(taxable_base + item_transport, 2)

            if is_gst and item.gst_rate > 0:
                gst_pct = float(item.gst_rate)
                if is_interstate:
                    cgst = 0.0
                    sgst = 0.0
                    igst = round(item_effective_taxable * (gst_pct / 100.0), 2)
                else:
                    half_rate = gst_pct / 2.0
                    cgst = round(item_effective_taxable * (half_rate / 100.0), 2)
                    sgst = round(item_effective_taxable * (half_rate / 100.0), 2)
                    igst = 0.0
            else:
                cgst = 0.0
                sgst = 0.0
                igst = 0.0

            item_total = round(taxable_base + item_transport + cgst + sgst + igst, 2)
            total_cgst += cgst
            total_sgst += sgst
            total_igst += igst

            inv_item = InvoiceItem(
                product_id=item.product_id,
                product_code=item.product_code,
                product_name=item.product_name,
                unit=item.unit,
                quantity=entry["quantity"],
                unit_price=entry["unit_price"],
                gst_rate=item.gst_rate if is_gst else 0.0,
                taxable_amount=taxable_base,
                cgst_amount=cgst,
                sgst_amount=sgst,
                igst_amount=igst,
                total_amount=item_total,
            )
            invoice_items_models.append(inv_item)

        subtotal = goods_subtotal
        total_cgst = round(total_cgst, 2)
        total_sgst = round(total_sgst, 2)
        total_igst = round(total_igst, 2)
        total_tax = round(total_cgst + total_sgst + total_igst, 2) if is_gst else 0.0
        final_total = round(goods_subtotal + transport + total_tax, 2)
        amount_in_words = number_to_words_indian(final_total)

        # 4. Construct Invoice instance
        terms = invoice_in.notes_terms if invoice_in.notes_terms else settings.default_terms

        invoice = Invoice(
            invoice_number=invoice_number,
            invoice_date=datetime.now(timezone.utc),
            payment_mode=invoice_in.payment_mode or "Cash",
            customer_name=(invoice_in.customer_name or "").strip(),
            customer_address=(invoice_in.customer_address or "").strip(),
            customer_phone=(invoice_in.customer_phone or "").strip(),
            customer_gstin=(invoice_in.customer_gstin or "").strip(),
            state=(invoice_in.state or settings.state or "Tamilnadu").strip(),
            state_code=(invoice_in.state_code or settings.state_code or "33").strip(),
            is_gst_bill=is_gst,
            discount_amount=discount_amount,
            transport_charges=transport,
            subtotal=subtotal,
            cgst_amount=round(total_cgst, 2),
            sgst_amount=round(total_sgst, 2),
            igst_amount=round(total_igst, 2),
            total_tax=total_tax,
            total_amount=final_total,
            total_amount_words=amount_in_words,
            terms_and_conditions=terms,
            client_uuid=invoice_in.client_uuid,
            device_id=invoice_in.device_id,
        )
        db.add(invoice)
        db.flush()  # assign invoice.id

        # 5. Attach items and deduct stock
        for item_model in invoice_items_models:
            item_model.invoice_id = invoice.id
            db.add(item_model)

            # Deduct stock if linked to a product
            if item_model.product_id and item_model.product_id in product_cache:
                prod = product_cache[item_model.product_id]
                prod.stock_quantity = round(prod.stock_quantity - item_model.quantity, 2)
                movement_type = "SALE_OFFLINE" if allow_negative_stock else "SALE"
                record_movement(
                    db=db,
                    product_id=prod.id,
                    movement_type=movement_type,
                    quantity=-item_model.quantity,
                    balance_after=prod.stock_quantity,
                    invoice_id=invoice.id,
                    notes=f"Sold via Invoice {invoice.invoice_number} ({movement_type})",
                )

        db.commit()
        db.refresh(invoice)
        return invoice

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create invoice: {str(e)}")
