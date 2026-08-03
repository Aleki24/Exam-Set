-- ============================================================================
-- WHAT WE SENT, SO A DELIVERY REPORT MEANS SOMETHING
-- Migration: 036_outbound_tracking.sql
--
-- Reconciled from production. This was applied to the live database
-- (version 20260803070515) before it existed in the repository, so what follows
-- is the exact SQL that ran, recovered from `supabase_migrations.schema_migrations`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_outbound (
    message_id TEXT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,

    kind VARCHAR(12) NOT NULL CHECK (kind IN ('text', 'document')),
    exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    asset VARCHAR(8) CHECK (asset IS NULL OR asset IN ('paper', 'scheme')),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

    status VARCHAR(12) NOT NULL DEFAULT 'sent',
    error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recovered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_phone
    ON whatsapp_outbound(phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_failed
    ON whatsapp_outbound(created_at DESC)
    WHERE status = 'failed' AND recovered_at IS NULL;

ALTER TABLE whatsapp_outbound ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_outbound IS
    'One row per message Meta accepted, so a later delivery-status report can be matched back to the paper and order it carried. No message bodies - see migration 020.';
