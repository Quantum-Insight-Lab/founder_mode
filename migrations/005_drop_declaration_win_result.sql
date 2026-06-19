-- Remove win_result from weekly declarations (3rd declaration question dropped)
ALTER TABLE weekly_declarations DROP COLUMN IF EXISTS win_result;
