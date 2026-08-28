-- ============================================================================
-- SKULBASE EXAMS — PRODUCTION SETUP
--
-- Everything the new shop needs, in one script. Paste the whole file into the
-- Supabase SQL editor for the Skulbase Exams project and run it once.
--
-- Assumes migrations 001-011 are already applied (the questions bank, grades,
-- subjects and the original `exams` table). It is safe to re-run: every object
-- is created with IF NOT EXISTS, and every policy is dropped before it is
-- recreated.
--
-- What it does, in order:
--   1. Turns `exams` into a sellable catalog and adds orders, order items and
--      entitlements, with the payment-state functions that gate downloads.
--   2. Adds the owner / admin / user roles and the row level security that
--      decides who may sell.
--   3. Creates the private storage bucket the paper PDFs live in.
--   4. Starts recording which questions have been used, so the setter's
--      "prefer questions I have used least" actually does something.
--   5. Removes the catch-all RLS policies from the early migrations, which
--      silently overrode every ownership rule in parts 1 and 2.
--   6. Adds subscriptions — an all-access pass sold through the same orders
--      table and the same M-Pesa flow as a single paper.
--   7. Closes EXECUTE on the functions that settle payments, which Postgres
--      and Supabase otherwise grant to every visitor by default.
--   8. Pins search_path on every SECURITY DEFINER function, so a privileged
--      function cannot be redirected to another schema's tables.
--   9. Adds the WhatsApp bot's session state, and makes new-account creation
--      copy the phone number onto the profile.
--  10. Adds two columns the code has always read but the database never had:
--      questions.sub_parts and exams.instructions.
--
-- TWO THINGS TO KNOW BEFORE RUNNING
--
--   * Existing exams. Any row currently marked `is_public = TRUE` becomes a
--     published catalog paper priced at 0 (free). That is deliberate — nothing
--     that used to be visible disappears behind the new gate. Reprice or
--     unpublish them afterwards from /admin -> Catalog.
--
--   * The first account wins. Part 2 installs a trigger on auth.users that makes
--     the FIRST account to sign up the owner. If you already have accounts, the
--     earliest one is promoted. Sign in and check /admin -> Team afterwards.
--     If your project already has a trigger named `on_auth_user_created`, this
--     script replaces it.
-- ============================================================================


-- ============================================================================
-- PART 1 OF 10
-- ============================================================================

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


-- ============================================================================
-- PART 2 OF 10
-- ============================================================================

-- ============================================================================
-- ROLES
-- Migration: 013_roles_and_sellers.sql
--
-- Three roles, matching how the platform is actually run:
--
--   owner  — you. Can do everything, and is the only role that can appoint or
--            remove admins.
--   admin  — staff who stock the shop: upload papers, price them, publish or
--            unpublish them, and confirm manual M-Pesa payments.
--   user   — everyone else. Buys papers, downloads what they own, and sets
--            their own exams from the question bank (kept private to them).
--
-- Selling into the shop is an admin action. Setting your own exam is not.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    full_name VARCHAR(255),
    phone VARCHAR(20),

    role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE role <> 'user';
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Only one owner. Everything else is unbounded.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_single_owner ON profiles((role)) WHERE role = 'owner';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. ROLE CHECKS
--
-- SECURITY DEFINER so a policy can read `profiles` without the caller needing
-- read access to every row — and so the policies below cannot recurse.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_role_name()
RETURNS VARCHAR AS $$
    SELECT COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'user');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT current_role_name() IN ('owner', 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
    SELECT current_role_name() = 'owner';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION current_role_name() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_owner() TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3. PROFILE CREATION
--
-- Bootstrap rule: the very first account to sign up becomes the owner. After
-- that everyone signs up as a user, and the owner promotes staff to admin.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR(10) := 'user';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'owner') THEN
        v_role := 'owner';
    END IF;

    INSERT INTO profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        v_role
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Backfill anyone who signed up before this migration.
INSERT INTO profiles (id, email, full_name, role)
SELECT
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
    'user'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Promote the earliest account to owner if nobody holds the role yet.
UPDATE profiles
   SET role = 'owner'
 WHERE id = (SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'owner');

-- ----------------------------------------------------------------------------
-- 4. ROLE MANAGEMENT (owner only)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_user_role(p_email VARCHAR, p_role VARCHAR)
RETURNS TABLE (id UUID, email VARCHAR, role VARCHAR) AS $$
DECLARE
    v_target UUID;
BEGIN
    IF NOT is_owner() THEN
        RAISE EXCEPTION 'Only the owner can change roles';
    END IF;

    IF p_role NOT IN ('admin', 'user') THEN
        RAISE EXCEPTION 'Role must be admin or user';
    END IF;

    SELECT p.id INTO v_target FROM profiles p WHERE lower(p.email) = lower(p_email);
    IF v_target IS NULL THEN
        RAISE EXCEPTION 'No account found for %. They need to sign up first.', p_email;
    END IF;

    -- The owner's own role is not editable here; there is exactly one owner and
    -- demoting yourself would lock the shop out of admin entirely.
    IF (SELECT p.role FROM profiles p WHERE p.id = v_target) = 'owner' THEN
        RAISE EXCEPTION 'The owner role cannot be changed';
    END IF;

    UPDATE profiles p SET role = p_role WHERE p.id = v_target;

    RETURN QUERY SELECT p.id, p.email, p.role FROM profiles p WHERE p.id = v_target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_user_role(VARCHAR, VARCHAR) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. PROFILE RLS
-- ----------------------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles
    FOR SELECT USING (id = auth.uid() OR is_admin());

-- Users may edit their own name and phone. Role changes go through
-- set_user_role, which is owner-only, so the column is protected by a trigger.
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (id = auth.uid());

CREATE OR REPLACE FUNCTION protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role <> OLD.role AND NOT is_owner() THEN
        RAISE EXCEPTION 'Roles can only be changed by the owner';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_protect_role ON profiles;
CREATE TRIGGER profiles_protect_role
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_profile_role();

-- ----------------------------------------------------------------------------
-- 6. WHO MAY SELL
--
-- Replaces the ownership-only policies from migration 012: putting a paper in
-- the shop is now an admin action, while anyone may save their own private set.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "exams_select" ON exams;
CREATE POLICY "exams_select" ON exams
    FOR SELECT USING (
        (source = 'catalog' AND is_published = TRUE)  -- the shop, open to all
        OR created_by = auth.uid()                     -- your own papers
        OR is_admin()                                  -- staff see drafts too
    );

DROP POLICY IF EXISTS "exams_insert_own" ON exams;
CREATE POLICY "exams_insert_own" ON exams
    FOR INSERT WITH CHECK (
        created_by = auth.uid()
        AND (source = 'user_set' OR is_admin())
    );

DROP POLICY IF EXISTS "exams_update_own" ON exams;
CREATE POLICY "exams_update_own" ON exams
    FOR UPDATE USING (created_by = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "exams_delete_own" ON exams;
CREATE POLICY "exams_delete_own" ON exams
    FOR DELETE USING (created_by = auth.uid() OR is_admin());

-- Admins need to see orders to confirm manual M-Pesa payments.
DROP POLICY IF EXISTS "orders_select_own" ON orders;
CREATE POLICY "orders_select_own" ON orders
    FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "order_items_select_own" ON order_items;
CREATE POLICY "order_items_select_own" ON order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
        OR is_admin()
    );

DROP POLICY IF EXISTS "entitlements_select_own" ON entitlements;
CREATE POLICY "entitlements_select_own" ON entitlements
    FOR SELECT USING (auth.uid() = user_id OR is_admin());

-- ----------------------------------------------------------------------------
-- 7. ADMIN PAYMENT CONFIRMATION
--
-- A buyer who paid to the paybill submits their code; an admin confirms it.
-- This wraps the service-role-only confirm_order_payment behind an admin check
-- so it can be called from a signed-in admin session.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_confirm_order(p_order_id UUID, p_receipt VARCHAR DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_user_id UUID;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Only an admin can confirm a payment';
    END IF;

    SELECT user_id INTO v_user_id FROM orders WHERE id = p_order_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    UPDATE orders
       SET status = 'paid',
           provider_ref = COALESCE(p_receipt, provider_ref),
           paid_at = COALESCE(paid_at, NOW())
     WHERE id = p_order_id;

    INSERT INTO entitlements (user_id, exam_id, order_id, kind)
    SELECT v_user_id, oi.exam_id, p_order_id, 'purchase'
      FROM order_items oi
     WHERE oi.order_id = p_order_id
    ON CONFLICT (user_id, exam_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_reject_order(p_order_id UUID, p_reason TEXT)
RETURNS void AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Only an admin can reject a payment';
    END IF;

    UPDATE orders
       SET status = 'failed',
           provider_payload = COALESCE(provider_payload, '{}'::jsonb)
                              || jsonb_build_object('rejected_reason', p_reason)
     WHERE id = p_order_id
       AND status <> 'paid';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_confirm_order(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_reject_order(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. SALES REPORTING (admin)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_sales_summary()
RETURNS TABLE (
    paid_orders BIGINT,
    pending_orders BIGINT,
    revenue_cents BIGINT,
    papers_published BIGINT,
    papers_sold BIGINT
) AS $$
    SELECT
        (SELECT COUNT(*) FROM orders WHERE status = 'paid'),
        (SELECT COUNT(*) FROM orders WHERE status IN ('pending', 'awaiting_confirmation')),
        (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE status = 'paid'),
        (SELECT COUNT(*) FROM exams WHERE source = 'catalog' AND is_published),
        (SELECT COALESCE(SUM(purchase_count), 0) FROM exams WHERE source = 'catalog')
    WHERE is_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_sales_summary() TO authenticated;


-- ============================================================================
-- PART 3 OF 10 — PRIVATE STORAGE BUCKET
--
-- Only needed if you are using Supabase Storage for the paper PDFs (the default
-- when the R2_* variables are not set). Creates a private bucket; no public
-- policies are added, because every download is signed server-side by
-- /api/papers/[id]/download after it has checked entitlement.
-- ============================================================================

-- Word documents are accepted alongside PDFs — a scheme of work is bought to be
-- edited, not printed. This list is the bucket's copy of the one in
-- `src/lib/uploadFormats.ts`; the two have to agree, or the app authorises an
-- upload that storage then refuses with nothing able to explain it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'exam-papers',
    'exam-papers',
    FALSE,
    26214400,
    ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
    ]
)
ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = 26214400,
        allowed_mime_types = ARRAY[
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];


-- ============================================================================
-- PART 4 OF 10 — QUESTION USAGE TRACKING
-- ============================================================================

-- ============================================================================
-- QUESTION USAGE TRACKING
-- Migration: 015_question_usage.sql
--
-- The setter offers "prefer questions I have used least", and the question pool
-- is ordered by `questions.usage_count`. Nothing was ever writing that column,
-- so it sat at 0 for every row and the preference did nothing.
--
-- Usage is recorded in the database rather than the client, so it counts however
-- a paper was made: saved from the setter, published to the shop, or created
-- through the API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Single-question increment
--
-- Referenced by questionService.incrementQuestionUsage. SECURITY DEFINER so a
-- teacher can record usage without write access to the whole questions row.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_question_usage(question_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE questions
       SET usage_count = COALESCE(usage_count, 0) + 1
     WHERE id = question_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_question_usage(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Bump every question in a new paper
--
-- `exams.question_ids` is a JSONB array of question UUIDs. On insert, each one
-- gets its counter raised and the paper recorded against it, which is what
-- powers both the "used N times" hint in the bank and the duplication check.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION bump_question_usage_for_exam()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.question_ids IS NULL OR jsonb_array_length(NEW.question_ids) = 0 THEN
        RETURN NEW;
    END IF;

    UPDATE questions q
       SET usage_count = COALESCE(q.usage_count, 0) + 1,
           used_in_exam_ids =
               CASE
                   WHEN COALESCE(q.used_in_exam_ids, '[]'::jsonb) @> to_jsonb(NEW.id::text)
                       THEN q.used_in_exam_ids
                   ELSE COALESCE(q.used_in_exam_ids, '[]'::jsonb) || to_jsonb(NEW.id::text)
               END
      FROM jsonb_array_elements_text(NEW.question_ids) AS ids(question_id)
     WHERE q.id = ids.question_id::uuid;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS exams_bump_question_usage ON exams;
CREATE TRIGGER exams_bump_question_usage
    AFTER INSERT ON exams
    FOR EACH ROW
    EXECUTE FUNCTION bump_question_usage_for_exam();

-- ----------------------------------------------------------------------------
-- 3. Backfill from papers that already exist
--
-- Without this, every question created before today still looks unused, and the
-- setter would keep handing out the same ones.
-- ----------------------------------------------------------------------------

WITH usage AS (
    SELECT ids.question_id::uuid AS question_id,
           COUNT(*)              AS times_used,
           jsonb_agg(DISTINCT e.id::text) AS exam_ids
      FROM exams e
      CROSS JOIN LATERAL jsonb_array_elements_text(
              COALESCE(e.question_ids, '[]'::jsonb)
          ) AS ids(question_id)
     WHERE jsonb_typeof(COALESCE(e.question_ids, '[]'::jsonb)) = 'array'
     GROUP BY ids.question_id
)
UPDATE questions q
   SET usage_count = usage.times_used,
       used_in_exam_ids = usage.exam_ids
  FROM usage
 WHERE q.id = usage.question_id
   AND COALESCE(q.usage_count, 0) = 0;


-- ============================================================================
-- PART 5 OF 10 — TIGHTEN ROW LEVEL SECURITY
-- ============================================================================

-- ============================================================================
-- TIGHTEN ROW LEVEL SECURITY
-- Migration: 016_tighten_rls.sql
--
-- The early migrations shipped catch-all policies — `FOR ALL USING (true)` — on
-- every table. Postgres ORs policies together, so those silently overrode the
-- ownership rules added in 012 and 013. On a live deployment that meant anyone
-- holding the anon key, which is embedded in the frontend bundle and therefore
-- public by design, could:
--
--   * set price_cents = 0 on any paper and download it free
--   * publish their own rows into the shop
--   * read every unpublished draft and every teacher's private paper
--   * delete the entire question bank
--
-- This migration removes those overrides. Reads stay open where the content is
-- genuinely public (the curriculum lookups and the shared question bank); writes
-- now require a real account; and `exams` falls back to the ownership policies
-- from 012/013, which already cover SELECT, INSERT, UPDATE and DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXAMS — the paywall
--
-- Nothing replaces these: exams_select, exams_insert_own, exams_update_own and
-- exams_delete_own from migrations 012/013 provide full coverage, and they are
-- the policies that make published/draft and paid/free mean anything.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public Write Exams" ON exams;
DROP POLICY IF EXISTS "Public Read Exams" ON exams;

-- ----------------------------------------------------------------------------
-- 2. QUESTION BANK AND LOOKUPS
--
-- Reading stays public: the shop and the setter both need it before sign-in, and
-- none of it is secret. Writing moves from "anyone at all" to "a signed-in
-- account", which is the actual hole. Deliberately not admin-only — teachers add
-- questions from the setter, and locking writes to admins would break that.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
    write_policies TEXT[] := ARRAY[
        'questions:Public Write Questions',
        'curriculums:Public Write Curriculums',
        'grades:Public Write Grades',
        'subjects:Public Write Subjects',
        'grade_subjects:Public Write GradeSubjects',
        'subject_topics:topics_all',
        'paper_templates:templates_all',
        'question_templates:question_templates_all'
    ];
    entry TEXT;
    tbl TEXT;
    pol TEXT;
BEGIN
    FOREACH entry IN ARRAY write_policies LOOP
        tbl := split_part(entry, ':', 1);
        pol := split_part(entry, ':', 2);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
            tbl || '_write_authenticated', tbl
        );
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. TABLES WITH NO RLS AT ALL
--
-- strands and image_bank were fully exposed. Enabling RLS without policies would
-- lock the app out entirely, so each gets the same read-open / write-signed-in
-- shape as the rest of the bank.
-- ----------------------------------------------------------------------------

ALTER TABLE strands ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS strands_read ON strands;
CREATE POLICY strands_read ON strands FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS strands_write_authenticated ON strands;
CREATE POLICY strands_write_authenticated ON strands
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS image_bank_read ON image_bank;
CREATE POLICY image_bank_read ON image_bank FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS image_bank_write_authenticated ON image_bank;
CREATE POLICY image_bank_write_authenticated ON image_bank
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);


-- ============================================================================
-- PART 6 OF 10 — SUBSCRIPTIONS
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. PLANS
--
-- A table rather than a hardcoded list so prices can move without a deploy —
-- pricing is the thing most likely to change after launch.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscription_plans (
    slug VARCHAR(40) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,

    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'KES',
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),

    -- Ordering and presentation in the UI
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Anchored on the KES 500/month the market has already settled on, with the
-- longer plans priced to make the term option the obvious pick.
INSERT INTO subscription_plans (slug, name, description, price_cents, duration_days, sort_order, is_featured)
VALUES
    ('monthly', 'Monthly',  'Every paper on the site for 30 days.',            50000,  30, 1, FALSE),
    ('termly',  'One term', 'Covers a full school term — the best value.',    120000, 120, 2, TRUE),
    ('yearly',  'Yearly',   'A full academic year, billed once.',             350000, 365, 3, FALSE)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_readable ON subscription_plans;
CREATE POLICY plans_readable ON subscription_plans FOR SELECT USING (is_active OR is_admin());

DROP POLICY IF EXISTS plans_admin_write ON subscription_plans;
CREATE POLICY plans_admin_write ON subscription_plans FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ----------------------------------------------------------------------------
-- 2. SUBSCRIPTIONS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_slug VARCHAR(40) NOT NULL REFERENCES subscription_plans(slug),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'cancelled')),

    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
    ON subscriptions(user_id) WHERE status = 'active';

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only to the holder. Only the confirmation functions create these, so a
-- browser can no more grant itself a subscription than it can a purchase.
DROP POLICY IF EXISTS subscriptions_select_own ON subscriptions;
CREATE POLICY subscriptions_select_own ON subscriptions
    FOR SELECT USING (user_id = auth.uid() OR is_admin());

-- ----------------------------------------------------------------------------
-- 3. ORDERS CAN BUY A PLAN
--
-- An order is now either a basket of papers or a single plan, never both. That
-- keeps the M-Pesa flow, the reference, and the admin queue identical for each.
-- ----------------------------------------------------------------------------

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS plan_slug VARCHAR(40) REFERENCES subscription_plans(slug);

-- ----------------------------------------------------------------------------
-- 4. ACCESS
--
-- One question, one answer, used by every route that releases a file.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM subscriptions
         WHERE user_id = p_user_id
           AND status = 'active'
           AND expires_at > NOW()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_download_paper(p_exam_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT
        -- Free papers, and papers you wrote
        EXISTS (SELECT 1 FROM exams e
                 WHERE e.id = p_exam_id
                   AND (e.price_cents = 0 OR e.created_by = p_user_id))
        -- Papers you bought or claimed
        OR EXISTS (SELECT 1 FROM entitlements en
                    WHERE en.exam_id = p_exam_id AND en.user_id = p_user_id)
        -- Or a live subscription, which covers the whole catalog
        OR has_active_subscription(p_user_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION has_active_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_download_paper(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. ACTIVATION
--
-- Hooked into the existing confirmation path, so a subscription becomes live by
-- exactly the same route a purchase does: the M-Pesa callback, or an admin
-- confirming a paybill payment. Nothing new can mark an order paid.
--
-- Renewing while still active extends from the current expiry rather than from
-- today, so nobody loses days by paying early.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION activate_subscription_for_order(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_user_id UUID;
    v_plan VARCHAR(40);
    v_days INTEGER;
    v_starts TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT o.user_id, o.plan_slug INTO v_user_id, v_plan
      FROM orders o WHERE o.id = p_order_id;

    IF v_plan IS NULL THEN
        RETURN;  -- a paper order; nothing to do
    END IF;

    SELECT duration_days INTO v_days FROM subscription_plans WHERE slug = v_plan;
    IF v_days IS NULL THEN
        RAISE EXCEPTION 'Unknown plan %', v_plan;
    END IF;

    -- Extend rather than restart when one is already running.
    SELECT GREATEST(COALESCE(MAX(expires_at), NOW()), NOW()) INTO v_starts
      FROM subscriptions
     WHERE user_id = v_user_id AND status = 'active' AND expires_at > NOW();

    INSERT INTO subscriptions (user_id, plan_slug, order_id, status, started_at, expires_at)
    VALUES (v_user_id, v_plan, p_order_id, 'active', NOW(), v_starts + (v_days || ' days')::INTERVAL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-declare the two confirmation functions so they also activate a plan. The
-- paper-granting half is unchanged.
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

    PERFORM activate_subscription_for_order(p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_confirm_order(p_order_id UUID, p_receipt VARCHAR DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_user_id UUID;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Only an admin can confirm a payment';
    END IF;

    SELECT user_id INTO v_user_id FROM orders WHERE id = p_order_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    UPDATE orders
       SET status = 'paid',
           provider_ref = COALESCE(p_receipt, provider_ref),
           paid_at = COALESCE(paid_at, NOW())
     WHERE id = p_order_id;

    INSERT INTO entitlements (user_id, exam_id, order_id, kind)
    SELECT v_user_id, oi.exam_id, p_order_id, 'purchase'
      FROM order_items oi
     WHERE oi.order_id = p_order_id
    ON CONFLICT (user_id, exam_id) DO NOTHING;

    PERFORM activate_subscription_for_order(p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION confirm_order_payment(UUID, VARCHAR, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION confirm_order_payment(UUID, VARCHAR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION admin_confirm_order(UUID, VARCHAR) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. EXPIRY
--
-- Nothing runs on a schedule here, so rather than trusting a status column to be
-- current, every read checks expires_at. This just tidies the label.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_lapsed_subscriptions()
RETURNS void AS $$
BEGIN
    UPDATE subscriptions SET status = 'expired'
     WHERE status = 'active' AND expires_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7. ADMIN REPORTING
-- ----------------------------------------------------------------------------

-- Two new columns change the return shape, and CREATE OR REPLACE cannot widen a
-- TABLE signature — it has to be dropped first.
DROP FUNCTION IF EXISTS admin_sales_summary();

CREATE OR REPLACE FUNCTION admin_sales_summary()
RETURNS TABLE (
    paid_orders BIGINT,
    pending_orders BIGINT,
    revenue_cents BIGINT,
    papers_published BIGINT,
    papers_sold BIGINT,
    active_subscribers BIGINT,
    subscription_revenue_cents BIGINT
) AS $$
    SELECT
        (SELECT COUNT(*) FROM orders WHERE status = 'paid'),
        (SELECT COUNT(*) FROM orders WHERE status IN ('pending', 'awaiting_confirmation')),
        (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE status = 'paid'),
        (SELECT COUNT(*) FROM exams WHERE source = 'catalog' AND is_published),
        (SELECT COALESCE(SUM(purchase_count), 0) FROM exams WHERE source = 'catalog'),
        (SELECT COUNT(DISTINCT user_id) FROM subscriptions
          WHERE status = 'active' AND expires_at > NOW()),
        (SELECT COALESCE(SUM(total_cents), 0) FROM orders
          WHERE status = 'paid' AND plan_slug IS NOT NULL)
    WHERE is_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_sales_summary() TO authenticated;


-- ============================================================================
-- PART 7 OF 10 — LOCK DOWN THE FUNCTIONS THAT SETTLE MONEY
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SETTLEMENT — service role only
--
-- The M-Pesa callback carries no user session and uses the service role, so
-- nothing legitimate loses access here.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION confirm_order_payment(UUID, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_order_payment(UUID, VARCHAR, JSONB) TO service_role;

REVOKE ALL ON FUNCTION activate_subscription_for_order(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION activate_subscription_for_order(UUID) TO service_role;

REVOKE ALL ON FUNCTION fail_order_payment(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fail_order_payment(UUID, TEXT) TO service_role;

-- Housekeeping, not a user action.
REVOKE ALL ON FUNCTION expire_lapsed_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_lapsed_subscriptions() TO service_role;

-- ----------------------------------------------------------------------------
-- 2. TRIGGER FUNCTIONS
--
-- These are invoked by the triggers that own them and are never meant to be
-- called by hand. Postgres rejects a direct call anyway, so this is tidiness
-- rather than a hole — but it keeps the audit above honest, so that anything
-- still executable by `authenticated` is something that deliberately is.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION grant_author_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bump_question_usage_for_exam() FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- PART 8 OF 10 — PIN search_path ON EVERY SECURITY DEFINER FUNCTION
-- ============================================================================

-- ============================================================================

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prosecdef
           AND NOT EXISTS (
               SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                WHERE c LIKE 'search_path=%'
           )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
    END LOOP;
END $$;


-- ============================================================================
-- PART 9 OF 10 — WHATSAPP BOT
-- ============================================================================

-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CONVERSATION STATE
--
-- Deliberately thin. This is not a chat log: it holds what was offered and what
-- is being waited on, and nothing else. Message content belongs to WhatsApp,
-- and keeping a second copy of it here would be a liability with no use.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    phone VARCHAR(20) PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- What the bot last offered: candidate exam ids, and the paper being held
    -- until a subscription is paid for.
    pending JSONB,

    -- Rate limiting. A loop on the sending side would otherwise burn the Meta
    -- quota and hammer storage signing.
    message_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Set when someone sends STOP. Nothing is delivered to a muted number.
    muted BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user ON whatsapp_sessions(user_id);

-- ----------------------------------------------------------------------------
-- 2. IDEMPOTENCY
--
-- Meta retries a webhook until it gets a 200, and will happily redeliver one it
-- has already had answered. Without this, a slow reply turns into two PDFs, or
-- two M-Pesa prompts for the same subscription.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    message_id TEXT PRIMARY KEY,
    phone VARCHAR(20),
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_received ON whatsapp_messages(received_at);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--
-- Enabled with no policies at all, which here is the correct configuration
-- rather than an oversight: only the service role touches these tables, and the
-- service role bypasses row level security entirely. No policy means no browser
-- holding the publishable key can read another person's conversation.
--
-- This is the opposite of the app tables, where RLS without policies would lock
-- users out of their own data — hence the explicit note.
-- ----------------------------------------------------------------------------

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. ORDERS KNOW WHERE THEY CAME FROM
--
-- The M-Pesa callback settles every order the same way. It now also needs to
-- know whether to push the result back to a phone.
-- ----------------------------------------------------------------------------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'web';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wa_phone VARCHAR(20);

-- ----------------------------------------------------------------------------
-- 5. PROFILES MUST CARRY THE PHONE NUMBER
--
-- `handle_new_user` copies email and full name out of the new auth user and
-- ignores the phone. That is harmless while every account is created by email,
-- but the bot creates accounts from a phone number and then finds them again by
-- that number — so without this the row is written with phone NULL and the next
-- message from the same person creates another account, forever.
--
-- The first-account-becomes-owner branch is preserved exactly as it was.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR(10) := 'user';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'owner') THEN
        v_role := 'owner';
    END IF;

    INSERT INTO profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.phone,
        v_role
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

-- Looking an account up by phone happens on every inbound message.
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;


-- ============================================================================
-- PART 10 OF 10 — SCHEMA DRIFT
-- ============================================================================


ALTER TABLE questions ADD COLUMN IF NOT EXISTS sub_parts JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN questions.sub_parts IS
    'Array of question sub-parts, each with id, label (a, b, c...), text and marks.';

ALTER TABLE exams ADD COLUMN IF NOT EXISTS instructions TEXT;

COMMENT ON COLUMN exams.instructions IS
    'Rubric printed under INSTRUCTIONS TO CANDIDATES on the generated paper.';
