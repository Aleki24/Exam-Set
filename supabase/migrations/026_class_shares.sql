-- ============================================================================
-- CLASS SHARES
-- Migration: 026_class_shares.sql
--
-- A teacher hands a class a link. The class opens it and sees the papers the
-- teacher chose — without accounts, without sign-in, on whatever phone they
-- have.
--
-- WHAT A SHARE LINK DOES AND DOES NOT GRANT
--
-- It grants *visibility of a list*. It does not grant downloads of paid
-- material, and this is the line the whole design defends.
--
-- The tempting version — a link that lets anyone holding it download whatever
-- the teacher bought — is a paywall with a public bypass. One link posted in a
-- WhatsApp group and the entire catalogue is free for the county. So the shared
-- page lists what the teacher chose and links to each resource; the download
-- route is untouched and still asks `can_download_paper` for whoever is
-- actually asking. Free resources download for anyone, exactly as they do
-- everywhere else. Paid ones need an entitlement, exactly as they do
-- everywhere else.
--
-- That makes a share link a teaching aid rather than a distribution channel,
-- which is what it was asked to be.
--
-- The token is unguessable, expiring and revocable, because a link that travels
-- through WhatsApp will eventually reach somebody it was not meant for, and the
-- teacher needs to be able to end that.
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The URL segment. Generated server-side from a cryptographic source; never
    -- sequential, never derived from anything about the teacher or the class.
    token VARCHAR(64) NOT NULL UNIQUE,

    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- What the class is told this is. Free text and shown verbatim, so it is
    -- length-capped and escaped at render.
    title VARCHAR(160) NOT NULL,
    note TEXT,

    -- The resources on the list. Deliberately an array of ids rather than a
    -- join table: a share is a snapshot a teacher assembled, it is read as one
    -- unit, and it is never queried from the other direction.
    exam_ids UUID[] NOT NULL DEFAULT '{}',

    -- Every link ends. A share with no expiry is a permanent public URL that
    -- somebody forgot about, and those are the ones that leak.
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,

    -- So a teacher can see whether the class actually opened it.
    view_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_shares_token ON class_shares(token);
CREATE INDEX IF NOT EXISTS idx_class_shares_owner ON class_shares(created_by, created_at DESC);

ALTER TABLE class_shares ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Only the teacher who made it can see it, change it or end it.
--
-- There is no public SELECT policy, and that is on purpose: an anonymous
-- visitor holding a token does not read this table directly. The share route
-- resolves the token server-side through the service role and returns only the
-- fields the class needs. A public policy would mean anyone could enumerate
-- every share on the platform by querying with no filter — RLS restricts rows,
-- not curiosity about how many there are.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS class_shares_select_own ON class_shares;
CREATE POLICY class_shares_select_own ON class_shares
    FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS class_shares_insert_own ON class_shares;
CREATE POLICY class_shares_insert_own ON class_shares
    FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS class_shares_update_own ON class_shares;
CREATE POLICY class_shares_update_own ON class_shares
    FOR UPDATE USING (created_by = auth.uid());

DROP POLICY IF EXISTS class_shares_delete_own ON class_shares;
CREATE POLICY class_shares_delete_own ON class_shares
    FOR DELETE USING (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- Counting a view
--
-- SECURITY DEFINER because the class has no session and no read access to the
-- table. Narrow on purpose: it takes a token, increments one counter, and
-- returns nothing. It cannot be used to discover whether a token exists,
-- because it behaves identically either way.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_share_view(p_token VARCHAR)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE class_shares
       SET view_count = view_count + 1
     WHERE token = p_token
       AND revoked_at IS NULL
       AND expires_at > now();
END;
$$;

REVOKE ALL ON FUNCTION record_share_view(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_share_view(VARCHAR) TO anon, authenticated;
