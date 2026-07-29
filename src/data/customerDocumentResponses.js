import { publicCaseTaxonomy } from './publicCaseView.js';

const responseStatuses = {
  received: 'Received',
  incomplete: 'Incomplete',
  late: 'Received Late',
  'no-response': 'No Response',
};

function stableNumber(value = '') {
  return [...String(value)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) % 100000, 17);
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? 'Not supplied';
}

function merchantName(activeCase = {}) {
  const transactionMerchant = activeCase.toolResults?.transactions?.[0]?.merchant
    ?? activeCase.toolResults?.financialIntel?.find((item) => item.merchant)?.merchant;
  const transactionLabel = String(activeCase.transactionInfo ?? '').split(/[·|]/)[0]?.trim();
  return firstValue(transactionMerchant, transactionLabel, activeCase.merchantName, 'Training merchant');
}

function normalizeOutcome(value = '') {
  const normalized = String(value).toLowerCase().trim().replace(/[_\s]+/g, '-');
  if (['complete', 'received', 'responded'].includes(normalized)) return 'received';
  if (['partial', 'incomplete', 'needs-more-information'].includes(normalized)) return 'incomplete';
  if (['late', 'received-late'].includes(normalized)) return 'late';
  if (['none', 'no-response', 'never-responded'].includes(normalized)) return 'no-response';
  return '';
}

export const customerDocumentResponseOutcomes = ['received', 'incomplete', 'late', 'no-response'];

export function getCustomerDocumentResponseOutcome(activeCase = {}, document = {}) {
  const explicit = normalizeOutcome(
    activeCase.customerDocumentResponses?.[document.id]?.outcome
      ?? activeCase.toolResults?.customerDocumentResponses?.[document.id]?.outcome
      ?? activeCase.customerDocumentResponseOutcome,
  );
  if (explicit) return explicit;

  // The guided StreamBox case always returns a complete cancellation record so
  // the learner can practice opening and reviewing an incoming customer page.
  if (activeCase.id === 'FA-CB-24007') return 'received';

  const bucket = stableNumber(`${activeCase.id}|${document.id}|customer-response`) % 20;
  if (bucket <= 8) return 'received';
  if (bucket <= 12) return 'incomplete';
  if (bucket <= 15) return 'late';
  return 'no-response';
}

function scenarioFor(document = {}) {
  const source = `${document.id ?? ''} ${document.title ?? ''} ${document.type ?? ''}`.toLowerCase();
  if (/cancel/.test(source)) return 'cancellation';
  if (/trial|enrollment|terms/.test(source)) return 'subscription-terms';
  if (/delivery|carrier|not received/.test(source)) return 'delivery';
  if (/refund|credit/.test(source)) return 'refund';
  if (/photo|item comparison|condition|not as described/.test(source)) return 'item-condition';
  if (/service|booking|reservation/.test(source)) return 'service';
  if (/receipt|purchase record|duplicate|amount/.test(source)) return 'receipt';
  if (/fraud|affidavit|unauthorized/.test(source)) return 'fraud-statement';
  return 'supporting-document';
}

function cancellationDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  const cancellationDate = firstValue(activeCase.claimDetails?.cancellationDate, activeCase.issueStartDate, 'Not visible in supplied record');
  const cancellationMethod = firstValue(activeCase.claimDetails?.cancellationMethod, 'Account settings');
  const confirmation = incomplete ? 'Not visible in supplied screenshot' : `CN-${reference}`;
  return {
    title: `${merchant} Cancellation Confirmation`,
    subtitle: 'SUBSCRIPTION ACCOUNT NOTICE',
    kind: 'email',
    brand: merchant,
    sections: [
      {
        title: 'Message details',
        rows: [['To', activeCase.person ?? 'Training customer'], ['Subject', 'Your subscription cancellation'], ['Sent', cancellationDate], ['Confirmation', confirmation]],
      },
      {
        title: 'Cancellation record',
        rows: [['Subscription', `${merchant} membership`], ['Requested', cancellationDate], ['Method', cancellationMethod], ['Effective date', incomplete ? 'Not shown' : cancellationDate], ['Renewal status', incomplete ? 'Not shown' : 'Automatic renewal turned off']],
      },
      {
        title: incomplete ? 'Visible customer upload' : 'Confirmation message',
        paragraphs: [incomplete
          ? 'The customer uploaded a cropped account screenshot showing a cancellation page, but the confirmation reference and effective date are not visible.'
          : `This notice confirms that the subscription associated with the training account was canceled. Keep confirmation ${confirmation} for your records.`],
      },
      { title: 'Upload record', rows: [['Received by issuer', receivedDate], ['Submitted by', activeCase.person ?? 'Training customer'], ['Upload channel', 'Customer secure upload']] },
    ],
  };
}

function subscriptionTermsDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  const enrollment = firstValue(activeCase.claimDetails?.enrollmentOrTrialDate, activeCase.issueStartDate, 'Not shown');
  return {
    title: `${merchant} Enrollment Receipt`,
    subtitle: 'TRIAL AND SUBSCRIPTION TERMS COPY',
    kind: 'receipt',
    brand: merchant,
    sections: [
      { title: 'Enrollment', rows: [['Customer', activeCase.person ?? 'Training customer'], ['Enrollment date', enrollment], ['Reference', `ENR-${reference}`], ['Plan', `${merchant} subscription`]] },
      { title: 'Terms displayed', rows: [['Trial length', incomplete ? 'Cropped from supplied copy' : 'Trial period shown at enrollment'], ['Renewal amount', incomplete ? 'Not visible' : activeCase.amount ?? 'Amount shown at checkout'], ['Renewal cadence', incomplete ? 'Not visible' : 'Recurring renewal'], ['Cancellation method', 'Account settings or merchant support']] },
      { title: 'Customer-supplied copy', paragraphs: [incomplete ? 'The supplied image contains the enrollment header, but the price and renewal disclosure are outside the captured area.' : 'This customer-supplied copy preserves the enrollment screen and the recurring-renewal disclosure displayed with the order.'] },
      { title: 'Upload record', rows: [['Received', receivedDate], ['Channel', 'Customer secure upload']] },
    ],
  };
}

function deliveryDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  const expected = firstValue(activeCase.claimDetails?.expectedDeliveryDate, activeCase.claimDetails?.serviceOrDeliveryDate, activeCase.issueStartDate);
  return {
    title: `Email Conversation with ${merchant}`,
    subtitle: 'DELIVERY SUPPORT THREAD',
    kind: 'email',
    brand: 'Customer Mail',
    sections: [
      { title: 'Conversation', rows: [['From', activeCase.person ?? 'Training customer'], ['To', `${merchant} Support`], ['Subject', 'Order not received'], ['Thread reference', `MSG-${reference}`]] },
      { title: 'Messages', table: { columns: ['Date', 'Sender', 'Message'], rows: [[expected, activeCase.person ?? 'Customer', 'The expected delivery has not arrived. Please confirm the delivery status.'], [receivedDate, merchant, incomplete ? 'Support reply is cut off in the uploaded image.' : 'We are reviewing the order and carrier record. No replacement or refund is confirmed in this thread.']] } },
      { title: 'Visible order details', rows: [['Expected delivery', expected], ['Delivery address', incomplete ? 'Not visible' : firstValue(activeCase.customer?.contact?.address, activeCase.intake?.customerLocation)], ['Order reference', incomplete ? 'Not visible' : `ORD-${reference}`]] },
    ],
  };
}

function refundDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  const refundDate = firstValue(activeCase.claimDetails?.returnOrRefundDate, activeCase.issueStartDate, 'Not shown');
  return {
    title: `${merchant} Refund Confirmation`,
    subtitle: 'CUSTOMER-SUPPLIED MERCHANT EMAIL',
    kind: 'email',
    brand: merchant,
    sections: [
      { title: 'Email details', rows: [['To', activeCase.person ?? 'Training customer'], ['Sent', refundDate], ['Subject', 'Your refund request'], ['Reference', incomplete ? 'Not visible' : `REF-${reference}`]] },
      { title: 'Refund details', rows: [['Original amount', activeCase.amount ?? 'Not supplied'], ['Refund amount', incomplete ? 'Not visible' : activeCase.amount ?? 'Amount shown in email'], ['Promised date', refundDate], ['Payment method', incomplete ? 'Not visible' : 'Original payment method']] },
      { title: 'Merchant message', paragraphs: [incomplete ? 'The uploaded email shows that a refund conversation occurred, but the amount, reference, and expected posting date are cropped.' : 'The merchant email states that the refund was approved for return to the original payment method. The account history must still be checked for the actual credit.'] },
      { title: 'Upload record', rows: [['Received by issuer', receivedDate], ['Channel', 'Customer secure upload']] },
    ],
  };
}

function itemConditionDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  return {
    title: 'Customer Item Condition Packet',
    subtitle: 'PHOTOGRAPHS AND LISTING COMPARISON',
    kind: 'form',
    brand: 'Customer Evidence Upload',
    sections: [
      { title: 'Submission details', rows: [['Customer', activeCase.person ?? 'Training customer'], ['Merchant', merchant], ['Upload reference', `IMG-${reference}`], ['Received', receivedDate]] },
      { title: 'Image inventory', table: { columns: ['File', 'Customer description', 'Review availability'], rows: [['Photo 1', 'Item as received', 'Visible'], ['Photo 2', 'Packaging and label', incomplete ? 'Missing from upload' : 'Visible'], ['Listing copy', 'Merchant description at purchase', incomplete ? 'Missing from upload' : 'Visible']] } },
      { title: 'Customer comparison', rows: [['Difference reported', firstValue(activeCase.statement?.value, activeCase.allegation)], ['Original listing reference', incomplete ? 'Not supplied' : `LIST-${reference}`], ['Return attempt', firstValue(activeCase.claimDetails?.returnOrRefundDate, 'Not stated')]] },
    ],
  };
}

function serviceDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  const serviceDate = firstValue(activeCase.claimDetails?.serviceOrDeliveryDate, activeCase.issueStartDate, 'Not shown');
  return {
    title: `${merchant} Service Correspondence`,
    subtitle: 'AGREEMENT AND CUSTOMER SUPPORT THREAD',
    kind: 'email',
    brand: 'Customer Mail',
    sections: [
      { title: 'Service record', rows: [['Customer', activeCase.person ?? 'Training customer'], ['Merchant', merchant], ['Service date', serviceDate], ['Booking / agreement', incomplete ? 'Not visible' : `SVC-${reference}`]] },
      { title: 'Correspondence', table: { columns: ['Date', 'Sender', 'Message'], rows: [[serviceDate, activeCase.person ?? 'Customer', 'Customer asks the merchant to address the disputed service issue.'], [receivedDate, merchant, incomplete ? 'Only the first line of the merchant reply is visible.' : 'Merchant reply acknowledges the contact and refers to the service terms.']] } },
      { title: 'Attached terms', rows: [['Agreement pages', incomplete ? 'Not attached' : '2 pages included'], ['Cancellation clause', incomplete ? 'Not available for review' : 'Included in supplied agreement'], ['Refund acknowledgement', 'No separate credit proof in this packet']] },
    ],
  };
}

function receiptDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  const purchaseDate = firstValue(activeCase.claimDetails?.disputedTransactionDate, activeCase.issueStartDate, activeCase.reportedDate);
  return {
    title: `${merchant} Purchase Receipt`,
    subtitle: 'CUSTOMER COPY',
    kind: 'receipt',
    brand: merchant,
    sections: [
      { title: 'Purchase', rows: [['Receipt', `RCP-${reference}`], ['Date', purchaseDate], ['Customer', activeCase.person ?? 'Training customer'], ['Payment', 'Training card on case']] },
      { title: 'Charge detail', table: { columns: ['Description', 'Quantity', 'Amount'], rows: [[publicCaseTaxonomy(activeCase).workflowType, '1', incomplete ? 'Amount cropped' : activeCase.amount ?? 'Amount shown on receipt']] } },
      { title: 'Comparison fields', rows: [['Merchant', merchant], ['Receipt total', incomplete ? 'Not visible' : activeCase.amount ?? 'Not supplied'], ['Authorization / order reference', incomplete ? 'Not visible' : `ORD-${reference}`], ['Received by issuer', receivedDate]] },
    ],
  };
}

function fraudStatementDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  return {
    title: 'Cardholder Transaction Statement',
    subtitle: 'CUSTOMER-SIGNED ACCOUNT',
    kind: 'form',
    brand: 'Fraud Academy Bank',
    sections: [
      { title: 'Statement information', rows: [['Cardholder', activeCase.person ?? 'Training customer'], ['Case', activeCase.id], ['Merchant', merchant], ['Disputed amount', activeCase.amount ?? 'Not supplied']] },
      { title: 'Customer statement', paragraphs: [firstValue(activeCase.statement?.value, activeCase.allegation, 'Customer statement not supplied.')] },
      { title: 'Attestation', rows: [['Signature', incomplete ? 'Signature page not included' : activeCase.person ?? 'Training customer'], ['Signed date', incomplete ? 'Not supplied' : receivedDate], ['Statement reference', `AFF-${reference}`]] },
    ],
  };
}

function genericDocument({ activeCase, merchant, incomplete, reference, receivedDate }) {
  return {
    title: 'Customer Supporting Document',
    subtitle: 'CASE EVIDENCE SUBMISSION',
    kind: 'form',
    brand: 'Customer Evidence Upload',
    sections: [
      { title: 'Submission', rows: [['Customer', activeCase.person ?? 'Training customer'], ['Case', activeCase.id], ['Merchant', merchant], ['Reference', `CUS-${reference}`], ['Received', receivedDate]] },
      { title: 'Customer-provided information', paragraphs: [firstValue(activeCase.statement?.value, activeCase.allegation, 'Customer supplied a document for comparison with the claim record.')] },
      { title: 'Completeness', rows: [['Pages supplied', incomplete ? '1 of 2' : 'Complete packet'], ['Key reference', incomplete ? 'Not visible' : `CUS-${reference}`], ['Review state', incomplete ? 'Additional page required' : 'Ready for investigator review']] },
    ],
  };
}

export function buildCustomerDocumentResponse({ activeCase = {}, document = {}, outcome, receivedDate = 'Training receipt date' }) {
  const resolvedOutcome = normalizeOutcome(outcome) || getCustomerDocumentResponseOutcome(activeCase, document);
  const status = responseStatuses[resolvedOutcome];
  const merchant = merchantName(activeCase);
  const reference = String(stableNumber(`${activeCase.id}|${document.id}|submission`)).padStart(5, '0');

  if (resolvedOutcome === 'no-response') {
    return {
      outcome: resolvedOutcome,
      status,
      receivedDate: 'Not received',
      responseCheckedAt: receivedDate,
      reason: 'No customer document was received after the agent-sent request was checked.',
      reviewerNotes: 'The scenario customer did not respond. The request remains part of the workflow history, but no document page exists to review.',
      responseChannel: 'No customer submission',
      customerSubmission: null,
    };
  }

  const incomplete = resolvedOutcome === 'incomplete';
  const scenario = scenarioFor(document);
  const input = { activeCase, document, merchant, incomplete, reference, receivedDate };
  const pageBuilder = {
    cancellation: cancellationDocument,
    'subscription-terms': subscriptionTermsDocument,
    delivery: deliveryDocument,
    refund: refundDocument,
    'item-condition': itemConditionDocument,
    service: serviceDocument,
    receipt: receiptDocument,
    'fraud-statement': fraudStatementDocument,
    'supporting-document': genericDocument,
  }[scenario];
  const submittedPage = pageBuilder(input);
  const late = resolvedOutcome === 'late';
  const fields = [
    ['Submission reference', `CUS-${reference}`],
    ['Customer', activeCase.person ?? 'Training customer'],
    ['Case ID', activeCase.id],
    ['Merchant', merchant],
    ['Received', receivedDate],
    ['Completeness', incomplete ? 'Incomplete — key field or page missing' : 'Complete for document review'],
    ['Timeliness', late ? 'Received after the requested follow-up date' : 'Received in the open request workflow'],
  ];

  return {
    outcome: resolvedOutcome,
    status,
    receivedDate,
    responseCheckedAt: receivedDate,
    reason: incomplete
      ? 'Customer submitted paperwork, but a required field or page is missing. Open the document and review what is visible.'
      : late
        ? 'Customer paperwork arrived after the requested follow-up date. Open the source document and review it before continuing.'
        : 'Customer submitted the requested paperwork. Open the source document and review what it supports or leaves unresolved.',
    reviewerNotes: incomplete
      ? 'A real customer-submitted page is available, but the packet is incomplete and may require a follow-up request.'
      : late
        ? 'A complete customer-submitted page is available. Its late arrival is recorded separately from its contents.'
        : 'A complete customer-submitted page is available for investigator review.',
    sender: activeCase.person ?? 'Training customer',
    responseChannel: 'Customer secure upload',
    customerSubmission: {
      source: `${activeCase.person ?? 'Training customer'} · Customer secure upload`,
      reference: `CUS-${reference}`,
      summary: incomplete ? 'Customer document received with missing or cropped evidence.' : 'Customer document received for source-page review.',
      authenticity: incomplete ? 'Document received; completeness and image coverage require investigator review.' : 'Document received through the fictional secure upload channel; investigator review remains required.',
      extractionConfidence: incomplete ? 'Low' : 'High',
      fields,
      pages: [{ ...submittedPage, reference: `CUS-${reference}` }],
    },
  };
}
