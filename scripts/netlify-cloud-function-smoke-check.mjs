import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import cloudSync from '../netlify/functions/cloud-sync.mjs';

const environmentNames = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUD_SYNC_HMAC_SECRET',
  'CLOUD_SYNC_ALLOWED_ORIGIN',
];
const originalEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
);

try {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.CLOUD_SYNC_HMAC_SECRET;
  process.env.CLOUD_SYNC_ALLOWED_ORIGIN = 'https://livebloom.netlify.app';

  const requestHeaders = {
    origin: 'https://livebloom.netlify.app',
    'x-forwarded-host': 'livebloom.netlify.app',
    'x-forwarded-proto': 'https',
  };
  const response = await cloudSync(new Request('https://livebloom.netlify.app/api/cloud-sync', {
    headers: requestHeaders,
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Cloud saving is not configured' });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://livebloom.netlify.app');
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const preflight = await cloudSync(new Request('https://livebloom.netlify.app/api/cloud-sync', {
    method: 'OPTIONS',
    headers: requestHeaders,
  }));
  assert.equal(preflight.status, 204);

  const netlifyConfiguration = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(netlifyConfiguration, /functions\s*=\s*"netlify\/functions"/);
  assert.match(netlifyConfiguration, /from\s*=\s*"\/api\/cloud-sync"/);
  assert.match(netlifyConfiguration, /to\s*=\s*"\/\.netlify\/functions\/cloud-sync"/);
} finally {
  for (const name of environmentNames) {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  }
}

console.log('Netlify cloud function smoke checks passed.');
