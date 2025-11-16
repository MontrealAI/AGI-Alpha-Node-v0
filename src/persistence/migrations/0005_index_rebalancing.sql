PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS index_weight_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_date TEXT NOT NULL,
  lookback_window_days INTEGER NOT NULL,
  cap REAL NOT NULL DEFAULT 0.15,
  base_divisor REAL NOT NULL DEFAULT 1.0,
  divisor_version TEXT NOT NULL DEFAULT 'v1',
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE index_values ADD COLUMN weight_set_id INTEGER REFERENCES index_weight_sets(id) ON DELETE SET NULL;
ALTER TABLE index_values ADD COLUMN base_divisor REAL NOT NULL DEFAULT 1.0;
ALTER TABLE index_values ADD COLUMN divisor_version TEXT NOT NULL DEFAULT 'v1';
CREATE INDEX IF NOT EXISTS idx_index_values_weight_set ON index_values(weight_set_id);

CREATE TABLE IF NOT EXISTS index_constituent_weights_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weight_set_id INTEGER REFERENCES index_weight_sets(id) ON DELETE CASCADE,
  index_value_id INTEGER REFERENCES index_values(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  weight REAL NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(weight_set_id, provider_id),
  UNIQUE(index_value_id, provider_id)
);

INSERT INTO index_constituent_weights_new (
  id,
  weight_set_id,
  index_value_id,
  provider_id,
  weight,
  metadata,
  created_at,
  updated_at
)
SELECT
  id,
  NULL AS weight_set_id,
  index_value_id,
  provider_id,
  weight,
  NULL AS metadata,
  created_at,
  COALESCE(updated_at, created_at)
FROM index_constituent_weights;

DROP TABLE index_constituent_weights;
ALTER TABLE index_constituent_weights_new RENAME TO index_constituent_weights;
CREATE INDEX IF NOT EXISTS idx_index_constituent_weight_set ON index_constituent_weights(weight_set_id);

CREATE TABLE IF NOT EXISTS index_constituent_exclusions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weight_set_id INTEGER NOT NULL REFERENCES index_weight_sets(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(weight_set_id, provider_id)
);
