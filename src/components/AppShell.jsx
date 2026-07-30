import { SkyIcon } from './SkyPrimitives.jsx';
import { canonicalToolName } from '../investigationToolGroups.js';

const primaryNavigation = [
  { name: 'dashboard', icon: 'home', label: 'Home' },
  { name: 'cases', icon: 'cases', label: 'Cases' },
  { name: 'workspace', icon: 'workspace', label: 'Workspace' },
  { name: 'indicators', icon: 'review', label: 'Review' },
  { name: 'luna', icon: 'luna', label: 'Luna' },
  { name: 'report', icon: 'report', label: 'Report' },
];

const workflowStages = [
  { name: 'cases', label: 'Queue' },
  { name: 'briefing', label: 'Briefing' },
  { name: 'workspace', label: 'Tools' },
  { name: 'summary', label: 'Summary' },
  { name: 'indicators', label: 'Indicators' },
  { name: 'determination', label: 'Determine' },
  { name: 'submit', label: 'Submit' },
  { name: 'luna', label: 'Luna' },
  { name: 'report', label: 'Report' },
];

function routeFamily(route = {}) {
  if (route.name === 'tool') return 'workspace';
  return route.name;
}

function primaryRouteFamily(route = {}) {
  if (route.name === 'briefing' || route.name === 'cases') return 'cases';
  if (['tool', 'workspace', 'summary'].includes(route.name)) return 'workspace';
  if (['indicators', 'determination', 'submit'].includes(route.name)) return 'indicators';
  return route.name;
}

const pageTitles = {
  cases: 'Case Queue',
  briefing: 'Case Briefing',
  workspace: 'Workspace',
  summary: 'Investigation Summary',
  indicators: 'Case Indicators',
  determination: 'Determination',
  submit: 'Submit Decision',
  luna: 'Luna Debrief',
  report: 'Case Report',
};

const backRoutes = {
  cases: 'dashboard',
  briefing: 'cases',
  workspace: 'briefing',
  summary: 'workspace',
  indicators: 'summary',
  determination: 'indicators',
  submit: 'determination',
  luna: 'dashboard',
  report: 'luna',
};

const orderedWorkflowRequirements = [
  { completion: 'Case Briefing', message: 'After briefing' },
  { completion: 'Investigation Summary', message: 'After summary' },
  { completion: 'Case Indicators Review', message: 'After indicators' },
  { completion: 'Determination', message: 'After determination' },
];

function stageLock(stageName, completedTools, latestPackage) {
  const completed = new Set(completedTools);
  if (stageName === 'workspace' || stageName === 'summary') {
    return completed.has('Case Briefing')
      ? { locked: false, message: '' }
      : { locked: true, message: 'After briefing' };
  }
  if (stageName === 'indicators') {
    return completed.has('Investigation Summary')
      ? { locked: false, message: '' }
      : { locked: true, message: 'After summary' };
  }
  if (stageName === 'determination') {
    return completed.has('Case Indicators Review')
      ? { locked: false, message: '' }
      : { locked: true, message: 'After indicators' };
  }
  if (stageName === 'submit') {
    const missing = orderedWorkflowRequirements.find(({ completion }) => !completed.has(completion));
    return missing
      ? { locked: true, message: missing.message }
      : { locked: false, message: '' };
  }
  if (stageName === 'luna' || stageName === 'report') {
    return latestPackage
      ? { locked: false, message: '' }
      : { locked: true, message: 'After submission' };
  }
  return { locked: false, message: '' };
}

export default function AppShell({
  activeCase,
  route,
  navigate,
  latestPackage,
  completedTools = [],
  children,
}) {
  const activeName = routeFamily(route);
  const primaryActiveName = primaryRouteFamily(route);
  const isDashboard = activeName === 'dashboard';
  const isReviewRoute = ['indicators', 'determination'].includes(route.name);
  const isReferenceStructuredScreen = ['cases', 'workspace', 'submit', 'luna'].includes(route.name);
  const routeToolName = route.name === 'tool'
    ? canonicalToolName(route.tool)
    : route.tool;
  const isReferenceStructuredTool = route.name === 'tool' && [
    'Financial Investigation',
    'Payment Verification',
    'Link Analysis',
    'System Access Lane',
    'Timeline',
    'Merchant Intelligence',
    'Document Viewer',
    'Document Request',
    'Transaction History',
    'Payroll History',
    'Customer 360',
    'Identity Intel / People Search',
    'Business 360',
    'Employee Profile',
    'Login History',
    'Session History',
    'Device Intelligence',
    'IP Intelligence',
  ].includes(routeToolName);
  const toolPageTitle = routeToolName === 'Financial Investigation'
    ? 'Financial Intelligence'
    : routeToolName === 'Identity Intel / People Search'
      ? 'Identity Intelligence'
      : routeToolName === 'Business 360'
        ? 'Business Intelligence'
        : routeToolName;
  const pageTitle = route.name === 'tool'
    ? toolPageTitle || 'Investigation Tool'
    : isReviewRoute && activeCase?.id
      ? `Case ${activeCase.id}`
      : pageTitles[route.name] || 'Fraud Bloom';
  const pageSubtitle = isReviewRoute
    ? 'Active'
    : activeCase?.id ?? 'Select a case';
  const backRoute = route.name === 'tool'
    ? 'workspace'
    : backRoutes[route.name] || 'dashboard';
  const workflowCompletedTools = completedTools.length
    ? completedTools
    : activeCase?.workflowCompletedTools ?? [];
  const workspaceLock = stageLock('workspace', workflowCompletedTools, latestPackage);
  return (
    <div
      className="sky-app"
      data-route={route.name}
      data-tool={route.name === 'tool' ? routeToolName : undefined}
      data-reference-screen={isReferenceStructuredScreen || undefined}
    >
      <div className="sky-shell">
        {!isReferenceStructuredScreen ? (
          <header
            className="sky-header"
            data-context={isDashboard ? 'dashboard' : 'page'}
            data-reference-tool={isReferenceStructuredTool || undefined}
          >
            {isDashboard ? (
              <>
                <button
                  type="button"
                  className="sky-brand sky-brand-button"
                  onClick={() => navigate('dashboard')}
                  aria-label="Open Fraud Bloom dashboard"
                >
                  <span className="sky-brand-mark" aria-hidden="true">
                    <SkyIcon name="shield" size={32} />
                    <span className="sky-brand-star">✦</span>
                  </span>
                  <span>
                    <strong>Fraud Bloom <em>v1</em></strong>
                    <small>Investigate. Learn. Prevent.</small>
                  </span>
                </button>
                <div className="sky-header-case">
                  <strong>{activeCase?.id ?? 'Select a case'}</strong>
                  <span>{activeCase?.person ?? 'Case workspace'}</span>
                </div>
                <button
                  type="button"
                  className="sky-icon-button"
                  aria-label="Open case queue"
                  onClick={() => navigate('cases')}
                >
                  <SkyIcon name="cases" size={21} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="sky-icon-button sky-page-back"
                  aria-label={`Back to ${pageTitles[backRoute] || 'previous screen'}`}
                  onClick={() => navigate(backRoute)}
                >
                  <SkyIcon name="back" size={22} />
                </button>
                <div className="sky-page-title" data-case-context={isReviewRoute || undefined}>
                  <strong>{pageTitle}</strong>
                  <span>{pageSubtitle}</span>
                </div>
                {workspaceLock.locked ? (
                  <span className="sky-page-slot" aria-hidden="true" />
                ) : (
                  <button
                    type="button"
                    className="sky-icon-button sky-page-workspace"
                    aria-label="Open workspace"
                    onClick={() => navigate('workspace')}
                  >
                    <SkyIcon name="workspace" size={20} />
                  </button>
                )}
              </>
            )}
          </header>
        ) : null}

        {!isReferenceStructuredScreen && activeCase?.id && activeName !== 'dashboard' ? (
          <nav className="sky-workflow-shell" aria-label="Case workflow">
            <div className="sky-workflow">
              {workflowStages.map((stage, index) => {
                const lock = stageLock(stage.name, workflowCompletedTools, latestPackage);
                return (
                  <button
                    type="button"
                    className="sky-stage"
                    key={stage.name}
                    aria-current={activeName === stage.name ? 'step' : undefined}
                    onClick={() => !lock.locked && navigate(stage.name)}
                    disabled={lock.locked}
                  >
                    <strong>{index + 1}. {stage.label}</strong>
                    <small>{lock.locked ? lock.message : activeName === stage.name ? 'Current' : 'Open'}</small>
                  </button>
                );
              })}
            </div>
          </nav>
        ) : null}

        <main className="sky-main">{children}</main>
      </div>

      <nav className="sky-bottom-nav" aria-label="Primary navigation">
        {primaryNavigation.map((item) => {
          const lock = stageLock(item.name, workflowCompletedTools, latestPackage);
          return (
            <button
              type="button"
              className="sky-nav-button"
              key={item.name}
              aria-current={primaryActiveName === item.name ? 'page' : undefined}
              onClick={() => !lock.locked && navigate(item.name)}
              disabled={lock.locked}
              title={lock.locked ? lock.message : undefined}
            >
              <span className="sky-nav-icon" aria-hidden="true">
                <SkyIcon name={item.icon} size={21} />
                {item.name === 'luna' && latestPackage ? <i className="sky-nav-dot" /> : null}
              </span>
              <strong>{item.label}</strong>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
