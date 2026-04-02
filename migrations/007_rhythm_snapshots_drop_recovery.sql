-- Убрать компонент recovery из снимков ритма (формула ритма без recovery).

ALTER TABLE rhythm_snapshots DROP COLUMN IF EXISTS recovery;
