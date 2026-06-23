-- Add Work engine mode to product_mode check

ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_product_mode_check;
ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_product_mode_check
  CHECK (product_mode IS NULL OR product_mode IN ('founder', 'closure', 'learning', 'habit', 'jobhunt', 'work'));
