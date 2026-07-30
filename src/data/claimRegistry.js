import {
  CUSTOMER_TYPES,
  PRODUCT_TYPES,
  WORKFLOW_TYPES,
  caseDomainLabels,
  generatorDomainChoices,
  getEnabledWorkflowTypes,
  getProductType,
  getWorkflowType,
  isWorkflowEnabled,
  operationalDecisionsForWorkflow,
} from './caseDomain.js';
import { expandClaimScenarios, getScenarioTruth } from './claimScenarioCatalog.js';

const commonEvidenceAreas = ['Customer or entity statement', 'Case timeline', 'Related documents', 'Pinned evidence and notes'];
const commonTools = ['Document Viewer', 'Document Request', 'Link Analysis', 'Timeline'];
const accessTools = ['Login History', 'Session History', 'Device Intelligence', 'IP Intelligence'];
const paymentTools = ['Transaction History', 'Financial Investigation', 'Payment Verification'];
const payrollFinancialTools = ['Financial Investigation', 'Payment Verification'];
const personalTools = ['Customer 360', 'Identity Intel / People Search'];
const businessTools = ['Business 360', 'Identity Intel / People Search'];

const definitions = [
  {
    id: WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
    prefix: 'UCT',
    lane: 'Card transaction claim',
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.CREDIT_CARD],
    intakePrompts: ['Which card transaction does the customer report as unauthorized?', 'When was it noticed and was the card still in the customer’s possession?', 'Which authorization, device, wallet, merchant, and fulfillment records are available?'],
    evidenceAreas: ['Card possession timeline', 'Authorization and entry mode', 'Wallet token history', 'Merchant and cardholder records', 'Prior claims and last valid transaction', ...commonEvidenceAreas],
    availableTools: [...personalTools, 'Transaction History', 'Financial Investigation', 'Merchant Intelligence', ...accessTools.slice(0, 3), ...commonTools],
    requiredTools: ['Case Summary', 'Customer 360', 'Transaction History', 'Merchant Intelligence', 'Document Viewer', 'Link Analysis'],
    documents: ['Cardholder statement', 'Authorization record', 'Merchant packet', 'Card status record'],
    legacyProductRail: 'card',
  },
  {
    id: WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
    prefix: 'MND',
    lane: 'Merchant dispute',
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.CREDIT_CARD],
    intakePrompts: ['What purchase, cancellation, return, service, or refund issue did the customer report?', 'What contact has already occurred with the merchant?', 'Which receipt, policy, delivery, return, or refund records are available?'],
    evidenceAreas: ['Receipt or invoice', 'Merchant response', 'Cancellation or refund policy', 'Return tracking or proof of delivery', 'Customer contact with merchant', ...commonEvidenceAreas],
    availableTools: ['Customer 360', 'Transaction History', 'Financial Investigation', 'Merchant Intelligence', ...commonTools],
    requiredTools: ['Case Summary', 'Customer 360', 'Transaction History', 'Merchant Intelligence', 'Document Viewer'],
    documents: ['Customer dispute form', 'Merchant billing packet', 'Cancellation or refund evidence', 'Reason-code guide'],
    legacyProductRail: 'card',
  },
  {
    id: WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER,
    prefix: 'CAT',
    lane: 'Card account access',
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.CREDIT_CARD],
    intakePrompts: ['What card-account access or maintenance activity was reported?', 'Which alerts, reset messages, or contact attempts were noticed?', 'Which devices, sessions, locations, and wallet events does the customer recognize?'],
    evidenceAreas: ['Card possession and customer statement', 'Login, session, device, and IP history', 'Profile, wallet, and transaction activity', ...commonEvidenceAreas],
    availableTools: [...personalTools, ...accessTools, 'Transaction History', 'Financial Investigation', 'Payment Verification', ...commonTools],
    requiredTools: ['Case Summary', 'Customer 360', 'Login History', 'Session History', 'Device Intelligence', 'IP Intelligence', 'Transaction History', 'Link Analysis'],
    documents: ['Customer statement', 'Login and session packet', 'Card-account maintenance record', 'Authorization record'],
    legacyProductRail: 'card',
  },
  {
    id: WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
    prefix: 'PAT',
    lane: 'Deposit account access',
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.DEPOSIT_ACCOUNT],
    intakePrompts: ['What deposit-account access, profile, or payment activity was reported?', 'Which devices and locations does the customer recognize?', 'Which profile, payee, destination, and transaction changes occurred in the review window?'],
    evidenceAreas: ['Customer statement', 'Login, session, device, and IP history', 'Profile, payee, and payment activity', ...commonEvidenceAreas],
    availableTools: [...personalTools, ...accessTools, ...paymentTools, ...commonTools],
    requiredTools: ['Case Summary', 'Customer 360', 'Login History', 'Session History', 'Device Intelligence', 'IP Intelligence', 'Transaction History', 'Payment Verification', 'Link Analysis'],
    documents: ['Customer statement', 'Login and session packet', 'Profile-change record', 'Payment authorization record'],
    legacyProductRail: 'deposit',
  },
  {
    id: WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM,
    prefix: 'ACH',
    lane: 'ACH transaction claim',
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.DEPOSIT_ACCOUNT],
    intakePrompts: ['Which ACH debit does the customer report as unauthorized?', 'What originator or prior relationship is known?', 'Which authorization, return, and account records are available?'],
    evidenceAreas: ['ACH entry and originator record', 'Customer authorization record', 'Prior originator relationship', 'Return timing', ...commonEvidenceAreas],
    availableTools: ['Customer 360', ...paymentTools, 'Identity Intel / People Search', ...commonTools],
    requiredTools: ['Case Summary', 'Customer 360', 'Transaction History', 'Payment Verification', 'Document Viewer', 'Link Analysis'],
    documents: ['Customer ACH statement', 'ACH entry record', 'Originator authorization record', 'Return-timing record'],
    legacyProductRail: 'ach',
  },
  {
    id: WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM,
    prefix: 'PWR',
    lane: 'Wire transaction claim',
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.DEPOSIT_ACCOUNT],
    intakePrompts: ['Which wire does the customer report as unauthorized or induced?', 'Who initiated and approved the instruction?', 'Which beneficiary, callback, authorization, and recovery records are available?'],
    evidenceAreas: ['Wire instruction and approval timeline', 'Beneficiary ownership', 'Trusted contact record', 'Funds and recovery status', ...commonEvidenceAreas],
    availableTools: ['Customer 360', ...paymentTools, 'Identity Intel / People Search', ...accessTools, ...commonTools],
    requiredTools: ['Case Summary', 'Customer 360', 'Transaction History', 'Payment Verification', 'Document Viewer', 'Link Analysis'],
    documents: ['Customer wire statement', 'Wire instruction', 'Beneficiary record', 'Recovery record'],
    legacyProductRail: 'wire',
  },
  {
    id: WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
    prefix: 'BAT',
    lane: 'Business account access',
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.BUSINESS_ACCOUNT, PRODUCT_TYPES.BUSINESS_CREDIT_CARD, PRODUCT_TYPES.BUSINESS_LOAN],
    intakePrompts: ['What business-account access or administrator activity opened the review?', 'Which initiator, approver, device, IP, and session records are available?', 'Which profile, payment, or administrator changes occurred?'],
    evidenceAreas: ['Business and administrator records', 'Login, session, device, and IP history', 'Initiator, approver, profile, and payment changes', ...commonEvidenceAreas],
    availableTools: [...businessTools, ...accessTools, ...paymentTools, ...commonTools],
    requiredTools: ['Case Summary', 'Business 360', 'Login History', 'Session History', 'Device Intelligence', 'IP Intelligence', 'Transaction History', 'Link Analysis'],
    documents: ['Business access statement', 'Administrator roster', 'Login and session packet', 'Profile or payment-change record'],
    legacyProductRail: 'business-account',
  },
  {
    id: WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
    prefix: 'BPI',
    lane: 'Business payment instruction',
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.BUSINESS_ACCOUNT],
    intakePrompts: ['What payment or instruction change did the platform or business report?', 'Which trusted contact can verify the instruction?', 'Which beneficiary, approval, destination, and funds-status records are available?'],
    evidenceAreas: ['Instruction and approval timeline', 'Trusted contact verification', 'Beneficiary and destination history', 'Funds and recovery status', ...commonEvidenceAreas],
    availableTools: [...businessTools, ...paymentTools, ...accessTools, ...commonTools],
    requiredTools: ['Case Summary', 'Business 360', 'Payment Verification', 'Transaction History', 'Document Viewer', 'Link Analysis'],
    documents: ['Payment instruction record', 'Vendor master record', 'Trusted callback log', 'Beneficiary record'],
    legacyProductRail: 'business-payment',
  },
  {
    id: WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW,
    prefix: 'BAR',
    lane: 'Business ACH review',
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.BUSINESS_ACCOUNT],
    intakePrompts: ['Which business ACH payment or change is in scope?', 'Who initiated and approved it?', 'Which originator, destination, authorization, funds, and recovery records are available?'],
    evidenceAreas: ['ACH instruction and approval timeline', 'Originator or destination ownership', 'Initiator and approver records', 'Funds and recovery status', ...commonEvidenceAreas],
    availableTools: [...businessTools, ...paymentTools, ...accessTools, ...commonTools],
    requiredTools: ['Case Summary', 'Business 360', 'Transaction History', 'Payment Verification', 'Document Viewer', 'Link Analysis'],
    documents: ['ACH instruction', 'Approval record', 'Originator or destination record', 'Funds-status record'],
    legacyProductRail: 'ach',
  },
  {
    id: WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
    prefix: 'BWR',
    lane: 'Business wire review',
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.BUSINESS_ACCOUNT],
    intakePrompts: ['Which business wire payment or instruction is in scope?', 'Who initiated and approved it?', 'Which beneficiary, callback, funds-status, and recovery records are available?'],
    evidenceAreas: ['Wire instruction and approval timeline', 'Beneficiary ownership and prior use', 'Trusted contact record', 'Funds and recovery status', ...commonEvidenceAreas],
    availableTools: [...businessTools, ...paymentTools, ...accessTools, ...commonTools],
    requiredTools: ['Case Summary', 'Business 360', 'Transaction History', 'Payment Verification', 'Document Viewer', 'Link Analysis'],
    documents: ['Wire instruction', 'Approval record', 'Beneficiary record', 'Recall or recovery record'],
    legacyProductRail: 'wire',
  },
  {
    id: WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
    prefix: 'PCA',
    lane: 'Payroll change',
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.PAYROLL_PRODUCT],
    intakePrompts: ['What employee, destination, amount, timing, or administrator change did the platform observe?', 'What do the payroll and destination histories show?', 'Which trusted business contact can verify the change if risk remains?'],
    evidenceAreas: ['Business and employee records', 'Payroll and change history', 'Destination ownership and prior use', 'Administrator activity and trusted callback', ...commonEvidenceAreas],
    availableTools: ['Business 360', 'Employee Profile', 'Payroll History', ...payrollFinancialTools, ...accessTools, ...commonTools],
    requiredTools: ['Case Summary', 'Business 360', 'Employee Profile', 'Payroll History', 'Payment Verification', 'Document Viewer'],
    documents: ['Platform payroll-change record', 'Employee profile record', 'Payroll history', 'Trusted callback log'],
    legacyProductRail: 'payroll',
  },
  {
    id: WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
    prefix: 'PAO',
    lane: 'Payroll account access',
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.PAYROLL_PRODUCT],
    intakePrompts: ['Which new device, IP, session, administrator, or payroll activity opened the alert?', 'Who initiated and approved the payroll?', 'What do payroll history, funds status, and recovery records show?'],
    evidenceAreas: ['Administrator, initiator, and approver records', 'Device, IP, and session history', 'Payroll amount and destination changes', 'Funds and recovery status', ...commonEvidenceAreas],
    availableTools: ['Business 360', 'Employee Profile', 'Payroll History', ...payrollFinancialTools, ...accessTools, ...commonTools],
    requiredTools: ['Case Summary', 'Business 360', 'Payroll History', 'Login History', 'Session History', 'Device Intelligence', 'IP Intelligence', 'Payment Verification', 'Link Analysis'],
    documents: ['Payroll access alert', 'Administrator roster', 'Initiator and approver record', 'Payroll funds-status record'],
    legacyProductRail: 'payroll',
  },
  {
    id: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
    prefix: 'CAR',
    lane: 'Credit application',
    customerTypes: [CUSTOMER_TYPES.PERSONAL, CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.CREDIT_CARD, PRODUCT_TYPES.PERSONAL_LOAN, PRODUCT_TYPES.PAYROLL_PRODUCT, PRODUCT_TYPES.BUSINESS_CREDIT_CARD, PRODUCT_TYPES.BUSINESS_LOAN],
    intakePrompts: ['What application information or eligibility question opened the review?', 'Which identity, entity, owner, control-person, guarantor, administrator, credit, and repayment records apply?', 'Which verification steps are complete and which require more information?'],
    evidenceAreas: ['Application and identity records', 'Business registration and identifying information when applicable', 'Submitter, owner, control person, guarantor, and administrator verification when applicable', 'Credit and repayment information', 'Cross-account links for each relevant party', ...commonEvidenceAreas],
    availableTools: [...personalTools, ...businessTools, ...paymentTools, ...accessTools, ...commonTools],
    requiredTools: ['Case Summary', 'Identity Intel / People Search', 'Payment Verification', 'Document Viewer', 'Link Analysis'],
    documents: ['Credit application', 'Identity and party-verification records', 'Income or revenue support', 'Credit and repayment summary', 'Document request tracker'],
    legacyProductRail: 'credit',
  },
  {
    id: WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    prefix: 'CRR',
    lane: 'Credit risk',
    customerTypes: [CUSTOMER_TYPES.PERSONAL, CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.CREDIT_CARD, PRODUCT_TYPES.PERSONAL_LOAN, PRODUCT_TYPES.PAYROLL_PRODUCT, PRODUCT_TYPES.BUSINESS_CREDIT_CARD, PRODUCT_TYPES.BUSINESS_LOAN],
    intakePrompts: ['What existing exposure or post-approval behavior opened the review?', 'What do payment history, NSF activity, utilization, cash flow, and debt obligations show?', 'Which changes, linked exposures, and documents require reconciliation?'],
    evidenceAreas: ['Existing account and exposure records', 'Payment, NSF, utilization, and cash-flow history', 'Debt stacking and post-approval behavior', 'Entity and owner information when applicable', ...commonEvidenceAreas],
    availableTools: [...personalTools, ...businessTools, ...paymentTools, ...commonTools],
    requiredTools: ['Case Summary', 'Financial Investigation', 'Transaction History', 'Payment Verification', 'Document Viewer', 'Link Analysis'],
    documents: ['Existing exposure alert', 'Payment and utilization history', 'Cash-flow or bank statement', 'Credit-file summary', 'Document request tracker'],
    legacyProductRail: 'credit',
  },
];

function defaultDomainFor(definition) {
  for (const customerType of definition.customerTypes) {
    const productType = definition.productTypes.find((candidate) => isWorkflowEnabled(customerType, candidate, definition.id));
    if (productType) return { customerType, productType, workflowType: definition.id };
  }
  throw new Error(`No enabled product exists for ${definition.id}`);
}

const claimTypeDefinitions = definitions.map((definition) => {
  const workflow = getWorkflowType(definition.id);
  const defaultDomain = defaultDomainFor(definition);
  return {
    ...definition,
    ...defaultDomain,
    label: workflow.label,
    shortLabel: workflow.label,
    workflowType: definition.id,
    operationalDecisions: operationalDecisionsForWorkflow(definition.id),
    taxonomy: {
      customerType: defaultDomain.customerType,
      productType: defaultDomain.productType,
      workflowType: definition.id,
      lifecycleStage: definition.id === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW ? 'onboarding' : definition.id === WORKFLOW_TYPES.CREDIT_RISK_REVIEW ? 'account monitoring' : 'investigation',
      productRail: definition.legacyProductRail,
      customerRole: defaultDomain.customerType === CUSTOMER_TYPES.BUSINESS ? 'business account holder' : 'personal customer',
    },
  };
});

export const coreClaimTypes = claimTypeDefinitions.map(expandClaimScenarios);
export const coreClaimTypeIds = coreClaimTypes.map((claimType) => claimType.id);

export const legacyClaimTypeIds = Object.freeze({
  'account-takeover': WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
  'account takeover': WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
  'account takeover claim': WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
  'fraud-chargeback': WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
  'fraud chargeback claim': WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
  'chargeback claim': WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
  'non-fraud-chargeback': WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
  'non-fraud chargeback claim': WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
  'first-party-fraud': WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
  'first party fraud': WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
  'first-party fraud claim': WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
  'payroll-direct-deposit': WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
  'payroll risk review': WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
  'payroll / direct deposit change claim': WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
  'email-bec': WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
  'email fraud': WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
  'email fraud / bec claim': WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
  'credit-risk': WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
  'credit risk review': WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
  'business-loan-bust-out': WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
  'business loan / bust-out review': WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
  'application-verification': WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
  'application verification review': WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
  'ach-wire-check': WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
  'ach / wire / check review': WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
});

export function normalizeWorkflowType(value) {
  const candidate = String(value ?? '').trim();
  if (coreClaimTypeIds.includes(candidate)) return candidate;
  return legacyClaimTypeIds[candidate.toLowerCase()];
}

export function getClaimType(claimTypeOrWorkflowType) {
  const workflowType = normalizeWorkflowType(claimTypeOrWorkflowType) ?? WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM;
  return coreClaimTypes.find((item) => item.id === workflowType) ?? coreClaimTypes[0];
}

export function claimTypeIdForCase(item = {}) {
  const explicitWorkflow = normalizeWorkflowType(item.workflowType);
  if (explicitWorkflow) return explicitWorkflow;
  const legacyId = normalizeWorkflowType(item.claimTypeId);
  if (legacyId) return legacyId;
  return normalizeWorkflowType(item.type ?? item.claimType) ?? WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM;
}

export function getClaimTypeForCase(item = {}) {
  return getClaimType(claimTypeIdForCase(item));
}

export function getScenario(claimTypeOrWorkflowType, scenarioId) {
  const claimType = getClaimType(claimTypeOrWorkflowType);
  return claimType.scenarios.find((item) => item.id === scenarioId || item.legacyScenarioId === scenarioId) ?? claimType.scenarios[0];
}

export function getScenarioWithTruth(claimTypeOrWorkflowType, scenarioId) {
  const claimType = getClaimType(claimTypeOrWorkflowType);
  const scenario = getScenario(claimType.id, scenarioId);
  return {
    ...scenario,
    generationKey: scenario.generationKey,
    legacyScenarioId: scenario.legacyScenarioId,
    scenarioTruthId: scenario.scenarioTruthId,
    caseTruth: getScenarioTruth(claimType.id, scenario.id),
  };
}

export function findScenarioById(scenarioId) {
  for (const claimType of coreClaimTypes) {
    const scenario = claimType.scenarios.find((item) => item.id === scenarioId || item.legacyScenarioId === scenarioId);
    if (scenario) return { claimType, scenario };
  }
  return undefined;
}

export function claimGeneratorChoices() {
  return generatorDomainChoices.map((customer) => ({
    ...customer,
    products: customer.products.map((product) => ({
      ...product,
      workflows: product.workflows.map((workflow) => {
        const claimType = getClaimType(workflow.id);
        return {
          ...workflow,
          scenarios: claimType.scenarios
            .filter((scenario) => (
              (!scenario.customerTypes?.length || scenario.customerTypes.includes(customer.id))
              && (!scenario.productTypes?.length || scenario.productTypes.includes(product.id))
            ))
            .map((scenario) => ({
              id: scenario.id,
              title: scenario.title,
              alertReason: scenario.alertReason,
              reportedAllegation: scenario.reportedAllegation,
            })),
        };
      }),
    })),
  }));
}

export function getClaimTypeForDomain({ customerType, productType, workflowType }) {
  if (!isWorkflowEnabled(customerType, productType, workflowType)) {
    const labels = caseDomainLabels({ customerType, productType, workflowType });
    throw new RangeError(`${labels.workflowTypeLabel || workflowType} is not enabled for ${labels.productTypeLabel || productType}`);
  }
  return getClaimType(workflowType);
}

export function enabledClaimTypesForProduct(customerType, productType) {
  if (getProductType(productType)?.customerType !== customerType) return [];
  return getEnabledWorkflowTypes(customerType, productType).map(getClaimType);
}
