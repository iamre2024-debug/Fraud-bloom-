export const CASE_DOMAIN_VERSION = 2;
export const CASE_RELATIONSHIP_VIEW_SCHEMA_VERSION = 1;
export const CASE_RELATIONSHIP_DATA_VERSION = 1;
export const LEGACY_RELATIONSHIP_DATA_VERSION = 0;

export const CUSTOMER_TYPES = Object.freeze({
  PERSONAL: 'personal',
  BUSINESS: 'business',
});

export const PRODUCT_TYPES = Object.freeze({
  CREDIT_CARD: 'credit-card',
  DEPOSIT_ACCOUNT: 'deposit-account',
  PERSONAL_LOAN: 'personal-loan',
  BUSINESS_ACCOUNT: 'business-account',
  PAYROLL_PRODUCT: 'payroll-product',
  BUSINESS_CREDIT_CARD: 'business-credit-card',
  BUSINESS_LOAN: 'business-loan',
});

export const WORKFLOW_TYPES = Object.freeze({
  UNAUTHORIZED_CARD_TRANSACTION_CLAIM: 'unauthorized-card-transaction-claim',
  MERCHANT_NON_FRAUD_DISPUTE: 'merchant-non-fraud-dispute',
  CARD_ACCOUNT_TAKEOVER: 'card-account-takeover',
  PERSONAL_ACCOUNT_TAKEOVER: 'personal-account-takeover',
  ACH_TRANSACTION_CLAIM: 'ach-transaction-claim',
  WIRE_TRANSACTION_CLAIM: 'wire-transaction-claim',
  BUSINESS_ACCOUNT_TAKEOVER: 'business-account-takeover',
  BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT: 'business-payment-instruction-change-alert',
  ACH_TRANSACTION_REVIEW: 'ach-transaction-review',
  WIRE_TRANSACTION_REVIEW: 'wire-transaction-review',
  PAYROLL_CHANGE_ALERT: 'payroll-change-alert',
  PAYROLL_ACCOUNT_TAKEOVER: 'payroll-account-takeover',
  CREDIT_APPLICATION_REVIEW: 'credit-application-review',
  CREDIT_RISK_REVIEW: 'credit-risk-review',
});

export const FINAL_FINDINGS = Object.freeze({
  FRAUD_CONFIRMED: 'Fraud Confirmed',
  FRAUD_NOT_FOUND: 'Fraud Not Found',
  INCONCLUSIVE: 'Inconclusive',
  NON_FRAUD_DISPUTE: 'Non-Fraud Dispute',
  CREDIT_RISK_CONCERN: 'Credit Risk Concern',
  VERIFICATION_INCOMPLETE: 'Verification Incomplete',
});

export const SUSPECTED_PATTERNS = Object.freeze({
  ACCOUNT_TAKEOVER: 'account-takeover',
  SYNTHETIC_IDENTITY: 'synthetic-identity',
  BUST_OUT: 'bust-out',
  FIRST_PARTY_FRAUD: 'first-party-fraud',
  MULE_ACTIVITY: 'mule-activity',
  EMAIL_COMPROMISE_BEC: 'email-compromise-bec',
  STOLEN_IDENTITY: 'stolen-identity',
  FABRICATED_BUSINESS_INFORMATION: 'fabricated-business-information',
  OWNER_MISMATCH: 'owner-mismatch',
  LINKED_PRIOR_FRAUD: 'linked-prior-fraud',
  UNVERIFIABLE_INFORMATION: 'unverifiable-information',
});

export const LEGACY_TOOL_NAME_ALIASES = Object.freeze({
  'Evidence Center': 'Document Viewer',
  'Financial Intelligence': 'Financial Investigation',
  'Business Intelligence': 'Business 360',
  'KYB Review': 'Business 360',
});

export const LEGACY_PHANTOM_COMPLETION_TOOL_NAMES = Object.freeze([
  'Case Summary',
]);

const legacyToolNameLookup = new Map(
  Object.entries(LEGACY_TOOL_NAME_ALIASES)
    .map(([legacyName, currentName]) => [legacyName.toLowerCase(), currentName]),
);
const legacyPhantomCompletionLookup = new Set(
  LEGACY_PHANTOM_COMPLETION_TOOL_NAMES.map((toolName) => toolName.toLowerCase()),
);
const payrollOnlyTools = new Set(['Employee Profile', 'Payroll History']);
const payrollWorkflows = new Set([
  WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
  WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
]);
const ownershipRelationshipPattern = /\b(?:beneficial\s+owner|owner|ownership|owns|control\s+person|controller|controlling|controls)\b/i;

export function normalizeToolName(toolName) {
  if (typeof toolName !== 'string') return toolName;
  return legacyToolNameLookup.get(toolName.trim().toLowerCase()) ?? toolName;
}

export function normalizeToolNames(toolNames = []) {
  if (!Array.isArray(toolNames)) return [];
  return [...new Set(toolNames.map(normalizeToolName).filter(Boolean))];
}

export function normalizeCompletedToolNames(toolNames = []) {
  if (!Array.isArray(toolNames)) return [];
  return normalizeToolNames(toolNames.filter((toolName) => (
    typeof toolName !== 'string'
    || !legacyPhantomCompletionLookup.has(toolName.trim().toLowerCase())
  )));
}

export function hasOwnershipLinkedBusinessRelationship(caseOrDomain = {}) {
  if (caseOrDomain.hasLinkedBusinessRelationship === true) return true;
  const relationshipRecords = [
    ...(Array.isArray(caseOrDomain.businessRelationships) ? caseOrDomain.businessRelationships : []),
    ...(Array.isArray(caseOrDomain.linkedBusinesses) ? caseOrDomain.linkedBusinesses : []),
    ...(Array.isArray(caseOrDomain.customer?.businessRelationships) ? caseOrDomain.customer.businessRelationships : []),
    ...(Array.isArray(caseOrDomain.customer?.linkedBusinesses) ? caseOrDomain.customer.linkedBusinesses : []),
  ];
  return relationshipRecords.some((record) => {
    if (typeof record === 'string') return ownershipRelationshipPattern.test(record);
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    if (
      record.isOwner === true
      || record.isControlPerson === true
      || record.controlsBusiness === true
    ) return true;
    const ownershipPercent = Number.parseFloat(
      record.ownershipPercentage ?? record.ownershipPercent ?? '',
    );
    if (Number.isFinite(ownershipPercent) && ownershipPercent > 0) return true;
    return ownershipRelationshipPattern.test([
      record.role,
      record.relationship,
      record.relationshipType,
      record.capacity,
      record.type,
    ].filter(Boolean).join(' '));
  });
}

export function hasPayrollRelationship(caseOrDomain = {}) {
  if (caseOrDomain.hasPayrollRelationship === true) return true;
  if (caseOrDomain.productType === PRODUCT_TYPES.PAYROLL_PRODUCT) return true;
  if (payrollWorkflows.has(caseOrDomain.workflowType)) return true;
  if (Array.isArray(caseOrDomain.toolResults?.payrollHistory)
    && caseOrDomain.toolResults.payrollHistory.length > 0) return true;
  const accounts = caseOrDomain.toolResults?.relationshipAccounts
    ?? caseOrDomain.relationshipAccounts
    ?? [];
  return Array.isArray(accounts) && accounts.some((account) => (
    account?.productType === PRODUCT_TYPES.PAYROLL_PRODUCT
    || /payroll/i.test(`${account?.productKind ?? ''} ${account?.productLabel ?? ''}`)
  ));
}

export function filterToolsForCaseDomain(toolNames = [], domain = {}) {
  const normalizedTools = normalizeToolNames(toolNames);
  const isPersonal = domain.customerType === CUSTOMER_TYPES.PERSONAL;
  const isBusiness = domain.customerType === CUSTOMER_TYPES.BUSINESS;
  const hasLinkedBusiness = isPersonal && hasOwnershipLinkedBusinessRelationship(domain);
  const isPayrollReview = hasPayrollRelationship(domain);

  return normalizedTools.filter((toolName) => {
    if (isPersonal && toolName === 'Business 360' && !hasLinkedBusiness) return false;
    if (isPersonal && payrollOnlyTools.has(toolName)) return false;
    if (isBusiness && toolName === 'Customer 360') return false;
    if (!isPayrollReview && payrollOnlyTools.has(toolName)) return false;
    return true;
  });
}

export const customerTypeDefinitions = Object.freeze([
  Object.freeze({ id: CUSTOMER_TYPES.PERSONAL, label: 'Personal' }),
  Object.freeze({ id: CUSTOMER_TYPES.BUSINESS, label: 'Business' }),
]);

export const productTypeDefinitions = Object.freeze([
  Object.freeze({ id: PRODUCT_TYPES.CREDIT_CARD, customerType: CUSTOMER_TYPES.PERSONAL, label: 'Credit card' }),
  Object.freeze({ id: PRODUCT_TYPES.DEPOSIT_ACCOUNT, customerType: CUSTOMER_TYPES.PERSONAL, label: 'Deposit account' }),
  Object.freeze({ id: PRODUCT_TYPES.PERSONAL_LOAN, customerType: CUSTOMER_TYPES.PERSONAL, label: 'Personal loan' }),
  Object.freeze({ id: PRODUCT_TYPES.BUSINESS_ACCOUNT, customerType: CUSTOMER_TYPES.BUSINESS, label: 'Business account' }),
  Object.freeze({ id: PRODUCT_TYPES.PAYROLL_PRODUCT, customerType: CUSTOMER_TYPES.BUSINESS, label: 'Payroll or payroll-funding product' }),
  Object.freeze({ id: PRODUCT_TYPES.BUSINESS_CREDIT_CARD, customerType: CUSTOMER_TYPES.BUSINESS, label: 'Business credit card' }),
  Object.freeze({ id: PRODUCT_TYPES.BUSINESS_LOAN, customerType: CUSTOMER_TYPES.BUSINESS, label: 'Business loan' }),
]);

const transactionClaimDecisions = ['Support Customer Claim', 'Do Not Support Customer Claim', 'Partial Credit', 'Insufficient Evidence', 'Escalate'];
const accountReviewDecisions = ['Maintain', 'Restrict', 'Hold', 'More Information Needed', 'Escalate'];
const businessPaymentDecisions = ['Hold', 'Release', 'More Information Needed', 'Escalate'];
const payrollDecisions = ['Hold', 'Release', 'More Information Needed', 'Escalate'];
const applicationDecisions = ['Approve', 'Deny', 'Request More Information', 'Escalate'];
const creditRiskDecisions = ['Maintain', 'Restrict / Reduce', 'Hold', 'Request More Information', 'Escalate'];

export const workflowTypeDefinitions = Object.freeze([
  Object.freeze({ id: WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM, label: 'Unauthorized Card Transaction Claim', operationalDecisions: transactionClaimDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE, label: 'Merchant / Non-Fraud Dispute', operationalDecisions: transactionClaimDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER, label: 'Card Account Takeover', operationalDecisions: accountReviewDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER, label: 'Personal Account Takeover', operationalDecisions: accountReviewDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM, label: 'ACH Transaction Claim', operationalDecisions: transactionClaimDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM, label: 'Wire Transaction Claim', operationalDecisions: transactionClaimDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER, label: 'Business Account Takeover', operationalDecisions: accountReviewDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT, label: 'Business Payment or Instruction-Change Alert', operationalDecisions: businessPaymentDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW, label: 'ACH Transaction Review', operationalDecisions: businessPaymentDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW, label: 'Wire Transaction Review', operationalDecisions: businessPaymentDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT, label: 'Payroll Change Alert', operationalDecisions: payrollDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER, label: 'Payroll Account Takeover', operationalDecisions: payrollDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW, label: 'Credit Application Review', operationalDecisions: applicationDecisions }),
  Object.freeze({ id: WORKFLOW_TYPES.CREDIT_RISK_REVIEW, label: 'Credit Risk Review', operationalDecisions: creditRiskDecisions }),
]);

export const enabledWorkflowMatrix = Object.freeze({
  [CUSTOMER_TYPES.PERSONAL]: Object.freeze({
    [PRODUCT_TYPES.CREDIT_CARD]: Object.freeze([
      WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
      WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
      WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    ]),
    [PRODUCT_TYPES.DEPOSIT_ACCOUNT]: Object.freeze([
      WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM,
      WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM,
    ]),
    [PRODUCT_TYPES.PERSONAL_LOAN]: Object.freeze([
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    ]),
  }),
  [CUSTOMER_TYPES.BUSINESS]: Object.freeze({
    [PRODUCT_TYPES.BUSINESS_ACCOUNT]: Object.freeze([
      WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
      WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW,
      WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
    ]),
    [PRODUCT_TYPES.PAYROLL_PRODUCT]: Object.freeze([
      WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
      WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    ]),
    [PRODUCT_TYPES.BUSINESS_CREDIT_CARD]: Object.freeze([
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
      WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
    ]),
    [PRODUCT_TYPES.BUSINESS_LOAN]: Object.freeze([
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
      WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
    ]),
  }),
});

const customerTypeById = new Map(customerTypeDefinitions.map((item) => [item.id, item]));
const productTypeById = new Map(productTypeDefinitions.map((item) => [item.id, item]));
const workflowTypeById = new Map(workflowTypeDefinitions.map((item) => [item.id, item]));

export function getCustomerType(customerType) {
  return customerTypeById.get(customerType);
}

export function getProductType(productType) {
  return productTypeById.get(productType);
}

export function getWorkflowType(workflowType) {
  return workflowTypeById.get(workflowType);
}

export function getProductsForCustomerType(customerType) {
  return productTypeDefinitions.filter((item) => item.customerType === customerType);
}

export function getEnabledWorkflowTypes(customerType, productType) {
  return [...(enabledWorkflowMatrix[customerType]?.[productType] ?? [])];
}

export function getWorkflowsForProduct(customerType, productType) {
  return getEnabledWorkflowTypes(customerType, productType)
    .map((workflowType) => getWorkflowType(workflowType))
    .filter(Boolean);
}

export function isWorkflowEnabled(customerType, productType, workflowType) {
  const product = getProductType(productType);
  if (!product || product.customerType !== customerType) return false;
  return getEnabledWorkflowTypes(customerType, productType).includes(workflowType);
}

export function validateCaseDomain({ customerType, productType, workflowType } = {}) {
  const errors = [];
  if (!getCustomerType(customerType)) errors.push(`Unsupported customer type: ${customerType ?? '(missing)'}`);
  const product = getProductType(productType);
  if (!product) errors.push(`Unsupported product: ${productType ?? '(missing)'}`);
  else if (product.customerType !== customerType) errors.push(`${product.label} is not enabled for ${getCustomerType(customerType)?.label ?? customerType}`);
  if (!getWorkflowType(workflowType)) errors.push(`Unsupported review workflow: ${workflowType ?? '(missing)'}`);
  else if (product && product.customerType === customerType && !isWorkflowEnabled(customerType, productType, workflowType)) {
    errors.push(`${getWorkflowType(workflowType).label} is not enabled for ${product.label}`);
  }
  return { valid: errors.length === 0, errors };
}

export function assertCaseDomain(domain) {
  const result = validateCaseDomain(domain);
  if (!result.valid) throw new RangeError(result.errors.join('; '));
  return {
    customerType: domain.customerType,
    productType: domain.productType,
    workflowType: domain.workflowType,
  };
}

export function caseDomainLabels(domain = {}) {
  return {
    customerTypeLabel: getCustomerType(domain.customerType)?.label ?? domain.customerType ?? '',
    productTypeLabel: getProductType(domain.productType)?.label ?? domain.productType ?? '',
    workflowTypeLabel: getWorkflowType(domain.workflowType)?.label ?? domain.workflowType ?? '',
  };
}

export function operationalDecisionsForWorkflow(workflowType) {
  return [...(getWorkflowType(workflowType)?.operationalDecisions ?? [])];
}

export const generatorDomainChoices = Object.freeze(customerTypeDefinitions.map((customer) => ({
  ...customer,
  products: getProductsForCustomerType(customer.id).map((product) => ({
    ...product,
    workflows: getWorkflowsForProduct(customer.id, product.id).map((workflow) => ({ ...workflow })),
  })),
})));
