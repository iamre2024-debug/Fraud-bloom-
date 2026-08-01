import { coreClaimTypes } from '../src/data/claimRegistry.js';
import { createGeneratedCase, getGeneratedCaseTruth } from '../src/data/generatedCases.js';

const failures = [];
const allAutoCases = [];

for (const [claimIndex, claimType] of coreClaimTypes.entries()) {
  const start = 2_000_000 + (claimIndex * 10_000);
  const generated = Array.from({ length: claimType.scenarios.length }, (_, offset) => createGeneratedCase({
    index: start + offset,
    claimTypeId: claimType.id,
    scenarioId: 'auto',
    difficulty: 'standard',
    evidenceDepth: 'standard',
  }));
  allAutoCases.push(...generated);

  const scenarioIds = new Set(generated.map((item) => item.scenarioId));
  if (scenarioIds.size !== claimType.scenarios.length) {
    failures.push(`${claimType.label} auto mix returned ${scenarioIds.size} of ${claimType.scenarios.length} scenarios.`);
  }
}

const repeatedCasesPerClaim = 8;
const repeatedClaimCases = [];

for (const [claimIndex, claimType] of coreClaimTypes.entries()) {
  const scenario = claimType.scenarios[0];
  const generated = Array.from({ length: repeatedCasesPerClaim }, (_, offset) => createGeneratedCase({
    index: 3_000_000 + (claimIndex * 10_000) + offset,
    claimTypeId: claimType.id,
    scenarioId: scenario.id,
    difficulty: 'deep',
    evidenceDepth: 'deep',
  }));
  repeatedClaimCases.push(...generated);

  const storyFingerprints = new Set(generated.map((item) => [
    item.scenarioVariantId,
    item.amount,
    item.transactionInfo,
    item.intake.channel,
    item.documents.map((document) => `${document.name}:${document.status}`).join('|'),
  ].join('::')));
  const amountValues = new Set(generated.map((item) => item.amount));
  const hasMonetaryAmount = generated.some((item) => Number.parseFloat(String(item.amount).replace(/[$,]/g, '')) > 0);
  const intakeRoutes = new Set(generated.map((item) => item.intake.channel));
  const documentPatterns = new Set(generated.map((item) => item.documents.map((document) => document.status).join('|')));

  if (storyFingerprints.size !== generated.length) failures.push(`${claimType.label} produced duplicate repeated-case story fingerprints.`);
  if (hasMonetaryAmount && amountValues.size < 6) failures.push(`${claimType.label} produced only ${amountValues.size} repeated-case amount variants.`);
  const fixedPayrollIntake = ['payroll-change-alert', 'payroll-account-takeover'].includes(claimType.workflowType);
  if (!fixedPayrollIntake && intakeRoutes.size < 4) failures.push(`${claimType.label} produced only ${intakeRoutes.size} repeated-case intake routes.`);
  if (claimType.workflowType === 'payroll-change-alert') {
    if ([...intakeRoutes].some((route) => route !== 'Platform payroll alert')) {
      failures.push('Payroll Change Alert must begin from the platform payroll alert, not an inferred request route.');
    }
    if (generated.some((item) => !/does not know how the change was requested at intake/i.test(item.reportedAllegation))) {
      failures.push('Payroll Change Alert must keep the request method unknown at intake.');
    }
  }
  if (claimType.workflowType === 'payroll-account-takeover'
    && [...intakeRoutes].some((route) => route !== 'Platform payroll access alert')) {
    failures.push('Payroll Account Takeover must begin from the separate platform access alert.');
  }
  if (documentPatterns.size < 3) failures.push(`${claimType.label} produced only ${documentPatterns.size} repeated-case document patterns.`);
}

if (repeatedClaimCases.some((item) => item.generatedPacketVersion !== 9 || !item.scenarioVariantId || !item.scenarioVariant)) {
  failures.push('Repeated generated cases are missing version 9 scenario-variation metadata.');
}

const determinations = new Set(allAutoCases
  .map((item) => getGeneratedCaseTruth(item, { submitted: true })?.operationalDecision)
  .filter(Boolean));
if (determinations.size < 10) failures.push(`Auto mix produced only ${determinations.size} hidden determination paths across the full catalog.`);

for (const item of allAutoCases) {
  const preDecisionText = [
    item.shortSummary,
    item.queueReason,
    item.statement?.value,
    ...(item.events ?? []).map((event) => `${event.label} ${event.detail}`),
  ].join(' ');
  if (Object.prototype.hasOwnProperty.call(item, 'caseTruth')
    || Object.prototype.hasOwnProperty.call(item, 'correctDetermination')) {
    failures.push(`${item.scenarioId} exposes hidden truth fields on the public case object.`);
    break;
  }
  const hiddenTruth = getGeneratedCaseTruth(item, { submitted: true })?.classification;
  if (hiddenTruth && preDecisionText.includes(hiddenTruth)) {
    failures.push(`${item.scenarioId} exposed its hidden truth in pre-decision case copy.`);
    break;
  }
}

if (failures.length) {
  console.error('Generated scenario diversity smoke check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Generated scenario diversity smoke check passed for ${allAutoCases.length} catalog scenarios and ${repeatedClaimCases.length} repeated cases across ${coreClaimTypes.length} claim types.`);
