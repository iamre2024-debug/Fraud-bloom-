const primaryNavigation = [
  { name: 'dashboard', icon: '⌂', label: 'Home' },
  { name: 'cases', icon: '▣', label: 'Cases' },
  { name: 'workspace', icon: '⌘', label: 'Workspace' },
  { name: 'indicators', icon: '◇', label: 'Review' },
  { name: 'luna', icon: '✦', label: 'Luna' },
  { name: 'report', icon: '▤', label: 'Report' },
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
  const workflowCompletedTools = completedTools.length
    ? completedTools
    : activeCase?.workflowCompletedTools ?? [];
  const workspaceLock = stageLock('workspace', workflowCompletedTools, latestPackage);
  return (
    <div className="sky-app">
      <div className="sky-shell">
        <header className="sky-header">
          <button
            type="button"
            className="sky-brand sky-brand-button"
            onClick={() => navigate('dashboard')}
            aria-label="Open Fraud Bloom dashboard"
          >
            <span className="sky-brand-mark" aria-hidden="true" />
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
            aria-label={workspaceLock.locked ? 'Complete the case briefing to open the workspace' : 'Open workspace'}
            onClick={() => !workspaceLock.locked && navigate('workspace')}
            disabled={workspaceLock.locked}
          >
            ✦
          </button>
        </header>

        {activeCase?.id && activeName !== 'dashboard' ? (
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
              aria-current={activeName === item.name ? 'page' : undefined}
              onClick={() => !lock.locked && navigate(item.name)}
              disabled={lock.locked}
              title={lock.locked ? lock.message : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <strong>{item.label}</strong>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
