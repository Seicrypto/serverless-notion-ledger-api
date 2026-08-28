ALTER TABLE assets
ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'
  CHECK (scope IN ('global', 'organization'));

ALTER TABLE assets
ADD COLUMN is_default_settlement_unit INTEGER NOT NULL DEFAULT 0
  CHECK (is_default_settlement_unit IN (0, 1));

ALTER TABLE assets
ADD COLUMN merged_at TEXT;

ALTER TABLE assets
ADD COLUMN merged_by_user_id INTEGER
  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_assets_scope
  ON assets(scope);

CREATE INDEX idx_assets_default_settlement_unit
  ON assets(game_id, is_default_settlement_unit);

CREATE TABLE asset_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  locale TEXT,
  region_code TEXT,
  alias_type TEXT NOT NULL DEFAULT 'community'
    CHECK (
      alias_type IN (
        'official',
        'localized',
        'community',
        'nickname',
        'legacy'
      )
    ),
  is_primary INTEGER NOT NULL DEFAULT 0
    CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (asset_id, normalized_alias, locale, region_code),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_asset_aliases_asset_id
  ON asset_aliases(asset_id);

CREATE INDEX idx_asset_aliases_normalized_alias
  ON asset_aliases(normalized_alias);

CREATE INDEX idx_asset_aliases_locale
  ON asset_aliases(locale);

CREATE TABLE market_scopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'global'
    CHECK (scope_type IN ('global', 'region', 'server', 'cluster')),
  scope_key TEXT NOT NULL,
  name TEXT NOT NULL,
  region_code TEXT,
  server_code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (game_id, scope_key),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_market_scopes_game_id
  ON market_scopes(game_id);

CREATE INDEX idx_market_scopes_scope_type
  ON market_scopes(scope_type);

CREATE INDEX idx_market_scopes_region_code
  ON market_scopes(region_code);

ALTER TABLE settlements
ADD COLUMN unit_asset_id INTEGER
  REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX idx_settlements_unit_asset_id
  ON settlements(unit_asset_id);

INSERT INTO assets (
  organization_id,
  game_id,
  asset_key,
  name,
  normalized_name,
  scope,
  asset_type,
  rarity_label,
  icon_url,
  status,
  canonical_asset_id,
  is_default_settlement_unit,
  merged_at,
  merged_by_user_id,
  created_by_user_id,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  NULL,
  g.id,
  'spiritvale-coin',
  'SpiritVale Coin',
  'spiritvale coin',
  'global',
  'currency',
  NULL,
  NULL,
  'active',
  NULL,
  1,
  NULL,
  NULL,
  NULL,
  '{"seed_kind":"default_settlement_unit"}',
  '2026-08-27T00:00:00.000Z',
  '2026-08-27T00:00:00.000Z'
FROM games g
WHERE g.slug = 'spiritvale'
  AND NOT EXISTS (
    SELECT 1
    FROM assets a
    WHERE a.asset_key = 'spiritvale-coin'
  );
