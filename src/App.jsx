import { useEffect, useState } from 'react';
import { useWorkspaceState } from './app/useWorkspaceState.js';
import AppShell from './components/AppShell.jsx';
import QuickPad from './components/QuickPad.jsx';
import { SectionHeading, SkyCard } from './components/SkyPrimitives.jsx';
import Dashboard from './screens/Dashboard.jsx';
import CaseQueue from './screens/CaseQueue.jsx';
import CaseBriefing from './screens/CaseBriefing.jsx';
import Workspace from './screens/Workspace.jsx';
import {
  CaseReport,
  Determination,
  IndicatorsReview,
  InvestigationSummary,
  LunaDebrief,
  SubmitDecision,
} from './screens/ReviewWorkflow.jsx';
import IdentityDigitalTools, {
  isIdentityDigitalTool,
} from './tools/IdentityDigitalTools.jsx';
import FinancialBusinessToolRouter, {
  resolveFinancialBusinessTool,
} from './tools/FinancialBusinessTools.jsx';
import {
  SupportToolRouter,
  supportToolNames,
} from './tools/SupportTools.jsx';
import { canonicalToolName } from './investigationToolGroups.js';

function ToolWorkspace({ state }) {
  const {
    route,
    activeCase,
    cases,
    documentRequests,
    setDocumentRequests,
    pinEvidence,
    saveNote,
    markReviewed,
    completedTools,
    recordAction,
    tray,
    quickPad,
    setQuickPad,
    navigate,
  } = state;
  const toolName = canonicalToolName(route.tool);
  const isReferenceStructuredTool = [
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
  ].includes(toolName);
  const toolIsAvailable = !Array.isArray(activeCase.availableTools)
    || activeCase.availableTools.map(canonicalToolName).includes(toolName);
  const [query, setQuery] = useState(route.query ?? '');

  useEffect(() => {
    setQuery(route.query ?? '');
  }, [route.query, toolName]);

  function openTool(target, options = {}) {
    if (!target) return;
    if (typeof target === 'object') {
      navigate('tool', {
        tool: target.targetTool ?? target.tool ?? target.toolName,
        query: target.query ?? target.identifier ?? '',
        initialPayload: target.payload,
        sourceTool: target.sourceTool,
        sourceRecordId: target.sourceRecordId,
      });
      return;
    }
    navigate('tool', {
      tool: target,
      query: options.query ?? options.identifier ?? '',
      initialPayload: options.payload,
      sourceTool: options.sourceTool,
      sourceRecordId: options.sourceRecordId,
    });
  }

  const sharedProps = {
    activeCase,
    cases,
    query,
    initialQuery: query,
    initialPayload: route.initialPayload,
    setQuery,
    documentRequests,
    setDocumentRequests,
    onPin: pinEvidence,
    onSaveNote: saveNote,
    onMarkReviewed: markReviewed,
    onOpenTool: openTool,
    onNavigate: openTool,
    onBackToWorkspace: () => navigate('workspace'),
    onAction: recordAction,
    completedTools,
    reviewed: completedTools.includes(toolName),
  };

  let toolContent = null;
  if (toolIsAvailable && isIdentityDigitalTool(toolName)) {
    toolContent = <IdentityDigitalTools toolName={toolName} {...sharedProps} />;
  } else if (toolIsAvailable && resolveFinancialBusinessTool(toolName)) {
    toolContent = <FinancialBusinessToolRouter toolName={toolName} {...sharedProps} />;
  } else if (toolIsAvailable && supportToolNames.has(toolName)) {
    toolContent = <SupportToolRouter toolName={toolName} {...sharedProps} />;
  }

  return (
    <>
      {!isReferenceStructuredTool ? (
        <SkyCard className="sky-tool-heading" tone="pink">
          <SectionHeading
            eyebrow="Investigation tool"
            title={toolName}
            description={`Case-scoped workspace for ${activeCase.id}. Searches and outputs remain inside this case.`}
            action={(
              <button className="sky-button-secondary" type="button" onClick={() => navigate('workspace')}>
                ← Tool map
              </button>
            )}
          />
        </SkyCard>
      ) : null}
      {toolContent ?? (
        <SkyCard>
          <SectionHeading
            eyebrow="Unavailable tool"
            title={toolName || 'No tool selected'}
            description={toolIsAvailable
              ? 'This tool is not registered in the clean workspace.'
              : `This tool is not available for ${activeCase.id}.`}
          />
          <button className="sky-button" type="button" onClick={() => navigate('workspace')}>Return to tool map</button>
        </SkyCard>
      )}
      <QuickPad
        tray={tray}
        quickPad={quickPad}
        setQuickPad={setQuickPad}
        navigate={navigate}
        activeCaseId={activeCase.id}
        activeCaseTrainingId={activeCase.trainingId}
        activeCaseAvailableTools={activeCase.availableTools}
        variant={['Employee Profile', 'System Access Lane'].includes(toolName) ? 'floating' : 'card'}
      />
    </>
  );
}

function AppScreen({ state }) {
  switch (state.route.name) {
    case 'cases':
      return (
        <>
          <CaseQueue
            cases={state.cases}
            activeCase={state.activeCase}
            completedToolsByCase={state.completedToolsByCase}
            reviewPackagesByCase={state.reviewPackagesByCase}
            openCase={state.openCase}
            createCase={state.createCase}
            navigate={state.navigate}
          />
          <QuickPad
            tray={state.tray}
            quickPad={state.quickPad}
            setQuickPad={state.setQuickPad}
            navigate={state.navigate}
            activeCaseId={state.activeCase.id}
            activeCaseTrainingId={state.activeCase.trainingId}
            activeCaseAvailableTools={state.activeCase.availableTools}
            variant="floating"
          />
        </>
      );
    case 'briefing':
      return (
        <>
          <CaseBriefing {...state} />
          <QuickPad
            tray={state.tray}
            quickPad={state.quickPad}
            setQuickPad={state.setQuickPad}
            navigate={state.navigate}
            activeCaseId={state.activeCase.id}
            activeCaseTrainingId={state.activeCase.trainingId}
            activeCaseAvailableTools={state.activeCase.availableTools}
            variant="floating"
          />
        </>
      );
    case 'workspace':
      return (
        <>
          <Workspace {...state} />
          <QuickPad
            tray={state.tray}
            quickPad={state.quickPad}
            setQuickPad={state.setQuickPad}
            navigate={state.navigate}
            activeCaseId={state.activeCase.id}
            activeCaseTrainingId={state.activeCase.trainingId}
            activeCaseAvailableTools={state.activeCase.availableTools}
            variant="floating"
          />
        </>
      );
    case 'tool':
      return <ToolWorkspace state={state} />;
    case 'summary':
      return <InvestigationSummary {...state} />;
    case 'indicators':
      return <IndicatorsReview {...state} />;
    case 'determination':
      return <Determination {...state} />;
    case 'submit':
      return <SubmitDecision {...state} />;
    case 'luna':
      return <LunaDebrief {...state} />;
    case 'report':
      return <CaseReport {...state} />;
    case 'dashboard':
    default:
      return <Dashboard {...state} />;
  }
}

export default function App() {
  const state = useWorkspaceState();
  return (
    <AppShell
      activeCase={state.activeCase}
      route={state.route}
      navigate={state.navigate}
      latestPackage={state.latestPackage}
      completedTools={state.completedTools}
    >
      <AppScreen state={state} />
    </AppShell>
  );
}
