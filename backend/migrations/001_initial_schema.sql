-- ==============================================================================
-- SHOP BILLING & INVENTORY MANAGEMENT SYSTEM
-- PostgreSQL Schema for Supabase
-- ==============================================================================

-- 1. Products Table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'Nos',
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    stock_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- 2. Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_mode VARCHAR(50) NOT NULL DEFAULT 'Cash',
    customer_name VARCHAR(200),
    customer_address TEXT,
    customer_phone VARCHAR(50),
    customer_gstin VARCHAR(50),
    state VARCHAR(100) NOT NULL DEFAULT 'Tamilnadu',
    state_code VARCHAR(20) NOT NULL DEFAULT '33',
    is_gst_bill BOOLEAN NOT NULL DEFAULT TRUE,
    transport_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount_words TEXT,
    terms_and_conditions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);

-- 3. Invoice Items Table (Immutable historical snapshot of sale items)
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_code VARCHAR(50) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(12, 2) NOT NULL,
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- 4. Stock Movements Table
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    movement_type VARCHAR(50) NOT NULL, -- 'SALE', 'RESTOCK', 'ADJUSTMENT', 'INITIAL'
    quantity NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    notes VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_invoice ON stock_movements(invoice_id);

-- 5. Shop Settings Table
CREATE TABLE IF NOT EXISTS shop_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    shop_name VARCHAR(255) NOT NULL DEFAULT 'K.N. 181. Kanyakumari Mahathma Gandhi Human Resource Management & Skill Development Co-operative Society Ltd.',
    address TEXT NOT NULL DEFAULT '12-145, 142G/1, S.A. Complex, Pampanvilai Road, Asaripallam-629201, Kanyakumari Dist.',
    gstin VARCHAR(50) DEFAULT '33AAKAK0961H1ZP',
    email VARCHAR(100) DEFAULT 'kmghrmsdcooperativesociety@gmail.com',
    contact_no VARCHAR(50) DEFAULT '8015913892',
    state VARCHAR(100) NOT NULL DEFAULT 'Tamilnadu',
    state_code VARCHAR(20) NOT NULL DEFAULT '33',
    invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-',
    next_invoice_number INTEGER NOT NULL DEFAULT 1,
    default_terms TEXT NOT NULL DEFAULT '1. Goods once sold will not be taken back.
2. Any damages during Transport, report immediate in front of Driver / Delivery Person.
3. Warranty norms as per the product with guide.',
    seal_image_path VARCHAR(255),
    default_is_gst BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Initial Shop Settings if row 1 does not exist
INSERT INTO shop_settings (id, shop_name, address, gstin, email, contact_no, state, state_code, invoice_prefix, next_invoice_number, default_terms, default_is_gst)
VALUES (
    1,
    'K.N. 181. Kanyakumari Mahathma Gandhi Human Resource Management & Skill Development Co-operative Society Ltd.',
    '12-145, 142G/1, S.A. Complex, Pampanvilai Road, Asaripallam-629201, Kanyakumari Dist.',
    '33AAKAK0961H1ZP',
    'kmghrmsdcooperativesociety@gmail.com',
    '8015913892',
    'Tamilnadu',
    '33',
    'INV-',
    1,
    '1. Goods once sold will not be taken back.
2. Any damages during Transport, report immediate in front of Driver / Delivery Person.
3. Warranty norms as per the product with guide.',
    TRUE
)
ON CONFLICT (id) DO NOTHING;
