-- ============================================================================
-- KNOWING WHETHER A PAPER ACTUALLY ARRIVED
-- Migration: 036_outbound_tracking.sql
--
-- A 200 from Meta's send endpoint means the message was accepted, not that it
-- was delivered. Delivery is reported later on the webhook, asynchronously, and
-- a document can fail there for entirely ordinary reasons: Meta could not fetch
-- the link before the signature expired, the file is over the 100 MB limit, the
-- customer has blocked the business.
--
-- Until now the bot discarded the message id Meta returned and the webhook threw
-- the status reports away. So a failed delivery of a paid paper produced no
-- error anywhere, and the customer saying "it never came" could not be checked
-- against anything. The bot had already said "Your papers have been sent ✅".
--
-- This records what was sent, so a `failed` status can be matched back to a
-- paper and an order, re-queued, and put in front of a person.
--
-- WHAT IS NOT STORED
--
-- Message bodies. Migration 020 declined to keep a second copy of people's
-- conversations and that still holds — this table records that a document for
-- exam X on order Y was sent to a number and what became of it. The trail is
-- about delivery, not content.
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_outbound (
    -- Meta's id for the message. The only thing that ties a later status report
    -- back to what was sent.
    message_id TEXT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,

    kind VARCHAR(12) NOT NULL CHECK (kind IN ('text', 'document')),
    exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    asset VARCHAR(8) CHECK (asset IS NULL OR asset IN ('paper', 'scheme')),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

    -- sent → delivered → read, or failed.
    status VARCHAR(12) NOT NULL DEFAULT 'sent',
    error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Set when a failure has been turned back into a queued delivery, so a
    -- repeated `failed` report — Meta can send more than one — does not queue
    -- the same paper twice.
    recovered_at TIMESTAMPTZ
);

-- Support: "what did we send this number, and did it land?"
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_phone
    ON whatsapp_outbound(phone, created_at DESC);

-- The failures worth acting on: a paid document that did not arrive and has not
-- yet been recovered.
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_failed
    ON whatsapp_outbound(created_at DESC)
    WHERE status = 'failed' AND recovered_at IS NULL;

-- Service role only, like every other table in this subsystem.
ALTER TABLE whatsapp_outbound ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_outbound IS
    'One row per message Meta accepted, so a later delivery-status report can be matched back to the paper and order it carried. No message bodies — see migration 020.';
