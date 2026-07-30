import fs from 'node:fs';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { trainingCases } from '../src/data/cases.js';
import { financialRecordsByCase } from '../src/data/financialRecords.js';
import { getTransactionHistory } from '../src/data/businessPayrollWorkspace.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import {
  filterTransactionRecords,
  rangeTransactionRecords,
  searchTransactionRecords,
  summarizeTransactionRecords,
  transactionAmountValue,
} from '../src/data/transactionHistoryRecords.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cases = enrichTrainingCases(trainingCases);
for (const activeCase of cases.filter((item) => item.availableTools.includes('Transaction History'))) {
  const source = financialRecordsByCase[activeCase.id]?.transactions
    ?? activeCase.toolResults?.transactions
    ?? [];
  const normalized = getTransactionHistory(activeCase);
  assert(
    normalized.length === source.length,
    `${activeCase.id} Transaction History changed the supplied row count.`,
  );
  source.forEach((record, index) => {
    const returned = normalized[index];
    for (const field of [
      'id',
      'merchant',
      'posted',
      'time',
      'amount',
      'instrument',
      'channel',
      'status',
      'context',
      'direction',
      'category',
      'entryMode',
      'location',
    ]) {
      assert(
        returned[field] === record[field],
        `${activeCase.id} ${record.id} did not preserve ${field}.`,
      );
    }
    assert(
      returned.pinPayload?.query === record.id
      && returned.pinPayload?.sourceRecordId === record.id,
      `${activeCase.id} ${record.id} does not carry an exact Transaction History pin route.`,
    );
  });
}

const generatedCase = createGeneratedCase({
  index: 56005801,
  claimTypeId: 'card-account-takeover',
  difficulty: 'deep',
});
const generatedTransactions = getTransactionHistory(generatedCase);
assert(
  generatedTransactions.length > 0,
  `${generatedCase.id} did not generate any Transaction History source rows for contract coverage.`,
);
for (const record of generatedTransactions) {
  for (const field of ['direction', 'category', 'entryMode', 'location']) {
    assert(
      record[field] !== null && record[field] !== undefined,
      `${generatedCase.id} ${record.id} is missing explicit ${field}.`,
    );
  }
}

const noSourceCase = {
  id: 'FA-NO-TRANSACTIONS',
  availableTools: ['Transaction History'],
  toolResults: {},
  documents: [{ id: 'DOC-UNRELATED' }],
};
assert(
  getTransactionHistory(noSourceCase).length === 0,
  'Transaction History synthesized rows when no source transactions were supplied.',
);

const incompleteSourceCase = {
  id: 'FA-SOURCE-BOUNDARY',
  availableTools: ['Transaction History'],
  documents: [{ id: 'DOC-UNRELATED' }],
  toolResults: {
    transactions: [{
      id: 'TXN-SOURCE-1',
      posted: 'Jul 9, 2026',
      merchant: 'Source Boundary Merchant',
      amount: '$10.00',
      channel: 'Source channel',
      instrument: 'Source instrument',
      status: 'Posted',
      context: 'Source-only fixture.',
    }],
  },
};
const [incomplete] = getTransactionHistory(incompleteSourceCase);
assert(
  incomplete.direction === null
  && incomplete.category === null
  && incomplete.entryMode === null
  && incomplete.location === null,
  'Transaction History inferred direction, category, entry mode, or location from incomplete source data.',
);
assert(
  incomplete.relatedDocuments.length === 0,
  'Transaction History linked arbitrary case documents to a transaction.',
);

const fixture = [
  {
    id: 'TXN-FIX-1',
    posted: 'Jul 30, 2026',
    time: '9:30 AM',
    merchant: 'North Market',
    amount: '$125.00',
    direction: 'Debit',
    channel: 'Card present',
    status: 'Posted',
    instrument: 'Training card 1001',
  },
  {
    id: 'TXN-FIX-2',
    posted: 'Jul 20, 2026',
    time: '8:00 AM',
    merchant: 'North Market',
    amount: '$40.00',
    direction: 'Credit',
    channel: 'Refund',
    status: 'Posted',
    instrument: 'Training card 1001',
  },
  {
    id: 'TXN-FIX-3',
    posted: 'May 1, 2026',
    time: '7:00 AM',
    merchant: 'South Market',
    amount: '$0.00',
    direction: 'Non-monetary',
    channel: 'Account setup',
    status: 'Recorded',
    instrument: 'Training account',
  },
];

assert(
  searchTransactionRecords(fixture, 'north market').length === 2
  && searchTransactionRecords(fixture, 'txn-fix-1')[0]?.id === 'TXN-FIX-1'
  && searchTransactionRecords(fixture, '125.00')[0]?.id === 'TXN-FIX-1',
  'Transaction History search does not match merchant, ID, and amount case-insensitively.',
);
assert(
  searchTransactionRecords([
    fixture[0],
    { ...fixture[0], id: 'TXN-FIX-10' },
  ], 'txn-fix-1').map((record) => record.id).join(',') === 'TXN-FIX-1',
  'Transaction History exact-ID search is ambiguous when another source ID contains the same text.',
);
assert(
  rangeTransactionRecords(fixture, '7d').length === 1
  && rangeTransactionRecords(fixture, '30d').length === 2
  && rangeTransactionRecords(fixture, '90d').length === 2,
  'Transaction History preset ranges do not use inclusive calendar-day boundaries.',
);
assert(
  rangeTransactionRecords(fixture, 'custom', {
    customStart: '2026-07-20',
    customEnd: '2026-07-20',
  }).map((record) => record.id).join(',') === 'TXN-FIX-2',
  'Transaction History custom range is not inclusive of both supplied boundaries.',
);
assert(
  filterTransactionRecords(fixture, {
    direction: 'debit',
    status: 'posted',
    channel: 'card present',
  }).map((record) => record.id).join(',') === 'TXN-FIX-1',
  'Transaction History combined filters do not narrow the matched source set.',
);

const summary = summarizeTransactionRecords(fixture);
assert(
  summary.totalCount === 3
  && summary.amountCount === 3
  && summary.totalAmount === 165
  && summary.debitCount === 1
  && summary.debitAmountCount === 1
  && summary.debitAmount === 125
  && summary.creditCount === 1
  && summary.creditAmountCount === 1
  && summary.creditAmount === 40,
  'Transaction History summary does not reconcile to the displayed source rows.',
);

const rangeBoundaryFixture = [
  { id: 'TXN-ANCHOR', posted: 'Jul 30, 2026' },
  { id: 'TXN-7D-INCLUSIVE', posted: 'Jul 24, 2026' },
  { id: 'TXN-7D-OUTSIDE', posted: 'Jul 23, 2026' },
  { id: 'TXN-UNDATED', posted: '' },
];
assert(
  rangeTransactionRecords(rangeBoundaryFixture, '7d')
    .map((record) => record.id)
    .join(',') === 'TXN-ANCHOR,TXN-7D-INCLUSIVE',
  'Transaction History 7D range is not exactly seven inclusive calendar dates or includes undated rows.',
);
assert(
  rangeTransactionRecords([fixture[2]], '7d', { anchorRecords: fixture }).length === 0,
  'Transaction History re-anchored a preset range to an old search subset.',
);
assert(
  rangeTransactionRecords([fixture[2]], 'exact', { anchorRecords: fixture })[0]?.id === 'TXN-FIX-3',
  'Transaction History hid an exact-ID result because it was outside the default preset range.',
);
assert(
  rangeTransactionRecords(
    [{ id: 'TXN-UNDATED', posted: '' }],
    'custom',
    { customStart: '2026-07-01', customEnd: '2026-07-30' },
  ).length === 0,
  'Transaction History included an undated record in a bounded custom range.',
);
assert(
  transactionAmountValue('') === null
  && transactionAmountValue('Not supplied') === null
  && transactionAmountValue('$0.00') === 0,
  'Transaction History does not distinguish missing amounts from an explicit zero amount.',
);
const missingAmountSummary = summarizeTransactionRecords([{
  id: 'TXN-MISSING-AMOUNT',
  amount: 'Not supplied',
  direction: 'Debit',
}]);
assert(
  missingAmountSummary.totalCount === 1
  && missingAmountSummary.amountCount === 0
  && missingAmountSummary.totalAmount === 0
  && missingAmountSummary.debitCount === 1
  && missingAmountSummary.debitAmountCount === 0,
  'Transaction History summary represented a missing amount as a supplied zero amount.',
);

const transactionSource = fs.readFileSync('src/tools/FinancialBusinessTools.jsx', 'utf8');
const transactionSection = transactionSource.slice(
  transactionSource.indexOf('export function TransactionHistoryTool'),
  transactionSource.indexOf('function merchantAuthorizationFields'),
);
for (const forbidden of [
  'Amazon.com',
  'Acme Payroll LLC',
  'Starbucks',
  '$1,842.35',
  'Review Needed',
]) {
  assert(
    !transactionSection.includes(forbidden),
    `Transaction History copied unsupported reference content: ${forbidden}.`,
  );
}

console.log('Transaction History contract smoke check passed for source preservation, search gating inputs, functional ranges and filters, reconciled summaries, exact pins, and source-only details.');
