import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function fail(message, error = null) {
  const details = [
    '\n[alpha-wu] Dependency gate failed: ' + message.trim()
  ];
  if (error) {
    details.push(`Reason: ${error.message}`);
  }
  details.push('Hint: run `npm install` to refresh locked dependencies.');
  console.error(details.join('\n'));
  process.exit(1);
}

let ajvPackage;
try {
  ajvPackage = require('ajv/package.json');
} catch (error) {
  fail('Unable to resolve ajv/package.json from node_modules.', error);
}

const version = ajvPackage?.version;
if (typeof version !== 'string' || version.length === 0) {
  fail(`Detected invalid Ajv version metadata: ${version ?? '<missing>'}`);
}

const major = Number.parseInt(version.split('.')[0], 10);
if (!Number.isFinite(major)) {
  fail(`Unable to parse Ajv version string: ${version}`);
}

const MIN_MAJOR = 8;
if (major < MIN_MAJOR) {
  fail(`Ajv >= ${MIN_MAJOR}.0.0 is required for the α-WU schema tests, detected ${version}.`);
}

if (!process.env.CI) {
  console.log(`[alpha-wu] Ajv version ${version} detected (OK).`);
}
