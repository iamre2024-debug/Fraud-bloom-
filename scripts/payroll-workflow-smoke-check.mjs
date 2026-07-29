import assert from 'node:assert/strict';

import {
  CUSTOMER_TYPES,
  PRODUCT_TYPES,
  SUSPECTED_PATTERNS,
  WORKFLOW_TYPES,
} from '../src/data/caseDomain.js';
import { getClaimType } from '../src/data/claimRegistry.js';
import {
  createGeneratedCase,
  getGeneratedCaseTruth,
} from '../src/data/generatedCases.js';
import {
  UNKNOWN_REQUEST_METHOD,
  normalizePayrollInvestigationState,
  payrollIntakeDisclosure,
  recordTrustedBusinessResponse,
  visiblePayrollEmailEvidence,
} from '../src/data/payrollInvestigation.js';
import { getScenarioTruth } from '../src/data/claimScenarioCatalog.js';

const payrollChange = getClaimType(WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT);
const emailPatternScenario = payrollChange.scenarios.find((scenario) => (
  getScenarioTruth(payrollChange.id, scenario.id)?.suspectedPatterns.includes(SUSPECTED_PATTERNS.EMAIL_COMPROMISE_BEC)
));
assert.ok(emailPatternScenario, 'The payroll alert catalog needs a post-investigation email-compromise scenario');

const changeCase = createGeneratedCase({
  index: 940101,
  customerType: CUSTOMER_TYPES.BUSINESS,
  productType: PRODUCT_TYPES.PAYROLL_PRODUCT,
  workflowType: WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
  scenarioId: emailPatternScenario.id,
  difficulty: 'deep',
  evidenceDepth: 'deep',
});

const intakeDisclosure = payrollIntakeDisclosure(changeCase);
assert.deepEqual(intakeDisclosure, {
  requestMethod: UNKNOWN_REQUEST_METHOD,
  businessContactCompleted: false,
  emailEvidenceAvailable: false,
  emailEvidence: null,
});
assert.equal(changeCase.intake.channel, 'Platform payroll alert');
assert.match(
  changeCase.alertReason,
  /employee|destination|bank account|payroll amount|timing|administrator/i,
  'Payroll intake must start from a platform-observable change or anomaly',
);
assert.match(changeCase.statement.value, /request method is unknown at intake/i);
assert.ok(changeCase.intakeAnswers.every((item) => (
  /unknown at intake|trusted, previously known contact|not yet been recorded/i.test(item.answer)
)));
assert.doesNotMatch(
  JSON.stringify({
    alertReason: changeCase.alertReason,
    reportedAllegation: changeCase.reportedAllegation,
    statement: changeCase.statement,
    intake: changeCase.intake,
    intakeAnswers: changeCase.intakeAnswers,
  }),
  /header[- ]from|reply[- ]to|mailbox rule|mailbox access|compromised mailbox|spoofed employee email/i,
  'Email evidence must not appear in the payroll intake packet',
);
assert.equal(getGeneratedCaseTruth(changeCase, { submitted: false }), undefined);

assert.deepEqual(normalizePayrollInvestigationState({
  trustedContactStarted: true,
  requestMethod: 'Email',
  businessStatement: 'Trusted fictional business response.',
  emailEvidenceProvided: true,
  businessResponseSaved: true,
}), {
  trustedContactStarted: true,
  requestMethod: 'Email',
  businessStatement: 'Trusted fictional business response.',
  emailEvidenceProvided: true,
  businessResponseSaved: true,
});
assert.equal(
  normalizePayrollInvestigationState({ requestMethod: 'Phone', emailEvidenceProvided: true }).emailEvidenceProvided,
  false,
  'Persisted email evidence must only rehydrate after an email-reported request.',
);
assert.equal(
  visiblePayrollEmailEvidence(null),
  null,
  'Payroll History must remain renderable before a trusted business response exists.',
);

const emailReportedWithoutEvidence = recordTrustedBusinessResponse({
  requestMethod: 'Email',
  businessStatement: 'The trusted business contact says the request arrived by email.',
});
assert.equal(emailReportedWithoutEvidence.businessContactCompleted, true);
assert.match(emailReportedWithoutEvidence.employeeCallbackInstruction, /trusted, previously known phone number/i);
assert.equal(emailReportedWithoutEvidence.emailEvidenceAvailable, false);
assert.equal(visiblePayrollEmailEvidence(emailReportedWithoutEvidence), null);

const evidenceBeforeEmailReport = recordTrustedBusinessResponse({
  requestMethod: 'Phone',
  emailEvidence: {
    headerFrom: 'payroll-change@training.example.test',
    headerReplyTo: 'unverified@training.example.test',
  },
});
assert.equal(evidenceBeforeEmailReport.emailEvidenceAvailable, false);
assert.equal(visiblePayrollEmailEvidence(evidenceBeforeEmailReport), null);

const businessSuppliedEmailEvidence = recordTrustedBusinessResponse({
  requestMethod: 'Email',
  businessContactMethod: 'Previously known business phone',
  businessStatement: 'The trusted business contact supplied the request record.',
  emailEvidence: {
    headerFrom: 'employee@training.example.test',
    headerReplyTo: 'destination-change@training.example.test',
    received: 'Jul 11, 2026 · 9:14 AM',
    mailboxNote: 'Fictional training mailbox record supplied by the business.',
  },
});
const visibleEmailEvidence = visiblePayrollEmailEvidence(businessSuppliedEmailEvidence);
assert.equal(businessSuppliedEmailEvidence.businessContactCompleted, true);
assert.equal(businessSuppliedEmailEvidence.emailEvidenceAvailable, true);
assert.equal(visibleEmailEvidence?.source, 'Business-supplied evidence after trusted contact');
assert.equal(visibleEmailEvidence?.headerFrom, 'employee@training.example.test');

const payrollAto = createGeneratedCase({
  index: 940202,
  customerType: CUSTOMER_TYPES.BUSINESS,
  productType: PRODUCT_TYPES.PAYROLL_PRODUCT,
  workflowType: WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
  difficulty: 'deep',
  evidenceDepth: 'deep',
});
assert.notEqual(payrollAto.workflowType, changeCase.workflowType);
assert.equal(payrollIntakeDisclosure(payrollAto).requestMethod, 'Not established');
for (const role of [/initiator/i, /approver/i, /administrator/i]) {
  assert.ok(payrollAto.parties.some((party) => role.test(party.role)), `Payroll ATO is missing ${role}`);
}
for (const tool of ['Payroll History', 'Login History', 'Session History', 'Device Intelligence', 'IP Intelligence', 'Payment Verification']) {
  assert.ok(payrollAto.availableTools.includes(tool), `Payroll ATO is missing ${tool}`);
}
assert.ok(payrollAto.loginHistory.some((record) => record.deviceId && record.ip && record.session));
assert.ok(
  payrollAto.toolResults.payrollHistory?.payrollRuns?.length,
  'Payroll ATO must include normalized company payroll history',
);
assert.ok(
  payrollAto.toolResults.paymentVerification?.some((record) => record.recoverability),
  'Payroll ATO must include funds/recovery information when available',
);

console.log('Payroll workflow smoke check passed: intake request method is unknown, email evidence is gated, and Payroll ATO remains separate.');
