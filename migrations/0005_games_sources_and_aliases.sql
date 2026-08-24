ALTER TABLE games ADD COLUMN source TEXT NOT NULL DEFAULT 'internal'
  CHECK (source IN ('internal', 'steam'));

ALTER TABLE games ADD COLUMN source_id TEXT;

CREATE UNIQUE INDEX idx_games_source_source_id
  ON games(source, source_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE game_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  locale TEXT,
  alias_type TEXT NOT NULL DEFAULT 'community'
    CHECK (alias_type IN ('official', 'localized', 'community', 'nickname')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (game_id, alias, locale),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_game_aliases_game_id
  ON game_aliases(game_id);

CREATE INDEX idx_game_aliases_alias
  ON game_aliases(alias);

UPDATE games
SET
  source = 'steam',
  source_id = '3767850',
  updated_at = '2026-08-24T00:00:00.000Z'
WHERE slug = 'spiritvale';
