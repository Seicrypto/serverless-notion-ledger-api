ALTER TABLE settlements
  ADD COLUMN participant_exception_confirmed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE settlements
  ADD COLUMN participant_exception_reason TEXT NULL;
