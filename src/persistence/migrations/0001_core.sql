PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  operator_address TEXT,
  region TEXT,
  sector_tags TEXT,
  energy_mix TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  difficulty_coefficient REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  task_type_id INTEGER REFERENCES task_types(id) ON DELETE SET NULL,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  raw_throughput REAL DEFAULT 0,
  tokens_processed INTEGER DEFAULT 0,
  tool_calls INTEGER DEFAULT 0,
  novelty_score REAL,
  quality_score REAL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(external_id)
);

CREATE TABLE IF NOT EXISTS quality_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_run_id INTEGER NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  evaluator TEXT NOT NULL,
  score REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS energy_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_run_id INTEGER NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  kwh REAL NOT NULL,
  energy_mix TEXT,
  carbon_intensity_gco2_kwh REAL,
  cost_usd REAL,
  region TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS synthetic_labor_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  task_run_id INTEGER NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  rationale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS index_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_date TEXT NOT NULL,
  headline_value REAL NOT NULL,
  energy_adjustment REAL DEFAULT 1.0,
  quality_adjustment REAL DEFAULT 1.0,
  consensus_factor REAL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS index_constituent_weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  index_value_id INTEGER NOT NULL REFERENCES index_values(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(index_value_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_providers_region ON providers(region);
CREATE INDEX IF NOT EXISTS idx_providers_created_at ON providers(created_at);
CREATE INDEX IF NOT EXISTS idx_task_runs_provider ON task_runs(provider_id);
CREATE INDEX IF NOT EXISTS idx_task_runs_created_at ON task_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_task_runs_day ON task_runs(strftime('%Y-%m-%d', created_at));
CREATE INDEX IF NOT EXISTS idx_quality_task_run ON quality_evaluations(task_run_id);
CREATE INDEX IF NOT EXISTS idx_energy_task_run ON energy_reports(task_run_id);
CREATE INDEX IF NOT EXISTS idx_sls_provider ON synthetic_labor_scores(provider_id);
CREATE INDEX IF NOT EXISTS idx_index_values_day ON index_values(effective_date);
CREATE INDEX IF NOT EXISTS idx_index_constituent_provider ON index_constituent_weights(provider_id);
