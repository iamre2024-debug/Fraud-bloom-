import {
  buildReviewPackage,
  getDecisionCallGroups,
  getFinalFindingChoices,
  getReviewDisplaySnapshot,
  getRequiredReviewTools,
  getReviewPackageStatus,
  isValidReviewPackage,
  minimumRationaleWords,
  normalizeDecisionDraft,
  normalizeReviewPackage,
  REVIEW_PACKAGE_SCHEMA_VERSION,
} from '../src/data/reviewPackage.js';
import {
  getDecisionChecklist,
  indicatorAnswerChoices,
  summarizeDecisionIndicators,
} from '../src/data/decisionChecklist.js';
import * as decisionChecklistApi from '../src/data/decisionChecklist.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requiredTools = ['Case Briefing', 'Customer 360'];
const cardCase = {
  id: 'FA-SMOKE-CARD',
  customerType: 'personal',
  productType: 'credit-card',
  workflowType: 'unauthorized-card-transaction-claim',
  alertReason: 'Unrecognized card transaction',
  reportedAllegation: 'The customer reports an unauthorized card transaction.',
  requiredTools,
};
const payrollCase = {
  id: 'FA-SMOKE-PAYROLL',
  customerType: 'business',
  productType: 'payroll-product',
  workflowType: 'payroll-change-alert',
  requiredTools,
};
const payrollAtoCase = {
  ...payrollCase,
  id: 'FA-SMOKE-PAYROLL-ATO',
  workflowType: 'payroll-account-takeover',
};
const businessAtoCase = {
  id: 'FA-SMOKE-BUSINESS-ATO',
  customerType: 'business',
  productType: 'business-account',
  workflowType: 'business-account-takeover',
  requiredTools,
};
const businessApplicationCase = {
  id: 'FA-SMOKE-BUSINESS-APP',
  customerType: 'business',
  productType: 'business-loan',
  workflowType: 'credit-application-review',
  requiredTools,
};
const creditRiskCase = {
  id: 'FA-SMOKE-CREDIT-RISK',
  customerType: 'personal',
  productType: 'personal-loan',
  workflowType: 'credit-risk-review',
  requiredTools,
};
const linkedPersonalCase = {
  ...creditRiskCase,
  id: 'FA-SMOKE-LINKED-PERSONAL',
  productType: 'credit-card',
  requiredTools: [
    'Case Briefing',
    'Customer 360',
    'Business 360',
    'KYB Review',
    'Employee Profile',
    'Payroll History',
  ],
  businessRelationships: [{
    businessId: 'BIZ-TRAINING-42',
    relationshipType: 'Control person',
  }],
};

const cardOptions = getDecisionCallGroups(cardCase)[0].options;
assert(cardOptions.includes('Support Customer Claim'), 'Card claim should offer Support Customer Claim.');
assert(cardOptions.includes('Do Not Support Customer Claim'), 'Card claim should offer Do Not Support Customer Claim.');
assert(!cardOptions.includes('Release'), 'Card claim should not receive a payroll release decision.');

const payrollOptions = getDecisionCallGroups(payrollCase)[0].options;
assert(payrollOptions.includes('Hold') && payrollOptions.includes('Release'), 'Payroll review should route to hold/release operational decisions.');

const applicationOptions = getDecisionCallGroups(businessApplicationCase)[0].options;
assert(applicationOptions.includes('Approve') && applicationOptions.includes('Deny'), 'Application review should route to application decisions.');

const creditRiskOptions = getDecisionCallGroups(creditRiskCase)[0].options;
assert(creditRiskOptions.includes('Maintain') && creditRiskOptions.includes('Restrict / Reduce'), 'Credit risk review should route to exposure decisions.');
assert(getFinalFindingChoices(creditRiskCase).includes('Credit Risk Concern'), 'Credit risk review should allow Credit Risk Concern.');
assert(
  JSON.stringify(getRequiredReviewTools(linkedPersonalCase))
    === JSON.stringify(['Case Briefing', 'Customer 360', 'Business 360']),
  'An ownership-linked personal review should retain Business 360 while excluding KYB and payroll tools.',
);
const unsupportedBusinessApplication = {
  ...businessApplicationCase,
  productType: 'business-account',
};
assert(
  getDecisionCallGroups(unsupportedBusinessApplication)[0].options.length === 0,
  'Unsupported workflow and product combinations should not expose operational decisions.',
);
assert(
  getDecisionChecklist(unsupportedBusinessApplication).title === 'Case decision checklist',
  'Unsupported workflow and product combinations should not receive an inappropriate checklist.',
);

const businessApplicationChecklist = getDecisionChecklist(businessApplicationCase);
assert(businessApplicationChecklist.title === 'Business Credit Application Review checklist', 'Business applications should receive the entity-and-party checklist.');
const businessApplicationPrompts = businessApplicationChecklist.flags.map((item) => item.prompt).join(' ');
for (const role of ['beneficial owner', 'control person', 'guarantor', 'submitter', 'administrator']) {
  assert(businessApplicationPrompts.toLowerCase().includes(role), `Business application checklist should include the ${role} role.`);
}

assert(
  getDecisionChecklist(businessAtoCase).title === 'Business Account Takeover checklist',
  'General Business Account Takeover should have its own routed checklist.',
);
assert(
  getDecisionChecklist(payrollAtoCase).title === 'Payroll Account Takeover checklist',
  'Payroll Account Takeover should remain separate from general Business Account Takeover.',
);

const publicCardChecklist = getDecisionChecklist(cardCase);
assert(
  publicCardChecklist.flags.every((item) => (
    !Object.hasOwn(item, 'type')
    && !Object.hasOwn(item, 'weight')
    && !Object.hasOwn(item, 'requiresAttention')
  )),
  'The pre-submission checklist API must not expose expected classification, weight, or attention hints.',
);
assert(
  !Object.hasOwn(decisionChecklistApi, 'flagWeightPoints')
    && !Object.hasOwn(decisionChecklistApi, 'flagColorMeanings'),
  'Classification and weight tables must not be exported through the pre-submission checklist module API.',
);
assert(
  publicCardChecklist.flags.every((item) => (
    JSON.stringify(item.answerChoices) === JSON.stringify(indicatorAnswerChoices)
  )),
  'Every indicator must expose exactly Yes, No, and Not enough evidence as learner choices.',
);

function statusFor(activeCase, draft) {
  return getReviewPackageStatus({
    activeCase,
    completedTools: requiredTools,
    tray: [],
    notes: [],
    draft,
  });
}

const missingFindingStatus = statusFor(cardCase, {
  operationalDecision: 'Support Customer Claim',
  finalFinding: '',
  findingBasis: '',
});
assert(!missingFindingStatus.ready, 'Operational decision alone must not be submittable.');
assert(missingFindingStatus.blockers.includes('select a final finding'), 'Missing final finding should be reported as a blocker.');

const confirmedWithoutBasis = statusFor(cardCase, {
  operationalDecision: 'Support Customer Claim',
  finalFinding: 'Fraud Confirmed',
  findingBasis: '',
});
assert(!confirmedWithoutBasis.ready, 'Fraud Confirmed must require a written basis.');

const confirmedWithoutEvidenceTie = statusFor(cardCase, {
  operationalDecision: 'Support Customer Claim',
  finalFinding: 'Fraud Confirmed',
  findingBasis: 'The available information across the case supports this result after a complete investigation review.',
});
assert(!confirmedWithoutEvidenceTie.ready, 'Fraud Confirmed must require an evidence tie, not just enough words.');

const confirmedWithEvidence = statusFor(cardCase, {
  operationalDecision: 'Support Customer Claim',
  finalFinding: 'Fraud Confirmed',
  findingBasis: `Transaction TXN-SMOKE-001 and device DEV-SMOKE-002 establish unauthorized use after the profile control changed during the disputed activity window.`,
});
assert(confirmedWithEvidence.rationaleWordCount >= minimumRationaleWords, 'Confirmed-fraud test basis should meet the minimum word count.');
assert(confirmedWithEvidence.hasEvidenceTie, 'Exact record IDs should satisfy the evidence-tie requirement.');
assert(confirmedWithEvidence.ready, 'Evidence-supported Fraud Confirmed package should be ready.');

const ordinaryFindingWithoutBasis = statusFor(cardCase, {
  operationalDecision: 'Do Not Support Customer Claim',
  finalFinding: 'Fraud Not Found',
  findingBasis: '',
});
assert(!ordinaryFindingWithoutBasis.ready, 'Every determination must require a rationale, not only Fraud Confirmed.');
const ordinaryFindingWithoutEvidenceTie = statusFor(cardCase, {
  operationalDecision: 'Do Not Support Customer Claim',
  finalFinding: 'Fraud Not Found',
  findingBasis: 'The reviewed information is sufficiently consistent to support this determination after the investigation was completed.',
});
assert(!ordinaryFindingWithoutEvidenceTie.ready, 'Every determination rationale must tie to evidence or a documented indicator answer.');

const denialWithoutReason = statusFor(businessApplicationCase, {
  operationalDecision: 'Deny',
  finalFinding: 'Verification Incomplete',
  findingBasis: '',
});
assert(!denialWithoutReason.ready, 'An application denial must require a factual reason.');
const denialWithReason = statusFor(businessApplicationCase, {
  operationalDecision: 'Deny',
  finalFinding: 'Verification Incomplete',
  findingBasis: 'Document DOC-ENTITY-404 remains unavailable after the documented entity-registration verification request and follow-up review.',
});
assert(denialWithReason.ready, 'A factual denial reason should not be converted into a fraud finding.');

const indicatorId = getDecisionChecklist(cardCase).flags[0].id;
const noIndicatorId = getDecisionChecklist(cardCase).flags[1].id;
const insufficientIndicatorId = getDecisionChecklist(cardCase).flags[2].id;
const advisorySummary = summarizeDecisionIndicators(cardCase, {
  [indicatorId]: {
    answer: 'Yes',
    proof: 'TXN-SMOKE-RED-001',
    explanation: 'The transaction record contains an unresolved authentication mismatch.',
  },
  [noIndicatorId]: {
    answer: 'No',
    proof: 'AUTH-SMOKE-002',
    explanation: 'The reviewed authorization record does not contain this condition.',
  },
  [insufficientIndicatorId]: {
    answer: 'Not enough evidence',
    explanation: 'The required merchant record has not been supplied.',
  },
});
assert(
  advisorySummary.answeredCount === 3
    && advisorySummary.answerCounts.Yes === 1
    && advisorySummary.answerCounts.No === 1
    && advisorySummary.answerCounts['Not enough evidence'] === 1
    && advisorySummary.incompleteIndicators.length === 0
    && advisorySummary.advisoryOnly,
  'Indicator summaries should preserve explicit learner answers as advisory evidence.',
);
assert(
  !Object.hasOwn(advisorySummary, 'redPoints')
    && !Object.hasOwn(advisorySummary, 'greenPoints')
    && !Object.hasOwn(advisorySummary, 'redIndicators')
    && advisorySummary.answeredIndicators.every((item) => !Object.hasOwn(item, 'type') && !Object.hasOwn(item, 'weight')),
  'Pre-submission summaries must not expose expected classifications or weights.',
);
const nonFraudWithRedEvidence = statusFor(cardCase, {
  operationalDecision: 'Do Not Support Customer Claim',
  finalFinding: 'Fraud Not Found',
  findingBasis: 'Transaction TXN-SMOKE-RED-001 was reviewed with the related authorization record and supports the documented non-fraud determination.',
  indicators: {
    [indicatorId]: {
      answer: 'Yes',
      proof: 'TXN-SMOKE-RED-001',
      explanation: 'The transaction record contains an unresolved authentication mismatch.',
    },
  },
});
assert(nonFraudWithRedEvidence.ready, 'Checklist points must not automatically determine fraud.');

const legacyDraft = normalizeDecisionDraft({
  choice: 'Deny claim / customer claim not supported',
  reason: 'Legacy learner rationale remains available.',
  confidence: 'High',
}, cardCase);
assert(legacyDraft.operationalDecision === 'Do Not Support Customer Claim', 'Legacy choice should map to the nearest canonical operational decision.');
assert(legacyDraft.finalFinding === '', 'Legacy decision must not silently invent a final fraud finding.');
assert(legacyDraft.findingBasis === 'Legacy learner rationale remains available.', 'Legacy rationale should survive normalization.');

const legacyPackage = normalizeReviewPackage({
  id: 'FA-SMOKE-CARD-LEGACY',
  caseId: cardCase.id,
  choice: 'Deny claim / customer claim not supported',
  reason: 'Legacy learner rationale remains available.',
  completedTools: ['Evidence Center', 'Financial Intelligence'],
  requiredTools: ['Case Summary', 'Evidence Center', 'Business Intelligence'],
  missingTools: ['Business Intelligence'],
  noteSnapshot: ['Jul 8, 2026 · Financial Intelligence · Saved note.'],
  savedAt: 'Jul 8, 2026, 10:00 AM',
}, cardCase);
assert(legacyPackage.legacyDecisionFormat, 'Legacy package should remain marked as a compatibility record.');
assert(isValidReviewPackage(cardCase, legacyPackage), 'Legacy package should continue to unlock existing learner progress.');
assert(legacyPackage.savedAt === 'Jul 8, 2026, 10:00 AM', 'Legacy saved timestamp should be preserved.');
assert(
  JSON.stringify(legacyPackage.completedTools) === JSON.stringify(['Document Viewer', 'Financial Investigation']),
  'Legacy completed-tool aliases should normalize without losing progress.',
);
assert(
  JSON.stringify(legacyPackage.requiredTools) === JSON.stringify(['Case Briefing', 'Document Viewer', 'Business 360'])
  && JSON.stringify(legacyPackage.missingTools) === JSON.stringify(['Business 360']),
  'Legacy review-package coverage arrays should normalize consistently.',
);
assert(
  legacyPackage.noteSnapshot[0] === 'Jul 8, 2026 · Financial Intelligence · Saved note.',
  'Legacy package note snapshots should retain learner-authored text byte for byte.',
);
const versionedLegacyPackage = normalizeReviewPackage({
  ...legacyPackage,
  operationalDecision: 'Do Not Support Customer Claim',
  finalFinding: '',
  legacyDecisionFormat: undefined,
}, cardCase);
assert(isValidReviewPackage(cardCase, versionedLegacyPackage), 'A migrated legacy package with an operational decision but no historical final finding should remain valid.');

const suppliedPins = Array.from({ length: 11 }, (_, index) => ({
  id: `PIN-${index + 1}`,
  metadata: { sourceState: 'reviewed' },
}));
const suppliedNotes = Array.from({ length: 12 }, (_, index) => ({
  id: `NOTE-${index + 1}`,
  text: `Note ${index + 1}`,
  citation: { recordId: `REC-${index + 1}` },
}));
const builtPackage = buildReviewPackage({
  caseId: cardCase.id,
  agentId: 'AGT-SMOKE',
  activeCase: cardCase,
  draft: {
    operationalDecision: 'Support Customer Claim',
    finalFinding: 'Fraud Confirmed',
    findingBasis: 'Transaction TXN-SMOKE-001 and device DEV-SMOKE-002 establish unauthorized activity in the reviewed case timeline and access records.',
    confidence: 'High',
    indicators: {},
  },
  completedTools: requiredTools,
  tray: suppliedPins,
  notes: suppliedNotes,
  packageStatus: confirmedWithEvidence,
});
suppliedPins[0].metadata.sourceState = 'mutated after submission';
suppliedNotes[0].citation.recordId = 'MUTATED-AFTER-SUBMISSION';
assert(builtPackage.operationalDecision === 'Support Customer Claim', 'Saved package should store the operational decision explicitly.');
assert(builtPackage.finalFinding === 'Fraud Confirmed', 'Saved package should store the final finding explicitly.');
assert(builtPackage.findingBasis.includes('TXN-SMOKE-001'), 'Saved package should store the evidence-based finding rationale.');
assert(builtPackage.choice === builtPackage.operationalDecision, 'Compatibility choice alias should mirror the operational decision.');
assert(
  JSON.stringify(builtPackage.requiredTools) === JSON.stringify(requiredTools),
  'New packages should persist the routed required-tool contract explicitly.',
);
assert(isValidReviewPackage(cardCase, builtPackage), 'New package should validate against both workflow fields.');
assert(
  builtPackage.packageSchemaVersion === REVIEW_PACKAGE_SCHEMA_VERSION
    && builtPackage.packageVersion === 1
    && builtPackage.supersedesPackageId === null,
  'The first saved package should carry explicit schema and case-package version metadata.',
);
assert(
  builtPackage.pinnedEvidence.length === 11 && builtPackage.noteSnapshot.length === 12,
  'Saved packages must retain every supplied pin and note without silent truncation.',
);
assert(
  builtPackage.pinnedEvidence[0].metadata.sourceState === 'reviewed'
    && builtPackage.noteSnapshot[0].citation.recordId === 'REC-1',
  'Saved packages must deep-snapshot nested pin and note content instead of retaining mutable live references.',
);

const amendedPackage = buildReviewPackage({
  caseId: cardCase.id,
  agentId: 'AGT-SMOKE',
  activeCase: cardCase,
  draft: {
    operationalDecision: 'Support Customer Claim',
    finalFinding: 'Fraud Confirmed',
    findingBasis: 'Transaction TXN-SMOKE-001 and device DEV-SMOKE-002 remain the controlling evidence for the amended determination package.',
    confidence: 'High',
    indicators: {},
  },
  completedTools: requiredTools,
  tray: [],
  notes: [],
  packageStatus: confirmedWithEvidence,
  previousPackage: builtPackage,
});
assert(
  amendedPackage.packageVersion === 2
    && amendedPackage.supersedesPackageId === builtPackage.id,
  'A later package should increment the case version and identify the package it supersedes.',
);

const phantomCompletionStatus = getReviewPackageStatus({
  activeCase: cardCase,
  completedTools: ['Case Summary', 'Customer 360'],
  tray: [],
  notes: [],
  draft: {
    operationalDecision: 'Support Customer Claim',
    finalFinding: 'Fraud Confirmed',
    findingBasis: 'Transaction TXN-SMOKE-001 and device DEV-SMOKE-002 support this evidence-based determination after review.',
  },
});
assert(
  phantomCompletionStatus.missingTools.includes('Case Briefing')
    && phantomCompletionStatus.reviewedRequired === 1,
  'The legacy auto-completed Case Summary marker must not count as a reviewed Case Briefing.',
);

const frozenDisplaySnapshot = getReviewDisplaySnapshot({
  activeCase: cardCase,
  reviewPackage: builtPackage,
  decisionDraft: {
    operationalDecision: 'Do Not Support Customer Claim',
    finalFinding: 'Fraud Not Found',
    findingBasis: 'This live draft changed after submission.',
    confidence: 'Low',
  },
  tray: ['LIVE-PIN-AFTER-SUBMISSION'],
  notes: ['Live note added after submission.'],
  packageStatus: {
    reviewedRequired: 99,
    totalRequired: 99,
    indicatorSummary: { selectedCount: 99 },
  },
});
assert(
  frozenDisplaySnapshot.decision.operationalDecision === builtPackage.operationalDecision
    && frozenDisplaySnapshot.decision.finalFinding === builtPackage.finalFinding
    && frozenDisplaySnapshot.decision.confidence === builtPackage.confidence,
  'A locked review display should render the saved package decision instead of a later live draft.',
);
assert(
  frozenDisplaySnapshot.pinnedEvidence.length === builtPackage.pinnedEvidence.length
    && frozenDisplaySnapshot.noteSnapshot.length === builtPackage.noteSnapshot.length
    && !frozenDisplaySnapshot.pinnedEvidence.includes('LIVE-PIN-AFTER-SUBMISSION'),
  'Saved pin and note snapshots should remain complete and frozen after live case mutations.',
);
assert(
  frozenDisplaySnapshot.reviewedRequired === builtPackage.reviewedRequired
    && frozenDisplaySnapshot.totalRequired === builtPackage.totalRequired
    && frozenDisplaySnapshot.indicatorCount === 0,
  'A locked review display should render saved coverage and indicator counts instead of live status.',
);

console.log('Review package smoke check passed. Indicator answers are explicit and classification-safe, every determination requires evidence, phantom Case Summary completion is ignored, full snapshots are retained, package versions are recorded, and legacy packages remain readable.');
