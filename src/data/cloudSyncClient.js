import {
  applyRawResourceChange,
  buildCloudSnapshot,
  materializeCloudSnapshot,
  mergeCloudSnapshots,
  metadataFromCloudSnapshot,
  seedMetadata,
} from './persistenceMerge.js';
import { cloudResourceKeys, cloudResourceModes } from './persistenceKeys.js';
import {
  listGeneratedCases,
  listGeneratedCaseTruthSnapshots,
  listPersistedGeneratedCases,
  mergeGeneratedCases,
  mergeGeneratedCaseTruthSnapshots,
} from './generatedCaseRepository.js';
import { migratePersistenceResources } from './caseMigration.js';

const apiPath = '/api/cloud-sync';
const deviceIdKey = 'fraud-academy-cloud-device-v1';
const recoveryCodeKey = 'fraud-academy-cloud-recovery-code-v1';
const metadataKey = 'fraud-academy-cloud-metadata-v1';
const syncStateEvent = 'fraud-academy:cloud-sync-status';
const localChangeEvent = 'fraud-academy:local-persistence-changed';
const hydrationEvent = 'fraud-academy:cloud-hydrated';
export const caseStorageMigrationEvent = 'fraud-academy:case-storage-migrated';
const minimumRecoveryCodeLength = 24;

let initialized = false;
let syncTimer = null;
let syncInFlight = null;
let state = {
  status: 'starting',
  message: 'Preparing local recovery.',
  lastSyncedAt: '',
  pending: false,
};

function browserAvailable() {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readJson(key, fallback) {
  if (!browserAvailable()) return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!browserAvailable()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local React state remains available when the storage quota or browser policy blocks writes.
  }
}

function emitState(nextState) {
  state = { ...state, ...nextState };
  if (browserAvailable()) {
    window.dispatchEvent(new CustomEvent(syncStateEvent, { detail: state }));
  }
}

export function getCloudSyncState() {
  return { ...state, hasRecoveryCode: Boolean(getCloudSyncKey()) };
}

function randomBytes(size) {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getOrCreateDeviceId() {
  if (!browserAvailable()) return 'server';
  let deviceId = window.localStorage.getItem(deviceIdKey);
  if (!deviceId) {
    deviceId = `device-${bytesToBase64Url(randomBytes(12))}`;
    window.localStorage.setItem(deviceIdKey, deviceId);
  }
  return deviceId;
}

export function getCloudSyncKey() {
  if (!browserAvailable()) return '';
  try {
    return window.localStorage.getItem(recoveryCodeKey) ?? '';
  } catch {
    return '';
  }
}

export function getOrCreateCloudSyncKey() {
  if (!browserAvailable()) return '';
  let recoveryCode = getCloudSyncKey();
  if (!recoveryCode) {
    recoveryCode = `fa-${bytesToBase64Url(randomBytes(24))}`;
    window.localStorage.setItem(recoveryCodeKey, recoveryCode);
  }
  return recoveryCode;
}

export function validateCloudSyncKey(value) {
  const clean = String(value ?? '').trim();
  if (clean.length < minimumRecoveryCodeLength) {
    return { valid: false, value: clean, message: `Use a recovery code with at least ${minimumRecoveryCodeLength} characters.` };
  }
  if (clean.length > 160) {
    return { valid: false, value: clean, message: 'The recovery code is too long.' };
  }
  return { valid: true, value: clean, message: '' };
}

export async function setCloudSyncKey(value) {
  const validation = validateCloudSyncKey(value);
  if (!validation.valid) throw new Error(validation.message);
  window.localStorage.setItem(recoveryCodeKey, validation.value);
  emitState({
    status: navigator.onLine ? 'syncing' : 'offline',
    message: navigator.onLine ? 'Connecting this device to cloud recovery.' : 'Recovery code saved. Sync will resume online.',
    pending: true,
  });
  return syncNow({ reason: 'recovery-code-changed', force: true });
}

function readRawResources({ skipMigration = false } = {}) {
  if (!skipMigration) migrateLocalCaseStorage();
  return Object.fromEntries(cloudResourceKeys.map((key) => [key, readJson(key, {})]));
}

function readMetadata() {
  return readJson(metadataKey, {
    schemaVersion: 1,
    clock: 0,
    resources: {},
  });
}

function writeMetadata(metadata) {
  writeJson(metadataKey, metadata);
}

export function migrateLocalCaseStorage(generatedCases = []) {
  if (!browserAvailable()) return false;
  try {
    const previousRaw = readRawResources({ skipMigration: true });
    const migratedRaw = migratePersistenceResources(previousRaw, generatedCases).rawByKey;
    let metadata = readMetadata();
    let changed = false;
    const deviceId = getOrCreateDeviceId();

    for (const key of cloudResourceKeys) {
      const previousValue = previousRaw[key] ?? {};
      const nextValue = migratedRaw[key] ?? previousValue;
      if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) continue;
      writeJson(key, nextValue);
      metadata = applyRawResourceChange(
        metadata,
        key,
        previousValue,
        nextValue,
        deviceId,
        Date.now(),
      );
      changed = true;
    }

    if (changed) {
      writeMetadata(metadata);
      window.dispatchEvent(new CustomEvent(caseStorageMigrationEvent));
    }
    return changed;
  } catch {
    return false;
  }
}

// This module is imported by the active workspace state model before React
// initializes its case-scoped storage hooks.
migrateLocalCaseStorage();

export function recordLocalSliceChange(key, previousValue, nextValue) {
  if (!browserAvailable() || !cloudResourceModes[key]) return;
  const deviceId = getOrCreateDeviceId();
  const metadata = applyRawResourceChange(
    readMetadata(),
    key,
    previousValue,
    nextValue,
    deviceId,
    Date.now(),
  );
  writeMetadata(metadata);
  emitState({
    status: navigator.onLine ? 'pending' : 'offline',
    message: navigator.onLine ? 'A local change is waiting to sync.' : 'Saved offline. Cloud sync will resume when the connection returns.',
    pending: true,
  });
  window.dispatchEvent(new CustomEvent(localChangeEvent, { detail: { key } }));
  scheduleSync();
}

async function streamToBytes(stream) {
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function compressBytes(bytes) {
  if (typeof CompressionStream === 'undefined') return { compression: 'none', bytes };
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return { compression: 'gzip', bytes: await streamToBytes(stream) };
}

async function decompressBytes(bytes, compression) {
  if (compression !== 'gzip') return bytes;
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open the compressed cloud recovery payload.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return streamToBytes(stream);
}

async function deriveEncryptionKey(recoveryCode) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(recoveryCode),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('fraud-academy-cloud-sync-v1'),
      iterations: 150000,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function cloudSyncIdentifier(recoveryCode) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recoveryCode));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function encryptCloudSnapshot(snapshot, recoveryCode) {
  const encoded = new TextEncoder().encode(JSON.stringify(snapshot));
  const compressed = await compressBytes(encoded);
  const iv = randomBytes(12);
  const key = await deriveEncryptionKey(recoveryCode);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed.bytes);
  return {
    version: 1,
    algorithm: 'AES-GCM',
    compression: compressed.compression,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(encrypted)),
  };
}

export async function decryptCloudSnapshot(payload, recoveryCode) {
  if (!payload || payload.version !== 1 || payload.algorithm !== 'AES-GCM') {
    throw new Error('Cloud recovery returned an unsupported payload.');
  }
  const key = await deriveEncryptionKey(recoveryCode);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(payload.iv) },
    key,
    base64UrlToBytes(payload.ciphertext),
  );
  const bytes = await decompressBytes(new Uint8Array(decrypted), payload.compression);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function requestCloudRecord(syncIdentifier) {
  const response = await fetch(apiPath, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Fraud-Academy-Sync-Id': syncIdentifier,
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 503) {
    const error = new Error('Cloud saving needs its production environment variables.');
    error.code = 'cloud-not-configured';
    throw error;
  }
  if (!response.ok) throw new Error(body.error || 'Unable to read cloud recovery.');
  return {
    revision: Number(body.revision) || 0,
    payload: body.payload ?? null,
  };
}

async function saveCloudRecord(syncIdentifier, baseRevision, payload) {
  const response = await fetch(apiPath, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Fraud-Academy-Sync-Id': syncIdentifier,
    },
    body: JSON.stringify({ baseRevision, payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 409) {
    return {
      conflict: true,
      revision: Number(body.revision) || 0,
      payload: body.payload ?? null,
    };
  }
  if (response.status === 503) {
    const error = new Error('Cloud saving needs its production environment variables.');
    error.code = 'cloud-not-configured';
    throw error;
  }
  if (!response.ok) throw new Error(body.error || 'Unable to save cloud recovery.');
  return { conflict: false, revision: Number(body.revision) || baseRevision + 1 };
}

async function applyMergedSnapshot(snapshot) {
  const {
    rawByKey,
    generatedCases,
    generatedCaseTruthSnapshots,
  } = materializeCloudSnapshot(snapshot);
  for (const key of cloudResourceKeys) writeJson(key, rawByKey[key] ?? {});
  writeMetadata(metadataFromCloudSnapshot(snapshot));
  await mergeGeneratedCaseTruthSnapshots(generatedCaseTruthSnapshots);
  await mergeGeneratedCases(generatedCases);
  window.dispatchEvent(new CustomEvent(hydrationEvent));
  window.dispatchEvent(new CustomEvent('fraud-academy:packages-updated'));
  window.dispatchEvent(new CustomEvent('fraud-academy:generated-cases-updated', {
    detail: { reason: 'cloud-hydrated' },
  }));
}

async function createLocalSnapshot() {
  const deviceId = getOrCreateDeviceId();
  const rawByKey = readRawResources();
  const metadata = seedMetadata(rawByKey, readMetadata(), deviceId, Date.now());
  writeMetadata(metadata);
  return buildCloudSnapshot({
    rawByKey,
    metadata,
    generatedCases: await listPersistedGeneratedCases(),
    generatedCaseTruthSnapshots: await listGeneratedCaseTruthSnapshots(),
    deviceId,
  });
}

async function performSync() {
  const recoveryCode = getOrCreateCloudSyncKey();
  if (!navigator.onLine) {
    emitState({
      status: 'offline',
      message: 'Saved offline. Cloud sync will resume when the connection returns.',
      pending: true,
    });
    return getCloudSyncState();
  }

  emitState({ status: 'syncing', message: 'Syncing encrypted recovery data.', pending: true });
  const syncIdentifier = await cloudSyncIdentifier(recoveryCode);
  let localSnapshot = await createLocalSnapshot();
  let cloudRecord = await requestCloudRecord(syncIdentifier);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const remoteSnapshot = cloudRecord.payload
      ? await decryptCloudSnapshot(cloudRecord.payload, recoveryCode)
      : {};
    const mergedSnapshot = mergeCloudSnapshots(localSnapshot, remoteSnapshot);
    const encryptedPayload = await encryptCloudSnapshot(mergedSnapshot, recoveryCode);
    const result = await saveCloudRecord(syncIdentifier, cloudRecord.revision, encryptedPayload);

    if (!result.conflict) {
      await applyMergedSnapshot(mergedSnapshot);
      const lastSyncedAt = new Date().toISOString();
      emitState({
        status: 'synced',
        message: 'Cloud recovery is current on this device.',
        lastSyncedAt,
        pending: false,
      });
      return getCloudSyncState();
    }

    localSnapshot = mergedSnapshot;
    cloudRecord = { revision: result.revision, payload: result.payload };
  }

  throw new Error('Cloud recovery changed repeatedly. Your local copy is safe; try syncing again.');
}

export function syncNow({ force = false } = {}) {
  if (!browserAvailable()) return Promise.resolve(getCloudSyncState());
  if (syncInFlight && !force) return syncInFlight;
  if (syncInFlight && force) {
    return syncInFlight.finally(() => syncNow());
  }
  syncInFlight = performSync()
    .catch((error) => {
      if (error.code === 'cloud-not-configured') {
        emitState({
          status: 'local-only',
          message: 'Local recovery is active. Add the cloud environment variables to enable sync.',
          pending: true,
        });
        return getCloudSyncState();
      }
      const offline = !navigator.onLine;
      emitState({
        status: offline ? 'offline' : 'error',
        message: offline
          ? 'Saved offline. Cloud sync will resume when the connection returns.'
          : 'Cloud sync paused. The local recovery copy is still safe.',
        pending: true,
      });
      return getCloudSyncState();
    })
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}

function scheduleSync(delay = 450) {
  if (!initialized || !browserAvailable()) return;
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    syncNow();
  }, delay);
}

export function initializeCloudSync() {
  if (!browserAvailable() || initialized) return;
  initialized = true;
  getOrCreateDeviceId();
  getOrCreateCloudSyncKey();

  window.addEventListener('online', () => syncNow({ force: true }));
  window.addEventListener('offline', () => emitState({
    status: 'offline',
    message: 'Saved offline. Cloud sync will resume when the connection returns.',
    pending: true,
  }));
  window.addEventListener('fraud-academy:generated-cases-updated', (event) => {
    if (event.detail?.reason === 'cloud-hydrated' || event.detail?.reason === 'cloud-merge') return;
    emitState({
      status: navigator.onLine ? 'pending' : 'offline',
      message: navigator.onLine ? 'A generated case is waiting to sync.' : 'Generated case saved offline.',
      pending: true,
    });
    scheduleSync();
  });
  window.addEventListener('focus', () => syncNow());
  syncNow();
}

export const cloudSyncEvents = {
  hydration: hydrationEvent,
  localChange: localChangeEvent,
  status: syncStateEvent,
};
