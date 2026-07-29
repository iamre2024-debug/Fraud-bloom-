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

function persistRelationshipFinancialHistory({
  id,
  domain,
  workflowType,
  reportedDate,
  profile,
  customer,
  toolResults,
}) {
  const accounts = toolResults.relationshipAccounts ?? [];
  if (
    domain.customerType === CUSTOMER_TYPES.PERSONAL
    && domain.productType === PRODUCT_TYPES.DEPOSIT_ACCOUNT
    && !Array.isArray(toolResults.depositHistory)
  ) {
    const primary = accounts.find((account) => account.isPrimary) ?? accounts[0];
    const balanceAnchor = Math.max(600, Number(primary?.currentBalance) || 0, Number(primary?.availableBalance) || 0);
    const regularAmount = roundGeneratedMoney(Math.max(450, balanceAnchor * 0.32));
    const otherAmount = roundGeneratedMoney(Math.max(125, balanceAnchor * 0.11));
    const source = profile.employer ?? 'Fictional training employer';
    toolResults.depositHistory = [
      {
        id: `${id}-DEP-1`,
        title: 'Payroll deposit',
        amount: regularAmount,
        observed: dateBefore(reportedDate, 3),
        source,
        depositType: 'ACH payroll credit',
        status: 'Posted',
      },
      {
        id: `${id}-DEP-2`,
        title: 'Payroll deposit',
        amount: regularAmount,
        observed: dateBefore(reportedDate, 17),
        source,
        depositType: 'ACH payroll credit',
        status: 'Posted',
      },
      {
        id: `${id}-DEP-3`,
        title: 'Other incoming transfer',
        amount: otherAmount,
        observed: dateBefore(reportedDate, 39),
        source: 'Fictional training transfer source',
        depositType: 'Other incoming credit',
        status: 'Posted',
      },
    ];
  }

  const creditAccount = accounts.find((account) => (
    ['credit-card', 'business-credit-card', 'revolving-credit-line', 'installment-loan', 'business-installment-loan']
      .includes(account.productKind)
  ));
  if (
    !creditAccount
    || workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
    || Array.isArray(toolResults.paymentHistory)
    || !(Number(creditAccount.scheduledPayment) > 0)
  ) return;
  const summary = String(toolResults.creditProfile?.paymentHistory ?? creditAccount.paymentStatus ?? '').toLowerCase();
  const statuses = /returned|missed/.test(summary)
    ? ['Returned', 'Late', 'Partial']
    : /late|delinquen/.test(summary)
      ? ['Late', 'Completed', 'Completed']
      : ['Completed', 'Completed', 'Completed'];
  const paymentSource = accounts.find((account) => account.accountId !== creditAccount.accountId);
  toolResults.paymentHistory = statuses.map((status, offset) => {
    const scheduledAmount = roundGeneratedMoney(creditAccount.scheduledPayment);
    const actualPaid = status === 'Returned'
      ? 0
      : status === 'Partial'
        ? roundGeneratedMoney(scheduledAmount * 0.5)
        : scheduledAmount;
    return {
      id: `${id}-PMT-${offset + 1}`,
      title: `${creditAccount.productLabel} monthly payment`,
      scheduledAmount,
      actualPaid,
      paymentDate: dateBefore(reportedDate, 14 + (offset * 30)),
      status,
      paymentSource: paymentSource
        ? `${paymentSource.productLabel} ${paymentSource.maskedAccountId}`
        : 'Fictional relationship payment source',
      balanceAfter: creditAccount.currentBalance === null
        ? null
        : roundGeneratedMoney(Number(creditAccount.currentBalance) + (offset * scheduledAmount)),
      detail: 'This dated payment record was persisted when the fictional generated case was created.',
    };
  });
}

function generatorOptions(indexOrOptions, options) {
  if (typeof indexOrOptions === 'object' && indexOrOptions !== null) {
    return { index: Date.now(), ...indexOrOptions };
  }
  return { index: indexOrOptions ?? Date.now(), ...(options ?? {}) };
}

function compatibleProduct(claimType, customerType, preferredProductType) {
  if (preferredProductType && claimType.productTypes.includes(preferredProductType)
    && isWorkflowEnabled(customerType, preferredProductType, claimType.workflowType)) return preferredProductType;
  return claimType.productTypes.find((productType) => isWorkflowEnabled(customerType, productType, claimType.workflowType));
}

function selectClaimType(index, config) {
  const explicitWorkflowType = normalizeWorkflowType(config.workflowType);
  const legacyWorkflowType = normalizeWorkflowType(config.claimTypeId);
  const requestedScenarioId = config.scenarioId && config.scenarioId !== 'auto' ? config.scenarioId : undefined;
  const preferredClaimType = explicitWorkflowType || legacyWorkflowType ? getClaimType(explicitWorkflowType ?? legacyWorkflowType) : undefined;
  const preferredScenario = requestedScenarioId
    ? preferredClaimType?.scenarios.find((scenario) => scenario.id === requestedScenarioId || scenario.legacyScenarioId === requestedScenarioId)
    : undefined;
  const requestedScenario = preferredScenario
    ? { claimType: preferredClaimType, scenario: preferredScenario }
    : requestedScenarioId
      ? findScenarioById(requestedScenarioId)
      : undefined;
  const requestedWorkflowType = explicitWorkflowType
    ?? (requestedScenario && !config.workflowType ? requestedScenario.claimType.workflowType : undefined)
    ?? legacyWorkflowType;
  const claimType = requestedWorkflowType
    ? getClaimType(requestedWorkflowType)
    : coreClaimTypes[safeIndex(index) % coreClaimTypes.length];
  const explicitlyResolvedScenario = requestedScenario?.claimType.id === claimType.id ? requestedScenario.scenario : undefined;
  const autoScenario = !explicitlyResolvedScenario
    && !config.customerType
    && !config.productType
    && (!config.scenarioId || config.scenarioId === 'auto')
    ? claimType.scenarios[safeIndex(index) % claimType.scenarios.length]
    : undefined;
  const scenario = explicitlyResolvedScenario ?? autoScenario;
  const inferredCustomerType = config.customerType
    ?? scenario?.customerTypes?.[0]
    ?? claimType.customerTypes[0]
    ?? CUSTOMER_TYPES.PERSONAL;
  const inferredProductType = config.productType
    ?? compatibleProduct(claimType, inferredCustomerType, scenario?.productTypes?.[0])
    ?? compatibleProduct(claimType, inferredCustomerType);
  const domain = assertCaseDomain({
    customerType: inferredCustomerType,
    productType: inferredProductType,
    workflowType: claimType.workflowType,
  });
  getClaimTypeForDomain(domain);
  return { claimType, domain, requestedScenario: scenario };
}

const scenarioVariantPatterns = [
  'overnight mobile activity',
  'business-hours desktop activity',
  'weekend cross-channel activity',
  'staggered multi-day activity',
  'single-session rapid activity',
  'prior-relationship comparison',
  'new-contact and established-device comparison',
  'established-contact and new-device comparison',
];

const intakeRoutes = {
  consumer: ['Mobile app claim form', 'Secure message', 'Phone claim intake', 'Branch escalation', 'Digital fraud intake'],
  employee: ['Employer payroll inquiry', 'Employee service ticket', 'Payroll operations queue', 'HR escalation'],
  business: ['Business operations inquiry', 'Payments operations queue', 'Secure business message', 'Treasury callback record'],
  applicant: ['Online application review', 'Application verification queue', 'Document follow-up queue', 'Identity review escalation'],
};

function scenarioForGeneration(claimType, domain, index, scenarioId, requestedScenario, alertReason) {
  const domainScenarios = claimType.scenarios.filter((scenario) => (
    (!scenario.customerTypes?.length || scenario.customerTypes.includes(domain.customerType))
    && (!scenario.productTypes?.length || scenario.productTypes.includes(domain.productType))
  ));
  const supportedScenarios = alertReason && alertReason !== 'auto'
    ? domainScenarios.filter((scenario) => scenario.alertReason === alertReason)
    : domainScenarios;
  if (!supportedScenarios.length) {
    const reason = alertReason && alertReason !== 'auto' ? ` and alert reason "${alertReason}"` : '';
    throw new RangeError(`No scenarios are configured for ${domain.customerType}/${domain.productType}/${domain.workflowType}${reason}`);
  }
  const selected = requestedScenario
    ?? (scenarioId && scenarioId !== 'auto'
      ? claimType.scenarios.find((scenario) => scenario.id === scenarioId || scenario.legacyScenarioId === scenarioId)
      : undefined);
  if (selected && supportedScenarios.some((scenario) => scenario.id === selected.id)) {
    return getScenarioWithTruth(claimType.id, selected.id);
  }
  if (scenarioId && scenarioId !== 'auto') {
    throw new RangeError(`Scenario ${scenarioId} is not enabled for ${domain.customerType}/${domain.productType}/${domain.workflowType}`);
  }
  const scenario = supportedScenarios[safeIndex(index) % supportedScenarios.length] ?? supportedScenarios[0];
  return getScenarioWithTruth(claimType.id, scenario.id);
}

function scenarioVariant(baseScenario, index) {
  const seed = safeIndex(index);
  const baseAmount = Number(String(baseScenario.amount ?? '').replace(/[^0-9.-]+/g, '')) || 0;
  const amountFactors = [0.74, 0.86, 0.93, 1, 1.08, 1.17, 1.31, 1.46];
  const amount = baseAmount
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.max(1, Math.round(baseAmount * amountFactors[seed % amountFactors.length] * 100) / 100))
    : '$0.00';
  const reference = String((seed * 7919) % 10000).padStart(4, '0');
  const role = String(baseScenario.entityRole ?? '').toLowerCase();
  const routeKey = /employee/.test(role) ? 'employee' : /business|vendor|payment contact|owner/.test(role) ? 'business' : /applicant/.test(role) ? 'applicant' : 'consumer';
  const channels = intakeRoutes[routeKey];
  const channel = [WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER].includes(baseScenario.workflowType)
    ? baseScenario.channel
    : channels[seed % channels.length];
  const pattern = scenarioVariantPatterns[seed % scenarioVariantPatterns.length];
  const transactionInfo = /ending \d{4}/i.test(baseScenario.transactionInfo)
    ? baseScenario.transactionInfo.replace(/ending \d{4}/i, `ending ${reference}`)
    : `${baseScenario.transactionInfo} · training reference ${reference}`;

  return {
    ...baseScenario,
    amount,
    channel,
    transactionInfo,
    statement: `${endSentence(baseScenario.statement)} Please compare the dated records across the ${pattern}.`,
    variationId: `${baseScenario.id}-V${padded(seed, 8)}`,
    variationLabel: pattern,
  };
}

function makeLoginHistory({ id, index, city, recordCount, claimType, scenario, difficulty }) {
  if (!claimType.availableTools.includes('Login History')) return [];
  const suffix = padded(index);
  const residentialIp = `198.51.100.${20 + (safeIndex(index) % 120)}`;
  const secondaryIp = `203.0.113.${10 + (safeIndex(index) % 120)}`;
  const determination = scenario.caseTruth?.correctDetermination ?? '';
  const established = /do not support|release|complete application/i.test(determination);
  const mixed = /insufficient|more information|escalate|unable|hold pending/i.test(determination);
  const currentLocation = established ? city : mixed ? city : 'Phoenix, AZ';
  const currentDevice = established ? `DEV-GEN-${suffix}-M` : `DEV-GEN-${suffix}-N`;
  const records = [
    { id: `LOG-${suffix}-1`, time: `${dateFor(index)} · 9:18 AM`, eventType: 'Interactive login', method: established ? 'Biometric' : 'Password', mfaStatus: established ? 'Biometric completed' : mixed ? 'SMS code completed' : 'SMS code completed after recovery change', authChannel: 'Mobile web', device: established ? 'Established training mobile browser' : 'New training mobile browser', deviceId: currentDevice, operatingSystem: 'Training Mobile OS 18', browserSource: 'Chrome Mobile training browser', location: currentLocation, ip: established ? residentialIp : secondaryIp, session: `${id}-SES-1`, result: 'Successful', failedAttemptCount: established ? 0 : 2, accountLockout: 'No lockout recorded', logoutStatus: difficulty === 'deep' ? 'Session ended without an explicit logout event' : 'Normal logout recorded' },
    { id: `LOG-${suffix}-2`, time: `${dateFor(index, 1)} · 4:42 PM`, eventType: 'Interactive login', method: 'Biometric', mfaStatus: 'Biometric completed', authChannel: 'Mobile app', device: 'Established training mobile browser', deviceId: `DEV-GEN-${suffix}-M`, operatingSystem: 'Training Mobile OS 18', browserSource: 'Fraud Academy training app', location: city, ip: residentialIp, session: `${id}-SES-2`, result: 'Successful', failedAttemptCount: 0, accountLockout: 'No lockout recorded', logoutStatus: 'Session timeout recorded' },
    { id: `LOG-${suffix}-3`, time: `${dateFor(index, 2)} · 11:05 AM`, eventType: 'Failed authentication', method: 'Password', mfaStatus: 'MFA not reached', authChannel: 'Desktop web', device: 'Training desktop browser', deviceId: `DEV-GEN-${suffix}-D`, operatingSystem: 'Training Desktop OS 14', browserSource: 'Chrome desktop training browser', location: currentLocation, ip: secondaryIp, session: 'No session created', result: 'Failed', failedAttemptCount: 2, accountLockout: 'No lockout recorded', logoutStatus: 'No session created' },
    { id: `LOG-${suffix}-4`, time: `${dateFor(index, 2)} · 11:08 AM`, eventType: 'Account lockout', method: 'Password', mfaStatus: 'MFA not reached', authChannel: 'Desktop web', device: 'Training desktop browser', deviceId: `DEV-GEN-${suffix}-D`, operatingSystem: 'Training Desktop OS 14', browserSource: 'Chrome desktop training browser', location: currentLocation, ip: secondaryIp, session: 'No session created', result: 'Account locked', failedAttemptCount: 3, accountLockout: 'Temporary lockout recorded', logoutStatus: 'No session created' },
    { id: `LOG-${suffix}-5`, time: `${dateFor(index, 3)} · 2:16 PM`, eventType: 'Interactive login', method: 'Email code', mfaStatus: 'Email code completed', authChannel: 'Desktop web', device: 'Training desktop browser', deviceId: `DEV-GEN-${suffix}-D`, operatingSystem: 'Training Desktop OS 14', browserSource: 'Chrome desktop training browser', location: city, ip: secondaryIp, session: `${id}-SES-5`, result: 'Successful', failedAttemptCount: 0, accountLockout: 'Lockout cleared before this event', logoutStatus: 'Normal logout recorded' },
  ];
  return records.slice(0, recordCount);
}

export function makeGeneratedProfileChanges({
  id,
  index,
  person,
  city,
  claimType,
  scenario,
  reportedDate,
  issueStartDate,
  loginHistory,
  paymentRecord,
}) {
  const currentLogin = loginHistory[0] ?? {};
  const priorLogin = loginHistory.find((item, itemIndex) => itemIndex > 0 && /successful/i.test(item.result)) ?? currentLogin;
  const hasAccessHistory = loginHistory.length > 0;
  const dateFromLogin = (value, fallback) => String(value ?? '').match(/^[A-Z][a-z]{2} \d{2}, \d{4}/)?.[0] ?? fallback;
  const claim = `${claimType.id} ${claimType.lane} ${scenario.subtype}`.toLowerCase();
  const email = `${person.toLowerCase().replace(/\s+/g, '.')}@training.example.test`;
  const previousPaymentDestination = paymentRecord?.oldDestination ?? 'No prior account / destination supplied';
  const currentPaymentDestination = paymentRecord
    ? `Bank Code ${paymentRecord.bankCode} · Destination ID ${paymentRecord.destinationId}`
    : `Destination ID ••••${padded(index, 4)}`;
  const paymentLink = paymentRecord ? {
    paymentRecordId: paymentRecord.id,
    bankCode: paymentRecord.bankCode,
    destinationId: paymentRecord.destinationId,
    oldDestination: previousPaymentDestination,
    newDestination: paymentRecord.newDestination ?? currentPaymentDestination,
    changeComparison: paymentRecord.changeComparison
      ?? `${previousPaymentDestination} changed to ${currentPaymentDestination}.`,
  } : {};
  let scenarioEvent = {
    eventType: 'Contact preference change',
    item: 'Preferred contact channel updated',
    oldValue: 'Email',
    newValue: scenario.channel,
    notes: 'Compare the maintenance event with the active claim channel and recent contact history.',
  };

  if ((claim.includes('account-takeover') || claim.includes('account takeover')) && /payee|external account add/.test(claim)) scenarioEvent = {
    eventType: 'Payment destination change',
    item: 'External payee destination updated',
    oldValue: previousPaymentDestination,
    newValue: currentPaymentDestination,
    notes: 'Compare the destination with Login History, Session History, ownership, prior use, and the active transfer sequence.',
    ...paymentLink,
  };
  else if (claim.includes('account-takeover') || claim.includes('account takeover')) scenarioEvent = {
    eventType: 'Recovery email change',
    item: 'Recovery email updated',
    oldValue: email,
    newValue: `recovery.${String(index).slice(-4)}@training.example.test`,
    notes: 'Compare with Login History, Session History, alert delivery, and the active claim sequence.',
  };
  else if (claim.includes('payroll')) scenarioEvent = {
    eventType: 'Payroll bank-profile change',
    item: 'Direct deposit destination updated',
    oldValue: previousPaymentDestination,
    newValue: currentPaymentDestination,
    notes: 'Compare employee authorization, callback records, ownership, prior use, and payroll timing.',
    ...paymentLink,
  };
  else if (claim.includes('bec') || claim.includes('vendor') || claim.includes('wire')) scenarioEvent = {
    eventType: 'Beneficiary profile change',
    item: 'Payment beneficiary destination updated',
    oldValue: previousPaymentDestination,
    newValue: currentPaymentDestination,
    notes: 'Compare the instruction source, callback, ownership, prior use, and payment-release sequence.',
    ...paymentLink,
  };
  else if (claim.includes('credit') || claim.includes('application') || claim.includes('bust')) scenarioEvent = {
    eventType: 'Payment profile change',
    item: 'External payment account linked',
    oldValue: previousPaymentDestination,
    newValue: currentPaymentDestination,
    notes: 'Compare ownership, application data, documents, prior use, and account age.',
    ...paymentLink,
  };
  else if (claim.includes('chargeback') || claim.includes('card')) scenarioEvent = {
    eventType: 'Billing alert preference change',
    item: 'Card alert threshold updated',
    oldValue: '$250.00',
    newValue: '$100.00',
    notes: 'Compare alert delivery with the transaction and customer-contact timeline.',
  };

  return [
    {
      id: `${id}-PCH-1`,
      date: dateFromLogin(currentLogin.time, reportedDate),
      time: '9:21 AM',
      ...scenarioEvent,
      channel: 'Digital profile maintenance',
      source: 'Generated profile history',
      user: person,
      device: currentLogin.deviceId ?? currentLogin.device ?? 'Profile servicing record',
      ip: currentLogin.ip ?? 'No network record required for this lane',
      session: currentLogin.session ?? `${id}-PROFILE-1`,
      mfaMethod: currentLogin.method ?? 'Profile verification',
      detail: `${scenarioEvent.item} changed from ${scenarioEvent.oldValue} to ${scenarioEvent.newValue} during the ${scenario.subtype} activity window.${scenarioEvent.paymentRecordId && paymentRecord?.changeComparison ? ` ${paymentRecord.changeComparison}` : ''}`,
    },
    hasAccessHistory ? {
      id: `${id}-PCH-2`,
      date: dateFromLogin(priorLogin.time, issueStartDate),
      time: '4:47 PM',
      eventType: 'MFA preference change',
      item: 'Authentication route confirmed',
      oldValue: 'Password only',
      newValue: priorLogin.method ?? 'Email code',
      channel: 'Digital profile maintenance',
      source: 'Generated security profile',
      user: person,
      device: priorLogin.deviceId ?? priorLogin.device ?? 'Profile servicing record',
      ip: priorLogin.ip ?? 'No network record required for this lane',
      session: priorLogin.session ?? `${id}-SES-2`,
      mfaMethod: priorLogin.method ?? 'Email code',
      notes: 'Authentication enrollment is evidence only; compare it with the login and session records.',
      detail: `Authentication changed from Password only to ${priorLogin.method ?? 'Email code'} on ${dateFromLogin(priorLogin.time, issueStartDate)}.`,
    } : {
      id: `${id}-PCH-2`,
      date: issueStartDate,
      time: '4:47 PM',
      eventType: 'Contact record confirmation',
      item: 'Primary contact route reviewed',
      oldValue: 'Fictional contact record on file',
      newValue: scenario.channel,
      channel: 'Customer profile',
      source: 'Generated profile history',
      user: person,
      device: 'Profile servicing record',
      ip: 'No network record required for this lane',
      session: `${id}-PROFILE-2`,
      mfaMethod: 'Profile verification',
      notes: 'This profile-maintenance record is customer context and does not create a Login History event.',
      detail: `The primary contact route was compared with the ${scenario.channel} intake record.`,
    },
    {
      id: `${id}-PCH-3`,
      date: dateFor(index, 4),
      time: '11:08 AM',
      eventType: 'Address verification',
      item: 'Physical address confirmed',
      oldValue: `${city} training address`,
      newValue: `${city} training address`,
      channel: 'Customer profile',
      source: 'Generated profile history',
      user: person,
      device: priorLogin.deviceId ?? priorLogin.device ?? 'Profile servicing record',
      ip: priorLogin.ip ?? 'No network record required for this lane',
      session: `${id}-PCH-VERIFY`,
      mfaMethod: 'Profile verification',
      notes: 'The existing address was confirmed without a value change.',
      detail: `The physical address remained ${city} training address after verification.`,
    },
  ];
}

function documentDetail({ name, status, scenario, person, business, employer, address, trainingId, reportedDate, issueStartDate }) {
  const subject = /business|vendor|revenue|registration|EIN|tax|bank statement|invoice|contract/i.test(name) ? business : /payroll|employee|paystub/i.test(name) ? `${person} at ${employer}` : person;
  if (status === 'Requested') {
    return `${name} was requested from ${subject} on ${reportedDate} to verify the ${scenario.subtype} activity and ${scenario.amount} amount in scope; no file has been received.`;
  }
  if (/identity|ID|selfie|liveness|address|phone/i.test(name)) {
    return `${name} lists ${person}, Training ID ${trainingId}, and ${address}; the record was observed ${reportedDate}.`;
  }
  if (/registration|EIN|formation|ownership/i.test(name)) {
    return `${name} lists ${business}, ${person} as the connected owner, ${address} as the recorded address, and an active training registration as of ${reportedDate}.`;
  }
  if (/bank statement|revenue|income|paystub|tax|cash.flow|invoice|contract/i.test(name)) {
    return `${name} covers ${subject}, the ${issueStartDate} to ${reportedDate} activity window, and the ${scenario.amount} request or exposure described as ${scenario.transactionInfo}.`;
  }
  if (/payroll|direct deposit|employee/i.test(name)) {
    return `${name} connects ${person} to ${employer} and records ${scenario.transactionInfo} for ${scenario.amount} during the active review window.`;
  }
  if (/merchant|receipt|order|authorization|card|refund|return|delivery|service|billing/i.test(name)) {
    return `${name} records ${scenario.transactionInfo} for ${scenario.amount}, reported through ${scenario.channel} on ${reportedDate}.`;
  }
  if (/email|message|vendor|callback|payment instruction/i.test(name)) {
    return `${name} records the ${scenario.channel} instruction, ${scenario.transactionInfo}, and the ${scenario.amount} payment or exposure reported on ${reportedDate}.`;
  }
  return `${name} records ${scenario.title}, ${scenario.transactionInfo}, the ${scenario.amount} amount in scope, and the ${reportedDate} report date.`;
}

function makeDocuments({ id, index, claimType, scenario, recordCount, difficulty, person, business, employer, address, trainingId, reportedDate, issueStartDate }) {
  const documentCount = Math.min(claimType.documents.length, Math.max(4, recordCount));
  const requestedSlot = safeIndex(index) % documentCount;
  const secondaryRequestedSlot = (requestedSlot + 2) % documentCount;
  const receivedSlot = (requestedSlot + 1) % documentCount;
  return claimType.documents.slice(0, documentCount).map((name, itemIndex) => {
    const status = itemIndex === requestedSlot || (difficulty === 'deep' && itemIndex === secondaryRequestedSlot)
      ? 'Requested'
      : itemIndex === receivedSlot
        ? 'Received'
        : 'Available';
    return {
      id: `${id}-DOC-${itemIndex + 1}`,
      status,
      name,
      detail: documentDetail({ name, status, scenario, person, business, employer, address, trainingId, reportedDate, issueStartDate }),
    };
  });
}

function makeClaimDetails({ scenario, reportedDate, issueStartDate, transactionId }) {
  const context = `${scenario.subtype} ${scenario.title}`;
  const base = {
    disputedTransactionIds: [transactionId],
    disputedTransactionDate: reportedDate,
    requestedOutcome: 'Review the disputed transaction under the applicable card-network claim lane',
  };
  if (/subscription terms|trial.*convert|annual subscription/i.test(context)) return {
    ...base,
    enrollmentOrTrialDate: issueStartDate,
    requestedOutcome: 'Review the subscription enrollment, price disclosure, and renewal terms',
  };
  if (/cancel|subscription|recurring/i.test(context)) return {
    ...base,
    cancellationDate: issueStartDate,
    cancellationMethod: 'Merchant account settings · customer-reported',
    requestedOutcome: 'Stop recurring billing and review the disputed renewal',
  };
  if (/refund|return credit/i.test(context)) return { ...base, returnOrRefundDate: issueStartDate, merchantContactMethod: scenario.channel };
  if (/not received|delivery/i.test(context)) return { ...base, expectedDeliveryDate: issueStartDate, deliveryAddress: 'Customer address recorded at intake' };
  if (/service|not as described/i.test(context)) return { ...base, serviceOrDeliveryDate: issueStartDate, merchantContactMethod: scenario.channel };
  if (/duplicate|incorrect amount/i.test(context)) return { ...base, agreedAmountSource: 'Customer receipt or order record requested for comparison' };
  return base;
}

export function createGeneratedCase(indexOrOptions = Date.now(), options = {}) {
  const config = generatorOptions(indexOrOptions, options);
  const index = safeIndex(config.index);
  const { claimType, domain, requestedScenario } = selectClaimType(index, config);
  const scenario = scenarioVariant(scenarioForGeneration(claimType, domain, index, config.scenarioId, requestedScenario, config.alertReason), index);
  const hiddenTruth = scenario.caseTruth;
  const domainLabels = caseDomainLabels(domain);
  const scenarioTaxonomy = {
    ...scenario.taxonomyTags,
    ...domain,
  };
  scenario.customerType = domain.customerType;
  scenario.productType = domain.productType;
  scenario.workflowType = domain.workflowType;
  scenario.taxonomyTags = scenarioTaxonomy;
  const caseClaimType = {
    ...claimType,
    availableTools: filterToolsForCaseDomain(scenario.toolkitTools ?? claimType.availableTools, domain),
    requiredTools: filterToolsForCaseDomain(claimType.requiredTools, domain),
  };
  const difficulty = ['light', 'standard', 'deep'].includes(config.difficulty) ? config.difficulty : 'standard';
  const depth = depthConfig[config.evidenceDepth] ?? depthConfig.standard;
  const difficultyProfile = difficultyConfig[difficulty];
  const recordCount = Math.min(5, depth.records + difficultyProfile.extraRecords);
  const suffix = padded(index);
  const persona = buildGeneratedPersona(index, scenario);
  const { person, city, employer: personaEmployer, business, phone, email, address } = persona;
  const employer = [WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER].includes(domain.workflowType)
    ? business
    : personaEmployer;
  const id = `FA-${claimType.prefix}-G${String(index).slice(-8)}`;
  const trainingId = `TRN-GEN-${suffix}`;
  const accountId = `ACCT-${claimType.prefix}-${suffix}`;
  const reportedDate = dateFor(index);
  const issueStartDate = dateFor(index, 2);
  const caseParties = generatedParties({ id, index, domain, person, business, employer, scenario });
  const documents = makeDocuments({ id, index, claimType, scenario, recordCount, difficulty, person, business, employer, address, trainingId, reportedDate, issueStartDate });
  const toolResults = buildGeneratedToolResults({
    id,
    index,
    person,
    city,
    employer,
    business,
    phone,
    email,
    address,
    parties: caseParties,
    claimType: caseClaimType,
    scenario,
    documents,
    recordCount,
    trainingId,
    reportedDate,
    issueStartDate,
    difficulty,
  });
  const claimDetails = makeClaimDetails({ scenario, reportedDate, issueStartDate, transactionId: toolResults.transactions?.[0]?.id ?? `${id}-TXN-1` });
  const loginHistory = makeLoginHistory({ id, index, city, recordCount, claimType: caseClaimType, scenario, difficulty });
  const profileChanges = makeGeneratedProfileChanges({
    id,
    index,
    person,
    city,
    claimType,
    scenario,
    reportedDate,
    issueStartDate,
    loginHistory,
    paymentRecord: toolResults.paymentVerification?.[0],
  });
  const statementLabel = /business|vendor|payment contact/i.test(scenario.entityRole) ? 'Business statement' : /employee/i.test(scenario.entityRole) ? 'Employee statement' : /applicant/i.test(scenario.entityRole) ? 'Applicant statement' : 'Customer statement';
  const events = buildScenarioEvents({ id, scenario, claimType, reportedDate, issueStartDate, difficulty, evidenceDepth: depth.label, documents });
  const intake = { channel: scenario.channel, contactTime: `${reportedDate} - 9:05 AM`, customerLocation: city, statedDevice: loginHistory[0]?.device ?? 'No device statement required for this lane' };
  const profile = { person, trainingId, city, employer, business, entityRole: scenario.entityRole };
  const taxonomyTags = scenario.taxonomyTags ?? claimType.taxonomy;
  const customer = {
    relationshipSince: /existing|history/i.test(`${scenario.family} ${scenario.caseTruth?.classification}`) ? '2021' : index % 2 ? '2023' : '2026',
    segment: `${claimType.shortLabel} training profile`,
    contact: { phone, email, address, preferredChannel: scenario.channel },
    security: generatedSecuritySnapshot(loginHistory, phone, email),
    relationship: [
      { label: 'Account ID', value: accountId },
      { label: 'Open products', value: taxonomyTags.productRail },
      { label: 'Relationship context', value: taxonomyTags.lifecycleStage },
      { label: 'Primary entity', value: domain.customerType === CUSTOMER_TYPES.BUSINESS ? business : person },
    ],
    profileChanges,
  };
  toolResults.relationshipAccounts = getRelationshipAccounts({
    id,
    accountId,
    amount: scenario.amount,
    amountExposure: scenario.amount,
    customerType: domain.customerType,
    productType: domain.productType,
    workflowType: domain.workflowType,
    reportedDate,
    issueStartDate,
    customer,
    toolResults,
  });
  persistRelationshipFinancialHistory({
    id,
    domain,
    workflowType: domain.workflowType,
    reportedDate,
    profile,
    customer,
    toolResults,
  });
  if (caseClaimType.availableTools.includes('Payroll History')) {
    toolResults.payrollHistory = getPayrollHistory({
      id,
      accountId,
      amount: scenario.amount,
      amountExposure: scenario.amount,
      opened: 'Generated training case',
      reportedDate,
      issueStartDate,
      customerType: domain.customerType,
      productType: domain.productType,
      workflowType: domain.workflowType,
      relationshipDataVersion: CASE_RELATIONSHIP_DATA_VERSION,
      legacyDerivedEvidence: false,
      availableTools: caseClaimType.availableTools,
      profile,
      customer,
      parties: caseParties,
      toolResults,
      loginHistory,
      documents,
    });
  }
  const intakeAnswers = buildCaseIntakeAnswers({
    caseId: id,
    prompts: claimType.intakePrompts,
    statement: scenario.statement,
    person,
    entityRole: scenario.entityRole,
    business,
    employer,
    city,
    channel: scenario.channel,
    statedDevice: intake.statedDevice,
    reportedDate,
    issueStartDate,
    subtype: scenario.subtype,
    transactionInfo: scenario.transactionInfo,
    amount: scenario.amount,
    documents,
    toolResults,
    loginHistory,
    profileChanges,
    customer,
    customerType: domain.customerType,
    productType: domain.productType,
    workflowType: domain.workflowType,
  });
  const decisionData = buildScenarioDecisionData({ claimType, scenario, reportedDate, toolResults });
  const generatedSummary = buildGeneratedCaseSummary({
    person,
    scenario,
    employer,
    business,
    reportedDate,
    issueStartDate,
    documents,
  });
  const briefingPacket = buildCaseBriefingPacket({
    item: {
      id,
      customerType: domain.customerType,
      productType: domain.productType,
      workflowType: domain.workflowType,
      person,
      amount: scenario.amount,
      amountExposure: scenario.amount,
      priority: scenario.priority,
      subtype: scenario.subtype,
      scenarioFamily: scenario.family ?? claimType.lane,
      transactionInfo: scenario.transactionInfo,
      intake,
      profile,
      customer,
      toolResults,
      events,
      loginHistory,
      parties: caseParties,
    },
    claimType,
    scenario,
    reportedDate,
  });
  registerGeneratedCaseTruthSnapshot(id, hiddenTruth);

  return {
    id,
    caseId: id,
    claimId: `CLM-${claimType.prefix}-G${String(index).slice(-8)}`,
    domainSchemaVersion: CASE_DOMAIN_VERSION,
    relationshipViewSchemaVersion: CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION,
    relationshipDataVersion: CASE_RELATIONSHIP_DATA_VERSION,
    legacyDerivedEvidence: false,
    customerType: domain.customerType,
    customerTypeLabel: domainLabels.customerTypeLabel,
    productType: domain.productType,
    productTypeLabel: domainLabels.productTypeLabel,
    workflowType: domain.workflowType,
    workflowTypeLabel: domainLabels.workflowTypeLabel,
    alertReason: scenario.alertReason,
    reportedAllegation: scenario.reportedAllegation,
    suspectedPatterns: [],
    operationalDecision: null,
    finalFinding: null,
    findingBasis: '',
    claimTypeId: claimType.id,
    type: claimType.label,
    claimType: claimType.label,
    lane: claimType.lane,
    subtype: scenario.subtype,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    scenarioVariantId: scenario.variationId,
    scenarioVariant: scenario.variationLabel,
    scenarioFamily: scenario.family ?? claimType.lane,
    plainEnglishMeaning: scenario.plainEnglishMeaning,
    timelinePattern: scenario.timelinePattern,
    commonMistake: scenario.commonMistake,
    miniExample: scenario.miniExample,
    scenarioTruthId: scenario.scenarioTruthId,
    generatedPacketVersion: 7,
    difficulty,
    evidenceDepth: depth.label,
    priority: scenario.priority,
    status: toolResults.merchantIntelligence?.response?.status === 'Accepted'
      ? 'Merchant accepted — account credit review'
      : toolResults.merchantIntelligence?.response?.status === 'Challenged'
        ? 'Merchant challenged — customer evidence pending'
        : toolResults.merchantIntelligence?.response?.status === 'Pending'
          ? 'Submitted — merchant response pending'
          : 'Generated',
    person,
    trainingId,
    accountId,
    amount: scenario.amount,
    amountExposure: scenario.amount,
    opened: 'Generated training case',
    reportedDate,
    issueStartDate,
    title: scenario.title,
    transactionInfo: scenario.transactionInfo,
    shortSummary: generatedSummary,
    allegation: scenario.reportedAllegation,
    queueReason: `${domainLabels.customerTypeLabel} · ${domainLabels.productTypeLabel} · ${domainLabels.workflowTypeLabel} · ${scenario.alertReason}.`,
    statement: { label: statementLabel, value: scenario.statement, source: scenario.channel },
    assignedInvestigator: briefingPacket.assignedInvestigator,
    assignedDate: briefingPacket.assignedDate,
    assignmentTeam: briefingPacket.assignmentTeam,
    dueDate: briefingPacket.dueDate,
    parties: briefingPacket.parties,
    briefingDetails: briefingPacket.details,
    caseBriefing: {
      summary: generatedSummary,
      focusAreas: claimType.intakePrompts,
      evidenceAreas: claimType.evidenceAreas,
      scenarioTitle: scenario.title,
      scenarioVariantId: scenario.variationId,
      scenarioVariant: scenario.variationLabel,
      complexity: difficultyProfile.label,
      assignedInvestigator: briefingPacket.assignedInvestigator,
      assignedDate: briefingPacket.assignedDate,
      assignmentTeam: briefingPacket.assignmentTeam,
      dueDate: briefingPacket.dueDate,
      parties: briefingPacket.parties,
      details: briefingPacket.details,
    },
    intake,
    claimDetails,
    merchantResponse: toolResults.merchantIntelligence?.response,
    intakeAnswers,
    briefingQuestions: claimType.intakePrompts,
    keyFacts: [
      ['Customer type', domainLabels.customerTypeLabel], ['Product', domainLabels.productTypeLabel], ['Review workflow', domainLabels.workflowTypeLabel], ['Alert reason', scenario.alertReason], ['Reported date', reportedDate], ['Issue start date', issueStartDate], ['Amount / exposure', scenario.amount], ['Difficulty', difficultyProfile.label], ['Evidence depth', depth.label],
    ],
    productsAccounts: [{ label: 'Customer type', value: domainLabels.customerTypeLabel }, { label: 'Product', value: domainLabels.productTypeLabel }, { label: 'Review workflow', value: domainLabels.workflowTypeLabel }, { label: 'Entity role', value: scenario.entityRole }, { label: 'Primary account context', value: scenario.transactionInfo }],
    availableTools: caseClaimType.availableTools,
    requiredTools: caseClaimType.requiredTools,
    evidenceAreas: claimType.evidenceAreas,
    expectedEvidenceCategories: scenario.expectedEvidence ?? claimType.evidenceAreas,
    taxonomyTags,
    profile,
    customer,
    identityRecords: [
      ...(toolResults.identityReport ?? []),
      {
        id: `${id}-IDR-3`,
        type: 'Address record',
        label: 'Address record',
        value: address,
        observed: issueStartDate,
        lastSeen: issueStartDate,
        history: `${address} was the recorded profile address when the activity window began ${issueStartDate}.`,
      },
      ...(toolResults.applicationVerification ?? []),
    ].map((record) => ({
      ...record,
      type: record.type ?? record.label ?? 'Source record',
      lastSeen: record.lastSeen ?? record.observed ?? reportedDate,
      history: record.history ?? record.context ?? 'Fictional source record available for comparison.',
    })),
    loginHistory,
    events,
    timelineEvents: events,
    documents,
    evidenceDocuments: documents,
    documentRequests: toolResults.documents,
    toolResults,
    facts: ['Generated training case', 'No final outcome shown', 'No outcome is displayed during active investigation', 'Evidence First lock active', `${difficultyProfile.label} / ${depth.label} packet depth`, difficulty === 'deep' ? 'Two cross-source dependencies require reconciliation' : difficulty === 'standard' ? 'One cross-source comparison requires reconciliation' : 'Focused evidence path'],
    progress: ['Case Summary'],
    links: ['Customer or entity', 'Case event', 'Document', ...(toolResults.paymentVerification?.length ? ['Payment object'] : []), ...(toolResults.merchantIntelligence ? ['Merchant and order objects'] : [])],
    actionLog: [{ id: `${id}-ACT-1`, time: `${reportedDate} - 9:05 AM`, action: 'Generated case created', detail: `${domainLabels.customerTypeLabel} ${domainLabels.productTypeLabel} — ${domainLabels.workflowTypeLabel} added to the training queue.`, source: 'Scenario generator' }],
    creditDecision: decisionData.creditDecision,
    chargebackDecision: decisionData.chargebackDecision,
    scoringRules: {
      difficulty,
      difficultyProfile: difficultyProfile.label,
      evidenceDepth: depth.label,
      debriefLockedUntilSubmission: true,
      complexityDependencies: difficulty === 'deep' ? 2 : difficulty === 'standard' ? 1 : 0,
      missingDocumentCount: documents.filter((document) => document.status === 'Requested').length,
    },
  };
}

export function getGeneratedCaseTruth(caseOrId, { submitted = false } = {}) {
  if (!submitted) return undefined;
  const item = typeof caseOrId === 'object' && caseOrId !== null ? caseOrId : undefined;
  const caseId = item?.id ?? item?.caseId ?? caseOrId;
  const inMemoryTruth = generatedTruthByCaseId.get(String(caseId ?? ''));
  const truth = inMemoryTruth ?? (
    item?.workflowType && item?.scenarioId
      ? getScenarioTruth(item.workflowType, item.scenarioId)
      : undefined
  );
  if (!truth) return undefined;
  return cloneTruthSnapshot(truth);
}

export function readGeneratedCases() {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(generatedCaseStorageKey);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function writeGeneratedCases(cases = []) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(generatedCaseStorageKey, JSON.stringify(cases));
}

function nextGeneratedCaseIndex() {
  const fallback = Date.now();
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = Number(window.localStorage.getItem(generatedCaseSequenceKey));
    const next = Number.isFinite(saved) && saved >= fallback ? saved + 1 : fallback;
    window.localStorage.setItem(generatedCaseSequenceKey, String(next));
    return next;
  } catch {
    return fallback;
  }
}

export function addGeneratedCase(options = {}) {
  const current = readGeneratedCases();
  let seed = nextGeneratedCaseIndex();
  let nextCase = createGeneratedCase(seed, options);
  const existingIds = new Set(current.map((item) => item.id));
  while (existingIds.has(nextCase.id)) {
    seed += 1;
    nextCase = createGeneratedCase(seed, options);
  }
  writeGeneratedCases([nextCase, ...current]);
  return nextCase;
}
