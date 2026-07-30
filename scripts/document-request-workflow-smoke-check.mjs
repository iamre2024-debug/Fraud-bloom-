import fs from 'node:fs';
import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import {
  getCaseDocuments,
} from '../src/data/documentRecords.js';
import {
  applyCustomerResponse,
  buildCustomerResponseDocuments,
  buildPaperworkInboxRecords,
  createPaperworkAttempt,
  getPaperworkRequestTemplates,
  markPaperworkResponseRead,
} from '../src/data/documentRequestWorkflow.js';

const cases = enrichTrainingCases(trainingCases);
const streamBox = cases.find((item) => item.id === 'FA-CB-24007');
const accountTakeover = cases.find((item) => item.id === 'FA-ATO-24018');
const failures = [];

function fail(message) {
  failures.push(message);
}

function ids(records = []) {
  return records.map((item) => item.id).sort();
}

if (!streamBox) fail('StreamBox case FA-CB-24007 is unavailable.');
if (!accountTakeover) fail('Account-takeover case FA-ATO-24018 is unavailable.');

const emptyInventory = getCaseDocuments({
  id: 'FA-EMPTY-1',
  accountId: 'ACCT-EMPTY-1',
  availableTools: ['Document Viewer', 'Financial Investigation', 'Customer 360'],
  merchantResponse: { status: 'Challenged' },
});
if (emptyInventory.length) {
  fail('Document inventory fabricates records when the active case supplies no documents.');
}

const mergedInventory = getCaseDocuments({
  id: 'FA-MERGE-1',
  accountId: 'ACCT-MERGE-1',
  person: 'Merge Tester',
  documents: [
    { id: 'DOC-A', name: 'Direct document A', status: 'Requested', detail: 'Direct source detail.' },
    { id: 'DOC-D', name: 'Direct document D', status: 'Available', detail: 'Direct source D.' },
  ],
  evidenceDocuments: [
    { id: 'DOC-B', title: 'Evidence document B', status: 'Received', preview: 'Evidence B.' },
  ],
  documentRequests: [
    { id: 'DOC-C', title: 'Request document C', status: 'Missing', preview: 'Request C.' },
  ],
  toolResults: {
    documents: [
      {
        id: 'DOC-A',
        title: 'Enriched document A',
        category: 'Requested document',
        status: 'Requested',
        preview: 'Enriched source description.',
        fields: 'Customer attestation, signature',
      },
      { id: 'DOC-E', title: 'Tool-result document E', status: 'Available', preview: 'Tool result E.' },
    ],
    evidenceDocuments: [
      { id: 'DOC-F', title: 'Tool evidence F', status: 'Received', preview: 'Tool evidence F.' },
    ],
  },
});
if (ids(mergedInventory).join('|') !== 'DOC-A|DOC-B|DOC-C|DOC-D|DOC-E|DOC-F') {
  fail(`Explicit document sources were not merged correctly: ${ids(mergedInventory).join('|')}.`);
}
const mergedA = mergedInventory.find((item) => item.id === 'DOC-A');
if (mergedA?.status !== 'Requested' || mergedA?.title !== 'Enriched document A') {
  fail('Duplicate document sources did not preserve supplied status while enriching the record.');
}
if (mergedA?.pages?.length) {
  fail('A supplied Requested document was incorrectly given a source page.');
}
if (!mergedInventory.find((item) => item.id === 'DOC-D')?.pages?.length) {
  fail('An explicitly supplied Available document did not receive a reviewable case-record page.');
}

if (accountTakeover) {
  const accountTakeoverDocuments = getCaseDocuments(accountTakeover);
  if (!accountTakeoverDocuments.some((item) => item.id === 'DOC-444')) {
    fail('Merging evidence and active-case document sources still drops DOC-444.');
  }
  if (accountTakeoverDocuments.some((item) => /-DOC-(?:ID|BANK|ADDRESS|PHONE|EIN|TAX)$/.test(item.id))) {
    fail('Document inventory still adds runtime-generated standard documents.');
  }
  if (accountTakeoverDocuments.find((item) => item.id === 'DOC-442')?.status !== 'Requested') {
    fail('Requested source status was rewritten in the document inventory.');
  }
  if (accountTakeoverDocuments.find((item) => item.id === 'DOC-443')?.status !== 'Missing') {
    fail('Missing source status was rewritten in the document inventory.');
  }
}

if (streamBox) {
  const streamBoxDocuments = getCaseDocuments(streamBox);
  if (ids(streamBoxDocuments).join('|') !== 'DOC-510|DOC-511|DOC-512') {
    fail(`StreamBox must use only supplied source documents; found ${ids(streamBoxDocuments).join('|')}.`);
  }
  if (streamBoxDocuments.some((item) => /-(?:NET|MER|SUB|BILL|POLICY|ACTIVITY)-/i.test(item.id))) {
    fail('StreamBox document inventory still contains synthesized Merchant Intelligence documents.');
  }

  const templates = getPaperworkRequestTemplates(streamBox);
  const cancellation = templates.find((item) => item.id === 'DOC-511');
  if (!cancellation) fail('StreamBox cancellation confirmation request template is unavailable.');
  if (cancellation?.status !== 'Requested') {
    fail('Request template did not preserve its supplied Requested status.');
  }

  const initial = buildPaperworkInboxRecords(streamBox, {});
  const initialIds = ids(initial);
  if (initialIds.join('|') !== 'DOC-510|DOC-512') {
    fail(`StreamBox should expose only its two supplied source-page records before an agent action; found ${initialIds.join('|')}.`);
  }
  if (initial.some((item) => item.recordKind === 'outbound-request')) {
    fail('A supplied Requested status was incorrectly converted into an agent-sent outbound request.');
  }

  if (cancellation) {
    const attempt = createPaperworkAttempt({
      activeCase: streamBox,
      document: cancellation,
      reason: 'Please send the cancellation confirmation.',
      dueDate: 'Jul 29, 2026',
      requestedDate: 'Jul 22, 2026, 9:00 AM',
      deliveryChannel: 'Email',
      attemptId: 'ATT-TEST-1',
    });
    if (Object.hasOwn(attempt, 'responseOutcome')) {
      fail('A future customer-response outcome is stored before the explicit response check.');
    }

    const sentState = {
      [cancellation.id]: {
        schemaVersion: 2,
        sourceDocumentId: cancellation.id,
        attempts: [attempt],
      },
    };
    const afterSend = buildPaperworkInboxRecords(streamBox, sentState);
    const outbound = afterSend.find((item) => item.id === attempt.requestId);
    if (!outbound || outbound.recordKind !== 'outbound-request' || outbound.status !== 'Requested') {
      fail('Agent-sent request is not preserved as an independent outbound record.');
    }
    if (Object.hasOwn(outbound ?? {}, 'responseOutcome')) {
      fail('Outbound request record exposes a future response outcome before the response check.');
    }
    if (afterSend.some((item) => item.id.includes('-CUS-'))) {
      fail('Sending a request created an inbound customer source document automatically.');
    }

    const responseAttempt = applyCustomerResponse({
      activeCase: streamBox,
      document: cancellation,
      attempt,
      checkedAt: 'Jul 22, 2026, 9:05 AM',
    });
    if (!responseAttempt.responseCheckedAt || !responseAttempt.responseOutcome) {
      fail('Explicit customer-response check did not resolve and record the response outcome.');
    }
    if (!responseAttempt.unread || responseAttempt.readAt) {
      fail('New customer response did not begin in a persistent unread state.');
    }

    const receivedState = {
      [cancellation.id]: {
        ...sentState[cancellation.id],
        attempts: [responseAttempt],
      },
    };
    const afterResponse = buildPaperworkInboxRecords(streamBox, receivedState);
    if (!afterResponse.some((item) => item.id === attempt.requestId && item.recordKind === 'outbound-request')) {
      fail('Customer response replaced the outbound request record.');
    }
    const inbound = afterResponse.find((item) => item.id === responseAttempt.responseId);
    if (!inbound || inbound.recordKind !== 'customer-submission') {
      fail('Customer response was not added as a separate inbound record.');
    }
    if (!inbound.unread || inbound.readAt) {
      fail('Inbound response record did not preserve its unread state.');
    }

    const responseDocuments = buildCustomerResponseDocuments(streamBox, receivedState);
    if (responseDocuments.length !== 1 || responseDocuments[0]?.id !== responseAttempt.responseId) {
      fail('Document Viewer does not receive the customer response as a separate document record.');
    }
    if (!responseDocuments[0]?.pages?.length) {
      fail('Customer response document has no reviewable page.');
    }
    if (!responseDocuments[0]?.unread || responseDocuments[0]?.readAt) {
      fail('Document Viewer response copy did not preserve unread metadata.');
    }

    const readAt = 'Jul 22, 2026, 9:07 AM';
    const readState = markPaperworkResponseRead(
      receivedState,
      responseAttempt.responseId,
      readAt,
    );
    if (readState === receivedState) {
      fail('Marking an unread response did not return updated request state.');
    }
    const readAttempt = readState[cancellation.id]?.attempts?.[0];
    if (readAttempt?.unread || readAttempt?.readAt !== readAt) {
      fail('Unread response did not persist unread=false and the supplied readAt timestamp.');
    }
    const readInbox = buildPaperworkInboxRecords(streamBox, readState);
    const readInbound = readInbox.find((item) => item.id === responseAttempt.responseId);
    if (readInbound?.unread || readInbound?.readAt !== readAt) {
      fail('Rebuilt inbox did not preserve the response read state.');
    }
    const readDocuments = buildCustomerResponseDocuments(streamBox, readState);
    if (readDocuments[0]?.unread || readDocuments[0]?.readAt !== readAt) {
      fail('Rebuilt Document Viewer response did not preserve the response read state.');
    }
    if (markPaperworkResponseRead(readState, 'DOC-NOT-FOUND', readAt) !== readState) {
      fail('Mark-read helper must return the unchanged request-state object when no record matches.');
    }
    if (markPaperworkResponseRead(readState, responseAttempt.responseId, readAt) !== readState) {
      fail('Mark-read helper must return the unchanged request-state object when the response is already read.');
    }
  }
}

const documentRecordsSource = fs.readFileSync('src/data/documentRecords.js', 'utf8');
if (documentRecordsSource.includes('getMerchantIntelligence')) {
  fail('Document inventory still calls Merchant Intelligence to synthesize chargeback documents.');
}
for (const forbidden of [
  '$4,218.44',
  '$6,842.10',
  'Training Wireless Network',
  'Mar 12, 2022',
]) {
  if (documentRecordsSource.includes(forbidden)) {
    fail(`Document reader still hard-codes runtime evidence value ${forbidden}.`);
  }
}

if (failures.length) {
  console.error('Document request workflow smoke check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Document request workflow smoke check passed. Inventories are source-only; statuses, manual requests, independent responses, and read state are preserved.');
