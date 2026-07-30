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
          <img src="/assets/luna-sky-vector-v1.svg" alt="Luna" />
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
          <img src="/assets/luna-sky-vector-v1.svg" alt="" />
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
          No risk color, weight, score, or correct response is shown. Expand each row to make your own assessment.
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
      <