import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { getFinancialInvestigation } from '../src/data/financialInvestigationRecords.js';
import { getIpRecords } from '../src/data/ipRecords.js';
import { workspaceTools } from '../src/investigationToolGroups.js';
import { searchLinkRelationships } from '../src/data/linkAnalysisRecords.js';
import { resolvePinnedEvidence } from '../src/pinnedEvidenceNavigation.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import { buildCoreToolRecords } from '../src/data/coreToolRecords.js';

const cases = enrichTrainingCases(trainingCases);
const activeCase = cases[0];
const primaryIpRecord = getIpRecords(activeCase)
  .find((item) => item.ip === activeCase.loginHistory[0].ip);
const checks = [
  ['LOG-1005', 'Login History', 'LOG-1005'],
  [activeCase.loginHistory[0].session, 'Session History', activeCase.loginHistory[0].session],
  [activeCase.loginHistory[0].ip, 'IP Intelligence', primaryIpRecord.id],
  [activeCase.trainingId, 'Customer 360', 'C360-REL', activeCase.trainingId],
  [activeCase.customer.profileChanges[0].id, 'Customer 360', activeCase.customer.profileChanges[0].id, activeCase.trainingId],
  ['SVC-1001', 'Customer 360', 'SVC-1001', activeCase.trainingId],
  ['PROFILE-95881-1', 'Customer 360', 'PROFILE-95881-1', activeCase.trainingId],
];

const transactionPin = resolvePinnedEvidence('TXN-1001', activeCase, workspaceTools);
if (
  transactionPin?.tool !== 'Transaction History'
  || transactionPin.query !== 'TXN-1001'
  || transactionPin.recordId !== 'TXN-1001'
) {
  throw new Error('TXN-1001 did not reopen its exact Transaction History source record.');
}
const systemAccessPin = resolvePinnedEvidence('SYS-ATO-002', activeCase, workspaceTools);
if (
  systemAccessPin?.tool !== 'System Access Lane'
  || systemAccessPin.query !== 'SYS-ATO-002'
  || systemAccessPin.recordId !== 'SYS-ATO-002'
  || systemAccessPin.identifierType !== 'system-access-record-id'
  || systemAccessPin.row?.id !== 'SYS-ATO-002'
) {
  throw new Error('SYS-ATO-002 did not reopen its exact System Access Lane source record.');
}
const generatedTransactionCase = createGeneratedCase({
  index: 77881099,
  claimTypeId: 'card-account-takeover',
});
const generatedTransactionId = generatedTransactionCase.toolResults.transactions[0].id;
const generatedTransactionPin = resolvePinnedEvidence(
  generatedTransactionId,
  generatedTransactionCase,
  workspaceTools,
);
if (
  generatedTransactionPin?.tool !== 'Transaction History'
  || generatedTransactionPin.query !== generatedTransactionId
) {
  throw new Error(`${generatedTransactionId} did not reopen in Transaction History.`);
}

for (const [pin, expectedTool, expectedRecordId, expectedQuery] of checks) {
  const result = resolvePinnedEvidence(pin, activeCase, workspaceTools);
  if (!result) throw new Error(`${pin} did not resolve.`);
  if (result.tool !== expectedTool) throw new Error(`${pin} resolved to ${result.tool}, expected ${expectedTool}.`);
  if (result.recordId !== expectedRecordId) throw new Error(`${pin} resolved to ${result.recordId}, expected ${expectedRecordId}.`);
  if (expectedQuery && result.query !== expectedQuery) {
    throw new Error(`${pin} reopened with ${result.query}, expected Customer 360 query ${expectedQuery}.`);
  }
}

const richFinancialRecords = Object.values(
  getFinancialInvestigation(activeCase).recordsBySection,
).flat();
for (const record of richFinancialRecords.filter((item) => !/^TXN-/i.test(item.id))) {
  const result = resolvePinnedEvidence(record.id, activeCase, workspaceTools);
  if (
    result?.tool !== 'Financial Investigation'
    || result.recordId !== record.id
    || result.query !== record.id
  ) {
    throw new Error(`${record.id} did not reopen its exact Financial Investigation record.`);
  }
}

for (const [claimTypeId, index] of [
  ['payroll-direct-deposit', 77881101],
  ['payroll-account-takeover', 77881102],
]) {
  const payrollCase = createGeneratedCase({ index, claimTypeId });
  const staleTransactionRoute = resolvePinnedEvidence(
    'TXN-STALE-1',
    payrollCase,
    workspaceTools,
  );
  if (staleTransactionRoute !== null) {
    throw new Error(`${claimTypeId} exposed Transaction History through a stale transaction pin.`);
  }

  const payrollProfile = payrollCase.toolResults.companyPayrollProfile;
  const payrollRun = payrollCase.toolResults.payrollRuns.at(-1);
  const payrollEmployee = payrollRun.employees[0];
  const payrollPaystub = payrollEmployee.paystub;
  for (const [identifier, expectedType, expectedTool = 'Payroll History'] of [
    [payrollProfile.payrollId, 'payroll-profile-id'],
    [payrollRun.id, 'payroll-run-id'],
    [payrollEmployee.employeeId, 'employee-id', 'Employee Profile'],
    [payrollPaystub.id, 'paystub-id'],
  ]) {
    const result = resolvePinnedEvidence(identifier, payrollCase, workspaceTools);
    if (
      result?.tool !== expectedTool
      || result.query !== identifier
      || result.recordId !== identifier
      || result.identifierType !== expectedType
    ) {
      throw new Error(`${identifier} did not reopen its exact typed ${expectedTool} record.`);
    }
  }
  const decoratedEmployeePin = resolvePinnedEvidence(
    `${payrollEmployee.employeeId} · ${payrollEmployee.name}`,
    payrollCase,
    workspaceTools,
  );
  if (
    decoratedEmployeePin?.tool !== 'Employee Profile'
    || decoratedEmployeePin.query !== payrollEmployee.employeeId
    || decoratedEmployeePin.recordId !== payrollEmployee.employeeId
    || decoratedEmployeePin.identifierType !== 'employee-id'
  ) {
    throw new Error(`${payrollEmployee.employeeId} decorated pin did not reopen the exact Employee Profile.`);
  }

  const unresolvedPaystubId = `${payrollCase.id}-PR-99-STUB-EMP-99`;
  const payrollCaseWithoutIndexedPaystubs = {
    ...payrollCase,
    toolResults: {
      ...payrollCase.toolResults,
      companyPayrollProfile: null,
      payrollRuns: [],
    },
  };
  const unresolvedPaystubRoute = resolvePinnedEvidence(
    unresolvedPaystubId,
    payrollCaseWithoutIndexedPaystubs,
    workspaceTools,
  );
  if (
    unresolvedPaystubRoute?.tool !== 'Payroll History'
    || unresolvedPaystubRoute.query !== unresolvedPaystubId
    || unresolvedPaystubRoute.recordId !== unresolvedPaystubId
  ) {
    throw new Error(`${unresolvedPaystubId} did not preserve its explicit STUB fallback in Payroll History.`);
  }

  const destination = payrollPaystub.paymentDestinations[0];
  const indexedPayrollRows = buildCoreToolRecords('Payroll History', payrollCase).rows;
  for (const [identifier, expectedType] of [
    [payrollProfile.payrollId, 'payroll-profile-id'],
    [payrollRun.id, 'payroll-run-id'],
    [payrollEmployee.employeeId, 'employee-id'],
    [payrollPaystub.id, 'paystub-id'],
    [destination.id, 'payment-destination-record-id'],
    [destination.destinationId, 'destination-id'],
    [destination.bankCode, 'bank-code'],
    [destination.paymentRecordId, 'payment-record-id'],
    [payrollRun.companyFunding.bankCode, 'funding-bank-code'],
    [payrollRun.companyFunding.paymentRecordId, 'funding-payment-record-id'],
  ]) {
    const indexed = indexedPayrollRows.find((row) => (
      row.pin === identifier && row.identifierType === expectedType
    ));
    if (
      !indexed
      || indexed.matchedIdentifier !== identifier
      || indexed.label !== indexed.identifierLabel
    ) {
      throw new Error(`${identifier} was not indexed as an exact ${expectedType} Payroll History record.`);
    }
  }
}

if (resolvePinnedEvidence('EMP-UNAVAILABLE-1', activeCase, workspaceTools) !== null) {
  throw new Error('An Employee Profile pin reopened a payroll-only tool on an unavailable personal case.');
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
