import fs from 'node:fs';
import {
  investigationToolGroups,
  workspaceTools,
} from '../src/investigationToolGroups.js';
import { getDecisionChecklist } from '../src/data/decisionChecklist.js';
import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
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
const briefingSource = fs.readFileSync('src/screens/CaseBriefing.jsx', 'utf8');
const workspaceSource = fs.readFileSync('src/screens/Workspace.jsx', 'utf8');
const shellSource = fs.readFileSync('src/components/AppShell.jsx', 'utf8');
const stateSource = fs.readFileSync('src/app/useWorkspaceState.js', 'utf8');
const lunaSource = fs.readFileSync('src/data/lunaDebrief.js', 'utf8');
const skyCss = fs.readFileSync('src/styles/sky.css', 'utf8');
const responsiveCss = fs.readFileSync('src/styles/responsive.css', 'utf8');

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

for (const anchor of [
  'export function Customer360Tool',
  'export function IdentityIntelligenceTool',
  'export function LoginHistoryTool',
  'export function SessionHistoryTool',
  'export function DeviceIntelligenceTool',
  'export function IpIntelligenceTool',
  'Run exact search',
  'Record details stay hidden until a match is returned.',
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
  'export function LinkAnalysisTool',
  'export function SystemAccessTool',
  'export function TimelineTool',
  'Run exact search',
  'System details remain hidden until you run',
]) {
  if (!supportSource.includes(anchor)) fail(`Support tool module is missing ${anchor}.`);
}

for (const anchor of [
  'isIdentityDigitalTool(toolName)',
  'resolveFinancialBusinessTool(toolName)',
  'supportToolNames.has(toolName)',
  '<QuickPad',
  'initialPayload',
]) {
  if (!appSource.includes(anchor)) fail(`App tool integration is missing ${anchor}.`);
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
  ['Dashboard', dashboardSource, ['sky-dashboard-tile', 'sky-hero', 'luna-sky-vector-v1.svg']],
  ['Case Briefing', briefingSource, ['sky-briefing-grid', 'sky-briefing-facts', 'sky-document-checklist']],
  ['Tool Map', workspaceSource, ['sky-tool-map', 'sky-tool-button']],
  ['Review workflow', workflowSource, ['sky-choice-card', 'sky-decision-card', 'sky-luna-debrief', 'sky-report-json']],
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
]) {
  if (!skyCss.includes(anchor)) fail(`Sky structural CSS is missing ${anchor}.`);
}
for (const anchor of ['@media (max-width: 900px)', '@media (max-width: 680px)', 'prefers-reduced-motion']) {
  if (!responsiveCss.includes(anchor)) fail(`Responsive Sky CSS is missing ${anchor}.`);
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

console.log('Sky workspace smoke check passed for canonical tools, ordered stage recording and locks, evidence-complete indicators, rationale-gated determination, workflow-gated submission, legacy-safe Luna history, and responsive Sky components.');
