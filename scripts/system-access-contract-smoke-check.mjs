import {
  buildSystemAccessSummary,
  buildNeutralSystemAccessRecords,
  getSystemAccessRecords,
  searchSystemAccessRecords,
  sortSystemAccessRecords,
  systemAccessRecordsByCase,
} from '../src/data/systemAccessRecords.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const generatedCase = {
  id: 'FA-ATO-G20260729',
  reportedDate: 'Jul 29, 2026',
  customerType: 'personal',
  productType: 'deposit-account',
  workflowType: 'personal-account-takeover',
};
const generatedRecords = getSystemAccessRecords(generatedCase);
const repeatedRecords = buildNeutralSystemAccessRecords(generatedCase);
const proxyRecords = systemAccessRecordsByCase[generatedCase.id];

assert(generatedRecords.length === 3, 'Generated cases should receive a complete neutral system-access lane.');
assert(
  JSON.stringify(generatedRecords) === JSON.stringify(repeatedRecords)
    && JSON.stringify(generatedRecords.map((item) => item.id)) === JSON.stringify(proxyRecords.map((item) => item.id)),
  'Generated system-access records should be deterministic through both supported access paths.',
);
assert(
  generatedRecords.every((item) => (
    item.id
    && item.lane
    && item.actor
    && item.event
    && item.object
    && item.observed === generatedCase.reportedDate
    && item.status
    && item.context
  )),
  'Every generated system-access record should satisfy the lane record contract.',
);

const publicText = JSON.stringify(generatedRecords);
for (const forbidden of [
  'confirmed fraud',
  'fraud confirmed',
  'correct answer',
  'accepted determination',
  'scenario truth',
  'risk score',
]) {
  assert(!publicText.toLowerCase().includes(forbidden), `Generated System Access Lane leaked pre-decision language: ${forbidden}`);
}

assert(
  getSystemAccessRecords('FA-ATO-24018').length === 3,
  'Built-in System Access Lane records should remain available.',
);
const builtInRecords = getSystemAccessRecords('FA-ATO-24018');
const exactRecord = searchSystemAccessRecords(builtInRecords, 'SYS-ATO-002');
const broadRecords = searchSystemAccessRecords(builtInRecords, 'event');
const builtInSummary = buildSystemAccessSummary(builtInRecords);
assert(
  exactRecord.length === 1
    && exactRecord[0].id === 'SYS-ATO-002'
    && broadRecords.length >= 2
    && searchSystemAccessRecords(builtInRecords, '').length === builtInRecords.length,
  'System Access should open every supplied event, prioritize an exact ID, and support optional filtering.',
);
assert(
  builtInSummary.total === builtInRecords.length
    && builtInSummary.lanes === new Set(builtInRecords.map((item) => item.lane)).size
    && builtInSummary.actors === new Set(builtInRecords.map((item) => item.actor)).size
    && builtInSummary.latestObserved,
  'System Access summary values should be derived only from the matched supplied records.',
);
assert(
  sortSystemAccessRecords(builtInRecords).map((item) => item.id).join(',')
    === 'SYS-ATO-002,SYS-ATO-001,SYS-ATO-003',
  'System Access records should render in chronological order when supplied timestamps are parseable.',
);
assert(
  getSystemAccessRecords('NOT-A-GENERATED-CASE').length === 0,
  'Unknown non-generated case IDs should not receive invented records.',
);

const enrichedGeneratedCase = enrichTrainingCases([
  createGeneratedCase({
    index: 20260729,
    customerType: 'personal',
    productType: 'deposit-account',
    workflowType: 'personal-account-takeover',
  }),
])[0];
assert(
  enrichedGeneratedCase.availableTools.includes('System Access Lane')
    && getSystemAccessRecords(enrichedGeneratedCase).length === 3,
  'Generated-case enrichment should expose the neutral System Access Lane and its records.',
);

console.log('System Access Lane contract smoke check passed for neutral records, exact-first search, source-derived summaries, and chronological display.');
