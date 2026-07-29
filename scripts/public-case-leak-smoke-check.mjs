import assert from 'node:assert/strict';

import {
  SUSPECTED_PATTERNS,
  isWorkflowEnabled,
} from '../src/data/caseDomain.js';
import { coreClaimTypes } from '../src/data/claimRegistry.js';
import {
  createGeneratedCase,
  getGeneratedCaseTruth,
} from '../src/data/generatedCases.js';
import {
  publicAlertReason,
  publicCaseFacts,
  publicCaseSearchText,
  publicCaseSummary,
  publicCaseTaxonomy,
  publicReportedAllegation,
  publicScenarioLabel,
} from '../src/data/publicCaseView.js';

const forbiddenPublicAnswer = /\b(synthetic identity|synthetic fraud|bust[- ]out(?: fraud)?|first[- ]party fraud|mule activity|money mule|spoofed email|compromised mailbox|email compromise|business email compromise|\bbec\b|stolen identity|fabricated business information|linked prior fraud)\b/i;

function compatibleDomain(claimType, scenario) {
  for (const customerType of scenario.customerTypes ?? claimType.customerTypes) {
    for (const productType of scenario.productTypes ?? claimType.productTypes) {
      if (isWorkflowEnabled(customerType, productType, claimType.id)) {
        return { customerType, productType, workflowType: claimType.id };
      }
    }
  }
  throw new Error(`No enabled domain found for ${claimType.id}/${scenario.id}`);
}

function timelineLabels(item) {
  return (item.events ?? []).map((event) => ({
    title: event.title,
    label: event.label,
    type: event.type,
    eventType: event.eventType,
  }));
}

function publicSurface(item) {
  return {
    id: item.id,
    type: item.type,
    claimType: item.claimType,
    lane: item.lane,
    title: item.title,
    subtype: item.subtype,
    scenarioTitle: item.scenarioTitle,
    scenarioVariant: item.scenarioVariant,
    scenarioFamily: item.scenarioFamily,
    alertReason: item.alertReason,
    reportedAllegation: item.reportedAllegation,
    allegation: item.allegation,
    queueReason: item.queueReason,
    statement: item.statement,
    shortSummary: item.shortSummary,
    caseBriefing: item.caseBriefing,
    briefingDetails: item.briefingDetails,
    keyFacts: item.keyFacts,
    intake: item.intake,
    intakeAnswers: item.intakeAnswers,
    productsAccounts: item.productsAccounts,
    availableTools: item.availableTools,
    requiredTools: item.requiredTools,
    timelineLabels: timelineLabels(item),
    actionLog: item.actionLog,
    publicHelpers: {
      taxonomy: publicCaseTaxonomy(item),
      alertReason: publicAlertReason(item),
      allegation: publicReportedAllegation(item),
      summary: publicCaseSummary(item),
      facts: publicCaseFacts(item),
      searchText: publicCaseSearchText(item),
    },
  };
}

const postSubmissionPatterns = new Set();
let generatedCount = 0;

for (const [claimIndex, claimType] of coreClaimTypes.entries()) {
  assert.doesNotMatch(
    JSON.stringify({
      id: claimType.id,
      label: claimType.label,
      shortLabel: claimType.shortLabel,
      lane: claimType.lane,
      availableTools: claimType.availableTools,
      requiredTools: claimType.requiredTools,
    }),
    forbiddenPublicAnswer,
    `${claimType.id} exposes a hidden answer as an initial type or tool`,
  );

  for (const [scenarioIndex, scenario] of claimType.scenarios.entries()) {
    assert.doesNotMatch(
      JSON.stringify(scenario),
      forbiddenPublicAnswer,
      `${claimType.id}/${scenario.id} exposes hidden truth in its public scenario`,
    );
    assert.doesNotMatch(publicScenarioLabel(scenario), forbiddenPublicAnswer);

    const item = createGeneratedCase({
      index: 950000 + (claimIndex * 100) + scenarioIndex,
      ...compatibleDomain(claimType, scenario),
      scenarioId: scenario.id,
      difficulty: 'deep',
      evidenceDepth: 'deep',
    });
    generatedCount += 1;

    assert.equal(Object.hasOwn(item, 'caseTruth'), false);
    assert.equal(Object.hasOwn(item, 'correctDetermination'), false);
    assert.deepEqual(item.suspectedPatterns, []);
    assert.equal(item.operationalDecision, null);
    assert.equal(item.finalFinding, null);
    assert.equal(item.findingBasis, '');
    assert.equal(getGeneratedCaseTruth(item, { submitted: false }), undefined);
    assert.doesNotMatch(
      JSON.stringify(publicSurface(item)),
      forbiddenPublicAnswer,
      `${item.id} exposes hidden truth on a pre-submission queue, briefing, intake, tool, or timeline-label surface`,
    );

    const submittedTruth = getGeneratedCaseTruth(item, { submitted: true });
    assert.ok(submittedTruth?.operationalDecision, `${item.id} is missing its post-submission operational decision truth`);
    assert.ok(submittedTruth?.finalFinding, `${item.id} is missing its post-submission final finding truth`);
    for (const pattern of submittedTruth.suspectedPatterns ?? []) postSubmissionPatterns.add(pattern);
  }
}

assert.equal(generatedCount, coreClaimTypes.reduce((total, claimType) => total + claimType.scenarios.length, 0));
for (const pattern of [
  SUSPECTED_PATTERNS.SYNTHETIC_IDENTITY,
  SUSPECTED_PATTERNS.BUST_OUT,
  SUSPECTED_PATTERNS.FIRST_PARTY_FRAUD,
  SUSPECTED_PATTERNS.MULE_ACTIVITY,
  SUSPECTED_PATTERNS.EMAIL_COMPROMISE_BEC,
]) {
  assert.ok(postSubmissionPatterns.has(pattern), `${pattern} must exist only as a post-submission pattern/finding theory`);
}

console.log(`Public case leak smoke check passed: ${generatedCount} scenario packets keep hidden findings out of pre-submission surfaces.`);
