import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

function fail(message) {
  console.error(`Grafana dashboard lint failed: ${message}`);
  process.exitCode = 1;
}

function ensure(condition, message) {
  if (!condition) fail(message);
}

function validatePanel(panel, index, idSet) {
  ensure(typeof panel.id === 'number', `panel[${index}] missing numeric id`);
  ensure(!idSet.has(panel.id), `duplicate panel id ${panel.id}`);
  idSet.add(panel.id);

  ensure(typeof panel.type === 'string' && panel.type.length > 0, `panel[${index}] missing type`);
  ensure(panel.datasource && typeof panel.datasource === 'object', `panel[${index}] missing datasource`);
  ensure(Array.isArray(panel.targets) && panel.targets.length > 0, `panel[${index}] missing targets`);

  panel.targets.forEach((target, targetIndex) => {
    ensure(typeof target.expr === 'string' && target.expr.trim().length > 0, `panel[${index}].targets[${targetIndex}] missing expr`);
    ensure(typeof target.refId === 'string' && target.refId.trim().length > 0, `panel[${index}].targets[${targetIndex}] missing refId`);
  });
}

async function main() {
  const fileArgs = process.argv.slice(2);
  const filePaths =
    fileArgs.length > 0
      ? fileArgs
      : [
          'observability/grafana/dcutr_dashboard.json',
          'observability/grafana/libp2p_unified_dashboard.json'
        ];

  for (const filePath of filePaths) {
    try {
      const raw = await readFile(filePath, 'utf8');
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        fail(`invalid JSON in ${filePath}: ${(error instanceof Error ? error.message : 'unknown parse error')}`);
        continue;
      }

      ensure(parsed && typeof parsed === 'object', `dashboard root must be an object (${filePath})`);
      ensure(typeof parsed.uid === 'string' && parsed.uid.length > 0, `dashboard uid missing (${filePath})`);
      ensure(typeof parsed.title === 'string' && parsed.title.length > 0, `dashboard title missing (${filePath})`);
      ensure(Array.isArray(parsed.panels) && parsed.panels.length > 0, `dashboard panels missing (${filePath})`);

      const ids = new Set();
      parsed.panels.forEach((panel, index) => validatePanel(panel, index, ids));

      if (!process.exitCode) {
        console.log(`grafana dashboards lint ${basename(filePath)}: ok (${parsed.panels.length} panels)`);
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : 'unknown error');
    }
  }
}

await main();
