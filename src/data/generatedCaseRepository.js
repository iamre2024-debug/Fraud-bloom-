import {
  createGeneratedCase,
  getGeneratedCaseTruth,
  registerGeneratedCaseTruthSnapshot,
} from './generatedCases.js';
import {
  CASE_MIGRATION_VERSION,
  mergeGeneratedCaseRecords,
  migrateLegacyCaseTruth,
  migrateGeneratedCases,
  persistedGeneratedCaseRecord,
  publicGeneratedCaseRecord,
} from './caseMigration.js';

const databaseName = 'fraud-academy-os-v1';
const databaseVersion = 1;
const caseStoreName = 'generatedCases';
const metaStoreName = 'metadata';
const legacyCasesKey = 'fraud-academy-generated-cases-v1';
const legacySequenceKey = 'fraud-academy-generated-case-sequence-v1';
const migrationKey = 'generated-cases-localstorage-migrated-v1';
const domainMigrationKey = `generated-cases-domain-migrated-v${CASE_MIGRATION_VERSION}`;
const sequenceKey = 'generated-case-sequence-v1';
const truthSnapshotKey = 'generated-case-truth-snapshots-v1';
const truthSnapshotVersion = 1;
const fallbackMetadataStorageKey = 'fraud-academy-generated-case-metadata-v1';

let fallbackMetadata = new Map();

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeTruthSnapshotStore(value) {
  const byCaseId = value?.byCaseId && typeof value.byCaseId === 'object' && !Array.isArray(value.byCaseId)
    ? value.byCaseId
    : {};
  return {
    version: truthSnapshotVersion,
    byCaseId: Object.fromEntries(Object.entries(byCaseId)
      .filter(([caseId, snapshot]) => caseId && snapshot?.truth && typeof snapshot.truth === 'object')
      .map(([caseId, snapshot]) => [caseId, {
        ...snapshot,
        id: snapshot.id ?? caseId,
        caseId,
        version: Math.max(Number(snapshot.version) || 0, truthSnapshotVersion),
        truth: cloneValue(snapshot.truth),
      }])),
  };
}

function truthForCase(item) {
  if (!item?.id) return undefined;
  if (item.caseTruth && typeof item.caseTruth === 'object' && !Array.isArray(item.caseTruth)) {
    return migrateLegacyCaseTruth(item);
  }
  return getGeneratedCaseTruth(item, { submitted: true });
}

function buildTruthSnapshot(item, source = 'runtime-derived') {
  const truth = truthForCase(item);
  if (!truth || typeof truth !== 'object') return null;
  return {
    id: item.id,
    caseId: item.id,
    version: truthSnapshotVersion,
    domainSchemaVersion: Number(item.domainSchemaVersion) || 0,
    scenarioTruthId: item.scenarioTruthId ?? null,
    workflowType: item.workflowType ?? null,
    scenarioId: item.scenarioId ?? null,
    capturedAt: Number(item.generatedAt) || 1,
    source: item.caseTruth && typeof item.caseTruth === 'object'
      ? 'legacy-embedded'
      : source,
    truth: cloneValue(truth),
  };
}

function registerTruthSnapshots(store) {
  for (const [caseId, snapshot] of Object.entries(store.byCaseId)) {
    registerGeneratedCaseTruthSnapshot(caseId, snapshot.truth);
  }
}

async function hydrateTruthSnapshots(repository, records = [], source = 'runtime-derived') {
  const store = normalizeTruthSnapshotStore(await repository.getMeta(truthSnapshotKey));
  let changed = false;
  for (const item of records) {
    if (!item?.id || store.byCaseId[item.id]) continue;
    const snapshot = buildTruthSnapshot(item, source);
    if (!snapshot) continue;
    store.byCaseId[item.id] = snapshot;
    changed = true;
  }
  registerTruthSnapshots(store);
  if (changed) await repository.setMeta(truthSnapshotKey, store);
  return store;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(caseStoreName)) {
        database.createObjectStore(caseStoreName, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(metaStoreName)) {
        database.createObjectStore(metaStoreName, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open generated-case database.'));
  });
}

function readLegacyCases() {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(legacyCasesKey);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function writeLegacyCases(cases) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(legacyCasesKey, JSON.stringify(cases));
}

function readLegacySequence() {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(legacySequenceKey));
  return Number.isFinite(value) ? value : 0;
}

function writeLegacySequence(value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(legacySequenceKey, String(value));
}

function readFallbackMetadata() {
  if (typeof window === 'undefined') return {};
  try {
    const value = window.localStorage.getItem(fallbackMetadataStorageKey);
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeFallbackMetadata(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(fallbackMetadataStorageKey, JSON.stringify(value));
  } catch {
    // Generated cases remain available even if storage policy or quota blocks metadata writes.
  }
}

function createLocalStorageRepository() {
  const repository = {
    kind: 'localStorage',
    async listPersisted() {
      const records = readLegacyCases();
      await hydrateTruthSnapshots(repository, records);
      const migrated = migrateGeneratedCases(records).map(persistedGeneratedCaseRecord);
      if (!sameValue(records, migrated)) writeLegacyCases(migrated);
      await hydrateTruthSnapshots(repository, migrated);
      return migrated;
    },
    async list() {
      return (await this.listPersisted()).map(publicGeneratedCaseRecord);
    },
    async put(item, { truthSource = 'runtime-derived' } = {}) {
      await hydrateTruthSnapshots(repository, [item], truthSource);
      const migratedItem = persistedGeneratedCaseRecord(item);
      const current = readLegacyCases();
      writeLegacyCases([migratedItem, ...current.filter((entry) => entry.id !== migratedItem.id)]);
      return publicGeneratedCaseRecord(migratedItem);
    },
    async getMeta(key) {
      if (fallbackMetadata.has(key)) return cloneValue(fallbackMetadata.get(key));
      const stored = readFallbackMetadata();
      if (!Object.hasOwn(stored, key)) return undefined;
      fallbackMetadata.set(key, cloneValue(stored[key]));
      return cloneValue(stored[key]);
    },
    async setMeta(key, value) {
      fallbackMetadata.set(key, cloneValue(value));
      writeFallbackMetadata({
        ...readFallbackMetadata(),
        [key]: cloneValue(value),
      });
    },
    async getSequence() {
      return readLegacySequence();
    },
    async setSequence(value) {
      writeLegacySequence(value);
    },
  };
  return repository;
}

function createIndexedDbRepository(database) {
  async function putManyRecords(items) {
    if (!items.length) return;
    await hydrateTruthSnapshots(repository, items);
    const transaction = database.transaction(caseStoreName, 'readwrite');
    const store = transaction.objectStore(caseStoreName);
    for (const item of items) store.put(persistedGeneratedCaseRecord(item));
    await transactionDone(transaction);
  }

  const repository = {
    kind: 'indexedDB',
    async listPersisted() {
      const transaction = database.transaction(caseStoreName, 'readonly');
      const records = await requestResult(transaction.objectStore(caseStoreName).getAll());
      await transactionDone(transaction);
      await hydrateTruthSnapshots(repository, records);
      const migrated = migrateGeneratedCases(records).map(persistedGeneratedCaseRecord);
      const changed = migrated.filter((item, index) => !sameValue(item, records[index]));
      if (changed.length) await putManyRecords(changed);
      await hydrateTruthSnapshots(repository, migrated);
      return migrated.sort((left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0));
    },
    async list() {
      return (await this.listPersisted()).map(publicGeneratedCaseRecord);
    },
    async put(item, { truthSource = 'runtime-derived' } = {}) {
      await hydrateTruthSnapshots(repository, [item], truthSource);
      const migratedItem = persistedGeneratedCaseRecord(item);
      const transaction = database.transaction(caseStoreName, 'readwrite');
      transaction.objectStore(caseStoreName).put(migratedItem);
      await transactionDone(transaction);
      return publicGeneratedCaseRecord(migratedItem);
    },
    async putMany(items) {
      await putManyRecords(items);
    },
    async getMeta(key) {
      const transaction = database.transaction(metaStoreName, 'readonly');
      const record = await requestResult(transaction.objectStore(metaStoreName).get(key));
      await transactionDone(transaction);
      return record?.value;
    },
    async setMeta(key, value) {
      const transaction = database.transaction(metaStoreName, 'readwrite');
      transaction.objectStore(metaStoreName).put({ key, value });
      await transactionDone(transaction);
    },
    async getSequence() {
      return Number(await this.getMeta(sequenceKey)) || 0;
    },
    async setSequence(value) {
      await this.setMeta(sequenceKey, value);
    },
  };
  return repository;
}

async function migrateLegacyCases(repository) {
  if (repository.kind !== 'indexedDB') return;
  if (await repository.getMeta(migrationKey)) return;

  const legacyCases = readLegacyCases();
  if (legacyCases.length) await repository.putMany(legacyCases);
  const legacySequence = readLegacySequence();
  if (legacySequence) await repository.setSequence(legacySequence);
  await repository.setMeta(migrationKey, true);
}

async function markDomainMigration(repository) {
  if (repository.kind !== 'indexedDB') return;
  if (await repository.getMeta(domainMigrationKey)) return;
  await repository.list();
  await repository.setMeta(domainMigrationKey, true);
}

let repositoryPromise;

export async function getGeneratedCaseRepository() {
  if (!repositoryPromise) {
    repositoryPromise = openDatabase()
      .then((database) => (database ? createIndexedDbRepository(database) : createLocalStorageRepository()))
      .catch(() => createLocalStorageRepository())
      .then(async (repository) => {
        await migrateLegacyCases(repository);
        await markDomainMigration(repository);
        return repository;
      });
  }
  return repositoryPromise;
}

export async function listGeneratedCases() {
  const repository = await getGeneratedCaseRepository();
  return repository.list();
}

export async function listPersistedGeneratedCases() {
  const repository = await getGeneratedCaseRepository();
  return repository.listPersisted();
}

export async function listGeneratedCaseTruthSnapshots() {
  const repository = await getGeneratedCaseRepository();
  const store = await hydrateTruthSnapshots(repository, await repository.list());
  return Object.values(store.byCaseId).map(cloneValue);
}

function truthSnapshotAuthority(snapshot) {
  const sourceAuthority = {
    'legacy-embedded': 3,
    'generated-at-creation': 2,
    'runtime-derived': 1,
  };
  return [
    Number(snapshot?.version) || 0,
    sourceAuthority[snapshot?.source] ?? 0,
  ];
}

export async function mergeGeneratedCaseTruthSnapshots(snapshots = []) {
  const repository = await getGeneratedCaseRepository();
  const store = await hydrateTruthSnapshots(repository, []);
  let changed = false;

  for (const candidate of snapshots) {
    const caseId = candidate?.caseId ?? candidate?.id;
    if (!caseId || !candidate?.truth || typeof candidate.truth !== 'object') continue;
    const incoming = normalizeTruthSnapshotStore({
      byCaseId: { [caseId]: candidate },
    }).byCaseId[caseId];
    const existing = store.byCaseId[caseId];
    const existingAuthority = truthSnapshotAuthority(existing);
    const incomingAuthority = truthSnapshotAuthority(incoming);
    if (
      existing
      && (
        existingAuthority[0] > incomingAuthority[0]
        || (
          existingAuthority[0] === incomingAuthority[0]
          && existingAuthority[1] >= incomingAuthority[1]
        )
      )
    ) continue;
    store.byCaseId[caseId] = incoming;
    registerGeneratedCaseTruthSnapshot(caseId, incoming.truth);
    changed = true;
  }

  if (changed) await repository.setMeta(truthSnapshotKey, store);
  registerTruthSnapshots(store);
  return Object.values(store.byCaseId).map(cloneValue);
}

function notifyGeneratedCasesChanged(reason = 'updated') {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('fraud-academy:generated-cases-updated', {
    detail: { reason },
  }));
}

export async function mergeGeneratedCases(items = []) {
  const repository = await getGeneratedCaseRepository();
  const existing = await repository.listPersisted();
  const existingById = new Map(existing.map((item) => [item.id, item]));
  const changed = [];

  for (const item of items) {
    if (!item?.id) continue;
    const current = existingById.get(item.id);
    const merged = mergeGeneratedCaseRecords(current, item);
    if (!current || !sameValue(current, merged)) {
      existingById.set(item.id, merged);
      changed.push(merged);
    }
  }
  if (!changed.length) return repository.list();

  if (typeof repository.putMany === 'function') {
    await repository.putMany(changed);
  } else {
    for (const item of changed) await repository.put(item);
  }

  const highestSequence = changed.reduce(
    (highest, item) => Math.max(highest, Number(item.generatedAt) || 0),
    Number(await repository.getSequence()) || 0,
  );
  if (highestSequence) await repository.setSequence(highestSequence);
  notifyGeneratedCasesChanged('cloud-merge');
  return repository.list();
}

function generatorConfig(config = {}) {
  return {
    customerType: config.customerType,
    productType: config.productType,
    workflowType: config.workflowType,
    alertReason: config.alertReason,
    reportedAllegation: config.reportedAllegation,
    claimTypeId: config.claimTypeId,
    scenarioId: config.scenarioId,
    difficulty: config.difficulty,
    evidenceDepth: config.evidenceDepth,
  };
}

export async function generateAndSaveCase(config = {}) {
  const repository = await getGeneratedCaseRepository();
  const now = Date.now();
  const savedSequence = await repository.getSequence();
  let seed = savedSequence >= now ? savedSequence + 1 : now;
  const existingIds = new Set((await repository.list()).map((item) => item.id));
  const options = generatorConfig(config);
  let nextCase = { ...createGeneratedCase(seed, options), generatedAt: seed };

  while (existingIds.has(nextCase.id)) {
    seed += 1;
    nextCase = { ...createGeneratedCase(seed, options), generatedAt: seed };
  }

  await repository.setSequence(seed);
  nextCase = await repository.put(nextCase, { truthSource: 'generated-at-creation' });
  notifyGeneratedCasesChanged('generated');
  return nextCase;
}

export async function generateAndSaveCases({ count = 1, ...config } = {}) {
  const normalizedCount = Math.min(25, Math.max(1, Number.parseInt(count, 10) || 1));
  const created = [];
  for (let index = 0; index < normalizedCount; index += 1) {
    created.push(await generateAndSaveCase(config));
  }
  return created;
}

export function combineCaseCatalog(baseCases = [], generatedCases = []) {
  const seen = new Set();
  return [...baseCases, ...generatedCases].filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
