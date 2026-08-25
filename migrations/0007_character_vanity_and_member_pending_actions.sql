ALTER TABLE characters ADD COLUMN vanity TEXT;

UPDATE characters
SET vanity = 'c-' || lower(hex(randomblob(4))) || '-' || id
WHERE vanity IS NULL;

CREATE UNIQUE INDEX idx_characters_vanity
  ON characters(vanity)
  WHERE vanity IS NOT NULL;

CREATE TABLE organization_member_pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL UNIQUE,
  kind TEXT NOT NULL
    CHECK (kind IN ('apply', 'invite')),
  character_id INTEGER,
  requested_game_id INTEGER,
  requested_character_name TEXT,
  requested_character_slug TEXT,
  requested_character_notes TEXT,
  invited_by_user_id INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES organization_members(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_game_id) REFERENCES games(id) ON DELETE SET NULL,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE UNIQUE INDEX idx_organization_member_pending_actions_character_id
  ON organization_member_pending_actions(character_id)
  WHERE character_id IS NOT NULL;

CREATE INDEX idx_organization_member_pending_actions_member_id
  ON organization_member_pending_actions(member_id);

CREATE INDEX idx_organization_member_pending_actions_kind
  ON organization_member_pending_actions(kind);

CREATE INDEX idx_organization_member_pending_actions_expires_at
  ON organization_member_pending_actions(expires_at);
