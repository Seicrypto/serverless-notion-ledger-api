ALTER TABLE characters ADD COLUMN deleted_at TEXT;

ALTER TABLE characters
  ADD COLUMN deleted_by_user_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_characters_deleted_at
  ON characters(deleted_at);

CREATE TABLE organization_members_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'left', 'removed')),
  approved_at TEXT,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  removed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

INSERT INTO organization_members_v2 (
  id,
  organization_id,
  user_id,
  role,
  status,
  approved_at,
  joined_at,
  left_at,
  removed_at,
  created_at
)
SELECT
  id,
  organization_id,
  user_id,
  role,
  status,
  approved_at,
  joined_at,
  NULL,
  NULL,
  created_at
FROM organization_members;

DROP TABLE organization_members;

ALTER TABLE organization_members_v2 RENAME TO organization_members;

CREATE INDEX idx_organization_members_organization_id
  ON organization_members(organization_id);

CREATE INDEX idx_organization_members_user_id
  ON organization_members(user_id);

CREATE INDEX idx_organization_members_status
  ON organization_members(organization_id, status);
