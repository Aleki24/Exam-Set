-- ============================================================================
-- PAPER SHOP + EXAM SETTER
-- Migration: 012_paper_shop.sql
--
-- Turns the `exams` table into a sellable catalog of papers and adds the
-- commerce tables behind it (orders, order items, entitlements).
--
-- Two kinds of row now live in `exams`:
--   source = 'catalog'  -> a paper published for sale/download in the shop
--   source = 'user_set' -> a paper a teacher built themselves in the setter
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CATALOG COLUMNS ON exams
-- ----------------------------------------------------------------------------

ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'user_set',
    ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
    ADD COLUMN IF NOT EXISTS description TEXT,
    -- Catalog taxonomy (mirrors src/lib/catalog.ts)
    ADD COLUMN IF NOT EXISTS exam_type VARCHAR(40),
    ADD COLUMN IF NOT EXISTS level_slug VARCHAR(40),
    ADD COLUMN IF NOT EXISTS grade_label VARCHAR(40),
    ADD COLUMN IF NOT EXISTS term_slug VARCHAR(20),
    ADD COLUMN IF NOT EXISTS year INTEGER,
    ADD COLUMN IF NOT EXISTS paper_number VARCHAR(20),
    -- Commerce
    ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'KES',
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    -- Assets
    ADD COLUMN IF NOT EXISTS marking_scheme_storage_key VARCHAR(500),
    ADD COLUMN IF NOT EXISTS marking_scheme_url TEXT,
    ADD COLUMN IF NOT EXISTS has_marking_scheme BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS preview_pages INTEGER NOT NULL DEFAULT 1,
    -- Stats
    ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS purchase_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE exams
    DROP CONSTRAINT IF EXISTS exams_source_check;
ALTER TABLE exams
    ADD CONSTRAINT exams_source_check CHECK (source IN ('catalog', 'user_set'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_exams_slug ON exams(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exams_shop
    ON exams(source, is_published, level_slug, exam_type, year DESC);
CREATE INDEX IF NOT EXISTS idx_exams_grade_label ON exams(grade_label);
CREATE INDEX IF NOT EXISTS idx_exams_created_by ON exams(created_by);
CREATE INDEX IF NOT EXISTS idx_exams_price ON exams(price_cents);

-- Free papers are the ones priced at zero; keep the flag derivable, not stored.
COMMENT ON COLUMN exams.price_cents IS 'Price in minor units (KES cents). 0 = free download.';
COMMENT ON COLUMN exams.source IS 'catalog = sold in the shop, user_set = built by a teacher in /set';

-- ----------------------------------------------------------------------------
-- 2. ORDERS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(24) NOT NULL UNIQUE,

    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'awaiting_confirmation', 'paid', 'failed', 'cancelled')),

    -- Money (minor units)
    subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'KES',

    -- Payment
    provider VARCHAR(20) NOT NULL DEFAULT 'mpesa'
        CHECK (provider IN ('mpesa', 'manual', 'free')),
    phone VARCHAR(20),
    provider_ref VARCHAR(100),          -- M-Pesa receipt / transaction code
    provider_request_id VARCHAR(100),   -- CheckoutRequestID from STK push
    provider_payload JSONB,             -- raw callback for auditing

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_request_id ON orders(provider_request_id);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,

    -- Snapshot so a later price change never rewrites history
    title VARCHAR(255) NOT NULL,
    unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (order_id, exam_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_exam ON order_items(exam_id);

-- ----------------------------------------------------------------------------
-- 3. ENTITLEMENTS (what a user is allowed to download)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

    -- 'purchase' = paid for, 'free' = zero-priced paper claimed,
    -- 'author'   = user built or uploaded it, 'grant' = given by an admin
    kind VARCHAR(20) NOT NULL DEFAULT 'purchase'
        CHECK (kind IN ('purchase', 'free', 'author', 'grant')),

    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, exam_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_entitlements_exam ON entitlements(exam_id);

-- ----------------------------------------------------------------------------
-- 4. TRIGGERS
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Keep purchase_count on the paper in step with granted entitlements.
CREATE OR REPLACE FUNCTION bump_exam_purchase_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE exams
       SET purchase_count = purchase_count + 1
     WHERE id = NEW.exam_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entitlements_bump_purchase_count ON entitlements;
CREATE TRIGGER entitlements_bump_purchase_count
    AFTER INSERT ON entitlements
    FOR EACH ROW
    WHEN (NEW.kind IN ('purchase', 'free'))
    EXECUTE FUNCTION bump_exam_purchase_count();

-- Download counter, called from the gated download route.
CREATE OR REPLACE FUNCTION increment_paper_download(p_exam_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE exams
       SET download_count = download_count + 1
     WHERE id = p_exam_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_paper_download(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

-- Orders: a buyer only ever sees their own.
DROP POLICY IF EXISTS "orders_select_own" ON orders;
CREATE POLICY "orders_select_own" ON orders
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "orders_insert_own" ON orders;
CREATE POLICY "orders_insert_own" ON orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Deliberately NO update policy for buyers. Anything that changes an order's
-- status goes through the SECURITY DEFINER functions in section 7, so a browser
-- can never mark its own order paid.

-- Order items follow their order.
DROP POLICY IF EXISTS "order_items_select_own" ON order_items;
CREATE POLICY "order_items_select_own" ON order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "order_items_insert_own" ON order_items;
CREATE POLICY "order_items_insert_own" ON order_items
    FOR INSERT WITH CHECK (
        order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
    );

-- Entitlements are read-only to the owner; only the service role grants them,
-- so payment status can never be self-awarded from the browser.
DROP POLICY IF EXISTS "entitlements_select_own" ON entitlements;
CREATE POLICY "entitlements_select_own" ON entitlements
    FOR SELECT USING (auth.uid() = user_id);

-- Published catalog papers are readable by anyone; drafts and personal sets
-- stay with their author.
DROP POLICY IF EXISTS "exams_select_public" ON exams;
DROP POLICY IF EXISTS "exams_select" ON exams;
CREATE POLICY "exams_select" ON exams
    FOR SELECT USING (
        (source = 'catalog' AND is_published = TRUE)
        OR created_by = auth.uid()
    );

DROP POLICY IF EXISTS "exams_insert_own" ON exams;
CREATE POLICY "exams_insert_own" ON exams
    FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "exams_update_own" ON exams;
CREATE POLICY "exams_update_own" ON exams
    FOR UPDATE USING (created_by = auth.uid());

DROP POLICY IF EXISTS "exams_delete_own" ON exams;
CREATE POLICY "exams_delete_own" ON exams
    FOR DELETE USING (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. PAYMENT STATE TRANSITIONS
--
-- Money is the one place where "trust the client" is never acceptable. Buyers
-- can create an order and say how they intend to pay; only these functions can
-- mark one paid, and only `confirm_order_payment` — which is not granted to
-- authenticated users — hands out entitlements for a paid order.
-- ----------------------------------------------------------------------------

-- Free orders: the total is recomputed from live prices before anything is
-- granted, so a zero-total order built from paid papers is rejected.
CREATE OR REPLACE FUNCTION finalize_free_order(p_order_id UUID)
RETURNS TABLE (status VARCHAR, granted INTEGER) AS $$
DECLARE
    v_user_id UUID;
    v_live_total INTEGER;
    v_granted INTEGER := 0;
BEGIN
    SELECT o.user_id INTO v_user_id
      FROM orders o
     WHERE o.id = p_order_id
       AND o.user_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    SELECT COALESCE(SUM(e.price_cents), 0) INTO v_live_total
      FROM order_items oi
      JOIN exams e ON e.id = oi.exam_id
     WHERE oi.order_id = p_order_id;

    IF v_live_total > 0 THEN
        RAISE EXCEPTION 'This order requires payment';
    END IF;

    UPDATE orders o
       SET status = 'paid',
           total_cents = 0,
           paid_at = COALESCE(o.paid_at, NOW()),
           provider = 'free'
     WHERE o.id = p_order_id;

    INSERT INTO entitlements (user_id, exam_id, order_id, kind)
    SELECT v_user_id, oi.exam_id, p_order_id, 'free'
      FROM order_items oi
     WHERE oi.order_id = p_order_id
    ON CONFLICT (user_id, exam_id) DO NOTHING;

    GET DIAGNOSTICS v_granted = ROW_COUNT;

    RETURN QUERY SELECT 'paid'::VARCHAR, v_granted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Records how the buyer is paying. Reaching 'awaiting_confirmation' unlocks
-- nothing, so it is safe for a buyer to call.
CREATE OR REPLACE FUNCTION attach_payment_attempt(
    p_order_id UUID,
    p_provider VARCHAR,
    p_request_id VARCHAR DEFAULT NULL,
    p_receipt VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE orders o
       SET status = 'awaiting_confirmation',
           provider = COALESCE(p_provider, o.provider),
           provider_request_id = COALESCE(p_request_id, o.provider_request_id),
           provider_ref = COALESCE(p_receipt, o.provider_ref),
           phone = COALESCE(p_phone, o.phone)
     WHERE o.id = p_order_id
       AND o.user_id = auth.uid()
       AND o.status IN ('pending', 'awaiting_confirmation');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or already settled';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The only path to a paid entitlement. Called by the M-Pesa callback and by
-- admin confirmation, both of which run with the service role.
CREATE OR REPLACE FUNCTION confirm_order_payment(
    p_order_id UUID,
    p_receipt VARCHAR,
    p_payload JSONB DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT user_id INTO v_user_id FROM orders WHERE id = p_order_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    UPDATE orders
       SET status = 'paid',
           provider_ref = COALESCE(p_receipt, provider_ref),
           provider_payload = COALESCE(p_payload, provider_payload),
           paid_at = COALESCE(paid_at, NOW())
     WHERE id = p_order_id;

    INSERT INTO entitlements (user_id, exam_id, order_id, kind)
    SELECT v_user_id, oi.exam_id, p_order_id, 'purchase'
      FROM order_items oi
     WHERE oi.order_id = p_order_id
    ON CONFLICT (user_id, exam_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fail_order_payment(p_order_id UUID, p_reason TEXT)
RETURNS void AS $$
BEGIN
    UPDATE orders
       SET status = 'failed',
           provider_payload = COALESCE(provider_payload, '{}'::jsonb) || jsonb_build_object('failure_reason', p_reason)
     WHERE id = p_order_id
       AND status <> 'paid';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION finalize_free_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION attach_payment_attempt(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated;

-- Never grant these two to buyers.
REVOKE ALL ON FUNCTION confirm_order_payment(UUID, VARCHAR, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION fail_order_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION confirm_order_payment(UUID, VARCHAR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION fail_order_payment(UUID, TEXT) TO service_role;

-- An author always owns what they published.
CREATE OR REPLACE FUNCTION grant_author_entitlement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO entitlements (user_id, exam_id, kind)
        VALUES (NEW.created_by, NEW.id, 'author')
        ON CONFLICT (user_id, exam_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS exams_grant_author_entitlement ON exams;
CREATE TRIGGER exams_grant_author_entitlement
    AFTER INSERT ON exams
    FOR EACH ROW
    EXECUTE FUNCTION grant_author_entitlement();

-- ----------------------------------------------------------------------------
-- 7. BACKFILL EXISTING ROWS
-- ----------------------------------------------------------------------------

-- Anything already public becomes a published catalog paper, free of charge,
-- so nothing that used to be visible disappears behind the new gate.
UPDATE exams
   SET source = 'catalog',
       is_published = TRUE,
       published_at = COALESCE(published_at, created_at),
       exam_type = COALESCE(exam_type, 'end-term'),
       price_cents = COALESCE(price_cents, 0)
 WHERE is_public = TRUE
   AND source = 'user_set';

-- Derive the level/grade labels from the linked grade row where possible.
UPDATE exams e
   SET grade_label = g.name,
       level_slug = CASE
            WHEN g.level = 'pre_primary' THEN 'pp'
            WHEN g.band  = 'lower_primary' THEN 'lower-primary'
            WHEN g.band  = 'upper_primary' THEN 'upper-primary'
            WHEN g.level = 'junior' THEN 'junior-school'
            WHEN g.level = 'senior' THEN 'senior-school'
            ELSE e.level_slug
       END
  FROM grades g
 WHERE e.grade_id = g.id
   AND e.grade_label IS NULL;

UPDATE exams
   SET has_marking_scheme = TRUE
 WHERE marking_scheme_url IS NOT NULL
   AND has_marking_scheme = FALSE;
