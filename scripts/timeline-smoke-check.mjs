import assert from 'node:assert/strict';

import { buildCoreToolRecords } from '../src/data/coreToolRecords.js';
import { getFinancialRecords } from '../src/data/caseToolData.js';
import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { getCaseDocuments } from '../src/data/documentRecords.js';
import {
  WORKFLOW_TYPES,
  isWorkflowEnabled,
} from '../src/data/caseDomain.js';
import { coreClaimTypes } from '../src/data/claimRegistry.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';

const timelineColumns = [
  'Timeline',
  'Time',
  'Event',
  'Source',
  'Linked Object',
  'Case',
  'Detail',
];

const hiddenAnswerPattern = /\b(synthetic identity|synthetic fraud|bust[- ]out(?: fraud)?|first[- ]party fraud|mule activity|money mule|spoofed email|compromised mailbox|email compromise|business email compromise|\bbec\b|stolen identity|fabricated business information|linked prior fraud|fraud score|correct answer|final finding)\b/i;

const synthesizedChargebackLabels = new Set([
  'Network submission recorded',
  'Customer evidence review',
  'Response deadline',
]);

function compatibleDomain(claimType, scenario) {
  for (const customerType of scenario.customerTypes ?? claimType.customerTypes) {
    for (const productType of scenario.productTypes ?? claimType.productTypes) {
      if (isWorkflowEnabled(customerType, productType, claimType.id)) {
        return { customerType, productType, workflowType: claimType.id };
      }
    }
  }
  throw new Error(`No enabled domain found for ${claimType.id}/${scenario.id}`);
}

function isChargeback(activeCase) {
  return [
    WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
    WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
  ].includes(activeCase.workflowType ?? activeCase.claimTypeId)
    || Boolean(activeCase.chargebackDecision);
}

function provenanceKey(row) {
  return [
    row.sourceCollection,
    row.sourceRecordId,
    row.occurredAt ?? row.rawTime,
    row.values[2],
  ].map((value) => String(value ?? '').trim().toLowerCase()).join('|');
}

function assertChronological(rows, caseId, partition) {
  for (let index = 0; index < rows.length; index += 1) {
    const item = rows[index];
    assert.equal(item.values.length, timelineColumns.length, `${caseId}/${item.id} has the wrong column count`);
    assert.equal(item.values[5], caseId, `${caseId}/${item.id} escaped the active case`);
    assert.ok(item.sourceCollection, `${caseId}/${item.id} is missing its source collection`);
    assert.ok(item.sourceRecordId, `${caseId}/${item.id} is missing its source record ID`);
    assert.equal(item.temporalKind, partition, `${caseId}/${item.id} is in the wrong temporal partition`);
    assert.ok(item.occurredAt, `${caseId}/${item.id} is missing a canonical timestamp`);
    assert.ok(Number.isFinite(Date.parse(item.occurredAt)), `${caseId}/${item.id} has an invalid canonical timestamp`);
    if (index) {
      assert.ok(
        Date.parse(rows[index - 1].occurredAt) <= Date.parse(item.occurredAt),
        `${caseId}/${item.id} is out of chronological order`,
      );
    }
  }
}

function assertTimelineContract(activeCase, timeline) {
  assert.deepEqual(timeline.columns, timelineColumns, `${activeCase.id} changed the Timeline column contract`);
  assert.ok(Array.isArray(timeline.rows), `${activeCase.id} is missing occurred rows`);
  assert.ok(Array.isArray(timeline.scheduledRows), `${activeCase.id} is missing scheduled rows`);
  assert.ok(Array.isArray(timeline.undatedRows), `${activeCase.id} is missing undated rows`);

  assertChronological(timeline.rows, activeCase.id, 'occurred');
  assertChronological(timeline.scheduledRows, activeCase.id, 'scheduled');
  for (const item of timeline.undatedRows) {
    assert.equal(item.values.length, timelineColumns.length, `${activeCase.id}/${item.id} has the wrong column count`);
    assert.equal(item.values[5], activeCase.id, `${activeCase.id}/${item.id} escaped the active case`);
    assert.equal(item.temporalKind, 'undated', `${activeCase.id}/${item.id} is not marked undated`);
    assert.equal(item.occurredAt, null, `${activeCase.id}/${item.id} invented a timestamp`);
    assert.ok(item.sourceCollection, `${activeCase.id}/${item.id} is missing its source collection`);
    assert.ok(item.sourceRecordId, `${activeCase.id}/${item.id} is missing its source record ID`);
  }

  const allRows = [
    ...timeline.rows,
    ...timeline.scheduledRows,
    ...timeline.undatedRows,
  ];
  const sourceRecordIds = new Set(allRows.map((item) => item.sourceRecordId));
  const financial = getFinancialRecords(activeCase);
  const expectedSourceRecords = [
    ...(activeCase.customer?.profileChanges ?? []),
    ...(activeCase.events ?? []),
    ...(activeCase.loginHistory ?? []),
    ...(financial.transactions ?? []),
    ...(activeCase.availableTools?.includes('Payment Verification')
      ? financial.paymentVerification ?? []
      : []),
    ...getCaseDocuments(activeCase),
  ];
  for (const record of expectedSourceRecords) {
    assert.ok(
      sourceRecordIds.has(record.id),
      `${activeCase.id} omitted source-backed Timeline record ${record.id}`,
    );
  }
  assert.equal(
    new Set(allRows.map(provenanceKey)).size,
    allRows.length,
    `${activeCase.id} contains duplicate source records`,
  );
  for (const item of allRows) {
    assert.doesNotMatch(
      item.values.join(' '),
      hiddenAnswerPattern,
      `${activeCase.id}/${item.id} exposes a hidden answer`,
    );
  }

  if (isChargeback(activeCase)) {
    for (const item of allRows) {
      assert.notEqual(
        item.sourceCollection,
        'merchantIntelligence.timeline',
        `${activeCase.id}/${item.id} uses a synthesized merchant timeline`,
      );
      assert.notEqual(
        item.values[3],
        'Merchant Intelligence',
        `${activeCase.id}/${item.id} exposes a synthesized merchant lifecycle row`,
      );
      assert.ok(
        !synthesizedChargebackLabels.has(item.values[2]),
        `${activeCase.id}/${item.id} exposes synthesized event "${item.values[2]}"`,
      );
    }
  }
}

const cases = enrichTrainingCases(trainingCases);
for (const activeCase of cases) {
  assertTimelineContract(activeCase, buildCoreToolRecords('Timeline', activeCase));
}

const atoTimeline = buildCoreToolRecords(
  'Timeline',
  cases.find((item) => item.id === 'FA-ATO-24018'),
);
const missingYearLogin = atoTimeline.rows.find((item) => item.sourceRecordId === 'LOG-0928');
assert.equal(missingYearLogin?.occurredAt, '2026-04-09T09:48:00.000Z');
assert.equal(missingYearLogin?.values[1], 'Apr 9, 2026 · 9:48 AM');
assert.deepEqual(
  atoTimeline.undatedRows.map((item) => item.sourceRecordId).sort(),
  ['DOC-442', 'DOC-443'],
  'Missing documents must remain undated instead of entering chronology',
);

const chargebackTimeline = buildCoreToolRecords(
  'Timeline',
  cases.find((item) => item.id === 'FA-CB-24007'),
);
assert.ok(
  chargebackTimeline.rows.some((item) => item.sourceRecordId === 'EVT-2204'),
  'Chargeback Timeline dropped an explicit source event',
);
assert.ok(
  chargebackTimeline.rows.every((item) => item.sourceCollection !== 'merchantIntelligence.timeline'),
  'Chargeback Timeline retained synthesized merchant lifecycle rows',
);

const duplicateDateCase = {
  id: 'FA-TML-DATE-TEST',
  workflowType: WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
  reportedDate: 'Jul 6, 2026',
  opened: 'Jul 6, 2026',
  queueReason: 'Timeline normalization test',
  events: [
    {
      id: 'EVT-DUPLICATE',
      time: 'Jul 6, 2026 · Jul 6, 2026 - 9:05 AM',
      label: 'Claim received',
      detail: 'Source event',
      chip: 'Intake',
      object: 'Statement',
    },
    {
      id: 'EVT-DUPLICATE',
      time: 'Jul 6, 2026 · Jul 6, 2026 - 9:05 AM',
      label: 'Claim received',
      detail: 'Repeated source event',
      chip: 'Intake',
      object: 'Statement',
    },
    {
      id: 'EVT-SEPARATE',
      time: 'Jul 6, 2026 · Jul 6, 2026 - 9:05 AM',
      label: 'Claim received',
      detail: 'Distinct source record',
      chip: 'Intake',
      object: 'Statement',
    },
    {
      id: 'EVT-UNDATED',
      time: 'Pending',
      label: 'Follow-up status',
      detail: 'No event timestamp supplied',
      chip: 'Intake',
      object: 'Statement',
    },
  ],
  toolResults: { transactions: [] },
};
const duplicateDateTimeline = buildCoreToolRecords('Timeline', duplicateDateCase);
assertTimelineContract(duplicateDateCase, duplicateDateTimeline);
assert.equal(
  duplicateDateTimeline.rows.filter((item) => item.sourceRecordId === 'EVT-DUPLICATE').length,
  1,
  'An exact repeated source event was not deduplicated',
);
assert.ok(
  duplicateDateTimeline.rows.some((item) => item.sourceRecordId === 'EVT-SEPARATE'),
  'A distinct same-time source event was incorrectly deduplicated',
);
assert.equal(
  duplicateDateTimeline.rows.find((item) => item.sourceRecordId === 'EVT-DUPLICATE')?.values[1],
  'Jul 6, 2026 · 9:05 AM',
  'A duplicated date/time string was not normalized',
);
assert.ok(
  duplicateDateTimeline.undatedRows.some((item) => item.sourceRecordId === 'EVT-UNDATED'),
  'An undated status entered occurred chronology',
);

let generatedCount = 0;
let generatedOccurredRows = 0;
let generatedUndatedRows = 0;
let generatedScheduledRows = 0;
for (const [claimIndex, claimType] of coreClaimTypes.entries()) {
  for (const [scenarioIndex, scenario] of claimType.scenarios.entries()) {
    const activeCase = createGeneratedCase({
      index: 975000 + (claimIndex * 100) + scenarioIndex,
      ...compatibleDomain(claimType, scenario),
      scenarioId: scenario.id,
      difficulty: 'deep',
      evidenceDepth: 'deep',
    });
    const timeline = buildCoreToolRecords('Timeline', activeCase);
    assertTimelineContract(activeCase, timeline);
    assert.ok(timeline.rows.length, `${activeCase.id} generated no occurred Timeline rows`);
    generatedCount += 1;
    generatedOccurredRows += timeline.rows.length;
    generatedUndatedRows += timeline.undatedRows.length;
    generatedScheduledRows += timeline.scheduledRows.length;
  }
}

assert.equal(
  generatedCount,
  coreClaimTypes.reduce((total, claimType) => total + claimType.scenarios.length, 0),
  'Timeline did not cover every generated scenario',
);
assert.ok(generatedUndatedRows > 0, 'Generated undated source records were not separated');
assert.equal(
  generatedScheduledRows,
  0,
  'Timeline invented scheduled events without an explicit scheduled source',
);

console.log(
  `Timeline smoke check passed: ${cases.length} built cases and ${generatedCount} generated scenarios produced ${generatedOccurredRows} ordered occurred rows, ${generatedUndatedRows} undated rows, and no synthesized scheduled rows.`,
);
