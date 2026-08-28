PRAGMA foreign_keys=OFF;

ALTER TABLE asset_aliases RENAME TO asset_aliases_old;
ALTER TABLE events RENAME TO events_old;
ALTER TABLE event_participants RENAME TO event_participants_old;
ALTER TABLE settlements RENAME TO settlements_old;
ALTER TABLE settlement_allocations RENAME TO settlement_allocations_old;
ALTER TABLE settlement_claims RENAME TO settlement_claims_old;

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
  unit_asset_id INTEGER,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_asset_id) REFERENCES assets(id) ON DELETE SET NULL
) STRICT;

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

CREATE TABLE settlement_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_allocation_id INTEGER NOT NULL,
  claimed_by_character_id INTEGER,
  claimed_at TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'confirmed', 'voided')),
  method TEXT NOT NULL DEFAULT 'manual'
    CHECK (method IN ('manual', 'in_game_mail', 'trade', 'bank', 'other')),
  confirmed_at TEXT,
  confirmed_by_user_id INTEGER,
  voided_at TEXT,
  voided_by_user_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (settlement_allocation_id) REFERENCES settlement_allocations(id) ON DELETE CASCADE,
  FOREIGN KEY (claimed_by_character_id) REFERENCES characters(id) ON DELETE SET NULL,
  FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (voided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

INSERT INTO asset_aliases (
  id,
  asset_id,
  alias,
  normalized_alias,
  locale,
  region_code,
  alias_type,
  is_primary,
  created_at,
  updated_at
)
SELECT
  id,
  asset_id,
  alias,
  normalized_alias,
  locale,
  region_code,
  alias_type,
  is_primary,
  created_at,
  updated_at
FROM asset_aliases_old;

INSERT INTO events (
  id,
  organization_id,
  game_id,
  asset_id,
  event_key,
  title,
  event_type,
  occurred_at,
  holder_type,
  holder_ref,
  status,
  notes,
  source_type,
  created_by_user_id,
  created_at,
  updated_at
)
SELECT
  id,
  organization_id,
  game_id,
  asset_id,
  event_key,
  title,
  event_type,
  occurred_at,
  holder_type,
  holder_ref,
  status,
  notes,
  source_type,
  created_by_user_id,
  created_at,
  updated_at
FROM events_old;

INSERT INTO event_participants (
  id,
  event_id,
  character_id,
  role_label,
  weight,
  joined_at,
  left_at,
  created_at,
  updated_at
)
SELECT
  id,
  event_id,
  character_id,
  role_label,
  weight,
  joined_at,
  left_at,
  created_at,
  updated_at
FROM event_participants_old;

INSERT INTO settlements (
  id,
  organization_id,
  event_id,
  settlement_key,
  title,
  settlement_type,
  decided_at,
  gross_amount,
  fee_mode,
  fee_rule_key,
  fee_percent,
  fee_amount,
  net_amount,
  payer_type,
  payer_ref,
  allocation_mode,
  status,
  notes,
  created_by_user_id,
  created_at,
  updated_at,
  unit_asset_id
)
SELECT
  id,
  organization_id,
  event_id,
  settlement_key,
  title,
  settlement_type,
  decided_at,
  gross_amount,
  fee_mode,
  fee_rule_key,
  fee_percent,
  fee_amount,
  net_amount,
  payer_type,
  payer_ref,
  allocation_mode,
  status,
  notes,
  created_by_user_id,
  created_at,
  updated_at,
  unit_asset_id
FROM settlements_old;

INSERT INTO settlement_allocations (
  id,
  settlement_id,
  character_id,
  weight,
  ratio,
  amount,
  status,
  created_at,
  updated_at
)
SELECT
  id,
  settlement_id,
  character_id,
  weight,
  ratio,
  amount,
  status,
  created_at,
  updated_at
FROM settlement_allocations_old;

INSERT INTO settlement_claims (
  id,
  settlement_allocation_id,
  claimed_by_character_id,
  claimed_at,
  amount,
  status,
  method,
  confirmed_at,
  confirmed_by_user_id,
  voided_at,
  voided_by_user_id,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  settlement_allocation_id,
  claimed_by_character_id,
  claimed_at,
  amount,
  status,
  method,
  confirmed_at,
  confirmed_by_user_id,
  voided_at,
  voided_by_user_id,
  notes,
  created_at,
  updated_at
FROM settlement_claims_old;

DROP TABLE settlement_claims_old;
DROP TABLE settlement_allocations_old;
DROP TABLE settlements_old;
DROP TABLE event_participants_old;
DROP TABLE events_old;
DROP TABLE asset_aliases_old;

CREATE INDEX idx_asset_aliases_asset_id
  ON asset_aliases(asset_id);

CREATE INDEX idx_asset_aliases_normalized_alias
  ON asset_aliases(normalized_alias);

CREATE INDEX idx_asset_aliases_locale
  ON asset_aliases(locale);

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

CREATE INDEX idx_event_participants_event_id
  ON event_participants(event_id);

CREATE INDEX idx_event_participants_character_id
  ON event_participants(character_id);

CREATE INDEX idx_settlements_organization_id
  ON settlements(organization_id);

CREATE INDEX idx_settlements_event_id
  ON settlements(event_id);

CREATE INDEX idx_settlements_status
  ON settlements(organization_id, status);

CREATE INDEX idx_settlements_decided_at
  ON settlements(organization_id, decided_at);

CREATE INDEX idx_settlements_unit_asset_id
  ON settlements(unit_asset_id);

CREATE INDEX idx_settlement_allocations_settlement_id
  ON settlement_allocations(settlement_id);

CREATE INDEX idx_settlement_allocations_character_id
  ON settlement_allocations(character_id);

CREATE INDEX idx_settlement_allocations_status
  ON settlement_allocations(status);

CREATE INDEX idx_settlement_claims_allocation_id
  ON settlement_claims(settlement_allocation_id);

CREATE INDEX idx_settlement_claims_claimed_by_character_id
  ON settlement_claims(claimed_by_character_id);

CREATE INDEX idx_settlement_claims_claimed_at
  ON settlement_claims(claimed_at);

PRAGMA foreign_keys=ON;
