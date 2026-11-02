-- ==============================================================================
-- SHOP BILLING & INVENTORY MANAGEMENT SYSTEM
-- Migration 002: Missing Columns & Row Level Security (RLS) Hardening
-- ==============================================================================

-- 1. Ensure all sync & discount columns exist on invoices
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'discount_amount') THEN
        ALTER TABLE invoices ADD COLUMN discount_amount NUMERIC(12, 2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'client_uuid') THEN
        ALTER TABLE invoices ADD COLUMN client_uuid VARCHAR(100);
        CREATE INDEX IF NOT EXISTS idx_invoices_client_uuid ON invoices(client_uuid);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'device_id') THEN
        ALTER TABLE invoices ADD COLUMN device_id VARCHAR(50);
        CREATE INDEX IF NOT EXISTS idx_invoices_device_id ON invoices(device_id);
    END IF;
END $$;

-- 2. Ensure device prefix exists on shop_settings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shop_settings' AND column_name = 'device_invoice_prefix') THEN
        ALTER TABLE shop_settings ADD COLUMN device_invoice_prefix VARCHAR(20) DEFAULT 'INV-DEV1-';
    END IF;
END $$;

-- 3. Enable Row Level Security (RLS) on all business tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;

-- 4. Define Service Role & Authenticated Access Policies
-- The backend uses the service_role key to manage business transactions atomically.
-- Anonymous access is strictly prohibited from modifying or deleting business records.

-- Products Table
DROP POLICY IF EXISTS "Service role full access on products" ON products;
CREATE POLICY "Service role full access on products" ON products
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read products" ON products;
CREATE POLICY "Authenticated users can read products" ON products
    FOR SELECT
    TO authenticated
    USING (is_active = true);

-- Invoices Table
DROP POLICY IF EXISTS "Service role full access on invoices" ON invoices;
CREATE POLICY "Service role full access on invoices" ON invoices
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read invoices" ON invoices;
CREATE POLICY "Authenticated users can read invoices" ON invoices
    FOR SELECT
    TO authenticated
    USING (true);

-- Invoice Items Table
DROP POLICY IF EXISTS "Service role full access on invoice_items" ON invoice_items;
CREATE POLICY "Service role full access on invoice_items" ON invoice_items
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read invoice_items" ON invoice_items;
CREATE POLICY "Authenticated users can read invoice_items" ON invoice_items
    FOR SELECT
    TO authenticated
    USING (true);

-- Stock Movements Table
DROP POLICY IF EXISTS "Service role full access on stock_movements" ON stock_movements;
CREATE POLICY "Service role full access on stock_movements" ON stock_movements
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read stock_movements" ON stock_movements;
CREATE POLICY "Authenticated users can read stock_movements" ON stock_movements
    FOR SELECT
    TO authenticated
    USING (true);

-- Shop Settings Table
DROP POLICY IF EXISTS "Service role full access on shop_settings" ON shop_settings;
CREATE POLICY "Service role full access on shop_settings" ON shop_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read shop_settings" ON shop_settings;
CREATE POLICY "Authenticated users can read shop_settings" ON shop_settings
    FOR SELECT
    TO authenticated
    USING (true);
