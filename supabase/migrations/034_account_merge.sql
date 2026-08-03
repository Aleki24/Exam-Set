-- ============================================================================
-- MERGING A PHONE ACCOUNT INTO A WEBSITE ACCOUNT
-- Migration: 034_account_merge.sql
--
-- Fixes a real defect in the linking flow, proved against this database.
--
-- WHAT WAS WRONG
--
-- Linking ran one statement:
--
--     UPDATE entitlements SET user_id = <website> WHERE user_id = <phone>
--
-- `entitlements` carries UNIQUE (user_id, exam_id). If the website account
-- already owned even one of the papers — bought on the site, granted free,
-- covered by a subscription — that statement raises 23505, and a failed UPDATE
-- in Postgres rolls back *entirely*. Not the colliding row: all of them.
--
-- Measured here, with a phone account holding two papers and the website
-- account already holding one of them:
--
--     blanket UPDATE ........................ ABORTED, duplicate key
--     papers on the website account after .... 1 of 2  (nothing moved)
--
-- The customer is told "Linked ✅" and every paper they bought over WhatsApp
-- stays stranded on an account they cannot sign into. The overlap is not an
-- edge case either — the likeliest person to link is precisely the one who has
-- bought in both places.
--
-- WHAT THIS DOES INSTEAD
--
-- Moves the papers the target does not already own, discards the ones it does
-- (ownership is not a quantity — owning a paper twice is the same as owning it),
-- and brings the orders across so both surfaces show one history. One function,
-- one transaction, so the merge cannot half-apply.
--
-- The phone's auth user is deliberately left in place. Deleting accounts is
-- irreversible and buys nothing: once the session points at the website
-- account, the empty one is inert.
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
    -- Merging an account into itself is what happens when somebody links a
    -- number that was already linked. It is a no-op, not an error.
    IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
        RETURN jsonb_build_object('moved', 0, 'already_owned', 0, 'orders_moved', 0);
    END IF;

    -- 1. The papers the website account does not have yet.
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

    -- 2. Whatever is left is a paper the website account already owns. Keeping
    --    it would leave the phone account looking like it still owns things,
    --    which is exactly the confusion linking exists to end.
    WITH dropped AS (
        DELETE FROM entitlements WHERE user_id = p_from RETURNING 1
    )
    SELECT count(*) INTO v_dropped FROM dropped;

    -- 3. The receipts follow the papers. `orders` has no per-user uniqueness,
    --    so this one genuinely is a blanket update.
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

-- ----------------------------------------------------------------------------
-- WHO MAY CALL THIS
--
-- Nobody but the server. The function is SECURITY DEFINER and takes two
-- arbitrary user ids, so an exposed EXECUTE grant is "move any account's papers
-- onto mine" in one RPC — a total loss of every purchase on the platform.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which is why
-- the REVOKE below is mandatory rather than tidy. Redemption happens in the
-- webhook under the service role, after a single-use code has proved the caller
-- holds both the signed-in browser and the handset.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION merge_whatsapp_account(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_whatsapp_account(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION merge_whatsapp_account(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION merge_whatsapp_account(UUID, UUID) TO service_role;

COMMENT ON FUNCTION merge_whatsapp_account(UUID, UUID) IS
    'Moves entitlements and orders from a WhatsApp-only account to a website account, skipping papers already owned. Service role only — see migration 034.';
