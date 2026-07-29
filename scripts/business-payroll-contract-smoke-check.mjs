import fs from 'node:fs';
import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { coreClaimTypes } from '../src/data/claimRegistry.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import { getFinancialRecords } from '../src/data/caseToolData.js';
import {
  employeePayrollHistory,
  getBusiness360Workspace,
  getPayrollHistory,
} from '../src/data/businessPayrollWorkspace.js';
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
if (builtInPayroll.payrollRuns.some((run) => run.employees.every((employee) => employee.name === builtInPayrollCase.person))) fail('Company payroll runs repeat only the case employee instead of listing the company workforce.');
const firstRun = builtInPayroll.payrollRuns[0];
const firstEmployee = firstRun.employees[0];
const employeeHistory = employeePayrollHistory(builtInPayroll, firstEmployee.employeeId);
if (!employeeHistory.paychecks.length || employeeHistory.paychecks.some((paycheck) => paycheck.employeeId !== firstEmployee.employeeId)) fail('Employee Payroll History includes another employee.');
if (!firstRun.companyFunding.bankCode || firstRun.companyFunding.bankCode === firstEmployee.paystub.paymentDestinations[0].bankCode) fail('Company funding Bank Code and employee payment Bank Code are not separated.');
if (JSON.stringify(builtInPayroll.payrollRuns.filter((run) => /May|Jun/.test(run.payDate))).includes('DST-7740')) fail('A May or June payroll displays the destination introduced in July.');
if (!builtInPayroll.payrollRuns.some((run) => run.employees.some((employee) => employee.paystub.paymentDestinations.length > 1))) fail('Built-in payroll lacks a split direct-deposit snapshot.');
const paperCheck = builtInPayroll.payrollRuns.flatMap((run) => run.employees).find((employee) => employee.paymentMethod === 'Paper check')?.paystub.paymentDestinations[0];
if (!paperCheck || paperCheck.bankCode !== 'Not applicable' || paperCheck.destinationId !== 'Not applicable' || !paperCheck.checkNumber) fail('Paper-check paystub does not use Not applicable identifiers and a check number.');

const generatedPayrollCase = createGeneratedCase({ index: 12345678, claimTypeId: 'payroll-direct-deposit', difficulty: 'deep', evidenceDepth: 'deep' });
const generatedPayroll = getPayrollHistory(generatedPayrollCase);
assertPayrollContract('Generated payroll', generatedPayroll);
const generatedEmployee = generatedPayroll.payrollRuns[0].employees[0];
const laterDestination = generatedPayroll.payrollRuns.at(-1).employees[0].paystub.paymentDestinations[0];
for (const run of generatedPayroll.payrollRuns.filter((item) => new Date(item.payDate) < new Date(laterDestination.firstSeen))) {
  if (run.employees[0].paystub.paymentDestinations.some((destination) => destination.destinationId === laterDestination.destinationId)) fail('Generated historical payroll backfills a later destination.');
}

const businessCredit = createGeneratedCase({ index: 88119001, claimTypeId: 'business-loan-bust-out', scenarioId: 'blo-sleeper-llc-sudden-draw' });
if (businessCredit.availableTools.some((tool) => ['Employee Profile', 'Payroll History'].includes(tool))) fail('Business-credit monitoring receives employee or payroll tools without explicit relevance.');
for (const scenarioId of ['cr-new-business', 'cr-existing-business']) {
  const generatedBusinessCredit = createGeneratedCase({ index: 88119002, claimTypeId: 'credit-risk', scenarioId });
  if (generatedBusinessCredit.availableTools.some((tool) => ['Employee Profile', 'Payroll History'].includes(tool))) fail(`${scenarioId} receives employee or payroll tools without explicit relevance.`);
}
if (generatedPayrollCase.availableTools.includes('Transaction History')) fail('Payroll-direct-deposit claim incorrectly receives Transaction History.');

const paymentRecords = getFinancialRecords(generatedPayrollCase).paymentVerification;
const payment = paymentRecords[0];
if (resolvePaymentLookup(paymentRecords, { bankCode: '', destinationId: '', ownerName: generatedPayrollCase.person }).state !== 'not-found') fail('Payment Verification exposes a result without exact identifiers.');
if (resolvePaymentLookup(paymentRecords, { bankCode: payment.bankCode, destinationId: payment.destinationId, ownerName: generatedPayrollCase.person }).state !== 'found') fail('Payment Verification exact search does not reveal the matching result.');

const payrollPanel = fs.readFileSync('src/tools/FinancialBusinessTools.jsx', 'utf8');
for (const anchor of [
  'export function PayrollHistoryTool',
  'Run payroll search',
  'Matched payroll run',
  'Immutable paystub',
  'Current and YTD snapshot',
  'Immutable disbursement records',
  'Open Payment Verification',
  'buildPaymentLookupHint',
]) {
  if (!payrollPanel.includes(anchor)) fail(`Clean Payroll History is missing ${anchor}.`);
}

if (failures.length) {
  console.error('Business 360 and Payroll History contract smoke check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Business 360 and Payroll History contract smoke check passed for migrations, neutral research, reconciled built-in/generated payroll, immutable destinations, split deposits, paper checks, tool scope, Quick Pad actions, and search-first Payment Verification.');
