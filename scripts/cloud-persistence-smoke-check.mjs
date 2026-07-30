import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  applyRawResourceChange,
  buildCloudSnapshot,
  materializeCloudSnapshot,
  mergeCloudSnapshots,
  metadataFromCloudSnapshot,
  seedMetadata,
} from '../src/data/persistenceMerge.js';
import { storageKeys } from '../src/data/persistenceKeys.js';
import { decryptCloudSnapshot, encryptCloudSnapshot } from '../src/data/cloudSyncClient.js';
import cloudSyncHandler from '../api/cloud-sync.js';

const caseId = 'FA-ATO-24018';

function rawState(overrides = {}) {
  return {
    [storageKeys.tray]: { [caseId]: ['TRN-8842-19'] },
    [storageKeys.notes]: { [caseId]: [] },
    [storageKeys.noteDrafts]: {},
    [storageKeys.completed]: { [caseId]: ['Case Summary'] },
    [storageKeys.decisions]: {},
    [storageKeys.packages]: {},
    [storageKeys.actions]: {},
    [storageKeys.documentRequests]: {},
    [storageKeys.quickPad]: {},
    [storageKeys.payrollInvestigations]: {},
    [storageKeys.debriefs]: {},
    ...overrides,
  };
}

function snapshotFor(rawByKey, deviceId, timestamp, generatedCases = []) {
  const metadata = seedMetadata(rawByKey, {}, deviceId, timestamp);
  return buildCloudSnapshot({ rawByKey, metadata, generatedCases, deviceId });
}

const deviceARaw = rawState({
  [storageKeys.notes]: { [caseId]: ['Jul 25 · Investigation note · Added while desktop was offline.'] },
  [storageKeys.completed]: { [caseId]: ['Case Summary', 'Login History'] },
  [storageKeys.payrollInvestigations]: {
    [caseId]: {
      trustedContactStarted: true,
      requestMethod: 'Email',
      businessStatement: 'Trusted fictional business response.',
      emailEvidenceProvided: true,
      businessResponseSaved: true,
    },
  },
  [storageKeys.debriefs]: {
    [caseId]: [{
      id: 'PKG-1:debrief',
      packageId: 'PKG-1',
      managerReview: { managerVerdict: 'Saved debrief' },
    }],
  },
});
const deviceBRaw = rawState({
  [storageKeys.notes]: { [caseId]: ['Jul 25 · Investigation note · Added while mobile was offline.'] },
  [storageKeys.tray]: { [caseId]: ['TRN-8842-19', 'EVT-MOBILE'] },
  [storageKeys.packages]: { [caseId]: [{ id: 'PKG-1', caseId }] },
});

const generatedA = [{ id: 'FA-ATO-G00000001', generatedAt: 1001, person: 'Generated A' }];
const generatedB = [{ id: 'FA-CB-G00000002', generatedAt: 1002, person: 'Generated B' }];
const snapshotA = snapshotFor(deviceARaw, 'desktop-device', 1000, generatedA);
const snapshotB = snapshotFor(deviceBRaw, 'mobile-device', 1000, generatedB);
const merged = mergeCloudSnapshots(snapshotA, snapshotB);
const materialized = materializeCloudSnapshot(merged);

assert.deepEqual(
  new Set(materialized.rawByKey[storageKeys.notes][caseId]),
  new Set([
    'Jul 25 · Investigation note · Added while desktop was offline.',
    'Jul 25 · Investigation note · Added while mobile was offline.',
  ]),
  'Concurrent offline notes should merge without dropping either device.',
);
assert.deepEqual(
  new Set(materialized.rawByKey[storageKeys.tray][caseId]),
  new Set(['TRN-8842-19', 'EVT-MOBILE']),
  'Pinned evidence should merge as item-level records.',
);
assert.equal(materialized.rawByKey[storageKeys.debriefs][caseId][0].id, 'PKG-1:debrief');
assert.equal(materialized.rawByKey[storageKeys.packages][caseId][0].id, 'PKG-1');
assert.deepEqual(materialized.rawByKey[storageKeys.payrollInvestigations][caseId], {
  trustedContactStarted: true,
  requestMethod: 'Email',
  businessStatement: 'Trusted fictional business response.',
  emailEvidenceProvided: true,
  businessResponseSaved: true,
});
assert.deepEqual(new Set(materialized.generatedCases.map((item) => item.id)), new Set([
  'FA-ATO-G00000001',
  'FA-CB-G00000002',
]));

const mergedMetadata = metadataFromCloudSnapshot(merged);
const trayBeforeRemoval = materialized.rawByKey[storageKeys.tray];
const trayAfterRemoval = { [caseId]: ['TRN-8842-19'] };
const removalMetadata = applyRawResourceChange(
  mergedMetadata,
  storageKeys.tray,
  trayBeforeRemoval,
  trayAfterRemoval,
  'desktop-device',
  5000,
);
const removalSnapshot = buildCloudSnapshot({
  rawByKey: {
    ...materialized.rawByKey,
    [storageKeys.tray]: trayAfterRemoval,
  },
  metadata: removalMetadata,
  generatedCases: materialized.generatedCases,
  deviceId: 'desktop-device',
});
const mergedAfterRemoval = materializeCloudSnapshot(mergeCloudSnapshots(merged, removalSnapshot));
assert.deepEqual(
  mergedAfterRemoval.rawByKey[storageKeys.tray][caseId],
  ['TRN-8842-19'],
  'A newer pin removal should win over a stale device snapshot.',
);

const recoveryCode = 'fa-test-recovery-code-1234567890';
const encrypted = await encryptCloudSnapshot(merged, recoveryCode);
assert.equal(encrypted.algorithm, 'AES-GCM');
assert.ok(!JSON.stringify(encrypted).includes('Added while desktop was offline'));
assert.deepEqual(await decryptCloudSnapshot(encrypted, recoveryCode), merged);

const [
  apiSource,
  clientSource,
  keySource,
  generatedRepositorySource,
  workspaceStateSource,
  supabaseMigrationSource,
] = await Promise.all([
  readFile(new URL('../api/cloud-sync.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/data/cloudSyncClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/data/persistenceKeys.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/data/generatedCaseRepository.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/useWorkspaceState.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202607250001_fraud_academy_cloud_sync.sql', import.meta.url), 'utf8'),
]);

for (const environmentKey of [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUD_SYNC_HMAC_SECRET',
  'CLOUD_SYNC_ALLOWED_ORIGIN',
]) {
  assert.match(apiSource, new RegExp(`process\\.env\\.${environmentKey}`));
}
assert.doesNotMatch(apiSource, /https:\/\/[^'"]+\.supabase\.co/);
assert.match(clientSource, /AES-GCM/);
assert.match(clientSource, /PBKDF2/);
assert.match(clientSource, /X-Fraud-Academy-Sync-Id/);
assert.doesNotMatch(clientSource, /X-Fraud-Academy-Sync-Key/);
assert.match(clientSource, /response\.status === 409/);
assert.match(clientSource, /window\.addEventListener\('online'/);
assert.match(
  clientSource,
  /generatedCases:\s*await listPersistedGeneratedCases\(\)/,
  'Encrypted cloud snapshots must be built from evidence-preserving repository records.',
);
assert.match(keySource, /completed-debriefs-v1/);
assert.match(generatedRepositorySource, /mergeGeneratedCases/);
assert.match(
  generatedRepositorySource,
  /async listPersisted\(\)/,
  'The generated-case repository must separate persisted evidence from app-facing presentation.',
);
assert.match(workspaceStateSource, /initializeCloudSync\(\)/);
assert.match(workspaceStateSource, /recordLocalSliceChange/);
assert.match(workspaceStateSource, /setPackagesByCase/);
assert.match(supabaseMigrationSource, /enable row level security/i);
assert.match(supabaseMigrationSource, /revoke all .* from public, anon, authenticated/i);
assert.match(supabaseMigrationSource, /fraud_academy_compare_and_set_cloud_snapshot/);
assert.match(supabaseMigrationSource, /snapshot\.revision = p_base_revision/);
assert.match(supabaseMigrationSource, /grant execute .*[\s\S]*to service_role/i);

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(value = '') {
      this.body = value;
    },
  };
}

async function callApi(method, body) {
  const req = {
    method,
    body,
    headers: {
      host: 'fraud-academy.test',
      origin: 'https://fraud-academy.test',
      'x-forwarded-host': 'fraud-academy.test',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': `127.0.0.${method === 'GET' ? '1' : '2'}`,
      'x-fraud-academy-sync-id': createHash('sha256').update(recoveryCode).digest('hex'),
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = mockResponse();
  await cloudSyncHandler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
}

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  CLOUD_SYNC_HMAC_SECRET: process.env.CLOUD_SYNC_HMAC_SECRET,
  CLOUD_SYNC_ALLOWED_ORIGIN: process.env.CLOUD_SYNC_ALLOWED_ORIGIN,
};
process.env.SUPABASE_URL = 'https://database.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.CLOUD_SYNC_HMAC_SECRET = '1234567890abcdef1234567890abcdef';
process.env.CLOUD_SYNC_ALLOWED_ORIGIN = 'https://fraud-academy.test';

let supabaseMode = 'empty';
let lastSupabaseUrl = '';
let lastSupabaseRequest = {};
globalThis.fetch = async (url, options) => {
  lastSupabaseUrl = String(url);
  lastSupabaseRequest = options;
  if (options.method === 'GET') {
    return new Response(JSON.stringify([]), { status: 200 });
  }
  if (supabaseMode === 'saved') {
    return new Response(JSON.stringify([{
      saved: true,
      revision: 1,
      payload: encrypted,
      updated_at: '2026-07-25T15:00:00.000Z',
    }]), { status: 200 });
  }
  return new Response(JSON.stringify([{
    saved: false,
    revision: 3,
    payload: encrypted,
    updated_at: '2026-07-25T15:01:00.000Z',
  }]), { status: 200 });
};

const emptyCloud = await callApi('GET');
assert.equal(emptyCloud.status, 200);
assert.equal(emptyCloud.body.revision, 0);
assert.match(lastSupabaseUrl, /fraud_academy_cloud_snapshots\?/);
assert.equal(lastSupabaseRequest.headers.apikey, 'sb_secret_test-key');
assert.equal(lastSupabaseRequest.headers.Authorization, undefined);
assert.ok(!lastSupabaseUrl.includes(recoveryCode), 'The Supabase lookup must not expose the recovery code.');

supabaseMode = 'saved';
const savedCloud = await callApi('PUT', { baseRevision: 0, payload: encrypted });
assert.equal(savedCloud.status, 200);
assert.equal(savedCloud.body.revision, 1);
assert.match(lastSupabaseUrl, /rpc\/fraud_academy_compare_and_set_cloud_snapshot$/);
const savedRequestBody = JSON.parse(lastSupabaseRequest.body);
assert.equal(savedRequestBody.p_base_revision, 0);
assert.match(savedRequestBody.p_sync_key, /^[a-f0-9]{64}$/);
assert.ok(!lastSupabaseRequest.body.includes(recoveryCode), 'The Supabase request must not expose the recovery code.');

supabaseMode = 'conflict';
const conflictedCloud = await callApi('PUT', { baseRevision: 1, payload: encrypted });
assert.equal(conflictedCloud.status, 409);
assert.equal(conflictedCloud.body.revision, 3);
assert.deepEqual(conflictedCloud.body.payload, encrypted);

delete process.env.SUPABASE_SECRET_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-service-role-token';
const legacyCloud = await callApi('GET');
assert.equal(legacyCloud.status, 200);
assert.equal(lastSupabaseRequest.headers.apikey, 'legacy-service-role-token');
assert.equal(
  lastSupabaseRequest.headers.Authorization,
  'Bearer legacy-service-role-token',
);

globalThis.fetch = originalFetch;
for (const [key, value] of Object.entries(originalEnvironment)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

console.log('Cloud persistence smoke check passed.');
