-- ============================================================================
-- CLAIMING A DELIVERY, SO A PAID PAPER IS SENT ONCE
-- Migration: 035_delivery_claims.sql
--
-- Reconciled from production. This was applied to the live database
-- (version 20260803065244) before it existed in the repository, so what follows
-- is the exact SQL that ran, recovered from `supabase_migrations.schema_migrations`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_deliveries (
    order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    papers_sent INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_deliveries_stale
    ON whatsapp_deliveries(claimed_at)
    WHERE completed_at IS NULL;

ALTER TABLE whatsapp_deliveries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION claim_order_delivery(p_order_id UUID, p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_claimed BOOLEAN;
BEGIN
    INSERT INTO whatsapp_deliveries (order_id, phone)
    VALUES (p_order_id, p_phone)
    ON CONFLICT (order_id) DO UPDATE
        SET claimed_at = now(), phone = EXCLUDED.phone
        WHERE whatsapp_deliveries.completed_at IS NULL
          AND whatsapp_deliveries.claimed_at < now() - INTERVAL '10 minutes'
    RETURNING TRUE INTO v_claimed;

    RETURN COALESCE(v_claimed, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION complete_order_delivery(p_order_id UUID, p_papers INTEGER DEFAULT 0)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE whatsapp_deliveries
       SET completed_at = now(), papers_sent = p_papers
     WHERE order_id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION release_order_delivery(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM whatsapp_deliveries
     WHERE order_id = p_order_id AND completed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION claim_order_delivery(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_order_delivery(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_order_delivery(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION claim_order_delivery(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_order_delivery(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_order_delivery(UUID) TO service_role;

COMMENT ON TABLE whatsapp_deliveries IS
    'One row per WhatsApp order delivery. The primary key is the lock that stops a retried M-Pesa callback sending a second copy of a paid paper.';
