import assert from 'node:assert/strict';

import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { PRODUCT_TYPES, WORKFLOW_TYPES } from '../src/data/caseDomain.js';
import { trainingCases } from '../src/data/cases.js';
import { coreClaimTypes } from '../src/data/claimRegistry.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import { getIdentityIntelReport } from '../src/data/identityIntelReport.js';
import { getRelationshipAccounts } from '../src/data/relationshipAccounts.js';
import { getSessionRecords } from '../src/data/sessionRecords.js';
import { getFinancialRecords } from '../src/data/caseToolData.js';

const cases = enrichTrainingCases(trainingCases);
const creditLineCase = cases.find((item) => item.id === 'FA-CR-24003');
assert.ok(creditLineCase, 'The built-in personal credit-line case must remain available.');
assert.equal(creditLineCase.productType, PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT);
assert.equal(creditLineCase.productTypeLabel, 'Personal line of credit');
assert.match(creditLineCase.alertReason, /\$2,400.*five minutes.*one-day-old.*\$8,000/i);
assert.match(creditLineCase.reportedAllegation, /\$2,400 draw.*one-day-old.*\$8,000 personal line of credit/i);
assert.match(creditLineCase.reportedAllegation, /draw itself is normal.*not a fraud finding/i);
assert.match(creditLineCase.alertHandlingNote, /draw alone would not become a case/i);

const drawEvent = creditLineCase.events.find((item) => item.id === 'EVT-3308');
assert.equal(drawEvent?.label, 'Credit-line draw request submitted');
assert.match(drawEvent?.detail ?? '', /\$2,400.*\$8,000 personal line of credit/i);

const relationship = getRelationshipAccounts(creditLineCase);
const primaryAccount = relationship.find((item) => item.isPrimary);
assert.equal(primaryAccount?.productType, PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT);
assert.equal(primaryAccount?.productKind, 'revolving-credit-line');
assert.equal(primaryAccount?.creditLimit, 8000);
assert.equal(primaryAccount?.holds, '$2,400.00 requested amount has not been released');

const financial = getFinancialRecords(creditLineCase);
const drawRecord = financial.transactions.find((item) => item.id === 'TXN-3301');
assert.equal(drawRecord?.instrument, 'Personal line of credit');
assert.equal(drawRecord?.status, 'Requested · not released');
assert.match(drawRecord?.context ?? '', /one day after opening.*five minutes after/i);

const sessions = getSessionRecords(creditLineCase);
const postDrawSession = sessions.find((item) => item.session === 'SES-9302');
assert.deepEqual(postDrawSession?.profileActions, ['No profile change recorded']);
assert.ok(postDrawSession?.moneyMovement.some((item) => /EVT-3308.*\$2,400 credit-line draw/i.test(item)));
const recoverySession = sessions.find((item) => item.session === 'SES-9100');
assert.ok(recoverySession?.profileActions.some((item) => /PCH-3302.*Recovery phone verified/i.test(item)));

const identity = getIdentityIntelReport(creditLineCase);
assert.equal(identity.profile.employer, 'Lakeside Office Supply');

const semanticLinePattern = /credit line|line increase|line usage|available line|sudden draw/i;
let generatedCombinations = 0;
let generatedApplications = 0;
let generatedCreditReviews = 0;
let index = 880000;

for (const claimType of coreClaimTypes.filter((item) => (
  [WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW, WORKFLOW_TYPES.CREDIT_RISK_REVIEW].includes(item.workflowType)
))) {
  for (const scenario of claimType.scenarios) {
    assert.doesNotMatch(scenario.title, /review review/i);
    for (const customerType of scenario.customerTypes) {
      for (const productType of scenario.productTypes) {
        const generated = createGeneratedCase({
          index: index += 1,
          customerType,
          productType,
          workflowType: claimType.workflowType,
          scenarioId: scenario.id,
          difficulty: 'light',
          evidenceDepth: 'light',
        });
        generatedCombinations += 1;
        const scenarioText = `${scenario.alertReason} ${scenario.transactionInfo}`;

        if (productType === PRODUCT_TYPES.PERSONAL_LOAN || productType === PRODUCT_TYPES.BUSINESS_LOAN) {
          assert.doesNotMatch(
            scenarioText,
            semanticLinePattern,
            `${scenario.id}/${productType} must not describe an installment loan as a line of credit.`,
          );
        }

        if (claimType.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
          generatedApplications += 1;
          assert.deepEqual(
            generated.toolResults.transactions,
            [],
            `${scenario.id}/${productType} must not invent a debit transaction for an application-only review.`,
          );
          for (const paymentRecord of generated.toolResults.paymentVerification ?? []) {
            assert.equal(paymentRecord.type, 'Application repayment account');
            assert.match(paymentRecord.context, /no transaction is in scope/i);
            assert.equal(paymentRecord.recoverability, 'Not applicable — no funds moved');
          }
          continue;
        }

        generatedCreditReviews += 1;
        const generatedPrimary = generated.toolResults.relationshipAccounts.find((item) => item.isPrimary);
        const generatedTransaction = generated.toolResults.transactions[0];
        if ([PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT, PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT].includes(productType)) {
          assert.equal(generatedPrimary?.productKind, 'revolving-credit-line');
          assert.match(generatedTransaction?.instrument ?? '', /line of credit/i);
        }
        if ([PRODUCT_TYPES.PERSONAL_LOAN, PRODUCT_TYPES.BUSINESS_LOAN].includes(productType)) {
          assert.match(generatedPrimary?.productKind ?? '', /installment-loan/i);
          assert.match(generatedTransaction?.instrument ?? '', /installment loan/i);
        }
      }
    }
  }
}

assert.ok(generatedApplications > 0);
assert.ok(generatedCreditReviews > 0);
console.log(`Case semantic consistency smoke check passed for the built-in credit-line case and ${generatedCombinations} generated credit product/scenario combinations.`);
