import { publicCaseSummary } from '../data/publicCaseView.js';
import { getWorkspaceProgress } from '../data/workspaceProgress.js';
import {
  SkyCard,
  SkyCharm,
  SkyIcon,
  SkyProgressRing,
  StatusChip,
} from '../components/SkyPrimitives.jsx';

function DashboardMetric({
  icon,
  label,
  value,
  suffix,
  detail,
  tone,
  progress,
  onClick,
}) {
  return (
    <button
      className="sky-dashboard-tile"
      data-tone={tone}
      type="button"
      onClick={onClick}
    >
      <span className="sky-tile-heading">
        <span className="sky-tile-icon" aria-hidden="true"><SkyIcon name={icon} size={19} /></span>
        <small>{label}</small>
      </span>
      {progress === undefined ? (
        <span className="sky-tile-value">
          <strong>{value}</strong>
          {suffix ? <span>{suffix}</span> : null}
        </span>
      ) : (
        <SkyProgressRing value={progress} label="Workspace" size="micro" />
      )}
      <em>{detail}</em>
      <span className="sky-tile-arrow" aria-hidden="true"><SkyIcon name="arrow" size={17} /></span>
    </button>
  );
}

function AcademyStat({ icon, value, label }) {
  return (
    <div className="sky-academy-stat">
      <SkyIcon name={icon} size={20} />
      <span><strong>{value}</strong><small>{label}</small></span>
    </div>
  );
}

export default function Dashboard({
  activeCase,
  cases,
  completedTools,
  tray,
  latestPackage,
  navigate,
}) {
  const {
    reviewed: reviewedTools,
    percent: progress,
  } = getWorkspaceProgress(activeCase, completedTools);
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
  return (
    <div className="sky-dashboard">
      <SkyCard
        className="sky-hero"
        tone="pink"
        shape="ribbon"
        sparkle
        charm={<SkyCharm name="bow" />}
      >
        <div className="sky-hero-copy">
          <p className="sky-eyebrow">Evidence First · Good morning, investigator</p>
          <h1>Let’s stop fraud with evidence ✨</h1>
          <p className="sky-hero-promise">
            <span aria-hidden="true">♥</span>
            Every case you solve helps build a safer world.
          </p>
        </div>
        <div className="sky-hero-luna">
          <div className="sky-luna-art sky-luna-orbit">
            <img src="/assets/luna-sky-vector-v1.svg" alt="Luna, the Fraud Bloom assistant" />
            <span className="sky-luna-heart" aria-hidden="true">♥</span>
          </div>
          <div>
            <strong>Luna ✨</strong>
            <span>AI assistant</span>
          </div>
        </div>
      </SkyCard>

      <div className="sky-dashboard-metrics">
        <DashboardMetric
          icon="cases"
          label="Active cases"
          value={openCases}
          suffix="cases"
          detail="Open queue"
          onClick={() => navigate('cases')}
        />
        <DashboardMetric
          icon="check"
          label="Tools reviewed"
          value={reviewedTools}
          detail="Current case"
          tone="pink"
          onClick={() => navigate(briefingComplete ? 'workspace' : 'briefing')}
        />
        <DashboardMetric
          icon="workspace"
          label="Workspace progress"
          progress={progress}
          detail={`${reviewedTools} tools reviewed`}
          onClick={() => navigate(briefingComplete ? 'workspace' : 'briefing')}
        />
      </div>

      <SkyCard className="sky-dashboard-academy" shape="shield" sparkle>
        <div className="sky-academy-layout">
          <div className="sky-academy-badge" aria-hidden="true">
            <SkyIcon name="shield" size={44} />
            <span>✦</span>
          </div>
          <div className="sky-academy-copy">
            <div className="sky-academy-heading">
              <div>
                <p className="sky-eyebrow">Academy progress</p>
                <h2>{activeCase.id}</h2>
                <span>{publicCaseSummary(activeCase)}</span>
              </div>
              <StatusChip tone="pink">{activeCase.status ?? 'In review'}</StatusChip>
            </div>
            <div className="sky-progress-track" aria-label={`${progress}% complete`}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="sky-academy-stats">
              <AcademyStat icon="workspace" value={reviewedTools} label="Tools" />
              <AcademyStat icon="evidence" value={tray.length} label="Evidence" />
              <AcademyStat icon="report" value={latestPackage ? 1 : 0} label="Packages" />
            </div>
          </div>
          <div className="sky-academy-action">
            <button
              className="sky-icon-button"
              type="button"
              onClick={() => navigate(nextWorkflow.route)}
              aria-label={nextWorkflow.label}
            >
              <SkyIcon name="arrow" size={20} />
            </button>
          </div>
        </div>
      </SkyCard>

      <div className="sky-dashboard-lower">
        <SkyCard className="sky-agent-card" shape="notched" sparkle>
          <div className="sky-agent-card-heading">
            <div>
              <p className="sky-eyebrow">Agent panel</p>
              <h2>Luna</h2>
            </div>
            <StatusChip tone={latestPackage ? undefined : 'pink'}>
              {latestPackage ? 'Debrief ready' : 'After submission'}
            </StatusChip>
          </div>
          <div className="sky-agent-panel">
            <img src="/assets/luna-sky-vector-v1.svg" alt="" aria-hidden="true" />
            <div>
              <p>
                {latestPackage
                  ? 'Your frozen package is ready for evidence-based coaching.'
                  : 'Finish the investigation first. Luna will not reveal the answer early.'}
              </p>
              <button
                className="sky-button-secondary sky-agent-action"
                type="button"
                onClick={() => navigate(latestPackage ? 'luna' : nextWorkflow.route)}
              >
                <SkyIcon name="sparkle" size={18} />
                <span>{latestPackage ? 'Open Luna debrief' : nextWorkflow.label}</span>
              </button>
            </div>
          </div>
        </SkyCard>

        <SkyCard
          className="sky-quote-card"
          tone="pink"
          shape="ribbon"
          sparkle
          charm={<SkyCharm name="quote" />}
        >
          <p className="sky-eyebrow">Case practice</p>
          <blockquote>“Fraud is clever,<br />but so are we.”</blockquote>
          <p>A strong result connects exact records to a clear rationale.</p>
          <button
            className="sky-button-secondary sky-quote-action"
            type="button"
            onClick={() => navigate('report')}
            disabled={!latestPackage}
          >
            <span>{latestPackage ? 'Open case report' : 'Unlocks after submit'}</span>
            <SkyIcon name="arrow" size={17} />
          </button>
        </SkyCard>
      </div>
    </div>
  );
}
