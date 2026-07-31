-- ============================================================================
-- LOCK DOWN THE FUNCTIONS THAT SETTLE MONEY
-- Migration: 018_lock_down_settlement_functions.sql
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and Supabase
-- adds explicit grants to `anon` and `authenticated` on top. A SECURITY DEFINER
-- function therefore ships wide open unless it is closed on purpose — it runs as
-- its owner, for anybody who asks.
--
-- Most of the functions here defend themselves: set_user_role checks is_owner(),
-- the admin_* ones check is_admin(), attach_payment_attempt and
-- finalize_free_order match auth.uid() against the order and re-check the live
-- price. Three do not, because they were only ever meant to be reached by the
-- M-Pesa callback holding the service role:
--
--   confirm_order_payment             marks an order paid and grants the papers
--   activate_subscription_for_order   starts a subscription
--   fail_order_payment                marks an order failed
--
-- Callable by `authenticated`, the first two are a complete bypass of the
-- paywall: create your own pending order, call the function with its id, and
-- collect the downloads — or a year's subscription — without paying. The third
-- is not theft but sabotage: anyone could fail someone else's checkout.
--
-- REVOKE ... FROM PUBLIC alone does not fix this. It removes only the implicit
-- PUBLIC grant and leaves the explicit anon/authenticated ones in place, which
-- is exactly how this survived a previous pass.
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
