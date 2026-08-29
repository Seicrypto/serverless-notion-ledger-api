ALTER TABLE games ADD COLUMN metadata_source TEXT NOT NULL DEFAULT 'inherited'
  CHECK (metadata_source IN ('inherited', 'official'));
