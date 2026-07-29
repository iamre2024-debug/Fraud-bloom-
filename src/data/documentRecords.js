import { evidenceRecordsByCase } from './evidenceRecords.js';
import { getGeneratedAccessReportDocuments } from './accessHistoryReports.js';
import { getCustomer360Dossier } from './customer360Dossier.js';
import { getGeneratedBusiness360ReportDocuments } from './kybReviewReport.js';
import { getMerchantIntelligence } from './merchantIntelligenceRecords.js';

function valueOr(value, fallback) {
  return value || fallback;
}

function maskPhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 4 ? `(***) ***-${digits.slice(-4)}` : '(***) ***-0100';
}

function caseContext(activeCase = {}) {
  const person = valueOr(activeCase.person, 'Training Customer');
  const lastName = person.split(/\s+/).filter(Boolean).at(-1) ?? 'Customer';
  const contact = activeCase.customer?.contact ?? {};
  const business = valueOr(
    activeCase.profile?.business,
    activeCase.customer?.relationship?.find((item) => /business|employer|entity/i.test(item.label))?.value,
  );

  return {
    person,
    initials: person.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    address: valueOr(contact.address, `${valueOr(activeCase.intake?.customerLocation, 'Dallas, TX')} training address`),
    phone: valueOr(contact.phone, '(555) 010-0100'),
    email: valueOr(contact.email, `${person.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@training.example.test`),
    business: valueOr(business, `${lastName} Training Services LLC`),
    claimType: valueOr(activeCase.claimType, valueOr(activeCase.type, 'Training Review')),
    caseId: valueOr(activeCase.id, 'FA-TRAIN-00000'),
    accountId: valueOr(activeCase.accountId, 'ACCT-TRAIN-0000'),
    trainingId: valueOr(activeCase.trainingId, 'TRN-0000-00'),
    opened: valueOr(activeCase.reportedDate, valueOr(activeCase.opened, 'Jul 8, 2026')),
    amount: valueOr(activeCase.amount, '$0.00'),
  };
}

function page(title, subtitle, sections, options = {}) {
  return { title, subtitle, sections, ...options };
}

function section(title, rows = [], options = {}) {
  return { title, rows, ...options };
}

function documentRecord(context, input) {
  return {
    status: 'Received',
    reviewStatus: 'Pending Review',
    extractionConfidence: 'High',
    source: 'Secure customer upload',
    received: context.opened,
    updated: context.opened,
    customer: context.person,
    caseId: context.caseId,
    accountId: context.accountId,
    claimType: context.claimType,
    requestStatus: 'Received',
    authenticity: 'Document quality checks recorded; investigator review remains open.',
    investigatorNote: 'Compare the document fields with Customer 360 and the related source records.',
    requestEligible: true,
    ...input,
  };
}

function standardDocuments(activeCase) {
  const context = caseContext(activeCase);
  const dossier = getCustomer360Dossier(activeCase);
  const dateOfBirth = dossier.identity?.dob ?? 'Not supplied in the customer profile';
  const accountSuffix = String(context.trainingId).replace(/\D/g, '').slice(-4).padStart(4, '0');
  const einSuffix = String(context.caseId).replace(/\D/g, '').slice(-4).padStart(4, '0');

  const documents = [
    documentRecord(context, {
      id: `${context.caseId}-DOC-ID`,
      title: 'Driver License Review',
      type: 'Identity document',
      folder: 'Identity Documents',
      reference: `DL-${accountSuffix}-TX`,
      source: 'Application document upload',
      summary: 'Front and back identity-document images with extracted identity, address, expiration, and barcode fields.',
      trainingTip: 'Compare the document to profile, address, and selfie records. A clear image is one source, not a final identity determination.',
      relatedTools: ['Customer 360', 'Identity Intel / People Search', 'Document Request'],
      relatedEvidence: [context.trainingId, `${context.caseId}-ADDRESS`, `${context.caseId}-PHONE`],
      fields: [
        ['Name', context.person],
        ['Date of birth', dateOfBirth],
        ['Address', context.address],
        ['Document number', `TX-*****${accountSuffix}`],
        ['Issued', 'Sep 14, 2023'],
        ['Expires', 'Apr 18, 2031'],
        ['Document quality', 'Front and back images readable'],
        ['Machine-readable data', 'Barcode fields extracted'],
      ],
      pages: [
        page('Texas Driver License', 'FRONT IMAGE - FICTIONAL TRAINING DOCUMENT', [
          section('Identity fields', [['Name', context.person], ['DOB', dateOfBirth], ['Address', context.address], ['Class', 'C']]),
          section('Document dates', [['Issued', '09/14/2023'], ['Expires', '04/18/2031'], ['Document no.', `TX-*****${accountSuffix}`]]),
        ], { kind: 'identity-front', initials: context.initials }),
        page('Texas Driver License', 'BACK IMAGE - FICTIONAL TRAINING DOCUMENT', [
          section('Machine-readable fields', [['Barcode result', 'Decoded'], ['Name field', context.person], ['Address field', context.address], ['Document suffix', accountSuffix]]),
          section('Image review', [['Back image', 'Readable'], ['Cropping', 'All edges visible'], ['Resubmissions', 'None recorded']]),
        ], { kind: 'identity-back' }),
      ],
    }),
    documentRecord(context, {
      id: `${context.caseId}-DOC-BANK`,
      title: 'Bank Statement',
      type: 'Financial statement',
      folder: 'Financial Statements',
      reference: `STM-${accountSuffix}-0626`,
      source: 'Open-banking document upload',
      summary: 'Two-page statement showing ownership, statement period, balances, deposits, withdrawals, payroll, transfers, and returned-item activity.',
      trainingTip: 'Use statements to compare both stated income and account behavior. Confirm ownership, period completeness, and all pages.',
      relatedTools: ['Financial Investigation', 'Transaction History', 'Payment Verification', 'Document Request'],
      relatedEvidence: [`ACCT-****${accountSuffix}`, context.caseId],
      fields: [
        ['Statement period', 'Jun 1-Jun 30, 2026'],
        ['Account owner', context.person],
        ['Account', `Checking ****${accountSuffix}`],
        ['Beginning balance', '$4,218.44'],
        ['Deposits', '$6,842.10'],
        ['Withdrawals', '$5,906.32'],
        ['Average balance', '$4,701.86'],
        ['NSF / returned items', '1 recorded'],
        ['Pages received', '2 of 2'],
      ],
      pages: [
        page('Monthly Checking Statement', 'JUNE 1-JUNE 30, 2026', [
          section('Account owner', [['Customer', context.person], ['Mailing address', context.address], ['Account', `Everyday Checking ****${accountSuffix}`]]),
          section('Account summary', [['Beginning balance', '$4,218.44'], ['Deposits and credits', '$6,842.10'], ['Withdrawals and debits', '$5,906.32'], ['Ending balance', '$5,154.22'], ['Average balance', '$4,701.86']]),
          section('Deposit activity', [], { table: { columns: ['Date', 'Description', 'Amount'], rows: [['Jun 05', 'PAYROLL - TRAINING EMPLOYER', '$2,941.05'], ['Jun 14', 'TRANSFER FROM SAVINGS', '$960.00'], ['Jun 20', 'PAYROLL - TRAINING EMPLOYER', '$2,941.05']] } }),
        ], { kind: 'statement' }),
        page('Monthly Checking Statement', 'PAGE 2 OF 2 - ACCOUNT ACTIVITY', [
          section('Selected withdrawals', [], { table: { columns: ['Date', 'Description', 'Amount'], rows: [['Jun 07', 'RENT PAYMENT', '-$1,725.00'], ['Jun 12', 'UTILITY PAYMENT', '-$184.32'], ['Jun 18', 'ACH PAYMENT', '-$420.00'], ['Jun 27', 'CARD PURCHASES - GROUPED', '-$1,106.18']] } }),
          section('Account activity checks', [['Payroll deposits', 'Two recorded'], ['Transfers', 'One incoming transfer'], ['Overdrafts', 'None recorded'], ['NSF / returns', 'One returned item on Jun 23'], ['Page sequence', '2 of 2 received']]),
        ], { kind: 'statement' }),
      ],
    }),
    documentRecord(context, {
      id: `${context.caseId}-DOC-EIN`,
      title: 'EIN Assignment Notice',
      type: 'EIN paperwork',
      folder: 'Business & Tax',
      reference: `EIN-CP575-${einSuffix}`,
      source: 'Business onboarding upload',
      extractionConfidence: 'Medium',
      summary: 'Fictional EIN assignment notice with the masked tax identifier, legal entity, mailing address, and notice details.',
      trainingTip: 'Compare the legal entity, masked EIN, owners, address, state registration, and bank ownership across independent records.',
      relatedTools: ['Business 360', 'Identity Intel / People Search', 'Document Request'],
      relatedEvidence: [`SOS-${einSuffix}`, `EIN-**-***${einSuffix}`, context.caseId],
      fields: [
        ['Legal business name', context.business],
        ['Entity type', 'Limited liability company'],
        ['Masked EIN', `**-***${einSuffix}`],
        ['Responsible party', context.person],
        ['Business address', context.address],
        ['Notice type', 'CP 575 training facsimile'],
        ['Assignment date', 'Mar 12, 2022'],
        ['State standing', 'See linked Secretary of State record'],
      ],
      pages: [
        page('Internal Revenue Service', 'EIN ASSIGNMENT NOTICE - FICTIONAL TRAINING FACSIMILE', [
          section('Notice information', [['Notice', `CP 575-${einSuffix}`], ['Notice date', 'March 12, 2022'], ['Employer identification number', `**-***${einSuffix}`]]),
          section('Assigned entity', [['Legal name', context.business], ['Responsible party', context.person], ['Mailing address', context.address], ['Entity classification', 'Limited liability company']]),
          section('Notice text', [], { paragraphs: ['This fictional notice confirms the employer identification number assigned to the training entity shown above.', 'Use the exact legal name and EIN when comparing business registration, ownership, tax, payroll, and bank-account records.'] }),
        ], { kind: 'letter' }),
      ],
    }),
    documentRecord(context, {
      id: `${context.caseId}-DOC-TAX`,
      title: 'Tax Return Transcript',
      type: 'Tax document',
      folder: 'Business & Tax',
      reference: `TAX-TRN-2025-${einSuffix}`,
      source: 'Secure tax-document upload',
      extractionConfidence: 'Medium',
      summary: 'Fictional tax transcript for comparing reported identity, filing address, income, and business revenue support.',
      trainingTip: 'Tax records should be compared with bank deposits, payroll, invoices, employment, and stated application values.',
      relatedTools: ['Financial Investigation', 'Business 360', 'Employee Profile', 'Document Request'],
      relatedEvidence: [`TAX-2025-${einSuffix}`, `${context.caseId}-DOC-BANK`, context.trainingId],
      fields: [
        ['Tax period', 'Year ending Dec 31, 2025'],
        ['Taxpayer', context.person],
        ['Masked taxpayer ID', `***-**-${accountSuffix}`],
        ['Filing status', 'Single'],
        ['Address', context.address],
        ['Adjusted gross income', '$72,440.00'],
        ['Wages and salaries', '$68,930.00'],
        ['Business income', '$3,510.00'],
      ],
      pages: [
        page('Tax Return Transcript', 'TAX YEAR 2025 - FICTIONAL TRAINING RECORD', [
          section('Taxpayer information', [['Taxpayer', context.person], ['Taxpayer ID', `***-**-${accountSuffix}`], ['Filing status', 'Single'], ['Address', context.address]]),
          section('Income summary', [['Wages, salaries, tips', '$68,930.00'], ['Business income', '$3,510.00'], ['Adjusted gross income', '$72,440.00'], ['Taxable income', '$58,202.00']]),
          section('Transcript controls', [['Requested', 'Jul 2, 2026'], ['Received', context.opened], ['Pages', '1 of 1'], ['Consent reference', `CONSENT-${einSuffix}`]]),
        ], { kind: 'tax' }),
      ],
    }),
    documentRecord(context, {
      id: `${context.caseId}-DOC-ADDRESS`,
      title: 'Utility Bill - Proof of Address',
      type: 'Proof of address',
      folder: 'Address & Contact',
      reference: `UTIL-${accountSuffix}-0626`,
      source: 'Application document upload',
      summary: 'Utility statement used to compare the service address, mailing address, customer name, billing period, and account history.',
      trainingTip: 'Address evidence is strongest when compared with profile history, move dates, identity documents, and linked applications.',
      relatedTools: ['Customer 360', 'Identity Intel / People Search', 'Document Request'],
      relatedEvidence: [`ADDR-${accountSuffix}`, `${context.caseId}-DOC-ID`, context.trainingId],
      fields: [
        ['Customer name', context.person],
        ['Service address', context.address],
        ['Mailing address', context.address],
        ['Billing period', 'May 18-Jun 17, 2026'],
        ['Utility account', `******${accountSuffix}`],
        ['Amount due', '$184.32'],
        ['Service start', 'Aug 21, 2023'],
        ['Pages received', '1 of 1'],
      ],
      pages: [
        page('North Texas Utility Services', 'MONTHLY SERVICE STATEMENT - FICTIONAL TRAINING DOCUMENT', [
          section('Service account', [['Customer', context.person], ['Service address', context.address], ['Mailing address', context.address], ['Account', `******${accountSuffix}`]]),
          section('Billing summary', [['Billing period', 'May 18-Jun 17, 2026'], ['Previous balance', '$171.08'], ['Payments', '-$171.08'], ['Current charges', '$184.32'], ['Amount due', '$184.32']]),
          section('Service history', [['Service start', 'Aug 21, 2023'], ['Statement delivery', 'Electronic'], ['Disconnect notices', 'None recorded']]),
        ], { kind: 'utility' }),
      ],
    }),
    documentRecord(context, {
      id: `${context.caseId}-DOC-PHONE`,
      title: 'Phone Ownership Report',
      type: 'Phone verification',
      folder: 'Address & Contact',
      reference: `PHN-${accountSuffix}-RPT`,
      source: 'Phone verification provider',
      extractionConfidence: 'High',
      summary: 'Provider report containing masked phone, carrier, line type, activation age, ownership confidence, OTP history, and linked profiles.',
      trainingTip: 'Treat contact points as authentication controls. Compare ownership and line age with profile changes, MFA, and application history.',
      relatedTools: ['Customer 360', 'Identity Intel / People Search', 'Login History', 'Document Request'],
      relatedEvidence: [`PHONE-${accountSuffix}`, `${context.caseId}-DOC-ID`, context.trainingId],
      fields: [
        ['Phone number', maskPhone(context.phone)],
        ['Carrier', 'Training Wireless Network'],
        ['Line type', 'Mobile'],
        ['Activation age', '4 years, 7 months'],
        ['Ownership confidence', 'High provider match'],
        ['Profile first seen', 'Dec 9, 2021'],
        ['OTP events', '3 successful deliveries in review window'],
        ['Linked profiles', '1 training profile'],
      ],
      pages: [
        page('Phone Ownership Report', 'CONTACT VERIFICATION - FICTIONAL TRAINING REPORT', [
          section('Subscriber result', [['Phone', maskPhone(context.phone)], ['Subscriber', context.person], ['Carrier', 'Training Wireless Network'], ['Line type', 'Mobile'], ['Prepaid / VOIP', 'No provider indicator recorded']]),
          section('Line history', [['Activation age', '4 years, 7 months'], ['Profile first seen', 'Dec 9, 2021'], ['Ownership confidence', 'High provider match'], ['Linked profiles', '1 training profile']]),
          section('OTP delivery history', [], { table: { columns: ['Date', 'Route', 'Result'], rows: [['Jul 08', 'SMS ending ' + accountSuffix, 'Delivered'], ['Jun 30', 'SMS ending ' + accountSuffix, 'Delivered'], ['Jun 14', 'SMS ending ' + accountSuffix, 'Delivered']] } }),
        ], { kind: 'phone' }),
      ],
    }),
  ];
  const tools = new Set(activeCase.availableTools ?? []);
  const includedIds = new Set();
  if (tools.has('Customer 360') || tools.has('Identity Intel / People Search')) {
    includedIds.add(`${context.caseId}-DOC-ID`);
    includedIds.add(`${context.caseId}-DOC-ADDRESS`);
    includedIds.add(`${context.caseId}-DOC-PHONE`);
  }
  if (tools.has('Financial Investigation') || /credit|loan/i.test(activeCase.claimTypeId ?? activeCase.type ?? '')) {
    includedIds.add(`${context.caseId}-DOC-BANK`);
  }
  if (tools.has('Business 360')) {
    includedIds.add(`${context.caseId}-DOC-EIN`);
    includedIds.add(`${context.caseId}-DOC-TAX`);
  }
  if (tools.has('Employee Profile') || tools.has('Payroll History')) {
    includedIds.add(`${context.caseId}-DOC-BANK`);
    includedIds.add(`${context.caseId}-DOC-TAX`);
  }
  return documents.filter((document) => includedIds.has(document.id));
}

function legacyCaseDocuments(activeCase) {
  const context = caseContext(activeCase);
  const sourceDocuments = evidenceRecordsByCase[context.caseId]?.documents
    ?? activeCase.toolResults?.documents
    ?? activeCase.documentRequests
    ?? activeCase.documents
    ?? [];

  return sourceDocuments.map((item, index) => {
    const hasDocumentPage = !['Requested', 'Missing', 'Expired', 'Rejected'].includes(item.status);
    return documentRecord(context, {
    id: item.id ?? `${context.caseId}-DOC-CASE-${index + 1}`,
    title: item.title ?? item.name ?? `Case document ${index + 1}`,
    type: item.category ?? 'Case document',
    folder: 'Case Documents',
    reference: item.id ?? `${context.caseId}-CASE-${index + 1}`,
    status: hasDocumentPage ? item.status ?? 'Available' : 'Not Requested',
    reviewStatus: hasDocumentPage ? 'Pending Review' : 'Not received',
    requestStatus: hasDocumentPage ? item.status ?? 'Available' : 'Not Requested',
    source: item.source ?? 'Case packet',
    received: hasDocumentPage ? item.updated ?? context.opened : 'Not received',
    updated: item.updated ?? context.opened,
    extractionConfidence: hasDocumentPage ? 'Medium' : 'Not available',
    authenticity: hasDocumentPage ? 'Document available for investigator review.' : 'Document has not been received.',
    summary: item.preview ?? item.detail ?? 'Case-scoped training document.',
    investigatorNote: 'Compare this case document with the source tool and the active claim timeline.',
    trainingTip: 'Case documents support the investigation only when their source, timing, completeness, and linked records are documented.',
    relatedTools: ['Document Request', 'Timeline'],
    relatedEvidence: [context.caseId],
    fields: [
      ['Document ID', item.id ?? `${context.caseId}-CASE-${index + 1}`],
      ['Document status', item.status ?? 'Available'],
      ['Document category', item.category ?? 'Case document'],
      ['Field inventory', item.fields ?? 'Case ID and document status'],
    ],
    pages: hasDocumentPage ? [
      page(item.title ?? item.name ?? `Case document ${index + 1}`, 'CASE PACKET COPY - FICTIONAL TRAINING DOCUMENT', [
        section('Document summary', [['Case', context.caseId], ['Customer', context.person], ['Review workflow', context.claimType], ['Status', item.status ?? 'Available']]),
        section('Packet details', [], { paragraphs: [item.preview ?? item.detail ?? 'Case-scoped training document.', `Fields: ${item.fields ?? 'Case ID and document status'}`] }),
      ], { kind: 'case' }),
    ] : [],
    });
  });
}

function merchantSourceDocument(context, document) {
  const customerEvidence = /-CUS-/i.test(document.id) || /CUSTOMER/i.test(document.classification ?? '');
  const networkEvidence = /-NET-/i.test(document.id) || /NETWORK/i.test(document.classification ?? '');
  const hasDocumentPage = ['Available', 'Received'].includes(document.status);
  const fields = [
    ['Reference', document.reference ?? document.id],
    ['Document date', document.date ?? context.opened],
    ['Source', document.source ?? 'Chargeback exchange'],
    ['Classification', document.classification ?? 'SOURCE DOCUMENT'],
    ...(document.facts ?? []),
  ];
  const sections = [];
  if (document.subject) sections.push(section('Document subject', [['Subject', document.subject], ...(document.to ? [['To', document.to]] : [])]));
  if (document.paragraphs?.length) sections.push(section('Statement', [], { paragraphs: document.paragraphs }));
  if (document.facts?.length) sections.push(section('Recorded fields', document.facts));
  for (const table of document.tables ?? []) sections.push(section(table.title ?? 'Source record', [], { table: { columns: table.columns, rows: table.rows } }));
  if (document.callout) sections.push(section(document.callout.label, [], { paragraphs: [document.callout.value] }));
  if (document.signature) sections.push(section('Submitted by', [['Name', document.signature.name], ['Role', document.signature.role]]));

  return documentRecord(context, {
    id: document.id,
    title: document.title,
    type: document.classification ?? 'Chargeback source document',
    folder: customerEvidence ? 'Customer Evidence' : networkEvidence ? 'Network Exchange' : 'Merchant Evidence',
    reference: document.reference ?? document.id,
    status: hasDocumentPage ? document.status : 'Not Requested',
    reviewStatus: hasDocumentPage ? 'Pending Review' : 'Not received',
    requestStatus: hasDocumentPage ? 'Received' : 'Not Requested',
    source: document.source ?? 'Chargeback exchange',
    received: hasDocumentPage ? document.date ?? context.opened : 'Not received',
    updated: document.date ?? context.opened,
    extractionConfidence: hasDocumentPage ? 'High' : 'Not available',
    authenticity: hasDocumentPage ? 'Source-format training document available for investigator review.' : 'The requested source document has not been received.',
    summary: document.paragraphs?.[0] ?? document.subject ?? `${document.title} from ${document.source ?? 'the chargeback exchange'}.`,
    investigatorNote: 'Review the source document itself and compare its dates, fields, and position with the opposing party records.',
    trainingTip: 'A party statement is evidence to compare; it is not the case decision.',
    relatedTools: ['Merchant Intelligence', 'Timeline', ...(customerEvidence ? ['Document Request'] : [])],
    relatedEvidence: [context.caseId, document.reference ?? document.id],
    requestEligible: customerEvidence,
    fields,
    pages: hasDocumentPage ? [page(document.brand ?? document.source ?? document.title, document.classification ?? 'CHARGEBACK SOURCE DOCUMENT', sections.length ? sections : [section('Document fields', fields)], { kind: document.kind ?? 'case' })] : [],
  });
}

function chargebackSourceDocuments(activeCase) {
  const context = caseContext(activeCase);
  const workspace = getMerchantIntelligence(activeCase);
  const documents = [...workspace.network.documents, ...workspace.response.documents, ...workspace.customerDocuments];
  return documents
    .filter((document, index) => documents.findIndex((candidate) => candidate.id === document.id) === index)
    .map((document) => merchantSourceDocument(context, document));
}

export function getCaseDocuments(activeCase = {}) {
  const chargeback = ['unauthorized-card-transaction-claim', 'merchant-non-fraud-dispute'].includes(
    activeCase.workflowType ?? activeCase.claimTypeId,
  )
    || Boolean(activeCase.chargebackDecision);
  const combined = chargeback
    ? chargebackSourceDocuments(activeCase)
    : [...standardDocuments(activeCase), ...getGeneratedAccessReportDocuments(activeCase), ...getGeneratedBusiness360ReportDocuments(activeCase), ...legacyCaseDocuments(activeCase)];
  return combined.filter((item, index) => combined.findIndex((candidate) => candidate.id === item.id) === index);
}

export function getCaseDocumentRequests(activeCase = {}) {
  return getCaseDocuments(activeCase).filter((document) => document.requestEligible !== false);
}

export function documentSearchText(document) {
  return [
    document.id,
    document.title,
    document.type,
    document.folder,
    document.reference,
    document.status,
    document.reviewStatus,
    document.source,
    document.customer,
    document.caseId,
    document.accountId,
    document.claimType,
    document.requestStatus,
    document.summary,
    document.authenticity,
    ...(document.fields ?? []).flat(),
    ...(document.relatedEvidence ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}
