-- ============================================================================
-- FIX CBC GRADES - Correct naming from "Year" to "Grade"
-- Also ensures proper level assignments
-- ============================================================================

-- 1. Update Senior Secondary grades to use "Grade" naming
UPDATE grades SET name = 'Grade 10' WHERE name ILIKE '%year 10%' OR name ILIKE '%grade 10%';
UPDATE grades SET name = 'Grade 11' WHERE name ILIKE '%year 11%' OR name ILIKE '%grade 11%';
UPDATE grades SET name = 'Grade 12' WHERE name ILIKE '%year 12%' OR name ILIKE '%grade 12%';

-- 2. Ensure all Grade 10-12 have the correct "senior" level
UPDATE grades SET level = 'senior', band = NULL WHERE name IN ('Grade 10', 'Grade 11', 'Grade 12');

-- 3. Ensure Junior Secondary (Grade 7-9) have correct level
UPDATE grades SET level = 'junior', band = NULL WHERE name IN ('Grade 7', 'Grade 8', 'Grade 9');

-- 4. Ensure Upper Primary (Grade 4-6) have correct level and band
UPDATE grades SET level = 'primary', band = 'upper_primary' WHERE name IN ('Grade 4', 'Grade 5', 'Grade 6');

-- 5. Ensure Lower Primary (Grade 1-3) have correct level and band
UPDATE grades SET level = 'primary', band = 'lower_primary' WHERE name IN ('Grade 1', 'Grade 2', 'Grade 3');

-- 6. Update level_order for proper sorting
UPDATE grades SET level_order = 1 WHERE name = 'Grade 1';
UPDATE grades SET level_order = 2 WHERE name = 'Grade 2';
UPDATE grades SET level_order = 3 WHERE name = 'Grade 3';
UPDATE grades SET level_order = 4 WHERE name = 'Grade 4';
UPDATE grades SET level_order = 5 WHERE name = 'Grade 5';
UPDATE grades SET level_order = 6 WHERE name = 'Grade 6';
UPDATE grades SET level_order = 7 WHERE name = 'Grade 7';
UPDATE grades SET level_order = 8 WHERE name = 'Grade 8';
UPDATE grades SET level_order = 9 WHERE name = 'Grade 9';
UPDATE grades SET level_order = 10 WHERE name = 'Grade 10';
UPDATE grades SET level_order = 11 WHERE name = 'Grade 11';
UPDATE grades SET level_order = 12 WHERE name = 'Grade 12';

-- Optional: View the results
SELECT name, level, band, level_order FROM grades ORDER BY level_order;
