import { useMemo, useState } from 'react';
import { getDecisionChecklist } from '../data/decisionChecklist.js';
import {
  getDecisionCallGroups,
  getFinalFindingChoices,
} from '../data/reviewPackage.js';
import { buildLunaDebrief } from '../data/lunaDebrief.js';
import {
  DataList,
  EvidenceActions,
  SectionHeading,
  SkyCard,
  StatusChip,
} from '../components/SkyPrimitives.jsx';

function noteText(note) {
  if (typeof note === 'string') return note;
  return [
    note?.time,
    note?.source,
    note?.recordId,
    note?.text,
  ].filter(Boolean).join(' · ');
}

function evidenceLabel(item) {
  if (typeof item === 'string') return item;
  return item?.label ?? item?.id ?? 'Pinned object';
}

function indicatorAnswerComplete(answer = {}) {
  return Boolean(
    String(answer.answer ?? answer.response ?? '').trim()
    && String(answer.proof ?? '').trim()
    && String(answer.explanation ?? '').trim(),
  );
}

export function InvestigationSummary({
  activeCase,
  completedTools,
  tray,
  notes,
  actionLog,
  pinEvidence,
  saveNote,
  markReviewed,
  navigate,
}) {
  const reviewed = completedTools.includes('Investigation Summary');
  return (
    <>
      <SkyCard tone="pink">
        <SectionHeading
          eyebrow="Investigation summary"
          title="Organize what you actually reviewed"
          description="This summary is built from your case-scoped work. It does not add or infer evidence."
          action={<StatusChip>{completedTools.length} reviewed</StatusChip>}
        />
        <div className="sky-summary-ribbon">
          <div><strong>{tray.length}</strong><span>Pinned objects</span></div>
          <div><strong>{notes.length}</strong><span>Investigation notes</span></div>
          <div><strong>{actionLog.length}</strong><span>Logged actions</span></div>
        </div>
      </SkyCard>

      <div className="sky-grid">
        <SkyCard className="span-6">
          <SectionHeading
            eyebrow="Reviewed tools"
            title="Coverage"
            description="A reviewed tool means you inspected it; it does not imply a conclusion."
          />
          <div className="sky-tag-cloud">
            {completedTools.length
              ? completedTools.map((tool) => <StatusChip key={tool}>{tool}</StatusChip>)
              : <div className="sky-empty">No tools marked reviewed yet.</div>}
          </div>
        </SkyCard>

        <SkyCard className="span-6" tone="pink">
          <SectionHeading
            eyebrow="Pinned evidence"
            title="Objects selected for the package"
            description="Pins stay linked to the active case."
          />
          <ul className="sky-summary-list">
            {tray.map((item, index) => (
              <li key={item.id ?? index}>
                <strong>{evidenceLabel(item)}</strong>
                <span>{item.tool ?? item.sourceTool ?? 'Case evidence'}</span>
                <small>{item.detail ?? ''}</small>
              </li>
            ))}
          </ul>
          {!tray.length ? <div className="sky-empty">No evidence pinned.</div> : null}
        </SkyCard>

        <SkyCard className="span-7">
          <SectionHeading
            eyebrow="Notebook"
            title="Your reasoning trail"
            description="Cite record IDs, timestamps, amounts, and comparisons when they matter."
          />
          <ul className="sky-summary-list">
            {notes.map((note, index) => (
              <li key={note.id ?? index}>
                <strong>{note.source ?? 'Investigation note'}</strong>
                <span>{noteText(note)}</span>
              </li>
            ))}
          </ul>
          {!notes.length ? <div className="sky-empty">No investigation notes saved.</div> : null}
        </SkyCard>

        <SkyCard className="span-5" tone="pink">
          <SectionHeading
            eyebrow="Recent activity"
            title="Audit trail"
            description="The latest workspace actions for this case."
          />
          <ul className="sky-summary-list">
            {actionLog.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                <strong>{entry.action}</strong>
                <span>{entry.time} · {entry.source}</span>
                <small>{entry.detail}</small>
              </li>
            ))}
          </ul>
        </SkyCard>
      </div>

      <SkyCard>
        <EvidenceActions
          tool="Investigation Summary"
          record={{
            id: `${activeCase.id}-SUMMARY`,
            label: `${activeCase.id} investigation summary`,
            detail: `${completedTools.length} tools, ${tray.length} pins, ${notes.length} notes`,
          }}
          onPin={pinEvidence}
          onSaveNote={saveNote}
          onMarkReviewed={markReviewed}
          reviewed={reviewed}
        />
        <div className="sky-next-action">
          <span>Review each neutral indicator without seeing its coaching classification.</span>
          <button
            className="sky-button"
            type="button"
            onClick={() => {
              markReviewed('Investigation Summary');
              navigate('indicators');
            }}
          >
            Continue to indicators →
          </button>
        </div>
      </SkyCard>
    </>
  );
}

export function IndicatorsReview({
  activeCase,
  decisionDraft,
  completedTools,
  updateIndicator,
  markReviewed,
  navigate,
}) {
  const checklist = getDecisionChecklist(activeCase);
  const answers = decisionDraft.indicators ?? {};
  const completedCount = checklist.flags.filter((item) => (
    indicatorAnswerComplete(answers[item.id])
  )).length;
  const complete = completedCount === checklist.flags.length;
  const reviewed = completedTools.includes('Case Indicators Review');

  return (
    <>
      <SkyCard tone="pink">
        <SectionHeading
          eyebrow="Case indicators review"
          title={checklist.title}
          description="Answer from the evidence you reviewed. No risk color, weight, score, or correct response is shown."
          action={<StatusChip>{completedCount} / {checklist.flags.length} complete</StatusChip>}
        />
        <p className="sky-lead">{checklist.description}</p>
      </SkyCard>

      <div className="sky-indicator-list">
        {checklist.flags.map((indicator, index) => {
          const answer = answers[indicator.id] ?? {};
          const response = answer.answer ?? answer.response ?? '';
          const answerComplete = indicatorAnswerComplete(answer);
          return (
            <SkyCard key={indicator.id}>
              <SectionHeading
                eyebrow={`Indicator ${index + 1}`}
                title={indicator.prompt}
                description="Choose what the reviewed evidence establishes."
                action={answerComplete
                  ? <StatusChip>Complete</StatusChip>
                  : response
                    ? <StatusChip>Needs evidence</StatusChip>
                    : null}
              />
              <div className="sky-choice-grid sky-choice-grid-3" role="radiogroup" aria-label={indicator.prompt}>
                {['Yes', 'No', 'Not enough evidence'].map((option) => (
                  <button
                    className="sky-choice-card"
                    type="button"
                    role="radio"
                    aria-checked={response === option}
                    key={option}
                    onClick={() => updateIndicator(indicator.id, {
                      answer: option,
                      response: option,
                      selected: true,
                    })}
                  >
                    <strong>{option}</strong>
                    <small>
                      {option === 'Yes'
                        ? 'The reviewed records establish this.'
                        : option === 'No'
                          ? 'The reviewed records do not establish this.'
                          : 'The current record set cannot resolve this.'}
                    </small>
                  </button>
                ))}
              </div>
              <div className="sky-form-grid">
                <label className="sky-field wide">
                  <span>Evidence reference</span>
                  <input
                    value={answer.proof ?? ''}
                    onChange={(event) => updateIndicator(indicator.id, { proof: event.target.value })}
                    placeholder="Record ID, date, amount, or source"
                  />
                </label>
                <label className="sky-field wide">
                  <span>Your explanation</span>
                  <textarea
                    value={answer.explanation ?? ''}
                    onChange={(event) => updateIndicator(indicator.id, { explanation: event.target.value })}
                    placeholder="Explain what the cited evidence supports or leaves unresolved."
                  />
                </label>
              </div>
            </SkyCard>
          );
        })}
      </div>

      <SkyCard>
        <div className="sky-next-action">
          <span>
            {complete
              ? 'Every indicator has a response, evidence reference, and explanation.'
              : 'Complete the response, evidence reference, and explanation for every indicator.'}
          </span>
          <div className="sky-action-row">
            <button
              className="sky-button-secondary"
              type="button"
              disabled={!complete || reviewed}
              onClick={() => markReviewed('Case Indicators Review')}
            >
              {reviewed ? 'Indicators reviewed' : 'Mark indicators reviewed'}
            </button>
            <button
              className="sky-button"
              type="button"
              disabled={!complete}
              onClick={() => {
                markReviewed('Case Indicators Review');
                navigate('determination');
              }}
            >
              Continue to determination →
            </button>
          </div>
        </div>
      </SkyCard>
    </>
  );
}

const decisionDescriptions = {
  'Support Customer Claim': 'The evidence supports the customer’s claim.',
  'Do Not Support Customer Claim': 'The evidence does not support the claim.',
  'Partial Credit': 'The evidence supports a limited operational remedy.',
  'Insufficient Evidence': 'The available record cannot support a complete decision.',
  Maintain: 'Keep the account or exposure unchanged.',
  Restrict: 'Apply an account restriction.',
  'Restrict / Reduce': 'Restrict activity or reduce exposure.',
  Hold: 'Pause the activity while the case is handled.',
  Release: 'Release the held activity.',
  Approve: 'Approve the application or action.',
  Deny: 'Deny using a specific factual reason.',
  'More Information Needed': 'Obtain additional material evidence.',
  'Request More Information': 'Request a specific missing record.',
  Escalate: 'Refer the case for specialist review.',
};

export function Determination({
  activeCase,
  decisionDraft,
  completedTools,
  updateDecision,
  markReviewed,
  navigate,
}) {
  const groups = getDecisionCallGroups(activeCase);
  const finalFindings = getFinalFindingChoices(activeCase);
  const reviewed = completedTools.includes('Determination');
  const rationaleWordCount = String(decisionDraft.findingBasis ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const determinationComplete = Boolean(
    decisionDraft.operationalDecision
    && decisionDraft.finalFinding
    && rationaleWordCount >= 12,
  );

  return (
    <>
      <SkyCard tone="pink">
        <SectionHeading
          eyebrow="Determination"
          title="Make an evidence-first decision"
          description="Choose the operational action and the separate case finding. Nothing is preselected."
        />
      </SkyCard>

      <SkyCard>
        <SectionHeading
          eyebrow="1. Evidence summary"
          title={activeCase.id}
          description="Key intake facts remain available while you decide."
        />
        <DataList rows={[
          ['Amount / exposure', activeCase.amountExposure ?? activeCase.amount],
          ['Reported / opened', activeCase.reportedDate ?? activeCase.opened],
          ['Product', activeCase.productTypeLabel ?? activeCase.productType],
          ['Customer / business', activeCase.person ?? activeCase.profile?.business],
          ['Reviewed tools', completedTools.length],
        ]} />
      </SkyCard>

      {groups.map((group) => (
        <SkyCard key={group.label}>
          <SectionHeading
            eyebrow="2. Operational decision"
            title={group.label}
            description="What action should the operation take based on the evidence?"
          />
          <div className="sky-choice-grid">
            {group.options.map((option) => (
              <button
                className="sky-decision-card"
                type="button"
                key={option}
                aria-pressed={decisionDraft.operationalDecision === option}
                onClick={() => updateDecision('operationalDecision', option)}
              >
                <span className="sky-decision-icon" aria-hidden="true">◇</span>
                <span>
                  <strong>{option}</strong>
                  <small>{decisionDescriptions[option] ?? 'Use the reviewed evidence to support this action.'}</small>
                </span>
              </button>
            ))}
          </div>
        </SkyCard>
      ))}

      <SkyCard tone="pink">
        <SectionHeading
          eyebrow="3. Final finding"
          title="What did the investigation establish?"
          description="Keep the finding distinct from the operational action."
        />
        <div className="sky-choice-grid">
          {finalFindings.map((option) => (
            <button
              className="sky-decision-card"
              type="button"
              key={option}
              aria-pressed={decisionDraft.finalFinding === option}
              onClick={() => updateDecision('finalFinding', option)}
            >
              <span className="sky-decision-icon" aria-hidden="true">✦</span>
              <strong>{option}</strong>
            </button>
          ))}
        </div>
      </SkyCard>

      <SkyCard>
        <SectionHeading
          eyebrow="4. Rationale"
          title="Connect the decision to exact evidence"
          description="A clear rationale is required for every submission."
        />
        <div className="sky-form-grid">
          <label className="sky-field">
            <span>Confidence</span>
            <select
              value={decisionDraft.confidence}
              onChange={(event) => updateDecision('confidence', event.target.value)}
            >
              {['Low', 'Medium', 'High'].map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="sky-field wide">
            <span>Evidence-based rationale</span>
            <textarea
              value={decisionDraft.findingBasis}
              onChange={(event) => updateDecision('findingBasis', event.target.value)}
              placeholder="Cite exact records and explain how they support, contradict, or leave the finding unresolved."
            />
          </label>
        </div>
        <div className="sky-next-action">
          <span>
            {determinationComplete
              ? 'Decision, finding, and rationale are recorded.'
              : 'Choose both decision fields and write an evidence-based rationale of at least 12 words.'}
          </span>
          <button
            className="sky-button-secondary"
            type="button"
            disabled={reviewed || !determinationComplete}
            onClick={() => markReviewed('Determination')}
          >
            {reviewed ? 'Determination reviewed' : 'Mark determination reviewed'}
          </button>
          <button
            className="sky-button"
            type="button"
            onClick={() => {
              markReviewed('Determination');
              navigate('submit');
            }}
            disabled={!determinationComplete}
          >
            Review submission →
          </button>
        </div>
      </SkyCard>
    </>
  );
}

export function SubmitDecision({
  activeCase,
  decisionDraft,
  tray,
  notes,
  packageStatus,
  submitPackage,
  navigate,
}) {
  const [attempted, setAttempted] = useState(false);
  const submit = () => {
    setAttempted(true);
    const result = submitPackage();
    if (result.package) navigate('luna');
  };

  return (
    <>
      <SkyCard tone="pink">
        <SectionHeading
          eyebrow="Submit decision"
          title="Freeze the learner package"
          description="Submission locks this version and is the first point where Luna may compare it with scenario truth."
          action={<StatusChip>{packageStatus.ready ? 'Ready' : 'Needs work'}</StatusChip>}
        />
      </SkyCard>

      <div className="sky-grid">
        <SkyCard className="span-7">
          <SectionHeading
            eyebrow="Decision"
            title={decisionDraft.operationalDecision || 'No operational decision selected'}
            description={decisionDraft.finalFinding || 'No final finding selected'}
          />
          <DataList rows={[
            ['Case', activeCase.id],
            ['Operational decision', decisionDraft.operationalDecision],
            ['Final finding', decisionDraft.finalFinding],
            ['Confidence', decisionDraft.confidence],
            ['Rationale', decisionDraft.findingBasis],
          ]} />
        </SkyCard>
        <SkyCard className="span-5" tone="pink">
          <SectionHeading
            eyebrow="Package contents"
            title="Evidence snapshot"
            description="All selected objects and notes are included in the frozen package."
          />
          <div className="sky-summary-ribbon vertical">
            <div><strong>{tray.length}</strong><span>Pinned objects</span></div>
            <div><strong>{notes.length}</strong><span>Notes</span></div>
            <div><strong>{packageStatus.indicatorSummary?.answeredCount ?? packageStatus.indicatorSummary?.selectedCount ?? 0}</strong><span>Indicators answered</span></div>
          </div>
        </SkyCard>
      </div>

      <SkyCard>
        <SectionHeading
          eyebrow="Submission check"
          title={packageStatus.ready ? 'Package can be submitted' : 'Resolve the required items'}
          description="Optional tools may remain unreviewed when the evidence already supports a decision."
        />
        <ul className="sky-status-list">
          {(packageStatus.messages ?? []).map((message) => <li key={message}>{message}</li>)}
        </ul>
        {attempted && !packageStatus.ready ? (
          <div className="sky-notice">
            {packageStatus.blockers.join('; ')}
          </div>
        ) : null}
        <div className="sky-next-action">
          <span>Submitting creates a new immutable package version.</span>
          <button className="sky-button" type="button" onClick={submit} disabled={!packageStatus.ready}>
            Submit and unlock Luna ✦
          </button>
        </div>
      </SkyCard>
    </>
  );
}

export function LunaDebrief({
  activeCase,
  latestPackage,
  completedTools,
  tray,
  notes,
  navigate,
}) {
  const debrief = useMemo(() => {
    if (!latestPackage) return null;
    return buildLunaDebrief({
      activeCase,
      reviewPackage: latestPackage,
      completedTools,
      tray,
      notes: notes.map(noteText),
    });
  }, [activeCase, completedTools, latestPackage, notes, tray]);

  if (!latestPackage || !debrief) {
    return (
      <SkyCard tone="pink">
        <div className="sky-luna">
          <div className="sky-luna-art"><img src="/assets/luna-sky-vector-v1.svg" alt="Luna" /></div>
          <div>
            <SectionHeading
              eyebrow="Luna"
              title="Submit before the debrief"
              description="Luna does not reveal the expected outcome until a valid learner package is frozen."
            />
            <button className="sky-button" type="button" onClick={() => navigate('submit')}>Go to submission</button>
          </div>
        </div>
      </SkyCard>
    );
  }

  return (
    <>
      <SkyCard className="sky-luna-debrief" tone="pink">
        <div className="sky-luna">
          <div className="sky-luna-art"><img src="/assets/luna-sky-vector-v1.svg" alt="Luna, your AI coach" /></div>
          <div>
            <p className="sky-eyebrow">Luna debrief ✨</p>
            <h1>{debrief.scoreLabel}</h1>
            <p>{debrief.coachIntro}</p>
            <div className="sky-score-badge"><strong>{debrief.score}</strong><span>/ 100</span></div>
          </div>
        </div>
      </SkyCard>

      <div className="sky-grid">
        <SkyCard className="span-6">
          <SectionHeading eyebrow="Your submission" title={debrief.submittedOperationalDecision} description={debrief.submittedFinalFinding} />
          <DataList rows={[
            ['Operational decision match', debrief.operationalDecisionMatched === null ? 'Not graded' : debrief.operationalDecisionMatched ? 'Matched' : 'Review needed'],
            ['Final finding match', debrief.finalFindingMatched === null ? 'Not graded' : debrief.finalFindingMatched ? 'Matched' : 'Review needed'],
            ['Notes quality', debrief.notesQuality?.summary],
          ]} />
        </SkyCard>

        <SkyCard className="span-6" tone="pink">
          <SectionHeading
            eyebrow="Scenario outcome"
            title={debrief.legacyHistory
              ? 'Legacy package history'
              : debrief.truthReveal?.operationalDecision ?? 'Base-case coaching'}
            description={debrief.legacyHistory
              ? 'This historical package remains readable, but it does not reveal or grade scenario truth.'
              : debrief.truthReveal?.finalFinding ?? 'No separate scenario outcome is graded.'}
          />
          {debrief.truthReveal ? (
            <DataList rows={[
              ['Classification', debrief.truthReveal.classification],
              ['Accepted decisions', debrief.truthReveal.acceptedOperationalDecisions],
              ['Finding basis', debrief.truthReveal.findingBasis],
            ]} />
          ) : (
            <p>
              {debrief.legacyHistory
                ? 'Submit a current evidence-based package to unlock scenario-outcome coaching.'
                : debrief.riskTip}
            </p>
          )}
        </SkyCard>

        <SkyCard className="span-6">
          <SectionHeading eyebrow="Strengths" title="What worked" />
          <ul className="sky-status-list">{debrief.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
        </SkyCard>
        <SkyCard className="span-6" tone="pink">
          <SectionHeading eyebrow="Next steps" title="What to strengthen" />
          <ul className="sky-status-list">{debrief.followUps.map((item) => <li key={item}>{item}</li>)}</ul>
        </SkyCard>
      </div>

      <SkyCard>
        <SectionHeading eyebrow="Coaching breakdown" title={debrief.theme} description={debrief.riskTip} />
        <div className="sky-metric-grid">
          {debrief.breakdown.map((item) => (
            <div className="sky-metric" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.points}</strong>
              <small>{item.value}</small>
            </div>
          ))}
        </div>
        <div className="sky-next-action">
          <span>{debrief.motivation}</span>
          <button className="sky-button" type="button" onClick={() => navigate('report')}>Open case report →</button>
        </div>
      </SkyCard>
    </>
  );
}

export function CaseReport({
  activeCase,
  latestPackage,
  actionLog,
  navigate,
}) {
  if (!latestPackage) {
    return (
      <SkyCard>
        <SectionHeading
          eyebrow="Case report"
          title="No frozen package yet"
          description="The report is generated only from a submitted learner package."
        />
        <button className="sky-button" type="button" onClick={() => navigate('submit')}>Go to submission</button>
      </SkyCard>
    );
  }

  const report = {
    reportVersion: latestPackage.packageVersion ?? latestPackage.version ?? 1,
    caseId: activeCase.id,
    generatedAt: new Date().toISOString(),
    packageId: latestPackage.id,
    submittedAt: latestPackage.savedAtIso,
    decision: {
      operationalDecision: latestPackage.operationalDecision,
      finalFinding: latestPackage.finalFinding,
      confidence: latestPackage.confidence,
      rationale: latestPackage.findingBasis,
    },
    completedTools: latestPackage.completedTools ?? [],
    pinnedEvidence: latestPackage.pinnedEvidence ?? [],
    notes: latestPackage.noteSnapshot ?? [],
    indicators: latestPackage.decisionIndicators ?? [],
    actionLog,
  };

  function downloadReport() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeCase.id}-case-report-v${report.reportVersion}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <SkyCard tone="pink">
        <SectionHeading
          eyebrow="Case report"
          title={`${activeCase.id} · Package v${report.reportVersion}`}
          description="Generated from the frozen learner package and its case-scoped audit trail."
          action={<button className="sky-button" type="button" onClick={downloadReport}>Download report</button>}
        />
      </SkyCard>

      <div className="sky-grid">
        <SkyCard className="span-7">
          <SectionHeading eyebrow="Determination" title={report.decision.operationalDecision} description={report.decision.finalFinding} />
          <DataList rows={[
            ['Package ID', report.packageId],
            ['Submitted', report.submittedAt],
            ['Confidence', report.decision.confidence],
            ['Rationale', report.decision.rationale],
          ]} />
        </SkyCard>
        <SkyCard className="span-5" tone="pink">
          <SectionHeading eyebrow="Inventory" title="Frozen contents" />
          <div className="sky-summary-ribbon vertical">
            <div><strong>{report.completedTools.length}</strong><span>Reviewed tools</span></div>
            <div><strong>{report.pinnedEvidence.length}</strong><span>Pinned objects</span></div>
            <div><strong>{report.notes.length}</strong><span>Notes</span></div>
          </div>
        </SkyCard>
        <SkyCard className="span-6">
          <SectionHeading eyebrow="Evidence" title="Pinned objects" />
          <DataList rows={report.pinnedEvidence.map((item, index) => [
            evidenceLabel(item),
            typeof item === 'string' ? item : `${item.tool ?? 'Evidence'} · ${item.detail ?? item.id ?? index + 1}`,
          ])} />
        </SkyCard>
        <SkyCard className="span-6" tone="pink">
          <SectionHeading eyebrow="Notes" title="Investigator documentation" />
          <DataList rows={report.notes.map((note, index) => [
            `Note ${index + 1}`,
            noteText(note),
          ])} />
        </SkyCard>
      </div>

      <SkyCard>
        <SectionHeading eyebrow="Machine-readable package" title="Report snapshot" description="The download contains every field shown here." />
        <pre className="sky-report-json">{JSON.stringify({
          caseId: report.caseId,
          packageId: report.packageId,
          version: report.reportVersion,
          decision: report.decision,
          counts: {
            completedTools: report.completedTools.length,
            pinnedEvidence: report.pinnedEvidence.length,
            notes: report.notes.length,
            indicators: report.indicators.length,
          },
        }, null, 2)}</pre>
      </SkyCard>
    </>
  );
}
