import fs from 'node:fs';
import { trainingCases as baseCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import {
  getLinkIdentifiersForCase,
  getLinkMapContext,
  normalizeLinkIdentifier,
  searchLinkRelationships,
} from '../src/data/linkAnalysisRecords.js';

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
const app = fs.readFileSync('src/App.jsx', 'utf8');
const styles = fs.readFileSync('src/styles/sky.css', 'utf8');
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
  'onSelect={setSelected}',
  "toolActions(props, 'Link Analysis'",
]) {
  if (!component.includes(anchor)) fail(`Clean Link Analysis workspace is missing: ${anchor}.`);
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
for (const anchor of ['sky-form-grid', 'sky-record-list', 'sky-data-row', 'sky-evidence-actions']) {
  if (!styles.includes(anchor)) fail(`Link Analysis structural styling is missing: ${anchor}.`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Link Analysis smoke check passed for exact source-backed matching, personal and generated cases, learner-run searches, evidence actions, responsive structure, and Evidence First boundaries.');
