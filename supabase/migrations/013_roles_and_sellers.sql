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
