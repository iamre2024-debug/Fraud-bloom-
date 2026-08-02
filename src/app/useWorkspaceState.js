import { useCallback, useEffect, useMemo, useState } from 'react';
import { trainingCases } from '../data/cases.js';
import { enrichTrainingCases } from '../data/caseEnrichment.js';
import {
  combineCaseCatalog,
  generateAndSaveCase,
  listGeneratedCases,
} from '../data/generatedCaseRepository.js';
import {
  buildReviewPackage,
  getReviewPackageStatus,
  isValidReviewPackage,
  normalizeDecisionDraft,
  normalizeReviewPackage,
} from '../data/reviewPackage.js';
import { normalizeCompletedToolNames } from '../data/caseDomain.js';
import {
  normalizeActionsByCase,
  normalizeCompletedToolsByCase,
  normalizeNotesByCase,
} from '../data/caseMigration.js';
import { storageKeys } from '../data/persistenceKeys.js';
import {
  caseStorageMigrationEvent,
  cloudSyncEvents,
  initializeCloudSync,
  migrateLocalCaseStorage,
  recordLocalSliceChange,
} from '../data/cloudSyncClient.js';
import { canonicalToolName, canonicalToolNames } from '../investigationToolGroups.js';

const activeCaseStorageKey = 'fraud-bloom-active-case-v1';
const defaultDecisionDraft = {
  operationalDecision: '',
  finalFinding: '',
  confidence: 'Medium',
  findingBasis: '',
  indicators: {},
};

export const requiredSubmissionStages = Object.freeze([
  'Case Briefing',
  'Investigation Summary',
  'Determination',
]);

export function applyWorkflowSubmissionGate(status = {}, completedTools = []) {
  const completed = new Set(normalizeCompletedToolNames(completedTools));
  const missingWorkflowStages = requiredSubmissionStages.filter((stage) => !completed.has(stage));
  if (!missingWorkflowStages.length) {
    return {
      ...status,
      missingWorkflowStages,
      ready: Boolean(status.ready),
    };
  }

  const workflowBlocker = `complete required workflow stages: ${missingWorkflowStages.join(', ')}`;
  return {
    ...status,
    missingWorkflowStages,
    blockers: [workflowBlocker, ...(status.blockers ?? [])],
    messages: [
      `Workflow requirement: ${missingWorkflowStages.join(', ')} must be completed before submission.`,
      ...(status.messages ?? []),
    ],
    ready: false,
  };
}

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(value);
    const previousSerialized = window.localStorage.getItem(key);
    if (serialized === previousSerialized) return;
    const previousValue = previousSerialized ? JSON.parse(previousSerialized) : {};
    window.localStorage.setItem(key, serialized);
    recordLocalSliceChange(key, previousValue, value);
  } catch {
    // The active session continues even when browser storage is unavailable.
  }
}

function newestReviewPackageFirst(left = {}, right = {}) {
  return Number(right.packageVersion ?? right.version ?? 0)
    - Number(left.packageVersion ?? left.version ?? 0)
    || String(right.savedAtIso ?? right.savedAt ?? '')
      .localeCompare(String(left.savedAtIso ?? left.savedAt ?? ''));
}

function normalizePackagesByCase(saved = {}, cases = []) {
  const casesById = new Map(cases.map((item) => [item.id, item]));
  return Object.fromEntries(
    Object.entries(saved).map(([caseId, packages]) => [
      caseId,
      (Array.isArray(packages) ? packages : [])
        .map((reviewPackage) => normalizeReviewPackage(reviewPackage, casesById.get(caseId) ?? {}))
        .sort(newestReviewPackageFirst),
    ]),
  );
}

function caseEntry(map, caseId, fallback) {
  const value = map?.[caseId];
  return value === undefined ? fallback : value;
}

function timestamp() {
  return new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function useWorkspaceState() {
  useEffect(() => {
    migrateLocalCaseStorage();
    initializeCloudSync();
  }, []);
  const baseCases = useMemo(() => enrichTrainingCases(trainingCases), []);
  const [generatedCases, setGeneratedCases] = useState([]);
  const cases = useMemo(
    () => enrichTrainingCases(combineCaseCatalog(baseCases, generatedCases)),
    [baseCases, generatedCases],
  );
  const [activeCaseId, setActiveCaseId] = useState(
    () => readStorage(activeCaseStorageKey, baseCases[0]?.id),
  );
  const [route, setRoute] = useState({ name: 'dashboard' });
  const [trayByCase, setTrayByCase] = useState(() => readStorage(storageKeys.tray, {}));
  const [notesByCase, setNotesByCase] = useState(
    () => normalizeNotesByCase(readStorage(storageKeys.notes, {})),
  );
  const [completedByCase, setCompletedByCase] = useState(
    () => normalizeCompletedToolsByCase(readStorage(storageKeys.completed, {})),
  );
  const [decisionsByCase, setDecisionsByCase] = useState(
    () => readStorage(storageKeys.decisions, {}),
  );
  const [packagesByCase, setPackagesByCase] = useState(
    () => normalizePackagesByCase(readStorage(storageKeys.packages, {}), baseCases),
  );
  const [actionsByCase, setActionsByCase] = useState(
    () => normalizeActionsByCase(readStorage(storageKeys.actions, {})),
  );
  const [documentRequestsByCase, setDocumentRequestsByCase] = useState(
    () => readStorage(storageKeys.documentRequests, {}),
  );
  const [quickPadByCase, setQuickPadByCase] = useState(
    () => readStorage(storageKeys.quickPad, {}),
  );

  useEffect(() => {
    let mounted = true;
    const refreshGeneratedCases = () => listGeneratedCases()
      .then((items) => {
        if (mounted) setGeneratedCases(items);
      })
      .catch(() => {
        // Keep the last successfully loaded queue when a transient storage read fails.
      });
    refreshGeneratedCases();
    window.addEventListener('fraud-academy:generated-cases-updated', refreshGeneratedCases);
    return () => {
      mounted = false;
      window.removeEventListener('fraud-academy:generated-cases-updated', refreshGeneratedCases);
    };
  }, []);

  useEffect(() => {
    const hydrateCaseState = () => {
      setTrayByCase(readStorage(storageKeys.tray, {}));
      setNotesByCase(normalizeNotesByCase(readStorage(storageKeys.notes, {})));
      setCompletedByCase(normalizeCompletedToolsByCase(readStorage(storageKeys.completed, {})));
      setDecisionsByCase(readStorage(storageKeys.decisions, {}));
      setPackagesByCase(normalizePackagesByCase(readStorage(storageKeys.packages, {}), baseCases));
      setActionsByCase(normalizeActionsByCase(readStorage(storageKeys.actions, {})));
      setDocumentRequestsByCase(readStorage(storageKeys.documentRequests, {}));
      setQuickPadByCase(readStorage(storageKeys.quickPad, {}));
    };
    window.addEventListener(cloudSyncEvents.hydration, hydrateCaseState);
    window.addEventListener(caseStorageMigrationEvent, hydrateCaseState);
    return () => {
      window.removeEventListener(cloudSyncEvents.hydration, hydrateCaseState);
      window.removeEventListener(caseStorageMigrationEvent, hydrateCaseState);
    };
  }, [baseCases]);

  useEffect(() => writeStorage(activeCaseStorageKey, activeCaseId), [activeCaseId]);
  useEffect(() => writeStorage(storageKeys.tray, trayByCase), [trayByCase]);
  useEffect(() => writeStorage(storageKeys.notes, notesByCase), [notesByCase]);
  useEffect(() => writeStorage(storageKeys.completed, completedByCase), [completedByCase]);
  useEffect(() => writeStorage(storageKeys.decisions, decisionsByCase), [decisionsByCase]);
  useEffect(() => writeStorage(storageKeys.packages, packagesByCase), [packagesByCase]);
  useEffect(() => writeStorage(storageKeys.actions, actionsByCase), [actionsByCase]);
  useEffect(
    () => writeStorage(storageKeys.documentRequests, documentRequestsByCase),
    [documentRequestsByCase],
  );
  useEffect(() => writeStorage(storageKeys.quickPad, quickPadByCase), [quickPadByCase]);

  const activeCase = cases.find((item) => item.id === activeCaseId) ?? cases[0] ?? {};
  const caseId = activeCase.id;
  const tray = caseEntry(trayByCase, caseId, []);
  const notes = caseEntry(notesByCase, caseId, []);
  const completedTools = normalizeCompletedToolNames(
    canonicalToolNames(caseEntry(completedByCase, caseId, [])),
  );
  const decisionDraft = normalizeDecisionDraft(
    caseEntry(decisionsByCase, caseId, defaultDecisionDraft),
    activeCase,
  );
  const reviewPackages = caseEntry(packagesByCase, caseId, [])
    .map((reviewPackage) => normalizeReviewPackage(reviewPackage, activeCase))
    .sort(newestReviewPackageFirst);
  const validReviewPackages = reviewPackages.filter((reviewPackage) => (
    isValidReviewPackage(activeCase, reviewPackage)
  ));
  const latestPackage = validReviewPackages[0] ?? null;
  const actionLog = [
    ...caseEntry(actionsByCase, caseId, []),
    ...(activeCase.actionLog ?? []),
  ];
  const documentRequests = caseEntry(documentRequestsByCase, caseId, {});
  const quickPad = caseEntry(quickPadByCase, caseId, { items: [], scratch: '' });
  const packageStatus = applyWorkflowSubmissionGate(
    getReviewPackageStatus({
      activeCase,
      completedTools,
      tray,
      notes,
      draft: decisionDraft,
    }),
    completedTools,
  );
  const reviewPackagesByCase = Object.fromEntries(cases.map((item) => [
    item.id,
    (packagesByCase[item.id] ?? [])
      .map((reviewPackage) => normalizeReviewPackage(reviewPackage, item))
      .filter((reviewPackage) => isValidReviewPackage(item, reviewPackage))
      .sort(newestReviewPackageFirst),
  ]));
  const completedToolsByCase = Object.fromEntries(cases.map((item) => [
    item.id,
    normalizeCompletedToolNames(canonicalToolNames(completedByCase[item.id] ?? [])),
  ]));

  const navigate = useCallback((name, params = {}) => {
    setRoute({ name, ...params });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const recordAction = useCallback((action, detail, source = 'Workspace') => {
    if (!caseId) return;
    const entry = {
      id: `${caseId}-ACT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: timestamp(),
      action,
      detail,
      source: canonicalToolName(source),
    };
    setActionsByCase((current) => ({
      ...current,
      [caseId]: [entry, ...(current[caseId] ?? [])],
    }));
  }, [caseId]);

  const openCase = useCallback((nextCaseId, destination = 'briefing') => {
    setActiveCaseId(nextCaseId);
    setRoute({ name: destination });
  }, []);

  const pinEvidence = useCallback((evidence) => {
    if (!caseId || !evidence) return;
    const normalized = typeof evidence === 'string'
      ? {
        id: evidence,
        label: evidence,
        detail: 'Pinned workspace object',
        tool: route.tool ?? 'Workspace',
      }
      : {
        ...evidence,
        id: evidence.id ?? evidence.recordId ?? evidence.value ?? evidence.label,
        label: evidence.label ?? evidence.title ?? evidence.id,
        detail: evidence.detail ?? evidence.summary ?? 'Pinned workspace object',
        tool: canonicalToolName(evidence.tool ?? evidence.sourceTool ?? route.tool ?? 'Workspace'),
        pinnedAt: new Date().toISOString(),
      };
    if (!normalized.id) return;
    setTrayByCase((current) => {
      const existing = current[caseId] ?? [];
      const identity = `${normalized.tool}:${normalized.id}`;
      if (existing.some((item) => `${item.tool}:${item.id}` === identity)) return current;
      return { ...current, [caseId]: [normalized, ...existing] };
    });
    recordAction('Pinned evidence', `${normalized.label} added to the evidence tray.`, normalized.tool);
  }, [caseId, recordAction, route.tool]);

  const removePin = useCallback((evidence) => {
    const id = typeof evidence === 'string' ? evidence : evidence?.id;
    if (!id || !caseId) return;
    setTrayByCase((current) => ({
      ...current,
      [caseId]: (current[caseId] ?? []).filter((item) => item.id !== id),
    }));
    recordAction('Removed pinned evidence', `${id} removed from the evidence tray.`, 'Pinned Evidence');
  }, [caseId, recordAction]);

  const saveNote = useCallback((text, source = 'Investigation note', recordId = '') => {
    const clean = String(text ?? '').trim();
    if (!clean || !caseId) return;
    const note = {
      id: `${caseId}-NOTE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: timestamp(),
      text: clean,
      source: canonicalToolName(source),
      recordId,
    };
    setNotesByCase((current) => ({
      ...current,
      [caseId]: [note, ...(current[caseId] ?? [])],
    }));
    recordAction('Saved note', `${note.source} note saved.`, note.source);
  }, [caseId, recordAction]);

  const markReviewed = useCallback((toolName) => {
    const canonical = canonicalToolName(toolName);
    if (!canonical || !caseId) return;
    setCompletedByCase((current) => {
      const existing = canonicalToolNames(current[caseId] ?? []);
      if (existing.includes(canonical)) return current;
      return { ...current, [caseId]: [...existing, canonical] };
    });
    recordAction('Marked reviewed', `${canonical} marked reviewed.`, canonical);
  }, [caseId, recordAction]);

  const updateDecision = useCallback((field, value) => {
    if (!caseId) return;
    setDecisionsByCase((current) => {
      const currentDraft = normalizeDecisionDraft(current[caseId] ?? defaultDecisionDraft, activeCase);
      const next = { ...currentDraft, [field]: value, legacyDecisionFormat: false };
      if (field === 'operationalDecision') next.choice = value;
      if (field === 'findingBasis') {
        next.reason = value;
        next.evidenceRationale = value;
      }
      return { ...current, [caseId]: next };
    });
  }, [activeCase, caseId]);

  const updateIndicator = useCallback((indicatorId, patch) => {
    if (!caseId) return;
    setDecisionsByCase((current) => {
      const currentDraft = normalizeDecisionDraft(current[caseId] ?? defaultDecisionDraft, activeCase);
      return {
        ...current,
        [caseId]: {
          ...currentDraft,
          indicators: {
            ...(currentDraft.indicators ?? {}),
            [indicatorId]: {
              ...(currentDraft.indicators?.[indicatorId] ?? {}),
              ...(typeof patch === 'object' ? patch : { answer: patch }),
            },
          },
        },
      };
    });
  }, [activeCase, caseId]);

  const submitPackage = useCallback(() => {
    const status = applyWorkflowSubmissionGate(
      getReviewPackageStatus({
        activeCase,
        completedTools,
        tray,
        notes,
        draft: decisionDraft,
      }),
      completedTools,
    );
    if (!status.ready) return { package: null, status };
    const previous = caseEntry(packagesByCase, caseId, []);
    const reviewPackage = buildReviewPackage({
      caseId,
      agentId: 'SKY-LEARNER',
      activeCase,
      draft: decisionDraft,
      completedTools,
      tray,
      notes,
      packageStatus: status,
      previousPackages: previous,
    });
    setPackagesByCase((current) => ({
      ...current,
      [caseId]: [reviewPackage, ...(current[caseId] ?? [])],
    }));
    setQuickPadByCase((current) => {
      const next = { ...current };
      delete next[caseId];
      return next;
    });
    markReviewed('Submit Decision');
    recordAction(
      'Submitted review package',
      `${reviewPackage.id} frozen for Luna debrief and case reporting.`,
      'Submit Decision',
    );
    return { package: reviewPackage, status };
  }, [
    activeCase,
    caseId,
    completedTools,
    decisionDraft,
    markReviewed,
    notes,
    packagesByCase,
    recordAction,
    tray,
  ]);

  const createCase = useCallback(async (config = {}) => {
    const created = await generateAndSaveCase(config);
    setGeneratedCases((current) => [
      created,
      ...current.filter((item) => item.id !== created.id),
    ]);
    listGeneratedCases()
      .then(setGeneratedCases)
      .catch(() => {
        // The newly persisted case remains usable from the optimistic queue update.
      });
    openCase(created.id);
    return created;
  }, [openCase]);

  const updateDocumentRequests = useCallback((nextValue) => {
    if (!caseId) return;
    setDocumentRequestsByCase((current) => ({
      ...current,
      [caseId]: typeof nextValue === 'function'
        ? nextValue(current[caseId] ?? {})
        : nextValue,
    }));
  }, [caseId]);

  const updateQuickPad = useCallback((nextValue) => {
    if (!caseId) return;
    setQuickPadByCase((current) => {
      const existing = current[caseId] ?? { items: [], scratch: '' };
      const updated = typeof nextValue === 'function'
        ? nextValue(existing)
        : nextValue;
      return {
        ...current,
        [caseId]: {
          ...updated,
          lastSavedAt: new Date().toISOString(),
        },
      };
    });
  }, [caseId]);

  return {
    cases,
    activeCase,
    activeCaseId: caseId,
    route,
    tray,
    notes,
    completedTools,
    completedToolsByCase,
    decisionDraft,
    reviewPackages,
    reviewPackagesByCase,
    latestPackage,
    actionLog,
    documentRequests,
    quickPad,
    packageStatus,
    navigate,
    openCase,
    createCase,
    pinEvidence,
    removePin,
    saveNote,
    markReviewed,
    updateDecision,
    updateIndicator,
    submitPackage,
    recordAction,
    setDocumentRequests: updateDocumentRequests,
    setQuickPad: updateQuickPad,
  };
}
