import { cloudResourceKeys, cloudResourceModes } from './persistenceKeys.js';
import {
  mergeGeneratedCaseRecords,
  migrateGeneratedCase,
  migrateCloudSnapshotCaseData,
  migratePersistenceResources,
} from './caseMigration.js';

export const cloudSnapshotSchemaVersion = 1;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function itemIdentity(value) {
  if (value && typeof value === 'object') {
    const explicitId = value.id ?? value.packageId ?? value.requestId;
    if (explicitId) return `id:${String(explicitId)}`;
  }
  return `value:${hashString(stableStringify(value))}`;
}

export function compareVersions(left, right) {
  const leftAt = Number(left?.at) || 0;
  const rightAt = Number(right?.at) || 0;
  if (leftAt !== rightAt) return leftAt > rightAt ? 1 : -1;
  const leftDevice = String(left?.deviceId ?? '');
  const rightDevice = String(right?.deviceId ?? '');
  return leftDevice.localeCompare(rightDevice);
}

function cloneMetadata(metadata = {}) {
  return {
    schemaVersion: cloudSnapshotSchemaVersion,
    clock: Number(metadata.clock) || 0,
    resources: Object.fromEntries(
      Object.entries(metadata.resources ?? {}).map(([key, entries]) => [
        key,
        Object.fromEntries(Object.entries(entries ?? {}).map(([entryId, entry]) => [
          entryId,
          entry.mode === 'array'
            ? {
                mode: 'array',
                items: Object.fromEntries(Object.entries(entry.items ?? {}).map(([itemId, item]) => [
                  itemId,
                  { version: { ...item.version }, deleted: Boolean(item.deleted) },
                ])),
              }
            : { mode: 'value', version: { ...entry.version }, deleted: Boolean(entry.deleted) },
        ])),
      ]),
    ),
  };
}

function nextVersion(metadata, deviceId, now) {
  metadata.clock = Math.max(metadata.clock + 1, Number(now) || Date.now());
  return { at: metadata.clock, deviceId };
}

function arrayMap(value) {
  return new Map((Array.isArray(value) ? value : []).map((item) => [itemIdentity(item), item]));
}

export function applyRawResourceChange(metadata, key, previousMap, nextMap, deviceId, now = Date.now()) {
  if (!cloudResourceModes[key]) return metadata;
  const nextMetadata = cloneMetadata(metadata);
  const mode = cloudResourceModes[key];
  const previous = previousMap && typeof previousMap === 'object' ? previousMap : {};
  const next = nextMap && typeof nextMap === 'object' ? nextMap : {};
  const caseIds = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const resource = { ...(nextMetadata.resources[key] ?? {}) };

  for (const caseId of caseIds) {
    if (mode === 'array') {
      const previousItems = arrayMap(previous[caseId]);
      const nextItems = arrayMap(next[caseId]);
      const itemIds = new Set([...previousItems.keys(), ...nextItems.keys()]);
      const entry = {
        mode: 'array',
        items: { ...(resource[caseId]?.items ?? {}) },
      };

      for (const itemId of itemIds) {
        const previousValue = previousItems.get(itemId);
        const nextValue = nextItems.get(itemId);
        if (stableStringify(previousValue) === stableStringify(nextValue)) continue;
        entry.items[itemId] = {
          version: nextVersion(nextMetadata, deviceId, now),
          deleted: !nextItems.has(itemId),
        };
      }

      if (Object.keys(entry.items).length) resource[caseId] = entry;
      continue;
    }

    const previousHasValue = Object.prototype.hasOwnProperty.call(previous, caseId);
    const nextHasValue = Object.prototype.hasOwnProperty.call(next, caseId);
    if (previousHasValue === nextHasValue && stableStringify(previous[caseId]) === stableStringify(next[caseId])) continue;
    resource[caseId] = {
      mode: 'value',
      version: nextVersion(nextMetadata, deviceId, now),
      deleted: !nextHasValue,
    };
  }

  nextMetadata.resources[key] = resource;
  return nextMetadata;
}

export function seedMetadata(rawByKey, metadata, deviceId, now = Date.now()) {
  let nextMetadata = cloneMetadata(metadata);
  for (const key of cloudResourceKeys) {
    const existingEntries = nextMetadata.resources[key];
    if (existingEntries && Object.keys(existingEntries).length) continue;
    nextMetadata = applyRawResourceChange(nextMetadata, key, {}, rawByKey[key] ?? {}, deviceId, now);
  }
  return nextMetadata;
}

function defaultVersion(deviceId = 'legacy') {
  return { at: 1, deviceId };
}

export function buildCloudSnapshot({
  rawByKey,
  metadata,
  generatedCases = [],
  generatedCaseTruthSnapshots = [],
  deviceId,
}) {
  const migrated = migratePersistenceResources(rawByKey, generatedCases);
  const migratedRawByKey = migrated.rawByKey;
  const migratedGeneratedCases = migrated.generatedCases;
  const resources = {};

  for (const key of cloudResourceKeys) {
    const mode = cloudResourceModes[key];
    const rawEntries = migratedRawByKey[key] ?? {};
    const metaEntries = metadata.resources?.[key] ?? {};
    const caseIds = new Set([...Object.keys(rawEntries), ...Object.keys(metaEntries)]);
    const entries = {};

    for (const caseId of caseIds) {
      if (mode === 'array') {
        const values = Array.isArray(rawEntries[caseId]) ? rawEntries[caseId] : [];
        const currentItems = new Map(values.map((value, position) => [
          itemIdentity(value),
          { value, position },
        ]));
        const metaItems = metaEntries[caseId]?.items ?? {};
        const itemIds = new Set([...currentItems.keys(), ...Object.keys(metaItems)]);
        const items = {};

        for (const itemId of itemIds) {
          const current = currentItems.get(itemId);
          const itemMeta = metaItems[itemId];
          items[itemId] = {
            value: current?.value,
            position: current?.position ?? 0,
            version: itemMeta?.version ?? defaultVersion(deviceId),
            deleted: itemMeta?.deleted ?? !current,
          };
        }
        entries[caseId] = { mode: 'array', items };
      } else {
        const hasValue = Object.prototype.hasOwnProperty.call(rawEntries, caseId);
        const entryMeta = metaEntries[caseId];
        entries[caseId] = {
          mode: 'value',
          value: rawEntries[caseId],
          version: entryMeta?.version ?? defaultVersion(deviceId),
          deleted: entryMeta?.deleted ?? !hasValue,
        };
      }
    }

    resources[key] = { mode, entries };
  }

  const generatedItems = {};
  migratedGeneratedCases.forEach((generatedCase, position) => {
    const itemId = itemIdentity(generatedCase);
    generatedItems[itemId] = {
      value: generatedCase,
      position,
      version: {
        at: Number(generatedCase.generatedAt) || 1,
        deviceId: 'generated-case-repository',
      },
      deleted: false,
    };
  });
  const generatedTruthItems = {};
  generatedCaseTruthSnapshots.forEach((snapshot, position) => {
    if (!snapshot?.caseId || !snapshot?.truth) return;
    const itemId = itemIdentity(snapshot);
    generatedTruthItems[itemId] = {
      value: snapshot,
      position,
      version: {
        at: Number(snapshot.capturedAt) || 1,
        deviceId: 'generated-case-truth-repository',
      },
      deleted: false,
    };
  });

  return {
    schemaVersion: cloudSnapshotSchemaVersion,
    resources,
    generatedCases: { mode: 'array', items: generatedItems },
    generatedCaseTruth: { mode: 'array', items: generatedTruthItems },
  };
}

function winningEntry(left, right) {
  if (!left) return right;
  if (!right) return left;
  const comparison = compareVersions(left.version, right.version);
  if (comparison > 0) return left;
  if (comparison < 0) return right;
  return stableStringify(left).localeCompare(stableStringify(right)) >= 0 ? left : right;
}

function mergeArrayItems(leftItems = {}, rightItems = {}) {
  const itemIds = new Set([...Object.keys(leftItems), ...Object.keys(rightItems)]);
  return Object.fromEntries([...itemIds].map((itemId) => [
    itemId,
    winningEntry(leftItems[itemId], rightItems[itemId]),
  ]));
}

function mergeGeneratedItems(leftItems = {}, rightItems = {}) {
  const itemIds = new Set([...Object.keys(leftItems), ...Object.keys(rightItems)]);
  return Object.fromEntries([...itemIds].map((itemId) => {
    const left = leftItems[itemId];
    const right = rightItems[itemId];
    const winner = winningEntry(left, right);
    if (!left || !right || left.deleted || right.deleted || left.value === undefined || right.value === undefined) {
      return [itemId, winner?.value === undefined
        ? winner
        : { ...winner, value: migrateGeneratedCase(winner.value) }];
    }
    return [itemId, {
      ...winner,
      value: mergeGeneratedCaseRecords(left.value, right.value),
      deleted: false,
    }];
  }));
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

function mergeGeneratedTruthItems(leftItems = {}, rightItems = {}) {
  const itemIds = new Set([...Object.keys(leftItems), ...Object.keys(rightItems)]);
  return Object.fromEntries([...itemIds].map((itemId) => {
    const left = leftItems[itemId];
    const right = rightItems[itemId];
    const winner = winningEntry(left, right);
    if (!left || !right || left.deleted || right.deleted || left.value === undefined || right.value === undefined) {
      return [itemId, winner];
    }
    const leftAuthority = truthSnapshotAuthority(left.value);
    const rightAuthority = truthSnapshotAuthority(right.value);
    const rightHasMoreAuthority = rightAuthority[0] > leftAuthority[0]
      || (rightAuthority[0] === leftAuthority[0] && rightAuthority[1] > leftAuthority[1]);
    return [itemId, {
      ...winner,
      value: rightHasMoreAuthority ? right.value : left.value,
      deleted: false,
    }];
  }));
}

export function mergeCloudSnapshots(left = {}, right = {}) {
  const migratedLeft = migrateCloudSnapshotCaseData(left);
  const migratedRight = migrateCloudSnapshotCaseData(right);
  const resources = {};
  const resourceKeys = new Set([
    ...cloudResourceKeys,
    ...Object.keys(migratedLeft.resources ?? {}),
    ...Object.keys(migratedRight.resources ?? {}),
  ]);

  for (const key of resourceKeys) {
    const mode = cloudResourceModes[key] ?? migratedLeft.resources?.[key]?.mode ?? migratedRight.resources?.[key]?.mode;
    const leftEntries = migratedLeft.resources?.[key]?.entries ?? {};
    const rightEntries = migratedRight.resources?.[key]?.entries ?? {};
    const caseIds = new Set([...Object.keys(leftEntries), ...Object.keys(rightEntries)]);
    const entries = {};

    for (const caseId of caseIds) {
      if (mode === 'array') {
        entries[caseId] = {
          mode: 'array',
          items: mergeArrayItems(leftEntries[caseId]?.items, rightEntries[caseId]?.items),
        };
      } else {
        entries[caseId] = winningEntry(leftEntries[caseId], rightEntries[caseId]);
      }
    }

    resources[key] = { mode, entries };
  }

  return {
    schemaVersion: cloudSnapshotSchemaVersion,
    resources,
    generatedCases: {
      mode: 'array',
      // Merge raw generated records so the case-domain schema versions can
      // choose taxonomy fields while retaining the left/local worked record.
      items: mergeGeneratedItems(left.generatedCases?.items, right.generatedCases?.items),
    },
    generatedCaseTruth: {
      mode: 'array',
      items: mergeGeneratedTruthItems(
        left.generatedCaseTruth?.items,
        right.generatedCaseTruth?.items,
      ),
    },
  };
}

function visibleArray(items = {}) {
  return Object.values(items)
    .filter((item) => !item.deleted && item.value !== undefined)
    .sort((left, right) => {
      const versionOrder = compareVersions(right.version, left.version);
      if (left.position === right.position) return versionOrder;
      return (left.position ?? 0) - (right.position ?? 0);
    })
    .map((item) => item.value);
}

export function materializeCloudSnapshot(snapshot) {
  const migratedSnapshot = migrateCloudSnapshotCaseData(snapshot);
  const rawByKey = {};

  for (const key of cloudResourceKeys) {
    const resource = migratedSnapshot.resources?.[key];
    const rawEntries = {};
    for (const [caseId, entry] of Object.entries(resource?.entries ?? {})) {
      if (resource.mode === 'array') {
        const values = visibleArray(entry.items);
        if (values.length || Object.keys(entry.items ?? {}).length) rawEntries[caseId] = values;
      } else if (!entry.deleted && entry.value !== undefined) {
        rawEntries[caseId] = entry.value;
      }
    }
    rawByKey[key] = rawEntries;
  }

  return {
    rawByKey,
    generatedCases: visibleArray(migratedSnapshot.generatedCases?.items),
    generatedCaseTruthSnapshots: visibleArray(migratedSnapshot.generatedCaseTruth?.items),
  };
}

export function metadataFromCloudSnapshot(snapshot) {
  let clock = 0;
  const resources = {};

  for (const key of cloudResourceKeys) {
    const resource = snapshot.resources?.[key];
    const entries = {};
    for (const [caseId, entry] of Object.entries(resource?.entries ?? {})) {
      if (resource.mode === 'array') {
        entries[caseId] = {
          mode: 'array',
          items: Object.fromEntries(Object.entries(entry.items ?? {}).map(([itemId, item]) => {
            clock = Math.max(clock, Number(item.version?.at) || 0);
            return [itemId, { version: item.version, deleted: Boolean(item.deleted) }];
          })),
        };
      } else {
        clock = Math.max(clock, Number(entry.version?.at) || 0);
        entries[caseId] = {
          mode: 'value',
          version: entry.version,
          deleted: Boolean(entry.deleted),
        };
      }
    }
    resources[key] = entries;
  }

  return {
    schemaVersion: cloudSnapshotSchemaVersion,
    clock,
    resources,
  };
}
