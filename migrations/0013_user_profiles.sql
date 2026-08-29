CREATE TABLE user_profiles (
  user_id INTEGER PRIMARY KEY,
  preferred_locale TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_user_profiles_preferred_locale
  ON user_profiles(preferred_locale);
