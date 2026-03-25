-- Make daily_fixations.thought_of_day optional (field removed from fixation flow).
ALTER TABLE daily_fixations
  ALTER COLUMN thought_of_day DROP NOT NULL;

