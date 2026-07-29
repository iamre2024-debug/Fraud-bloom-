import fs from 'node:fs';
import path from 'node:path';
import { buildLunaDebrief } from '../src/data/lunaDebrief.js';
import { createGeneratedCase, getGeneratedCaseTruth } from '../src/data/generatedCases.js';
import { requestLunaApiCoaching } from '../src/data/lunaApi.js';

const rootDir = process.cwd();
const app = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8');
const workspaceState = fs.readFileSync(path.join(rootDir, 'src/app/useWorkspaceState.js'), 'utf8');
const reviewWorkflow = fs.readFileSync(path.join(rootDir, 'src/screens/ReviewWorkflow.jsx'), 'utf8');
const lunaApiClient = fs.readFileSync(path.join(rootDir, 'src/data/lunaApi.js'), 'utf8');
const lunaApi = fs.readFileSync(path.join(rootDir, 'api/luna-debrief.js'), 'utf8');
const failures = [];

function mustContain(fileLabel, content, text) {
  if (!content.includes(text)) failures.push(`${fileLabel} is missing required Luna anchor: ${text}`);
}

function mustNotContain(fileLabel, content, text) {
  if (content.includes(text)) failures.push(`${fileLabel} still contains duplicate or legacy Luna text: ${text}`);
}

mustNotContain('App.jsx', app, 'LunaPostSubmissionPanel');
mustNotContain('ReviewWorkflow.jsx', reviewWorkflow, 'ornate-card');
mustContain('useWorkspaceState.js', workspaceState, "markReviewed('Submit Decision')");
mustContain('useWorkspaceState.js', workspaceState, 'buildReviewPackage');

for (const anchor of [
  'export function LunaDebrief',
  'sky-luna-debrief',
  'Submit before the debrief',
  'Luna does not reveal the expected outcome',
  'Scenario outcome',
  'legacyHistory',
  'truthReveal',
  'Open case report',
]) {
  mustContain('ReviewWorkflow.jsx', reviewWorkflow, anchor);
}

for (const anchor of [
  'fraud manager conducting a post-decision case review',
  'Do Not Support Customer Claim means the available evidence does not support the customer claim',
  'Explain the operational decision and final finding separately',
  'Separate the quality of the investigator decision at the time from what became known later',
  'RATE_LIMIT_MAX_REQUESTS',
  'MAX_BODY_BYTES',
  'LUNA_API_ACCESS_TOKEN',
  'hasValidAccessToken',
  'Luna private access is required',
  'Origin not allowed',
  "'Cache-Control', 'no-store'",
  'managerVerdict',
  'actualCaseOutcome',
  'managerExplanation',
]) {
  mustContain('api/luna-debrief.js', lunaApi, anchor);
}

for (const anchor of [
  'window.sessionStorage',
  'X-Luna-Access-Token',
  'readLunaApiAccessToken',
  'customerType:',
  'productType:',
  'workflowType:',
  'alertReason:',
  'operationalDecision:',
  'finalFinding:',
  'findingBasis:',
  'expectedFinalFinding:',
]) {
  mustContain('src/data/lunaApi.js', lunaApiClient, anchor);
}

mustNotContain('ReviewWorkflow.jsx', reviewWorkflow, 'luna-v1-score-banner');

const generatedCase = createGeneratedCase({
  index: 71001,
  customerType: 'personal',
  productType: 'credit-card',
  workflowType: 'unauthorized-card-transaction-claim',
  scenarioId: 'auto',
  difficulty: 'light',
  evidenceDepth: 'light',
});
const preSubmissionTruth = getGeneratedCaseTruth(generatedCase);
if (preSubmissionTruth !== undefined) {
  failures.push('Generated scenario truth was available without the explicit submitted:true post-submission guard.');
}
if (Object.prototype.hasOwnProperty.call(generatedCase, 'caseTruth')) {
  failures.push('Generated public case object exposes caseTruth before submission.');
}
if (buildLunaDebrief({ activeCase: generatedCase, reviewPackage: null }) !== null) {
  failures.push('Luna produced a deterministic debrief without a saved review package.');
}

const hiddenTruth = getGeneratedCaseTruth(generatedCase, { submitted: true });
if (!hiddenTruth?.operationalDecision || !hiddenTruth?.finalFinding) {
  failures.push('Post-submission generated truth is missing the expected operational decision or final finding.');
} else {
  const savedReviewPackage = {
    id: `${generatedCase.id}-SMOKE-PACKAGE`,
    caseId: generatedCase.id,
    packageSchemaVersion: 2,
    packageVersion: 1,
    savedAtIso: '2026-07-29T12:00:00.000Z',
    customerType: generatedCase.customerType,
    productType: generatedCase.productType,
    workflowType: generatedCase.workflowType,
    operationalDecision: hiddenTruth.operationalDecision,
    finalFinding: hiddenTruth.finalFinding,
    findingBasis: 'Transaction TXN-LUNA-SMOKE-001 supports the learner finding after the reviewed evidence and timeline were compared.',
    confidence: 'High',
    completedTools: [],
    pinnedEvidence: [],
    noteSnapshot: [],
    decisionIndicators: [],
  };
  const debrief = buildLunaDebrief({
    activeCase: generatedCase,
    reviewPackage: savedReviewPackage,
  });
  const debriefAfterLiveMutation = buildLunaDebrief({
    activeCase: generatedCase,
    reviewPackage: savedReviewPackage,
    completedTools: ['Case Summary', 'Device Intelligence'],
    tray: ['Device ID DEV-LIVE-AFTER-SUBMISSION'],
    notes: ['Live note added after the saved package was submitted.'],
  });
  if (JSON.stringify(debriefAfterLiveMutation) !== JSON.stringify(debrief)) {
    failures.push('Luna changed an explicit zero-pin or zero-note package after live case state mutated.');
  }
  if (!debrief?.truthReveal || debrief.truthReveal.finalFinding !== hiddenTruth.finalFinding) {
    failures.push('Luna did not reveal hidden final-finding truth after a saved review package was supplied.');
  }
  if (debrief?.determinationMatched !== true) {
    failures.push('Luna did not grade the operational decision and final finding independently and combine their match.');
  }

  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const apiRequests = [];
  globalThis.window = {
    sessionStorage: {
      getItem(key) {
        return key === 'fraud-academy-luna-api-access-v1' ? 'training-access-token' : null;
      },
    },
  };
  globalThis.fetch = async (_url, request = {}) => {
    apiRequests.push(JSON.parse(request.body));
    return {
      ok: true,
      async json() {
        return {
          managerVerdict: 'Saved package reviewed.',
          decisionMeaning: 'Operational decision and final finding reviewed separately.',
          actualCaseOutcome: 'Post-submission outcome supplied.',
          managerExplanation: 'Evidence-based coaching supplied.',
          strengths: [],
          coachingActions: [],
        };
      },
    };
  };

  const blockedApiResult = await requestLunaApiCoaching({
    activeCase: generatedCase,
    reviewPackage: null,
    deterministicDebrief: null,
  });
  const blockedWithoutTruthResult = await requestLunaApiCoaching({
    activeCase: generatedCase,
    reviewPackage: savedReviewPackage,
    deterministicDebrief: null,
  });
  if (blockedApiResult !== null || blockedWithoutTruthResult !== null || apiRequests.length !== 0) {
    failures.push('Luna API coaching made a request before a saved review package and deterministic debrief were available.');
  }

  await requestLunaApiCoaching({
    activeCase: generatedCase,
    reviewPackage: savedReviewPackage,
    deterministicDebrief: debrief,
  });
  if (apiRequests.length !== 1) {
    failures.push(`Luna API coaching should make one post-submission request; found ${apiRequests.length}.`);
  } else {
    const [requestBody] = apiRequests;
    for (const [field, expected] of [
      ['customerType', generatedCase.customerType],
      ['productType', generatedCase.productType],
      ['workflowType', generatedCase.workflowType],
      ['alertReason', generatedCase.alertReason],
    ]) {
      if (requestBody[field] !== expected) {
        failures.push(`Luna API request is missing the submitted case ${field}.`);
      }
    }
    if (requestBody.operationalDecision !== savedReviewPackage.operationalDecision) {
      failures.push('Luna API request is missing the saved operational decision.');
    }
    if (requestBody.finalFinding !== savedReviewPackage.finalFinding) {
      failures.push('Luna API request is missing the saved final finding.');
    }
    if (requestBody.findingBasis !== savedReviewPackage.findingBasis) {
      failures.push('Luna API request is missing the saved evidence-based finding rationale.');
    }
    if (requestBody.deterministicResult?.expectedFinalFinding !== hiddenTruth.finalFinding) {
      failures.push('Luna API request did not include hidden final-finding truth after submission.');
    }
    if (requestBody.deterministicResult?.expectedOperationalDecision !== hiddenTruth.operationalDecision) {
      failures.push('Luna API request did not include hidden operational-decision truth after submission.');
    }
    if (JSON.stringify(requestBody.deterministicResult?.suspectedPatterns ?? []) !== JSON.stringify(hiddenTruth.suspectedPatterns ?? [])) {
      failures.push('Luna API request did not include hidden suspected-pattern truth after submission.');
    }
    if (requestBody.deterministicResult?.truthFindingBasis !== hiddenTruth.findingBasis) {
      failures.push('Luna API request did not include the post-submission hidden finding basis.');
    }
  }

  globalThis.window = originalWindow;
  globalThis.fetch = originalFetch;
}

if (failures.length) {
  console.error('Luna fraud-manager smoke check failed. Repair these anchors before shipping:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Luna reference-debrief smoke check passed. Luna remains post-submission only, preserves deterministic truth, compares the two submitted fields independently, and presents case-scoped strengths, missed evidence, risk guidance, and motivation.');
