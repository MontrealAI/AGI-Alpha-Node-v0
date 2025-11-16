PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS provider_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  hashed_key TEXT NOT NULL UNIQUE,
  label TEXT,
  rate_limit_quota INTEGER DEFAULT 1200,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

ALTER TABLE task_runs ADD COLUMN idempotency_key TEXT;
ALTER TABLE task_runs ADD COLUMN schema_version TEXT;
ALTER TABLE task_runs ADD COLUMN payload_hash TEXT;
ALTER TABLE task_runs ADD COLUMN metadata TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_runs_provider_idempotency
  ON task_runs(provider_id, idempotency_key);

ALTER TABLE energy_reports ADD COLUMN schema_version TEXT;
ALTER TABLE energy_reports ADD COLUMN metadata TEXT;

ALTER TABLE quality_evaluations ADD COLUMN schema_version TEXT;
ALTER TABLE quality_evaluations ADD COLUMN metadata TEXT;
