-- Migration v5: Proyectos y Ahorros
-- Adds 'type' column to saving_goals ('saving' or 'project')
-- Makes target_amount nullable to support open-ended project accounts

ALTER TABLE saving_goals ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'saving';

ALTER TABLE saving_goals ALTER COLUMN target_amount DROP NOT NULL;

ALTER TABLE saving_goals DROP CONSTRAINT IF EXISTS saving_goals_target_amount_check;

ALTER TABLE saving_goals ADD CONSTRAINT saving_goals_target_amount_check CHECK (target_amount IS NULL OR target_amount > 0);

CREATE INDEX IF NOT EXISTS idx_saving_goals_type ON saving_goals(type);
