-- ============================================================================
-- REPRICE TO MARKET
-- Migration: 029_reprice_to_market.sql
--
-- Brings the all-access pass in line with what the market actually charges.
--
--   was                          now
--   monthly  KES   500 / 30d     KES 550 / 30d
--   termly   KES 1,200 / 120d    KES 799 / 120d
--   yearly   KES 3,500 / 365d    KES 999 / 365d
--
-- WHY
--
-- kcserevision.com — the closest comparable, selling the same kind of resource
-- library to the same teachers — charges KES 999 a year and KES 550 for thirty
-- days. This product was asking 3,500 for the year: three and a half times the
-- incumbent, for something a buyer cannot tell apart at the point of deciding.
--
-- The two anchor prices are matched deliberately rather than undercut. Coming in
-- below 999 invites a race neither side wins and signals the content is worth
-- less; matching it moves the comparison onto what the product actually does
-- differently, which is marking the paper and naming the strand to revise.
--
-- The term price sits between the two so a teacher who wants one term is not
-- forced to choose between a month and a year. It is worse value per day than
-- the year on purpose — the whole ladder is built to make the year the obvious
-- choice, which is exactly how the 550/999 pair works on the site it matches.
--
-- SAFETY
--
-- `subscriptions` is empty, so nobody is repriced mid-term and no existing
-- entitlement changes. Had anyone held a plan, this would have had to grandfather
-- them rather than move the price under them.
-- ============================================================================

UPDATE subscription_plans
   SET price_cents = 55000,
       description = 'Every paper and resource on the site for 30 days.',
       is_featured = FALSE
 WHERE slug = 'monthly';

UPDATE subscription_plans
   SET price_cents = 79900,
       description = 'Covers a full school term.',
       is_featured = FALSE
 WHERE slug = 'termly';

-- Featured moves to the year: it is the headline price, the best value by a
-- wide margin, and the number a buyer compares against the incumbent.
UPDATE subscription_plans
   SET price_cents = 99900,
       description = 'A full academic year, billed once — the best value.',
       is_featured = TRUE
 WHERE slug = 'yearly';
