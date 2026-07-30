import {
  canonicalToolNames,
  workspaceTools,
} from '../investigationToolGroups.js';
import { filterToolsForCaseDomain } from './caseDomain.js';

export function availableWorkspaceTools(activeCase = {}) {
  const requestedTools = activeCase.availableTools?.length
    ? canonicalToolNames(activeCase.availableTools)
    : workspaceTools;
  const scopedTools = new Set(filterToolsForCaseDomain(requestedTools, activeCase));
  return workspaceTools.filter((tool) => scopedTools.has(tool));
}

export function getWorkspaceProgress(activeCase = {}, completedTools = []) {
  const availableTools = availableWorkspaceTools(activeCase);
  const completed = new Set(canonicalToolNames(completedTools));
  const reviewed = availableTools.filter((tool) => completed.has(tool)).length;
  const total = availableTools.length;

  return {
    availableTools,
    reviewed,
    total,
    percent: total ? Math.round((reviewed / total) * 100) : 0,
  };
}
