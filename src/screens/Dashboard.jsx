import { publicCaseSummary } from '../data/publicCaseView.js';
import { SkyCard, SectionHeading, StatusChip } from '../components/SkyPrimitives.jsx';

function reviewedCount(completedTools = []) {
  return completedTools.filter((tool) => !['Case Briefing', 'Submit Decision'].includes(tool)).length;
}

export default function Dashboard({
  activeCase,
  cases,
  completedTools,
  tray,
  latestPackage,
  navigate,
}) {
  const progress = Math.min(100, Math.round((completedTools.length / 8) * 100));
  const openCases = cases.filter((item) => !/complete|closed/i.test(item.status ?? '')).length;
  const briefingComplete = completedTools.includes('Case Briefing');
  const summaryComplete = completedTools.includes('Investigation Summary');
  const indicatorsComplete = completedTools.includes('Case Indicators Review');
  const determinationComplete = completedTools.includes('Determination');
  const nextWorkflow = !briefingComplete
    ? { route: 'briefing', label: `Review ${activeCase.id} briefing` }
    : !summaryComplete
      ? { route: 'workspace', label: `Continue ${activeCase.id} investigation` }
      : !indicatorsComplete
        ? { route: 'indicators', label: 'Complete case indicators' }
        : !determinationComplete
          ? { route: 'determination', label: 'Complete determination' }
          : !latestPackage
            ? { route: 'submit', label: 'Review submission' }
            : { route: 'luna', label: 'Open Luna debrief' };
  const summaryRoute = briefingComplete ? 'summary' : 'briefing';
  const indicatorsRoute = !briefingComplete
    ? 'briefing'
    : summaryComplete
      ? 'indicators'
      : 'summary';

  return (
    <>
      <SkyCard className="sky-hero" tone="pink">
        <div className="sky-hero-copy">
          <span className="sky-charm sky-charm-bow" aria-hidden="true">🎀</span>
          <p className="sky-eyebrow">Evidence First</p>
          <h1>Good morning — let’s investigate with clarity ✨</h1>
          <p>
            Every record you connect makes the final decision easier to explain.
            Luna waits until after submission before revealing any coaching answer.
          </p>
          <div className="sky-action-row">
            <button className="sky-button" type="button" onClick={() => navigate(nextWorkflow.route)}>
              {nextWorkflow.label}
            </button>
            <button className="sky-button-secondary" type="button" onClick={() => navigate('cases')}>
              Open case queue
            </button>
          </div>
        </div>
        <div className="sky-luna sky-hero-luna">
          <div className="sky-luna-art">
            <img src="/assets/luna-sky-vector-v1.svg" alt="Luna, the Fraud Bloom assistant" />
          </div>
          <div>
            <strong>Luna ✨</strong>
            <span>Your post-submission coach</span>
          </div>
        </div>
      </SkyCard>

      <div className="sky-dashboard-metrics">
        <button className="sky-dashboard-tile" type="button" onClick={() => navigate('cases')}>
          <span className="sky-tile-icon">▣</span>
          <small>Active cases</small>
          <strong>{openCases}</strong>
          <em>Open queue</em>
        </button>
        <button
          className="sky-dashboard-tile"
          data-tone="pink"
          type="button"
          onClick={() => navigate(briefingComplete ? 'workspace' : 'briefing')}
        >
          <span className="sky-tile-icon">✦</span>
          <small>Tools reviewed</small>
          <strong>{reviewedCount(completedTools)}</strong>
          <em>Current case</em>
        </button>
        <button className="sky-dashboard-tile" type="button" onClick={() => navigate(summaryRoute)}>
          <span className="sky-tile-icon">◇</span>
          <small>Saved evidence</small>
          <strong>{tray.length}</strong>
          <em>View progress</em>
        </button>
      </div>

      <div className="sky-grid">
        <SkyCard className="span-8">
          <SectionHeading
            eyebrow="Active case"
            title={activeCase.id}
            description={publicCaseSummary(activeCase)}
            action={<StatusChip tone="pink">{activeCase.status ?? 'In review'}</StatusChip>}
          />
          <div className="sky-case-progress">
            <div>
              <strong>{progress}%</strong>
              <span>Workspace progress</span>
            </div>
            <div className="sky-progress-track" aria-label={`${progress}% complete`}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="sky-action-row">
            <button
              className="sky-button"
              type="button"
              onClick={() => navigate(briefingComplete ? 'workspace' : 'briefing')}
            >
              {briefingComplete ? 'Open workspace' : 'Review briefing first'}
            </button>
            <button className="sky-button-secondary" type="button" onClick={() => navigate(indicatorsRoute)}>
              {summaryComplete ? 'Review indicators' : briefingComplete ? 'Review summary first' : 'Review briefing first'}
            </button>
          </div>
        </SkyCard>

        <SkyCard className="span-4" tone="pink">
          <SectionHeading
            eyebrow="Academy progress"
            title="Evidence First"
            description="Complete the required review stages in order; open only the investigation tools the case needs."
          />
          <div className="sky-academy-orbit">
            <strong>{progress}%</strong>
          </div>
          <p>{completedTools.length} workspace stage{completedTools.length === 1 ? '' : 's'} reviewed.</p>
        </SkyCard>

        <SkyCard className="span-6">
          <SectionHeading
            eyebrow="Agent panel"
            title="Luna is ready when you are"
            description={latestPackage
              ? 'Your frozen package is ready for a post-submission debrief.'
              : 'Investigate first. Luna will not reveal the expected answer before submission.'}
          />
          <div className="sky-agent-panel">
            <img src="/assets/luna-sky-vector-v1.svg" alt="" aria-hidden="true" />
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => navigate(latestPackage ? 'luna' : nextWorkflow.route)}
            >
              {latestPackage ? 'Open Luna debrief' : nextWorkflow.label}
            </button>
          </div>
        </SkyCard>

        <SkyCard className="span-6" tone="pink">
          <span className="sky-charm sky-charm-quote" aria-hidden="true">❝</span>
          <SectionHeading
            eyebrow="Case practice"
            title="“Fraud is clever, but so are we.”"
            description="A strong result connects exact records to a clear rationale."
          />
          <button className="sky-button-secondary" type="button" onClick={() => navigate('report')} disabled={!latestPackage}>
            {latestPackage ? 'Open case report' : 'Report unlocks after submit'}
          </button>
        </SkyCard>
      </div>
    </>
  );
}
