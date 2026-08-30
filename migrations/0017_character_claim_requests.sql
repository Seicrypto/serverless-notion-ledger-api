CREATE TABLE character_claim_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  target_member_id INTEGER,
  requested_by_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('pending_confirmation', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_member_id) REFERENCES organization_members(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_character_claim_requests_character_id
  ON character_claim_requests(character_id);

CREATE INDEX idx_character_claim_requests_target_user_id
  ON character_claim_requests(target_user_id);

CREATE INDEX idx_character_claim_requests_organization_status
  ON character_claim_requests(organization_id, status);
