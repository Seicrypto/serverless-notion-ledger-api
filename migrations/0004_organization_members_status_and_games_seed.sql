ALTER TABLE organization_members
ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active'));

ALTER TABLE organization_members
ADD COLUMN approved_at TEXT;

CREATE INDEX idx_organization_members_status ON organization_members (organization_id, status);

INSERT INTO
  games (
    name,
    slug,
    type,
    description,
    icon_url,
    is_active,
    created_at,
    updated_at
  )
VALUES
  (
    'SpiritVale',
    'spiritvale',
    'game',
    'A class-based action MMO inspired by classic RPGs.',
    NULL,
    1,
    '2026-08-24T00:00:00.000Z',
    '2026-08-24T00:00:00.000Z'
  );
