-- ============================================================================
-- MIGRATION: Add sub_parts column to questions table
-- For storing question sub-parts (a, b, c, d, etc.) with individual marks
-- ============================================================================

-- Add sub_parts JSONB column to questions table
ALTER TABLE questions ADD COLUMN IF NOT EXISTS sub_parts JSONB DEFAULT '[]'::jsonb;

-- Example structure for sub_parts:
-- [
--   {
--     "id": "part-abc123",
--     "label": "a",
--     "text": "Calculate the sum of 5 + 3",
--     "marks": 2
--   },
--   {
--     "id": "part-def456",
--     "label": "b", 
--     "text": "Find the difference of 10 - 4",
--     "marks": 3
--   }
-- ]

-- Add comment for documentation
COMMENT ON COLUMN questions.sub_parts IS 'Array of question sub-parts, each with id, label (a,b,c...), text, and marks';
