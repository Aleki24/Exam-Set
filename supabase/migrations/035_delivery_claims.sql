-- ============================================================================
-- ONE DELIVERY PER ORDER, GUARANTEED
-- Migration: 035_delivery_claims.sql
--
-- The M-Pesa callback already refuses to settle an order twice:
--
--     if (order.status === 'paid') return ack;   // Safaricom retries
--
-- That is a read, then a write, with a network round trip in between. Safaricom
-- retries until it gets a 200, and two retries landing inside that gap both see
-- `pending` and both proceed. `confirm_order_payment` is safe — entitlements are
-- UNIQUE (user_id, exam_id), so the second one cannot double-grant. The delivery
-- is not: it would send a second copy of every PDF.
--
-- `deliverOrder` guarded that with two heuristics — a `delivered_order` marker
-- on the session and a count of outbox rows — and both are read-then-write in
-- exactly the same way. Checking harder does not make a check atomic.
--
-- So the claim moves into the database, where "only one of you may proceed" is a
-- primary key rather than an intention.
--
-- WHY A CLAIM CAN BE TAKEN OVER
--
-- A claim that is never released would be worse than a duplicate: a process that
-- dies between claiming and sending would leave a paid order permanently
-- undeliverable, which is the one failure this whole subsystem exists to
-- prevent. So an incomplete claim older than ten minutes can be taken over.
-- Ten minutes is far longer than a delivery takes and far shorter than a
-- customer's patience.
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_deliveries (
    -- The primary key *is* the lock. One row per order, and the second inserter
    -- loses.
    order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,

    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Null means in flight. Set once the papers are actually out.
    completed_at TIMESTAMPTZ,
    papers_sent INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_deliveries_stale
    ON whatsapp_deliveries(claimed_at)
    WHERE completed_at IS NULL;

-- Written and read only by the webhook and the payment callback, both of which
-- run as the service role. RLS on with no policy denies everyone else, which is
-- the right default for a table that gates handing out paid material.
ALTER TABLE whatsapp_deliveries ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Claiming
--
-- Returns true to exactly one caller. `ON CONFLICT DO UPDATE ... WHERE` takes
-- the row over when the previous claim is stale and returns nothing when it is
-- not, so a live delivery is never interrupted and a dead one is never stuck.
-- ----------------------------------------------------------------------------

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

    -- No row came back: somebody else holds a live claim, or the delivery is
    -- already finished. Either way this caller must not send.
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

-- ----------------------------------------------------------------------------
-- Releasing
--
-- When a delivery fails outright, the claim is dropped rather than completed, so
-- the next callback retry can pick it up immediately instead of waiting out the
-- ten-minute staleness window.
-- ----------------------------------------------------------------------------

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

-- These take an arbitrary order id and decide whether paid material goes out.
-- Postgres grants EXECUTE to PUBLIC by default, so revoking is required, not
-- tidy: a customer who could call `release_order_delivery` could re-trigger
-- somebody else's delivery, and one who could call `complete_order_delivery`
-- could suppress a delivery that had been paid for.
REVOKE ALL ON FUNCTION claim_order_delivery(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_order_delivery(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_order_delivery(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION claim_order_delivery(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_order_delivery(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_order_delivery(UUID) TO service_role;

COMMENT ON TABLE whatsapp_deliveries IS
    'One row per WhatsApp order delivery. The primary key is the lock that stops a retried M-Pesa callback sending a second copy of a paid paper.';
