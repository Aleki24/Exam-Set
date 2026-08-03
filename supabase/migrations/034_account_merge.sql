-- ============================================================================
-- MERGING A WHATSAPP ACCOUNT INTO A WEBSITE ACCOUNT
-- Migration: 034_account_merge.sql
--
-- Reconciled from production. This was applied to the live database
-- (version 20260803064535) before it existed in the repository, so what follows
-- is the exact SQL that ran, recovered from `supabase_migrations.schema_migrations`
-- and re-filed here under the number its own comment already refers to.
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_whatsapp_account(p_from UUID, p_to UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_moved   INTEGER := 0;
    v_dropped INTEGER := 0;
    v_orders  INTEGER := 0;
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
        RETURN jsonb_build_object('moved', 0, 'already_owned', 0, 'orders_moved', 0);
    END IF;

    WITH movable AS (
        SELECT e.id
        FROM entitlements e
        WHERE e.user_id = p_from
          AND NOT EXISTS (
              SELECT 1 FROM entitlements t
              WHERE t.user_id = p_to AND t.exam_id = e.exam_id
          )
    ),
    moved AS (
        UPDATE entitlements SET user_id = p_to
        WHERE id IN (SELECT id FROM movable)
        RETURNING 1
    )
    SELECT count(*) INTO v_moved FROM moved;

    WITH dropped AS (
        DELETE FROM entitlements WHERE user_id = p_from RETURNING 1
    )
    SELECT count(*) INTO v_dropped FROM dropped;

    WITH moved_orders AS (
        UPDATE orders SET user_id = p_to WHERE user_id = p_from RETURNING 1
    )
    SELECT count(*) INTO v_orders FROM moved_orders;

    RETURN jsonb_build_object(
        'moved', v_moved,
        'already_owned', v_dropped,
        'orders_moved', v_orders
    );
END;
$$;

REVOKE ALL ON FUNCTION merge_whatsapp_account(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_whatsapp_account(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION merge_whatsapp_account(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION merge_whatsapp_account(UUID, UUID) TO service_role;

COMMENT ON FUNCTION merge_whatsapp_account(UUID, UUID) IS
    'Moves entitlements and orders from a WhatsApp-only account to a website account, skipping papers already owned. Service role only - see migration 034.';
