-- Remove area classification from weekly matters and engine commitments (LLM classification later).

ALTER TABLE weekly_matters DROP COLUMN IF EXISTS area_key;
ALTER TABLE weekly_matters DROP COLUMN IF EXISTS area_custom;

ALTER TABLE engine_commitments DROP COLUMN IF EXISTS area_key;
ALTER TABLE engine_commitments DROP COLUMN IF EXISTS area_custom;
