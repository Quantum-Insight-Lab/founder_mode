-- Remove Habit product mode (no users/data to migrate).

ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_product_mode_check;
ALTER TABLE user_settings ADD CONSTRAINT user_settings_product_mode_check CHECK (
  product_mode IS NULL OR product_mode IN ('learning', 'jobhunt', 'work', 'quit', 'startup', 'closure')
);

DELETE FROM engine_commitments WHERE mode = 'habit';
DELETE FROM engine_switches WHERE mode = 'habit';
DELETE FROM engine_steps WHERE mode = 'habit';
DELETE FROM engine_digests WHERE mode = 'habit';
