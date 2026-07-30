import fs from 'node:fs';
import {
  investigationToolGroups,
  workflowReviewGroup,
  workspaceMapBlueprints,
  workspaceTools,
} from '../src/investigationToolGroups.js';
import { getDecisionChecklist } from '../src/data/decisionChecklist.js';
import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { getWorkspaceProgress } from '../src/data/workspaceProgress.js';
import { publicCaseSearchText } from '../src/data/publicCaseView.js';
import {
  applyWorkflowSubmissionGate,
  requiredSubmissionStages,
} from '../src/app/useWorkspaceState.js';

const failures = [];
const identitySource = fs.readFileSync('src/tools/IdentityDigitalTools.jsx', 'utf8');
const financialSource = fs.readFileSync('src/tools/FinancialBusinessTools.jsx', 'utf8');
const supportSource = fs.readFileSync('src/tools/SupportTools.jsx', 'utf8');
const appSource = fs.readFileSync('src/App.jsx', 'utf8');
const workflowSource = fs.readFileSync('src/screens/ReviewWorkflow.jsx', 'utf8');
const dashboardSource = fs.readFileSync('src/screens/Dashboard.jsx', 'utf8');
const caseQueueSource = fs.readFileSync('src/screens/CaseQueue.jsx', 'utf8');
const briefingSource = fs.readFileSync('src/screens/CaseBriefing.jsx', 'utf8');
const workspaceSource = fs.readFileSync('src/screens/Workspace.jsx', 'utf8');
const quickPadSource = fs.readFileSync('src/components/QuickPad.jsx', 'utf8');
const shellSource = fs.readFileSync('src/components/AppShell.jsx', 'utf8');
const stateSource = fs.readFileSync('src/app/useWorkspaceState.js', 'utf8');
const lunaSource = fs.readFileSync('src/data/lunaDebrief.js', 'utf8');
const skyCss = fs.readFileSync('src/styles/sky.css', 'utf8');
const responsiveCss = fs.readFileSync('src/styles/responsive.css', 'utf8');
const indicatorsSource = workflowSource.slice(
  workflowSource.indexOf('export function IndicatorsReview'),
  workflowSource.indexOf('const decisionDescriptions'),
);
const determinationSource = workflowSource.slice(
  workflowSource.indexOf('export function Determination'),
  workflowSource.indexOf('export function SubmitDecision'),
);
const submitDecisionSource = workflowSource.slice(
  workflowSource.indexOf('export function SubmitDecision'),
  workflowSource.indexOf('export function LunaDebrief'),
);
const lunaDebriefScreenSource = workflowSource.slice(
  workflowSource.indexOf('export function LunaDebrief'),
  workflowSource.indexOf('export function CaseReport'),
);
const decisionVisualSource = workflowSource.slice(
  workflowSource.indexOf('function decisionVisual'),
  workflowSource.indexOf('export function InvestigationSummary'),
);
const financialInvestigationSource = financialSource.slice(
  financialSource.indexOf('export function FinancialInvestigationTool'),
  financialSource.indexOf('export function TransactionHistoryTool'),
);
const transactionHistorySource = financialSource.slice(
  financialSource.indexOf('export function TransactionHistoryTool'),
  financialSource.indexOf('function merchantAuthorizationFields'),
);
const paymentVerificationSource = financialSource.slice(
  financialSource.indexOf('export function PaymentVerificationTool'),
  financialSource.indexOf('function explicitBusinessProfile'),
);
const merchantSource = financialSource.slice(
  financialSource.indexOf('export function MerchantIntelligenceTool'),
  financialSource.indexOf('export function PaymentVerificationTool'),
);
const documentViewerSource = financialSource.slice(
  financialSource.indexOf('export function DocumentViewerTool'),
  financialSource.indexOf('function requestSearchText'),
);
const documentRequestSource = financialSource.slice(
  financialSource.indexOf('export function DocumentRequestTool'),
  financialSource.indexOf('export const FinancialIntelligenceTool'),
);

function fail(message) {
  failures.push(message);
}

const expectedTools = [
  'Customer 360',
  'Identity Intel / People Search',
  'Login History',
  'Session History',
  'Device Intelligence',
  'IP Intelligence',
  'Transaction History',
  'Financial Investigation',
  'Merchant Intelligence',
  'Payment Verification',
  'Business 360',
  'Employee Profile',
  'Payroll History',
  'Document Viewer',
  'Document Request',
  'Link Analysis',
  'System Access Lane',
  'Timeline',
];

if (workspaceTools.length !== expectedTools.length) {
  fail(`Expected ${expectedTools.length} canonical tools, found ${workspaceTools.length}.`);
}
for (const tool of expectedTools) {
  if (!workspaceTools.includes(tool)) fail(`${tool} is missing from the canonical workspace.`);
  if (![identitySource, financialSource, supportSource].some((source) => source.includes(tool))) {
    fail(`${tool} has no clean tool module.`);
  }
}
if (new Set(workspaceTools).size !== expectedTools.length) fail('Canonical workspace tools contain duplicates.');
if (investigationToolGroups.some((group) => group.tools.includes('KYB Review'))) {
  fail('KYB Review is still exposed as a separate tool.');
}

const workspaceSourceGroups = [...investigationToolGroups, workflowReviewGroup];
const workspaceSourceGroupsByKey = new Map(workspaceSourceGroups.map((group) => [group.key, group]));
const mapTools = workspaceMapBlueprints.flatMap((blueprint) => blueprint.sourceGroups
  .flatMap((key) => workspaceSourceGroupsByKey.get(key)?.tools ?? []));
if (workspaceMapBlueprints.length !== 5) {
  fail(`The structural Tool Map must expose five functional zones, found ${workspaceMapBlueprints.length}.`);
}
if (new Set(mapTools).size !== mapTools.length) {
  fail('The structural Tool Map duplicates one or more canonical tools across zones.');
}
if (
  mapTools.length !== workspaceTools.length
  || workspaceTools.some((tool) => !mapTools.includes(tool))
) {
  fail('The structural Tool Map does not cover every canonical workspace tool exactly once.');
}

const neutralSearchProbe = publicCaseSearchText({
  id: 'FA-SEARCH-1',
  person: 'Training Person',
  trainingId: 'TRN-SAFE-1',
  accountId: 'ACCT-SAFE-1',
  customerType: 'personal',
  productType: 'credit-card',
  workflowType: 'merchant-non-fraud-dispute',
  alertReason: 'Neutral intake alert',
  reportedAllegation: 'Customer reports an unfamiliar billing event.',
  priority: 'High',
  status: 'Merchant challenged — customer evidence pending',
});
for (const forbidden of ['high', 'merchant challenged', 'customer evidence pending']) {
  if (neutralSearchProbe.includes(forbidden)) {
    fail(`Case Queue search indexes hidden or risk-like raw status content: ${forbidden}.`);
  }
}
for (const safeIdentifier of ['trn-safe-1', 'acct-safe-1']) {
  if (!neutralSearchProbe.includes(safeIdentifier)) {
    fail(`Case Queue search no longer indexes safe identifier ${safeIdentifier}.`);
  }
}
for (const hiddenWorkflow of ['synthetic identity', 'synthetic-identity', 'synthetic_identity']) {
  const adversarialSearch = publicCaseSearchText({
    id: 'FA-LEGACY-1',
    person: 'Training Person',
    customerType: 'personal',
    productType: 'credit-card',
    workflowType: hiddenWorkflow,
    type: hiddenWorkflow,
    alertReason: 'Neutral intake alert',
    reportedAllegation: 'The customer reported an unfamiliar event.',
  });
  if (/synthetic[-_ ]identity/i.test(adversarialSearch)) {
    fail(`Case Queue search leaks adversarial legacy workflow ${hiddenWorkflow}.`);
  }
}

for (const anchor of [
  'export function Customer360Tool',
  'export function IdentityIntelligenceTool',
  'export function LoginHistoryTool',
  'export function SessionHistoryTool',
  'export function DeviceIntelligenceTool',
  'export function IpIntelligenceTool',
  'Run exact search',
  'Record details stay hidden until a match is returned.',
  'sky-customer-reference-dashboard',
  'sky-customer-reference-profile',
  'sky-customer-reference-middle',
  'sky-customer-reference-lower',
  'Pin customer profile',
]) {
  if (!identitySource.includes(anchor)) fail(`Identity/digital module is missing ${anchor}.`);
}

for (const anchor of [
  'export function FinancialInvestigationTool',
  'export function TransactionHistoryTool',
  'export function MerchantIntelligenceTool',
  'export function PaymentVerificationTool',
  'export function Business360Tool',
  'export function EmployeeProfileTool',
  'export function PayrollHistoryTool',
  'export function DocumentViewerTool',
  'export function DocumentRequestTool',
  'SearchCard',
  'Run verification',
  'Run payroll search',
]) {
  if (!financialSource.includes(anchor)) fail(`Financial/business module is missing ${anchor}.`);
}

for (const anchor of [
  'data-reference-layout',
  'sky-reference-tool-hero',
  'sky-financial-reference-search',
  'sky-reference-result-rail',
  'sky-financial-reference-dashboard',
  'sky-financial-reference-analysis',
  'sky-financial-reference-fields',
  'sky-financial-reference-lower',
  'Grouped supplied remainder',
  'suppliedDebits',
  'financialRecordSearchText(record)',
  'setResults([])',
  'setSelectedId',
  'reference',
]) {
  if (!financialInvestigationSource.includes(anchor) && !financialSource.includes(anchor)) {
    fail(`Financial Intelligence reference rebuild is missing ${anchor}.`);
  }
}
for (const anchor of [
  'sky-payment-reference-search',
  'sky-payment-reference-locked',
  'sky-payment-history-rail',
  'sky-payment-reference-primary',
  'sky-payment-reference-details',
  'sky-payment-reference-attempts',
  'sky-payment-reference-summary',
  'resolvePaymentLookup(records, submitted, activeCase)',
  'setResult(null)',
  'lookupHistory',
  'reference',
]) {
  if (!paymentVerificationSource.includes(anchor)) {
    fail(`Payment Verification reference rebuild is missing ${anchor}.`);
  }
}
for (const anchor of [
  'sky-transaction-summary',
  'sky-transaction-search',
  'sky-transaction-ranges',
  'sky-transaction-filters',
  'sky-transaction-results',
  'sky-transaction-record',
  'searchTransactionRecords(records, requested)',
  'rangeTransactionRecords(results, rangeId',
  'filterTransactionRecords(rangedResults, filters)',
  'summarizeTransactionRecords(displayedResults)',
  'Run search',
  'reference',
]) {
  if (!transactionHistorySource.includes(anchor)) {
    fail(`Transaction History reference rebuild is missing ${anchor}.`);
  }
}
for (const forbidden of [
  'Amazon.com',
  'Acme Payroll LLC',
  'Starbucks',
  '$1,842.35',
  'Review Needed',
  'High Risk',
]) {
  if (transactionHistorySource.includes(forbidden)) {
    fail(`Transaction History hard-codes mock or evaluative value ${forbidden}.`);
  }
}
for (const forbidden of [
  '$248,590.80',
  '$196,780.35',
  'High Confidence Match',
  '98%',
  'AI flagged',
  'Unusual Pattern Flags',
  'ready for payments',
]) {
  if (financialInvestigationSource.includes(forbidden) || paymentVerificationSource.includes(forbidden)) {
    fail(`Financial/Payment reference rebuild hard-codes mock or unsafe value ${forbidden}.`);
  }
}
if (/\baccountHolder\b/.test(paymentVerificationSource)) {
  fail('Payment Verification renders the hidden stored account-holder name.');
}
if (
  !paymentVerificationSource.includes('!submitted.bankCode || !submitted.destinationId')
  || !paymentVerificationSource.includes('updateLookup(field, value)')
) {
  fail('Payment Verification no longer preserves exact paired search and stale-result clearing.');
}
if (
  financialSource.includes("return '7%'")
  || /value:\s*Number\([^)]*\)\s*\|\|\s*1/.test(financialSource)
) {
  fail('Financial Intelligence must not invent visible magnitude for zero or unavailable values.');
}
if (
  !financialSource.includes('items.length ? workspace.deposits?.visibleTotalDisplay : NOT_SUPPLIED')
  || !financialSource.includes('items.length ? workspace.payments?.actualTotalDisplay : NOT_SUPPLIED')
) {
  fail('Financial Intelligence must preserve coverage-only deposit and payment states.');
}

for (const anchor of [
  'buildExplicitMerchantWorkspace(activeCase)',
  'resolveMerchantLookup(workspace, input, lookupType)',
  'sky-merchant-profile-card',
  'sky-merchant-transaction-card',
  'sky-merchant-history-grid',
  'sky-merchant-evidence-pair',
  'sky-merchant-section-deck',
  'formatMerchantPin(workspace, resolved)',
  'reference',
]) {
  if (!merchantSource.includes(anchor)) {
    fail(`Merchant Intelligence structural rebuild is missing ${anchor}.`);
  }
}
for (const forbidden of [
  'High Risk',
  'Active Merchant',
  'Returning Customer',
  '$2,450.00',
  'TechSphere Solutions',
  'chargebackDecision',
  'getMerchantIntelligence',
]) {
  if (merchantSource.includes(forbidden)) {
    fail(`Merchant Intelligence hard-codes or exposes forbidden value ${forbidden}.`);
  }
}
for (const anchor of [
  'const requestState = requestStateForCase(documentRequests, activeCase.id)',
  'sky-document-focus-strip',
  'sky-document-result-rail',
  'sky-document-preview-layout',
  '<DocumentPreviewSheet',
  'downloadDocument(selected)',
  'selected.requestEligible !== false',
  'reference',
]) {
  if (!documentViewerSource.includes(anchor)) {
    fail(`Document Viewer structural rebuild is missing ${anchor}.`);
  }
}
for (const forbidden of [
  'const candidates = [activeCase',
  'onSelectCase',
  'Case Summary',
  '3 New',
  'Cancellation Confirmation.pdf',
]) {
  if (documentViewerSource.includes(forbidden)) {
    fail(`Document Viewer retains unsafe or mock behavior ${forbidden}.`);
  }
}
for (const anchor of [
  'markPaperworkResponseRead',
  'sky-request-inbox-card',
  'sky-request-document-list',
  'sky-request-composer',
  'sky-request-detail-layout',
  'Check Customer Response',
  'Open Document Viewer',
  'reference',
]) {
  if (!documentRequestSource.includes(anchor)) {
    fail(`Document Request structural rebuild is missing ${anchor}.`);
  }
}
for (const forbidden of [
  '3 New',
  'Cancellation Confirmation.pdf',
  'Cancellation Confirmation.pdf · 245 KB',
]) {
  if (documentRequestSource.includes(forbidden)) {
    fail(`Document Request hard-codes reference mock value ${forbidden}.`);
  }
}

for (const anchor of [
  'export function LinkAnalysisTool',
  'export function SystemAccessTool',
  'export function TimelineTool',
  'Run exact search',
  'data-reference-layout="sky-system-access-v1"',
  'sky-system-access-summary',
  'sky-system-access-lane',
  'sky-system-access-event',
  'System access records are hidden',
  'Run access search',
]) {
  if (!supportSource.includes(anchor)) fail(`Support tool module is missing ${anchor}.`);
}
for (const anchor of [
  '.sky-system-access-summary',
  '.sky-system-access-lane::before',
  '.sky-system-access-event > button',
  '.sky-system-access-detail',
]) {
  if (!skyCss.includes(anchor)) fail(`System Access Lane styling is missing ${anchor}.`);
}
for (const anchor of [
  '.sky-app[data-tool="System Access Lane"] .sky-workflow-shell',
  '.sky-app[data-tool="System Access Lane"] .sky-main',
]) {
  if (!responsiveCss.includes(anchor)) fail(`System Access Lane responsive shell is missing ${anchor}.`);
}

for (const anchor of [
  'isIdentityDigitalTool(toolName)',
  'resolveFinancialBusinessTool(toolName)',
  'supportToolNames.has(toolName)',
  'toolIsAvailable',
  '<QuickPad',
  'initialPayload',
]) {
  if (!appSource.includes(anchor)) fail(`App tool integration is missing ${anchor}.`);
}
const appReferenceTools = appSource.slice(
  appSource.indexOf('const isReferenceStructuredTool'),
  appSource.indexOf('const [query'),
);
const shellReferenceTools = shellSource.slice(
  shellSource.indexOf('const isReferenceStructuredTool'),
  shellSource.indexOf('const toolPageTitle'),
);
if (
  !appReferenceTools.includes("'Transaction History'")
  || !shellReferenceTools.includes("'Transaction History'")
) {
  fail('Transaction History is missing from one or both reference-structured tool shells.');
}
if (
  !appReferenceTools.includes("'System Access Lane'")
  || !shellReferenceTools.includes("'System Access Lane'")
) {
  fail('System Access Lane is missing from one or both reference-structured tool shells.');
}
for (const anchor of [
  'sky-queue-reference',
  'sky-queue-search',
  'sky-queue-status-tabs',
  'sky-queue-filter-sheet',
  'getWorkspaceProgress(item, completedTools)',
  "completedTools.includes('Case Briefing')",
  "openCase(item.id, destination)",
]) {
  if (!caseQueueSource.includes(anchor)) fail(`Case Queue structural rebuild is missing ${anchor}.`);
}
for (const forbidden of [
  'item.priority',
  'item.status',
  'High Risk',
  'Medium Risk',
  'L