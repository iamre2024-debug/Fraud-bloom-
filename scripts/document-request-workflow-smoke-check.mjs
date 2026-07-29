import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import {
  applyCustomerResponse,
  buildCustomerResponseDocuments,
  buildPaperworkInboxRecords,
  createPaperworkAttempt,
  getPaperworkRequestTemplates,
} from '../src/data/documentRequestWorkflow.js';

const cases = enrichTrainingCases(trainingCases);
const streamBox = cases.find((item) => item.id === 'FA-CB-24007');
const failures = [];

if (!streamBox) failures.push('StreamBox case FA-CB-24007 is unavailable.');

if (streamBox) {
  const templates = getPaperworkRequestTemplates(streamBox);
  const cancellation = templates.find((item) => /cancellation confirmation/i.test(item.title));
  if (!cancellation) failures.push('StreamBox cancellation confirmation request template is unavailable.');

  const initial = buildPaperworkInboxRecords(streamBox, {});
  if (initial.length !== 1 || initial[0]?.documentType !== 'Customer dispute form') {
    failures.push(`StreamBox should begin with one received dispute form and no auto-sent cancellation document; found ${initial.length} records.`);
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
    const sentState = { [cancellation.id]: { schemaVersion: 2, sourceDocumentId: cancellation.id, attempts: [attempt] } };
    const afterSend = buildPaperworkInboxRecords(streamBox, sentState);
    if (afterSend.length !== 2) failures.push(`StreamBox should show two records after the agent sends a request; found ${afterSend.length}.`);
    if (!afterSend.some((item) => item.recordKind === 'outbound-request' && item.status === 'Requested')) failures.push('Agent-sent request is not preserved as an independent outbound record.');

    const responseAttempt = applyCustomerResponse({
      activeCase: streamBox,
      document: cancellation,
      attempt,
      checkedAt: 'Jul 22, 2026, 9:05 AM',
    });
    const receivedState = { [cancellation.id]: { ...sentState[cancellation.id], attempts: [responseAttempt] } };
    const afterResponse = buildPaperworkInboxRecords(streamBox, receivedState);
    if (afterResponse.length !== 3) failures.push(`StreamBox should show dispute form, outbound request, and inbound document as three records; found ${afterResponse.length}.`);
    if (!afterResponse.some((item) => item.id === attempt.requestId && item.recordKind === 'outbound-request')) failures.push('Customer response replaced the outbound request record.');
    if (!afterResponse.some((item) => item.id === responseAttempt.responseId && item.recordKind === 'customer-submission')) failures.push('Customer response was not added as a separate inbound record.');

    const responseDocuments = buildCustomerResponseDocuments(streamBox, receivedState);
    if (responseDocuments.length !== 1 || responseDocuments[0]?.id !== responseAttempt.responseId) failures.push('Document Viewer does not receive the customer response as a separate document record.');
    if (!responseDocuments[0]?.pages?.length) failures.push('Customer response document has no reviewable page.');
  }
}

if (failures.length) {
  console.error('Document request workflow smoke check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Document request workflow smoke check passed. Requests are manual and outbound/inbound paperwork records remain independent.');
