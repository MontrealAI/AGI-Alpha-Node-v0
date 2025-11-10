import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { loadLocalModels, simulateLocalInference, DEFAULT_MODELS } from '../src/intelligence/localModels.js';

const tempFiles = new Set();

function createModelFile(models) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-local-models-'));
  const filePath = path.join(dir, 'models.json');
  fs.writeFileSync(filePath, JSON.stringify({ models }, null, 2));
  tempFiles.add(dir);
  return filePath;
}

afterEach(() => {
  for (const dir of tempFiles) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
    tempFiles.delete(dir);
  }
});

describe('localModels', () => {
  it('returns embedded defaults when no path is provided', () => {
    const context = loadLocalModels();
    expect(context.source).toBe('embedded-defaults');
    expect(Array.isArray(context.models)).toBe(true);
    expect(context.models.length).toBe(DEFAULT_MODELS.length);
  });

  it('loads model definitions from disk', () => {
    const filePath = createModelFile([
      { name: 'ops', domains: ['ops'], reliability: 0.8, capability: 0.7 }
    ]);
    const context = loadLocalModels({ modelPath: filePath });
    expect(context.source).toContain('models.json');
    expect(context.models).toEqual([
      { name: 'ops', domains: ['ops'], reliability: 0.8, capability: 0.7 }
    ]);
  });

  it('simulates local inference for provided tasks', () => {
    const inference = simulateLocalInference({
      jobProfile: { name: 'test-job' },
      tasks: [
        { name: 'grid-balancing', domain: 'energy', complexity: 6 },
        { name: 'treasury-hedge', domain: 'finance', complexity: 4 }
      ],
      models: DEFAULT_MODELS
    });

    expect(inference.job).toBe('test-job');
    expect(inference.assignments).toHaveLength(2);
    expect(inference.modelsUsed.length).toBeGreaterThan(0);
    inference.assignments.forEach((assignment) => {
      expect(typeof assignment.confidence).toBe('number');
      expect(assignment.confidence).toBeGreaterThan(0);
      expect(assignment.confidence).toBeLessThanOrEqual(1);
    });
    expect(inference.averageConfidence).toBeGreaterThan(0);
  });
});
