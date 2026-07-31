-- ============================================================================
-- SUBSCRIPTIONS
-- Migration: 017_subscriptions.sql
--
-- Selling papers one at a time is the wrong shape for the customer. A teacher
-- needs eight to twelve papers a term; at KES 30 each that is a dozen separate
-- M-Pesa prompts for about KES 300. Every established Kenyan site monetises by
-- access instead — Esoma-KE at KES 500/month, Enhanced Education at KES
-- 300/day to 2,000/month — because it is less friction for the buyer and more
-- revenue per customer.
--
-- The model reuses what is already here rather than forking it:
--
--   * An order can now be for a plan instead of a basket of papers. Same
--     orders table, same M-Pesa flow, same confirmation functions.
--   * Access is still decided in one place. `can_download_paper` answers
--     "may this user open this paper?" for both routes: owning it outright,
--     or holding a live subscription.
--
-- Deliberately NOT per-subject. Splitting plans by subject doubles the pricing
-- surface and the support burden for a catalog this size; one all-access pass
-- is easier to sell and easier to explain.
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
