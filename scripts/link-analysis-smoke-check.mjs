import fs from 'node:fs';
import { trainingCases as baseCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import {
  formatLinkAnalysisPin,
  getLinkIdentifiersForCase,
  getLinkMapContext,
  normalizeLinkIdentifier,
  parseLinkAnalysisPin,
  searchLinkRelationships,
} from '../src/data/linkAnalysisRecords.js';
import { buildQuickPadDestinationRoute } from '../src/data/quickPadController.js';
import { workspaceTools } from '../src/investigationToolGroups.js';
import { resolvePinnedEvidence } from '../src/pinnedEvidenceNavigation.js';

const failures = [];
const cases = enrichTrainingCases(baseCases);

function fail(message) {
  failures.push(message);
}

for (const activeCase of cases) {
  const identifiers = getLinkIdentifiersForCase(activeCase);
  const phone = identifiers.find((item) => item.type === 'phone');
  const trainingId = identifiers.find((item) => item.type === 'training-id');
  if (!phone) fail(`${activeCase.id}: Link Analysis is missing the customer phone suggestion.`);
  if (!trainingId) fail(`${activeCase.id}: Link Analysis is missing the Training ID suggestion.`);

  for (const identifier of identifiers) {
    const exactResult = searchLinkRelationships({
      query: identifier.value,
      identifierType: identifier.type,
      cases,
      activeCase,
    });
    if (!exactResult.matches.some((item) => item.currentCase)) {
      fail(`${activeCase.id}: exact ${identifier.type} input ${identifier.value} did not return the current account.`);
    }
    if (exactResult.matches.some((item) => (
      normalizeLinkIdentifier(item.exactSharedIdentifier, identifier.type)
      !== normalizeLinkIdentifier(identifier.value, identifier.type)
    ))) {
      fail(`${activeCase.id}: exact ${identifier.type} input ${identifier.value} returned a different identifier.`);
    }
  }

  const result = searchLinkRelationships({
    query: phone?.value,
    identifierType: 'phone',
    cases,
    activeCase,
  });
  if (result.matches.length < 1) fail(`${activeCase.id}: expected the source-backed current account for its exact phone.`);
  if (!result.matches.some((item) => item.currentCase)) fail(`${activeCase.id}: the current account is missing from its exact phone result.`);
  if (result.matches.some((item) => normalizeLinkIdentifier(item.exactSharedIdentifier, 'phone') !== normalizeLinkIdentifier(phone?.value, 'phone'))) {
    fail(`${activeCase.id}: Link Analysis returned a non-exact phone match.`);
  }
  if (JSON.stringify(result).match(/\b(?:high risk|risk score|fraud score|confirmed current fraud)\b/i)) {
    fail(`${activeCase.id}: Link Analysis exposes an automatic risk conclusion.`);
  }
  if (result.matches.some((item) => item.fixture)) {
    fail(`${activeCase.id}: Link Analysis returned a synthesized contextual account.`);
  }

  const currentAccountId = activeCase.accountId ?? activeCase.id;
  const currentMatch = result.matches.find((item) => item.currentCase);
  if (currentMatch?.accountId !== currentAccountId) {
    fail(`${activeCase.id}: current-account marker does not identify ${currentAccountId}.`);
  }
  const expectedCustomerName = activeCase.profile?.business
    ?? activeCase.businessProfile?.legalName
    ?? activeCase.person;
  if (currentMatch?.customerName !== expectedCustomerName) {
    fail(`${activeCase.id}: current-account customer/business name is not source-backed.`);
  }
  if (!activeCase.accountStatus && currentMatch?.status !== 'Not supplied') {
    fail(`${activeCase.id}: missing account status was replaced with ${currentMatch?.status}.`);
  }

  const pinValue = formatLinkAnalysisPin({
    identifierType: result.identifierType,
    value: result.searchedIdentifier,
    accountId: currentMatch?.accountId,
  });
  const parsedPin = parseLinkAnalysisPin(pinValue);
  if (
    parsedPin?.identifierType !== result.identifierType
    || parsedPin?.searchedIdentifier !== result.searchedIdentifier
    || parsedPin?.accountId !== currentMatch?.accountId
  ) {
    fail(`${activeCase.id}: formatted Link Analysis pin did not preserve its exact search metadata.`);
  }
  const reopenedPin = resolvePinnedEvidence(pinValue, activeCase, workspaceTools);
  if (
    reopenedPin?.tool !== 'Link Analysis'
    || reopenedPin?.query !== result.searchedIdentifier
    || reopenedPin?.identifierType !== result.identifierType
    || reopenedPin?.accountId !== currentMatch?.accountId
  ) {
    fail(`${activeCase.id}: formatted Link Analysis pin did not reopen its exact search and account.`);
  }

  const quickPadRoute = buildQuickPadDestinationRoute('Link Analysis', [{
    id: `${currentMatch?.accountId}:quick-pad`,
    label: result.identifierTypeLabel,
    value: result.searchedIdentifier,
    query: result.searchedIdentifier,
    sourceTool: 'Link Analysis',
    sourceRecordId: currentMatch?.identifier?.sourceRecordId ?? currentMatch?.accountId,
    identifierType: result.identifierType,
  }]);
  if (
    quickPadRoute?.payload?.query !== result.searchedIdentifier
    || quickPadRoute?.payload?.identifierType !== result.identifierType
  ) {
    fail(`${activeCase.id}: a pinned Link Analysis result does not route the original exact identifier through Quick Pad.`);
  }

  const partial = searchLinkRelationships({
    query: String(phone?.value ?? '').slice(0, -2),
    identifierType: 'phone',
    cases,
    activeCase,
  });
  if (partial.matches.length) fail(`${activeCase.id}: partial identifier searches must not return account links.`);

  const map = getLinkMapContext(activeCase);
  if (!map.subject.name || !map.transaction.id || map.nodes.length !== 5) {
    fail(`${activeCase.id}: the relationship map is missing its subject, transaction, or five evidence nodes.`);
  }
}

const firstCase = cases[0];
const firstIdentifiers = getLinkIdentifiersForCase(firstCase);
const firstPhone = firstIdentifiers.find((item) => item.type === 'phone');
const digitsOnlyPhone = String(firstPhone?.value ?? '').replace(/\D/g, '');
const formattedPhoneResult = searchLinkRelationships({
  query: digitsOnlyPhone,
  identifierType: 'phone',
  cases,
  activeCase: firstCase,
});
if (formattedPhoneResult.matches.length < 1) {
  fail('Phone formatting differences should preserve the same exact phone relationship.');
}

for (const [type, left, right] of [
  ['email', 'a.b@example.test', 'ab@example.test'],
  ['email', 'a_b@example.test', 'ab@example.test'],
  ['ip', '1.23.4.56', '12.3.4.56'],
  ['device', 'DEV-A_B', 'DEV-AB'],
  ['device', 'DEV-A B', 'DEV-AB'],
  ['training-id', 'TRN-1 23', 'TRN-123'],
  ['phone', '(214) 555-0184', '214-555-0184 x2'],
  ['address', '12-34 Main St.', '1234 Main St.'],
  ['address', '12.34 Main St.', '12 34 Main St.'],
]) {
  if (normalizeLinkIdentifier(left, type) === normalizeLinkIdentifier(right, type)) {
    fail(`${type}: distinct identifiers ${left} and ${right} must not collapse into the same exact-match key.`);
  }
}

if (
  normalizeLinkIdentifier('+1 214.555.0184', 'phone')
  !== normalizeLinkIdentifier('(214) 555-0184', 'phone')
) {
  fail('Equivalent US phone presentation should normalize to the same typed key.');
}
if (
  normalizeLinkIdentifier('12-34 Main St.', 'address')
  !== normalizeLinkIdentifier('12-34 main st', 'address')
) {
  fail('Address case and terminal punctuation should normalize without removing token boundaries.');
}
if (
  normalizeLinkIdentifier('(214) 555-0184', 'phone')
  === normalizeLinkIdentifier('214 555 0184', 'address')
) {
  fail('Phone and address records must never share the same typed key.');
}

for (const [type, query] of [
  ['email', 'mayatraining@example.test'],
  ['ip', '19.85.110.042'],
  ['device', 'DEV_MAYA_IP16_001'],
]) {
  const collisionResult = searchLinkRelationships({
    query,
    identifierType: type,
    cases,
    activeCase: firstCase,
  });
  if (collisionResult.matches.length) {
    fail(`${type}: punctuation-colliding input ${query} must not return an exact account match.`);
  }
}

const creditCase = cases.find((item) => item.id === 'FA-CR-24003');
const destination = getLinkIdentifiersForCase(creditCase).find((item) => item.type === 'destination-id' && item.value === 'DST-7740');
const destinationResult = searchLinkRelationships({
  query: destination?.value,
  identifierType: 'destination-id',
  cases,
  activeCase: creditCase,
});
if (destinationResult.matches.some((item) => item.fixture)) {
  fail('DST-7740 returned a synthesized contextual account.');
}
if (!destinationResult.matches.every((item) => /does not determine|still requires|current account is open/i.test(`${item.statusExplanation} ${item.investigativeNote}`))) {
  fail('Every linked-account status must preserve the current-case evidence boundary.');
}

const generatedCase = enrichTrainingCases([
  createGeneratedCase({
    index: 2026072701,
    claimTypeId: 'payroll-change',
    difficulty: 'standard',
    evidenceDepth: 'standard',
  }),
])[0];
const generatedPhone = getLinkIdentifiersForCase(generatedCase).find((item) => item.type === 'phone');
const generatedResult = searchLinkRelationships({
  query: generatedPhone?.value,
  identifierType: 'phone',
  cases: [...cases, generatedCase],
  activeCase: generatedCase,
});
if (generatedResult.matches.length < 1) fail('Generated cases must return their source-backed current account relationship.');
for (const identifier of getLinkIdentifiersForCase(generatedCase)) {
  const exactResult = searchLinkRelationships({
    query: identifier.value,
    identifierType: identifier.type,
    cases: [...cases, generatedCase],
    activeCase: generatedCase,
  });
  if (!exactResult.matches.some((item) => item.currentCase)) {
    fail(`Generated case exact ${identifier.type} input ${identifier.value} did not return its current account.`);
  }
}

const component = fs.readFileSync('src/tools/SupportTools.jsx', 'utf8');
const primitives = fs.readFileSync('src/components/SkyPrimitives.jsx', 'utf8');
const quickPadComponent = fs.readFileSync('src/components/QuickPad.jsx', 'utf8');
const quickPadController = fs.readFileSync('src/data/quickPadController.js', 'utf8');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const styles = fs.readFileSync('src/styles/sky.css', 'utf8');
const linkComponent = component.slice(
  component.indexOf('export function LinkAnalysisTool'),
  component.indexOf('export function SystemAccessTool'),
);
const linkPinHelper = component.slice(
  component.indexOf('function linkPinRecord'),
  component.indexOf('function LinkRelationshipMap'),
);
for (const anchor of [
  'export function LinkAnalysisTool',
  'Search one exact identifier',
  'Run exact search',
  'Results show stored exact matches only.',
  'searchLinkRelationships({',
  'setResult(next)',
  'Exact identifier',
  'Account relationship',
  'relationshipToCurrentCase',
  'setSelected(match)',
  "toolActions(props, 'Link Analysis'",
  "query: routedQuery = ''",
  'initialPayload = null',
  'prefilledQuery = clean(initialPayload?.query ?? routedQuery)',
  'prefilledType = clean(initialPayload?.identifierType)',
  'setQuery(prefilledQuery)',
  'setType(prefilledType)',
  'setResult(null)',
  'setSelected(null)',
  'setHasRun(false)',
  'activeCase?.id, prefilledQuery, prefilledType',
  'The routed identifier is ready. Run the exact search to reveal relationships.',
  'Account relationships are hidden',
  'disabled={!query.trim()}',
  'clearResult()',
  'Source-backed exact matches',
  'Current account',
  "match.status ?? 'Not supplied'",
]) {
  if (!linkComponent.includes(anchor)) fail(`Clean Link Analysis workspace is missing: ${anchor}.`);
}
if (/useState\(\s*true\s*\)/.test(linkComponent)) {
  fail('Link Analysis reveals search output before the learner runs the exact search.');
}
const resetEffect = linkComponent.slice(
  linkComponent.indexOf('useEffect(() => {'),
  linkComponent.indexOf('function clearResult'),
);
if (resetEffect.includes('runSearch(') || resetEffect.includes('setHasRun(true)')) {
  fail('A routed Link Analysis identifier auto-runs instead of remaining a prefill.');
}
if (!linkComponent.includes('{!hasRun ? (') || !linkComponent.includes('{result ? (')) {
  fail('Link Analysis does not preserve its search-before-reveal render gate.');
}
for (const forbidden of [
  'High Risk',
  'Medium Risk',
  'Low Risk',
  'Risk score',
  'Fraud score',
  'Watchlist',
  'Verified links',
  'James Carter',
  'Michael Reyes',
  'Olivia Bennett',
  'Daniel Kim',
  'FA-CB-24007',
  'C-88421',
]) {
  if (linkComponent.toLowerCase().includes(forbidden.toLowerCase())) {
    fail(`Link Analysis UI restores forbidden reference-only content: ${forbidden}.`);
  }
}
if (linkComponent.includes("'account-id'") || linkComponent.includes('"account-id"')) {
  fail('Link Analysis restores the unsupported Account ID search option.');
}
for (const anchor of [
  'formatLinkAnalysisPin({',
  'identifierType: result.identifierType',
  'value: result.searchedIdentifier',
  'accountId: match.accountId',
  'id: pinValue',
  'label: pinValue',
  'query: result.searchedIdentifier',
  'recordId: match.accountId',
  'sourceRecordId:',
]) {
  if (!linkPinHelper.includes(anchor)) {
    fail(`Link Analysis pin payload is missing reopen metadata: ${anchor}.`);
  }
}
const quickPadHasLinkPinAdapter = (
  quickPadComponent.includes("pin.tool === 'Link Analysis'")
  && quickPadComponent.includes('pin.query')
  && quickPadComponent.includes('pin.identifierType')
);
const quickPadAcceptsTypedLinkLabels = (
  quickPadController.includes("'phone'")
  && quickPadController.includes("'destination-id'")
);
if (!quickPadHasLinkPinAdapter && !quickPadAcceptsTypedLinkLabels) {
  fail('Quick Pad does not adapt Link Analysis pin metadata into a destination-valid exact identifier.');
}
for (const anchor of [
  'const routed = record?.pinPayload ?? {}',
  '...routed',
  'onPin?.(pinPayload)',
]) {
  if (!primitives.includes(anchor)) {
    fail(`EvidenceActions drops Link Analysis pin metadata: ${anchor}.`);
  }
}
for (const anchor of [
  'supportToolNames.has(toolName)',
  '<SupportToolRouter',
  'activeCase',
  'cases',
  'pinEvidence',
  'saveNote',
  'markReviewed',
]) {
  if (!app.includes(anchor)) {
    fail(`App is missing the Link Analysis integration boundary: ${anchor}.`);
  }
}
for (const anchor of [
  'sky-link-reference-page',
  'sky-link-reference-search',
  'sky-link-reference-map',
  'sky-link-reference-account-list',
  'sky-link-reference-detail',
  'sky-link-reference-summary',
]) {
  if (!component.includes(anchor)) fail(`Link Analysis structural composition is missing: ${anchor}.`);
}
for (const anchor of ['sky-data-row', 'sky-evidence-actions']) {
  if (!styles.includes(anchor)) fail(`Link Analysis shared structural styling is missing: ${anchor}.`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Link Analysis smoke check passed for exact source-backed matching, personal and generated cases, learner-run searches, evidence actions, responsive structure, and Evidence First boundaries.');
