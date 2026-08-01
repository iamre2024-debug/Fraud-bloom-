import { caseDomainLabels } from './caseDomain.js';

const hiddenAnswerTerms = /\b(synthetic identity|synthetic fraud|bust[- ]out|first[- ]party fraud|mule activity|money mule|spoofed email|compromised mailbox|business email compromise|\bbec\b|stolen identity|fabricated business information|linked prior fraud|fraud (?:confirmed|rule|score)|confirmed fraud|automatic risk|accepted determination|final finding)\b/i;

export function containsHiddenAnswer(value) {
  const text = String(value ?? '');
  return hiddenAnswerTerms.test(text)
    || hiddenAnswerTerms.test(text.replace(/[-_]+/g, ' '));
}

export function publicCaseTaxonomy(item = {}) {
  const labels = caseDomainLabels(item);
  const customerType = labels.customerTypeLabel || item.customerType || 'Personal';
  const productType = labels.productTypeLabel
    || item.productType
    || item.productsAccounts?.[0]?.value
    || 'Training product';
  const workflowType = labels.workflowTypeLabel
    || item.workflowType
    || item.type
    || 'Case Review';
  return {
    customerType: safePublicText(customerType, 'Personal'),
    productType: safePublicText(productType, 'Training product'),
    workflowType: safePublicText(workflowType, 'Case Review'),
    alertReason: item.alertReason ?? item.queueReason ?? 'Case alert available for investigation',
    reportedAllegation: item.reportedAllegation ?? item.allegation ?? item.queueReason ?? 'No separate allegation was supplied.',
  };
}

function safePublicText(value, fallback) {
  const text = String(value ?? '').trim();
  return !text || containsHiddenAnswer(text) ? fallback : text;
}

export function publicAlertReason(item = {}) {
  const taxonomy = publicCaseTaxonomy(item);
  return safePublicText(taxonomy.alertReason, `${taxonomy.workflowType} opened from a neutral alert or reported allegation.`);
}

export function publicReportedAllegation(item = {}) {
  const taxonomy = publicCaseTaxonomy(item);
  return safePublicText(taxonomy.reportedAllegation, 'The intake record describes activity that requires investigation before a finding is made.');
}

function inferredOriginType(item = {}) {
  const workflow = String(item.workflowType ?? item.type ?? '').toLowerCase();
  if (/claim|dispute|account-takeover/.test(workflow) && !/payroll|business.*alert/.test(workflow)) return 'customer-reported-claim';
  if (/application/.test(workflow)) return 'verification-review';
  if (/credit/.test(workflow)) return 'credit-policy-review';
  return 'operations-alert';
}

export function publicCaseOriginType(item = {}) {
  return item.caseOriginType ?? inferredOriginType(item);
}

export function publicCaseOrigin(item = {}) {
  const type = publicCaseOriginType(item);
  const fallback = type === 'customer-reported-claim'
    ? 'Customer or business report'
    : type === 'verification-review'
      ? 'Application verification review'
      : type === 'credit-policy-review'
        ? 'Credit monitoring or policy review'
        : 'Operations or monitoring alert';
  return safePublicText(item.caseOrigin, fallback);
}

export function publicCaseEscalationReason(item = {}) {
  return safePublicText(
    item.caseEscalationReason ?? item.queueReason ?? publicReportedAllegation(item),
    `${publicCaseTaxonomy(item).workflowType} was routed for evidence review; the trigger does not establish a finding.`,
  );
}

export function publicAlertHandlingNote(item = {}) {
  const type = publicCaseOriginType(item);
  const fallback = type === 'customer-reported-claim'
    ? 'The report opens a review, but it does not prove the allegation. Evidence must support the determination.'
    : type === 'credit-policy-review'
      ? 'Credit use can be normal. Only configured or unresolved conditions route a manual review, and the alert is not a finding.'
      : type === 'verification-review'
        ? 'A verification mismatch is not automatically fraud. Records must be reconciled before a determination.'
        : 'Not every alert becomes a case. Only configured or unresolved conditions route manual review, and the alert is not a finding.';
  return safePublicText(item.alertHandlingNote, fallback);
}

export function publicCaseSummary(item = {}) {
  return safePublicText(
    item.caseBriefing?.summary ?? item.shortSummary ?? publicAlertReason(item),
    `${publicCaseTaxonomy(item).workflowType} requires evidence review before any finding is established.`,
  );
}

export function publicCaseFacts(item = {}) {
  const taxonomy = publicCaseTaxonomy(item);
  return [
    ['Customer type', taxonomy.customerType],
    ['Product', taxonomy.productType],
    ['Review workflow', taxonomy.workflowType],
    ['Case origin', publicCaseOrigin(item)],
    ['Escalation context', publicCaseEscalationReason(item)],
    ['Alert reason', publicAlertReason(item)],
    ['Reported / opened', item.reportedDate ?? item.opened ?? 'Not supplied'],
    ['Issue start', item.issueStartDate ?? 'Not supplied'],
    ['Amount / exposure', item.amountExposure ?? item.amount ?? 'Not supplied'],
    ['Intake channel', item.intake?.channel ?? 'Case queue'],
  ];
}

export function publicCaseSearchText(item = {}) {
  const taxonomy = publicCaseTaxonomy(item);
  return [
    item.id,
    item.person,
    item.trainingId,
    item.accountId,
    taxonomy.customerType,
    taxonomy.productType,
    taxonomy.workflowType,
    publicAlertReason(item),
    publicReportedAllegation(item),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function publicScenarioLabel(scenario = {}) {
  return safePublicText(
    scenario.publicTitle ?? scenario.alertReason ?? scenario.title,
    'Neutral alert variation',
  );
}
