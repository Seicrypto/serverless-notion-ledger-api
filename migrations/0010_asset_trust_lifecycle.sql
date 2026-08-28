ALTER TABLE assets RENAME TO assets_old;

CREATE TABLE assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER,
  game_id INTEGER NOT NULL,
  asset_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global', 'organization')),
  asset_type TEXT NOT NULL DEFAULT 'item'
    CHECK (
      asset_type IN (
        'item',
        'currency',
        'ticket',
        'reward',
        'service',
        'other'
      )
    ),
  rarity_label TEXT,
  icon_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'candidate',
        'org_verified',
        'active',
        'merged',
        'deprecated'
      )
    ),
  canonical_asset_id INTEGER,
  is_default_settlement_unit INTEGER NOT NULL DEFAULT 0
    CHECK (is_default_settlement_unit IN (0, 1)),
  merged_at TEXT,
  merged_by_user_id INTEGER,
  created_by_user_id INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE RESTRICT,
  FOREIGN KEY (canonical_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  FOREIGN KEY (merged_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

INSERT INTO assets (
  id,
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
  id,
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
FROM assets_old;

DROP TABLE assets_old;

CREATE INDEX idx_assets_organization_id
  ON assets(organization_id);

CREATE INDEX idx_assets_game_id
  ON assets(game_id);

CREATE INDEX idx_assets_scope
  ON assets(scope);

CREATE INDEX idx_assets_normalized_name
  ON assets(game_id, normalized_name);

CREATE INDEX idx_assets_status
  ON assets(status);

CREATE INDEX idx_assets_canonical_asset_id
  ON assets(canonical_asset_id);

CREATE INDEX idx_assets_default_settlement_unit
  ON assets(game_id, is_default_settlement_unit);
