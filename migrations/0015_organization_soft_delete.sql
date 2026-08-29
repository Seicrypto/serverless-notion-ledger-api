ALTER TABLE organizations ADD COLUMN deleted_at TEXT;

ALTER TABLE organizations ADD COLUMN deleted_by_user_id INTEGER
  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_organizations_deleted_at
  ON organizations(deleted_at);
