PRAGMA foreign_keys = OFF;

CREATE TABLE organizations__new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  vanity TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) STRICT;

INSERT INTO
  organizations__new (
    id,
    name,
    description,
    icon_url,
    created_by_user_id,
    created_at,
    updated_at,
    vanity
  )
SELECT
  id,
  name,
  description,
  icon_url,
  created_by_user_id,
  created_at,
  updated_at,
  vanity
FROM organizations;

DROP TABLE organizations;

ALTER TABLE organizations__new RENAME TO organizations;

CREATE UNIQUE INDEX idx_organizations_vanity
  ON organizations(vanity)
  WHERE vanity IS NOT NULL;

PRAGMA foreign_keys = ON;
