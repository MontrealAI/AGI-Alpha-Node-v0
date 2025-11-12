import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import https from 'node:https';

const gistId = process.env.BADGE_GIST_ID;
const token = process.env.BADGE_GIST_TOKEN;

if (!gistId || !token) {
  console.log('Badge publishing skipped because BADGE_GIST_ID or BADGE_GIST_TOKEN is not configured.');
  process.exit(0);
}

const filePaths = process.argv.slice(2);
if (!filePaths.length) {
  console.error('No badge payloads provided to publish-badges script.');
  process.exit(1);
}

const payload = { files: {} };
for (const filePath of filePaths) {
  const content = readFileSync(filePath, 'utf8');
  payload.files[basename(filePath)] = { content };
}

const body = JSON.stringify(payload);

const requestOptions = {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'agi-alpha-node-ci',
    'Content-Length': Buffer.byteLength(body)
  }
};

const request = https.request(`https://api.github.com/gists/${gistId}`, requestOptions, (response) => {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => {
    const result = Buffer.concat(chunks).toString();
    if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
      console.log('Badge gist updated successfully.');
    } else {
      console.error('Failed to update badge gist:', response.statusCode, result);
      process.exitCode = 1;
    }
  });
});

request.on('error', (error) => {
  console.error('Badge gist update encountered an error:', error);
  process.exit(1);
});

request.write(body);
request.end();
