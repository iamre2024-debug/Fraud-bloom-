import {
  coreClaimTypes,
  findScenarioById,
  getClaimType,
  getClaimTypeForDomain,
  getScenarioWithTruth,
  normalizeWorkflowType,
} from './claimRegistry.js';
import {
  CASE_DOMAIN_VERSION,
  CASE_RELATIONSHIP_DATA_VERSION,
  CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION,
  CUSTOMER_TYPES,
  PRODUCT_TYPES,
  WORKFLOW_TYPES,
  assertCaseDomain,
  caseDomainLabels,
  filterToolsForCaseDomain,
  isWorkflowEnabled,
} from './caseDomain.js';
import { getScenarioTruth } from './claimScenarioCatalog.js';
import { buildCaseBriefingPacket } from './caseBriefingDetails.js';
import { buildCaseIntakeAnswers } from './intakeAnswers.js';
import { getRelationshipAccounts } from './relationshipAccounts.js';
import { getPayrollHistory } from './businessPayrollWorkspace.js';
import {
  buildGeneratedPersona,
  buildGeneratedToolResults,
  buildScenarioDecisionData,
  buildScenarioEvents,
} from './generatedCasePackets.js';

const generatedCaseStorageKey = 'fraud-academy-generated-cases-v1';
const generatedCaseSequenceKey = 'fraud-academy-generated-case-sequence-v1';
const generatedTruthByCaseId = new Map();

function cloneTruthSnapshot(truth) {
  if (!truth || typeof truth !== 'object') return undefined;
  if (typeof structuredClone === 'function') return structuredClone(truth);
  return JSON.parse(JSON.stringify(truth));
}

export function registerGeneratedCaseTruthSnapshot(caseId, truth) {
  const normalizedCaseId = String(caseId ?? '').trim();
  const snapshot = cloneTruthSnapshot(truth);
  if (!normalizedCaseId || !snapshot) return false;
  generatedTruthByCaseId.set(normalizedCaseId, snapshot);
  return true;
}

const depthConfig = {
  light: { label: 'Light', records: 2 },
  standard: { label: 'Standard', records: 3 },
  deep: { label: 'Deep', records: 4 },
};

const difficultyConfig = {
  light: { label: 'Focused review', extraRecords: 0, extraTimelineEvents: 0 },
  standard: { label: 'Layered review', extraRecords: 1, extraTimelineEvents: 1 },
  deep: { label: 'Cross-record review', extraRecords: 2, extraTimelineEvents: 2 },
};

function safeIndex(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.abs(Math.floor(number)) : Date.now();
}

function padded(index, length = 6) {
  return String(safeIndex(index)).slice(-length).padStart(length, '0');
}

function endSentence(value = '') {
  const text = String(value).trim();
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function generatedSubject({ person, scenario, employer, business }) {
  const role = String(scenario.entityRole ?? 'case subject').toLowerCase();
  if (/employee/.test(role) && employer) return `${person}, the ${role} at ${employer}`;
  if (/business|vendor|payment contact|owner/.test(role) && business) return `${person}, the ${role} for ${business}`;
  return `${person}, the ${role}`;
}

function generatedPartyName(index, offset) {
  const firstNames = ['Alex', 'Bailey', 'Casey', 'Devon', 'Ellis', 'Frankie', 'Gray', 'Hayden'];
  const lastNames = ['Arden', 'Bell', 'Chen', 'Diaz', 'Evans', 'Ford', 'Green', 'Hill'];
  return `${firstNames[(safeIndex(index) + offset) % firstNames.length]} ${lastNames[(safeIndex(index) + (offset * 3)) % lastNames.length]}`;
}

function generatedParties({ id, index, domain, person, business, employer, scenario }) {
  const party = (suffix, role, name, relationship, source) => ({
    id: `${id}-PTY-${suffix}`,
    role,
    name,
    relationship,
    source,
  });
  if (domain.customerType === CUSTOMER_TYPES.PERSONAL) {
    const primaryRole = domain.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW ? 'Credit applicant' : 'Personal account holder';
    const relatedRole = domain.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW ? 'Employer or income source' : 'Transaction or payment counterparty';
    const relatedName = domain.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
      ? employer
      : scenario.transactionInfo.split(' - ')[0].split(' · ')[0];
    return [
      party(1, primaryRole, person, 'Primary personal customer named in the case', 'Customer or application record'),
      party(2, relatedRole, relatedName || 'Training counterparty', 'Party connected to the activity under review', 'Transaction, payment, or application record'),
    ];
  }

  const parties = [
    party(1, 'Business account holder', business, 'Entity that owns the product under review', 'Business profile'),
  ];
  if (domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT) {
    parties.push(
      party(2, 'Affected employee', person, 'Employee payroll record affected by the observed change', 'Employee profile'),
      party(3, 'Authorized payroll administrator', generatedPartyName(index, 1), 'Administrator on the established business roster', 'Administrator roster'),
    );
    return parties;
  }
  if (domain.workflowType === WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER) {
    parties.push(
      party(2, 'Payroll initiator', person, 'Person recorded as initiating the payroll activity', 'Payroll activity record'),
      party(3, 'Payroll approver', generatedPartyName(index, 1), 'Person recorded as approving the payroll activity', 'Payroll approval record'),
      party(4, 'Authorized payroll administrator', generatedPartyName(index, 2), 'Administrator on the established business roster', 'Administrator roster'),
    );
    return parties;
  }
  if (domain.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    parties.push(
      party(2, 'Application submitter', person, 'Person who submitted the business application', 'Application record'),
      party(3, 'Beneficial owner', generatedPartyName(index, 1), 'Relevant owner identified for verification', 'Ownership record'),
      party(4, 'Control person', generatedPartyName(index, 2), 'Person with significant control identified for verification', 'Business application'),
    );
    if ([PRODUCT_TYPES.BUSINESS_CREDIT_CARD, PRODUCT_TYPES.BUSINESS_LOAN].includes(domain.productType)) {
      parties.push(party(5, 'Personal guarantor', generatedPartyName(index, 3), 'Guarantor identified for this fictional credit product', 'Guaranty record'));
    }
    parties.push(party(6, 'Authorized administrator', generatedPartyName(index, 4), 'Administrator identified when applicable', 'Administrator record'));
    return parties;
  }
  if (domain.workflowType === WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER) {
    parties.push(
      party(2, 'Business administrator', person, 'Administrator activity named in the access alert', 'Administrator activity record'),
      party(3, 'Payment initiator', generatedPartyName(index, 1), 'Initiator associated with activity in the review window', 'Payment activity record'),
      party(4, 'Payment approver', generatedPartyName(index, 2), 'Approver associated with activity in the review window', 'Approval record'),
    );
    return parties;
  }
  parties.push(
    party(2, 'Business payment contact', person, 'Contact named in the instruction or transaction record', 'Business intake'),
    party(3, 'Payment beneficiary or originator', scenario.transactionInfo.split(' - ')[0].split(' · ')[0], 'Counterparty tied to the activity under review', 'Payment record'),
  );
  return parties;
}

export function buildGeneratedCaseSummary({
  person,
  scenario,
  employer,
  business,
  reportedDate,
  issueStartDate,
  documents = [],
}) {
  const availableDocuments = documents.filter((document) => document.status !== 'Requested').length;
  const requestedDocuments = documents.filter((document) => document.status === 'Requested').length;
  const subject = generatedSubject({ person, scenario, employer, business });
  const statement = endSentence(scenario.statement);
  const transaction = endSentence(scenario.transactionInfo);
  const documentStatus = requestedDocuments
    ? `${availableDocuments} supporting document(s) are available and ${requestedDocuments} remain requested.`
    : `${availableDocuments} supporting document(s) are available in the case packet.`;

  return `${subject} reported through ${scenario.channel}: "${statement}" The ${scenario.subtype} review concerns ${transaction} The amount in scope is ${scenario.amount}; activity begins ${issueStartDate}, and the case was reported ${reportedDate}. ${documentStatus}`;
}

function dateFor(index, offset = 0) {
  const date = new Date(2026, 6, 14, 12, 0, 0);
  date.setDate(date.getDate() - (safeIndex(index) % 24) - (offset * 7));
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
}

function dateBefore(value, days) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

function roundGeneratedMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function generatedSecuritySnapshot(loginHistory, phone, email) {
  const established = (loginHistory ?? []).filter((record) => (
    /successful/i.test(record.result ?? '')
    && /(?:-M\b|established|known|trusted)/i.test(`${record.deviceId ?? ''} ${record.device ?? ''}`)
  ));
  const byDevice = new Map();
  for (const record of established) {
    const deviceId = record.deviceId;
    if (!deviceId) continue;
    const rows = byDevice.get(deviceId) ?? [];
    rows.push(record);
    byDevice.set(deviceId, rows);
  }
  const trustedDevices = [...byDevice.entries()].map(([deviceId, rows]) => {
    const chronological = [...rows].reverse();
    const first = chronological[0];
    const last = rows[0];
    return {
      id: deviceId,
      name: last.device ?? 'Established training device',
      type: /mobile|phone/i.test(last.device ?? '') ? 'Mobile phone' : 'Computer',
      platform: [last.operatingSystem, last.browserSource].filter(Boolean).join(' · '),
      firstSeen: first.time,
      lastSeen: last.time,
      mostRecentSuccessfulLogin: last.time,
      trustStatus: 'Trusted in the generated relationship profile',
      authentication: last.mfaStatus ?? last.method,
      mfaMethod: last.mfaStatus ?? last.method,
    };
  });
  return {
    mfaStatus: established[0]?.mfaStatus ?? 'MFA enrollment record not supplied',
    passwordChanged: 'Password-reset information not supplied',
    lockouts: 'Review Login History for account-lockout records',
    alerts: `Security alerts route to ${email}`,
    recoveryContact: `${phone} · ${email}`,
    trustedPhone: phone,
    trustedEmail: email,
    recentPasswordReset: 'Password-reset information not supplied',
    securityAlertsSent: `Security alerts route to ${email}`,
    trustedDevices,
  };
}

function generatedCustomerIdentitySnapshot({
  id,
  index,
  person,
  city,
  address,
  phone,
  email,
  trainingId,
  relationshipSince,
  segment,
  profileChanges,
  accounts,
}) {
  const seed = safeIndex(index);
  const birthYear = 1978 + (seed % 23);
  const birthMonth = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][seed % 12];
  const birthDay = 1 + (seed % 27);
  const locality = String(city || 'Dallas, TX').replace(/\s+\(training\)$/i, '');
  const previousStreetNumber = 240 + (seed % 7600);
  const lastProfileVerification = [...(profileChanges ?? [])]
    .reverse()
    .find((item) => /address|contact|verification/i.test(`${item.eventType ?? ''} ${item.item ?? ''}`));
  const primaryAccount = (accounts ?? []).find((account) => account.isPrimary) ?? accounts?.[0];
  const preferredContact = ['Secure message', 'Email', 'Mobile app'][seed % 3];
  const memberSuffix = String(trainingId ?? '')
    .replace(/\D/g, '')
    .slice(-4)
    .padStart(4, '0');

  return {
    sourceRecordId: `${id}-C360-IDENTITY`,
    legalName: person,
    preferredName: String(person ?? '').trim().split(/\s+/)[0] || 'Training customer',
    dob: `${birthMonth} ${birthDay}, ${birthYear}`,
    age: String(2026 - birthYear),
    language: seed % 4 === 0 ? 'English · Spanish preference recorded' : 'English',
    currentAddress: address,
    previousAddress: `${previousStreetNumber} Archive Training Road, ${locality} (training)`,
    mobilePhone: phone,
    homePhone: 'No separate home phone recorded',
    email,
    customerSince: relationshipSince,
    segment,
    preferredContact,
    verificationStatus: 'Identity verification completed',
    verificationMethod: 'Fictional generated identity and address record',
    lastVerified: [
      lastProfileVerification?.date,
      lastProfileVerification?.time,
    ].filter(Boolean).join(' · ') || 'Verification date not supplied',
    accountStanding: primaryAccount?.status ?? 'Account status not supplied',
    maskedMemberId: `MEM-••••-${memberSuffix}`,
  };
}

function generatedCustomerServiceContacts({
  id,
  person,
  profileChanges,
  accounts,
  reportedDate,
}) {
  const primaryAccount = (accounts ?? []).find((account) => account.isPrimary) ?? accounts?.[0];
  const addressSource = [...(profileChanges ?? [])]
    .reverse()
    .find((item) => /address|verification/i.test(`${item.eventType ?? ''} ${item.item ?? ''}`))
    ?? profileChanges?.[0];
  const authenticationSource = (profileChanges ?? []).find((item) => /mfa|authentication|security/i.test(
    `${item.eventType ?? ''} ${item.item ?? ''}`,
  ));
  const rows = [
    {
      sourceKind: 'profile',
      source: addressSource,
      fallbackSourceRecordId: `${id}-PCH-1`,
      fallbackType: 'Profile information review',
      fallbackChannel: 'Customer profile',
      fallbackOutcome: 'Existing profile information retained',
      fallbackNotes: 'Recorded identity and contact fields were reviewed in the fictional servicing profile.',
    },
    authenticationSource ? {
      sourceKind: 'profile',
      source: authenticationSource,
      fallbackSourceRecordId: `${id}-PCH-2`,
      fallbackType: 'Authentication settings review',
      fallbackChannel: 'Digital profile maintenance',
      fallbackOutcome: 'Authentication setting recorded',
      fallbackNotes: 'The servicing record captured the authentication method without making a case determination.',
    } : {
      sourceKind: 'account',
      source: primaryAccount,
      fallbackSourceRecordId: `${id}-REL-ACCOUNT`,
      fallbackType: 'Relationship account status review',
      fallbackChannel: 'Relationship servicing',
      fallbackOutcome: 'Relationship account status recorded',
      fallbackNotes: 'The existing relationship account was reviewed as customer context without making a case determination.',
    },
  ];

  return rows.map((row, rowIndex) => {
    const source = row.source ?? {};
    const isProfileSource = row.sourceKind === 'profile';
    const sourceType = isProfileSource
      ? source.eventType ?? row.fallbackType
      : row.fallbackType;
    const sourceItem = isProfileSource
      ? source.item ?? sourceType
      : source.productName ?? source.accountLabel ?? 'Primary relationship account';
    const sourceRecordId = isProfileSource
      ? source.id ?? row.fallbackSourceRecordId
      : source.accountId ?? row.fallbackSourceRecordId;
    const outcome = isProfileSource
      ? source.oldValue === source.newValue
        ? 'Existing information confirmed'
        : `${sourceType} recorded`
      : source.status ?? row.fallbackOutcome;
    const notes = source.notes ?? row.fallbackNotes;
    return {
      id: `${id}-SVC-${rowIndex + 1}`,
      sourceRecordId,
      dateTime: [source.date ?? reportedDate, source.time].filter(Boolean).join(' · '),
      type: sourceType,
      channel: isProfileSource ? source.channel ?? row.fallbackChannel : row.fallbackChannel,
      outcome,
      agent: 'Customer self-service',
      notes,
      relatedAccountId: primaryAccount?.accountId ?? 'No related account supplied',
      reasonForContact: sourceItem,
      reportedInformation: notes,
      assistanceProvided: outcome,
      documentsRequested: 'None recorded',
      followUpStatus: 'Completed',
      agentOrDepartment: 'Relationship servicing',
      subject: person,
    };
  });
}

function generatedCustomerRelationshipProfile({ id, accounts, reportedDate }) {
  const productKinds = (accounts ?? []).map((account) => String(account.productKind ?? '').toLowerCase());
  const hasDepositProduct = productKinds.some((kind) => /check