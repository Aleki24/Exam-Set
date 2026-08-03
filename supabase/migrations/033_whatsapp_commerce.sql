-- ============================================================================
-- WHATSAPP COMMERCE
-- Migration: 033_whatsapp_commerce.sql
--
-- What the bot needs to sell a paper rather than only find one.
--
-- Deliberately small. `orders`, `order_items`, `entitlements` and
-- `confirm_order_payment` are untouched: `order_items` already carries an
-- `exam_id`, and the payment function already mints one entitlement per item
-- row. Per-paper purchase has worked end to end in this schema since the shop
-- shipped — the bot simply never created such an order. Adding a second order
-- shape for chat would be two paywalls to keep in step, which is the mistake
-- migration 023 avoided for resources and this one avoids again.
-- ============================================================================

ALTER TABLE whatsapp_sessions
    -- The cart, as [{exam_id, title, price_cents}].
    --
    -- Kept in the session rather than given a table: it is one shape, always
    -- read whole, always scoped to one phone, and thrown away at checkout. A
    -- `whatsapp_cart_items` table would be a join and a cleanup job to express
    -- something that is only ever a list.
    ADD COLUMN IF NOT EXISTS cart JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Where the conversation is.
    --
    -- Everything used to be inferred from `pending`, which cannot tell "waiting
    -- for a menu choice" from "waiting for an M-Pesa PIN" — and those need
    -- different answers to the same "1". A number typed while browsing picks a
    -- subject; typed while awaiting payment it means nothing and should say so.
    ADD COLUMN IF NOT EXISTS state VARCHAR(24) NOT NULL DEFAULT 'idle',
    ADD COLUMN IF NOT EXISTS state_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- A human is dealing with this conversation; the bot stays quiet.
    ADD COLUMN IF NOT EXISTS needs_human BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS human_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS human_reason TEXT,

    -- THE 24-HOUR CLOCK.
    --
    -- WhatsApp forbids a free-form message more than 24 hours after the
    -- customer last wrote. Without this column the bot cannot know whether it is
    -- allowed to speak, so it would either send and be rejected by Meta — losing
    -- a paid delivery with no record — or never send at all.
    ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

ALTER TABLE whatsapp_sessions DROP CONSTRAINT IF EXISTS whatsapp_sessions_state_check;
ALTER TABLE whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_state_check
    CHECK (state IN ('idle', 'browsing_level', 'browsing_subject', 'browsing_papers',
                     'confirming', 'awaiting_payment', 'awaiting_link_code', 'human'));

COMMENT ON COLUMN whatsapp_sessions.last_inbound_at IS
    'When this number last messaged us. Decides whether a free-form reply is permitted — see the 24-hour rule.';

-- ----------------------------------------------------------------------------
-- The outbox
--
-- A delivery that could not be sent because the window had closed.
--
-- This table is the difference between "nothing is silently lost" being true and
-- being a wish. A customer whose payment confirms 26 hours after they last wrote
-- has paid and is owed papers; without somewhere to put that, the send fails
-- inside a callback nobody reads and the money is taken for nothing.
--
-- Flushed the moment that number messages again, which re-opens the window.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,

    -- 'text' | 'document'
    kind VARCHAR(12) NOT NULL CHECK (kind IN ('text', 'document')),
    body TEXT,
    -- For documents. The link is re-minted at flush time rather than stored:
    -- a signed URL saved here would expire long before the customer replied.
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    asset VARCHAR(8) CHECK (asset IS NULL OR asset IN ('paper', 'scheme')),

    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

-- The flush reads one phone's unsent rows, oldest first.
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_pending
    ON whatsapp_outbox(phone, created_at)
    WHERE sent_at IS NULL;

-- ----------------------------------------------------------------------------
-- Account link codes
--
-- Joining a WhatsApp number to an account somebody already has on the website.
--
-- Without this, a customer who signed up with an email gets a second, phone-only
-- account the first time they message the bot, and their order history genuinely
-- differs depending on where they look.
--
-- A code shown to a signed-in user and typed into the chat proves control of
-- both ends. The alternative considered — typing an email into the chat — is an
-- account takeover with two words of typing, since nothing about knowing an
-- address proves you own it.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS account_link_codes (
    code VARCHAR(12) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Short. A code that lives for hours is a code that gets shared, screenshot
    -- or shoulder-read, and it grants somebody your purchases.
    expires_at TIMESTAMPTZ NOT NULL,

    -- Single use, kept after redemption so "when did I link this?" has an answer.
    used_at TIMESTAMPTZ,
    used_by_phone VARCHAR(20),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_codes_user ON account_link_codes(user_id, created_at DESC);

ALTER TABLE account_link_codes ENABLE ROW LEVEL SECURITY;

-- A user may see their own codes. Nobody reads anybody else's, and redemption
-- happens through the service role in the webhook — where the code is checked
-- against the whole table, which no end user may do.
DROP POLICY IF EXISTS link_codes_own ON account_link_codes;
CREATE POLICY link_codes_own ON account_link_codes
    FOR SELECT USING (user_id = auth.uid());

-- `whatsapp_outbox` gets no policy at all: it is written and read exclusively by
-- the service role inside the webhook and the payment callback. An RLS-enabled
-- table with no policy denies everyone, which is the correct default for a queue
-- that holds pending deliveries of paid material.
ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;
