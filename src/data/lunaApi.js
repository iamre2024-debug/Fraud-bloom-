const DEFAULT_ENDPOINT = '/api/luna-debrief';
const ACCESS_TOKEN_KEY = 'fraud-academy-luna-api-access-v1';

export function readLunaApiAccessToken() {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(ACCESS_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveLunaApiAccessToken(value) {
  if (typeof window === 'undefined') return false;
  const clean = String(value || '').trim();
  try {
    if (clean) window.sessionStorage.setItem(ACCESS_TOKEN_KEY, clean);
    else window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    return Boolean(clean);
  } catch {
    return false;
  }
}

export function clearLunaApiAccessToken() {
  saveLunaApiAccessToken('');
}

export async function requestLunaApiCoaching({ activeCase, reviewPackage, deterministicDebrief, signal }) {
  if (!activeCase || !reviewPackage || !deterministicDebrief) return null;
  const accessToken = readLunaApiAccessToken();
  if (!accessToken) return null;

  const response = await fetch(import.meta.env?.VITE_LUNA_API_URL || DEFAULT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Luna-Access-Token': accessToken,
    },
    signal,
    body: JSON.stringify({
      caseId: activeCase.id,
      customerType: reviewPackage.customerType || activeCase.customerType,
      productType: reviewPackage.productType || activeCase.productType,
      workflowType: reviewPackage.workflowType || activeCase.workflowType,
      alertReason: reviewPackage.alertReason || activeCase.alertReason || activeCase.queueReason,
      reportedAllegation: reviewPackage.reportedAllegation || activeCase.reportedAllegation || activeCase.allegation,
      operationalDecision: reviewPackage.operationalDecision || reviewPackage.choice,
      finalFinding: reviewPackage.finalFinding || '',
      findingBasis: reviewPackage.findingBasis || reviewPackage.reason || '',
      // Compatibility aliases for older private Luna endpoints.
      caseType: activeCase.type,
      allegation: activeCase.allegation,
      submittedDecision: reviewPackage.operationalDecision || reviewPackage.choice,
      confidence: reviewPackage.confidence,
      rationale: reviewPackage.findingBasis || reviewPackage.reason || '',
      deterministicResult: {
        determinationMatched: deterministicDebrief.determinationMatched,
        operationalDecisionMatched: deterministicDebrief.operationalDecisionMatched,
        finalFindingMatched: deterministicDebrief.finalFindingMatched,
        expectedOperationalDecision: deterministicDebrief.truthReveal?.operationalDecision || null,
        acceptedOperationalDecisions: deterministicDebrief.truthReveal?.acceptedOperationalDecisions || [],
        expectedFinalFinding: deterministicDebrief.truthReveal?.finalFinding || null,
        suspectedPatterns: deterministicDebrief.truthReveal?.suspectedPatterns || [],
        truthFindingBasis: deterministicDebrief.truthReveal?.findingBasis || null,
        disclosure: deterministicDebrief.truthReveal?.disclosure || null,
        // Compatibility aliases for saved deterministic debriefs.
        expectedDetermination: deterministicDebrief.truthReveal?.correctDetermination || null,
        acceptedDeterminations: deterministicDebrief.truthReveal?.acceptedDeterminations || [],
        classification: deterministicDebrief.truthReveal?.classification || null,
        truthRationale: deterministicDebrief.truthReveal?.rationale || null,
        score: deterministicDebrief.score,
        strengths: deterministicDebrief.strengths,
        followUps: deterministicDebrief.followUps,
      },
      packageFacts: {
        completedTools: reviewPackage.completedTools || [],
        pinnedEvidence: reviewPackage.pinnedEvidence || [],
        noteSnapshot: reviewPackage.noteSnapshot || [],
        decisionIndicators: reviewPackage.decisionIndicators || [],
      },
    }),
  });

  if (!response.ok) throw new Error(`Luna API request failed (${response.status})`);
  const payload = await response.json();
  if (!payload || typeof payload.managerVerdict !== 'string') throw new Error('Luna API returned an invalid manager-review payload');
  return payload;
}
