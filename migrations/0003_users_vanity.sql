ALTER TABLE users ADD COLUMN vanity TEXT;

CREATE UNIQUE INDEX idx_users_vanity
  ON users(vanity)
  WHERE vanity IS NOT NULL;
