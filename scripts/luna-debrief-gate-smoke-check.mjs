import { createGeneratedCase } from '../src/data/generatedCases.js';
import {
  buildReviewPackage,
  getFinalFindingChoices,
  getReviewChoices,
  getReviewPackageStatus,
} from '../src/data/reviewPackage.js';
import { buildLunaDebrief } from '../src/data/lunaDebrief.js';

const activeCase = createGeneratedCase({
  index: 20260729017,
  claimTypeId: 'fraud-chargeback',
  difficulty: 'standard',
  evidenceDepth: 'expanded',
});
const operationalDecision = getReviewChoices(activeCase)[0];
const finalFinding = getFinalFindingChoices(activeCase)[0];
const draft = {
  operationalDecision,
  finalFinding,
  confidence: 'Medium',
  findingBasis: 'Transaction record TXN-TRAIN-100 and the dated customer statement support this operational decision while documenting unresolved evidence.',
  indicators: {},
};
const completedTools = ['Case Briefing', 'Transaction History', 'Document Viewer'];
const tray = [{
  id: 'TXN-TRAIN-100',
  label: 'Transaction record TXN-TRAIN-100',
  tool: 'Transaction History',
  detail: 'Dated fictional transaction evidence',
}];
const notes = [{
  id: 'NOTE-1',
  time: 'Jul 29, 2026 · 10:00 AM',
  source: 'Transaction History',
  recordId: 'TXN-TRAIN-100',
  text: 'TXN-TRAIN-100 supports the recorded amount and occurred after the earlier customer contact.',
}];
const packageStatus = getReviewPackageStatus({
  activeCase,
  completedTools,
  tray,
  notes,
  draft,
});

if (!packageStatus.ready) {
  throw new Error(`Valid learner package did not become ready: ${packageStatus.blockers.join('; ')}`);
}
if (buildLunaDebrief({
  activeCase,
  reviewPackage: null,
  completedTools,
  tray,
  notes,
}) !== null) {
  throw new Error('Luna returned a debrief before any package was submitted.');
}
if (buildLunaDebrief({
  activeCase,
  reviewPackage: {},
  completedTools,
  tray,
  notes,
}) !== null) {
  throw new Error('Luna accepted an invalid package and exposed post-submission coaching.');
}
if (buildLunaDebrief({
  activeCase,
  reviewPackage: {
    id: `${activeCase.id}-TAMPERED`,
    caseId: activeCase.id,
    packageSchemaVersion: 2,
    savedAtIso: new Date().toISOString(),
    operationalDecision,
    finalFinding,
    findingBasis: '',
  },
  completedTools,
  tray,
  notes,
}) !== null) {
  throw new Error('Luna accepted a stored package without a valid evidence-based rationale.');
}
if (buildLunaDebrief({
  activeCase,
  reviewPackage: {
    id: `${activeCase.id}-LEGACY-TAMPERED`,
    caseId: activeCase.id,
    savedAt: 'Jul 29, 2026, 10:00 AM',
    choice: 'banana',
  },
  completedTools,
  tray,
  notes,
}) !== null) {
  throw new Error('Luna accepted an invalid legacy choice and exposed post-submission coaching.');
}

const legacyPackage = {
  id: `${activeCase.id}-LEGACY-HISTORY`,
  caseId: activeCase.id,
  savedAt: 'Jul 29, 2026, 10:00 AM',
  choice: operationalDecision,
  reason: 'Legacy learner rationale remains readable.',
};
const legacyDebrief = buildLunaDebrief({
  activeCase,
  reviewPackage: legacyPackage,
  completedTools,
  tray,
  notes,
});

if (!legacyDebrief) throw new Error('A valid legacy package was not kept readable.');
if (!legacyDebrief.legacyHistory) throw new Error('A legacy package was not labeled as historical.');
if (legacyDebrief.truthReveal !== null) {
  throw new Error('A legacy package exposed hidden scenario truth.');
}
if (legacyDebrief.determinationMatched !== null) {
  throw new Error('A legacy package was graded against the current determination contract.');
}

const reviewPackage = buildReviewPackage({
  caseId: activeCase.id,
  agentId: 'SKY-TEST',
  activeCase,
  draft,
  completedTools,
  tray,
  notes,
  packageStatus,
});
const debrief = buildLunaDebrief({
  activeCase,
  reviewPackage,
  completedTools,
  tray,
  notes,
});

if (!debrief) throw new Error('Luna did not open after a valid frozen learner package.');
if (!debrief.truthReveal) throw new Error('Generated scenario truth was not resolved after submission.');
if (debrief.notesQuality.totalNotes !== 1) throw new Error('Structured note snapshots were not scored.');
if (JSON.stringify(debrief).includes('[object Object]')) {
  throw new Error('Structured evidence or notes were flattened incorrectly in the Luna debrief.');
}

console.log('Luna debrief gate smoke check passed: invalid and absent packages stay locked, legacy history stays readable without truth grading, and valid versioned packages unlock truth.');
