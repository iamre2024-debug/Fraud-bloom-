import { buildCaseBriefingPacket } from './caseBriefingDetails.js';
import { buildCaseIntakeAnswers } from './intakeAnswers.js';
import { systemAccessRecordsByCase } from './systemAccessRecords.js';
import {
  CASE_DOMAIN_VERSION,
  caseDomainLabels,
  filterToolsForCaseDomain,
  hasOwnershipLinkedBusinessRelationship,
} from './caseDomain.js';
import { containsHiddenAnswer } from './publicCaseView.js';

const deviceIds = {
  'FA-ATO-24018': { 'iPhone 16': 'DEV-MAYA-IP16-001', 'Chrome Mobile': 'DEV-MAYA-CHRM-002' },
  'FA-CB-24007': { 'Android phone': 'DEV-JORDAN-AND-001', 'Desktop Chrome': 'DEV-JORDAN-DSK-002' },
  'FA-CR-24003': { 'Mobile Safari': 'DEV-AVERY-SAF-001' },
};

const caseIntake = {
  'FA-ATO-24018': {
    claimId: 'CLM-ATO-24018',
    transactionInfo: 'Northstar Digital Market · card not present · debit card ending 4410',
    shortSummary: 'Long-tenured customer disputed a card-not-present purchase. Access, device, IP, session, transaction, and document records are available for neutral review.',
    intakeAnswers: [
      { id: 'FA-ATO-24018-INT-1', prompt: 'What account activity does the customer say they did not authorize?', answer: 'Maya Sterling states she did not authorize the $742.18 card-not-present purchase at Northstar Digital Market on debit card ending 4410 and was home when it occurred.' },
      { id: 'FA-ATO-24018-INT-2', prompt: 'Which alerts, reset messages, or contact attempts were noticed?', answer: 'Two failed password attempts were recorded at 7:58 AM and 8:00 AM. The recovery email changed at 8:07 AM, security-alert delivery changed at 8:09 AM, and Maya contacted the bank by secure message with phone follow-up at 10:58 AM.' },
      { id: 'FA-ATO-24018-INT-3', prompt: 'Which devices and locations does the customer recognize?', answer: 'Maya identified her personal iPhone and Dallas, TX at intake. The packet shows successful iPhone 16 activity in Dallas and Irving plus Chrome Mobile activity in Dallas tied to the earlier login and profile-change sequence.' },
    ],
    parties: [
      { id: 'FA-ATO-24018-PTY-1', role: 'Account holder', name: 'Maya Sterling', relationship: 'Customer who submitted the active claim', source: 'Case intake' },
      { id: 'FA-ATO-24018-PTY-2', role: 'Merchant / payee', name: 'Northstar Digital Market', relationship: 'Merchant tied to the disputed card activity', source: 'Transaction record' },
    ],
    relationshipExtras: [
      { label: 'Relationship age', value: 'Customer since 2018' },
      { label: 'Known device pattern', value: 'Repeated iPhone 16 and occasional Chrome Mobile access' },
      { label: 'Recent contact pattern', value: 'Secure message and phone follow-up' },
    ],
    profileExtras: [
      { id: 'PCH-1004', date: 'Jun 14, 2026', time: '7:26 PM', eventType: 'Statement preference change', item: 'Statement delivery updated', oldValue: 'Paper statement', newValue: 'Electronic statement', channel: 'Mobile app', source: 'Customer profile', user: 'Maya Sterling', device: 'DEV-MAYA-IP16-001', ip: '198.51.100.40', session: 'SES-7421', mfaMethod: 'Face ID', notes: 'Routine historical maintenance outside the active claim window.', detail: 'Statement delivery changed from paper to electronic delivery.' },
      { id: 'PCH-1005', date: 'May 22, 2026', time: '12:18 PM', eventType: 'Transfer preference change', item: 'Standing transfer nickname updated', oldValue: 'Savings transfer', newValue: 'Monthly reserve', channel: 'Mobile web', source: 'Financial profile', user: 'Maya Sterling', device: 'DEV-MAYA-CHRM-002', ip: '198.51.100.13', session: 'SES-7014', mfaMethod: 'Password', notes: 'Nickname-only maintenance; destination and transfer amount did not change.', detail: 'The nickname on an existing internal savings transfer was updated.' },
      { id: 'PCH-1006', date: 'Apr 9, 2026', time: '9:51 AM', eventType: 'Address verification', item: 'Physical address confirmed', oldValue: '1842 Cedar Avenue, Dallas, TX', newValue: '1842 Cedar Avenue, Dallas, TX', channel: 'Mobile app', source: 'Customer profile', user: 'Maya Sterling', device: 'DEV-MAYA-IP16-001', ip: '198.51.100.38', session: 'SES-6602', mfaMethod: 'Face ID', notes: 'Verification retained the existing address.', detail: 'The physical address was confirmed without a value change.' },
      { id: 'PCH-1007', date: 'Jan 18, 2026', time: '2:42 PM', eventType: 'Card maintenance', item: 'Debit card replaced', oldValue: 'Debit card ••••1180', newValue: 'Debit card ••••4410', channel: 'Phone servicing', source: 'Card servicing', user: 'Servicing agent AGT-TRN-14', device: 'Agent workstation', ip: 'Internal training network', session: 'SRV-1007', mfaMethod: 'Customer verification questions', notes: 'Historical replacement predates the active claim window.', detail: 'A replacement debit card was issued through a documented servicing interaction.' },
    ],
    identityExtras: [
      { id: 'IDR-1005', type: 'Known device object', value: 'DEV-MAYA-IP16-001', lastSeen: 'Jul 8, 2026', history: 'Same iPhone device appears across multiple successful logins.' },
      { id: 'IDR-1006', type: 'Secondary device object', value: 'DEV-MAYA-CHRM-002', lastSeen: 'Jul 8, 2026', history: 'Chrome Mobile appears as an occasional known access object.' },
    ],
    loginExtras: [
      { id: 'LOG-1007', time: 'Jul 8, 7:58 AM', eventType: 'Failed authentication', method: 'Password', mfaStatus: 'MFA not reached', authChannel: 'Mobile web', operatingSystem: 'Android 15', browserSource: 'Chrome Mobile', device: 'Chrome Mobile', location: 'Dallas, TX', ip: '198.51.100.11', session: 'No session created', result: 'Failed', failedAttemptCount: 1, accountLockout: 'No lockout recorded', logoutStatus: 'No session created' },
      { id: 'LOG-1006', time: 'Jul 8, 8:00 AM', eventType: 'Failed authentication', method: 'Password', mfaStatus: 'MFA not reached', authChannel: 'Mobile web', operatingSystem: 'Android 15', browserSource: 'Chrome Mobile', device: 'Chrome Mobile', location: 'Dallas, TX', ip: '198.51.100.11', session: 'No session created', result: 'Failed', failedAttemptCount: 2, accountLockout: 'No lockout recorded', logoutStatus: 'No session created' },
      { id: 'LOG-0981', time: 'Jun 14, 7:24 PM', method: 'Face ID', device: 'iPhone 16', location: 'Dallas, TX', ip: '198.51.100.40', session: 'SES-7421', result: 'Successful' },
      { id: 'LOG-0980', time: 'Jun 14, 7:20 PM', eventType: 'Account lockout', method: 'Password', mfaStatus: 'MFA not reached', authChannel: 'Mobile app', operatingSystem: 'iOS 18', browserSource: 'Bank app / Mobile Safari webview', device: 'iPhone 16', location: 'Dallas, TX', ip: '198.51.100.40', session: 'No session created', result: 'Account locked', failedAttemptCount: 3, accountLockout: 'Temporary lockout recorded', logoutStatus: 'No session created' },
      { id: 'LOG-0954', time: 'May 22, 12:13 PM', method: 'Password', device: 'Chrome Mobile', location: 'Dallas, TX', ip: '198.51.100.13', session: 'SES-7014', result: 'Successful' },
      { id: 'LOG-0928', time: 'Apr 9, 9:48 AM', method: 'Face ID', device: 'iPhone 16', location: 'Dallas, TX', ip: '198.51.100.38', session: 'SES-6602', result: 'Successful' },
    ],
    eventExtras: [
      { id: 'EVT-1002', time: 'Jun 14, 7:25 PM', label: 'Statement settings viewed', detail: 'Known iPhone 16 / Dallas area / no change recorded', chip: 'History', object: 'Profile' },
      { id: 'EVT-1018', time: 'Jul 8, 10:58 AM', label: 'Customer statement received', detail: 'Secure message and phone follow-up opened the case packet', chip: 'Intake', object: 'Document' },
    ],
    documentExtras: [
      { id: 'DOC-444', status: 'Available', name: 'Access history packet', detail: 'Login, device, session, and IP records grouped for review' },
    ],
    linkExtras: ['Session', 'Document'],
  },
  'FA-CB-24007': {
    claimId: 'CLM-CB-24007',
    transactionInfo: 'StreamBox Premium · recurring card billing · credit card ending 8841',
    shortSummary: 'Cardholder reports recurring billing after cancellation. Review merchant billing history, customer statement, session activity, and requested document status.',
    intakeAnswers: [
      { id: 'FA-CB-24007-INT-1', prompt: 'What did the customer purchase, cancel, return, or ask the merchant to refund?', answer: 'Jordan Ellis states the StreamBox Premium subscription was canceled through account settings on Jul 2, 2026, but the merchant billed $189.44 to credit card ending 8841 on Jul 8, 2026.' },
      { id: 'FA-CB-24007-INT-2', prompt: 'When did the customer first notice the billing issue?', answer: 'The recurring-billing issue begins May 8, 2026. The current $189.44 charge posted Jul 8, 2026, and Jordan opened the mobile-app dispute form at 8:19 AM.' },
      { id: 'FA-CB-24007-INT-3', prompt: 'What contact has already occurred with the merchant?', answer: 'The customer reports using StreamBox account settings on mobile web on Jul 2, 2026. No confirmation number or written acknowledgement was attached, and the merchant later reported that no completed cancellation request was located.' },
      { id: 'FA-CB-24007-INT-4', prompt: 'Which receipt, policy, delivery, return, or refund records are available?', answer: 'The customer dispute form and merchant billing packet are available. Cancellation confirmation remains requested, and no separate return, delivery, or refund record is listed for this subscription claim.' },
      { id: 'FA-CB-24007-INT-5', prompt: 'Which dispute reason and required evidence should be documented?', answer: 'The dispute reason is canceled service billed. The customer dispute form and current/prior merchant billing records are available; cancellation confirmation remains the required open evidence.' },
    ],
    parties: [
      { id: 'FA-CB-24007-PTY-1', role: 'Cardholder', name: 'Jordan Ellis', relationship: 'Customer who submitted the billing dispute', source: 'Dispute intake' },
      { id: 'FA-CB-24007-PTY-2', role: 'Subscription merchant', name: 'StreamBox Premium', relationship: 'Merchant tied to the recurring billing records', source: 'Merchant billing packet' },
    ],
    relationshipExtras: [
      { label: 'Relationship age', value: 'Customer since 2021' },
      { label: 'Known device pattern', value: 'Android phone primary, Desktop Chrome occasional' },
    ],
    profileExtras: [
      { id: 'PCH-2204', date: 'Jun 8, 2026', time: '8:41 AM', eventType: 'Autopay preference change', item: 'Autopay notice timing updated', oldValue: '3 days before payment', newValue: '5 days before payment', channel: 'Mobile app', source: 'Card profile maintenance', user: 'Jordan Ellis', device: 'DEV-JORDAN-AND-001', ip: '203.0.113.16', session: 'SES-4018', mfaMethod: 'Biometric', notes: 'Notification timing changed; the payment destination did not change.', detail: 'Autopay reminder timing was updated in card-profile settings.' },
      { id: 'PCH-2205', date: 'May 8, 2026', time: '9:15 AM', eventType: 'Contact preference change', item: 'Preferred contact changed', oldValue: 'Email', newValue: 'Mobile app', channel: 'Mobile app', source: 'Customer profile', user: 'Jordan Ellis', device: 'DEV-JORDAN-AND-001', ip: '203.0.113.14', session: 'SES-3880', mfaMethod: 'Biometric', notes: 'Historical communication preference change.', detail: 'The preferred service-contact channel changed from email to mobile app.' },
    ],
    identityExtras: [
      { id: 'IDR-2205', type: 'Known device object', value: 'DEV-JORDAN-AND-001', lastSeen: 'Jul 8, 2026', history: 'Android phone appears across mobile app dispute and statement review activity.' },
      { id: 'IDR-2206', type: 'Secondary device object', value: 'DEV-JORDAN-DSK-002', lastSeen: 'Jun 21, 2026', history: 'Desktop Chrome appears in older profile activity.' },
    ],
    loginExtras: [
      { id: 'LOG-2205', time: 'Jul 8, 8:17 AM', eventType: 'Failed authentication', method: 'Password', mfaStatus: 'MFA not reached', authChannel: 'Mobile app', operatingSystem: 'Android 15', browserSource: 'Mobile app / Chrome WebView', device: 'Android phone', location: 'Fort Worth, TX', ip: '203.0.113.24', session: 'No session created', result: 'Failed', failedAttemptCount: 1, accountLockout: 'No lockout recorded', logoutStatus: 'No session created' },
      { id: 'LOG-2178', time: 'Jun 8, 8:36 AM', method: 'Biometric', device: 'Android phone', location: 'Fort Worth, TX', ip: '203.0.113.16', session: 'SES-4018', result: 'Successful' },
      { id: 'LOG-2142', time: 'May 8, 9:11 AM', method: 'Biometric', device: 'Android phone', location: 'Fort Worth, TX', ip: '203.0.113.14', session: 'SES-3880', result: 'Successful' },
    ],
    eventExtras: [
      { id: 'EVT-2142', time: 'May 8, 9:12 AM', label: 'Earlier merchant charge located', detail: '$179.44 / subscription merchant / prior cycle', chip: 'History', object: 'Transaction' },
      { id: 'EVT-2178', time: 'Jun 8, 8:36 AM', label: 'Prior merchant charge viewed', detail: '$189.44 / subscription merchant / statement activity', chip: 'History', object: 'Transaction' },
    ],
    documentExtras: [
      { id: 'DOC-512', status: 'Available', name: 'Merchant billing packet', detail: 'Current and prior billing records grouped for review' },
    ],
    linkExtras: ['Document', 'Device'],
  },
  'FA-CR-24003': {
    claimId: 'CLM-CR-24003',
    transactionInfo: '$2,400 personal credit-line draw request · payment setup packet · Destination ID token',
    shortSummary: 'A $2,400 draw was requested from a personal line of credit opened the previous day, five minutes after a new external payment destination was added. Review identity, payment setup, session activity, and the limited account history before submitting a final package.',
    intakeAnswers: [
      { id: 'FA-CR-24003-INT-1', prompt: 'What type of credit request or account review opened this case?', answer: 'A system alert opened a credit-line draw review after the account requested $2,400.00 from an $8,000.00 personal line of credit opened the previous day. External destination DST-7740 had been added five minutes before the request.' },
      { id: 'FA-CR-24003-INT-2', prompt: 'What employer, income source, gross/net income, or business revenue was stated?', answer: 'The stated employer is Lakeside Office Supply. The linked checking history shows payroll deposits of $1,280.00 on Jul 1, $1,280.00 on Jun 17, and a $1,240.00 mobile check deposit on Jun 8; no separate gross/net income figure is recorded.' },
      { id: 'FA-CR-24003-INT-3', prompt: 'What payment, utilization, NSF, late-payment, or cash-flow history is available?', answer: 'The $2,400.00 request equals 30% of the $8,000.00 line. Monthly deposits are $3,800.00, monthly outflow is $2,240.00, one returned item is recorded, DST-7740 is the first external destination, and no cash advance or transfer has posted.' },
      { id: 'FA-CR-24003-INT-4', prompt: 'Are bank statements, paystubs, credit-file, or business documents available?', answer: 'The system alert packet and account setup record are available. The supporting bank-statement activity is summarized in Financial Investigation; payment verification detail remains requested, and no paystub or business document is attached.' },
      { id: 'FA-CR-24003-INT-5', prompt: 'What debt obligations, bankruptcy/public-record, or business changes should be documented?', answer: 'No debt-obligation, bankruptcy, or public-record result is included in this new consumer packet. The documented change is the addition of DST-7740 immediately before the $2,400.00 credit-line draw request.' },
      { id: 'FA-CR-24003-INT-6', prompt: 'Which documents and verification records are still needed?', answer: 'Payment verification detail remains requested. Ownership of Bank Code BC-204 and Destination ID DST-7740, the partial name match to Avery Brooks, and the pending callback must be resolved and documented.' },
    ],
    profile: { employer: 'Lakeside Office Supply', entityRole: 'Credit applicant' },
    parties: [
      { id: 'FA-CR-24003-PTY-1', role: 'Credit applicant', name: 'Avery Brooks', relationship: 'Applicant tied to the new credit relationship', source: 'Credit profile' },
      { id: 'FA-CR-24003-PTY-2', role: 'Employer', name: 'Lakeside Office Supply', relationship: 'Employer listed during profile setup', source: 'Relationship record' },
    ],
    relationshipExtras: [
      { label: 'Relationship age', value: 'New profile created Jul 7, 2026' },
      { label: 'Known device pattern', value: 'Mobile Safari only so far' },
    ],
    profileExtras: [
      { id: 'PCH-3304', date: 'Jul 7, 2026', time: '5:12 PM', eventType: 'MFA enrollment', item: 'Email code MFA enrolled', oldValue: 'No MFA route', newValue: 'avery.training@example.test', channel: 'Mobile web', source: 'Identity setup', user: 'Avery Brooks', device: 'DEV-AVERY-SAF-001', ip: '192.0.2.21', session: 'SES-9094', mfaMethod: 'Initial email code', notes: 'Initial enrollment event; compare with later login methods and recovery-contact setup.', detail: 'Email-code authentication was enrolled during profile creation.' },
    ],
    identityExtras: [
      { id: 'IDR-3305', type: 'Device object', value: 'DEV-AVERY-SAF-001', lastSeen: 'Jul 8, 2026', history: 'Only observed device object in early account history.' },
    ],
    loginExtras: [
      { id: 'LOG-3315', time: 'Jul 8, 7:41 AM', eventType: 'Failed authentication', method: 'Password', mfaStatus: 'MFA not reached', authChannel: 'Mobile web', operatingSystem: 'iOS 18', browserSource: 'Mobile Safari', device: 'Mobile Safari', location: 'Arlington, TX', ip: '192.0.2.44', session: 'No session created', result: 'Failed', failedAttemptCount: 1, accountLockout: 'No lockout recorded', logoutStatus: 'No session created' },
      { id: 'LOG-3298', time: 'Jul 7, 5:05 PM', method: 'Password setup', device: 'Mobile Safari', location: 'Arlington, TX', ip: '192.0.2.21', session: 'SES-9094', result: 'Successful' },
    ],
    eventExtras: [
      { id: 'EVT-3298', time: 'Jul 7, 5:05 PM', label: 'Password setup recorded', detail: 'Mobile Safari / new profile setup / early account history', chip: 'Identity', object: 'Profile' },
    ],
    documentExtras: [
      { id: 'DOC-622', status: 'Available', name: 'Account setup record', detail: 'Profile creation and early session records grouped for review' },
    ],
    linkExtras: ['Device', 'IP'],
  },
};

const claimContext = {
  'FA-ATO-24018': { claimTypeId: 'account-takeover', scenarioId: 'ato-phishing-wallet', subtype: 'phishing', reportedDate: 'Jul 8, 2026', issueStartDate: 'Jul 8, 2026', statement: 'I did not authorize this card purchase and was home when the transaction occurred.' },
  'FA-CB-24007': { claimTypeId: 'non-fraud-chargeback', scenarioId: 'ncb-recurring-cancellation', subtype: 'canceled service billed', reportedDate: 'Jul 8, 2026', issueStartDate: 'May 8, 2026', statement: 'I canceled the subscription and continued to see the same charge on my card statement.' },
  'FA-CR-24003': { claimTypeId: 'credit-risk', scenarioId: 'cr-first-party-credit-abuse', subtype: 'personal credit-line draw request', reportedDate: 'Jul 8, 2026', issueStartDate: 'Jul 7, 2026', statement: 'I recently opened the account and requested a $2,400 draw from the available credit line.' },
};

function dedupeById(records = []) {
  const seen = new Set();
  return records.filter((record) => {
    if (!record?.id || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

function dedupeStrings(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function accountIdForCase(item) {
  if (String(item.accountId ?? '').trim()) return String(item.accountId).trim();
  const source = item.id ?? item.caseId ?? item.trainingId ?? 'CASE';
  const token = String(source)
    .toUpperCase()
    .replace(/^FA-/, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `ACCT-${token || 'CASE'}`;
}

function relationshipWithAccountId(customer = {}, accountId, extras = []) {
  return [
    { label: 'Account ID', value: accountId },
    ...(customer.relationship ?? []).filter((entry) => entry.label !== 'Account ID'),
    ...extras,
  ];
}

function addDeviceIds(caseId, rows = []) {
  const map = deviceIds[caseId] ?? {};
  return rows.map((row) => ({ ...row, deviceId: row.deviceId ?? map[row.device] ?? `DEV-${String(row.device).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18)}` }));
}

function buildClaimFields(item, context = {}) {
  const claimType = getClaimTypeForCase({ ...item, claimTypeId: context.claimTypeId ?? item.claimTypeId });
  const scenario = getScenario(claimType.id, context.scenarioId ?? item.scenarioId);
  const customerType = item.customerType ?? claimType.customerType;
  const productType = item.productType ?? claimType.productType;
  const workflowType = item.workflowType ?? claimType.workflowType ?? claimType.id;
  const domain = {
    customerType,
    productType,
    workflowType,
    hasLinkedBusinessRelationship: item.hasLinkedBusinessRelationship,
    businessRelationships: item.businessRelationships,
    linkedBusinesses: item.linkedBusinesses,
    customer: item.customer,
    toolResults: item.toolResults,
    relationshipAccounts: item.relationshipAccounts,
    hasPayrollRelationship: item.hasPayrollRelationship,
  };
  const domainLabels = caseDomainLabels(domain);
  const reportedDate = item.reportedDate ?? context.reportedDate ?? item.opened;
  const issueStartDate = item.issueStartDate ?? context.issueStartDate ?? reportedDate;
  const legacyStatement = item.statement?.value ?? context.statement ?? item.reportedAllegation ?? item.allegation;
  const statementValue = containsHiddenAnswer(legacyStatement)
    ? scenario.reportedAllegation ?? scenario.statement
    : legacyStatement ?? scenario.statement;
  const alertReason = item.alertReason && !containsHiddenAnswer(item.alertReason) ? item.alertReason : scenario.alertReason;
  const reportedAllegation = item.reportedAllegation && !containsHiddenAnswer(item.reportedAllegation)
    ? item.reportedAllegation
    : scenario.reportedAllegation ?? statementValue;
  const caseOriginType = item.caseOriginType ?? scenario.caseOriginType;
  const caseOrigin = item.caseOrigin ?? scenario.caseOrigin ?? item.intake?.channel ?? 'Case queue';
  const caseEscalationReason = item.caseEscalationReason && !containsHiddenAnswer(item.caseEscalationReason)
    ? item.caseEscalationReason
    : scenario.caseEscalationReason ?? item.queueReason ?? reportedAllegation;
  const alertHandlingNote = item.alertHandlingNote && !containsHiddenAnswer(item.alertHandlingNote)
    ? item.alertHandlingNote
    : scenario.alertHandlingNote ?? 'The intake record is a review trigger, not a finding. Evidence must support the determination.';
  const statementLabel = item.statement?.label
    ?? (/credit|application/i.test(claimType.id) ? 'Applicant statement' : item.intake?.channel === 'System alert' ? 'Reported alert' : 'Reported allegation');
  const intakeAnswers = item.intakeAnswers?.length ? item.intakeAnswers : buildCaseIntakeAnswers({
    caseId: item.id,
    prompts: claimType.intakePrompts,
    statement: statementValue,
    person: item.person,
    entityRole: item.profile?.entityRole,
    business: item.profile?.business,
    employer: item.profile?.employer,
    city: item.intake?.customerLocation,
    channel: item.intake?.channel ?? 'Case queue',
    statedDevice: item.intake?.statedDevice,
    reportedDate,
    issueStartDate,
    subtype: item.subtype ?? context.subtype ?? scenario.subtype,
    transactionInfo: item.transactionInfo ?? scenario.transactionInfo,
    amount: item.amountExposure ?? item.amount,
    documents: item.documents,
    toolResults: item.toolResults,
    loginHistory: item.loginHistory,
    profileChanges: item.customer?.profileChanges,
    customer: item.customer,
    customerType,
    productType,
    workflowType,
  });
  const briefingPacket = buildCaseBriefingPacket({
    item: {
      ...item,
      customerType,
      productType,
      workflowType,
      alertReason,
      reportedAllegation,
    },
    claimType,
    scenario,
    reportedDate,
  });
  const availableToolCandidates = item.availableTools ?? claimType.availableTools;
  const availableTools = filterToolsForCaseDomain(
    hasOwnershipLinkedBusinessRelationship(domain)
      ? dedupeStrings([...availableToolCandidates, 'Business 360'])
      : availableToolCandidates,
    domain,
  );
  const caseAvailableTools = systemAccessRecordsByCase[item.id]?.length && !claimType.chargeback
    ? filterToolsForCaseDomain(dedupeStrings([...availableTools, 'System Access Lane']), domain)
    : availableTools;
  const requiredTools = filterToolsForCaseDomain(
    item.requiredTools ?? claimType.requiredTools,
    domain,
  );
  const responseStatus = item.merchantResponse?.status ?? item.toolResults?.merchantIntelligence?.response?.status;
  const workflowStatus = claimType.chargeback
    ? responseStatus === 'Accepted'
      ? 'Merchant accepted — account credit review'
      : responseStatus === 'Challenged'
        ? 'Merchant challenged — customer evidence pending'
        : responseStatus === 'Pending'
          ? 'Submitted — merchant response pending'
          : 'Claim received — network submission pending'
    : item.status;

  return {
    domainSchemaVersion: item.domainSchemaVersion ?? CASE_DOMAIN_VERSION,
    customerType,
    customerTypeLabel: domainLabels.customerTypeLabel,
    productType,
    productTypeLabel: domainLabels.productTypeLabel,
    workflowType,
    workflowTypeLabel: domainLabels.workflowTypeLabel,
    alertReason,
    reportedAllegation,
    caseOriginType,
    caseOrigin,
    caseEscalationReason,
    alertHandlingNote,
    suspectedPatterns: [],
    operationalDecision: item.operationalDecision ?? null,
    finalFinding: item.finalFinding ?? null,
    findingBasis: item.findingBasis ?? '',
    claimTypeId: claimType.id,
    type: claimType.label,
    claimType: claimType.label,
    lane: item.lane ?? claimType.lane,
    subtype: scenario.subtype,
    scenarioId: item.scenarioId ?? scenario.id,
    scenarioTitle: scenario.title,
    scenarioFamily: scenario.family ?? claimType.label,
    reportedDate,
    issueStartDate,
    status: workflowStatus,
    amountExposure: item.amountExposure ?? item.amount,
    statement: { label: statementLabel, value: statementValue, source: item.statement?.source ?? item.intake?.channel ?? 'Case queue' },
    intakeAnswers,
    assignedInvestigator: briefingPacket.assignedInvestigator,
    assignedDate: briefingPacket.assignedDate,
    assignmentTeam: briefingPacket.assignmentTeam,
    dueDate: briefingPacket.dueDate,
    parties: briefingPacket.parties,
    briefingDetails: briefingPacket.details,
    caseBriefing: {
      ...item.caseBriefing,
      summary: containsHiddenAnswer(item.caseBriefing?.summary ?? item.shortSummary ?? item.allegation)
        ? scenario.summary
        : item.caseBriefing?.summary ?? item.shortSummary ?? item.allegation ?? scenario.summary,
      focusAreas: item.caseBriefing?.focusAreas ?? item.briefingQuestions ?? claimType.intakePrompts,
      evidenceAreas: item.caseBriefing?.evidenceAreas ?? item.evidenceAreas ?? claimType.evidenceAreas,
      scenarioTitle: scenario.title,
      assignedInvestigator: briefingPacket.assignedInvestigator,
      assignedDate: briefingPacket.assignedDate,
      assignmentTeam: briefingPacket.assignmentTeam,
      dueDate: briefingPacket.dueDate,
      parties: briefingPacket.parties,
      details: briefingPacket.details,
    },
    keyFacts: [
      ['Customer type', domainLabels.customerTypeLabel],
      ['Product', domainLabels.productTypeLabel],
      ['Review workflow', domainLabels.workflowTypeLabel],
      ['Case origin', caseOrigin],
      ['Escalation context', caseEscalationReason],
      ['Alert reason', alertReason],
      ['Reported date', reportedDate],
      ['Issue start date', issueStartDate],
      ['Amount / exposure', item.amountExposure ?? item.amount],
    ],
    productsAccounts: [
      { label: 'Customer type', value: domainLabels.customerTypeLabel },
      { label: 'Product', value: domainLabels.productTypeLabel },
      { label: 'Review workflow', value: domainLabels.workflowTypeLabel },
      { label: 'Primary details', value: item.transactionInfo ?? scenario.transactionInfo },
    ],
    availableTools: caseAvailableTools,
    requiredTools,
    evidenceAreas: item.evidenceAreas ?? claimType.evidenceAreas,
    expectedEvidenceCategories: item.expectedEvidenceCategories ?? claimType.evidenceAreas,
    taxonomyTags: {
      ...claimType.taxonomy,
      ...(item.taxonomyTags ?? {}),
      customerType,
      productType,
      workflowType,
    },
    creditDecision: item.creditDecision ?? (claimType.credit ? { ...claimType.credit, family: item.scenarioFamily ?? scenario.family ?? 'Credit review' } : null),
    chargebackDecision: item.chargebackDecision ?? (claimType.chargeback ? { ...claimType.chargeback } : null),
    actionLog: item.actionLog ?? [{ id: `${item.id}-ACT-1`, time: `${reportedDate} · ${item.intake?.contactTime ?? 'Case opened'}`, action: 'Case packet available', detail: 'Case packet is ready for Evidence First investigation.', source: 'Case queue' }],
  };
}

function enrichOneCase(item) {
  const accountId = accountIdForCase(item);
  item = { ...item, accountId };
  const extra = caseIntake[item.id];
  const context = claimContext[item.id] ?? {};
  if (!extra) {
    const builtFields = buildClaimFields(item, context);
    const loginHistory = addDeviceIds(item.id, item.loginHistory ?? []);
    const existingChanges = item.customer?.profileChanges ?? [];
    return {
      ...item,
      ...builtFields,
      customer: {
        ...item.customer,
        relationship: relationshipWithAccountId(item.customer, accountId),
        profileChanges: existingChanges,
      },
      loginHistory,
      links: dedupeStrings(item.links ?? []),
      facts: dedupeStrings(item.facts ?? []),
    };
  }

  const mergedItem = {
    ...item,
    accountId,
    claimId: item.claimId ?? extra.claimId,
    transactionInfo: item.transactionInfo ?? extra.transactionInfo,
    shortSummary: item.shortSummary ?? extra.shortSummary,
    intakeAnswers: item.intakeAnswers ?? extra.intakeAnswers,
    profile: { ...extra.profile, ...item.profile },
    parties: item.parties ?? extra.parties,
  };

  return {
    ...mergedItem,
    ...buildClaimFields(mergedItem, context),
    customer: {
      ...item.customer,
      relationship: relationshipWithAccountId(item.customer, accountId, extra.relationshipExtras),
      profileChanges: dedupeById([...(item.customer?.profileChanges ?? []), ...(extra.profileExtras ?? [])]),
    },
    identityRecords: dedupeById([...(item.identityRecords ?? []), ...(extra.identityExtras ?? [])]),
    loginHistory: addDeviceIds(item.id, dedupeById([...(item.loginHistory ?? []), ...(extra.loginExtras ?? [])])),
    events: dedupeById([...(extra.eventExtras ?? []), ...(item.events ?? [])]),
    documents: dedupeById([...(item.documents ?? []), ...(extra.documentExtras ?? [])]),
    links: dedupeStrings([...(item.links ?? []), ...(extra.linkExtras ?? [])]),
    facts: dedupeStrings([...(item.facts ?? []), item.id === 'FA-CR-24003' ? 'Only early history available' : 'Expanded relationship history available']),
  };
}

export function enrichTrainingCases(cases = []) {
  return cases.map(enrichOneCase);
}
import { getClaimTypeForCase, getScenario } from './claimRegistry.js';
