import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { getFinancialInvestigation } from '../src/data/financialInvestigationRecords.js';
import { getIpRecords } from '../src/data/ipRecords.js';
import { workspaceTools } from '../src/investigationToolGroups.js';
import { searchLinkRelationships } from '../src/data/linkAnalysisRecords.js';
import { resolvePinnedEvidence } from '../src/pinnedEvidenceNavigation.js';

const cases = enrichTrainingCases(trainingCases);
const activeCase = cases[0];
const primaryIpRecord = getIpRecords(activeCase)
  .find((item) => item.ip === activeCase.loginHistory[0].ip);
const checks = [
  ['LOG-1005', 'Login History', 'LOG-1005'],
  [activeCase.loginHistory[0].session, 'Session History', activeCase.loginHistory[0].session],
  [activeCase.loginHistory[0].ip, 'IP Intelligence', primaryIpRecord.id],
  [activeCase.trainingId, 'Customer 360', 'C360-REL'],
];

for (const [pin, expectedTool, expectedRecordId] of checks) {
  const result = resolvePinnedEvidence(pin, activeCase, workspaceTools);
  if (!result) throw new Error(`${pin} did not resolve.`);
  if (result.tool !== expectedTool) throw new Error(`${pin} resolved to ${result.tool}, expected ${expectedTool}.`);
  if (result.recordId !== expectedRecordId) throw new Error(`${pin} resolved to ${result.recordId}, expected ${expectedRecordId}.`);
}

const richFinancialRecords = Object.values(
  getFinancialInvestigation(activeCase).recordsBySection,
).flat();
for (const record of richFinancialRecords) {
  const result = resolvePinnedEvidence(record.id, activeCase, workspaceTools);
  if (
    result?.tool !== 'Financial Investigation'
    || result.recordId !== record.id
    || result.query !== record.id
  ) {
    throw new Error(`${record.id} did not reopen its exact Financial Investigation record.`);
  }
}

const fallback = resolvePinnedEvidence('DOC-UNSAVED-01 | Affidavit', activeCase, workspaceTools);
if (fallback?.tool !== 'Document Viewer' || fallback.recordId !== 'DOC-UNSAVED-01') {
  throw new Error('Document prefix fallback did not preserve the saved identifier.');
}

const legacyAliasFallback = resolvePinnedEvidence(
  'FIN-UNSAVED-01 | Historical financial record',
  activeCase,
  ['Financial Intelligence'],
);
if (
  legacyAliasFallback?.tool !== 'Financial Investigation'
  || legacyAliasFallback.recordId !== 'FIN-UNSAVED-01'
) {
  throw new Error('Legacy navigation tool aliases did not reopen the canonical source tool.');
}

const invalidPersonalBusinessRoute = resolvePinnedEvidence(
  'BIZ-UNSAVED-01 | Historical business record',
  activeCase,
  ['Business Intelligence'],
);
if (invalidPersonalBusinessRoute !== null) {
  throw new Error('Pinned evidence navigation exposed a business-only tool on a personal case.');
}

const linkedPersonalBusinessRoute = resolvePinnedEvidence(
  'BIZ-UNSAVED-02 | Owned training business',
  {
    ...activeCase,
    availableTools: [...activeCase.availableTools, 'Business 360'],
    linkedBusinesses: [{
      businessId: 'BIZ-UNSAVED-02',
      relationship: 'Beneficial owner',
    }],
  },
  ['Customer 360', 'Business 360', 'KYB Review', 'Payroll History'],
);
if (
  linkedPersonalBusinessRoute?.tool !== 'Business 360'
  || linkedPersonalBusinessRoute.recordId !== 'BIZ-UNSAVED-02'
) {
  throw new Error('Pinned evidence navigation did not preserve the explicit ownership-linked Business 360 route.');
}

const phone = activeCase.customer.contact.phone;
for (const pin of [
  `LNK-Phone Number: ${phone}`,
  `LNK-Phone Number: ${phone} · ACCT-02455-HIST`,
]) {
  const result = resolvePinnedEvidence(pin, activeCase, workspaceTools);
  if (
    result?.tool !== 'Link Analysis'
    || result.query !== phone
    || result.identifierType !== 'phone'
    || result.row !== null
  ) {
    throw new Error(`${pin} did not restore the exact Link Analysis search value.`);
  }
  const reopened = searchLinkRelationships({
    query: result.query,
    identifierType: 'phone',
    cases,
    activeCase,
  });
  if (reopened.matches.length < 1) {
    throw new Error(`${pin} reopened Link Analysis without a source-backed matched account.`);
  }
}

const addressPin = resolvePinnedEvidence(
  'LNK-Address: 12-34 Main St. · ACCT-TEST-1002',
  activeCase,
  workspaceTools,
);
if (
  addressPin?.query !== '12-34 Main St.'
  || addressPin.identifierType !== 'address'
  || addressPin.recordId !== 'ACCT-TEST-1002'
) {
  throw new Error('Typed Link Analysis address pin did not preserve its original search and linked account.');
}

console.log('Pinned evidence navigation smoke check passed.');
