PRAGMA foreign_keys = ON;

ALTER TABLE quality_evaluations ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE energy_reports ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE synthetic_labor_scores ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE index_values ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE index_constituent_weights ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
