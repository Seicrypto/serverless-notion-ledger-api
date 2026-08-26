CREATE TABLE assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER,
  game_id INTEGER NOT NULL,
  asset_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
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
    CHECK (status IN ('active', 'merged', 'deprecated')),
  canonical_asset_id INTEGER,
  created_by_user_id INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE RESTRICT,
  FOREIGN KEY (canonical_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_assets_organization_id
  ON assets(organization_id);

CREATE INDEX idx_assets_game_id
  ON assets(game_id);

CREATE INDEX idx_assets_normalized_name
  ON assets(game_id, normalized_name);

CREATE INDEX idx_assets_status
  ON assets(status);

CREATE INDEX idx_assets_canonical_asset_id
  ON assets(canonical_asset_id);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  game_id INTEGER,
  asset_id INTEGER,
  event_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'loot'
    CHECK (
      event_type IN (
        'loot',
        'raid',
        'activity',
        'bonus',
        'salary',
        'guild_event',
        'other'
      )
    ),
  occurred_at TEXT NOT NULL,
  holder_type TEXT NOT NULL DEFAULT 'character'
    CHECK (
      holder_type IN (
        'character',
        'org_treasury',
        'market',
        'external',
        'custom'
      )
    ),
  holder_ref TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (
      status IN (
        'open',
        'ready_for_settlement',
        'partially_settled',
        'settled',
        'cancelled'
      )
    ),
  notes TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'api', 'import')),
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_events_organization_id
  ON events(organization_id);

CREATE INDEX idx_events_game_id
  ON events(game_id);

CREATE INDEX idx_events_asset_id
  ON events(asset_id);

CREATE INDEX idx_events_status
  ON events(organization_id, status);

CREATE INDEX idx_events_occurred_at
  ON events(organization_id, occurred_at);

CREATE TABLE event_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  character_id INTEGER,
  role_label TEXT,
  weight REAL NOT NULL DEFAULT 1,
  joined_at TEXT,
  left_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (event_id, character_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_event_participants_event_id
  ON event_participants(event_id);

CREATE INDEX idx_event_participants_character_id
  ON event_participants(character_id);

CREATE TABLE settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  event_id INTEGER,
  settlement_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  settlement_type TEXT NOT NULL DEFAULT 'sale'
    CHECK (
      settlement_type IN (
        'sale',
        'bonus',
        'salary',
        'reward',
        'subsidy',
        'adjustment'
      )
    ),
  decided_at TEXT NOT NULL,
  gross_amount INTEGER NOT NULL,
  fee_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (fee_mode IN ('none', 'percent', 'fixed', 'rule')),
  fee_rule_key TEXT,
  fee_percent REAL,
  fee_amount INTEGER,
  net_amount INTEGER NOT NULL,
  payer_type TEXT NOT NULL DEFAULT 'character'
    CHECK (
      payer_type IN (
        'character',
        'org_treasury',
        'external',
        'custom'
      )
    ),
  payer_ref TEXT,
  allocation_mode TEXT NOT NULL DEFAULT 'equal'
    CHECK (allocation_mode IN ('equal', 'weight', 'manual')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'calculated', 'paying', 'paid', 'cancelled')),
  notes TEXT,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_settlements_organization_id
  ON settlements(organization_id);

CREATE INDEX idx_settlements_event_id
  ON settlements(event_id);

CREATE INDEX idx_settlements_status
  ON settlements(organization_id, status);

CREATE INDEX idx_settlements_decided_at
  ON settlements(organization_id, decided_at);

CREATE TABLE settlement_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL,
  character_id INTEGER,
  weight REAL NOT NULL DEFAULT 1,
  ratio REAL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'waived', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (settlement_id, character_id),
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_settlement_allocations_settlement_id
  ON settlement_allocations(settlement_id);

CREATE INDEX idx_settlement_allocations_character_id
  ON settlement_allocations(character_id);

CREATE INDEX idx_settlement_allocations_status
  ON settlement_allocations(status);

CREATE TABLE settlement_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_allocation_id INTEGER NOT NULL,
  claimed_by_character_id INTEGER,
  confirmed_by_user_id INTEGER,
  claimed_at TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual'
    CHECK (method IN ('manual', 'in_game_mail', 'trade', 'bank', 'other')),
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (settlement_allocation_id) REFERENCES settlement_allocations(id) ON DELETE CASCADE,
  FOREIGN KEY (claimed_by_character_id) REFERENCES characters(id) ON DELETE SET NULL,
  FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_settlement_claims_allocation_id
  ON settlement_claims(settlement_allocation_id);

CREATE INDEX idx_settlement_claims_claimed_by_character_id
  ON settlement_claims(claimed_by_character_id);

CREATE INDEX idx_settlement_claims_claimed_at
  ON settlement_claims(claimed_at);
