function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function serializeJson(value) {
  return JSON.stringify(value ?? {});
}

function serializeTags(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

export class ProviderRepository {
  constructor(db) {
    this.db = db;
  }

  create(provider) {
    const stmt = this.db.prepare(`
      INSERT INTO providers (name, operator_address, region, sector_tags, energy_mix, metadata)
      VALUES (@name, @operator_address, @region, @sector_tags, @energy_mix, @metadata)
    `);
    const result = stmt.run({
      ...provider,
      sector_tags: serializeTags(provider.sector_tags),
      metadata: serializeJson(provider.metadata)
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE providers
      SET name = COALESCE(@name, name),
          operator_address = COALESCE(@operator_address, operator_address),
          region = COALESCE(@region, region),
          sector_tags = COALESCE(@sector_tags, sector_tags),
          energy_mix = COALESCE(@energy_mix, energy_mix),
          metadata = COALESCE(@metadata, metadata),
          updated_at = datetime('now')
      WHERE id = @id
    `);
    stmt.run({
      id,
      name: updates.name ?? null,
      operator_address: updates.operator_address ?? null,
      region: updates.region ?? null,
      sector_tags:
        updates.sector_tags !== undefined ? serializeTags(updates.sector_tags) : updates.sector_tags ?? null,
      energy_mix: updates.energy_mix ?? null,
      metadata: updates.metadata !== undefined ? serializeJson(updates.metadata) : updates.metadata ?? null
    });
    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
    return row ? this.#map(row) : undefined;
  }

  findByName(name) {
    const row = this.db.prepare('SELECT * FROM providers WHERE name = ?').get(name);
    return row ? this.#map(row) : undefined;
  }

  list() {
    return this.db
      .prepare('SELECT * FROM providers ORDER BY created_at DESC')
      .all()
      .map((row) => this.#map(row));
  }

  #map(row) {
    return {
      ...row,
      sector_tags: parseJson(row.sector_tags, []),
      metadata: parseJson(row.metadata, {})
    };
  }
}

export class TaskTypeRepository {
  constructor(db) {
    this.db = db;
  }

  create(taskType) {
    const stmt = this.db.prepare(`
      INSERT INTO task_types (name, description, difficulty_coefficient)
      VALUES (@name, @description, @difficulty_coefficient)
    `);
    const result = stmt.run(taskType);
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE task_types
      SET name = COALESCE(@name, name),
          description = COALESCE(@description, description),
          difficulty_coefficient = COALESCE(@difficulty_coefficient, difficulty_coefficient),
          updated_at = datetime('now')
      WHERE id = @id
    `);
    stmt.run({
      id,
      name: updates.name ?? null,
      description: updates.description ?? null,
      difficulty_coefficient: updates.difficulty_coefficient ?? null
    });
    return this.getById(id);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM task_types WHERE id = ?').get(id);
  }

  findByName(name) {
    return this.db.prepare('SELECT * FROM task_types WHERE name = ?').get(name);
  }

  list() {
    return this.db.prepare('SELECT * FROM task_types ORDER BY created_at DESC').all();
  }
}

export class TaskRunRepository {
  constructor(db) {
    this.db = db;
  }

  create(taskRun) {
    const stmt = this.db.prepare(`
      INSERT INTO task_runs (provider_id, task_type_id, external_id, status, raw_throughput, tokens_processed, tool_calls, novelty_score, quality_score, started_at, completed_at)
      VALUES (@provider_id, @task_type_id, @external_id, @status, @raw_throughput, @tokens_processed, @tool_calls, @novelty_score, @quality_score, @started_at, @completed_at)
    `);
    const result = stmt.run({
      provider_id: taskRun.provider_id,
      task_type_id: taskRun.task_type_id ?? null,
      external_id: taskRun.external_id ?? null,
      status: taskRun.status ?? 'queued',
      raw_throughput: taskRun.raw_throughput ?? 0,
      tokens_processed: taskRun.tokens_processed ?? 0,
      tool_calls: taskRun.tool_calls ?? 0,
      novelty_score: taskRun.novelty_score ?? null,
      quality_score: taskRun.quality_score ?? null,
      started_at: taskRun.started_at ?? null,
      completed_at: taskRun.completed_at ?? null
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE task_runs
      SET status = COALESCE(@status, status),
          raw_throughput = COALESCE(@raw_throughput, raw_throughput),
          tokens_processed = COALESCE(@tokens_processed, tokens_processed),
          tool_calls = COALESCE(@tool_calls, tool_calls),
          novelty_score = COALESCE(@novelty_score, novelty_score),
          quality_score = COALESCE(@quality_score, quality_score),
          started_at = COALESCE(@started_at, started_at),
          completed_at = COALESCE(@completed_at, completed_at),
          updated_at = datetime('now')
      WHERE id = @id
    `);
    stmt.run({
      id,
      status: updates.status ?? null,
      raw_throughput: updates.raw_throughput ?? null,
      tokens_processed: updates.tokens_processed ?? null,
      tool_calls: updates.tool_calls ?? null,
      novelty_score: updates.novelty_score ?? null,
      quality_score: updates.quality_score ?? null,
      started_at: updates.started_at ?? null,
      completed_at: updates.completed_at ?? null
    });
    return this.getById(id);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id);
  }

  listByProvider(providerId) {
    return this.db.prepare('SELECT * FROM task_runs WHERE provider_id = ? ORDER BY created_at DESC').all(providerId);
  }
}

export class QualityEvaluationRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO quality_evaluations (task_run_id, evaluator, score, notes)
      VALUES (@task_run_id, @evaluator, @score, @notes)
    `);
    const result = stmt.run(entry);
    return this.getById(result.lastInsertRowid);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM quality_evaluations WHERE id = ?').get(id);
  }

  listForTaskRun(taskRunId) {
    return this.db.prepare('SELECT * FROM quality_evaluations WHERE task_run_id = ? ORDER BY created_at DESC').all(taskRunId);
  }
}

export class EnergyReportRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO energy_reports (task_run_id, kwh, energy_mix, carbon_intensity_gco2_kwh, cost_usd, region)
      VALUES (@task_run_id, @kwh, @energy_mix, @carbon_intensity_gco2_kwh, @cost_usd, @region)
    `);
    const result = stmt.run(entry);
    return this.getById(result.lastInsertRowid);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM energy_reports WHERE id = ?').get(id);
  }

  listForTaskRun(taskRunId) {
    return this.db.prepare('SELECT * FROM energy_reports WHERE task_run_id = ? ORDER BY created_at DESC').all(taskRunId);
  }
}

export class SyntheticLaborScoreRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO synthetic_labor_scores (provider_id, task_run_id, score, rationale)
      VALUES (@provider_id, @task_run_id, @score, @rationale)
    `);
    const result = stmt.run(entry);
    return this.getById(result.lastInsertRowid);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM synthetic_labor_scores WHERE id = ?').get(id);
  }

  listForProvider(providerId) {
    return this.db
      .prepare('SELECT * FROM synthetic_labor_scores WHERE provider_id = ? ORDER BY created_at DESC')
      .all(providerId);
  }
}

export class IndexValueRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO index_values (effective_date, headline_value, energy_adjustment, quality_adjustment, consensus_factor)
      VALUES (@effective_date, @headline_value, @energy_adjustment, @quality_adjustment, @consensus_factor)
    `);
    const result = stmt.run(entry);
    return this.getById(result.lastInsertRowid);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM index_values WHERE id = ?').get(id);
  }

  findByDate(effectiveDate) {
    return this.db.prepare('SELECT * FROM index_values WHERE effective_date = ?').get(effectiveDate);
  }

  listRecent(limit = 30) {
    return this.db
      .prepare('SELECT * FROM index_values ORDER BY effective_date DESC, created_at DESC LIMIT ?')
      .all(limit);
  }
}

export class IndexConstituentWeightRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO index_constituent_weights (index_value_id, provider_id, weight)
      VALUES (@index_value_id, @provider_id, @weight)
    `);
    const result = stmt.run(entry);
    return this.getById(result.lastInsertRowid);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM index_constituent_weights WHERE id = ?').get(id);
  }

  listForIndexValue(indexValueId) {
    return this.db
      .prepare(
        'SELECT * FROM index_constituent_weights WHERE index_value_id = ? ORDER BY weight DESC, provider_id ASC'
      )
      .all(indexValueId);
  }
}
