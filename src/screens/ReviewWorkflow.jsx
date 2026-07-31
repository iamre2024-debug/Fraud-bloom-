import { useMemo, useRef, useState } from 'react';
import { getDecisionChecklist } from '../data/decisionChecklist.js';
import {
  getDecisionCallGroups,
  getFinalFindingChoices,
} from '../data/reviewPackage.js';
import { buildLunaDebrief } from '../data/lunaDebrief.js';
import { caseDomainLabels } from '../data/caseDomain.js';
import { publicCaseTaxonomy } from '../data/publicCaseView.js';
import { getWorkspaceProgress } from '../data/workspaceProgress.js';
import {
  DataList,
  EvidenceActions,
  SectionHeading,
  SkyCard,
  SkyCharm,
  SkyIcon,
  SkySparkles,
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

function ReviewHero({
  eyebrow,
  title,
  description,
}) {
  return (
    <header className="sky-review-hero">
      <SkySparkles />
      <div className="sky-review-hero-layout">
        <div>
          <p className="sky-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="sky-review-luna">
          <img src="/assets/luna-anime-purple-v1.webp" alt="Luna" />
          <span>Luna <i aria-hidden="true">♥</i></span>
        </div>
      </div>
    </header>
  );
}

function ReviewSectionTitle({
  number,
  title,
  description,
  meta,
}) {
  return (
    <header className="sky-review-section-title">
      <span className="sky-review-section-number" aria-hidden="true">{number}</span>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {meta ? <StatusChip tone="pink">{meta}</StatusChip> : null}
    </header>
  );
}

function ScopeCue({
  icon,
  label,
  value,
  tone,
}) {
  return (
    <article className="sky-scope-cue" data-tone={tone}>
      <span aria-hidden="true"><SkyIcon name={icon} size={20} /></span>
      <small>{label}</small>
      <strong>{value ?? 'Not supplied'}</strong>
    </article>
  );
}

function EvidenceSummaryRow({
  icon,
  label,
  value,
}) {
  return (
    <div className="sky-determination-fact">
      <SkyIcon name={icon} size={19} />
      <span><small>{label}</small><strong>{value ?? 'Not supplied'}</strong></span>
    </div>
  );
}

function ReferenceReviewHeader({
  title,
  subtitle,
  caseId,
  backLabel,
  onBack,
  icon = 'shield',
  luna = false,
}) {
  return (
    <header className="sky-review-reference-header" data-luna={luna || undefined}>
      <SkySparkles />
      <button
        className="sky-review-reference-back"
        type="button"
        onClick={onBack}
        aria-label={backLabel}
      >
        <SkyIcon name="back" size={21} />
      </button>
      <span className="sky-review-reference-mark" aria-hidden="true">
        <SkyIcon name={icon} size={22} />
        <i>✦</i>
      </span>
      <div className="sky-review-reference-copy">
        <h1>{title}</h1>
        <p>
          <span>{subtitle}</span>
          <i>{caseId}</i>
        </p>
      </div>
      {luna ? (
        <div className="sky-review-reference-luna" aria-hidden="true">
          <img src="/assets/luna-anime-purple-v1.webp" alt="" />
          <i>♥</i>
        </div>
      ) : <span className="sky-review-reference-slot" aria-hidden="true" />}
    </header>
  );
}

function decisionVisual(option = '', index = 0) {
  const value = option.toLowerCase();
  if (/do not support|deny|restrict|fraud confirmed|credit risk concern/.test(value)) {
    return { icon: 'alert', tone: 'pink' };
  }
  if (/support customer|approve|release|maintain|fraud not found|non-fraud dispute/.test(value)) {
    return { icon: 'check', tone: 'mint' };
  }
  if (/insufficient|information|hold|inconclusive|verification incomplete/.test(value)) {
    return { icon: 'review', tone: 'amber' };
  }
  if (/escalate/.test(value)) return { icon: 'arrow', tone: 'blue' };
  return [
    { icon: 'shield', tone: 'mint' },
    { icon: 'alert', tone: 'pink' },
    { icon: 'review', tone: 'amber' },
    { icon: 'arrow', tone: 'blue' },
  ][index % 4];
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
  notes = [],
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
  const domainLabels = caseDomainLabels({
    customerType: checklist.customerType,
    productType: checklist.productType,
    workflowType: checklist.workflowType,
  });
  const evidenceNotes = notes.slice(0, 4);
  const scopeCues = [
    {
      icon: 'user',
      label: 'Customer type',
      value: domainLabels.customerTypeLabel,
      tone: 'blue',
    },
    {
      icon: 'payment',
      label: 'Product',
      value: domainLabels.productTypeLabel,
      tone: 'pink',
    },
    {
      icon: 'review',
      label: 'Review workflow',
      value: domainLabels.workflowTypeLabel,
      tone: 'violet',
    },
  ];

  return (
    <div className="sky-review-page sky-indicators-page">
      <ReviewHero
        eyebrow="Case review"
        title="Case Indicators Review"
        description="Review each prompt, choose what the records establish, and cite your evidence."
      />

      <SkyCard className="sky-review-section sky-indicator-checklist" shape="shield">
        <ReviewSectionTitle
          number="1."
          title="Indicator Checklist"
          description={checklist.title}
          meta={`${completedCount} / ${checklist.flags.length}`}
        />
        <p className="sky-review-guidance">
          Prompts alternate between unresolved concerns and legitimate or consistent evidence.
          No risk color, weight, score, or correct response is shown.
        </p>
        <div className="sky-indicator-rows">
          {checklist.flags.map((indicator, index) => {
            const answer = answers[indicator.id] ?? {};
            const response = answer.answer ?? answer.response ?? '';
            const answerComplete = indicatorAnswerComplete(answer);
            return (
              <details
                className="sky-indicator-item"
                data-state={answerComplete ? 'complete' : response ? 'needs-evidence' : 'open'}
                key={indicator.id}
              >
              <summary>
                <span className="sky-indicator-index" aria-hidden="true">{index + 1}</span>
                <span className="sky-indicator-prompt">
                  <strong>{indicator.prompt}</strong>
                  <small>
                    {answerComplete
                      ? response
                      : response
                        ? `${response} · add evidence and explanation`
                        : 'Choose a response'}
                  </small>
                </span>
                <StatusChip tone="pink">
                  {answerComplete ? 'Complete' : response ? 'Needs evidence' : 'Choose'}
                </StatusChip>
                <SkyIcon name="arrow" size={16} />
              </summary>
              <div className="sky-indicator-editor">
                <p className="sky-indicator-hint">
                  <SkyIcon name="evidence" size={17} />
                  <span>{indicator.evidenceHint}</span>
                </p>
                <div
                  className="sky-choice-grid sky-choice-grid-3 sky-indicator-options"
                  role="radiogroup"
                  aria-label={indicator.prompt}
                >
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
                            : 'The current records cannot resolve this.'}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="sky-form-grid sky-indicator-fields">
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
              </div>
              </details>
            );
          })}
        </div>
      </SkyCard>

      <SkyCard className="sky-review-section sky-claim-cues" tone="pink" shape="ribbon" sparkle>
        <ReviewSectionTitle
          number="2."
          title="Claim Type Cues"
          description="These labels define the review scope; they do not predict an outcome."
        />
        <div className="sky-scope-cues">
          {scopeCues.map((cue) => <ScopeCue key={cue.label} {...cue} />)}
        </div>
      </SkyCard>

      <SkyCard className="sky-review-section sky-indicator-notes" shape="shield">
        <ReviewSectionTitle
          number="3."
          title="Evidence Notes"
          description="Your case-scoped investigation notes. Indicator citations stay attached to each checklist row."
          meta={`${notes.length} note${notes.length === 1 ? '' : 's'}`}
        />
        {evidenceNotes.length ? (
          <div className="sky-indicator-note-list">
            {evidenceNotes.map((note, index) => (
              <article key={note.id ?? index}>
                <strong>{typeof note === 'string' ? 'Investigation note' : note.source ?? 'Investigation note'}</strong>
                {typeof note !== 'string' && (note.time || note.recordId) ? (
                  <span>{[note.time, note.recordId].filter(Boolean).join(' · ')}</span>
                ) : null}
                <p>{typeof note === 'string' ? note : note.text ?? noteText(note)}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="sky-empty">No case notes have been saved yet.</div>
        )}
        <button
          className="sky-button-secondary sky-indicator-notes-action"
          type="button"
          onClick={() => navigate('summary')}
        >
          Open investigation summary
          <SkyIcon name="arrow" size={17} />
        </button>
      </SkyCard>

      <SkyCard className="sky-review-next" shape="ribbon">
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
              {reviewed
                ? complete
                  ? 'Indicators reviewed'
                  : 'Review needs completion'
                : 'Mark indicators reviewed'}
            </button>
            <button
              className="sky-button"
              type="button"
              onClick={() => {
                if (complete) markReviewed('Case Indicators Review');
                navigate('determination');
              }}
            >
              {complete ? 'Continue to determination →' : 'Open determination with warning →'}
            </button>
          </div>
        </div>
      </SkyCard>
    </div>
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
  const operationalOptions = groups.flatMap((group) => group.options);
  const reviewed = completedTools.includes('Determination');
  const rationaleWordCount = String(decisionDraft.findingBasis ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const determinationComplete = Boolean(
    operationalOptions.includes(decisionDraft.operationalDecision)
    && finalFindings.includes(decisionDraft.finalFinding)
    && rationaleWordCount >= 12,
  );
  const {
    reviewed: reviewedToolCount,
    total: totalToolCount,
  } = getWorkspaceProgress(activeCase, completedTools);
  const domainLabels = caseDomainLabels(activeCase);
  const caseSubject = /business/i.test(activeCase.customerType ?? '')
    ? activeCase.profile?.business
      ?? activeCase.businessProfile?.legalName
      ?? activeCase.companyPayrollProfile?.legalName
      ?? activeCase.person
    : activeCase.person ?? activeCase.profile?.business;
  const evidenceSummary = [
    {
      icon: 'amount',
      label: 'Amount / exposure',
      value: activeCase.amountExposure ?? activeCase.amount,
    },
    {
      icon: 'calendar',
      label: 'Reported / opened',
      value: activeCase.reportedDate ?? activeCase.opened,
    },
    {
      icon: 'payment',
      label: 'Product',
      value: activeCase.productTypeLabel ?? domainLabels.productTypeLabel,
    },
    {
      icon: 'user',
      label: 'Customer / business',
      value: caseSubject,
    },
    {
      icon: 'evidence',
      label: 'Intake documents',
      value: `${activeCase.documents?.length ?? 0} listed`,
    },
    {
      icon: 'workspace',
      label: 'Reviewed tools',
      value: `${reviewedToolCount} / ${totalToolCount}`,
    },
  ];

  return (
    <div className="sky-review-page sky-determination-page sky-determination-reference">
      <ReviewHero
        eyebrow="Evidence-first decision"
        title="Determination"
        description="Review the evidence, select both decision fields, and explain your reasoning."
      />

      <SkyCard
        className="sky-review-section sky-determination-summary sky-determination-summary-reference"
        shape="shield"
        sparkle
      >
        <ReviewSectionTitle
          number="1."
          title="Evidence Summary"
          description={`${activeCase.id} · Key case facts remain visible while you decide.`}
        />
        <div className="sky-determination-facts">
          {evidenceSummary.map((fact) => <EvidenceSummaryRow key={fact.label} {...fact} />)}
        </div>
        <button
          className="sky-button-secondary sky-view-evidence"
          type="button"
          onClick={() => navigate('summary')}
        >
          <span>View investigation summary</span>
          <SkyIcon name="arrow" size={17} />
        </button>
      </SkyCard>

      <SkyCard
        className="sky-review-section sky-determination-panel sky-determination-panel-reference"
        tone="pink"
        shape="ribbon"
        sparkle
      >
        <ReviewSectionTitle
          number="2."
          title="Determination"
          description="Choose the operational action and a separate case finding. Neither choice is preselected."
          meta={decisionDraft.operationalDecision ? 'Action selected' : 'Choose action'}
        />

        {groups.map((group) => (
          <section className="sky-decision-group" key={group.label}>
            <header>
              <h3>{group.label}</h3>
              <p>What should the operation do based on the evidence?</p>
            </header>
            <div className="sky-choice-grid sky-determination-options">
              {group.options.map((option, index) => {
                const visual = decisionVisual(option, index);
                return (
                  <button
                    className="sky-decision-card"
                    data-tone={visual.tone}
                    type="button"
                    key={option}
                    aria-pressed={decisionDraft.operationalDecision === option}
                    onClick={() => updateDecision('operationalDecision', option)}
                  >
                    <span className="sky-decision-icon" aria-hidden="true">
                      <SkyIcon name={visual.icon} size={25} />
                    </span>
                    <span>
                      <strong>{option}</strong>
                      <small>{decisionDescriptions[option] ?? 'Use the reviewed evidence to support this action.'}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section className="sky-finding-group">
          <header>
            <h3>Case finding</h3>
            <p>What did the investigation establish? Keep this separate from the operational action.</p>
          </header>
          <div className="sky-choice-grid sky-finding-options">
            {finalFindings.map((option, index) => {
              const visual = decisionVisual(option, index);
              return (
                <button
                  className="sky-decision-card"
                  data-tone={visual.tone}
                  type="button"
                  key={option}
                  aria-pressed={decisionDraft.finalFinding === option}
                  onClick={() => updateDecision('finalFinding', option)}
                >
                  <span className="sky-decision-icon" aria-hidden="true">
                    <SkyIcon name={visual.icon} size={22} />
                  </span>
                  <strong>{option}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <section className="sky-determination-rationale">
          <header>
            <h3>Decision notes</h3>
            <p>Cite exact records. Confidence describes your decision confidence, not the case’s risk.</p>
          </header>
          <div className="sky-form-grid sky-determination-fields">
            <label className="sky-field">
              <span>Decision confidence</span>
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
          <small className="sky-rationale-count">{rationaleWordCount} / 12 minimum words</small>
        </section>
      </SkyCard>

      <SkyCard
        className="sky-review-section sky-determination-next sky-determination-next-reference"
        shape="shield"
        sparkle
      >
        <ReviewSectionTitle
          number="3."
          title="Next Steps"
          description="Your choices remain editable until you submit and freeze the package."
          meta={determinationComplete ? 'Ready' : 'Needs work'}
        />
        <div className="sky-next-step-message">
          <SkyIcon name={determinationComplete ? 'check' : 'review'} size={21} />
          <span>
            {determinationComplete
              ? 'Decision, finding, and rationale are recorded. Review the package before submission.'
              : 'Choose both decision fields and write an evidence-based rationale of at least 12 words.'}
          </span>
        </div>
        <div className="sky-action-row sky-determination-actions">
          <button
            className="sky-button-secondary"
            type="button"
            disabled={reviewed || !determinationComplete}
            onClick={() => markReviewed('Determination')}
          >
            {reviewed
              ? determinationComplete
                ? 'Determination reviewed'
                : 'Review needs completion'
              : 'Mark determination reviewed'}
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
            Review submission
            <SkyIcon name="arrow" size={18} />
          </button>
        </div>
      </SkyCard>
    </div>
  );
}

export function SubmitDecision({
  activeCase,
  decisionDraft,
  tray,
  notes,
  packageStatus,
  latestPackage,
  submitPackage,
  navigate,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const taxonomy = publicCaseTaxonomy(activeCase);
  const currentVersion = Number(latestPackage?.packageVersion ?? latestPackage?.version ?? 0);
  const nextVersion = currentVersion + 1;
  const evidencePreview = tray.slice(0, 3);
  const notePreview = notes.slice(0, 3);

  const submit = () => {
    if (submittingRef.current || !packageStatus.ready) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const result = submitPackage();
      if (result.package) {
        navigate('luna');
        return;
      }
    } catch (error) {
      submittingRef.current = false;
      setIsSubmitting(false);
      throw error;
    }
    submittingRef.current = false;
    setIsSubmitting(false);
  };

  return (
    <div className="sky-submit-reference sky-review-reference-page">
      <ReferenceReviewHeader
        title="Submit Decision"
        subtitle="Final review"
        caseId={activeCase.id}
        backLabel="Back to determination"
        onBack={() => navigate('determination')}
        icon="evidence"
      />

      <SkyCard
        className="sky-submit-case-banner"
        tone="pink"
        shape="shield"
        sparkle
      >
        <div className="sky-submit-case-copy">
          <small>Case ready for final review</small>
          <h2>{activeCase.id}</h2>
          <p>{taxonomy.workflowType} <span aria-hidden="true">•</span> {taxonomy.productType}</p>
        </div>
        <StatusChip tone={packageStatus.ready ? 'mint' : 'pink'}>
          {packageStatus.ready ? 'Ready to freeze' : 'Needs work'}
        </StatusChip>
      </SkyCard>

      <SkyCard
        className="sky-submit-decision-card"
        shape="ribbon"
        sparkle
      >
        <header className="sky-submit-section-heading">
          <span aria-hidden="true"><SkyIcon name="review" size={21} /></span>
          <div>
            <small>Selected decision</small>
            <h2>{decisionDraft.operationalDecision || 'No operational decision selected'}</h2>
          </div>
          <StatusChip>{decisionDraft.confidence || 'No confidence'}</StatusChip>
        </header>
        <div className="sky-submit-decision-details">
          <article>
            <small>Case finding</small>
            <strong>{decisionDraft.finalFinding || 'No final finding selected'}</strong>
          </article>
          <article>
            <small>Evidence-based rationale</small>
            <p>{decisionDraft.findingBasis || 'No rationale entered.'}</p>
          </article>
        </div>
      </SkyCard>

      <SkyCard
        className="sky-submit-evidence-card"
        tone="pink"
        shape="shield"
      >
        <header className="sky-submit-section-heading">
          <span aria-hidden="true"><SkyIcon name="pin" size={21} /></span>
          <div>
            <small>Package preview · frozen on submission</small>
            <h2>Pinned evidence ({tray.length})</h2>
          </div>
          <button
            className="sky-submit-text-action"
            type="button"
            onClick={() => navigate('summary')}
          >
            View summary
          </button>
        </header>
        {evidencePreview.length ? (
          <div className="sky-submit-evidence-grid">
            {evidencePreview.map((item, index) => (
              <article key={item.id ?? index}>
                <span aria-hidden="true"><SkyIcon name="evidence" size={18} /></span>
                <small>{item.tool ?? item.sourceTool ?? 'Case evidence'}</small>
                <strong>{evidenceLabel(item)}</strong>
                {item.detail ? <p>{item.detail}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="sky-submit-empty">
            No evidence objects are pinned. Pins are optional when the documented case record already supports the decision.
          </div>
        )}
        {tray.length > evidencePreview.length ? (
          <details className="sky-submit-disclosure">
            <summary>View all {tray.length} pinned objects</summary>
            <ul>
              {tray.map((item, index) => (
                <li key={item.id ?? index}>
                  <strong>{evidenceLabel(item)}</strong>
                  <span>{item.tool ?? item.sourceTool ?? 'Case evidence'}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </SkyCard>

      <SkyCard className="sky-submit-notes-card" shape="soft">
        <header className="sky-submit-section-heading">
          <span aria-hidden="true"><SkyIcon name="evidence" size={21} /></span>
          <div>
            <small>Reasoning trail</small>
            <h2>Investigation notes ({notes.length})</h2>
          </div>
        </header>
        {notePreview.length ? (
          <ul className="sky-submit-note-list">
            {notePreview.map((note, index) => (
              <li key={note.id ?? index}>
                <strong>{note.source ?? note.sourceTool ?? 'Investigation note'}</strong>
                <span>{noteText(note)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="sky-submit-empty">
            No separate notebook entries were saved. Notes are optional; the rationale and documented indicator answers remain in this package.
          </div>
        )}
        {notes.length > notePreview.length ? (
          <details className="sky-submit-disclosure">
            <summary>View all {notes.length} notes</summary>
            <ul>
              {notes.map((note, index) => <li key={note.id ?? index}>{noteText(note)}</li>)}
            </ul>
          </details>
        ) : null}
      </SkyCard>

      <SkyCard
        className="sky-submit-check-card"
        tone={packageStatus.ready ? undefined : 'pink'}
        shape="ribbon"
        sparkle
      >
        <header className="sky-submit-section-heading">
          <span aria-hidden="true">
            <SkyIcon name={packageStatus.ready ? 'check' : 'alert'} size={21} />
          </span>
          <div>
            <small>Submission check</small>
            <h2>{packageStatus.ready ? 'Package can be submitted' : 'Resolve the required items'}</h2>
          </div>
          <strong className="sky-submit-indicator-count">
            {packageStatus.indicatorSummary?.answeredCount ?? packageStatus.indicatorSummary?.selectedCount ?? 0}
            <small> indicators</small>
          </strong>
        </header>
        <ul className="sky-submit-status-list">
          {(packageStatus.messages ?? []).map((message) => <li key={message}>{message}</li>)}
        </ul>
        {!packageStatus.ready && packageStatus.blockers?.length ? (
          <div className="sky-notice sky-submit-blockers">
            {packageStatus.blockers.join('; ')}
          </div>
        ) : null}
        <button
          className="sky-button sky-submit-confirm"
          type="button"
          onClick={submit}
          disabled={!packageStatus.ready || isSubmitting}
          aria-label="Submit and unlock Luna"
        >
          <SkyIcon name="shield" size={21} />
          <span>{isSubmitting ? 'Freezing package…' : 'Confirm & submit decision'}</span>
          <SkyIcon name="arrow" size={19} />
        </button>
        <p className="sky-submit-finality">
          <SkyIcon name="shield" size={14} />
          <span>
            Submission creates immutable package v{nextVersion}
            {currentVersion ? ` and preserves v${currentVersion}.` : '.'}
            {' '}Luna unlocks only after the package is saved.
          </span>
        </p>
      </SkyCard>
    </div>
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
      <div className="sky-luna-reference sky-review-reference-page sky-luna-reference-locked">
        <ReferenceReviewHeader
          title="Luna Debrief ✨"
          subtitle="Locked"
          caseId={activeCase.id}
          backLabel="Back to dashboard"
          onBack={() => navigate('dashboard')}
          icon="luna"
          luna
        />
        <SkyCard tone="pink" shape="shield" sparkle>
          <div className="sky-luna-locked-layout">
            <div className="sky-luna-locked-art">
              <img src="/assets/luna-anime-purple-v1.webp" alt="Luna" />
            </div>
            <div>
              <p className="sky-eyebrow">Luna is waiting</p>
              <h2>Submit before the debrief</h2>
              <p>Luna does not reveal the expected outcome until a valid learner package is frozen.</p>
              <button className="sky-button" type="button" onClick={() => navigate('submit')}>
                Go to submission
              </button>
            </div>
          </div>
        </SkyCard>
      </div>
    );
  }

  const outcomeHeadline = debrief.legacyHistory
    ? 'Legacy package history'
    : debrief.determinationMatched === true
      ? 'The decision and finding matched the scenario outcome'
      : debrief.determinationMatched === false
        ? 'Compare your package with what the case established'
        : 'Evidence-based package complete';
  const outcomeDescription = debrief.legacyHistory
    ? 'This historical package remains readable, but it does not reveal or grade scenario truth.'
    : debrief.truthReveal
      ? `${debrief.truthReveal.operationalDecision} · ${debrief.truthReveal.finalFinding}`
      : 'This case has no separate scenario truth to grade. Luna is coaching the quality of the submitted package.';
  const missedEvidence = debrief.missedEvidence ?? [];
  const reviewMissedEvidence = (item) => {
    if (item.tool === 'Case Briefing') {
      navigate('briefing');
      return;
    }
    if (!item.tool || item.tool === 'Investigation Tools') {
      navigate('workspace');
      return;
    }
    navigate('tool', { tool: item.tool });
  };

  return (
    <div className="sky-luna-reference sky-review-reference-page">
      <ReferenceReviewHeader
        title="Luna Debrief ✨"
        subtitle="Case complete"
        caseId={activeCase.id}
        backLabel="Back to submitted decision"
        onBack={() => navigate('submit')}
        icon="luna"
        luna
      />

      <section className="sky-luna-coach-hero sky-luna-debrief">
        <SkySparkles />
        <div className="sky-luna-coach-art">
          <img src="/assets/luna-anime-purple-v1.webp" alt="Luna, your AI coach" />
          <i aria-hidden="true">♥</i>
        </div>
        <div className="sky-luna-speech">
          <small>{debrief.scoreLabel} · {debrief.score}/100</small>
          <h2>{outcomeHeadline}</h2>
          <p>{debrief.coachIntro}</p>
        </div>
      </section>

      <SkyCard
        className="sky-luna-strength-card"
        shape="shield"
        sparkle
      >
        <header className="sky-luna-section-heading">
          <span aria-hidden="true"><SkyIcon name="check" size={21} /></span>
          <div>
            <small>Saved package strengths</small>
            <h2>What You Did Well</h2>
          </div>
          <StatusChip tone="mint">{debrief.strengths.length}</StatusChip>
        </header>
        <ul className="sky-luna-check-list">
          {debrief.strengths.map((item) => (
            <li key={item}><SkyIcon name="check" size={17} /><span>{item}</span></li>
          ))}
        </ul>
      </SkyCard>

      <SkyCard
        className="sky-luna-missed-card"
        tone="pink"
        shape="ribbon"
        sparkle
      >
        <header className="sky-luna-section-heading">
          <span aria-hidden="true"><SkyIcon name="alert" size={21} /></span>
          <div>
            <small>Evidence coverage</small>
            <h2>Evidence You Might Have Missed</h2>
          </div>
          <StatusChip tone="pink">{missedEvidence.length}</StatusChip>
        </header>
        {missedEvidence.length ? (
          <div className="sky-luna-missed-list">
            {missedEvidence.map((item) => (
              <article key={`${item.title}-${item.tool}`}>
                <span aria-hidden="true"><SkyIcon name="review" size={18} /></span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <small>{item.tool}</small>
                </div>
                <button
                  className="sky-button-secondary"
                  type="button"
                  onClick={() => reviewMissedEvidence(item)}
                  aria-label={`Review ${item.title} in ${item.tool}`}
                >
                  Review
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="sky-luna-clear">
            <SkyIcon name="check" size={19} />
            <span>No required evidence-focus gaps were detected in this saved package.</span>
          </div>
        )}
      </SkyCard>

      <SkyCard className="sky-luna-outcome-card" shape="shield">
        <header className="sky-luna-section-heading">
          <span aria-hidden="true"><SkyIcon name="shield" size={21} /></span>
          <div>
            <small>Scenario outcome</small>
            <h2>{outcomeHeadline}</h2>
          </div>
        </header>
        <p className="sky-luna-outcome-description">{outcomeDescription}</p>
        <DataList rows={[
          ['Submitted operational decision', debrief.submittedOperationalDecision],
          ['Operational decision match', debrief.operationalDecisionMatched === null ? 'Not graded' : debrief.operationalDecisionMatched ? 'Matched' : 'Review needed'],
          ['Submitted final finding', debrief.submittedFinalFinding],
          ['Final finding match', debrief.finalFindingMatched === null ? 'Not graded' : debrief.finalFindingMatched ? 'Matched' : 'Review needed'],
          ['Notes quality', debrief.notesQuality?.summary],
        ]} />
        {debrief.truthReveal ? (
          <details className="sky-luna-outcome-details">
            <summary>See what the case established</summary>
            <DataList rows={[
              ['Classification', debrief.truthReveal.classification],
              ['Accepted decisions', debrief.truthReveal.acceptedOperationalDecisions],
              ['Finding basis', debrief.truthReveal.findingBasis],
            ]} />
          </details>
        ) : (
          <p className="sky-luna-legacy-note">
            {debrief.legacyHistory
              ? 'Submit a current evidence-based package to unlock scenario-outcome coaching.'
              : 'Luna is coaching the evidence package without inventing an expected outcome.'}
          </p>
        )}
      </SkyCard>

      <div className="sky-luna-coaching-pair">
        <SkyCard
          className="sky-luna-tip-card"
          shape="shield"
          sparkle
        >
          <header className="sky-luna-section-heading">
            <span aria-hidden="true"><SkyIcon name="shield" size={21} /></span>
            <div>
              <small>{debrief.theme}</small>
              <h2>Investigation Tip from Luna</h2>
            </div>
          </header>
          <p>{debrief.riskTip}</p>
        </SkyCard>

        <SkyCard
          className="sky-luna-motivation-card"
          tone="pink"
          shape="ribbon"
          sparkle
        >
          <SkyCharm name="quote" className="sky-luna-quote-charm" />
          <header className="sky-luna-section-heading">
            <span aria-hidden="true"><SkyIcon name="sparkle" size={21} /></span>
            <div>
              <small>Keep investigating</small>
              <h2>Luna’s Motivation</h2>
            </div>
          </header>
          <blockquote>“{debrief.motivation}”</blockquote>
        </SkyCard>
      </div>

      <details className="sky-luna-breakdown">
        <summary>Coaching breakdown</summary>
        <div className="sky-metric-grid">
          {debrief.breakdown.map((item) => (
            <div className="sky-metric" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.points}</strong>
              <small>{item.value}</small>
            </div>
          ))}
        </div>
        <ul className="sky-luna-followups">
          {debrief.followUps.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </details>

      <div className="sky-luna-actions">
        <button className="sky-button" type="button" onClick={() => navigate('workspace')}>
          Back to Workspace
        </button>
        <button className="sky-button-secondary" type="button" onClick={() => navigate('report')}>
          Open case report →
        </button>
      </div>
    </div>
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
