PRAGMA foreign_keys = ON;

-- Rebuild synthetic labor table to support daily provider scores with adjustment factors
CREATE TABLE IF NOT EXISTS synthetic_labor_scores_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  task_run_id INTEGER REFERENCES task_runs(id) ON DELETE SET NULL,
  measurement_date TEXT NOT NULL DEFAULT (date('now')),
  raw_throughput REAL NOT NULL DEFAULT 0,
  energy_adjustment REAL NOT NULL DEFAULT 1.0,
  quality_adjustment REAL NOT NULL DEFAULT 1.0,
  consensus_factor REAL NOT NULL DEFAULT 1.0,
  slu REAL NOT NULL DEFAULT 0,
  rationale TEXT,
  schema_version TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_id, measurement_date)
);

INSERT INTO synthetic_labor_scores_new (
  provider_id,
  task_run_id,
  measurement_date,
  raw_throughput,
  energy_adjustment,
  quality_adjustment,
  consensus_factor,
  slu,
  rationale,
  schema_version,
  metadata,
  created_at,
  updated_at
)
SELECT
  provider_id,
  task_run_id,
  COALESCE(date(created_at), date('now')) AS measurement_date,
  COALESCE(score, 0) AS raw_throughput,
  1.0 AS energy_adjustment,
  1.0 AS quality_adjustment,
  1.0 AS consensus_factor,
  COALESCE(score, 0) AS slu,
  rationale,
  NULL AS schema_version,
  NULL AS metadata,
  created_at,
  COALESCE(updated_at, created_at)
FROM synthetic_labor_scores;

DROP TABLE synthetic_labor_scores;
ALTER TABLE synthetic_labor_scores_new RENAME TO synthetic_labor_scores;

CREATE INDEX IF NOT EXISTS idx_sls_provider ON synthetic_labor_scores(provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sls_provider_date ON synthetic_labor_scores(provider_id, measurement_date);
CREATE INDEX IF NOT EXISTS idx_sls_task_run ON synthetic_labor_scores(task_run_id);
