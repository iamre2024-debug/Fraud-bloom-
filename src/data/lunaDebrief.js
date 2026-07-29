import { getGeneratedCaseTruth } from './generatedCases.js';
import {
  isValidReviewPackage,
  normalizeReviewPackage,
} from './reviewPackage.js';

const debriefGuides = {
  'FA-ATO-24018': {
    theme: 'Account access and purchase timeline',
    coachIntro: 'Luna is reviewing the saved package against the access story, transaction sequence, customer statement, and evidence trail.',
    riskTip: 'For an account-access claim, compare the customer’s story with the full login, session, device, IP, profile-change, and transaction sequence before relying on any single signal.',
    focusAreas: [
      {
        label: 'Customer statement and disputed purchase timeline',
        keywords: ['customer', 'statement', 'purchase', 'transaction', 'card', 'EVT-1014', '742'],
        tool: 'Case Briefing',
        detail: 'Connect the reported story to the exact transaction time and amount.',
      },
      {
        label: 'Login, session, device, and IP comparison',
        keywords: ['login', 'session', 'device', 'ip', 'Face ID', 'SES-7781', 'LOG-1008'],
        tool: 'Login History',
        detail: 'Compare the successful access event with the linked session, device, and IP records.',
      },
      {
        label: 'Profile and card-control activity',
        keywords: ['profile', 'card controls', 'PCH-1002', 'balance', 'card details'],
        tool: 'Customer 360',
        detail: 'Place profile changes and card-control activity into the same timeline as the disputed purchase.',
      },
      {
        label: 'Evidence request handling',
        keywords: ['affidavit', 'document', 'evidence', 'DOC-442', 'requested'],
        tool: 'Document Viewer',
        detail: 'Document whether requested support was received, unavailable, or still pending.',
      },
    ],
  },
  'FA-CB-24007': {
    theme: 'Recurring billing and cancellation evidence',
    coachIntro: 'Luna is reviewing the saved package against the billing sequence, merchant context, customer submission, and document trail.',
    riskTip: 'For a recurring-billing dispute, separate proof of cancellation from proof of a refund. Compare the cancellation date, policy, merchant response, and each billing cycle.',
    focusAreas: [
      {
        label: 'Customer dispute form and cancellation story',
        keywords: ['customer', 'dispute form', 'cancellation', 'DOC-510', 'DOC-511'],
        tool: 'Document Viewer',
        detail: 'Tie the customer’s cancellation story to the dated form or communication.',
      },
      {
        label: 'Recurring merchant transaction history',
        keywords: ['merchant', 'recurring', 'billing', 'subscription', 'TXN-2201', 'prior'],
        tool: 'Transaction History',
        detail: 'Compare the disputed charge with the prior recurring billing pattern.',
      },
      {
        label: 'Session and statement-review activity',
        keywords: ['session', 'statement', 'mobile app', 'SES-4412', 'LOG-2204'],
        tool: 'Session History',
        detail: 'Check whether the account activity adds useful timing context without treating it as the answer by itself.',
      },
      {
        label: 'Requested support document status',
        keywords: ['requested', 'document', 'cancellation confirmation', 'evidence'],
        tool: 'Document Request',
        detail: 'Record whether the requested cancellation support arrived or remained unavailable.',
      },
    ],
  },
  'FA-CR-24003': {
    theme: 'Credit review package and payment verification',
    coachIntro: 'Luna is reviewing the saved package against the system alert, identity record, payment setup, and early account activity.',
    riskTip: 'Keep credit risk and fraud findings separate. A payment, utilization, income, or repayment concern can support a credit action without proving fraud.',
    focusAreas: [
      {
        label: 'System alert and credit usage request',
        keywords: ['system alert', 'credit', 'limit', 'usage', 'EVT-3308', 'DOC-620'],
        tool: 'Case Briefing',
        detail: 'Anchor the review to the exact request and the neutral reason the case entered the queue.',
      },
      {
        label: 'Identity and profile setup timeline',
        keywords: ['identity', 'profile', 'Training ID', 'PCH-3303', 'IDR-3301'],
        tool: 'Identity Intel / People Search',
        detail: 'Compare identity and profile records before drawing a finding from new-account timing.',
      },
      {
        label: 'Payment Verification objects',
        keywords: ['payment', 'Bank Code', 'Destination ID', 'verification', 'PV-24003'],
        tool: 'Payment Verification',
        detail: 'Document ownership, status, prior use, and verification attempts for the payment object.',
      },
      {
        label: 'Access/session support for the account activity',
        keywords: ['login', 'session', 'device', 'ip', 'LOG-3314', 'SES-9302'],
        tool: 'Login History',
        detail: 'Use access records as supporting context and connect them to the dated account activity.',
      },
    ],
  },
};

const workflowGuides = {
  'unauthorized-card-transaction-claim': {
    theme: 'Cardholder claim and authorization evidence',
    riskTip: 'Card possession, entry mode, wallet enrollment, authentication, merchant records, and the last accepted transaction are stronger when reviewed as one timeline.',
    focusAreas: [
      { label: 'Cardholder statement and possession timeline', keywords: ['customer', 'cardholder', 'statement', 'possession'], tool: 'Case Briefing', detail: 'Connect the reported possession story to the disputed activity window.' },
      { label: 'Authorization and transaction record', keywords: ['authorization', 'transaction', 'entry mode', 'wallet'], tool: 'Transaction History', detail: 'Compare the exact authorization details, instrument, amount, and status.' },
      { label: 'Merchant or fulfillment support', keywords: ['merchant', 'order', 'delivery', 'fulfillment'], tool: 'Merchant Intelligence', detail: 'Review the merchant-side records that are actually present in the packet.' },
      { label: 'Document status and evidence gaps', keywords: ['document', 'requested', 'received', 'evidence'], tool: 'Document Viewer', detail: 'State what was received, what is missing, and why the gap matters.' },
    ],
  },
  'merchant-non-fraud-dispute': {
    theme: 'Merchant dispute and lifecycle evidence',
    riskTip: 'For a non-fraud dispute, connect the purchase, cancellation or return, merchant response, policy, and credit lifecycle. An unsupported document does not automatically mean more documents are required.',
    focusAreas: [
      { label: 'Customer dispute story and requested outcome', keywords: ['customer', 'dispute', 'requested outcome'], tool: 'Case Briefing', detail: 'State what the customer says happened and what outcome was requested.' },
      { label: 'Merchant lifecycle and policy record', keywords: ['merchant', 'policy', 'cancellation', 'return', 'refund'], tool: 'Merchant Intelligence', detail: 'Compare the merchant response with the dated lifecycle and policy evidence.' },
      { label: 'Transaction and credit history', keywords: ['transaction', 'credit', 'billing', 'refund'], tool: 'Transaction History', detail: 'Check whether the disputed charge and any reversal or credit are actually recorded.' },
      { label: 'Supporting document review', keywords: ['document', 'receipt', 'confirmation', 'evidence'], tool: 'Document Viewer', detail: 'Explain what the received documents support or fail to support.' },
    ],
  },
  'personal-account-takeover': {
    theme: 'Personal account access and servicing sequence',
    riskTip: 'A new device or IP is context, not a conclusion. Connect authentication, session behavior, profile changes, payment setup, and the customer statement.',
    focusAreas: [
      { label: 'Customer statement and account activity', keywords: ['customer', 'statement', 'account', 'activity'], tool: 'Case Briefing', detail: 'Anchor the timeline to what the customer reported and the exact activity in scope.' },
      { label: 'Login, session, device, and IP records', keywords: ['login', 'session', 'device', 'ip'], tool: 'Login History', detail: 'Compare the linked access records instead of relying on one unfamiliar signal.' },
      { label: 'Profile and payment changes', keywords: ['profile', 'payment', 'destination', 'change'], tool: 'Customer 360', detail: 'Place profile and payment changes before or after the disputed activity.' },
      { label: 'Cross-account links', keywords: ['link', 'shared', 'relationship', 'account'], tool: 'Link Analysis', detail: 'Document verified shared identifiers and the status of linked accounts.' },
    ],
  },
  'business-account-takeover': {
    theme: 'Business access, authority, and payment sequence',
    riskTip: 'For a business account, compare authorized users, role permissions, trusted contacts, access history, instruction changes, and payment timing before deciding the case.',
    focusAreas: [
      { label: 'Business profile and authorized users', keywords: ['business', 'owner', 'authorized', 'user'], tool: 'Business 360', detail: 'Confirm which owner or user had authority for the activity in scope.' },
      { label: 'Login, session, device, and IP comparison', keywords: ['login', 'session', 'device', 'ip'], tool: 'Login History', detail: 'Connect the access sequence to the relevant business user.' },
      { label: 'Payment or destination changes', keywords: ['payment', 'destination', 'bank code', 'change'], tool: 'Payment Verification', detail: 'Review ownership, standing, prior use, and verification attempts.' },
      { label: 'Trusted-contact verification', keywords: ['callback', 'trusted', 'contact', 'verification'], tool: 'Business 360', detail: 'Record the factual callback result and the contact source used.' },
    ],
  },
  'business-payment-instruction-change-alert': {
    theme: 'Business instruction and beneficiary verification',
    riskTip: 'Verify payment-instruction changes through a trusted channel already on file. Compare sender, domain, callback, beneficiary ownership, prior use, and release timing.',
    focusAreas: [
      { label: 'Business and vendor relationship', keywords: ['business', 'vendor', 'relationship', 'owner'], tool: 'Business 360', detail: 'Confirm the factual relationship and the people authorized to make changes.' },
      { label: 'Instruction source and callback record', keywords: ['email', 'instruction', 'callback', 'contact'], tool: 'Document Viewer', detail: 'Compare the instruction source with a trusted callback or approved contact record.' },
      { label: 'Beneficiary ownership and prior use', keywords: ['beneficiary', 'ownership', 'destination', 'prior use'], tool: 'Payment Verification', detail: 'Document ownership, standing, and whether the destination was used before.' },
      { label: 'Payment timeline', keywords: ['payment', 'timeline', 'release', 'hold'], tool: 'Timeline', detail: 'Place the change request, verification steps, and payment action in order.' },
    ],
  },
  'payroll-change-alert': {
    theme: 'Payroll authorization and destination history',
    riskTip: 'For a payroll change, compare the immutable employee profile, prior pay periods, old and new destinations, trusted callback, ownership, and the next payroll cutoff.',
    focusAreas: [
      { label: 'Business payroll relationship', keywords: ['business', 'payroll', 'company', 'relationship'], tool: 'Business 360', detail: 'Confirm the company and payroll product attached to the active case.' },
      { label: 'Employee profile and authorization', keywords: ['employee', 'profile', 'authorization', 'callback'], tool: 'Employee Profile', detail: 'Connect the change request to the employee’s established contact and authorization record.' },
      { label: 'Historical payroll destination', keywords: ['payroll', 'history', 'old destination', 'prior destination'], tool: 'Payroll History', detail: 'Compare prior completed pay periods with the proposed destination.' },
      { label: 'New destination verification', keywords: ['bank code', 'destination id', 'ownership', 'verification'], tool: 'Payment Verification', detail: 'Review ownership, standing, prior use, and verification attempts for the new destination.' },
    ],
  },
  'payroll-account-takeover': {
    theme: 'Payroll access and change-control evidence',
    riskTip: 'Separate the user’s access trail from the payroll instruction itself. Review role permissions, session activity, employee authorization, destination history, and callback evidence.',
    focusAreas: [
      { label: 'Payroll user and role authority', keywords: ['business', 'payroll', 'role', 'authorized'], tool: 'Business 360', detail: 'Confirm which user role could make the change.' },
      { label: 'Access and session sequence', keywords: ['login', 'session', 'device', 'ip'], tool: 'Login History', detail: 'Connect the relevant user to the dated access sequence.' },
      { label: 'Employee and payroll history', keywords: ['employee', 'payroll', 'history', 'pay period'], tool: 'Payroll History', detail: 'Compare the requested change with immutable prior pay periods.' },
      { label: 'Destination ownership and verification', keywords: ['destination', 'ownership', 'verification', 'bank code'], tool: 'Payment Verification', detail: 'Document the exact destination result and verification attempts.' },
    ],
  },
  'credit-application-review': {
    theme: 'Application verification and factual decision basis',
    riskTip: 'An application denial needs a factual reason. Keep missing verification, credit concerns, and a fraud finding separate, and document which record supports each conclusion.',
    focusAreas: [
      { label: 'Applicant or business profile', keywords: ['applicant', 'business', 'owner', 'profile'], tool: 'Customer 360', detail: 'Confirm the submitted identity or business information and connected owners.' },
      { label: 'Income, revenue, or cash-flow support', keywords: ['income', 'revenue', 'cash flow', 'deposit'], tool: 'Financial Investigation', detail: 'Compare stated amounts with the dated supporting records.' },
      { label: 'Payment account verification', keywords: ['payment', 'ownership', 'bank code', 'destination'], tool: 'Payment Verification', detail: 'Document ownership, status, and verification history for the payment account.' },
      { label: 'Application documents', keywords: ['document', 'application', 'statement', 'paystub', 'tax'], tool: 'Document Viewer', detail: 'State what each document supports and what remains unverified.' },
    ],
  },
  'credit-risk-review': {
    theme: 'Credit exposure and repayment evidence',
    riskTip: 'Credit stress is not automatically fraud. Compare payment performance, utilization, cash flow, income or revenue support, and account history before choosing a credit action.',
    focusAreas: [
      { label: 'Account and exposure review', keywords: ['account', 'exposure', 'balance', 'utilization'], tool: 'Financial Investigation', detail: 'Document the current exposure and the historical comparison used.' },
      { label: 'Payment performance and cash flow', keywords: ['payment', 'deposit', 'cash flow', 'nsf', 'late'], tool: 'Financial Investigation', detail: 'Compare dated payment and cash-flow records without turning a credit signal into a fraud finding.' },
      { label: 'Identity, owner, or business support', keywords: ['identity', 'owner', 'business', 'training id'], tool: 'Identity Intel / People Search', detail: 'Confirm the relevant person or business record for the review.' },
      { label: 'Supporting documents and gaps', keywords: ['document', 'statement', 'income', 'revenue'], tool: 'Document Viewer', detail: 'Explain which documents support the decision and which gaps remain material.' },
    ],
  },
};

const defaultGuide = {
  theme: 'Case documentation quality',
  coachIntro: 'Luna is reviewing the saved package against the documented evidence trail.',
  riskTip: 'The strongest decisions connect an exact record, a dated sequence, and a clear explanation of what the evidence supports, contradicts, or leaves unresolved.',
  focusAreas: [
    { label: 'Case reason', keywords: ['case', 'reason', 'allegation', 'system'], tool: 'Case Briefing', detail: 'Anchor the investigation to the neutral reason the case was opened.' },
    { label: 'Customer or business records', keywords: ['customer', 'business', 'identity', 'training id'], tool: 'Customer 360', detail: 'Confirm the relevant relationship and identity records.' },
    { label: 'Evidence inventory', keywords: ['evidence', 'document', 'record'], tool: 'Document Viewer', detail: 'State which records were reviewed and which material evidence is unavailable.' },
    { label: 'Timeline and link analysis', keywords: ['timeline', 'link', 'session', 'transaction'], tool: 'Timeline', detail: 'Connect important records in time and across verified relationships.' },
  ],
};

const workflowGuideAliases = {
  'card-account-takeover': 'personal-account-takeover',
  'ach-transaction-claim': 'unauthorized-card-transaction-claim',
  'wire-transaction-claim': 'unauthorized-card-transaction-claim',
  'ach-transaction-review': 'business-payment-instruction-change-alert',
  'wire-transaction-review': 'business-payment-instruction-change-alert',
};

function guideForCase(activeCase = {}) {
  return debriefGuides[activeCase.id]
    ?? workflowGuides[activeCase.workflowType]
    ?? workflowGuides[workflowGuideAliases[activeCase.workflowType]]
    ?? defaultGuide;
}

function noteText(note = '') {
  if (typeof note === 'string') return note;
  if (!note || typeof note !== 'object' || Array.isArray(note)) return String(note ?? '');
  return [
    note.time,
    note.source ?? note.sourceTool ?? note.tool,
    note.recordId ?? note.sourceRecordId,
    note.text ?? note.note ?? note.body ?? note.detail,
  ].filter(Boolean).join(' · ');
}

function evidenceText(item = '') {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return String(item ?? '');
  return [
    item.id ?? item.recordId ?? item.sourceRecordId,
    item.label ?? item.title ?? item.name,
    item.tool ?? item.sourceTool,
    item.value,
    item.detail ?? item.summary,
  ].filter(Boolean).join(' · ');
}

export function buildLunaDebrief({ activeCase, reviewPackage, completedTools = [], tray = [], notes = [] }) {
  if (!reviewPackage || !isValidReviewPackage(activeCase, reviewPackage)) return null;

  const normalizedPackage = normalizeReviewPackage(reviewPackage, activeCase);
  const legacyHistory = Boolean(normalizedPackage.legacyDecisionFormat);
  const guide = guideForCase(activeCase);
  const packageTools = Array.isArray(normalizedPackage.completedTools)
    ? normalizedPackage.completedTools
    : completedTools;
  const pinnedEvidence = Array.isArray(normalizedPackage.pinnedEvidence)
    ? normalizedPackage.pinnedEvidence
    : tray;
  const noteSnapshot = Array.isArray(normalizedPackage.noteSnapshot)
    ? normalizedPackage.noteSnapshot
    : notes;
  const normalizedNotes = noteSnapshot.map(noteText);
  const rationale = normalizedPackage.findingBasis ?? '';
  const decisionIndicators = normalizedPackage.decisionIndicators ?? [];
  const provenDecisionIndicators = decisionIndicators.filter((item) => item.proof && item.explanation);
  // Hidden truth is resolved only after the review-package guard above succeeds.
  // Legacy packages stay readable, but their older decision shape cannot be graded
  // against the current scenario-outcome contract.
  const caseTruth = legacyHistory ? null : resolvePostSubmissionTruth(activeCase);
  const expectedOperationalDecision = caseTruth?.operationalDecision
    ?? caseTruth?.correctDetermination
    ?? null;
  const acceptedOperationalDecisions = caseTruth?.acceptedDeterminations?.length
    ? caseTruth.acceptedDeterminations
    : expectedOperationalDecision ? [expectedOperationalDecision] : [];
  const expectedFinalFinding = caseTruth?.finalFinding ?? null;
  const operationalDecisionMatched = caseTruth && expectedOperationalDecision
    ? acceptedOperationalDecisions.includes(normalizedPackage.operationalDecision)
    : null;
  const finalFindingMatched = caseTruth && expectedFinalFinding && normalizedPackage.finalFinding
    ? normalizedPackage.finalFinding === expectedFinalFinding
    : null;
  const determinationMatched = aggregateMatch({
    caseTruth,
    expectedOperationalDecision,
    expectedFinalFinding,
    operationalDecisionMatched,
    finalFindingMatched,
    submittedFinalFinding: normalizedPackage.finalFinding,
  });

  const haystack = [
    activeCase.type,
    activeCase.alertReason,
    activeCase.reportedAllegation,
    activeCase.allegation,
    ...packageTools,
    ...pinnedEvidence.map(evidenceText),
    ...normalizedNotes,
    ...decisionIndicators.flatMap((item) => [item.proof, item.explanation]),
    rationale,
  ].join(' ').toLowerCase();

  const coveredRequired = reviewPackage.reviewedRequired ?? packageTools.length;
  const totalRequired = reviewPackage.totalRequired ?? Math.max(coveredRequired, 1);
  const notesQuality = scoreNotesQuality(normalizedNotes);
  const focusCoverage = guide.focusAreas.map((area) => ({
    ...area,
    covered: area.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())),
  }));
  const missedEvidence = focusCoverage
    .filter((area) => !area.covered)
    .map((area) => ({
      title: area.label,
      detail: area.detail ?? `This ${area.tool ?? 'evidence'} focus was not clearly connected in the submitted package.`,
      tool: area.tool ?? 'Investigation Tools',
    }));

  const toolScore = Math.round((coveredRequired / totalRequired) * 24);
  const pinScore = Math.min(12, pinnedEvidence.length * 3);
  const noteScore = notesQuality.points;
  const focusScore = Math.round((focusCoverage.filter((area) => area.covered).length / focusCoverage.length) * 14);
  const confidenceScore = normalizedPackage.confidence === 'High' ? 4 : normalizedPackage.confidence === 'Medium' ? 3 : 2;
  const indicatorScore = Math.min(10, provenDecisionIndicators.length * 3);
  const operationalDecisionScore = caseTruth && expectedOperationalDecision
    ? operationalDecisionMatched === true ? 10 : operationalDecisionMatched === false ? 0 : 5
    : 5;
  const finalFindingScore = caseTruth && expectedFinalFinding
    ? finalFindingMatched === true ? 10 : finalFindingMatched === false ? 0 : 5
    : 5;
  const score = Math.min(
    100,
    toolScore
      + pinScore
      + noteScore
      + focusScore
      + confidenceScore
      + indicatorScore
      + operationalDecisionScore
      + finalFindingScore,
  );
  const followUps = focusCoverage.filter((area) => !area.covered).map((area) => area.label);
  if (operationalDecisionMatched === false) {
    followUps.unshift(`Compare the submitted operational decision with the scenario outcome: ${expectedOperationalDecision}.`);
  }
  if (finalFindingMatched === false) {
    followUps.unshift(`Compare the submitted final finding with what the investigation established: ${expectedFinalFinding}.`);
  }
  if (caseTruth && expectedFinalFinding && !normalizedPackage.finalFinding) {
    followUps.unshift('This legacy package did not record a separate final finding, so Luna will not grade the scenario outcome.');
  }
  if (legacyHistory) {
    followUps.unshift('This legacy package remains readable as history. Submit a current evidence-based package to unlock scenario-outcome coaching.');
  }
  if (notesQuality.points < 9) followUps.unshift(notesQuality.nextStep);

  return {
    legacyHistory,
    theme: guide.theme,
    coachIntro: guide.coachIntro,
    score,
    scoreLabel: score >= 86 ? 'Strong package' : score >= 70 ? 'Solid package' : score >= 54 ? 'Developing package' : 'Needs more support',
    strengths: buildStrengths({ coveredRequired, pinnedEvidence, notesQuality, rationale, focusCoverage, provenDecisionIndicators, determinationMatched }),
    followUps: followUps.length ? followUps : ['No required focus gaps detected in this saved package.'],
    missedEvidence,
    coveredEvidence: focusCoverage.filter((area) => area.covered).map((area) => area.label),
    riskTip: guide.riskTip ?? defaultGuide.riskTip,
    motivation: activeCase.customerType === 'business'
      ? 'Every business relationship you verify makes the next payment decision more defensible.'
      : 'Every detail you connect today helps prevent a weaker decision tomorrow.',
    notesQuality,
    determinationMatched,
    operationalDecisionMatched,
    finalFindingMatched,
    submittedOperationalDecision: normalizedPackage.operationalDecision,
    submittedFinalFinding: normalizedPackage.finalFinding,
    truthReveal: caseTruth ? {
      classification: caseTruth.classification,
      suspectedPatterns: [...(caseTruth.suspectedPatterns ?? [])],
      operationalDecision: expectedOperationalDecision,
      acceptedOperationalDecisions,
      finalFinding: expectedFinalFinding,
      findingBasis: caseTruth.findingBasis ?? caseTruth.rationale ?? caseTruth.classification ?? '',
      disclosure: caseTruth.disclosure ? { ...caseTruth.disclosure } : null,
      // Compatibility aliases for saved debriefs created before decisions and findings were split.
      correctDetermination: expectedOperationalDecision,
      acceptedDeterminations: acceptedOperationalDecisions,
      rationale: caseTruth.findingBasis ?? caseTruth.rationale ?? '',
    } : null,
    breakdown: [
      { label: 'Required tool coverage', value: `${coveredRequired}/${totalRequired}`, points: toolScore },
      { label: 'Pinned evidence support', value: `${pinnedEvidence.length} object(s)`, points: pinScore },
      { label: 'Quality of notes', value: notesQuality.summary, points: noteScore },
      { label: 'Case focus coverage', value: `${focusCoverage.filter((area) => area.covered).length}/${focusCoverage.length}`, points: focusScore },
      { label: 'Indicator documentation', value: `${provenDecisionIndicators.length} documented answer(s)`, points: indicatorScore },
      { label: 'Operational decision', value: matchLabel(operationalDecisionMatched, caseTruth), points: operationalDecisionScore },
      { label: 'Final finding', value: matchLabel(finalFindingMatched, caseTruth), points: finalFindingScore },
      { label: 'Confidence calibration', value: normalizedPackage.confidence, points: confidenceScore },
    ],
  };
}

function resolvePostSubmissionTruth(activeCase = {}) {
  const truth = getGeneratedCaseTruth(activeCase, { submitted: true });
  if (truth) return truth;
  return activeCase.caseTruth ?? null;
}

function aggregateMatch({
  caseTruth,
  expectedOperationalDecision,
  expectedFinalFinding,
  operationalDecisionMatched,
  finalFindingMatched,
  submittedFinalFinding,
}) {
  if (!caseTruth) return null;
  if (expectedOperationalDecision && operationalDecisionMatched === null) return null;
  if (expectedFinalFinding && !submittedFinalFinding) return null;
  if (operationalDecisionMatched === false || finalFindingMatched === false) return false;
  const gradedParts = [
    expectedOperationalDecision ? operationalDecisionMatched : null,
    expectedFinalFinding ? finalFindingMatched : null,
  ].filter((value) => value !== null);
  return gradedParts.length ? gradedParts.every(Boolean) : null;
}

function matchLabel(match, caseTruth) {
  if (!caseTruth) return 'Base-case calibration';
  if (match === true) return 'Matched';
  if (match === false) return 'Did not match';
  return 'Not graded';
}

export function scoreNotesQuality(notes = []) {
  const analyzedNotes = notes.map(analyzeNote);
  const substantiveNotes = analyzedNotes.filter((note) => note.substantive);
  const evidenceReferences = substantiveNotes.filter((note) => note.hasEvidenceReference).length;
  const reasonedNotes = substantiveNotes.filter((note) => note.hasReasoning).length;
  const comparisonNotes = substantiveNotes.filter((note) => note.hasComparison).length;
  const sourceTypes = new Set(substantiveNotes.map((note) => note.type.toLowerCase()).filter(Boolean));

  const substancePoints = Math.min(4, substantiveNotes.length * 2);
  const evidencePoints = Math.min(4, evidenceReferences * 2);
  const reasoningPoints = Math.min(4, reasonedNotes * 2);
  const comparisonPoints = Math.min(2, comparisonNotes * 2);
  const sourcePoints = Math.min(2, Math.max(0, sourceTypes.size - 1));
  const points = substancePoints + evidencePoints + reasoningPoints + comparisonPoints + sourcePoints;
  const label = points >= 13 ? 'Strong' : points >= 9 ? 'Supported' : points >= 5 ? 'Developing' : 'Needs evidence';

  let nextStep = 'Improve note quality by citing an exact record and explaining how it supports or contradicts the case theory.';
  if (!substantiveNotes.length) nextStep = 'Add a substantive investigation note; automatic tool-review entries do not count as evidence analysis.';
  else if (!evidenceReferences) nextStep = 'Add exact record IDs, amounts, or timestamps to the investigation notes.';
  else if (!reasonedNotes) nextStep = 'Explain what the cited evidence supports, contradicts, or leaves unresolved.';
  else if (!comparisonNotes) nextStep = 'Compare evidence across tools or place the cited records into timeline order.';

  return {
    points,
    maxPoints: 16,
    label,
    summary: `${label} - ${substantiveNotes.length}/${notes.length} substantive`,
    totalNotes: notes.length,
    substantiveCount: substantiveNotes.length,
    evidenceReferenceCount: evidenceReferences,
    reasoningCount: reasonedNotes,
    comparisonCount: comparisonNotes,
    nextStep,
  };
}

function analyzeNote(note = '') {
  const parts = String(note).split(/\s+\u00b7\s+/);
  const type = parts.length >= 3 ? parts[1].trim() : 'Investigation note';
  const body = (parts.length >= 3 ? parts.slice(2).join(' ') : String(note)).trim();
  const words = wordCount(body);
  const automaticType = /^(?:tool review|decision checklist|decision package)$/i.test(type);
  const genericReview = /^(?:[\w /&-]+:\s*)?reviewed\.?$/i.test(body);
  const hasEvidenceReference = /\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b/.test(body)
    || /\$\s?\d[\d,]*(?:\.\d{2})?/.test(body)
    || /\b\d{1,2}:\d{2}\s?(?:AM|PM)\b/i.test(body);
  const hasReasoning = /\b(?:because|based on|supports?|contradicts?|consistent|inconsistent|indicates?|therefore|explains?|unresolved|does not match|matches?)\b/i.test(body);
  const hasComparison = /\b(?:compare|compared|versus|before|after|prior|sequence|timeline|across|linked?|same (?:device|ip|session|account))\b/i.test(body);

  return {
    type,
    body,
    substantive: !automaticType && !genericReview && words >= 8,
    hasEvidenceReference,
    hasReasoning,
    hasComparison,
  };
}

function buildStrengths({ coveredRequired, pinnedEvidence, notesQuality, rationale, focusCoverage, provenDecisionIndicators, determinationMatched }) {
  const strengths = [];

  if (coveredRequired >= 6) strengths.push('The package covers most required investigation tools before debrief.');
  if (pinnedEvidence.length >= 2) strengths.push('Pinned evidence gives the rationale concrete records to stand on.');
  if (notesQuality.points >= 9) strengths.push(`Notebook quality is ${notesQuality.label.toLowerCase()} and connects evidence to investigator reasoning.`);
  if (wordCount(rationale) >= 20) strengths.push('The rationale has enough substance for coaching review.');
  if (focusCoverage.some((area) => area.covered)) strengths.push('At least one case-specific focus area is visible in the saved package.');
  if (provenDecisionIndicators.length) strengths.push('The selected case flags include proof and an investigator explanation.');
  if (determinationMatched) strengths.push('The operational decision and final finding match the hidden scenario truth.');

  return strengths.length ? strengths : ['The package was saved, but Luna needs more documented support to coach from.'];
}

function wordCount(text = '') {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
