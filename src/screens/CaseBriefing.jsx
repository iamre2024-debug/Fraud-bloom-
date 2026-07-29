import {
  publicAlertReason,
  publicCaseFacts,
  publicReportedAllegation,
} from '../data/publicCaseView.js';
import {
  DataList,
  EvidenceActions,
  SectionHeading,
  SkyCard,
  StatusChip,
} from '../components/SkyPrimitives.jsx';

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

  return (
    <>
      <SkyCard className="sky-case-banner">
        <div className="sky-case-banner-layout">
          <span className="sky-case-shield sky-case-shield-large" aria-hidden="true">✦</span>
          <div>
            <p className="sky-eyebrow">Case briefing</p>
            <h1>{activeCase.id}</h1>
            <p>{publicAlertReason(activeCase)}</p>
          </div>
          <StatusChip tone="pink">Active case</StatusChip>
        </div>
      </SkyCard>

      <div className="sky-grid sky-briefing-grid">
        <SkyCard className="span-12" tone="pink">
          <SectionHeading
            eyebrow="Allegation summary"
            title="What was reported"
            description="This is the intake allegation, not a finding."
          />
          <p className="sky-lead">{publicReportedAllegation(activeCase)}</p>
          <div className="sky-briefing-facts">
            {publicCaseFacts(activeCase).map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </SkyCard>

        <SkyCard className="span-7">
          <SectionHeading
            eyebrow="Quick facts"
            title="Case context"
            description="Facts available at intake."
          />
          <DataList rows={[
            ['Customer', activeCase.person],
            ['Training ID', activeCase.trainingId],
            ['Account ID', activeCase.accountId],
            ['Channel', activeCase.intake?.channel],
            ['Contact time', activeCase.intake?.contactTime],
            ['Stated device', activeCase.intake?.statedDevice],
          ]} />
          {parties.length ? (
            <>
              <h3 className="sky-subheading">Recorded parties</h3>
              <div className="sky-briefing-parties">
                {parties.map((party) => (
                  <article key={party.id}>
                    <small>{party.role}</small>
                    <strong>{party.name}</strong>
                    <span>{party.relationship}</span>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </SkyCard>

        <SkyCard className="span-5" tone="pink">
          <SectionHeading
            eyebrow="Evidence checklist"
            title={`${documents.length} intake document${documents.length === 1 ? '' : 's'}`}
            description="Open the document workspace to inspect or request evidence."
          />
          <ul className="sky-document-checklist">
            {documents.map((document) => (
              <li key={document.id}>
                <span aria-hidden="true">{/available|received/i.test(document.status) ? '✓' : '○'}</span>
                <span>
                  <strong>{document.title ?? document.name}</strong>
                  <small>{document.status} · {document.detail}</small>
                </span>
              </li>
            ))}
          </ul>
          <button
            className="sky-button-secondary"
            type="button"
            onClick={() => navigate('tool', { tool: 'Document Viewer' })}
          >
            Open document workspace
          </button>
        </SkyCard>
      </div>

      <SkyCard>
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
        <div className="sky-next-action">
          <span>When the intake is clear, begin the investigation.</span>
          <button
            className="sky-button"
            type="button"
            onClick={() => {
              markReviewed('Case Briefing');
              navigate('workspace');
            }}
          >
            Open workspace →
          </button>
        </div>
      </SkyCard>
    </>
  );
}
