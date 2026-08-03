-- ============================================================================
-- WHATSAPP COMMERCE
-- Migration: 033_whatsapp_commerce.sql
--
-- Reconciled from production. This was applied to the live database
-- (version 20260803060548) before it existed in the repository, so what follows
-- is the exact SQL that ran, recovered from `supabase_migrations.schema_migrations`
-- and re-filed here under the number its own comments already refer to.
-- ============================================================================

-- What the bot needs to sell a paper rather than only find one. orders,
-- order_items, entitlements and confirm_order_payment are untouched:
-- order_items already carries exam_id and the payment function already mints an
-- entitlement per item row. See supabase/migrations/033_whatsapp_commerce.sql.

ALTER TABLE whatsapp_sessions
    ADD COLUMN IF NOT EXISTS cart JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS state VARCHAR(24) NOT NULL DEFAULT 'idle',
    ADD COLUMN IF NOT EXISTS state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS needs_human BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS human_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS human_reason TEXT,
    -- The 24-hour clock. Without it the bot cannot know whether a free-form
    -- reply is even permitted.
    ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

ALTER TABLE whatsapp_sessions DROP CONSTRAINT IF EXISTS whatsapp_sessions_state_check;
ALTER TABLE whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_state_check
    CHECK (state IN ('idle', 'browsing_level', 'browsing_subject', 'browsing_papers',
                     'confirming', 'awaiting_payment', 'awaiting_link_code', 'human'));

COMMENT ON COLUMN whatsapp_sessions.last_inbound_at IS
    'When this number last messaged us. Decides whether a free-form reply is permitted — the 24-hour rule.';

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    kind VARCHAR(12) NOT NULL CHECK (kind IN ('text', 'document')),
    body TEXT,
    -- The link is re-minted at flush time: a signed URL stored here would expire
    -- long before the customer replied.
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    asset VARCHAR(8) CHECK (asset IS NULL OR asset IN ('paper', 'scheme')),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_pending
    ON whatsapp_outbox(phone, created_at) WHERE sent_at IS NULL;

CREATE TABLE IF NOT EXISTS account_link_codes (
    code VARCHAR(12) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by_phone VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_codes_user ON account_link_codes(user_id, created_at DESC);

ALTER TABLE account_link_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS link_codes_own ON account_link_codes;
CREATE POLICY link_codes_own ON account_link_codes
    FOR SELECT USING (user_id = auth.uid());

-- No policy at all: written and read only by the service role. RLS enabled with
-- no policy denies everyone, which is right for a queue holding paid deliveries.
ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;
