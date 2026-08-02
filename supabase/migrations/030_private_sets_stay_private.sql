-- ============================================================================
-- PRIVATE SETS STAY PRIVATE
-- Migration: 030_private_sets_stay_private.sql
--
-- Narrows the admin read on `exams` to the catalog, which is what it was
-- written for.
--
-- WHAT WAS WRONG
--
-- Migration 013 gave admins a blanket read:
--
--     OR is_admin()   -- staff see drafts too
--
-- The comment says drafts, and drafts are catalog papers waiting to be
-- published. The clause as written is wider than the sentence explaining it: it
-- also hands every admin every learner's private saved paper.
--
-- That was already more than intended. It became sharper with practice sets,
-- which are private `user_set` rows named after the topic somebody is failing —
-- "Fractions — practice", "Photosynthesis — practice". A list of those is a list
-- of a named learner's weaknesses, and staff running a shop have no business
-- reading it to price papers.
--
-- The fix is to say what the comment already said. Admins keep every catalog
-- row, published or draft, which is the entire job: reviewing, pricing,
-- publishing and unpublishing stock. They lose other people's private work,
-- which was never part of it.
--
-- Nothing breaks. The only admin surface that reads this table,
-- /api/admin/papers, already filters `source = 'catalog'` — so it was never
-- relying on the wider grant, and the narrower policy returns it exactly the
-- same rows.
--
-- An owner needing a specific private row for support still has the service
-- role, which bypasses RLS. That is the right shape: deliberate, logged at the
-- point of use, and not a standing grant to everyone with a staff account.
-- ============================================================================

DROP POLICY IF EXISTS "exams_select" ON exams;
CREATE POLICY "exams_select" ON exams
    FOR SELECT USING (
        (source = 'catalog' AND is_published = TRUE)   -- the shop, open to all
        OR created_by = auth.uid()                      -- your own papers
        OR (is_admin() AND source = 'catalog')          -- staff see catalog drafts
    );
