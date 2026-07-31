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
  'const resolveWorkspaceRecord = () =>',
  'resolveMerchantLookup(workspace, lookup, routedLookupType)',
  'setResolved(nextResolved)',
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
  'Low Risk',
  'My Queue',
]) {
  if (caseQueueSource.includes(forbidden)) {
    fail(`Case Queue exposes forbidden risk, assignment, or raw status content ${forbidden}.`);
  }
}
for (const anchor of [
  'workspaceMapBlueprints',
  'sky-toolmap-canvas',
  'sky-toolmap-lines',
  'sky-toolmap-core',
  'sky-toolmap-node',
  'sky-toolmap-drawer',
  'progress.percent',
  "navigate('tool', { tool })",
]) {
  if (!workspaceSource.includes(anchor)) fail(`Tool Map structural rebuild is missing ${anchor}.`);
}
for (const forbidden of ['68%', 'High Risk', '3 New', 'My Queue']) {
  if (workspaceSource.includes(forbidden)) {
    fail(`Tool Map hard-codes unsafe reference value ${forbidden}.`);
  }
}
for (const anchor of [
  'variant="floating"',
  'activeCaseId={state.activeCase.id}',
]) {
  if (!appSource.includes(anchor)) fail(`Case Queue/Tool Map Quick Pad integration is missing ${anchor}.`);
}
for (const anchor of [
  "variant === 'floating'",
  'sky-quick-pad-fab',
  'sky-quick-pad-sheet',
  'aria-controls={panelId}',
  'aria-modal="true"',
  'panelRef.current',
  "document.body.style.overflow = 'hidden'",
]) {
  if (!quickPadSource.includes(anchor)) fail(`Functional floating Quick Pad is missing ${anchor}.`);
}
if (
  !appSource.includes("['Employee Profile', 'System Access Lane'].includes(toolName)")
  || !quickPadSource.includes("'System Access Lane': 'System Access Record ID'")
) {
  fail('System Access Lane is missing its floating Quick Pad and exact identifier label.');
}
for (const anchor of ['sky-toolmap-lines-mobile', 'aria-live="polite"']) {
  if (!workspaceSource.includes(anchor)) fail(`Responsive accessible Tool Map is missing ${anchor}.`);
}

const workflowOrdering = [
  'Queue',
  'Briefing',
  'Tools',
  'Summary',
  'Indicators',
  'Determine',
  'Submit',
  'Luna',
  'Report',
];
const workflowRailSource = shellSource.slice(
  shellSource.indexOf('const workflowStages'),
  shellSource.indexOf('function routeFamily'),
);
let previousIndex = -1;
for (const stage of workflowOrdering) {
  const index = workflowRailSource.indexOf(`label: '${stage}'`);
  if (index < 0) fail(`${stage} is missing from the workflow rail.`);
  if (index >= 0 && index < previousIndex) fail(`${stage} is out of dependency order.`);
  previousIndex = Math.max(previousIndex, index);
}

const indicatorSection = workflowSource.slice(
  workflowSource.indexOf('export function IndicatorsReview'),
  workflowSource.indexOf('const decisionDescriptions'),
);
for (const forbidden of ['indicator.type', 'indicator.weight', 'redPoints', 'greenPoints']) {
  if (indicatorSection.includes(forbidden)) fail(`Pre-submission indicators expose ${forbidden}.`);
}
for (const response of ['Yes', 'No', 'Not enough evidence']) {
  if (!indicatorSection.includes(response)) fail(`Indicators are missing the ${response} learner response.`);
}
for (const anchor of ['indicatorAnswerComplete', 'answer.proof', 'answer.explanation', 'response, evidence reference, and explanation']) {
  if (!indicatorSection.includes(anchor)) fail(`Indicators do not enforce ${anchor}.`);
}

const summarySection = workflowSource.slice(
  workflowSource.indexOf('export function InvestigationSummary'),
  workflowSource.indexOf('export function IndicatorsReview'),
);
if (!summarySection.includes("markReviewed('Investigation Summary')")) {
  fail('Investigation Summary does not record completion before continuing.');
}
if (!briefingSource.includes("markReviewed('Case Briefing')")) {
  fail('Case Briefing does not record completion before opening the workspace.');
}

const determinationSection = workflowSource.slice(
  workflowSource.indexOf('export function Determination'),
  workflowSource.indexOf('export function SubmitDecision'),
);
for (const anchor of ['determinationComplete', 'decisionDraft.findingBasis', 'disabled={reviewed || !determinationComplete}', 'disabled={!determinationComplete}']) {
  if (!determinationSection.includes(anchor)) fail(`Determination does not enforce ${anchor}.`);
}

for (const stage of ['Case Briefing', 'Investigation Summary', 'Case Indicators Review', 'Determination']) {
  if (!stateSource.includes(`'${stage}'`)) fail(`Submission gate is missing ${stage}.`);
}
if ((stateSource.match(/applyWorkflowSubmissionGate\(/g) ?? []).length < 3) {
  fail('Submission gating is not applied to both displayed and submitted package status.');
}
for (const anchor of ['workflowCompletedTools', 'After briefing', 'After summary', 'After indicators', 'After determination', 'After submission']) {
  if (!shellSource.includes(anchor)) fail(`App shell stage locks are missing ${anchor}.`);
}
for (const anchor of ['const legacyHistory', 'legacyHistory ? null : resolvePostSubmissionTruth(activeCase)', 'truthReveal: caseTruth ?']) {
  if (!lunaSource.includes(anchor)) fail(`Luna legacy-history protection is missing ${anchor}.`);
}

const baseReadyStatus = { ready: true, blockers: [], messages: [] };
const gatedStatus = applyWorkflowSubmissionGate(baseReadyStatus, ['Case Briefing']);
if (gatedStatus.ready) fail('Submission gate allows a package before all workflow stages are complete.');
if (gatedStatus.missingWorkflowStages.join('|') !== 'Investigation Summary|Case Indicators Review|Determination') {
  fail('Submission gate reports the wrong missing workflow stages.');
}
const completeStatus = applyWorkflowSubmissionGate(baseReadyStatus, requiredSubmissionStages);
if (!completeStatus.ready || completeStatus.missingWorkflowStages.length) {
  fail('Submission gate does not release after all required workflow stages are complete.');
}

const activeCase = enrichTrainingCases(trainingCases)[0];
const workspaceProgress = getWorkspaceProgress(activeCase, [
  'Case Briefing',
  'Customer 360',
  'Determination',
]);
if (workspaceProgress.reviewed !== 1) {
  fail('Dashboard workspace progress counts workflow stages as reviewed investigation tools.');
}
if (
  !workspaceProgress.total
  || workspaceProgress.percent !== Math.round((1 / workspaceProgress.total) * 100)
) {
  fail('Dashboard workspace progress does not use the case-scoped workspace tool total.');
}
const checklist = getDecisionChecklist(activeCase);
for (const flag of checklist.flags) {
  if ('type' in flag || 'weight' in flag || 'points' in flag || 'requiresAttention' in flag) {
    fail(`${flag.id} exposes coaching classification before submission.`);
  }
  if (!Array.isArray(flag.answerChoices) || flag.answerChoices.join('|') !== 'Yes|No|Not enough evidence') {
    fail(`${flag.id} does not expose the neutral three-choice answer contract.`);
  }
}

for (const [file, source, anchors] of [
  ['Dashboard', dashboardSource, [
    'DashboardMetric',
    'sky-dashboard-tile',
    'sky-hero',
    'sky-dashboard-academy',
    'SkyProgressRing',
    'sky-dashboard-lower',
    'luna-anime-purple-v1.webp',
  ]],
  ['Case Briefing', briefingSource, [
    'sky-case-banner',
    'sky-briefing-allegation',
    'sky-briefing-facts',
    'sky-briefing-lower',
    'sky-briefing-quick',
    'sky-briefing-evidence',
    'sky-briefing-completion',
    'sky-document-checklist',
    'EvidenceActions',
  ]],
  ['Case Queue', caseQueueSource, [
    'sky-queue-reference',
    'sky-queue-reference-card',
    'sky-queue-pagination',
  ]],
  ['Tool Map', workspaceSource, [
    'sky-tool-map',
    'sky-tool-button',
    'sky-toolmap-canvas',
    'sky-toolmap-node',
    'sky-toolmap-core',
    'sky-toolmap-drawer',
  ]],
  ['Review workflow', workflowSource, [
    'sky-review-page',
    'sky-review-hero',
    'sky-indicator-checklist',
    'sky-indicator-item',
    'sky-scope-cues',
    'sky-indicator-notes',
    'sky-determination-summary',
    'sky-determination-options',
    'sky-finding-options',
    'sky-determination-next',
    'sky-choice-card',
    'sky-decision-card',
    'sky-luna-debrief',
    'sky-report-json',
  ]],
]) {
  for (const anchor of anchors) {
    if (!source.includes(anchor)) fail(`${file} is missing structural component class ${anchor}.`);
  }
}

for (const anchor of [
  '.sky-dashboard-tile',
  '.sky-case-card',
  '.sky-briefing-facts',
  '.sky-tool-button',
  '.sky-choice-card',
  '.sky-decision-card',
  '.sky-luna-art',
  '.sky-customer-reference-dashboard',
  '.sky-customer-reference-profile',
  '.sky-customer-reference-middle',
  '.sky-customer-reference-lower',
  '.sky-customer-account-grid',
  '.sky-transaction-summary',
  '.sky-transaction-search',
  '.sky-transaction-record',
]) {
  if (!skyCss.includes(anchor)) fail(`Sky structural CSS is missing ${anchor}.`);
}
for (const anchor of ['@media (max-width: 900px)', '@media (max-width: 680px)', 'prefers-reduced-motion']) {
  if (!responsiveCss.includes(anchor)) fail(`Responsive Sky CSS is missing ${anchor}.`);
}
if (!/\.sky-dashboard-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(3/m.test(responsiveCss)) {
  fail('The mobile Dashboard no longer preserves its three-card metric row.');
}
if (!/\.sky-dashboard-lower\s*\{[^}]*grid-template-columns:\s*minmax/m.test(responsiveCss)) {
  fail('The mobile Dashboard no longer preserves the paired Luna and quote cards.');
}
if (!responsiveCss.includes('.sky-app[data-tool="Customer 360"] .sky-workflow-shell')) {
  fail('Mobile Customer 360 still exposes the generic workflow rail.');
}
if (!responsiveCss.includes('.sky-app[data-tool="Transaction History"] .sky-workflow-shell')) {
  fail('Mobile Transaction History still exposes the generic workflow rail.');
}
if (dashboardSource.includes('className="span-8"') || dashboardSource.includes('className="span-4"')) {
  fail('The Dashboard has fallen back to the oversized generic active-case grid.');
}
for (const anchor of [
  'publicAlertReason(activeCase)',
  'publicReportedAllegation(activeCase)',
  'publicCaseFacts(activeCase)',
  "markReviewed('Case Briefing')",
  "navigate('workspace')",
  "navigate('tool', { tool: 'Document Viewer' })",
]) {
  if (!briefingSource.includes(anchor)) fail(`Case Briefing is missing preserved contract ${anchor}.`);
}
if (briefingSource.includes('4 / 6')) {
  fail('Case Briefing has fallen back to a hard-coded evidence count.');
}
if (!shellSource.includes('primaryRouteFamily') || !shellSource.includes('data-context={isDashboard')) {
  fail('The app shell is missing its route-aware page header and primary navigation state.');
}
for (const anchor of [
  "['Yes', 'No', 'Not enough evidence']",
  'updateIndicator(indicator.id, {',
  'updateIndicator(indicator.id, { proof:',
  'updateIndicator(indicator.id, { explanation:',
  "markReviewed('Case Indicators Review')",
  "navigate('determination')",
]) {
  if (!indicatorsSource.includes(anchor)) fail(`Case Indicators is missing learner contract ${anchor}.`);
}
for (const unsafeAnchor of [
  'High Risk',
  'Low Risk',
  'Risk Profile',
  'indicator.type',
  'indicator.weight',
  'requiresAttention',
]) {
  if (indicatorsSource.includes(unsafeAnchor)) {
    fail(`Case Indicators exposes pre-submission coaching field ${unsafeAnchor}.`);
  }
}
for (const anchor of [
  'getDecisionCallGroups(activeCase)',
  'getFinalFindingChoices(activeCase)',
  "updateDecision('operationalDecision', option)",
  "updateDecision('finalFinding', option)",
  "updateDecision('confidence', event.target.value)",
  "updateDecision('findingBasis', event.target.value)",
  'operationalOptions.includes(decisionDraft.operationalDecision)',
  'finalFindings.includes(decisionDraft.finalFinding)',
  'rationaleWordCount >= 12',
  "markReviewed('Determination')",
  "navigate('submit')",
]) {
  if (!determinationSource.includes(anchor)) fail(`Determination is missing preserved contract ${anchor}.`);
}
for (const referenceOnlyValue of ['FA-CB-24007', '$2,450', 'TechSphere', '12 files']) {
  if (indicatorsSource.includes(referenceOnlyValue) || determinationSource.includes(referenceOnlyValue)) {
    fail(`Review workflow hard-codes reference-only value ${referenceOnlyValue}.`);
  }
}
const doNotSupportToneIndex = decisionVisualSource.indexOf('/do not support');
const supportToneIndex = decisionVisualSource.indexOf('/support customer');
if (
  doNotSupportToneIndex < 0
  || supportToneIndex < 0
  || doNotSupportToneIndex > supportToneIndex
) {
  fail('Do Not Support is visually classified by the positive Support branch.');
}
if (
  !determinationSource.includes("/business/i.test(activeCase.customerType ?? '')")
  || !determinationSource.includes('activeCase.businessProfile?.legalName')
) {
  fail('Determination does not prefer the active business entity for business cases.');
}
if (!/\.sky-indicator-options\s*\{[^}]*grid-template-columns:\s*repeat\(3/m.test(responsiveCss)) {
  fail('Mobile Case Indicators no longer preserves the three neutral learner choices.');
}
if (!/\.sky-determination-options,\s*\.sky-finding-options\s*\{[^}]*grid-template-columns:\s*repeat\(2/m.test(responsiveCss)) {
  fail('Mobile Determination no longer preserves the two-column decision layout.');
}
for (const anchor of [
  'sky-submit-reference',
  'publicCaseTaxonomy(activeCase)',
  'tray.slice(0, 3)',
  'notes.slice(0, 3)',
  'submittingRef.current',
  'if (submittingRef.current || !packageStatus.ready) return',
  'submitPackage()',
  "navigate('luna')",
  'Confirm & submit decision',
  'Luna unlocks only after the package is saved',
]) {
  if (!submitDecisionSource.includes(anchor)) fail(`Submit Decision is missing reference contract ${anchor}.`);
}
for (const anchor of [
  'sky-luna-reference',
  'sky-luna-coach-hero',
  'Evidence You Might Have Missed',
  'debrief.missedEvidence',
  'reviewMissedEvidence',
  "navigate('tool', { tool: item.tool })",
  'Scenario outcome',
  'debrief.legacyHistory',
  'debrief.truthReveal',
  'Back to Workspace',
  'Open case report',
]) {
  if (!lunaDebriefScreenSource.includes(anchor)) fail(`Luna Debrief is missing reference contract ${anchor}.`);
}
for (const anchor of [
  '.sky-review-reference-header',
  '.sky-submit-confirm',
  '.sky-luna-coach-hero',
  '.sky-luna-missed-list',
]) {
  if (!skyCss.includes(anchor)) fail(`Reference review CSS is missing ${anchor}.`);
}
if (!shellSource.includes("['cases', 'workspace', 'submit', 'luna']")) {
  fail('Submit Decision and Luna Debrief still depend on the generic shell header and workflow rail.');
}
for (const referenceOnlyValue of [
  'Refund Issued',
  'James Carter',
  'TechSphere',
  'High Risk Transaction',
  'Customer will be notified automatically',
]) {
  if (submitDecisionSource.includes(referenceOnlyValue) || lunaDebriefScreenSource.includes(referenceOnlyValue)) {
    fail(`Submit Decision or Luna Debrief hard-codes reference-only value ${referenceOnlyValue}.`);
  }
}

for (const source of [appSource, dashboardSource, briefingSource, workspaceSource, workflowSource]) {
  if (/ornate-card|visual-command|mission-deck|legacy-theme|sky-theme\s+/.test(source)) {
    fail('A clean Sky screen depends on a legacy theme class.');
  }
}

if (failures.length) {
  console.error('Sky workspace smoke check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Sky workspace smoke check passed for the neutral Case Queue, five-zone Tool Map, canonical tool coverage, functional Quick Pad, ordered workflow locks, evidence-complete decisions, legacy-safe Luna history, and responsive Sky components.');
