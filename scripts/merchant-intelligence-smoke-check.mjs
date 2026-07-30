import fs from 'node:fs';
import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import {
  buildExplicitMerchantWorkspace,
  formatMerchantPin,
  normalizeMerchantLookup,
  resolveMerchantLookup,
} from '../src/data/explicitMerchantWorkspace.js';

const failures = [];

function fail(message) {
  failures.push(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

const fixture = {
  id: 'FA-MER-EXACT-01',
  availableTools: ['Merchant Intelligence', 'Document Viewer', 'Document Request'],
  claimDetails: {
    disputedTransactionIds: ['TXN-TS-200'],
  },
  chargebackDecision: {
    reasonCode: 'DO-NOT-INDEX-THIS',
    responseDeadline: 'DO-NOT-COPY-THIS',
  },
  toolResults: {
    transactions: [
      {
        id: 'TXN-TS-100',
        posted: 'Jun 12, 2026',
        merchant: 'TechSphere Solutions',
        descriptor: 'TECHSPHERE*SOL',
        amount: '$100.00',
        status: 'Posted',
      },
      {
        id: 'TXN-TS-200',
        posted: 'Jul 12, 2026',
        merchant: 'TechSphere Solutions',
        descriptor: 'TECHSPHERE*SOL',
        amount: '$2,450.00',
        status: 'Posted',
      },
      {
        id: 'TXN-OTHER-1',
        posted: 'Jul 13, 2026',
        merchant: 'Unrelated Training Merchant',
        amount: '$75.00',
        status: 'Posted',
      },
    ],
    documents: [
      {
        id: 'DOC-TS-POLICY',
        title: 'Cancellation and Refund Policy',
        status: 'Received',
        source: 'TechSphere Solutions',
      },
      {
        id: 'DOC-TS-CANCEL',
        title: 'Cancellation Confirmation',
        status: 'Requested',
        source: 'Customer request inbox',
      },
    ],
    merchantIntelligence: {
      profile: {
        id: 'MER-884522',
        name: 'TechSphere Solutions',
        legalName: 'TechSphere Solutions LLC',
        descriptor: 'TECHSPHERE*SOL',
        mcc: '5732',
        category: 'Electronics',
        location: 'Dallas, TX',
      },
      authorization: {
        id: 'AUTH-TS-200',
        authorizationResult: 'Approved',
        entryMode: 'Card not present',
      },
      response: {
        id: 'MRC-TS-RESPONSE',
        status: 'Challenged',
        receivedDate: 'Jul 14, 2026',
        statement: 'Merchant response supplied for investigator comparison.',
      },
      records: [
        {
          id: 'ORD-TS-200',
          section: 'fulfillment',
          title: 'Order record',
          fields: [['Order status', 'Delivered']],
        },
        {
          id: 'FUL-TS-200',
          section: 'fulfillment',
          title: 'Fulfillment record',
          fields: [['Carrier status', 'Recorded']],
        },
      ],
    },
  },
  merchantResponse: {
    status: 'Pending',
    externalReference: 'MRC-DIRECT-OLDER',
  },
  merchantAuthorization: {
    entryMode: 'Direct fallback entry mode',
  },
  events: [
    {
      id: 'EVT-TS-1',
      time: 'Jul 12, 2026 · 10:42 PM',
      label: 'Merchant transaction recorded',
      detail: 'TXN-TS-200',
    },
  ],
};

const fixtureBefore = JSON.stringify(fixture);
const workspace = buildExplicitMerchantWorkspace(fixture);

expect(Boolean(workspace), 'Explicit merchant fixture did not build a workspace.');
expect(JSON.stringify(fixture) === fixtureBefore, 'Workspace builder mutated the active case.');
expect(workspace?.contract === 'explicit-merchant-v1', 'Workspace contract version is missing.');
expect(workspace?.profile?.name === 'TechSphere Solutions', 'Supplied merchant name was not preserved.');
expect(workspace?.profile?.legalName === 'TechSphere Solutions LLC', 'Supplied legal name was not preserved.');
expect(workspace?.merchantRecordId === 'MER-884522', 'Actual merchant record ID was not preserved.');
expect(workspace?.primaryTransaction?.id === 'TXN-TS-200', 'Disputed transaction was not selected as primary.');
expect(workspace?.matchingTransactions?.length === 2, 'Unrelated transaction leaked into merchant history.');
expect(workspace?.history?.transactionCount === 2, 'Merchant history count is not source-backed.');
expect(workspace?.history?.totalAmount === 2550, 'Merchant history total is incorrect.');
expect(workspace?.history?.totalAmountDisplay === '$2,550.00', 'Merchant history formatted total is incorrect.');
expect(workspace?.authorization?.id === 'AUTH-TS-200', 'Supplied authorization record was not preserved.');
expect(workspace?.authorization?.entryMode === 'Card not present', 'Packet authorization did not override the direct fallback.');
expect(workspace?.response?.id === 'MRC-TS-RESPONSE', 'Supplied response record was not preserved.');
expect(workspace?.response?.status === 'Challenged', 'Packet response did not override the direct fallback.');
expect(workspace?.policyDocument?.id === 'DOC-TS-POLICY', 'Supplied policy document was not linked.');
expect(workspace?.policyLink?.query === 'DOC-TS-POLICY', 'Policy link does not carry the supplied document ID.');
expect(workspace?.requestableDocument?.id === 'DOC-TS-CANCEL', 'Supplied requestable document was not linked.');
expect(workspace?.requestLink?.query === 'DOC-TS-CANCEL', 'Request link does not carry the supplied request ID.');
expect(workspace?.events?.length === 1 && workspace.events[0].id === 'EVT-TS-1', 'Supplied merchant event was not preserved.');
expect(!JSON.stringify(workspace).includes('DO-NOT-INDEX-THIS'), 'Decision configuration leaked into the merchant workspace.');
expect(!JSON.stringify(workspace).includes('DO-NOT-COPY-THIS'), 'Decision deadline leaked into the merchant workspace.');

const exactLookups = [
  ['merchant-name', '  TECHSPHERE—SOLUTIONS ', 'merchant-name'],
  ['legal-name', 'techsphere solutions llc', 'legal-name'],
  ['descriptor', 'techsphere sol', 'descriptor'],
  ['mcc', 'MCC 5732', 'mcc'],
  ['record-id', 'mer-884522', 'record-id'],
  ['record-id', 'txn-ts-200', 'record-id'],
  ['record-id', 'auth-ts-200', 'record-id'],
  ['record-id', 'mrc-ts-response', 'record-id'],
  ['record-id', 'ord-ts-200', 'record-id'],
  ['record-id', 'ful-ts-200', 'record-id'],
];

for (const [type, value, expectedType] of exactLookups) {
  const result = resolveMerchantLookup(workspace, { type, value });
  expect(Boolean(result), `Exact ${type} lookup failed for ${value}.`);
  expect(result?.lookupType === expectedType, `${value} resolved to the wrong lookup type.`);
}

expect(
  resolveMerchantLookup(workspace, 'txn-ts-200')?.match?.recordKind === 'transaction',
  'Automatic lookup did not preserve transaction record provenance.',
);
expect(
  resolveMerchantLookup(workspace, 'AUTH-TS-200')?.match?.recordKind === 'authorization',
  'Automatic lookup did not preserve authorization record provenance.',
);
expect(
  resolveMerchantLookup(workspace, 'MRC-TS-RESPONSE')?.match?.recordKind === 'response',
  'Automatic lookup did not preserve response record provenance.',
);

for (const unsafeLookup of [
  'T',
  'TechSphere',
  'Solutions',
  '573',
  'Approved',
  'Challenged',
  'Delivered',
  'Jul 14, 2026',
  'DO-NOT-INDEX-THIS',
]) {
  expect(
    resolveMerchantLookup(workspace, unsafeLookup) === null,
    `Partial or hidden-output lookup incorrectly opened the packet: ${unsafeLookup}`,
  );
}

expect(
  normalizeMerchantLookup('TECHSPHERE*SOL', 'descriptor') === 'TECHSPHERESOL',
  'Descriptor normalization is not deterministic.',
);
expect(
  normalizeMerchantLookup('MCC: 5732', 'mcc') === '5732',
  'MCC normalization is not deterministic.',
);
expect(
  normalizeMerchantLookup('auth–ts–200', 'record-id') === 'AUTH-TS-200',
  'Record-ID dash normalization is not deterministic.',
);

const transactionLookup = resolveMerchantLookup(workspace, {
  type: 'record-id',
  value: 'TXN-TS-200',
});
const pin = formatMerchantPin(workspace, transactionLookup);
expect(/^MER-/.test(pin?.id ?? ''), 'Merchant pin does not use the canonical MER prefix.');
expect(pin?.tool === 'Merchant Intelligence', 'Merchant pin has the wrong tool.');
expect(pin?.sourceTool === 'Merchant Intelligence', 'Merchant pin has the wrong source tool.');
expect(pin?.caseId === fixture.id, 'Merchant pin lost its case ID.');
expect(pin?.sourceRecordId === 'TXN-TS-200', 'Merchant pin lost its actual source record ID.');
expect(pin?.query === 'TXN-TS-200', 'Merchant pin cannot restore its exact lookup query.');
expect(pin?.lookupType === 'record-id', 'Merchant pin cannot restore its lookup type.');
expect(pin?.initialPayload?.sourceRecordId === 'TXN-TS-200', 'Merchant pin payload cannot restore the source record.');

const noFabricationFixture = {
  id: 'FA-MER-MINIMAL-01',
  availableTools: ['Merchant Intelligence'],
  toolResults: {
    merchantIntelligence: {
      profile: { name: 'Minimal Merchant' },
    },
  },
};
const minimalWorkspace = buildExplicitMerchantWorkspace(noFabricationFixture);
expect(Boolean(minimalWorkspace), 'Minimal explicit merchant profile did not build.');
for (const absentField of ['legalName', 'descriptor', 'mcc', 'category', 'location']) {
  expect(
    minimalWorkspace?.profile?.[absentField] === undefined,
    `Missing merchant field ${absentField} was fabricated.`,
  );
}
expect(minimalWorkspace?.primaryTransaction === null, 'A missing primary transaction was fabricated.');
expect(minimalWorkspace?.history?.transactionCount === 0, 'A missing merchant history count was fabricated.');
expect(minimalWorkspace?.history?.totalAmount === null, 'A missing merchant history total was fabricated.');
expect(minimalWorkspace?.policyDocument === null, 'A missing policy document was fabricated.');
expect(minimalWorkspace?.requestableDocument === null, 'A missing requestable document was fabricated.');
expect(minimalWorkspace?.response && Object.keys(minimalWorkspace.response).length === 0, 'A missing merchant response was fabricated.');
expect(minimalWorkspace?.authorization && Object.keys(minimalWorkspace.authorization).length === 0, 'A missing authorization record was fabricated.');

expect(
  buildExplicitMerchantWorkspace({
    id: 'FA-MER-DECISION-ONLY',
    chargebackDecision: {
      reasonCode: 'Decision-only configuration',
      responseDeadline: 'Jul 30, 2026',
    },
  }) === null,
  'Decision configuration incorrectly qualifies as merchant evidence.',
);

const staticCases = enrichTrainingCases(trainingCases);
const staticMerchantCase = staticCases.find((item) => item.id === 'FA-CB-24007');
const staticWorkspace = buildExplicitMerchantWorkspace(staticMerchantCase);
expect(Boolean(staticWorkspace), 'The built-in merchant case no longer builds from explicit records.');
expect(staticWorkspace?.profile?.name === 'StreamBox Premium', 'Built-in merchant name is not sourced from its transaction.');
expect(staticWorkspace?.primaryTransaction?.id === 'TXN-2201', 'Built-in primary transaction is incorrect.');
expect(staticWorkspace?.matchingTransactions?.length === 3, 'Built-in merchant transaction history is incomplete.');
expect(staticWorkspace?.history?.totalAmount === 558.32, 'Built-in merchant transaction total is incorrect.');
expect(staticWorkspace?.response?.status === 'Challenged', 'Built-in explicit merchant response was not preserved.');
expect(staticWorkspace?.authorization?.authorizationResult === 'Approved', 'Built-in explicit authorization was not preserved.');
expect(staticWorkspace?.policyDocument === null, 'Built-in case received a fabricated policy document.');
expect(staticWorkspace?.requestableDocument?.id === 'DOC-511', 'Built-in requestable document link is incorrect.');
expect(
  resolveMerchantLookup(staticWorkspace, 'StreamBox') === null,
  'Built-in merchant search accepts a partial merchant name.',
);
expect(
  resolveMerchantLookup(staticWorkspace, 'StreamBox Premium')?.lookupType === 'merchant-name',
  'Built-in merchant search rejects the exact supplied merchant.',
);
expect(
  resolveMerchantLookup(staticWorkspace, 'Approved') === null,
  'Built-in authorization output can be used as a merchant search key.',
);

const source = fs.readFileSync('src/data/explicitMerchantWorkspace.js', 'utf8');
for (const forbidden of [
  'getMerchantIntelligence',
  'chargebackDecision',
  'Training Commerce LLC',
  'Network submission recorded',
  'Merchant account settings accessed',
]) {
  expect(!source.includes(forbidden), `Explicit merchant contract contains forbidden synthetic dependency: ${forbidden}`);
}

if (failures.length) {
  console.error('Merchant Intelligence contract check failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('Merchant Intelligence exact-search and explicit-source contract check passed.');
