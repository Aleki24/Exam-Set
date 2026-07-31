-- ============================================================================
-- WHATSAPP BOT
-- Migration: 020_whatsapp.sql
--
-- A teacher texts "form 4 mathematics term 3" and gets the PDF back. Everything
-- the delivery itself needs already exists — `can_download_paper` decides access,
-- signed storage URLs carry the file, and the M-Pesa callback settles the
-- subscription that pays for it. This migration adds only the state that a
-- conversation needs and the database did not previously have to hold.
--
-- Three things:
--   1. Somewhere to remember what was last offered, so a reply of "1" means
--      something.
--   2. A record of which messages have been handled, because Meta retries
--      delivery and a retry must not send a second copy of a paid paper.
--   3. A note on the order of where it came from, so the payment callback knows
--      to deliver over WhatsApp rather than leaving the paper in a library the
--      buyer may never visit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CONVERSATION STATE
--
-- Deliberately thin. This is not a chat log: it holds what was offered and what
-- is being waited on, and nothing else. Message content belongs to WhatsApp,
-- and keeping a second copy of it here would be a liability with no use.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    phone VARCHAR(20) PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- What the bot last offered: candidate exam ids, and the paper being held
    -- until a subscription is paid for.
    pending JSONB,

    -- Rate limiting. A loop on the sending side would otherwise burn the Meta
    -- quota and hammer storage signing.
    message_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Set when someone sends STOP. Nothing is delivered to a muted number.
    muted BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user ON whatsapp_sessions(user_id);

-- ----------------------------------------------------------------------------
-- 2. IDEMPOTENCY
--
-- Meta retries a webhook until it gets a 200, and will happily redeliver one it
-- has already had answered. Without this, a slow reply turns into two PDFs, or
-- two M-Pesa prompts for the same subscription.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    message_id TEXT PRIMARY KEY,
    phone VARCHAR(20),
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_received ON whatsapp_messages(received_at);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--
-- Enabled with no policies at all, which here is the correct configuration
-- rather than an oversight: only the service role touches these tables, and the
-- service role bypasses row level security entirely. No policy means no browser
-- holding the publishable key can read another person's conversation.
--
-- This is the opposite of the app tables, where RLS without policies would lock
-- users out of their own data — hence the explicit note.
-- ----------------------------------------------------------------------------

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. ORDERS KNOW WHERE THEY CAME FROM
--
-- The M-Pesa callback settles every order the same way. It now also needs to
-- know whether to push the result back to a phone.
-- ----------------------------------------------------------------------------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'web';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wa_phone VARCHAR(20);

-- ----------------------------------------------------------------------------
-- 5. PROFILES MUST CARRY THE PHONE NUMBER
--
-- `handle_new_user` copies email and full name out of the new auth user and
-- ignores the phone. That is harmless while every account is created by email,
-- but the bot creates accounts from a phone number and then finds them again by
-- that number — so without this the row is written with phone NULL and the next
-- message from the same person creates another account, forever.
--
-- The first-account-becomes-owner branch is preserved exactly as it was.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR(10) := 'user';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'owner') THEN
        v_role := 'owner';
    END IF;

    INSERT INTO profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.phone,
        v_role
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

-- Looking an account up by phone happens on every inbound message.
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;
