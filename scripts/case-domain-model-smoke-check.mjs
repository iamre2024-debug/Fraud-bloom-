import assert from 'node:assert/strict';

import {
  CUSTOMER_TYPES,
  PRODUCT_TYPES,
  SUSPECTED_PATTERNS,
  WORKFLOW_TYPES,
  assertCaseDomain,
  generatorDomainChoices,
  getProductsForCustomerType,
  getWorkflowsForProduct,
  isWorkflowEnabled,
  validateCaseDomain,
  workflowTypeDefinitions,
} from '../src/data/caseDomain.js';
import {
  coreClaimTypes,
  getClaimTypeForDomain,
} from '../src/data/claimRegistry.js';
import { getScenarioTruth } from '../src/data/claimScenarioCatalog.js';
import {
  createGeneratedCase,
} from '../src/data/generatedCases.js';
import {
  buildCaseParties,
  partiesForLinkAnalysis,
} from '../src/data/caseParties.js';

const expectedMatrix = {
  [CUSTOMER_TYPES.PERSONAL]: {
    [PRODUCT_TYPES.CREDIT_CARD]: [
      WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
      WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
      WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    ],
    [PRODUCT_TYPES.DEPOSIT_ACCOUNT]: [
      WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM,
      WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM,
    ],
    [PRODUCT_TYPES.PERSONAL_LOAN]: [
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    ],
  },
  [CUSTOMER_TYPES.BUSINESS]: {
    [PRODUCT_TYPES.BUSINESS_ACCOUNT]: [
      WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
      WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW,
      WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
    ],
    [PRODUCT_TYPES.PAYROLL_PRODUCT]: [
      WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
      WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    ],
    [PRODUCT_TYPES.BUSINESS_CREDIT_CARD]: [
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
      WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
    ],
    [PRODUCT_TYPES.BUSINESS_LOAN]: [
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
      WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
    ],
  },
};

for (const [customerType, products] of Object.entries(expectedMatrix)) {
  assert.deepEqual(
    getProductsForCustomerType(customerType).map((product) => product.id),
    Object.keys(products),
    `${customerType} must expose only its configured products`,
  );

  for (const [productType, workflowTypes] of Object.entries(products)) {
    assert.deepEqual(
      getWorkflowsForProduct(customerType, productType).map((workflow) => workflow.id),
      workflowTypes,
      `${customerType}/${productType} must expose only its configured workflows`,
    );
    for (const workflowType of workflowTypes) {
      assert.equal(isWorkflowEnabled(customerType, productType, workflowType), true);
      assert.deepEqual(
        assertCaseDomain({ customerType, productType, workflowType }),
        { customerType, productType, workflowType },
      );
      assert.equal(getClaimTypeForDomain({ customerType, productType, workflowType }).id, workflowType);
    }
  }
}

assert.deepEqual(
  generatorDomainChoices.map((customer) => ({
    id: customer.id,
    products: customer.products.map((product) => ({
      id: product.id,
      workflows: product.workflows.map((workflow) => workflow.id),
    })),
  })),
  Object.entries(expectedMatrix).map(([customerType, products]) => ({
    id: customerType,
    products: Object.entries(products).map(([productType, workflows]) => ({
      id: productType,
      workflows,
    })),
  })),
  'Generator choices must use the same configurable hierarchy as case validation',
);

const unsupportedDomains = [
  {
    customerType: CUSTOMER_TYPES.BUSINESS,
    productType: PRODUCT_TYPES.CREDIT_CARD,
    workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
  },
  {
    customerType: CUSTOMER_TYPES.PERSONAL,
    productType: PRODUCT_TYPES.DEPOSIT_ACCOUNT,
    workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
  },
  {
    customerType: CUSTOMER_TYPES.BUSINESS,
    productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
    workflowType: WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
  },
  {
    customerType: CUSTOMER_TYPES.PERSONAL,
    productType: PRODUCT_TYPES.PERSONAL_LOAN,
    workflowType: WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
  },
];

for (const domain of unsupportedDomains) {
  assert.equal(validateCaseDomain(domain).valid, false, `${JSON.stringify(domain)} must be rejected`);
  assert.equal(isWorkflowEnabled(domain.customerType, domain.productType, domain.workflowType), false);
  assert.throws(() => assertCaseDomain(domain), RangeError);
  assert.throws(() => getClaimTypeForDomain(domain), RangeError);
  assert.throws(
    () => createGeneratedCase({ index: 930000, ...domain }),
    RangeError,
    'The generator must not bypass the configured product/workflow matrix',
  );
}

const forbiddenInitialType = /\b(synthetic(?: identity| fraud)?|bust[- ]out|first[- ]party fraud|mule activity|email compromise|business email compromise|\bbec\b|stolen identity|fabricated business information)\b/i;
for (const workflow of workflowTypeDefinitions) {
  assert.doesNotMatch(`${workflow.id} ${workflow.label}`, forbiddenInitialType);
}
for (const claimType of coreClaimTypes) {
  assert.doesNotMatch(`${claimType.id} ${claimType.label} ${claimType.shortLabel}`, forbiddenInitialType);
}

for (const pattern of [
  SUSPECTED_PATTERNS.SYNTHETIC_IDENTITY,
  SUSPECTED_PATTERNS.BUST_OUT,
  SUSPECTED_PATTERNS.FIRST_PARTY_FRAUD,
  SUSPECTED_PATTERNS.MULE_ACTIVITY,
  SUSPECTED_PATTERNS.EMAIL_COMPROMISE_BEC,
]) {
  assert.ok(pattern, 'Investigation patterns must remain available as internal pattern values');
  assert.equal(workflowTypeDefinitions.some((workflow) => workflow.id === pattern), false);
}

assert.notEqual(WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW, WORKFLOW_TYPES.CREDIT_RISK_REVIEW);
for (const [customerType, productTypes] of [
  [CUSTOMER_TYPES.PERSONAL, [PRODUCT_TYPES.CREDIT_CARD, PRODUCT_TYPES.PERSONAL_LOAN]],
  [CUSTOMER_TYPES.BUSINESS, [PRODUCT_TYPES.PAYROLL_PRODUCT, PRODUCT_TYPES.BUSINESS_CREDIT_CARD, PRODUCT_TYPES.BUSINESS_LOAN]],
]) {
  for (const productType of productTypes) {
    assert.equal(isWorkflowEnabled(customerType, productType, WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW), true);
    assert.equal(isWorkflowEnabled(customerType, productType, WORKFLOW_TYPES.CREDIT_RISK_REVIEW), true);
  }
}

assert.notEqual(WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER);
assert.equal(
  isWorkflowEnabled(CUSTOMER_TYPES.BUSINESS, PRODUCT_TYPES.BUSINESS_ACCOUNT, WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER),
  true,
);
assert.equal(
  isWorkflowEnabled(CUSTOMER_TYPES.BUSINESS, PRODUCT_TYPES.PAYROLL_PRODUCT, WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER),
  false,
);
assert.equal(
  isWorkflowEnabled(CUSTOMER_TYPES.BUSINESS, PRODUCT_TYPES.PAYROLL_PRODUCT, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER),
  true,
);
assert.equal(
  isWorkflowEnabled(CUSTOMER_TYPES.BUSINESS, PRODUCT_TYPES.BUSINESS_ACCOUNT, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER),
  false,
);

const businessApplication = createGeneratedCase({
  index: 930101,
  customerType: CUSTOMER_TYPES.BUSINESS,
  productType: PRODUCT_TYPES.BUSINESS_LOAN,
  workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
  difficulty: 'deep',
  evidenceDepth: 'deep',
});
const businessParties = buildCaseParties(businessApplication);
for (const role of [
  /business account holder|business\s*\/\s*entity/i,
  /application submitter/i,
  /beneficial owner/i,
  /control person/i,
  /personal guarantor/i,
  /authorized administrator/i,
]) {
  assert.ok(businessParties.some((party) => role.test(party.role)), `Business application is missing ${role}`);
}
const entity = businessParties.find((party) => party.partyType === 'entity');
assert.ok(entity?.businessId && entity?.fictionalEin, 'The applicant entity must have fictional business identifiers');
const relevantPeople = businessParties.filter((party) => party.partyType === 'person');
assert.ok(relevantPeople.length >= 5);
assert.ok(relevantPeople.every((party) => party.trainingId), 'Every relevant person must have a fictional Training ID');
assert.equal(new Set(relevantPeople.map((party) => party.trainingId)).size, relevantPeople.length);
assert.equal(
  partiesForLinkAnalysis(businessApplication).length,
  businessParties.length,
  'Link Analysis must cover the entity and every relevant application person',
);

for (const claimType of coreClaimTypes) {
  for (const scenario of claimType.scenarios) {
    const truth = getScenarioTruth(claimType.id, scenario.id);
    if (claimType.id !== WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
      assert.equal(
        truth?.suspectedPatterns.includes(SUSPECTED_PATTERNS.BUST_OUT),
        false,
        `${claimType.id}/${scenario.id} must not assign bust-out outside Credit Risk Review`,
      );
    }
  }
}
const businessCreditRiskClaim = coreClaimTypes.find((claimType) => (
  claimType.id === WORKFLOW_TYPES.CREDIT_RISK_REVIEW
));
assert.ok(
  businessCreditRiskClaim.scenarios.some((scenario) => (
    scenario.customerTypes?.includes(CUSTOMER_TYPES.BUSINESS)
    && getScenarioTruth(businessCreditRiskClaim.id, scenario.id)?.suspectedPatterns.includes(SUSPECTED_PATTERNS.BUST_OUT)
  )),
  'Bust-out must remain available as a possible finding inside Business Credit Risk Review',
);

const mulePatternScenarios = coreClaimTypes.flatMap((claimType) => (
  claimType.scenarios
    .filter((scenario) => getScenarioTruth(claimType.id, scenario.id)?.suspectedPatterns.includes(SUSPECTED_PATTERNS.MULE_ACTIVITY))
    .map((scenario) => ({ claimType, scenario }))
));
assert.ok(mulePatternScenarios.length, 'Mule activity must remain available as a private pattern within an appropriate review');
for (const { claimType, scenario } of mulePatternScenarios) {
  assert.doesNotMatch(
    JSON.stringify(scenario),
    /\b(mule activity|money mule)\b/i,
    `${claimType.id}/${scenario.id} must not expose its private mule-activity theory in public scenario data`,
  );
}

console.log('Case domain model smoke check passed: configurable routing rejects unsupported combinations and keeps patterns separate from workflows.');
