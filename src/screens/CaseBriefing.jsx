import {
  publicAlertReason,
  publicCaseFacts,
  publicReportedAllegation,
} from '../data/publicCaseView.js';
import {
  EvidenceActions,
  SkyCard,
  SkyIcon,
  StatusChip,
} from '../components/SkyPrimitives.jsx';

function availableDocument(document = {}) {
  return /available|received/i.test(document.status ?? '');
}

function BriefingFact({
  icon,
  label,
  value,
  meta,
  tone,
}) {
  return (
    <article className="sky-briefing-fact" data-tone={tone}>
      <span className="sky-briefing-fact-icon" aria-hidden="true">
        <SkyIcon name={icon} size={22} />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value || 'Not supplied'}</strong>
        {meta ? <em>{meta}</em> : null}
      </span>
    </article>
  );
}

function QuickFact({ icon, label, value }) {
  return (
    <div className="sky-briefing-quick-row">
      <SkyIcon name={icon} size={20} />
      <span><small>{label}</small><strong>{value || 'Not supplied'}</strong></span>
    </div>
  );
}

export default function CaseBriefing({
  activeCase,
  completedTools,
  pinEvidence,
  saveNote,
  markReviewed,
  navigate,
}) {
  const documents = activeCase.documents ?? [];
  const parties = activeCase.parties ?? [];
  const briefingReviewed = completedTools.includes('Case Briefing');
  const receivedDocuments = documents.filter(availableDocument).length;
  const publicFacts = new Map(publicCaseFacts(activeCase));
  const timingMeta = [
    publicFacts.get('Reported / opened'),
    publicFacts.get('Issue start') && `Issue start: ${publicFacts.get('Issue start')}`,
  ].filter(Boolean).join(' · ');

  const allegationFacts = [
    {
      icon: 'user',
      label: 'Customer',
      value: activeCase.person,
      meta: [publicFacts.get('Customer type'), publicFacts.get('Product')].filter(Boolean).join(' · '),
    },
    {
      icon: 'amount',
      label: 'Amount / exposure',
      value: publicFacts.get('Amount / exposure'),
      meta: timingMeta,
    },
    {
      icon: 'alert',
      label: 'Reported issue',
      value: publicFacts.get('Alert reason'),
      meta: publicFacts.get('Review workflow'),
      tone: 'pink',
    },
    {
      icon: 'channel',
      label: 'Channel',
      value: publicFacts.get('Intake channel'),
      meta: activeCase.intake?.statedDevice,
    },
  ];

  return (
    <div className="sky-briefing">
      <SkyCard className="sky-case-banner" shape="shield">
        <div className="sky-case-banner-layout">
          <span className="sky-case-shield sky-case-shield-large" aria-hidden="true">
            <SkyIcon name="shield" size={34} />
          </span>
          <div className="sky-case-banner-copy">
            <div>
              <h1>{activeCase.id}</h1>
              <StatusChip tone="pink">Active case</StatusChip>
            </div>
            <p>
              <span>{publicFacts.get('Review workflow')}</span>
              <i aria-hidden="true">•</i>
              <span>{publicAlertReason(activeCase)}</span>
            </p>
          </div>
        </div>
      </SkyCard>

      <SkyCard
        className="sky-briefing-allegation"
        tone="pink"
        shape="ribbon"
        sparkle
      >
        <header className="sky-briefing-card-title">
          <span aria-hidden="true"><SkyIcon name="evidence" size={23} /></span>
          <div>
            <h2>Allegation Summary</h2>
            <small>This is the intake allegation, not a finding.</small>
          </div>
        </header>
        <p className="sky-lead">{publicReportedAllegation(activeCase)}</p>
        <div className="sky-briefing-facts">
          {allegationFacts.map((fact) => <BriefingFact key={fact.label} {...fact} />)}
        </div>
      </SkyCard>

      <div className="sky-briefing-lower">
        <SkyCard className="sky-briefing-quick" shape="notched">
          <header className="sky-briefing-list-title">
            <h2>Quick Facts</h2>
            <SkyIcon name="sparkle" size={18} />
          </header>
          <div className="sky-briefing-quick-list">
            <QuickFact icon="user" label="Customer" value={activeCase.person} />
            <QuickFact icon="hash" label="Training ID" value={activeCase.trainingId} />
            <QuickFact icon="payment" label="Account ID" value={activeCase.accountId} />
            <QuickFact icon="calendar" label="Contact time" value={activeCase.intake?.contactTime} />
            <QuickFact icon="channel" label="Stated device" value={activeCase.intake?.statedDevice} />
          </div>
          {parties.length ? (
            <details className="sky-briefing-parties-disclosure">
              <summary>Recorded parties ({parties.length})</summary>
              <div className="sky-briefing-parties">
                {parties.map((party) => (
                  <article key={party.id}>
                    <small>{party.role}</small>
                    <strong>{party.name}</strong>
                    <span>{party.relationship}</span>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </SkyCard>

        <SkyCard className="sky-briefing-evidence" tone="pink" shape="ribbon" sparkle>
          <header className="sky-briefing-list-title">
            <h2>Evidence Checklist</h2>
            <strong>{receivedDocuments} / {documents.length}</strong>
          </header>
          <ul className="sky-document-checklist">
            {documents.length ? documents.map((document) => (
              <li key={document.id} data-complete={availableDocument(document)}>
                <span aria-hidden="true">
                  <SkyIcon name={availableDocument(document) ? 'check' : 'review'} size={18} />
                </span>
                <span>
                  <strong>{document.title ?? document.name}</strong>
                  <small>{document.status} · {document.detail}</small>
                </span>
              </li>
            )) : (
              <li className="sky-document-empty">
                <span aria-hidden="true"><SkyIcon name="review" size={18} /></span>
                <span><strong>No intake documents</strong><small>Open the document workspace to request evidence.</small></span>
              </li>
            )}
          </ul>
          <button
            className="sky-button-secondary sky-document-action"
            type="button"
            onClick={() => navigate('tool', { tool: 'Document Viewer' })}
          >
            <SkyIcon name="evidence" size={17} />
            <span>Open document workspace</span>
          </button>
        </SkyCard>
      </div>

      <SkyCard className="sky-briefing-completion" shape="ribbon">
        <button
          className="sky-button sky-open-workspace"
          type="button"
          onClick={() => {
            markReviewed('Case Briefing');
            navigate('workspace');
          }}
        >
          <span>Open workspace</span>
          <span aria-hidden="true"><SkyIcon name="arrow" size={20} /></span>
        </button>

        <details className="sky-briefing-actions">
          <summary>
            <span><SkyIcon name="evidence" size={18} /> Briefing notes &amp; evidence</span>
            <small>{briefingReviewed ? 'Reviewed' : 'Optional actions'}</small>
          </summary>
          <EvidenceActions
            tool="Case Briefing"
            record={{
              id: activeCase.id,
              label: `${activeCase.id} intake briefing`,
              detail: publicAlertReason(activeCase),
            }}
            onPin={pinEvidence}
            onSaveNote={saveNote}
            onMarkReviewed={markReviewed}
            reviewed={briefingReviewed}
          />
        </details>
      </SkyCard>
    </div>
  );
}
