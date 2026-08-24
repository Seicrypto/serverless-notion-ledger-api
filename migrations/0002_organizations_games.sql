ALTER TABLE organizations ADD COLUMN vanity TEXT;

CREATE UNIQUE INDEX idx_organizations_vanity
  ON organizations(vanity)
  WHERE vanity IS NOT NULL;

CREATE TABLE games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'game'
    CHECK (type IN ('game', 'activity')),
  description TEXT,
  icon_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE organization_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  display_name TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0
    CHECK (is_primary IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, game_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
) STRICT;

ALTER TABLE characters ADD COLUMN game_id INTEGER
  REFERENCES games(id) ON DELETE SET NULL;

CREATE INDEX idx_games_slug ON games(slug);
CREATE INDEX idx_games_type ON games(type);
CREATE INDEX idx_organization_games_organization_id
  ON organization_games(organization_id);
CREATE INDEX idx_organization_games_game_id
  ON organization_games(game_id);
CREATE INDEX idx_organization_games_is_primary
  ON organization_games(organization_id, is_primary);
CREATE INDEX idx_characters_game_id
  ON characters(game_id);
