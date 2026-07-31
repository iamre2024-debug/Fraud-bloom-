import fs from 'node:fs';
import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { coreClaimTypes } from '../src/data/claimRegistry.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import { getFinancialRecords } from '../src/data/caseToolData.js';
import {
  employeePayrollSnapshots,
  employeePayrollHistory,
  filterPayrollRuns,
  findEmployeeProfile,
  findPayrollRecord,
  getBusiness360Workspace,
  getEmployeeProfiles,
  getPayrollHistory,
  payrollHistoryOverview,
  resolveEmployeeProfileLookup,
  sortEmployeePaymentHistoryNewestFirst,
  sortPayrollRunsNewestFirst,
} from '../src/data/businessPayrollWorkspace.js';
import {
  buildQuickPadDestinationRoute,
  validateQuickPadDestinationPayload,
} from '../src/data/quickPadController.js';
import {
  quickPadQueryForTool,
  quickPadSourceRoute,
} from '../src/data/quickPadRouting.js';
import {
  businessResearchSections,
  lunaBusinessResearchStatuses,
} from '../src/data/businessResearchRecords.js';
import {
  canonicalToolName,
  canonicalToolNames,
  investigationToolGroups,
  workspaceTools,
} from '../src/investigationToolGroups.js';
import { resolvePinnedEvidence } from '../src/pinnedEvidenceNavigation.js';
import { resolvePaymentLookup } from '../src/data/paymentVerification.js';

const failures = [];
const cases = enrichTrainingCases(trainingCases);
const sourceFiles = [
  'src/tools/FinancialBusinessTools.jsx',
  'src/investigationToolGroups.js',
  'src/data/claimRegistry.js',
];

function fail(message) {
  failures.push(message);
}

function cents(value) {
  return Math.round(Number(value ?? 0) * 100);
}

function sum(rows, field) {
  return cents(rows.reduce((total, row) => total + Number(row[field] ?? 0), 0));
}

function assertPayrollContract(label, workspace) {
  if (!workspace.companyPayrollProfile || !workspace.payrollRuns.length) {
    fail(`${label} is missing the normalized company payroll hierarchy.`);
    return;
  }
  if (workspace.contractIssues.length) fail(`${label} payroll contract issues: ${workspace.contractIssues.join(' ')}`);
  for (const run of workspace.payrollRuns) {
    if (run.employeeCount !== run.employees.length) fail(`${label} ${run.id} employee count does not match its employee rows.`);
    for (const field of ['grossWages', 'employeeTaxes', 'employerTaxes', 'deductions', 'employerContributions', 'reimbursements', 'netPay', 'totalPayrollCost']) {
      const paystubField = {
        grossWages: 'grossPay',
        employeeTaxes: 'employeeTaxes',
        employerTaxes: 'employerTaxes',
        deductions: 'employeeDeductions',
        employerContributions: 'employerContributions',
        reimbursements: 'reimbursements',
        netPay: 'netPay',
        totalPayrollCost: 'totalPayrollCost',
      }[field];
      if (cents(run[field]) !== cents(run.employees.reduce((total, employee) => total + employee.paystub.summary[paystubField], 0))) {
        fail(`${label} ${run.id} does not reconcile ${field} to its paystubs.`);
      }
    }
    for (const employee of run.employees) {
      const paystub = employee.paystub;
      for (const field of ['employer', 'employee', 'payPeriod', 'payDate', 'payrollType', 'earnings', 'taxes', 'deductions', 'employerContributions', 'reimbursements', 'adjustments', 'paymentDestinations', 'summary', 'ytdSnapshot']) {
        if (paystub[field] === undefined) fail(`${label} ${paystub.id} is missing ${field}.`);
      }
      if (sum(paystub.paymentDestinations, 'amount') !== cents(paystub.summary.netPay)) fail(`${label} ${paystub.id} destinations do not equal net pay.`);
    }
  }
  for (const field of ['totalPayrollCost', 'grossWages', 'employeeTaxes', 'employerTaxes', 'deductions', 'employerContributions', 'reimbursements', 'netPay', 'totalFundingAmount']) {
    const runField = field === 'totalFundingAmount' ? 'totalFundingAmount' : field;
    if (cents(workspace.summary[field]) !== sum(workspace.payrollRuns, runField)) fail(`${label} selected-range ${field} does not reconcile to its payroll runs.`);
  }
}

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (file !== 'src/investigationToolGroups.js' && source.includes("'KYB Review'")) fail(`${file} still exposes KYB Review as a separate tool.`);
}
if (investigationToolGroups.some((group) => group.tools.includes('KYB Review')) || coreClaimTypes.some((claimType) => [...claimType.availableTools, ...claimType.requiredTools].includes('KYB Review'))) {
  fail('KYB Review still appears in navigation, workspace categories, or claim toolkits.');
}

if (canonicalToolName('KYB Review') !== 'Business 360' || canonicalToolName('Business Intelligence') !== 'Business 360') fail('Legacy business-tool aliases do not route to Business 360.');
const migrated = canonicalToolNames(['KYB Review', 'Business Intelligence', 'Business 360']);
if (migrated.length !== 1 || migrated[0] !== 'Business 360') fail('Legacy completion state does not collapse into Business 360.');
if (canonicalToolName('KYB Review') !== 'Business 360') fail('Legacy Quick Pad source names do not canonicalize to Business 360.');
const businessCase = cases.find((item) => item.availableTools.includes('Business 360'))
  ?? createGeneratedCase({ index: 66224001, claimTypeId: 'payroll-direct-deposit', difficulty: 'standard', evidenceDepth: 'standard' });
for (const pin of ['KYB-OLD-01', 'REG-OLD-01', 'SOS-OLD-01', 'EIN-OLD-01']) {
  if (resolvePinnedEvidence(pin, businessCase, workspaceTools)?.tool !== 'Business 360') fail(`${pin} does not reopen in Business 360.`);
}

for (const activeCase of cases.filter((item) => item.availableTools.includes('Business 360'))) {
  const business = getBusiness360Workspace(activeCase);
  const serialized = JSON.stringify(business);
  for (const forbidden of [activeCase.id, activeCase.claimId, activeCase.amount, 'Case context', 'Payment account change', 'change request', 'investigation conclusion']) {
    if (forbidden && serialized.includes(forbidden)) fail(`${activeCase.id} Business 360 contains current-case value "${forbidden}".`);
  }
  if (!businessResearchSections.every((section) => business.recordsBySection[section.id]?.length)) fail(`${activeCase.id} Business 360 is missing a required profile section.`);
  const topics = business.profile.research.map((item) => item.topic).join(' ');
  for (const topic of ['Owner linkage', 'Entity registration', 'Industry or professional license', 'Web presence', 'Cross-source consistency']) {
    if (!topics.includes(topic)) fail(`${activeCase.id} Luna research is missing ${topic}.`);
  }
  for (const result of business.profile.research) {
    if (!lunaBusinessResearchStatuses.includes(result.status) || !result.source || !result.checkedDate) fail(`${activeCase.id} Luna result ${result.id} lacks an allowed status, source, or checked date.`);
    if (/\b(?:confirmed fraud|fake business|fraudulent owner|shell company|nonexistent business|fraud)\b/i.test(`${result.status} ${result.finding}`)) fail(`${activeCase.id} Luna research exposes prohibited conclusion language.`);
  }
}

const builtInPayrollCase = cases.find((item) => item.id === 'FA-CR-24003');
const builtInPayroll = getPayrollHistory(builtInPayrollCase);
assertPayrollContract('Built-in payroll', builtInPayroll);
const builtInEmployeeProfiles = getEmployeeProfiles(builtInPayrollCase);
const splitDepositProfile = builtInEmployeeProfiles.find((profile) => (
  profile.currentDestinations?.length > 1
));
if (
  !splitDepositProfile
  || splitDepositProfile.currentDestinations.length !== 2
  || new Set(splitDepositProfile.currentDestinations.map((item) => item.destinationId)).size !== 2
) {
  fail('Employee Profile collapses a supplied split direct-deposit instruction into one destination.');
}
const paperCheckProfile = builtInEmployeeProfiles.find((profile) => (
  profile.currentPaymentPlan?.method === 'Paper check'
));
if (
  !paperCheckProfile
  || paperCheckProfile.currentDestinations.length
  || !paperCheckProfile.currentPaymentPlan.checkNumber
) {
  fail('Employee Profile invents payment destination identifiers for a supplied paper-check instruction.');
}
if (builtInPayroll.payrollRuns.some((run) => run.employees.every((employee) => employee.name === builtInPayrollCase.person))) fail('Company payroll runs repeat only the case employee instead of listing the company workforce.');
const firstRun = builtInPayroll.payrollRuns[0];
const firstEmployee = firstRun.employees[0];
const employeeHistory = employeePayrollHistory(builtInPayroll, firstEmployee.employeeId);
if (!employeeHistory.paychecks.length || employeeHistory.paychecks.some((paycheck) => paycheck.employeeId !== firstEmployee.employeeId)) fail('Employee Payroll History includes another employee.');
const newestBuiltInRuns = sortPayrollRunsNewestFirst(builtInPayroll.payrollRuns);
if (newestBuiltInRuns[0]?.id !== builtInPayroll.payrollRuns.at(-1)?.id) fail('Payroll History does not sort source runs newest first.');
if (newestBuiltInRuns.at(-1)?.id !== builtInPayroll.payrollRuns[0]?.id) fail('Payroll History newest-first ordering loses the oldest immutable run.');
const builtInOverview = payrollHistoryOverview(builtInPayroll);
if (
  builtInOverview.latestRun?.id !== newestBuiltInRuns[0]?.id
  || cents(builtInOverview.latestNetPayroll) !== cents(newestBuiltInRuns[0]?.netPay)
  || builtInOverview.payrollRunCount !== builtInPayroll.payrollRuns.length
  || builtInOverview.nextPayDate !== builtInPayroll.companyPayrollProfile.nextPayDate
) {
  fail('Payroll History overview is not derived from the latest supplied run and company payroll profile.');
}
const filterFixture = builtInPayroll.payrollRuns.map((run, index) => ({
  ...run,
  runType: index === 0 ? 'Bonus' : run.runType,
  runStatus: index === 1 ? 'Pending' : run.runStatus,
}));
if (
  filterPayrollRuns(filterFixture, { runType: 'Bonus' }).length !== 1
  || filterPayrollRuns(filterFixture, { status: 'Pending' }).length !== 1
  || filterPayrollRuns(filterFixture, { runType: 'No such type' }).length
) {
  fail('Payroll History run filters do not apply exact source run type and status values.');
}
if (!firstRun.companyFunding.bankCode || firstRun.companyFunding.bankCode === firstEmployee.paystub.paymentDestinations[0].bankCode) fail('Company funding Bank Code and employee payment Bank Code are not separated.');
if (JSON.stringify(builtInPayroll.payrollRuns.filter((run) => /May|Jun/.test(run.payDate))).includes('DST-7740')) fail('A May or June payroll displays the destination introduced in July.');
if (!builtInPayroll.payrollRuns.some((run) => run.employees.some((employee) => employee.paystub.paymentDestinations.length > 1))) fail('Built-in payroll lacks a split direct-deposit snapshot.');
const splitEmployeeOccurrence = newestBuiltInRuns
  .flatMap((run) => run.employees.map((employee) => ({ run, employee })))
  .find(({ employee }) => employee.paystub.paymentDestinations.length > 1);
if (splitEmployeeOccurrence) {
  const splitDestinations = splitEmployeeOccurrence.employee.paystub.paymentDestinations;
  if (sum(splitDestinations, 'amount') !== cents(splitEmployeeOccurrence.employee.paystub.summary.netPay)) {
    fail('Split direct-deposit destinations do not preserve the immutable paystub net-pay total.');
  }
  for (const destination of splitDestinations) {
    const matchedDestination = findPayrollRecord(builtInPayroll, destination.destinationId);
    if (
      matchedDestination?.identifierType !== 'destination-id'
      || matchedDestination?.matchedIdentifier !== destination.destinationId
    ) {
      fail(`Split destination ${destination.destinationId} is not exactly searchable in Payroll History.`);
    }
  }
}
const paperCheck = builtInPayroll.payrollRuns.flatMap((run) => run.employees).find((employee) => employee.paymentMethod === 'Paper check')?.paystub.paymentDestinations[0];
if (!paperCheck || paperCheck.bankCode !== 'Not applicable' || paperCheck.destinationId !== 'Not applicable' || !paperCheck.checkNumber) fail('Paper-check paystub does not use Not applicable identifiers and a check number.');
if (findPayrollRecord(builtInPayroll, 'Not applicable')) fail('Payroll History treats a paper-check Not applicable placeholder as a searchable identifier.');

const repeatedEmployeeMatches = newestBuiltInRuns.filter((run) => (
  run.employees.some((employee) => employee.employeeId === firstEmployee.employeeId)
));
const repeatedEmployeeResult = findPayrollRecord(builtInPayroll, firstEmployee.employeeId);
if (
  repeatedEmployeeResult?.identifierType !== 'employee-id'
  || repeatedEmployeeResult?.run?.id !== repeatedEmployeeMatches[0]?.id
  || repeatedEmployeeResult?.matchCount !== repeatedEmployeeMatches.length
  || repeatedEmployeeResult?.occurrences?.length !== repeatedEmployeeMatches.length
) {
  fail('Repeated Employee ID search does not select the newest occurrence while disclosing its full immutable history.');
}
const newestPaystub = repeatedEmployeeResult?.paystub;
if (
  !newestPaystub
  || findPayrollRecord(builtInPayroll, newestPaystub.id)?.identifierType !== 'paystub-id'
  || findPayrollRecord(builtInPayroll, builtInPayroll.companyPayrollProfile.payrollId)?.identifierType !== 'payroll-profile-id'
  || findPayrollRecord(builtInPayroll, newestBuiltInRuns[0].id)?.identifierType !== 'payroll-run-id'
) {
  fail('Payroll profile, run, employee, and paystub exact identifier contracts are incomplete.');
}

const generatedPayrollCase = createGeneratedCase({ index: 12345678, claimTypeId: 'payroll-direct-deposit', difficulty: 'deep', evidenceDepth: 'deep' });
const generatedPayroll = getPayrollHistory(generatedPayrollCase);
assertPayrollContract('Generated payroll', generatedPayroll);
const generatedEmployee = generatedPayroll.payrollRuns[0].employees[0];
const laterDestination = generatedPayroll.payrollRuns.at(-1).employees[0].paystub.paymentDestinations[0];
for (const run of generatedPayroll.payrollRuns.filter((item) => new Date(item.payDate) < new Date(laterDestination.firstSeen))) {
  if (run.employees[0].paystub.paymentDestinations.some((destination) => destination.destinationId === laterDestination.destinationId)) fail('Generated historical payroll backfills a later destination.');
}
const newestGeneratedRuns = sortPayrollRunsNewestFirst(generatedPayroll.payrollRuns);
const newestGeneratedRun = newestGeneratedRuns[0];
const newestGeneratedEmployee = newestGeneratedRun.employees[0];
const newestGeneratedPaystub = newestGeneratedEmployee.paystub;
const newestGeneratedDestination = newestGeneratedPaystub.paymentDestinations[0];
const generatedExactLookups = [
  [generatedPayroll.companyPayrollProfile.payrollId, 'payroll-profile-id'],
  [newestGeneratedRun.id, 'payroll-run-id'],
  [newestGeneratedEmployee.employeeId, 'employee-id'],
  [newestGeneratedPaystub.id, 'paystub-id'],
  [newestGeneratedDestination.id, 'payment-destination-record-id'],
  [newestGeneratedDestination.destinationId, 'destination-id'],
  [newestGeneratedDestination.bankCode, 'bank-code'],
  [newestGeneratedDestination.paymentRecordId, 'payment-record-id'],
  [newestGeneratedRun.companyFunding.bankCode, 'funding-bank-code'],
  [newestGeneratedRun.companyFunding.paymentRecordId, 'funding-payment-record-id'],
];
for (const [identifier, expectedType] of generatedExactLookups) {
  const match = findPayrollRecord(generatedPayroll, identifier);
  if (
    match?.identifierType !== expectedType
    || match?.matchedIdentifier !== identifier
    || match?.run?.id !== newestGeneratedRun.id
  ) {
    fail(`Payroll exact search does not preserve ${expectedType} identity for ${identifier}.`);
  }
}
for (const invalid of ['', ' ', 'Not supplied', 'Not applicable', 'Not recorded', 'none', 'PAYROLL-PARTIAL']) {
  if (findPayrollRecord(generatedPayroll, invalid)) fail(`Payroll History accepted invalid or partial exact query "${invalid}".`);
}

const historicalDestination = generatedPayroll.payrollRuns[0].employees[0].paystub.paymentDestinations[0];
const historicalDestinationResult = findPayrollRecord(generatedPayroll, historicalDestination.destinationId);
const historicalOccurrences = newestGeneratedRuns.filter((run) => run.employees.some((employee) => (
  employee.paystub.paymentDestinations.some((destination) => (
    destination.destinationId === historicalDestination.destinationId
  ))
)));
if (
  historicalDestinationResult?.run?.id !== historicalOccurrences[0]?.id
  || historicalDestinationResult?.matchCount !== historicalOccurrences.length
  || historicalDestinationResult?.occurrences?.length !== historicalOccurrences.length
) {
  fail('Historical payroll destination search does not preserve only its real occurrences in newest-first order.');
}

const payrollQuickPadItems = [{
  id: `${newestGeneratedPaystub.id}:quick-pad`,
  label: 'Paystub ID',
  value: newestGeneratedPaystub.id,
  sourceTool: 'Payroll History',
  sourceRecordId: newestGeneratedPaystub.id,
  identifierType: 'paystub-id',
}];
const payrollQuickPadDestination = buildQuickPadDestinationRoute(
  'Payroll History',
  payrollQuickPadItems,
);
if (
  payrollQuickPadDestination?.payload.query !== newestGeneratedPaystub.id
  || payrollQuickPadDestination?.payload.sourceRecordId !== newestGeneratedPaystub.id
  || payrollQuickPadDestination?.payload.identifierType !== 'paystub-id'
  || !validateQuickPadDestinationPayload(
    'Payroll History',
    payrollQuickPadDestination?.payload,
  ).valid
) {
  fail('Typed Payroll Quick Pad item does not preserve its exact paystub identifier and label.');
}
if (quickPadQueryForTool(payrollQuickPadItems[0], 'Payroll History') !== newestGeneratedPaystub.id) {
  fail('Payroll Quick Pad query decorates or replaces the exact source identifier.');
}
const payrollSourceRoute = quickPadSourceRoute(payrollQuickPadItems[0], {
  availableTools: generatedPayrollCase.availableTools,
});
if (
  payrollSourceRoute?.sourceTool !== 'Payroll History'
  || payrollSourceRoute?.query !== newestGeneratedPaystub.id
) {
  fail('Payroll Quick Pad cannot reopen its exact source record in Payroll History.');
}
for (const exactPayrollIdentifier of [newestGeneratedRun.id, newestGeneratedPaystub.id]) {
  if (resolvePinnedEvidence(exactPayrollIdentifier, generatedPayrollCase, workspaceTools)?.tool !== 'Payroll History') {
    fail(`${exactPayrollIdentifier} does not route back to Payroll History from pinned evidence.`);
  }
}

const employeeContractCase = {
  id: 'FA-EMPLOYEE-CONTRACT-1',
  toolResults: {
    employeeProfile: [
      {
        id: 'EMP-CONTRACT-1',
        name: 'EMP-CONTRACT-2',
        employer: 'Contract Training Company',
        hireDate: 'Jan 2, 2024',
        paymentHistory: [
          {
            effectiveDate: 'Jul 1, 2026',
            method: 'Direct deposit',
            paymentRecordId: 'PV-CURRENT-1',
            destinations: [{
              id: 'PD-CURRENT-1',
              bankCode: 'BC-CURRENT-1',
              destinationId: 'DST-CURRENT-1',
              paymentRecordId: 'PV-CURRENT-1',
            }],
          },
          {
            effectiveDate: 'Jan 1, 2025',
            method: 'Paper check',
            paymentRecordId: 'PV-OLD-CHECK-1',
            destinations: [],
          },
          {
            effectiveDate: 'May 1, 2026',
            method: 'Direct deposit',
            paymentRecordId: 'PV-MIDDLE-1',
            destinations: [{
              id: 'PD-MIDDLE-1',
              bankCode: 'BC-MIDDLE-1',
              destinationId: 'DST-MIDDLE-1',
              paymentRecordId: 'PV-MIDDLE-1',
            }],
          },
        ],
      },
      { id: 'EMP-CONTRACT-2', name: 'Shared Employee' },
      { id: 'EMP-CONTRACT-3', name: 'Shared Employee' },
    ],
    payrollRuns: [
      {
        id: 'PR-CONTRACT-NEW',
        payDate: 'Jul 15, 2026',
        employees: [{
          employeeId: 'EMP-CONTRACT-1',
          name: 'EMP-CONTRACT-2',
          paystub: { id: 'STUB-CONTRACT-NEW', paymentDestinations: [] },
        }],
      },
      {
        id: 'PR-CONTRACT-OLD',
        payDate: 'Jan 15, 2026',
        employees: [
          { employeeId: 'EMP-CONTRACT-1', name: 'EMP-CONTRACT-2' },
          {
            employeeId: 'EMP-CONTRACT-2',
            name: 'Shared Employee',
            paystub: { id: 'STUB-CONTRACT-EMP-2', paymentDestinations: [] },
          },
        ],
      },
      {
        id: 'PR-CONTRACT-MIDDLE',
        payDate: 'May 15, 2026',
        employees: [{
          employeeId: 'EMP-CONTRACT-1',
          name: 'EMP-CONTRACT-2',
          paystub: { id: 'STUB-CONTRACT-MIDDLE', paymentDestinations: [] },
        }],
      },
    ],
  },
};
const employeeProfiles = getEmployeeProfiles(employeeContractCase);
const primaryEmployeeProfile = employeeProfiles.find((item) => item.id === 'EMP-CONTRACT-1');
const secondaryEmployeeProfile = employeeProfiles.find((item) => item.id === 'EMP-CONTRACT-2');
if (
  !primaryEmployeeProfile
  || primaryEmployeeProfile.lastSeen !== 'Jul 15, 2026'
  || primaryEmployeeProfile.latestPaycheck?.runId !== 'PR-CONTRACT-NEW'
  || primaryEmployeeProfile.linkedPayroll.join('|') !== 'STUB-CONTRACT-NEW|STUB-CONTRACT-MIDDLE'
  || primaryEmployeeProfile.paycheckHistory.length !== 3
) {
  fail('Employee Profile does not preserve employee-specific newest-first payroll snapshots or safely omit a sparse paystub ID.');
}
if (
  secondaryEmployeeProfile?.lastSeen !== 'Jan 15, 2026'
  || secondaryEmployeeProfile?.latestPaycheck?.runId !== 'PR-CONTRACT-OLD'
) {
  fail('Employee Profile last-seen data is derived from a company-wide run instead of the employee’s newest supplied occurrence.');
}
if (
  primaryEmployeeProfile?.currentPaymentPlan?.paymentRecordId !== 'PV-CURRENT-1'
  || primaryEmployeeProfile?.currentDestinations?.[0]?.destinationId !== 'DST-CURRENT-1'
  || sortEmployeePaymentHistoryNewestFirst(
    employeeContractCase.toolResults.employeeProfile[0].paymentHistory,
  )[0]?.paymentRecordId !== 'PV-CURRENT-1'
) {
  fail('Employee Profile current payment instruction depends on source-array order instead of the newest supplied effective date.');
}
if (
  primaryEmployeeProfile?.officialContact
  || primaryEmployeeProfile?.linkedPayroll.includes(undefined)
  || employeePayrollSnapshots(
    employeeContractCase.toolResults.payrollRuns,
    'EMP-CONTRACT-1',
  )[0]?.runId !== 'PR-CONTRACT-NEW'
) {
  fail('Employee Profile invents an official contact or retains an invalid sparse-paystub link.');
}
if (
  resolveEmployeeProfileLookup(employeeProfiles, 'EMP-CONTRACT-2').state !== 'found'
  || findEmployeeProfile(employeeProfiles, 'EMP-CONTRACT-2')?.id !== 'EMP-CONTRACT-2'
) {
  fail('Employee Profile does not prioritize an exact Employee ID over another profile whose name equals that ID.');
}
const ambiguousEmployeeLookup = resolveEmployeeProfileLookup(employeeProfiles, 'Shared Employee');
if (
  ambiguousEmployeeLookup.state !== 'ambiguous'
  || ambiguousEmployeeLookup.record
  || ambiguousEmployeeLookup.matches.length !== 2
) {
  fail('Employee Profile silently selects the first profile when an exact employee name is ambiguous.');
}
for (const invalidEmployeeQuery of ['', ' ', 'Not supplied', 'Not applicable', 'Not recorded', 'none']) {
  if (resolveEmployeeProfileLookup(employeeProfiles, invalidEmployeeQuery).state !== 'invalid') {
    fail(`Employee Profile accepted invalid exact query "${invalidEmployeeQuery}".`);
  }
}
if (resolveEmployeeProfileLookup(employeeProfiles, 'EMP-CONTRACT').state !== 'not-found') {
  fail('Employee Profile accepted a partial Employee ID search.');
}

const legacyPayrollCase = {
  id: 'FA-LEGACY-PAYROLL-1',
  accountId: 'PAYROLL-LEGACY-1',
  profile: { business: 'Preserved Training Company' },
  toolResults: {
    payrollHistory: [{
      id: 'LEGACY-PR-1',
      employer: 'Preserved Training Company',
      period: 'Apr 1 – Apr 15, 2024',
      processedDate: 'Apr 15, 2024',
      status: 'Recorded',
      amount: '$12,345.67',
    }],
  },
};
const legacyPayroll = getPayrollHistory(legacyPayrollCase);
const legacyRun = legacyPayroll.payrollRuns[0];
if (
  !legacyRun?.legacySummaryOnly
  || legacyRun.employees.length
  || legacyRun.employeeCount !== null
  || legacyRun.grossWages !== null
  || legacyRun.netPay !== null
  || legacyRun.totalPayrollCost !== null
  || legacyPayroll.summary.employeesPaid !== null
  || legacyPayroll.summary.grossWages !== null
  || legacyPayroll.summary.netPay !== null
) {
  fail('Legacy Payroll History invents employee, paystub, count, or payroll-total detail that was not supplied.');
}
if (
  findPayrollRecord(legacyPayroll, 'LEGACY-PR-1')?.identifierType !== 'payroll-run-id'
  || findPayrollRecord(legacyPayroll, 'FA-LEGACY-PAYROLL-1-EMP-1')
) {
  fail('Legacy Payroll History exact search does not expose only the supplied summary-run identifier.');
}

const businessCredit = createGeneratedCase({ index: 88119001, claimTypeId: 'business-loan-bust-out', scenarioId: 'blo-sleeper-llc-sudden-draw' });
if (businessCredit.availableTools.some((tool) => ['Employee Profile', 'Payroll History'].includes(tool))) fail('Business-credit monitoring receives employee or payroll tools without explicit relevance.');
for (const scenarioId of ['cr-new-business', 'cr-existing-business']) {
  const generatedBusinessCredit = createGeneratedCase({ index: 88119002, claimTypeId: 'credit-risk', scenarioId });
  if (generatedBusinessCredit.availableTools.some((tool) => ['Employee Profile', 'Payroll History'].includes(tool))) fail(`${scenarioId} receives employee or payroll tools without explicit relevance.`);
}
if (generatedPayrollCase.availableTools.includes('Transaction History')) fail('Payroll-direct-deposit claim incorrectly receives Transaction History.');
if (generatedPayrollCase.requiredTools.includes('Transaction History')) fail('Payroll-direct-deposit claim incorrectly requires Transaction History.');
const generatedPayrollAtoCase = createGeneratedCase({
  index: 12345679,
  claimTypeId: 'payroll-account-takeover',
  difficulty: 'deep',
  evidenceDepth: 'deep',
});
if (
  generatedPayrollAtoCase.availableTools.includes('Transaction History')
  || generatedPayrollAtoCase.requiredTools.includes('Transaction History')
) {
  fail('Payroll account takeover incorrectly receives or requires Transaction History.');
}

const paymentRecords = getFinancialRecords(generatedPayrollCase).paymentVerification;
const payment = paymentRecords[0];
if (resolvePaymentLookup(paymentRecords, { bankCode: '', destinationId: '', ownerName: generatedPayrollCase.person }).state !== 'not-found') fail('Payment Verification exposes a result without exact identifiers.');
if (resolvePaymentLookup(paymentRecords, { bankCode: payment.bankCode, destinationId: payment.destinationId, ownerName: generatedPayrollCase.person }).state !== 'found') fail('Payment Verification exact search does not reveal the matching result.');

const payrollPanel = fs.readFileSync('src/tools/FinancialBusinessTools.jsx', 'utf8');
for (const anchor of [
  'export function EmployeeProfileTool',
  'Open another employee profile',
  'The active employee profile opens automatically.',
  'Run employee search',
  'Latest Paycheck',
  'Payment Destinations',
  'Compensation History',
  'Profile History',
  'Open Payroll History',
  'Verify exact destination',
  'resolveEmployeeProfileLookup',
  'pinPayload',
]) {
  if (!payrollPanel.includes(anchor)) fail(`Clean Employee Profile is missing ${anchor}.`);
}
if (payrollPanel.includes('Employer payroll office on file')) {
  fail('Employee Profile still invents an employer payroll contact when none was supplied.');
}
for (const anchor of [
  'export function PayrollHistoryTool',
  'Run payroll search',
  'Payroll overview',
  'payroll-history-filters',
  'Open payroll run',
  'Employee Pay Records Preview',
  'Open paystub',
  'Select payment destination',
  'Verify payment destination',
  'matchedIdentifier',
  'pinPayload',
]) {
  if (!payrollPanel.includes(anchor)) fail(`Clean Payroll History is missing ${anchor}.`);
}

if (failures.length) {
  console.error('Business 360 and Payroll History contract smoke check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Business 360, Employee Profile, and Payroll History contract smoke check passed for migrations, neutral research, exact and ambiguous employee lookup, employee-specific newest-first snapshots, sparse paystubs, current payment ordering, reconciled built-in/generated payroll, functional filters, non-invented legacy summaries, immutable historical/split/paper-check destinations, typed Quick Pad reopen, pinned routing, tool scope, and search-first Payment Verification.');
