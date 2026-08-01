import {
  CASE_DOMAIN_VERSION,
  CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION,
  CUSTOMER_TYPES,
  FINAL_FINDINGS,
  LEGACY_RELATIONSHIP_DATA_VERSION,
  PRODUCT_TYPES,
  SUSPECTED_PATTERNS,
  WORKFLOW_TYPES,
  caseDomainLabels,
  filterToolsForCaseDomain,
  getWorkflowType,
  hasOwnershipLinkedBusinessRelationship,
  normalizeToolName,
  normalizeToolNames,
  operationalDecisionsForWorkflow,
  validateCaseDomain,
} from './caseDomain.js';
import { storageKeys } from './persistenceKeys.js';

export const CASE_MIGRATION_VERSION = CASE_DOMAIN_VERSION;

const applicationScenarioPattern = /(?:synthetic|fake-application|income-inflation|new-business|owner-identity|revenue-mismatch|legitimacy|tradeline|application-verification|avr-)/i;
const businessPattern = /\b(?:business|payroll|vendor|beneficiary|company|entity|owner|administrator|approver|initiator|bec)\b/i;
const answerRevealingAlertPattern = /\b(?:fraud|synthetic[-_ ]identity|bust[-_ ]?out|first[-_ ]party|mule[-_ ]activity|email[-_ ]compromise|compromised[-_ ]mailbox|spoofed[-_ ]email|bec)\b/i;
const preSubmissionLeakPattern = /\b(?:fraud|synthetic[-_ ]identity|bust[-_ ]?out|first[-_ ]party|friendly[-_ ]fraud|mule[-_ ]activity|money[-_ ]mule|email[-_ ]compromise|business[-_ ]email[-_ ]compromise|compromised[-_ ]mailbox|spoofed[-_ ]email|mailbox[-_ ]compromise|look[-_ ]alike[-_ ]domain|reply[-_ ]to[-_ ]mismatch|mailbox[-_ ]rule|bec)\b/i;
const preservedLegacyEvidenceFields = [
  'transactionInfo',
  'statement',
  'intake',
  'intakeAnswers',
  'keyFacts',
  'productsAccounts',
  'caseBriefing',
  'briefingDetails',
  'facts',
  'events',
  'timelineEvents',
  'actionLog',
  'documents',
  'evidenceDocuments',
  'documentRequests',
  'toolResults',
  'identityRecords',
  'claimDetails',
  'merchantResponse',
  'loginHistory',
  'profile',
  'customer',
  'parties',
  'briefingQuestions',
  'evidenceAreas',
  'expectedEvidenceCategories',
  'links',
  'taxonomyTags',
  'creditDecision',
  'chargebackDecision',
];

function cleanText(value) {
  return String(value ?? '').trim();
}

function compactSerializableValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : compactSerializableValue(item)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, compactSerializableValue(item)]),
    );
  }
  return value;
}

function lowerContext(record = {}) {
  return [
    record.id,
    record.claimTypeId,
    record.claimType,
    record.type,
    record.lane,
    record.subtype,
    record.scenarioId,
    record.scenarioTitle,
    record.scenarioFamily,
    record.title,
    record.transactionInfo,
    record.profile?.entityRole,
    record.taxonomyTags?.lifecycleStage,
    record.taxonomyTags?.productRail,
    record.legacyMetadata?.claimTypeId,
    record.legacyMetadata?.claimType,
    record.legacyMetadata?.lane,
    record.legacyMetadata?.subtype,
    record.legacyMetadata?.scenarioId,
    record.legacyMetadata?.scenarioTitle,
  ].filter(Boolean).join(' ').toLowerCase();
}

function legacyClaimId(record = {}) {
  return cleanText(record.claimTypeId || record.legacyMetadata?.claimTypeId).toLowerCase();
}

function domainFromLegacyGeneratedId(record = {}) {
  const prefix = cleanText(record.id ?? record.caseId).match(/^FA-([A-Z]+)-G/i)?.[1]?.toUpperCase();
  const domains = {
    FCB: {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
    },
    NCB: {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
    },
    FPF: {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
    },
    ATO: {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER,
    },
    PAY: {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType: PRODUCT_TYPES.PAYROLL_PRODUCT,
      workflowType: WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
    },
    BEC: {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
      workflowType: WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
    },
    BLO: {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType: PRODUCT_TYPES.BUSINESS_LOAN,
      workflowType: WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    },
    AVR: {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
    },
    AWC: {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
      workflowType: WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
    },
  };
  return domains[prefix] ?? null;
}

function explicitDomain(record = {}) {
  const candidate = {
    customerType: record.customerType,
    productType: record.productType,
    workflowType: record.workflowType,
  };
  return validateCaseDomain(candidate).valid ? candidate : null;
}

function isApplicationReview(record, context) {
  const lifecycle = cleanText(record.taxonomyTags?.lifecycleStage).toLowerCase();
  if (lifecycle === 'onboarding') return true;
  if (/account monitoring|existing .*account|portfolio monitoring|line usage|line increase|sudden draw/i.test(context)) return false;
  return applicationScenarioPattern.test(context);
}

function inferCreditDomain(record, context, business) {
  const applicationReview = isApplicationReview(record, context);
  if (business) {
    const productType = /credit line|line usage|line increase|sudden draw|available line/i.test(context)
      ? PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT
      : legacyClaimId(record) === 'business-loan-bust-out' || /business loan/i.test(context)
        ? PRODUCT_TYPES.BUSINESS_LOAN
        : PRODUCT_TYPES.BUSINESS_CREDIT_CARD;
    return {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType,
      workflowType: applicationReview
        ? WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
        : WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    };
  }
  return {
    customerType: CUSTOMER_TYPES.PERSONAL,
    productType: /credit line|line usage|line increase|available line/i.test(context)
      ? PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT
      : /\bloan\b/i.test(context) ? PRODUCT_TYPES.PERSONAL_LOAN : PRODUCT_TYPES.CREDIT_CARD,
    workflowType: applicationReview
      ? WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
      : WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
  };
}

export function classifyLegacyCase(record = {}) {
  const current = explicitDomain(record);
  const claimId = legacyClaimId(record);
  const context = lowerContext(record);
  if (current) {
    if (
      current.productType === PRODUCT_TYPES.PERSONAL_LOAN
      && /credit line|line usage|line increase|available line/i.test(context)
    ) return { ...current, productType: PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT };
    if (
      current.productType === PRODUCT_TYPES.BUSINESS_LOAN
      && /credit line|line usage|line increase|sudden draw|available line/i.test(context)
    ) return { ...current, productType: PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT };
    return current;
  }

  const business = businessPattern.test(context)
    || ['payroll-direct-deposit', 'email-bec', 'business-loan-bust-out', 'ach-wire-check'].includes(claimId);
  const generatedIdDomain = !claimId ? domainFromLegacyGeneratedId(record) : null;
  if (generatedIdDomain) return generatedIdDomain;

  if (claimId === 'fraud-chargeback' || /fraud chargeback claim/.test(context)) {
    return {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
    };
  }

  if (claimId === 'non-fraud-chargeback' || /non-fraud chargeback|merchant.*dispute/.test(context) || /^fa-cb-/i.test(record.id ?? '')) {
    return {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
    };
  }

  if (claimId === 'first-party-fraud' || /first-party fraud|friendly fraud/.test(context)) {
    return {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
    };
  }

  if (claimId === 'payroll-direct-deposit' || /payroll|direct deposit/.test(context)) {
    return {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType: PRODUCT_TYPES.PAYROLL_PRODUCT,
      workflowType: /admin.*portal|portal.*access|payroll.*account takeover/i.test(context)
        ? WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER
        : WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
    };
  }

  if (claimId === 'email-bec' || /email fraud|business email|bec|vendor payment instruction/.test(context)) {
    return {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
      workflowType: WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
    };
  }

  if (claimId === 'application-verification') {
    return {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: PRODUCT_TYPES.CREDIT_CARD,
      workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
    };
  }

  if (['credit-risk', 'business-loan-bust-out'].includes(claimId) || /credit risk|credit application|business loan|bust-out/.test(context) || /^fa-cr-/i.test(record.id ?? '')) {
    return inferCreditDomain(record, context, business);
  }

  if (claimId === 'ach-wire-check' || /\bach\b|\bwire\b|\bcheck\b|payment rail/.test(context)) {
    const paymentContext = [
      record.scenarioId,
      record.scenarioTitle,
      record.subtype,
      record.transactionInfo,
      record.statement?.value,
    ].filter(Boolean).join(' ');
    const workflowType = /\bwire\b|recovery|recall/i.test(paymentContext)
      ? WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW
      : /\bach\b/i.test(paymentContext)
        ? WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW
        : WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT;
    return {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
      workflowType,
    };
  }

  if (claimId === 'account-takeover' || /account takeover|account access/.test(context) || /^fa-ato-/i.test(record.id ?? '')) {
    const depositAccount = /\bdebit\b|checking|deposit account|external payee|external account|bank transfer/i.test(context)
      && !/credit card/i.test(context);
    return {
      customerType: CUSTOMER_TYPES.PERSONAL,
      productType: depositAccount ? PRODUCT_TYPES.DEPOSIT_ACCOUNT : PRODUCT_TYPES.CREDIT_CARD,
      workflowType: depositAccount
        ? WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER
        : WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER,
    };
  }

  if (business) {
    return {
      customerType: CUSTOMER_TYPES.BUSINESS,
      productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
      workflowType: WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
    };
  }

  return {
    customerType: CUSTOMER_TYPES.PERSONAL,
    productType: PRODUCT_TYPES.DEPOSIT_ACCOUNT,
    workflowType: WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
  };
}

function neutralAlertReason(domain) {
  const reasons = {
    [WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM]: 'Customer reported one or more card transactions as unauthorized.',
    [WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE]: 'Customer reported a merchant billing, cancellation, refund, delivery, or service issue.',
    [WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER]: 'Unusual card-account access or profile activity requires review.',
    [WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER]: 'Unusual personal-account access or profile activity requires review.',
    [WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM]: 'Customer reported an ACH transaction that requires authorization review.',
    [WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM]: 'Customer reported a wire transaction that requires authorization review.',
    [WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER]: 'Unusual business-account access or administrator activity requires review.',
    [WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT]: 'A business payment or instruction change requires review.',
    [WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW]: 'A business ACH transaction requires authorization and payment review.',
    [WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW]: 'A business wire transaction requires instruction and payment review.',
    [WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT]: 'A payroll employee, amount, timing, administrator, or destination change requires review.',
    [WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER]: 'Unusual payroll access, administrator, approval, or multi-record change activity requires review.',
    [WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW]: 'Credit application identity, eligibility, or submitted information requires review.',
    [WORKFLOW_TYPES.CREDIT_RISK_REVIEW]: 'Existing credit exposure or payment behavior requires risk review.',
  };
  return reasons[domain.workflowType] ?? 'A neutral system alert or reported allegation requires review.';
}

function neutralReportedAllegation(domain) {
  if (domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT) {
    return 'The platform observed a payroll employee, amount, timing, administrator, or destination change. How the change was requested is unknown at intake.';
  }
  if (domain.workflowType === WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT) {
    return 'A business payment or instruction change requires trusted verification before its source or validity is established.';
  }
  return `${neutralAlertReason(domain)} The alert or reported allegation remains unconfirmed pending investigation.`;
}

function reportedAllegation(record = {}, domain = classifyLegacyCase(record)) {
  const supplied = cleanText(record.reportedAllegation)
    || cleanText(record.statement?.value)
    || (typeof record.statement === 'string' ? cleanText(record.statement) : '')
    || cleanText(record.allegation);
  if (
    domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
    || domain.workflowType === WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT
    || preSubmissionLeakPattern.test(supplied)
  ) return neutralReportedAllegation(domain);
  return supplied || neutralReportedAllegation(domain);
}

function safePresentationText(value, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  if (!preSubmissionLeakPattern.test(text)) return text;
  const neutralized = text
    .replace(/\bsynthetic(?:[-_ ]identity)?(?:[-_ ]fraud)?\b/gi, 'identity-record inconsistency')
    .replace(/\bbust[-_ ]?out(?:[-_ ]fraud)?\b/gi, 'unusual post-approval credit behavior')
    .replace(/\b(?:first[-_ ]party|friendly)[-_ ]fraud\b/gi, 'customer-account involvement concern')
    .replace(/\b(?:money[-_ ])?mule[-_ ]activity\b/gi, 'destination-use concern')
    .replace(/\b(?:business[-_ ])?email[-_ ]compromise\b|\bBEC\b/gi, 'instruction-source concern')
    .replace(/\bcompromised[-_ ]mailbox\b|\bmailbox[-_ ]compromise\b/gi, 'mailbox-access concern')
    .replace(/\bspoofed[-_ ]email\b|\blook[-_ ]alike[-_ ]domain\b|\breply[-_ ]to[-_ ]mismatch\b|\bmailbox[-_ ]rule\b/gi, 'instruction-source inconsistency')
    .replace(/\bfraud(?:ulent)?\b/gi, 'adverse-activity')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return neutralized && !preSubmissionLeakPattern.test(neutralized) ? neutralized : fallback;
}

function safePresentationId(value, fallback) {
  const text = cleanText(value);
  return text && !preSubmissionLeakPattern.test(text) ? text : fallback;
}

function sanitizePresentationValue(value, fallback, key = '') {
  if (Array.isArray(value)) return value.map((item) => sanitizePresentationValue(item, fallback, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sanitizePresentationValue(item, fallback, key),
    ]));
  }
  if (
    key === 'status'
    && /^Closed\s*[—-]\s*Fraud$/i.test(cleanText(value))
  ) return value;
  if (typeof value === 'string' && preSubmissionLeakPattern.test(value)) {
    return safePresentationText(value, fallback);
  }
  return value;
}

function migratedIntakeAnswers(record, domain, alertReason) {
  const answers = Array.isArray(record.intakeAnswers) ? record.intakeAnswers : [];
  if (domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT) {
    const replacements = [
      'Request method: Unknown at intake. The platform observed a payroll record or destination change.',
      'Review the business, affected employee, payroll history, change history, destination history, administrator activity, and timing.',
      'Trusted business contact has not yet been completed. If risk remains, use a previously known contact method.',
    ];
    return (answers.length ? answers : replacements.map((answer, index) => ({
      id: `${record.id}-INT-${index + 1}`,
      prompt: ['What change did the platform observe?', 'Which records are in scope?', 'What trusted verification is next?'][index],
      answer,
    }))).map((item, index) => ({
      ...item,
      prompt: safePresentationText(item.prompt, ['What change did the platform observe?', 'Which records are in scope?', 'What trusted verification is next?'][index % 3]),
      answer: replacements[index % replacements.length],
    }));
  }
  return answers.map((item) => ({
    ...item,
    prompt: safePresentationText(item.prompt, 'What does the available intake record establish?'),
    answer: safePresentationText(
      item.answer,
      `${alertReason} The intake record does not establish a final finding.`,
    ),
  }));
}

function migratedDocuments(documents, domain) {
  if (!Array.isArray(documents)) return documents;
  const gatesInstructionSource = [
    WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
    WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
  ].includes(domain.workflowType);
  if (!gatesInstructionSource) return documents;
  return documents.map((document) => {
    const text = `${document?.name ?? ''} ${document?.title ?? ''} ${document?.detail ?? ''} ${document?.preview ?? ''}`;
    if (!/(?:email|mailbox|header|reply-to|sender domain)/i.test(text)) return document;
    return {
      ...document,
      name: document.name ? 'Instruction-source record' : document.name,
      title: document.title ? 'Instruction-source record' : document.title,
      status: 'Requested',
      detail: document.detail ? 'Available only if the business supplies it after trusted contact.' : document.detail,
      preview: document.preview ? 'Available only if the business supplies it after trusted contact.' : document.preview,
    };
  });
}

function legacyCaseMetadata(record = {}) {
  return {
    ...(record.legacyMetadata ?? {}),
    migrationVersion: Math.max(
      Number(record.legacyMetadata?.migrationVersion) || 0,
      CASE_MIGRATION_VERSION,
    ),
    sourceDomainSchemaVersion: record.legacyMetadata?.sourceDomainSchemaVersion
      ?? (Number(record.domainSchemaVersion) || 0),
    claimTypeId: record.legacyMetadata?.claimTypeId ?? record.claimTypeId ?? null,
    claimType: record.legacyMetadata?.claimType ?? record.claimType ?? record.type ?? null,
    lane: record.legacyMetadata?.lane ?? record.lane ?? null,
    subtype: record.legacyMetadata?.subtype ?? record.subtype ?? null,
    scenarioId: record.legacyMetadata?.scenarioId ?? record.scenarioId ?? null,
    scenarioTitle: record.legacyMetadata?.scenarioTitle ?? record.scenarioTitle ?? record.title ?? null,
    alertReason: record.legacyMetadata?.alertReason ?? record.alertReason ?? null,
    transactionInfo: record.legacyMetadata?.transactionInfo ?? record.transactionInfo ?? null,
  };
}

function relationshipViewCompatibility(record, domain) {
  const suppliedDataVersion = Number(record.relationshipDataVersion);
  const hasRelationshipDataVersion = Number.isInteger(suppliedDataVersion)
    && suppliedDataVersion >= LEGACY_RELATIONSHIP_DATA_VERSION;
  const relationshipDataVersion = hasRelationshipDataVersion
    ? suppliedDataVersion
    : LEGACY_RELATIONSHIP_DATA_VERSION;

  const availableTools = Array.isArray(record.availableTools)
    ? (
        hasOwnershipLinkedBusinessRelationship(domain)
          ? [...new Set([...record.availableTools, 'Business 360'])]
          : record.availableTools
      )
    : record.availableTools;
  return {
    relationshipViewSchemaVersion: Math.max(
      Number(record.relationshipViewSchemaVersion) || 0,
      CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION,
    ),
    relationshipDataVersion,
    legacyDerivedEvidence: relationshipDataVersion === LEGACY_RELATIONSHIP_DATA_VERSION
      ? true
      : typeof record.legacyDerivedEvidence === 'boolean'
        ? record.legacyDerivedEvidence
        : false,
    availableTools: Array.isArray(availableTools)
      ? filterToolsForCaseDomain(availableTools, domain)
      : availableTools,
    requiredTools: Array.isArray(record.requiredTools)
      ? filterToolsForCaseDomain(record.requiredTools, domain)
      : record.requiredTools,
  };
}

export function migrateGeneratedCase(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const authoritativeDomain = explicitDomain(record);
  if (
    (
      domainAuthority(record) >= CASE_MIGRATION_VERSION
      || Number(record.legacyMetadata?.migrationVersion) >= CASE_MIGRATION_VERSION
    )
    && authoritativeDomain
  ) {
    const routingDomain = { ...record, ...authoritativeDomain };
    const next = {
      ...record,
      ...relationshipViewCompatibility(record, routingDomain),
    };
    return JSON.stringify(next) === JSON.stringify(record) ? record : next;
  }
  const domain = classifyLegacyCase(record);
  const routingDomain = { ...record, ...domain };
  const labels = caseDomainLabels(domain);
  const workflowLabel = labels.workflowTypeLabel || getWorkflowType(domain.workflowType)?.label || 'Case Review';
  const existingAlertReason = cleanText(record.alertReason);
  const forceNeutralIntake = [
    WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
    WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
  ].includes(domain.workflowType);
  const preserveExistingAlertReason = !forceNeutralIntake
    && (
      domainAuthority(record) >= CASE_MIGRATION_VERSION
      || !answerRevealingAlertPattern.test(existingAlertReason)
    );
  const alertReason = preserveExistingAlertReason && existingAlertReason
    ? existingAlertReason
    : neutralAlertReason(domain);
  const allegation = reportedAllegation(record, domain);
  const neutralSummary = `${labels.customerTypeLabel} ${labels.productTypeLabel} — ${workflowLabel}. ${alertReason}`;
  const neutralScenarioBase = alertReason.replace(/[.!?]+$/, '');
  const neutralScenarioTitle = /\breview$/i.test(neutralScenarioBase)
    ? neutralScenarioBase
    : `${neutralScenarioBase} review`;
  const transactionInfo = safePresentationText(
    record.transactionInfo,
    `${workflowLabel} activity record available for investigation`,
  );
  const migratedTruth = migrateLegacyCaseTruth(record);
  const eventFallback = `${workflowLabel} activity record available for investigation.`;
  const events = sanitizePresentationValue(record.events, eventFallback);
  const timelineEvents = sanitizePresentationValue(record.timelineEvents ?? record.events, eventFallback);
  const actionLog = sanitizePresentationValue(record.actionLog, `${workflowLabel} case activity recorded.`);
  const documents = sanitizePresentationValue(
    migratedDocuments(record.documents, domain),
    'Evidence document available for neutral investigation.',
  );
  const evidenceDocuments = sanitizePresentationValue(
    migratedDocuments(record.evidenceDocuments, domain),
    'Evidence document available for neutral investigation.',
  );
  const documentRequests = sanitizePresentationValue(
    migratedDocuments(record.documentRequests, domain),
    'Evidence document available for neutral investigation.',
  );
  const toolResults = sanitizePresentationValue(
    record.toolResults,
    domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
      ? 'Payroll change evidence requires trusted verification.'
      : `${workflowLabel} evidence available for neutral investigation.`,
  );
  const neutralScenarioId = `${domain.workflowType}-legacy-review`;
  const sanitizedCaseBriefing = sanitizePresentationValue(
    record.caseBriefing,
    'Case briefing detail available for neutral investigation.',
  );
  const next = {
    ...record,
    domainSchemaVersion: Math.max(
      Number(record.domainSchemaVersion) || 0,
      CASE_MIGRATION_VERSION,
    ),
    ...relationshipViewCompatibility(record, routingDomain),
    ...domain,
    customerTypeLabel: labels.customerTypeLabel,
    productTypeLabel: labels.productTypeLabel,
    workflowTypeLabel: workflowLabel,
    alertReason,
    reportedAllegation: allegation,
    suspectedPatterns: Array.isArray(record.suspectedPatterns) ? [...record.suspectedPatterns] : [],
    operationalDecision: cleanText(record.operationalDecision),
    finalFinding: cleanText(record.finalFinding),
    findingBasis: cleanText(record.findingBasis),
    claimTypeId: domain.workflowType,
    type: workflowLabel,
    claimType: workflowLabel,
    lane: `${workflowLabel} investigation`,
    subtype: alertReason,
    scenarioId: safePresentationId(record.scenarioId, neutralScenarioId),
    scenarioTitle: neutralScenarioTitle,
    scenarioVariantId: safePresentationId(record.scenarioVariantId, `${neutralScenarioId}-variation`),
    scenarioVariant: safePresentationText(record.scenarioVariant, 'Legacy evidence variation'),
    scenarioFamily: workflowLabel,
    scenarioTruthId: safePresentationId(record.scenarioTruthId, `${domain.workflowType}:${neutralScenarioId}`),
    plainEnglishMeaning: safePresentationText(
      record.plainEnglishMeaning,
      'Review the available records without assuming a final finding.',
    ),
    timelinePattern: safePresentationText(
      record.timelinePattern,
      'Compare the recorded events, access, and evidence in time order.',
    ),
    commonMistake: safePresentationText(
      record.commonMistake,
      'Do not treat an alert, allegation, missing record, or linked account as an automatic conclusion.',
    ),
    miniExample: safePresentationText(
      record.miniExample,
      'A neutral alert requires evidence-based investigation before a finding is recorded.',
    ),
    title: neutralScenarioTitle,
    status: safePresentationText(record.status, 'Open — Review pending'),
    transactionInfo,
    shortSummary: safePresentationText(record.shortSummary, neutralSummary),
    allegation,
    queueReason: `${labels.customerTypeLabel} · ${labels.productTypeLabel} · ${workflowLabel} · ${alertReason}`,
    statement: record.statement && typeof record.statement === 'object'
      ? {
          ...record.statement,
          label: record.statement.label ?? 'Reported allegation',
          value: allegation,
          source: forceNeutralIntake
            ? domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
              ? 'Platform payroll alert'
              : 'Business review queue'
            : record.statement.source,
        }
      : { label: 'Reported allegation', value: allegation, source: forceNeutralIntake ? 'Case queue' : 'Legacy intake' },
    intake: {
      ...(record.intake ?? {}),
      channel: forceNeutralIntake
        ? domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
          ? 'Platform payroll alert'
          : 'Business review queue'
        : safePresentationText(record.intake?.channel, 'Legacy intake'),
    },
    intakeAnswers: migratedIntakeAnswers(record, domain, alertReason),
    keyFacts: [
      ['Customer type', labels.customerTypeLabel],
      ['Product', labels.productTypeLabel],
      ['Review workflow', workflowLabel],
      ['Alert reason', alertReason],
      ['Reported date', record.reportedDate ?? record.opened ?? 'Not supplied'],
      ['Issue start date', record.issueStartDate ?? 'Not supplied'],
      ['Amount / exposure', record.amountExposure ?? record.amount ?? 'Not supplied'],
      ['Difficulty', record.difficulty ?? 'Legacy packet'],
      ['Evidence depth', record.evidenceDepth ?? 'Legacy packet'],
    ],
    productsAccounts: [
      { label: 'Customer type', value: labels.customerTypeLabel },
      { label: 'Product', value: labels.productTypeLabel },
      { label: 'Review workflow', value: workflowLabel },
      { label: 'Primary account context', value: transactionInfo },
    ],
    caseBriefing: {
      ...(sanitizedCaseBriefing ?? {}),
      summary: safePresentationText(record.caseBriefing?.summary, neutralSummary),
      scenarioTitle: neutralScenarioTitle,
      scenarioVariantId: `${neutralScenarioId}-variation`,
      scenarioVariant: record.caseBriefing?.scenarioVariant ? 'Legacy evidence variation' : record.caseBriefing?.scenarioVariant,
      focusAreas: sanitizePresentationValue(
        record.caseBriefing?.focusAreas,
        'Review the available records without assuming a final finding.',
      ),
    },
    briefingDetails: sanitizePresentationValue(
      record.briefingDetails,
      'Evidence detail available for neutral investigation.',
    ),
    facts: sanitizePresentationValue(record.facts, 'Evidence item available for investigation.'),
    events,
    timelineEvents,
    actionLog,
    documents,
    evidenceDocuments,
    documentRequests,
    toolResults,
    identityRecords: sanitizePresentationValue(
      record.identityRecords,
      'Identity evidence available for neutral investigation.',
    ),
    claimDetails: sanitizePresentationValue(
      record.claimDetails,
      'Claim detail available for neutral investigation.',
    ),
    merchantResponse: sanitizePresentationValue(
      record.merchantResponse,
      'Merchant response available for neutral investigation.',
    ),
    loginHistory: sanitizePresentationValue(
      record.loginHistory,
      'Access record available for neutral investigation.',
    ),
    profile: sanitizePresentationValue(
      record.profile,
      'Profile detail available for neutral investigation.',
    ),
    customer: sanitizePresentationValue(
      record.customer,
      'Customer detail available for neutral investigation.',
    ),
    parties: sanitizePresentationValue(
      record.parties,
      'Party detail available for neutral investigation.',
    ),
    briefingQuestions: sanitizePresentationValue(
      record.briefingQuestions,
      'Review the available evidence without assuming a final finding.',
    ),
    availableTools: Array.isArray(record.availableTools)
      ? filterToolsForCaseDomain(
          hasOwnershipLinkedBusinessRelationship(routingDomain)
            ? [
                ...sanitizePresentationValue(record.availableTools, 'Investigation tool'),
                'Business 360',
              ]
            : sanitizePresentationValue(record.availableTools, 'Investigation tool'),
          routingDomain,
        )
      : record.availableTools,
    requiredTools: Array.isArray(record.requiredTools)
      ? filterToolsForCaseDomain(
          sanitizePresentationValue(record.requiredTools, 'Investigation tool'),
          routingDomain,
        )
      : record.requiredTools,
    evidenceAreas: sanitizePresentationValue(
      record.evidenceAreas,
      'Evidence area',
    ),
    expectedEvidenceCategories: sanitizePresentationValue(
      record.expectedEvidenceCategories,
      'Evidence area',
    ),
    links: sanitizePresentationValue(
      record.links,
      'Related investigation object',
    ),
    taxonomyTags: sanitizePresentationValue(
      record.taxonomyTags,
      'Legacy taxonomy value',
    ),
    creditDecision: sanitizePresentationValue(
      record.creditDecision,
      'Credit decision evidence available for review.',
    ),
    chargebackDecision: sanitizePresentationValue(
      record.chargebackDecision,
      'Claim decision evidence available for review.',
    ),
    caseTruth: migratedTruth,
    correctDetermination: migratedTruth?.operationalDecision ?? migratedTruth?.correctDetermination,
    scoringRules: record.scoringRules
      ? {
          ...record.scoringRules,
          acceptedDeterminations: migratedTruth?.acceptedDeterminations ?? [],
        }
      : record.scoringRules,
    legacyMetadata: legacyCaseMetadata(record),
  };
  // Domain migration is additive. Keep the learner's persisted evidence packet
  // exactly as generated or worked; neutralization belongs to the disposable
  // pre-submission presentation clone built below.
  for (const field of preservedLegacyEvidenceFields) {
    if (Object.hasOwn(record, field)) next[field] = record[field];
  }
  const compactNext = compactSerializableValue(next);
  return JSON.stringify(compactNext) === JSON.stringify(record) ? record : compactNext;
}

export function migrateGeneratedCases(records = []) {
  return Array.isArray(records) ? records.map(migrateGeneratedCase) : [];
}

function publicEvidenceFields(record) {
  const domain = classifyLegacyCase(record);
  const workflowLabel = caseDomainLabels(domain).workflowTypeLabel
    || getWorkflowType(domain.workflowType)?.label
    || 'Case Review';
  const fallbacks = {
    transactionInfo: `${workflowLabel} activity record available for investigation`,
    statement: 'Reported allegation available for neutral investigation.',
    intake: 'Legacy intake detail available for neutral investigation.',
    intakeAnswers: 'Intake evidence available for neutral investigation.',
    keyFacts: 'Case fact available for neutral investigation.',
    productsAccounts: 'Account relationship available for neutral investigation.',
    caseBriefing: 'Case briefing detail available for neutral investigation.',
    briefingDetails: 'Evidence detail available for neutral investigation.',
    facts: 'Evidence item available for investigation.',
    events: `${workflowLabel} activity record available for investigation.`,
    timelineEvents: `${workflowLabel} activity record available for investigation.`,
    actionLog: `${workflowLabel} case activity recorded.`,
    documents: 'Evidence document available for neutral investigation.',
    evidenceDocuments: 'Evidence document available for neutral investigation.',
    documentRequests: 'Evidence document available for neutral investigation.',
    toolResults: `${workflowLabel} evidence available for neutral investigation.`,
    identityRecords: 'Identity evidence available for neutral investigation.',
    claimDetails: 'Claim detail available for neutral investigation.',
    merchantResponse: 'Merchant response available for neutral investigation.',
    loginHistory: 'Access record available for neutral investigation.',
    profile: 'Profile detail available for neutral investigation.',
    customer: 'Customer detail available for neutral investigation.',
    parties: 'Party detail available for neutral investigation.',
    briefingQuestions: 'Review the available evidence without assuming a final finding.',
    evidenceAreas: 'Evidence area',
    expectedEvidenceCategories: 'Evidence area',
    links: 'Related investigation object',
    taxonomyTags: 'Legacy taxonomy value',
    creditDecision: 'Credit decision evidence available for review.',
    chargebackDecision: 'Claim decision evidence available for review.',
  };
  const next = {
    suspectedPatterns: [],
    operationalDecision: null,
    finalFinding: null,
    findingBasis: '',
  };
  for (const field of preservedLegacyEvidenceFields) {
    if (!Object.hasOwn(record, field)) continue;
    const source = ['documents', 'evidenceDocuments', 'documentRequests'].includes(field)
      ? migratedDocuments(record[field], domain)
      : record[field];
    next[field] = sanitizePresentationValue(source, fallbacks[field] ?? 'Evidence available for neutral investigation.');
  }
  if (Object.hasOwn(record, 'transactionInfo')) {
    next.transactionInfo = safePresentationText(record.transactionInfo, fallbacks.transactionInfo);
  }
  return next;
}

function publicPresentationFields(record) {
  const domain = classifyLegacyCase(record);
  const labels = caseDomainLabels(domain);
  const workflowLabel = labels.workflowTypeLabel || getWorkflowType(domain.workflowType)?.label || 'Case Review';
  const alertReason = safePresentationText(record.alertReason, neutralAlertReason(domain));
  const allegation = reportedAllegation(record, domain);
  const forceNeutralIntake = [
    WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
    WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
  ].includes(domain.workflowType);
  const neutralSummary = `${labels.customerTypeLabel} ${labels.productTypeLabel} — ${workflowLabel}. ${alertReason}`;
  const neutralScenarioBase = alertReason.replace(/[.!?]+$/, '');
  const neutralScenarioTitle = /\breview$/i.test(neutralScenarioBase)
    ? neutralScenarioBase
    : `${neutralScenarioBase} review`;
  const neutralScenarioId = `${domain.workflowType}-legacy-review`;
  const eventFallback = `${workflowLabel} activity record available for investigation.`;
  const sanitizedStatement = sanitizePresentationValue(
    record.statement,
    'Reported allegation available for neutral investigation.',
  );
  const sanitizedIntake = sanitizePresentationValue(
    record.intake,
    'Legacy intake detail available for neutral investigation.',
  );
  const sanitizedCaseBriefing = sanitizePresentationValue(
    record.caseBriefing,
    'Case briefing detail available for neutral investigation.',
  );

  return {
    suspectedPatterns: [],
    operationalDecision: null,
    finalFinding: null,
    findingBasis: '',
    transactionInfo: safePresentationText(
      record.transactionInfo,
      `${workflowLabel} activity record available for investigation`,
    ),
    statement: record.statement && typeof record.statement === 'object'
      ? {
          ...(sanitizedStatement ?? {}),
          label: safePresentationText(record.statement.label, 'Reported allegation'),
          value: allegation,
          source: forceNeutralIntake
            ? domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
              ? 'Platform payroll alert'
              : 'Business review queue'
            : safePresentationText(record.statement.source, 'Legacy intake'),
        }
      : {
          label: 'Reported allegation',
          value: allegation,
          source: forceNeutralIntake ? 'Case queue' : 'Legacy intake',
        },
    intake: {
      ...(sanitizedIntake ?? {}),
      channel: forceNeutralIntake
        ? domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
          ? 'Platform payroll alert'
          : 'Business review queue'
        : safePresentationText(record.intake?.channel, 'Legacy intake'),
    },
    intakeAnswers: migratedIntakeAnswers(record, domain, alertReason),
    keyFacts: [
      ['Customer type', labels.customerTypeLabel],
      ['Product', labels.productTypeLabel],
      ['Review workflow', workflowLabel],
      ['Alert reason', alertReason],
      ['Reported date', record.reportedDate ?? record.opened ?? 'Not supplied'],
      ['Issue start date', record.issueStartDate ?? 'Not supplied'],
      ['Amount / exposure', record.amountExposure ?? record.amount ?? 'Not supplied'],
      ['Difficulty', record.difficulty ?? 'Legacy packet'],
      ['Evidence depth', record.evidenceDepth ?? 'Legacy packet'],
    ],
    productsAccounts: [
      { label: 'Customer type', value: labels.customerTypeLabel },
      { label: 'Product', value: labels.productTypeLabel },
      { label: 'Review workflow', value: workflowLabel },
      {
        label: 'Primary account context',
        value: safePresentationText(
          record.transactionInfo,
          `${workflowLabel} activity record available for investigation`,
        ),
      },
    ],
    caseBriefing: {
      ...(sanitizedCaseBriefing ?? {}),
      summary: safePresentationText(record.caseBriefing?.summary, neutralSummary),
      scenarioTitle: neutralScenarioTitle,
      scenarioVariantId: `${neutralScenarioId}-variation`,
      scenarioVariant: record.caseBriefing?.scenarioVariant ? 'Legacy evidence variation' : record.caseBriefing?.scenarioVariant,
      focusAreas: sanitizePresentationValue(
        record.caseBriefing?.focusAreas,
        'Review the available records without assuming a final finding.',
      ),
    },
    briefingDetails: sanitizePresentationValue(
      record.briefingDetails,
      'Evidence detail available for neutral investigation.',
    ),
    facts: sanitizePresentationValue(record.facts, 'Evidence item available for investigation.'),
    events: sanitizePresentationValue(record.events, eventFallback),
    timelineEvents: sanitizePresentationValue(record.timelineEvents ?? record.events, eventFallback),
    actionLog: sanitizePresentationValue(record.actionLog, `${workflowLabel} case activity recorded.`),
    documents: sanitizePresentationValue(
      migratedDocuments(record.documents, domain),
      'Evidence document available for neutral investigation.',
    ),
    evidenceDocuments: sanitizePresentationValue(
      migratedDocuments(record.evidenceDocuments, domain),
      'Evidence document available for neutral investigation.',
    ),
    documentRequests: sanitizePresentationValue(
      migratedDocuments(record.documentRequests, domain),
      'Evidence document available for neutral investigation.',
    ),
    toolResults: sanitizePresentationValue(
      record.toolResults,
      domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
        ? 'Payroll change evidence requires trusted verification.'
        : `${workflowLabel} evidence available for neutral investigation.`,
    ),
    identityRecords: sanitizePresentationValue(
      record.identityRecords,
      'Identity evidence available for neutral investigation.',
    ),
    claimDetails: sanitizePresentationValue(
      record.claimDetails,
      'Claim detail available for neutral investigation.',
    ),
    merchantResponse: sanitizePresentationValue(
      record.merchantResponse,
      'Merchant response available for neutral investigation.',
    ),
    loginHistory: sanitizePresentationValue(
      record.loginHistory,
      'Access record available for neutral investigation.',
    ),
    profile: sanitizePresentationValue(
      record.profile,
      'Profile detail available for neutral investigation.',
    ),
    customer: sanitizePresentationValue(
      record.customer,
      'Customer detail available for neutral investigation.',
    ),
    parties: sanitizePresentationValue(
      record.parties,
      'Party detail available for neutral investigation.',
    ),
    briefingQuestions: sanitizePresentationValue(
      record.briefingQuestions,
      'Review the available evidence without assuming a final finding.',
    ),
    evidenceAreas: sanitizePresentationValue(record.evidenceAreas, 'Evidence area'),
    expectedEvidenceCategories: sanitizePresentationValue(
      record.expectedEvidenceCategories,
      'Evidence area',
    ),
    links: sanitizePresentationValue(record.links, 'Related investigation object'),
    taxonomyTags: sanitizePresentationValue(record.taxonomyTags, 'Legacy taxonomy value'),
    creditDecision: sanitizePresentationValue(
      record.creditDecision,
      'Credit decision evidence available for review.',
    ),
    chargebackDecision: sanitizePresentationValue(
      record.chargebackDecision,
      'Claim decision evidence available for review.',
    ),
  };
}

export function persistedGeneratedCaseRecord(record) {
  const migrated = migrateGeneratedCase(record);
  if (!migrated || typeof migrated !== 'object' || Array.isArray(migrated)) return migrated;
  const next = { ...migrated };
  delete next.caseTruth;
  delete next.correctDetermination;
  delete next.debriefLogic;
  delete next.howItHappens;
  if (next.scoringRules && typeof next.scoringRules === 'object') {
    const scoringRules = { ...next.scoringRules };
    delete scoringRules.acceptedDeterminations;
    next.scoringRules = scoringRules;
  }
  return compactSerializableValue(next);
}

export function publicGeneratedCaseRecord(record) {
  const persisted = persistedGeneratedCaseRecord(record);
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return persisted;
  const legacyPresentation = persisted.legacyMetadata
    && Number(persisted.legacyMetadata.sourceDomainSchemaVersion) < CASE_MIGRATION_VERSION;
  return compactSerializableValue({
    ...persisted,
    ...(legacyPresentation
      ? publicPresentationFields(persisted)
      : publicEvidenceFields(persisted)),
  });
}

function preferredMoreInformationDecision(workflowType) {
  if (workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW || workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    return 'Request More Information';
  }
  if ([
    WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
    WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
    WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
    WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
    WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW,
    WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
  ].includes(workflowType)) return 'More Information Needed';
  return 'Insufficient Evidence';
}

export function normalizeLegacyOperationalDecision(choice, workflowType) {
  const clean = cleanText(choice);
  if (!clean) return '';
  const allowed = operationalDecisionsForWorkflow(workflowType);
  if (allowed.includes(clean)) return clean;
  const normalized = clean.toLowerCase();
  const supportsClaim = /support customer claim|approve claim|customer claim supported/.test(normalized)
    && !/do not|not supported|deny/.test(normalized);
  const doesNotSupportClaim = /do not support|deny claim|customer claim not supported/.test(normalized);
  const asksForMoreInformation = /more information|request|pending additional|continue investigation|unable to verify|no action yet/.test(normalized);
  const routesOrEscalates = /escalate|route|refer|secondary .*review|representment/.test(normalized);

  if (workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    if (/support credit request|approve/.test(normalized) && !/do not|not support|deny/.test(normalized)) return 'Approve';
    if (/do not support credit request|deny/.test(normalized)) return 'Deny';
    if (asksForMoreInformation || /\bhold\b|documentation/.test(normalized)) return 'Request More Information';
    return 'Escalate';
  }

  if (workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    if (/maintain|support credit request/.test(normalized) && !/do not|not support/.test(normalized)) return 'Maintain';
    if (/restrict|reduce|do not support credit request/.test(normalized)) return 'Restrict / Reduce';
    if (/\bhold\b/.test(normalized)) return 'Hold';
    if (asksForMoreInformation || /documentation/.test(normalized)) return 'Request More Information';
    return 'Escalate';
  }

  if ([
    WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
    WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
    WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
    WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW,
    WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
  ].includes(workflowType)) {
    if (/release/.test(normalized) || doesNotSupportClaim) return 'Release';
    if (/\bhold\b/.test(normalized) || supportsClaim) return 'Hold';
    if (asksForMoreInformation || /documentation|insufficient/.test(normalized)) return 'More Information Needed';
    return 'Escalate';
  }

  if ([
    WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER,
    WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
    WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
  ].includes(workflowType)) {
    if (/maintain|release/.test(normalized) || doesNotSupportClaim) return 'Maintain';
    if (/restrict/.test(normalized) || supportsClaim) return 'Restrict';
    if (/\bhold\b/.test(normalized)) return 'Hold';
    if (asksForMoreInformation || /documentation|insufficient/.test(normalized)) return 'More Information Needed';
    return 'Escalate';
  }

  if (/partial/.test(normalized) && allowed.includes('Partial Credit')) return 'Partial Credit';
  if (doesNotSupportClaim && allowed.includes('Do Not Support Customer Claim')) return 'Do Not Support Customer Claim';
  if (supportsClaim && allowed.includes('Support Customer Claim')) return 'Support Customer Claim';
  if (asksForMoreInformation || /documentation|insufficient|\bhold\b/.test(normalized)) {
    const next = preferredMoreInformationDecision(workflowType);
    if (allowed.includes(next)) return next;
  }
  if (routesOrEscalates && allowed.includes('Escalate')) return 'Escalate';
  return allowed.includes('Escalate') ? 'Escalate' : clean;
}

function inferredLegacyPatterns(record, truth = {}) {
  const value = [
    record.legacyMetadata?.claimType,
    record.legacyMetadata?.subtype,
    record.subtype,
    record.scenarioTitle,
    truth.finalFinding,
    truth.classification,
    truth.rationale,
    truth.findingBasis,
  ].filter(Boolean).join(' ').toLowerCase();
  const patterns = [...(Array.isArray(truth.suspectedPatterns) ? truth.suspectedPatterns : [])];
  if (/synthetic/.test(value)) patterns.push(SUSPECTED_PATTERNS.SYNTHETIC_IDENTITY);
  if (/bust[- ]?out|sleeper llc|rapid credit (?:line|facility) stacking/.test(value)) patterns.push(SUSPECTED_PATTERNS.BUST_OUT);
  if (/first[- ]party|friendly fraud|household member use|digital goods used|refund\/return abuse/.test(value)) {
    patterns.push(SUSPECTED_PATTERNS.FIRST_PARTY_FRAUD);
  }
  if (/email compromise|business email compromise|compromised mailbox|spoofed email|look-alike domain|mailbox rule|reply-to mismatch/.test(value)) {
    patterns.push(SUSPECTED_PATTERNS.EMAIL_COMPROMISE_BEC);
  }
  if (/stolen identity/.test(value)) patterns.push(SUSPECTED_PATTERNS.STOLEN_IDENTITY);
  if (/business legitimacy|fabricated business|tradeline.*unrelated/.test(value)) {
    patterns.push(SUSPECTED_PATTERNS.FABRICATED_BUSINESS_INFORMATION);
  }
  if (/owner identity|owner mismatch/.test(value)) patterns.push(SUSPECTED_PATTERNS.OWNER_MISMATCH);
  return [...new Set(patterns)];
}

function inferLegacyFinalFinding(domain, operationalDecision, patterns, truth = {}) {
  if (Object.values(FINAL_FINDINGS).includes(truth.finalFinding)) return truth.finalFinding;
  const value = [
    truth.finalFinding,
    truth.classification,
    truth.rationale,
    truth.findingBasis,
  ].filter(Boolean).join(' ').toLowerCase();

  if (domain.workflowType === WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE) {
    return FINAL_FINDINGS.NON_FRAUD_DISPUTE;
  }
  if (domain.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    if (
      patterns.some((pattern) => [
        SUSPECTED_PATTERNS.SYNTHETIC_IDENTITY,
        SUSPECTED_PATTERNS.STOLEN_IDENTITY,
        SUSPECTED_PATTERNS.FABRICATED_BUSINESS_INFORMATION,
        SUSPECTED_PATTERNS.OWNER_MISMATCH,
      ].includes(pattern))
      && /established|confirmed|do not form|denied applying|conflict with source|unrelated businesses|cannot be independently supported/.test(value)
    ) return FINAL_FINDINGS.FRAUD_CONFIRMED;
    if (
      operationalDecision === 'Request More Information'
      || /missing|pending|not yet|plausible|may explain|cannot be reconciled automatically|lacks enough|unable to verify/.test(value)
    ) return FINAL_FINDINGS.VERIFICATION_INCOMPLETE;
    if (operationalDecision === 'Approve') return FINAL_FINDINGS.FRAUD_NOT_FOUND;
    return FINAL_FINDINGS.INCONCLUSIVE;
  }
  if (domain.workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    if (
      patterns.includes(SUSPECTED_PATTERNS.BUST_OUT)
      && /intentional|without current revenue|long-dormant.*large draw/.test(value)
    ) return FINAL_FINDINGS.FRAUD_CONFIRMED;
    return FINAL_FINDINGS.CREDIT_RISK_CONCERN;
  }
  if (['Do Not Support Customer Claim', 'Release', 'Maintain'].includes(operationalDecision)) {
    return FINAL_FINDINGS.FRAUD_NOT_FOUND;
  }
  if (['Partial Credit', 'Insufficient Evidence', 'More Information Needed', 'Request More Information', 'Escalate'].includes(operationalDecision)) {
    return FINAL_FINDINGS.INCONCLUSIVE;
  }
  if (
    /unauthorized|impersonator|look-alike|mailbox access|alteration|no valid authorization|denied the change|did not request|unrelated destination/.test(value)
  ) return FINAL_FINDINGS.FRAUD_CONFIRMED;
  return FINAL_FINDINGS.INCONCLUSIVE;
}

export function migrateLegacyCaseTruth(record = {}) {
  const rawTruth = record.caseTruth && typeof record.caseTruth === 'object' && !Array.isArray(record.caseTruth)
    ? record.caseTruth
    : {};
  const legacyOperationalDecision = cleanText(
    rawTruth.legacyOperationalDecision
    || rawTruth.correctDetermination
    || record.correctDetermination,
  );
  const hasTruth = Object.keys(rawTruth).length
    || legacyOperationalDecision
    || record.debriefLogic
    || record.howItHappens;
  if (!hasTruth) return undefined;
  const domain = classifyLegacyCase(record);
  const operationalDecision = normalizeLegacyOperationalDecision(
    rawTruth.operationalDecision || legacyOperationalDecision,
    domain.workflowType,
  );
  const legacyAcceptedDeterminations = Array.isArray(rawTruth.legacyAcceptedDeterminations)
    ? rawTruth.legacyAcceptedDeterminations
    : Array.isArray(rawTruth.acceptedDeterminations)
      ? rawTruth.acceptedDeterminations
      : legacyOperationalDecision
        ? [legacyOperationalDecision]
        : [];
  const acceptedDeterminations = [...new Set(
    legacyAcceptedDeterminations
      .map((choice) => normalizeLegacyOperationalDecision(choice, domain.workflowType))
      .filter(Boolean),
  )];
  if (operationalDecision && !acceptedDeterminations.includes(operationalDecision)) {
    acceptedDeterminations.push(operationalDecision);
  }
  const suspectedPatterns = inferredLegacyPatterns(record, rawTruth);
  const finalFinding = inferLegacyFinalFinding(
    domain,
    operationalDecision,
    suspectedPatterns,
    rawTruth,
  );
  const suppliedFindingBasis = cleanText(
    rawTruth.findingBasis
    || rawTruth.rationale
    || rawTruth.classification
    || record.howItHappens,
  );
  const evidenceIds = Array.isArray(rawTruth.evidenceIds)
    ? rawTruth.evidenceIds.map(cleanText).filter(Boolean)
    : [];
  const findingBasis = suppliedFindingBasis || (
    finalFinding === FINAL_FINDINGS.FRAUD_CONFIRMED && evidenceIds.length
      ? `The preserved legacy finding was tied to evidence record${evidenceIds.length === 1 ? '' : 's'} ${evidenceIds.join(', ')}. Review the preserved record details before relying on that finding in the current workflow.`
      : ''
  );

  return compactSerializableValue({
    ...rawTruth,
    suspectedPatterns,
    operationalDecision,
    finalFinding,
    findingBasis,
    correctDetermination: operationalDecision,
    acceptedDeterminations,
    legacyOperationalDecision,
    legacyAcceptedDeterminations,
    legacyFinalFinding: rawTruth.legacyFinalFinding ?? rawTruth.finalFinding ?? null,
    legacyDebriefLogic: rawTruth.legacyDebriefLogic ?? record.debriefLogic,
    legacyHowItHappens: rawTruth.legacyHowItHappens ?? record.howItHappens,
    legacyEvidence: rawTruth.legacyEvidence ?? {
      toolResults: record.toolResults,
      documents: record.documents,
      evidenceDocuments: record.evidenceDocuments,
      events: record.events,
      timelineEvents: record.timelineEvents,
      intakeAnswers: record.intakeAnswers,
    },
    legacyGatedEvidence: rawTruth.legacyGatedEvidence
      ?? (domain.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
        ? {
            intakeAnswers: record.intakeAnswers,
            statement: record.statement,
            toolResults: record.toolResults,
          }
        : undefined),
  });
}

function migrationContext(caseRecord = {}, savedRecord = {}) {
  return {
    ...savedRecord,
    ...caseRecord,
    id: caseRecord.id ?? savedRecord.caseId ?? savedRecord.id,
    claimTypeId: caseRecord.claimTypeId ?? savedRecord.claimTypeId,
    claimType: caseRecord.claimType ?? savedRecord.claimType,
    lane: caseRecord.lane ?? savedRecord.lane,
  };
}

function normalizeToolReferenceFields(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const next = { ...record };
  for (const key of ['source', 'sourceTool', 'tool', 'toolName', 'type']) {
    if (typeof next[key] === 'string') next[key] = normalizeToolName(next[key]);
  }
  return next;
}

export function normalizeCompletedToolsByCase(saved = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved ?? {};
  return Object.fromEntries(Object.entries(saved).map(([caseId, tools]) => [
    caseId,
    Array.isArray(tools) ? normalizeToolNames(tools) : tools,
  ]));
}

export function normalizeNotesByCase(saved = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved ?? {};
  return Object.fromEntries(Object.entries(saved).map(([caseId, notes]) => [
    caseId,
    Array.isArray(notes)
      ? notes.map((note) => (
          typeof note === 'string'
            ? note
            : normalizeToolReferenceFields(note)
        ))
      : notes,
  ]));
}

export function normalizeActionsByCase(saved = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved ?? {};
  return Object.fromEntries(Object.entries(saved).map(([caseId, actions]) => [
    caseId,
    Array.isArray(actions) ? actions.map(normalizeToolReferenceFields) : actions,
  ]));
}

export function normalizeQuickPadByCase(saved = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved ?? {};
  return Object.fromEntries(Object.entries(saved).map(([caseId, quickPad]) => {
    if (!quickPad || typeof quickPad !== 'object' || Array.isArray(quickPad)) {
      return [caseId, quickPad];
    }
    return [
      caseId,
      {
        ...quickPad,
        items: Array.isArray(quickPad.items)
          ? quickPad.items.map((item) => (
              item && typeof item === 'object' && !Array.isArray(item)
                ? Object.fromEntries(Object.entries(item).map(([key, value]) => [
                    key,
                    key === 'sourceTool' || key === 'source'
                      ? normalizeToolName(value)
                      : value,
                  ]))
                : item
            ))
          : quickPad.items,
      },
    ];
  }));
}

export function migrateDecisionDraft(draft, caseRecord = {}) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return draft;
  const domain = classifyLegacyCase(migrationContext(caseRecord, draft));
  const legacyChoice = cleanText(draft.choice || draft.legacyMetadata?.choice);
  const legacyDecisionFormat = Boolean(
    draft.legacyDecisionFormat
    || (legacyChoice && !cleanText(draft.finalFinding))
  );
  const findingBasis = cleanText(draft.findingBasis)
    || cleanText(draft.evidenceRationale)
    || cleanText(draft.reason);
  const next = {
    ...draft,
    schemaVersion: Math.max(Number(draft.schemaVersion) || 0, CASE_MIGRATION_VERSION),
    domainSchemaVersion: Math.max(Number(draft.domainSchemaVersion) || 0, CASE_MIGRATION_VERSION),
    ...domain,
    operationalDecision: legacyDecisionFormat && legacyChoice
      ? normalizeLegacyOperationalDecision(legacyChoice, domain.workflowType)
      : cleanText(draft.operationalDecision)
        || normalizeLegacyOperationalDecision(legacyChoice, domain.workflowType),
    finalFinding: cleanText(draft.finalFinding),
    findingBasis,
    evidenceRationale: cleanText(draft.evidenceRationale) || findingBasis,
    legacyDecisionFormat,
    legacyMetadata: {
      ...(draft.legacyMetadata ?? {}),
      choice: draft.legacyMetadata?.choice ?? draft.choice ?? null,
      reason: draft.legacyMetadata?.reason ?? draft.reason ?? null,
    },
  };
  return JSON.stringify(next) === JSON.stringify(draft) ? draft : next;
}

export function migrateReviewPackage(reviewPackage, caseRecord = {}) {
  if (!reviewPackage || typeof reviewPackage !== 'object' || Array.isArray(reviewPackage)) return reviewPackage;
  const domain = classifyLegacyCase(migrationContext(caseRecord, reviewPackage));
  const legacyChoice = cleanText(reviewPackage.choice || reviewPackage.legacyMetadata?.choice);
  const legacyDecisionFormat = Boolean(
    reviewPackage.legacyDecisionFormat
    || (legacyChoice && !cleanText(reviewPackage.finalFinding))
  );
  const findingBasis = cleanText(reviewPackage.findingBasis)
    || cleanText(reviewPackage.evidenceRationale)
    || cleanText(reviewPackage.reason);
  const next = {
    ...reviewPackage,
    schemaVersion: Math.max(Number(reviewPackage.schemaVersion) || 0, CASE_MIGRATION_VERSION),
    domainSchemaVersion: Math.max(Number(reviewPackage.domainSchemaVersion) || 0, CASE_MIGRATION_VERSION),
    ...domain,
    operationalDecision: legacyDecisionFormat && legacyChoice
      ? normalizeLegacyOperationalDecision(legacyChoice, domain.workflowType)
      : cleanText(reviewPackage.operationalDecision)
        || normalizeLegacyOperationalDecision(legacyChoice, domain.workflowType),
    finalFinding: cleanText(reviewPackage.finalFinding),
    findingBasis,
    evidenceRationale: cleanText(reviewPackage.evidenceRationale) || findingBasis,
    ...(Array.isArray(reviewPackage.completedTools) ? {
      completedTools: normalizeToolNames(reviewPackage.completedTools),
    } : {}),
    ...(Array.isArray(reviewPackage.requiredTools) ? {
      requiredTools: normalizeToolNames(reviewPackage.requiredTools),
    } : {}),
    ...(Array.isArray(reviewPackage.missingTools) ? {
      missingTools: normalizeToolNames(reviewPackage.missingTools),
    } : {}),
    ...(Array.isArray(reviewPackage.noteSnapshot) ? {
      noteSnapshot: reviewPackage.noteSnapshot.map((note) => (
        typeof note === 'string'
          ? note
          : normalizeToolReferenceFields(note)
      )),
    } : {}),
    legacyDecisionFormat,
    legacyMetadata: {
      ...(reviewPackage.legacyMetadata ?? {}),
      claimTypeId: reviewPackage.legacyMetadata?.claimTypeId ?? reviewPackage.claimTypeId ?? null,
      claimType: reviewPackage.legacyMetadata?.claimType ?? reviewPackage.claimType ?? null,
      lane: reviewPackage.legacyMetadata?.lane ?? reviewPackage.lane ?? null,
      choice: reviewPackage.legacyMetadata?.choice ?? reviewPackage.choice ?? null,
    },
  };
  return JSON.stringify(next) === JSON.stringify(reviewPackage) ? reviewPackage : next;
}

export function migrateCompletedDebrief(debrief) {
  if (!debrief || typeof debrief !== 'object' || Array.isArray(debrief)) return debrief;
  const next = {
    ...debrief,
    schemaVersion: Math.max(Number(debrief.schemaVersion) || 0, CASE_MIGRATION_VERSION),
  };
  return JSON.stringify(next) === JSON.stringify(debrief) ? debrief : next;
}

function caseLookup(records = []) {
  return new Map((records ?? []).filter((item) => item?.id).map((item) => [item.id, item]));
}

function migrateCaseMap(value, casesById, migrateValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? {};
  return Object.fromEntries(Object.entries(value).map(([caseId, saved]) => [
    caseId,
    migrateValue(saved, casesById.get(caseId) ?? { id: caseId }),
  ]));
}

export function migratePersistenceResources(rawByKey = {}, generatedCases = []) {
  const migratedCases = migrateGeneratedCases(generatedCases);
  const casesById = caseLookup(migratedCases);
  const existingPackages = rawByKey[storageKeys.packages] ?? {};
  for (const [caseId, packages] of Object.entries(existingPackages)) {
    if (casesById.has(caseId) || !Array.isArray(packages) || !packages.length) continue;
    casesById.set(caseId, migrationContext({ id: caseId }, packages[0]));
  }
  const nextRaw = { ...rawByKey };

  nextRaw[storageKeys.completed] = normalizeCompletedToolsByCase(
    rawByKey[storageKeys.completed] ?? {},
  );
  nextRaw[storageKeys.notes] = normalizeNotesByCase(
    rawByKey[storageKeys.notes] ?? {},
  );
  nextRaw[storageKeys.actions] = normalizeActionsByCase(
    rawByKey[storageKeys.actions] ?? {},
  );
  nextRaw[storageKeys.quickPad] = normalizeQuickPadByCase(
    rawByKey[storageKeys.quickPad] ?? {},
  );
  nextRaw[storageKeys.decisions] = migrateCaseMap(
    rawByKey[storageKeys.decisions] ?? {},
    casesById,
    migrateDecisionDraft,
  );
  nextRaw[storageKeys.packages] = migrateCaseMap(
    rawByKey[storageKeys.packages] ?? {},
    casesById,
    (packages, activeCase) => Array.isArray(packages)
      ? packages.map((reviewPackage) => migrateReviewPackage(reviewPackage, activeCase))
      : packages,
  );
  nextRaw[storageKeys.debriefs] = migrateCaseMap(
    rawByKey[storageKeys.debriefs] ?? {},
    casesById,
    (debriefs) => Array.isArray(debriefs)
      ? debriefs.map(migrateCompletedDebrief)
      : debriefs,
  );

  return {
    rawByKey: nextRaw,
    generatedCases: migratedCases,
  };
}

function domainAuthority(record) {
  return Number(
    record?.legacyMetadata?.sourceDomainSchemaVersion
    ?? record?.domainSchemaVersion,
  ) || 0;
}

function mergeMissing(primary, secondary) {
  if (primary === undefined || primary === null) return secondary;
  if (Array.isArray(primary) || Array.isArray(secondary)) return primary;
  if (
    typeof primary === 'object'
    && typeof secondary === 'object'
    && primary
    && secondary
  ) {
    const merged = { ...secondary, ...primary };
    for (const key of new Set([...Object.keys(secondary), ...Object.keys(primary)])) {
      merged[key] = mergeMissing(primary[key], secondary[key]);
    }
    return merged;
  }
  return primary;
}

export function mergeGeneratedCaseRecords(existingRecord, incomingRecord) {
  if (!existingRecord) return migrateGeneratedCase(incomingRecord);
  if (!incomingRecord) return migrateGeneratedCase(existingRecord);

  const existingVersion = domainAuthority(existingRecord);
  const incomingVersion = domainAuthority(incomingRecord);
  const existing = migrateGeneratedCase(existingRecord);
  const incoming = migrateGeneratedCase(incomingRecord);
  const merged = mergeMissing(existing, incoming);

  // The repository record is the learner's local, worked copy. Preserve its
  // evidence, generated truth, timestamps, and arrays. A newer incoming domain
  // schema may correct only the additive taxonomy/migration fields.
  if (incomingVersion > existingVersion) {
    for (const key of [
      'customerType',
      'productType',
      'workflowType',
      'alertReason',
      'reportedAllegation',
    ]) {
      if (incoming[key] !== undefined) merged[key] = incoming[key];
    }
  }

  return {
    ...merged,
    domainSchemaVersion: Math.max(
      Number(existing.domainSchemaVersion) || 0,
      Number(incoming.domainSchemaVersion) || 0,
      CASE_MIGRATION_VERSION,
    ),
    legacyMetadata: {
      ...mergeMissing(existing.legacyMetadata ?? {}, incoming.legacyMetadata ?? {}),
      sourceDomainSchemaVersion: Math.max(existingVersion, incomingVersion),
    },
  };
}

function migrateSnapshotArrayItems(items, migrateItem, activeCase) {
  return Object.fromEntries(Object.entries(items ?? {}).map(([itemId, item]) => [
    itemId,
    item?.value === undefined
      ? item
      : {
          ...item,
          value: migrateItem(item.value, activeCase),
        },
  ]));
}

function migrateSnapshotArrayResource(resource, migrateValue) {
  if (!resource) return resource;
  return {
    ...resource,
    entries: Object.fromEntries(Object.entries(resource.entries ?? {}).map(([caseId, entry]) => [
      caseId,
      {
        ...entry,
        items: Object.fromEntries(Object.entries(entry?.items ?? {}).map(([itemId, item]) => [
          itemId,
          item?.value === undefined
            ? item
            : { ...item, value: migrateValue(item.value, caseId) },
        ])),
      },
    ])),
  };
}

function migrateSnapshotValueResource(resource, migrateValue) {
  if (!resource) return resource;
  return {
    ...resource,
    entries: Object.fromEntries(Object.entries(resource.entries ?? {}).map(([caseId, entry]) => [
      caseId,
      entry?.value === undefined
        ? entry
        : { ...entry, value: migrateValue(entry.value, caseId) },
    ])),
  };
}

export function migrateCloudSnapshotCaseData(snapshot = {}) {
  const existingTruthItems = snapshot.generatedCaseTruth?.items ?? {};
  const truthCaseIds = new Set(
    Object.values(existingTruthItems)
      .map((item) => item?.value?.caseId ?? item?.value?.id)
      .filter(Boolean),
  );
  const extractedTruthItems = {};
  const generatedItems = Object.fromEntries(Object.entries(snapshot.generatedCases?.items ?? {}).map(([itemId, item]) => {
    if (item?.value === undefined) return [itemId, item];
    const migrated = migrateGeneratedCase(item.value);
    const truth = migrateLegacyCaseTruth(item.value);
    const caseId = migrated?.id ?? migrated?.caseId;
    if (caseId && truth && !truthCaseIds.has(caseId)) {
      const truthItemId = `legacy:${caseId}`;
      extractedTruthItems[truthItemId] = {
        value: {
          id: caseId,
          caseId,
          version: 1,
          domainSchemaVersion: Number(migrated.domainSchemaVersion) || CASE_MIGRATION_VERSION,
          scenarioTruthId: migrated.scenarioTruthId ?? null,
          workflowType: migrated.workflowType ?? null,
          scenarioId: migrated.scenarioId ?? null,
          capturedAt: Number(migrated.generatedAt) || 1,
          source: 'legacy-embedded',
          truth,
        },
        position: item.position ?? 0,
        version: item.version ?? { at: Number(migrated.generatedAt) || 1, deviceId: 'legacy-generated-case' },
        deleted: Boolean(item.deleted),
      };
      truthCaseIds.add(caseId);
    }
    return [itemId, { ...item, value: persistedGeneratedCaseRecord(migrated) }];
  }));
  const casesById = caseLookup(Object.values(generatedItems).map((item) => item?.value).filter(Boolean));
  const resources = { ...(snapshot.resources ?? {}) };
  const packageContextEntries = resources[storageKeys.packages]?.entries ?? {};
  for (const [caseId, entry] of Object.entries(packageContextEntries)) {
    if (casesById.has(caseId)) continue;
    const savedPackage = Object.values(entry?.items ?? {})
      .find((item) => !item?.deleted && item?.value !== undefined)
      ?.value;
    if (savedPackage) casesById.set(caseId, migrationContext({ id: caseId }, savedPackage));
  }

  const decisionResource = resources[storageKeys.decisions];
  if (decisionResource) {
    resources[storageKeys.decisions] = {
      ...decisionResource,
      entries: Object.fromEntries(Object.entries(decisionResource.entries ?? {}).map(([caseId, entry]) => [
        caseId,
        entry?.value === undefined
          ? entry
          : { ...entry, value: migrateDecisionDraft(entry.value, casesById.get(caseId) ?? { id: caseId }) },
      ])),
    };
  }

  if (resources[storageKeys.completed]) {
    resources[storageKeys.completed] = migrateSnapshotArrayResource(
      resources[storageKeys.completed],
      normalizeToolName,
    );
  }
  if (resources[storageKeys.notes]) {
    resources[storageKeys.notes] = migrateSnapshotArrayResource(
      resources[storageKeys.notes],
      (note) => (
        typeof note === 'string'
          ? note
          : normalizeToolReferenceFields(note)
      ),
    );
  }
  if (resources[storageKeys.actions]) {
    resources[storageKeys.actions] = migrateSnapshotArrayResource(
      resources[storageKeys.actions],
      normalizeToolReferenceFields,
    );
  }
  if (resources[storageKeys.quickPad]) {
    resources[storageKeys.quickPad] = migrateSnapshotValueResource(
      resources[storageKeys.quickPad],
      (quickPad, caseId) => normalizeQuickPadByCase({ [caseId]: quickPad })[caseId],
    );
  }

  const packageResource = resources[storageKeys.packages];
  if (packageResource) {
    resources[storageKeys.packages] = {
      ...packageResource,
      entries: Object.fromEntries(Object.entries(packageResource.entries ?? {}).map(([caseId, entry]) => [
        caseId,
        {
          ...entry,
          items: migrateSnapshotArrayItems(
            entry?.items,
            migrateReviewPackage,
            casesById.get(caseId) ?? { id: caseId },
          ),
        },
      ])),
    };
  }

  const debriefResource = resources[storageKeys.debriefs];
  if (debriefResource) {
    resources[storageKeys.debriefs] = {
      ...debriefResource,
      entries: Object.fromEntries(Object.entries(debriefResource.entries ?? {}).map(([caseId, entry]) => [
        caseId,
        {
          ...entry,
          items: Object.fromEntries(Object.entries(entry?.items ?? {}).map(([itemId, item]) => [
            itemId,
            item?.value === undefined ? item : { ...item, value: migrateCompletedDebrief(item.value) },
          ])),
        },
      ])),
    };
  }

  return {
    ...snapshot,
    resources,
    generatedCases: {
      ...(snapshot.generatedCases ?? { mode: 'array' }),
      items: generatedItems,
    },
    generatedCaseTruth: {
      ...(snapshot.generatedCaseTruth ?? { mode: 'array' }),
      items: {
        ...existingTruthItems,
        ...extractedTruthItems,
      },
    },
  };
}
