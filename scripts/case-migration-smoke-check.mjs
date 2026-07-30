import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const storage = new Map();
const localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
  clear() {
    storage.clear();
  },
};

globalThis.window = {
  localStorage,
  dispatchEvent() {},
};

const caseId = 'FA-CR-G0000042';
const generatedAt = 1722000000042;
const savedAtIso = '2026-07-18T14:32:10.000Z';
const evidence = [{
  id: 'DOC-LEGACY-42',
  result: 'Submitted identity fields conflict with a fictional training bureau record.',
}];
const hiddenPresentationPattern = /synthetic identity|synthetic fraud|bust[- ]?out|first[- ]party fraud|email compromise|compromised mailbox|fraud confirmed/i;
const hiddenTruth = {
  finalFinding: 'Synthetic identity indicators established',
  evidenceIds: ['DOC-LEGACY-42'],
};
const legacyGeneratedCase = {
  id: caseId,
  generatedAt,
  claimTypeId: 'credit-risk',
  type: 'Synthetic Fraud',
  lane: 'Credit Risk',
  scenarioId: 'cr-synthetic-identity',
  scenarioTitle: 'Synthetic Identity',
  subtype: 'synthetic identity',
  alertReason: 'Synthetic fraud alert',
  taxonomyTags: { lifecycleStage: 'onboarding' },
  // Personal generated profiles historically also carried an employer/business
  // string; it must not convert the customer into a business.
  profile: { entityRole: 'Consumer applicant', business: 'Fictional Training Employer' },
  statement: { value: 'I submitted the requested application information.' },
  intakeAnswers: [{
    id: 'INT-LEGACY-42',
    prompt: 'Was synthetic identity fraud confirmed?',
    answer: 'Synthetic identity was confirmed at intake.',
  }],
  events: [{
    id: 'EVT-LEGACY-42',
    label: 'Synthetic fraud found',
    detail: 'First-party fraud and synthetic identity were established.',
  }],
  timelineEvents: [{
    id: 'TIM-LEGACY-42',
    title: 'Bust-out fraud detected',
    detail: 'Fraud confirmed before review.',
  }],
  actionLog: [{
    id: 'ACT-LEGACY-42',
    detail: 'Email compromise confirmed.',
  }],
  toolResults: {
    evidence,
    rows: [{
      label: 'Synthetic identity indicator from original packet',
      detail: 'Fraud confirmed.',
    }],
  },
  caseTruth: hiddenTruth,
  correctDetermination: 'Do Not Support Credit Request',
};
const legacyDraft = {
  choice: 'Do Not Support Credit Request',
  confidence: 'High',
  reason: 'Identity record DOC-LEGACY-42 conflicts with the submitted application details.',
  updatedAt: 1722000022222,
};
const legacyPackage = {
  id: 'PKG-LEGACY-42',
  caseId,
  claimTypeId: 'credit-risk',
  claimType: 'Synthetic Fraud',
  lane: 'Credit Risk',
  scenarioId: 'cr-synthetic-identity',
  choice: 'Do Not Support Credit Request',
  reason: legacyDraft.reason,
  completedTools: ['Evidence Center', 'Financial Intelligence'],
  requiredTools: ['Case Summary', 'Evidence Center', 'Business Intelligence'],
  missingTools: ['Business Intelligence'],
  pinnedEvidence: ['DOC-LEGACY-42'],
  noteSnapshot: ['Jul 18, 2026 · Financial Intelligence · Historical source remains available.'],
  savedAt: 'Jul 18, 09:32 AM',
  savedAtIso,
};
const legacyDebrief = {
  id: 'PKG-LEGACY-42:debrief',
  packageId: 'PKG-LEGACY-42',
  completedAt: '2026-07-18T14:35:00.000Z',
  scenarioTruth: hiddenTruth,
};

const keyNames = {
  generated: 'fraud-academy-generated-cases-v1',
  decisions: 'fraud-academy-decision-drafts-v1',
  packages: 'fraud-academy-review-packages-v1',
  debriefs: 'fraud-academy-completed-debriefs-v1',
  notes: 'fraud-academy-notes-v1',
  completed: 'fraud-academy-completed-tools-v1',
  actions: 'fraud-academy-action-log-v1',
  quickPad: 'fraud-academy-quick-pad-v1',
  metadata: 'fraud-academy-cloud-metadata-v1',
  generatedMetadata: 'fraud-academy-generated-case-metadata-v1',
};

localStorage.setItem(keyNames.generated, JSON.stringify([legacyGeneratedCase]));
localStorage.setItem(keyNames.decisions, JSON.stringify({ [caseId]: legacyDraft }));
localStorage.setItem(keyNames.packages, JSON.stringify({ [caseId]: [legacyPackage] }));
localStorage.setItem(keyNames.debriefs, JSON.stringify({ [caseId]: [legacyDebrief] }));
localStorage.setItem(keyNames.notes, JSON.stringify({
  [caseId]: [
    'Learner note survives migration.',
    'Jul 18, 2026 · Financial Intelligence · Historical source remains available.',
    {
      id: 'NOTE-SAVED-42',
      time: 'Jul 18, 09:29 AM',
      source: 'Business Intelligence',
      text: 'Learner wrote Financial Intelligence here; preserve these words.',
    },
  ],
}));
localStorage.setItem(keyNames.completed, JSON.stringify({
  [caseId]: ['Case Summary', 'Evidence Center', 'Financial Intelligence', 'Business Intelligence'],
}));
localStorage.setItem(keyNames.actions, JSON.stringify({
  [caseId]: [{
    id: 'ACT-SAVED-42',
    time: 'Jul 18, 09:30 AM',
    action: 'Opened Financial Intelligence',
    detail: 'Financial Intelligence record reviewed.',
    source: 'Financial Intelligence',
  }],
}));
localStorage.setItem(keyNames.quickPad, JSON.stringify({
  [caseId]: {
    items: [{
      id: 'Financial Intelligence:Account ID:ACCT-42',
      label: 'Account ID',
      value: 'ACCT-42',
      sourceTool: 'Financial Intelligence',
      sourceRecordId: 'FIN-LEGACY-42',
    }],
    scratch: 'Learner-authored scratch text remains unchanged.',
  },
}));

// Importing the cloud client is the pre-React migration entrypoint used by the
// active workspace model.
const {
  decryptCloudSnapshot,
  encryptCloudSnapshot,
  migrateLocalCaseStorage,
} = await import('../src/data/cloudSyncClient.js');
const {
  CASE_MIGRATION_VERSION,
  classifyLegacyCase,
  mergeGeneratedCaseRecords,
  migrateCloudSnapshotCaseData,
  migrateDecisionDraft,
  migrateGeneratedCase,
  migratePersistenceResources,
  migrateReviewPackage,
  persistedGeneratedCaseRecord,
  publicGeneratedCaseRecord,
} = await import('../src/data/caseMigration.js');
const {
  CUSTOMER_TYPES,
  CASE_RELATIONSHIP_DATA_VERSION,
  CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION,
  LEGACY_RELATIONSHIP_DATA_VERSION,
  PRODUCT_TYPES,
  WORKFLOW_TYPES,
} = await import('../src/data/caseDomain.js');
const { getBusiness360Dossier } = await import('../src/data/business360Dossier.js');
const { getFinancialInvestigation } = await import('../src/data/financialInvestigationRecords.js');
const { enrichTrainingCases } = await import('../src/data/caseEnrichment.js');
const {
  materializeCloudSnapshot,
  mergeCloudSnapshots,
} = await import('../src/data/persistenceMerge.js');
const {
  generateAndSaveCase,
  listGeneratedCases,
  listGeneratedCaseTruthSnapshots,
  listPersistedGeneratedCases,
  mergeGeneratedCases,
} = await import('../src/data/generatedCaseRepository.js');

assert.equal(
  classifyLegacyCase({
    id: 'FA-AWC-WIRE-1',
    claimTypeId: 'ach-wire-check',
    type: 'ACH / Wire / Check Review',
    scenarioId: 'awc-wire-beneficiary',
    transactionInfo: 'Wire payment instruction · fictional Destination ID DST-0917',
  }).workflowType,
  WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
  'The broad legacy rail label must not collapse a wire scenario into ACH.',
);
assert.equal(
  classifyLegacyCase({
    id: 'FA-AWC-ACH-1',
    claimTypeId: 'ach-wire-check',
    type: 'ACH / Wire / Check Review',
    scenarioId: 'awc-ach-originator',
    transactionInfo: 'ACH debit · fictional Bank Code BC-042',
  }).workflowType,
  WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW,
);

const prefixOnlyDraft = migrateDecisionDraft({
  choice: 'Do Not Support Credit Request',
  reason: 'Legacy draft saved before generated-case context was available.',
}, { id: 'FA-CR-G0000999' });
assert.equal(prefixOnlyDraft.operationalDecision, 'Restrict / Reduce');
assert.equal(prefixOnlyDraft.legacyDecisionFormat, true);
const contextualDraft = migrateDecisionDraft(prefixOnlyDraft, {
  id: 'FA-CR-G0000999',
  customerType: CUSTOMER_TYPES.PERSONAL,
  productType: PRODUCT_TYPES.CREDIT_CARD,
  workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
});
assert.equal(
  contextualDraft.operationalDecision,
  'Deny',
  'A legacy choice must be reinterpreted when the generated case later supplies authoritative workflow context.',
);
const contextualPackage = migrateReviewPackage({
  ...prefixOnlyDraft,
  id: 'PKG-CONTEXT-999',
  caseId: 'FA-CR-G0000999',
}, {
  id: 'FA-CR-G0000999',
  customerType: CUSTOMER_TYPES.PERSONAL,
  productType: PRODUCT_TYPES.CREDIT_CARD,
  workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
});
assert.equal(contextualPackage.operationalDecision, 'Deny');

const migratedStoredDraft = JSON.parse(localStorage.getItem(keyNames.decisions))[caseId];
const migratedStoredPackage = JSON.parse(localStorage.getItem(keyNames.packages))[caseId][0];
const migratedStoredDebrief = JSON.parse(localStorage.getItem(keyNames.debriefs))[caseId][0];

assert.equal(migratedStoredDraft.operationalDecision, 'Deny');
assert.equal(migratedStoredDraft.finalFinding, '');
assert.equal(migratedStoredDraft.findingBasis, legacyDraft.reason);
assert.equal(migratedStoredDraft.evidenceRationale, legacyDraft.reason);
assert.equal(migratedStoredDraft.updatedAt, legacyDraft.updatedAt);
assert.equal(migratedStoredDraft.choice, legacyDraft.choice);
assert.equal(migratedStoredPackage.id, legacyPackage.id);
assert.equal(migratedStoredPackage.savedAt, legacyPackage.savedAt);
assert.equal(migratedStoredPackage.savedAtIso, savedAtIso);
assert.equal(migratedStoredPackage.operationalDecision, 'Deny');
assert.equal(migratedStoredPackage.finalFinding, '');
assert.equal(migratedStoredPackage.findingBasis, legacyPackage.reason);
assert.deepEqual(migratedStoredPackage.pinnedEvidence, ['DOC-LEGACY-42']);
assert.deepEqual(migratedStoredPackage.completedTools, ['Document Viewer', 'Financial Investigation']);
assert.deepEqual(migratedStoredPackage.requiredTools, ['Case Summary', 'Document Viewer', 'Business 360']);
assert.deepEqual(migratedStoredPackage.missingTools, ['Business 360']);
assert.equal(
  migratedStoredPackage.noteSnapshot[0],
  'Jul 18, 2026 · Financial Intelligence · Historical source remains available.',
);
assert.equal(migratedStoredDebrief.id, legacyDebrief.id);
assert.equal(migratedStoredDebrief.packageId, legacyDebrief.packageId);
assert.equal(migratedStoredDebrief.completedAt, legacyDebrief.completedAt);
assert.deepEqual(migratedStoredDebrief.scenarioTruth, hiddenTruth);
assert.deepEqual(
  JSON.parse(localStorage.getItem(keyNames.notes)),
  {
    [caseId]: [
      'Learner note survives migration.',
      'Jul 18, 2026 · Financial Intelligence · Historical source remains available.',
      {
        id: 'NOTE-SAVED-42',
        time: 'Jul 18, 09:29 AM',
        source: 'Business 360',
        text: 'Learner wrote Financial Intelligence here; preserve these words.',
      },
    ],
  },
  'Learner-authored note content must survive migration byte for byte.',
);
assert.deepEqual(
  JSON.parse(localStorage.getItem(keyNames.completed))[caseId],
  ['Case Summary', 'Document Viewer', 'Financial Investigation', 'Business 360'],
  'Completed-tool progress must retain every entry while normalizing legacy aliases.',
);
const migratedStoredAction = JSON.parse(localStorage.getItem(keyNames.actions))[caseId][0];
assert.equal(migratedStoredAction.id, 'ACT-SAVED-42');
assert.equal(migratedStoredAction.time, 'Jul 18, 09:30 AM');
assert.equal(migratedStoredAction.source, 'Financial Investigation');
assert.equal(migratedStoredAction.action, 'Opened Financial Intelligence');
assert.equal(migratedStoredAction.detail, 'Financial Intelligence record reviewed.');
const migratedStoredQuickPad = JSON.parse(localStorage.getItem(keyNames.quickPad))[caseId];
assert.equal(
  migratedStoredQuickPad.items[0].id,
  'Financial Intelligence:Account ID:ACCT-42',
  'Quick Pad item identity must be preserved during source alias normalization.',
);
assert.equal(migratedStoredQuickPad.items[0].sourceTool, 'Financial Investigation');
assert.equal(migratedStoredQuickPad.items[0].sourceRecordId, 'FIN-LEGACY-42');
assert.equal(migratedStoredQuickPad.scratch, 'Learner-authored scratch text remains unchanged.');
assert.ok(
  JSON.parse(localStorage.getItem(keyNames.metadata)).resources[keyNames.decisions][caseId],
  'Local migration should advance cloud metadata for the migrated draft.',
);
assert.equal(migrateLocalCaseStorage(), false, 'The storage migration must be idempotent.');

const lateContextCaseId = 'FA-CR-G0000999';
localStorage.setItem(keyNames.decisions, JSON.stringify({
  ...JSON.parse(localStorage.getItem(keyNames.decisions)),
  [lateContextCaseId]: {
    choice: 'Do Not Support Credit Request',
    reason: 'Legacy draft persisted before its IndexedDB case was loaded.',
  },
}));
assert.equal(migrateLocalCaseStorage(), true);
assert.equal(
  JSON.parse(localStorage.getItem(keyNames.decisions))[lateContextCaseId].operationalDecision,
  'Restrict / Reduce',
);
assert.equal(migrateLocalCaseStorage([{
  id: lateContextCaseId,
  customerType: CUSTOMER_TYPES.PERSONAL,
  productType: PRODUCT_TYPES.CREDIT_CARD,
  workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
}]), true);
assert.equal(
  JSON.parse(localStorage.getItem(keyNames.decisions))[lateContextCaseId].operationalDecision,
  'Deny',
  'Loading the generated case must correct a provisional prefix-only migration without changing the saved legacy choice.',
);
const decisionsAfterLateContext = JSON.parse(localStorage.getItem(keyNames.decisions));
delete decisionsAfterLateContext[lateContextCaseId];
localStorage.setItem(keyNames.decisions, JSON.stringify(decisionsAfterLateContext));

const directlyMigratedLegacyCase = migrateGeneratedCase(legacyGeneratedCase);
assert.deepEqual(
  directlyMigratedLegacyCase.toolResults,
  legacyGeneratedCase.toolResults,
  'The schema migration must not rewrite the persisted evidence packet.',
);
assert.equal(directlyMigratedLegacyCase.id, caseId);
assert.equal(directlyMigratedLegacyCase.generatedAt, generatedAt);

const migratedLegacyPayrollCase = migrateGeneratedCase({
  id: 'FA-PAY-GLEGACY-ACCOUNT-1',
  generatedAt: 1722000001042,
  customerType: CUSTOMER_TYPES.BUSINESS,
  productType: PRODUCT_TYPES.PAYROLL_PRODUCT,
  workflowType: WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
  accountId: 'PAY-LEGACY-8801',
  accountOpenDate: 'Feb 3, 2021',
  accountStatus: 'On Hold — NSF',
  currentBalance: 27500,
  availableBalance: 26500,
  businessProfile: {
    legalName: 'Northwind Ledger Works LLC',
    formationState: 'Texas',
    payrollAdministrator: 'Mara Quinn',
  },
  toolResults: {
    payrollHistory: [{
      id: 'RUN-OLDER',
      employer: 'Northwind Ledger Works LLC',
      period: 'Jun 1-15, 2026',
      processedDate: 'Jun 15, 2026',
      totalCompanyDebit: 9000,
      employeeCount: 7,
      paySchedule: 'Twice monthly',
      nextScheduledPayroll: 'Jun 30, 2026',
      fundingStatus: 'Funding completed',
      status: 'Completed',
    }, {
      id: 'RUN-OLD',
      employer: 'Northwind Ledger Works LLC',
      period: 'Jul 1-15, 2026',
      processedDate: 'Jul 15, 2026',
      totalCompanyDebit: 10000,
      employeeCount: 8,
      paySchedule: 'Twice monthly',
      nextScheduledPayroll: 'Jul 31, 2026',
      fundingStatus: 'Returned — NSF',
      status: 'Completed',
    }],
  },
});
const migratedPayrollBusiness = getBusiness360Dossier(migratedLegacyPayrollCase);
const migratedPayrollFinancial = getFinancialInvestigation(migratedLegacyPayrollCase);
assert.equal(migratedLegacyPayrollCase.legacyDerivedEvidence, true);
assert.equal(migratedPayrollBusiness.accounts.length, 1, 'Business 360 must retain the preserved legacy account.');
assert.equal(migratedPayrollFinancial.profile.accounts.length, 1, 'Financial Investigation must retain the same legacy account.');
assert.equal(migratedPayrollBusiness.accounts[0].accountId, 'PAY-LEGACY-8801');
assert.equal(migratedPayrollBusiness.accounts[0].currentBalance, 27500);
assert.equal(
  migratedPayrollBusiness.accounts[0].currentBalance,
  migratedPayrollFinancial.profile.accounts[0].currentBalance,
  'Migrated Business 360 and Financial Investigation account balances must reconcile.',
);
assert.equal(migratedPayrollBusiness.payrollRelationship.payrollAccountStatus, 'On Hold — NSF');
assert.equal(migratedPayrollBusiness.payrollRelationship.lastCompletedPayrollDate, 'Jul 15, 2026');
assert.equal(migratedPayrollBusiness.payrollRelationship.nextScheduledPayroll, 'Jul 31, 2026');
assert.equal(migratedPayrollBusiness.payrollRelationship.lastPayrollAmount, '$10,000.00');
assert.equal(migratedPayrollBusiness.payrollRelationship.averageMonthlyPayroll, '$9,500.00');
assert.equal(
  migratedPayrollFinancial.payroll.records.find((record) => record.payrollRunId === 'RUN-OLD')?.companyDebit,
  10000,
  'Migrated Payroll Relationship and Financial Investigation must use the preserved Payroll History total.',
);
const [enrichedLegacyPayrollCase] = enrichTrainingCases([migratedLegacyPayrollCase]);
assert.ok(enrichedLegacyPayrollCase.availableTools.includes('Payroll History'));
assert.ok(enrichedLegacyPayrollCase.availableTools.includes('Employee Profile'));
const directlyPersistedLegacyCase = persistedGeneratedCaseRecord(legacyGeneratedCase);
assert.deepEqual(directlyPersistedLegacyCase.toolResults, legacyGeneratedCase.toolResults);
assert.equal(directlyPersistedLegacyCase.caseTruth, undefined);
assert.equal(directlyPersistedLegacyCase.correctDetermination, undefined);
assert.deepEqual(
  persistedGeneratedCaseRecord(directlyPersistedLegacyCase),
  directlyPersistedLegacyCase,
  'The truth-free persisted generated-case record must be idempotent.',
);
const directlyPublicLegacyCase = publicGeneratedCaseRecord(directlyPersistedLegacyCase);
assert.doesNotMatch(
  JSON.stringify({
    title: directlyPublicLegacyCase.title,
    scenarioTitle: directlyPublicLegacyCase.scenarioTitle,
    alertReason: directlyPublicLegacyCase.alertReason,
    statement: directlyPublicLegacyCase.statement,
    intakeAnswers: directlyPublicLegacyCase.intakeAnswers,
    events: directlyPublicLegacyCase.events,
    timelineEvents: directlyPublicLegacyCase.timelineEvents,
    actionLog: directlyPublicLegacyCase.actionLog,
    toolResults: directlyPublicLegacyCase.toolResults,
  }),
  hiddenPresentationPattern,
  'The public runtime clone must neutralize answer-revealing legacy evidence.',
);
assert.notEqual(
  directlyPublicLegacyCase.toolResults.rows[0].label,
  legacyGeneratedCase.toolResults.rows[0].label,
  'Neutralizing the runtime clone must not mutate the persisted packet.',
);

const [migratedGeneratedCase] = await listGeneratedCases();
assert.equal(migratedGeneratedCase.id, caseId);
assert.equal(migratedGeneratedCase.generatedAt, generatedAt);
assert.equal(migratedGeneratedCase.domainSchemaVersion, CASE_MIGRATION_VERSION);
assert.equal(migratedGeneratedCase.relationshipViewSchemaVersion, CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION);
assert.equal(migratedGeneratedCase.relationshipDataVersion, LEGACY_RELATIONSHIP_DATA_VERSION);
assert.equal(migratedGeneratedCase.legacyDerivedEvidence, true);
assert.equal(migratedGeneratedCase.customerType, CUSTOMER_TYPES.PERSONAL);
assert.equal(migratedGeneratedCase.productType, PRODUCT_TYPES.CREDIT_CARD);
assert.equal(migratedGeneratedCase.workflowType, WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW);
assert.doesNotMatch(migratedGeneratedCase.alertReason, /synthetic|fraud/i);
assert.deepEqual(migratedGeneratedCase.toolResults.evidence, evidence);
assert.equal(
  Object.prototype.hasOwnProperty.call(migratedGeneratedCase, 'caseTruth'),
  false,
  'The public generated-case record must not retain embedded hidden truth.',
);
assert.equal(
  Object.prototype.hasOwnProperty.call(migratedGeneratedCase, 'correctDetermination'),
  false,
  'The public generated-case record must not retain the legacy hidden answer.',
);
assert.doesNotMatch(
  JSON.stringify({
    intakeAnswers: migratedGeneratedCase.intakeAnswers,
    events: migratedGeneratedCase.events,
    timelineEvents: migratedGeneratedCase.timelineEvents,
    actionLog: migratedGeneratedCase.actionLog,
    toolResults: migratedGeneratedCase.toolResults,
    scenarioId: migratedGeneratedCase.scenarioId,
    scenarioTitle: migratedGeneratedCase.scenarioTitle,
    subtype: migratedGeneratedCase.subtype,
  }),
  hiddenPresentationPattern,
  'Legacy intake, timeline, tool, and scenario labels must be neutralized on the public case.',
);
assert.equal(migratedGeneratedCase.legacyMetadata.claimType, legacyGeneratedCase.type);
assert.equal(migratedGeneratedCase.legacyMetadata.scenarioTitle, legacyGeneratedCase.scenarioTitle);
assert.equal(migratedGeneratedCase.legacyMetadata.alertReason, legacyGeneratedCase.alertReason);
assert.equal(migratedGeneratedCase.legacyMetadata.sourceDomainSchemaVersion, 0);
const [persistedRepositoryCase] = await listPersistedGeneratedCases();
assert.deepEqual(
  persistedRepositoryCase.toolResults,
  legacyGeneratedCase.toolResults,
  'Repository round trips must retain the original evidence packet verbatim.',
);
assert.equal(
  persistedRepositoryCase.toolResults.rows[0].label,
  'Synthetic identity indicator from original packet',
);
assert.equal(persistedRepositoryCase.id, caseId);
assert.equal(persistedRepositoryCase.generatedAt, generatedAt);
assert.equal(persistedRepositoryCase.caseTruth, undefined);
const [storedGeneratedCase] = JSON.parse(localStorage.getItem(keyNames.generated));
assert.deepEqual(
  storedGeneratedCase.toolResults,
  legacyGeneratedCase.toolResults,
  'localStorage migration must persist the original evidence rather than its public redaction.',
);
assert.equal(storedGeneratedCase.id, caseId);
assert.equal(storedGeneratedCase.generatedAt, generatedAt);
assert.equal(storedGeneratedCase.caseTruth, undefined);
assert.deepEqual(
  migrateGeneratedCase(migratedGeneratedCase),
  migratedGeneratedCase,
  'Generated-case migration must be idempotent.',
);
const legacyTruthSnapshot = (await listGeneratedCaseTruthSnapshots())
  .find((snapshot) => snapshot.caseId === caseId);
assert.equal(legacyTruthSnapshot.source, 'legacy-embedded');
assert.equal(legacyTruthSnapshot.truth.finalFinding, 'Fraud Confirmed');
assert.deepEqual(legacyTruthSnapshot.truth.evidenceIds, hiddenTruth.evidenceIds);
assert.deepEqual(legacyTruthSnapshot.truth.suspectedPatterns, ['synthetic-identity']);
assert.equal(legacyTruthSnapshot.truth.operationalDecision, 'Deny');
assert.equal(legacyTruthSnapshot.truth.legacyFinalFinding, hiddenTruth.finalFinding);
assert.equal(
  legacyTruthSnapshot.truth.legacyEvidence.toolResults.rows[0].label,
  legacyGeneratedCase.toolResults.rows[0].label,
  'Neutralizing the public tool text must not overwrite the preserved legacy evidence snapshot.',
);
assert.equal(
  legacyTruthSnapshot.truth.legacyEvidence.intakeAnswers[0].answer,
  legacyGeneratedCase.intakeAnswers[0].answer,
);
const persistedGeneratedMetadata = JSON.parse(localStorage.getItem(keyNames.generatedMetadata));
assert.deepEqual(
  persistedGeneratedMetadata['generated-case-truth-snapshots-v1'].byCaseId[caseId].truth,
  JSON.parse(JSON.stringify(legacyTruthSnapshot.truth)),
  'The localStorage fallback must persist private truth separately so a reload cannot derive a changed answer from the catalog.',
);

const newlyGeneratedCase = await generateAndSaveCase({
  customerType: CUSTOMER_TYPES.PERSONAL,
  productType: PRODUCT_TYPES.CREDIT_CARD,
  workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
  difficulty: 'light',
  evidenceDepth: 'light',
});
assert.equal(newlyGeneratedCase.caseTruth, undefined, 'New public case records must not contain hidden truth.');
assert.equal(newlyGeneratedCase.relationshipViewSchemaVersion, CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION);
assert.equal(newlyGeneratedCase.relationshipDataVersion, CASE_RELATIONSHIP_DATA_VERSION);
assert.equal(newlyGeneratedCase.legacyDerivedEvidence, false);
assert.ok(
  newlyGeneratedCase.toolResults?.relationshipAccounts?.length,
  'New generated cases must persist their relationship-account evidence snapshot at creation.',
);
const newTruthSnapshot = (await listGeneratedCaseTruthSnapshots())
  .find((snapshot) => snapshot.caseId === newlyGeneratedCase.id);
assert.equal(newTruthSnapshot.source, 'generated-at-creation');
assert.ok(newTruthSnapshot.truth.finalFinding);
assert.ok(newTruthSnapshot.truth.operationalDecision || newTruthSnapshot.truth.correctDetermination);

const persistedV2ToolResults = {
  evidence: [{ id: 'DOC-V2-PRESERVED', result: 'Worked evidence remains byte-for-byte stable.' }],
  relationshipRecords: [{ id: 'REL-V2-PRESERVED', status: 'Learner reviewed' }],
};
const persistedV2Truth = {
  operationalDecision: 'Support Customer Claim',
  finalFinding: 'Fraud Not Found',
};
const persistedV2Case = {
  id: 'FA-FCB-GV2-0001',
  caseId: 'FA-FCB-GV2-0001',
  generatedAt: 1722111111111,
  updatedAt: 1722111122222,
  domainSchemaVersion: CASE_MIGRATION_VERSION,
  customerType: CUSTOMER_TYPES.PERSONAL,
  productType: PRODUCT_TYPES.CREDIT_CARD,
  workflowType: WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
  availableTools: [
    'Customer 360',
    'Business 360',
    'KYB Review',
    'Employee Profile',
    'Payroll History',
    'Evidence Center',
    'Financial Intelligence',
  ],
  requiredTools: ['Case Summary', 'Business Intelligence', 'Evidence Center'],
  toolResults: persistedV2ToolResults,
  events: [{ id: 'EVT-V2-PRESERVED', detail: 'Worked timeline evidence.' }],
  progress: ['Case Summary', 'Financial Intelligence'],
  caseTruth: persistedV2Truth,
};
const migratedPersistedV2Case = migrateGeneratedCase(persistedV2Case);
assert.equal(migratedPersistedV2Case.id, persistedV2Case.id);
assert.equal(migratedPersistedV2Case.caseId, persistedV2Case.caseId);
assert.equal(migratedPersistedV2Case.generatedAt, persistedV2Case.generatedAt);
assert.equal(migratedPersistedV2Case.updatedAt, persistedV2Case.updatedAt);
assert.equal(migratedPersistedV2Case.relationshipViewSchemaVersion, CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION);
assert.equal(migratedPersistedV2Case.relationshipDataVersion, LEGACY_RELATIONSHIP_DATA_VERSION);
assert.equal(migratedPersistedV2Case.legacyDerivedEvidence, true);
assert.deepEqual(
  migratedPersistedV2Case.availableTools,
  ['Customer 360', 'Document Viewer', 'Financial Investigation'],
);
assert.deepEqual(migratedPersistedV2Case.requiredTools, ['Case Summary', 'Document Viewer']);
assert.strictEqual(
  migratedPersistedV2Case.toolResults,
  persistedV2ToolResults,
  'The additive relationship marker must not clone or regenerate persisted v2 tool results.',
);
assert.strictEqual(migratedPersistedV2Case.caseTruth, persistedV2Truth);
assert.strictEqual(migratedPersistedV2Case.events, persistedV2Case.events);
assert.strictEqual(migratedPersistedV2Case.progress, persistedV2Case.progress);
assert.deepEqual(migrateGeneratedCase(migratedPersistedV2Case), migratedPersistedV2Case);

const migratedLinkedPersonalV2Case = migrateGeneratedCase({
  ...persistedV2Case,
  id: 'FA-FCB-GV2-LINKED',
  caseId: 'FA-FCB-GV2-LINKED',
  availableTools: ['Customer 360', 'Business 360', 'KYB Review', 'Payroll History'],
  requiredTools: ['Customer 360', 'Business 360', 'KYB Review'],
  businessRelationships: [{
    businessId: 'BIZ-TRAINING-LINKED',
    role: 'Beneficial owner',
  }],
});
assert.deepEqual(
  migratedLinkedPersonalV2Case.availableTools,
  ['Customer 360', 'Business 360'],
  'A persisted personal ownership relationship may retain Business 360, but never KYB or payroll tools.',
);
assert.deepEqual(
  migratedLinkedPersonalV2Case.requiredTools,
  ['Customer 360', 'Business 360'],
);

const explicitCloudCase = {
  ...legacyGeneratedCase,
  domainSchemaVersion: CASE_MIGRATION_VERSION,
  customerType: CUSTOMER_TYPES.BUSINESS,
  productType: PRODUCT_TYPES.BUSINESS_CREDIT_CARD,
  workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
  alertReason: 'Business credit application information requires review.',
  reportedAllegation: '',
  suspectedPatterns: [],
  type: 'Credit Application Review',
  scenarioTitle: 'Business application information review',
  toolResults: {
    evidence: [{ id: 'REMOTE-EVIDENCE', result: 'Remote copy must not replace worked evidence.' }],
  },
  caseTruth: { finalFinding: 'Remote truth must not replace worked truth.' },
};

const migratedPrivateLegacyCase = migrateGeneratedCase(legacyGeneratedCase);
const directlyMerged = mergeGeneratedCaseRecords(migratedPrivateLegacyCase, explicitCloudCase);
assert.equal(directlyMerged.customerType, CUSTOMER_TYPES.BUSINESS);
assert.equal(directlyMerged.productType, PRODUCT_TYPES.BUSINESS_CREDIT_CARD);
assert.deepEqual(directlyMerged.toolResults.evidence, evidence);
assert.deepEqual(directlyMerged.caseTruth, legacyTruthSnapshot.truth);
assert.equal(directlyMerged.id, caseId);
assert.equal(directlyMerged.generatedAt, generatedAt);
assert.equal(directlyMerged.legacyMetadata.claimType, legacyGeneratedCase.type);

await mergeGeneratedCases([explicitCloudCase]);
const repositoryMerged = (await listGeneratedCases()).find((item) => item.id === caseId);
assert.equal(repositoryMerged.customerType, CUSTOMER_TYPES.BUSINESS);
assert.equal(repositoryMerged.productType, PRODUCT_TYPES.BUSINESS_CREDIT_CARD);
assert.deepEqual(repositoryMerged.toolResults.evidence, evidence);
assert.doesNotMatch(JSON.stringify(repositoryMerged.toolResults), hiddenPresentationPattern);
assert.equal(repositoryMerged.caseTruth, undefined);
assert.equal(repositoryMerged.correctDetermination, undefined);
const persistedRepositoryMerged = (await listPersistedGeneratedCases())
  .find((item) => item.id === caseId);
assert.equal(
  persistedRepositoryMerged.toolResults.rows[0].label,
  'Synthetic identity indicator from original packet',
  'Cloud merges must retain the local worked evidence instead of its public redaction.',
);
assert.equal(persistedRepositoryMerged.id, caseId);
assert.equal(persistedRepositoryMerged.generatedAt, generatedAt);
const repositoryMergedTruth = (await listGeneratedCaseTruthSnapshots())
  .find((snapshot) => snapshot.caseId === caseId);
assert.deepEqual(
  repositoryMergedTruth.truth,
  legacyTruthSnapshot.truth,
  'An incoming generated case must not replace the worked case truth snapshot.',
);

const itemId = `id:${caseId}`;
const localSnapshot = {
  schemaVersion: 1,
  resources: {},
  generatedCases: {
    mode: 'array',
    items: {
      [itemId]: {
        value: legacyGeneratedCase,
        position: 0,
        version: { at: generatedAt, deviceId: 'local-device' },
        deleted: false,
      },
    },
  },
};
const remoteSnapshot = {
  schemaVersion: 1,
  resources: {},
  generatedCases: {
    mode: 'array',
    items: {
      [itemId]: {
        value: explicitCloudCase,
        position: 0,
        version: { at: generatedAt + 1, deviceId: 'remote-device' },
        deleted: false,
      },
    },
  },
};
localSnapshot.generatedCaseTruth = {
  mode: 'array',
  items: {
    [itemId]: {
      value: legacyTruthSnapshot,
      position: 0,
      version: { at: generatedAt, deviceId: 'local-device' },
      deleted: false,
    },
  },
};
remoteSnapshot.generatedCaseTruth = {
  mode: 'array',
  items: {
    [itemId]: {
      value: {
        ...legacyTruthSnapshot,
        source: 'runtime-derived',
        truth: { finalFinding: 'Changed catalog truth must not replace the snapshot.' },
      },
      position: 0,
      version: { at: generatedAt + 1, deviceId: 'remote-device' },
      deleted: false,
    },
  },
};
const migratedLocalCloudSnapshot = migrateCloudSnapshotCaseData(localSnapshot);
assert.equal(
  migratedLocalCloudSnapshot.generatedCases.items[itemId].value.toolResults.rows[0].label,
  'Synthetic identity indicator from original packet',
  'Cloud snapshot migration must retain the original encrypted evidence payload.',
);
assert.equal(
  migratedLocalCloudSnapshot.generatedCases.items[itemId].value.caseTruth,
  undefined,
  'Cloud generated-case records must keep truth in the separate truth snapshot resource.',
);
assert.doesNotMatch(
  JSON.stringify(publicGeneratedCaseRecord(
    migratedLocalCloudSnapshot.generatedCases.items[itemId].value,
  ).toolResults),
  hiddenPresentationPattern,
  'The app-facing clone of a cloud record must still be neutral.',
);
const mergedCloudSnapshot = mergeCloudSnapshots(localSnapshot, remoteSnapshot);
assert.equal(
  mergedCloudSnapshot.generatedCases.items[itemId].value.toolResults.rows[0].label,
  'Synthetic identity indicator from original packet',
);
const cloudMerged = materializeCloudSnapshot(mergedCloudSnapshot);
assert.equal(cloudMerged.generatedCases.length, 1);
assert.equal(cloudMerged.generatedCases[0].id, caseId);
assert.equal(cloudMerged.generatedCases[0].customerType, CUSTOMER_TYPES.BUSINESS);
assert.equal(cloudMerged.generatedCases[0].productType, PRODUCT_TYPES.BUSINESS_CREDIT_CARD);
assert.deepEqual(cloudMerged.generatedCases[0].toolResults.evidence, evidence);
assert.equal(
  cloudMerged.generatedCases[0].toolResults.rows[0].label,
  'Synthetic identity indicator from original packet',
);
assert.equal(
  Object.prototype.hasOwnProperty.call(cloudMerged.generatedCases[0], 'caseTruth'),
  false,
  'Materialized cloud generated cases must keep truth separate while retaining persisted evidence.',
);
assert.equal(
  Object.prototype.hasOwnProperty.call(cloudMerged.generatedCases[0], 'correctDetermination'),
  false,
);
assert.equal(cloudMerged.generatedCaseTruthSnapshots.length, 1);
assert.equal(cloudMerged.generatedCaseTruthSnapshots[0].source, 'legacy-embedded');
assert.equal(cloudMerged.generatedCaseTruthSnapshots[0].truth.finalFinding, 'Fraud Confirmed');
assert.equal(cloudMerged.generatedCaseTruthSnapshots[0].truth.legacyFinalFinding, hiddenTruth.finalFinding);
const encryptedTruthSnapshot = await encryptCloudSnapshot(
  mergedCloudSnapshot,
  'fa-migration-truth-test-1234567890',
);
assert.ok(
  !JSON.stringify(encryptedTruthSnapshot).includes(hiddenTruth.finalFinding),
  'Private truth must only enter cloud persistence inside the encrypted envelope.',
);
assert.ok(
  !JSON.stringify(encryptedTruthSnapshot).includes('Synthetic identity indicator from original packet'),
  'Persisted evidence must also remain inside the encrypted cloud envelope.',
);
const decryptedTruthSnapshot = materializeCloudSnapshot(await decryptCloudSnapshot(
  encryptedTruthSnapshot,
  'fa-migration-truth-test-1234567890',
));
assert.equal(
  decryptedTruthSnapshot.generatedCaseTruthSnapshots[0].truth.finalFinding,
  'Fraud Confirmed',
);
assert.equal(
  decryptedTruthSnapshot.generatedCaseTruthSnapshots[0].truth.legacyFinalFinding,
  hiddenTruth.finalFinding,
);

const savedCloudVersion = { at: 1722444444444, deviceId: 'saved-device' };
const cloudAliasSnapshot = {
  schemaVersion: 1,
  resources: {
    [keyNames.completed]: {
      mode: 'array',
      entries: {
        [caseId]: {
          mode: 'array',
          items: {
            'legacy-completed-item': {
              value: 'Evidence Center',
              position: 0,
              version: savedCloudVersion,
              deleted: false,
            },
          },
        },
      },
    },
    [keyNames.notes]: {
      mode: 'array',
      entries: {
        [caseId]: {
          mode: 'array',
          items: {
            'legacy-note-item': {
              value: 'Jul 18, 2026 · Business Intelligence · Saved learner note.',
              position: 0,
              version: savedCloudVersion,
              deleted: false,
            },
          },
        },
      },
    },
    [keyNames.actions]: {
      mode: 'array',
      entries: {
        [caseId]: {
          mode: 'array',
          items: {
            'legacy-action-item': {
              value: {
                id: 'ACT-CLOUD-42',
                time: 'Jul 18, 09:44 AM',
                action: 'Opened Financial Intelligence',
                detail: 'Financial Intelligence source opened.',
                source: 'Financial Intelligence',
              },
              position: 0,
              version: savedCloudVersion,
              deleted: false,
            },
          },
        },
      },
    },
    [keyNames.quickPad]: {
      mode: 'value',
      entries: {
        [caseId]: {
          mode: 'value',
          value: {
            items: [{
              id: 'Business Intelligence:Business ID:BIZ-42',
              label: 'Business ID',
              value: 'BIZ-42',
              sourceTool: 'Business Intelligence',
              sourceRecordId: 'BIZ-42',
            }],
            scratch: 'Cloud scratch survives.',
          },
          version: savedCloudVersion,
          deleted: false,
        },
      },
    },
    [keyNames.packages]: {
      mode: 'array',
      entries: {
        [caseId]: {
          mode: 'array',
          items: {
            'legacy-package-item': {
              value: legacyPackage,
              position: 0,
              version: savedCloudVersion,
              deleted: false,
            },
          },
        },
      },
    },
  },
};
const migratedCloudAliases = migrateCloudSnapshotCaseData(cloudAliasSnapshot);
const cloudResources = migratedCloudAliases.resources;
assert.equal(
  cloudResources[keyNames.completed].entries[caseId].items['legacy-completed-item'].value,
  'Document Viewer',
);
assert.equal(
  cloudResources[keyNames.notes].entries[caseId].items['legacy-note-item'].value,
  'Jul 18, 2026 · Business Intelligence · Saved learner note.',
);
assert.equal(
  cloudResources[keyNames.actions].entries[caseId].items['legacy-action-item'].value.source,
  'Financial Investigation',
);
assert.equal(
  cloudResources[keyNames.quickPad].entries[caseId].value.items[0].sourceTool,
  'Business 360',
);
assert.equal(
  cloudResources[keyNames.quickPad].entries[caseId].value.items[0].id,
  'Business Intelligence:Business ID:BIZ-42',
);
assert.deepEqual(
  cloudResources[keyNames.packages].entries[caseId].items['legacy-package-item'].value.requiredTools,
  ['Case Summary', 'Document Viewer', 'Business 360'],
);
for (const version of [
  cloudResources[keyNames.completed].entries[caseId].items['legacy-completed-item'].version,
  cloudResources[keyNames.notes].entries[caseId].items['legacy-note-item'].version,
  cloudResources[keyNames.actions].entries[caseId].items['legacy-action-item'].version,
  cloudResources[keyNames.quickPad].entries[caseId].version,
  cloudResources[keyNames.packages].entries[caseId].items['legacy-package-item'].version,
]) {
  assert.deepEqual(version, savedCloudVersion, 'Cloud item versions and timestamps must remain unchanged.');
}

const unrelatedResources = {
  [keyNames.notes]: { [caseId]: ['Do not replace this array.'] },
  [keyNames.decisions]: { [caseId]: legacyDraft },
  [keyNames.packages]: { [caseId]: [legacyPackage] },
  [keyNames.debriefs]: { [caseId]: [legacyDebrief] },
};
const resourceMigration = migratePersistenceResources(unrelatedResources, [legacyGeneratedCase]);
assert.deepEqual(resourceMigration.rawByKey[keyNames.notes], unrelatedResources[keyNames.notes]);
assert.equal(resourceMigration.rawByKey[keyNames.decisions][caseId].operationalDecision, 'Deny');
assert.equal(resourceMigration.rawByKey[keyNames.packages][caseId][0].id, legacyPackage.id);
assert.equal(resourceMigration.rawByKey[keyNames.debriefs][caseId][0].completedAt, legacyDebrief.completedAt);

const prefixOnlyLegacyDecisions = {
  'FA-FCB-G0000101': { choice: 'Approve claim based on evidence' },
  'FA-NCB-G0000102': { choice: 'Deny claim based on merchant records' },
  'FA-PAY-G0000103': { choice: 'Hold pending verification' },
  'FA-BEC-G0000104': { choice: 'Release' },
  'FA-AVR-G0000105': { choice: 'Unable to verify with current records' },
  'FA-AWC-G0000106': { choice: 'More Information Needed' },
};
const prefixMigration = migratePersistenceResources({
  [keyNames.decisions]: prefixOnlyLegacyDecisions,
}, []);
const migratedPrefixDrafts = prefixMigration.rawByKey[keyNames.decisions];
assert.equal(migratedPrefixDrafts['FA-FCB-G0000101'].workflowType, WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM);
assert.equal(migratedPrefixDrafts['FA-FCB-G0000101'].operationalDecision, 'Support Customer Claim');
assert.equal(migratedPrefixDrafts['FA-NCB-G0000102'].workflowType, WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE);
assert.equal(migratedPrefixDrafts['FA-NCB-G0000102'].operationalDecision, 'Do Not Support Customer Claim');
assert.equal(migratedPrefixDrafts['FA-PAY-G0000103'].workflowType, WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT);
assert.equal(migratedPrefixDrafts['FA-PAY-G0000103'].operationalDecision, 'Hold');
assert.equal(migratedPrefixDrafts['FA-BEC-G0000104'].workflowType, WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT);
assert.equal(migratedPrefixDrafts['FA-BEC-G0000104'].operationalDecision, 'Release');
assert.equal(migratedPrefixDrafts['FA-AVR-G0000105'].workflowType, WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW);
assert.equal(migratedPrefixDrafts['FA-AVR-G0000105'].operationalDecision, 'Request More Information');
assert.equal(migratedPrefixDrafts['FA-AWC-G0000106'].workflowType, WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW);
assert.equal(migratedPrefixDrafts['FA-AWC-G0000106'].operationalDecision, 'More Information Needed');

console.log('Case migration smoke check passed.');
