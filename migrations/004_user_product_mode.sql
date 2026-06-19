-- Per-user product mode: founder | closure

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS product_mode VARCHAR(16) NULL
  CHECK (product_mode IS NULL OR product_mode IN ('founder', 'closure'));
