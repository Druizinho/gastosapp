-- Migrate existing currencies to the new system
UPDATE expenses SET currency = 'BS' WHERE currency IN ('BS_USD', 'BS_EUR');
