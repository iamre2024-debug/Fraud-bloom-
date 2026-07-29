import {
  investigationToolGroups,
  workflowReviewGroup,
  canonicalToolName,
} from '../investigationToolGroups.js';
import { filterToolsForCaseDomain } from '../data/caseDomain.js';
import { SectionHeading, SkyCard, StatusChip } from '../components/SkyPrimitives.jsx';

function toolsForCase(activeCase) {
  const available = activeCase.availableTools?.length
    ? activeCase.availableTools.map(canonicalToolName)
    : [...investigationToolGroups.flatMap((group) => group.tools), ...workflowReviewGroup.tools];
  return new Set(filterToolsForCaseDomain(available, activeCase));
}

export default function Workspace({
  activeCase,
  completedTools,
  tray,
  notes,
  navigate,
}) {
  const available = toolsForCase(activeCase);
  const groups = [...investigationToolGroups, workflowReviewGroup]
    .map((group) => ({
      ...group,
      tools: group.tools.filter((tool) => available.has(tool)),
    }))
    .filter((group) => group.tools.length);
  const total = groups.reduce((sum, group) => sum + group.tools.length, 0);
  const reviewed = groups
    .flatMap((group) => group.tools)
    .filter((tool) => completedTools.includes(tool)).length;

  return (
    <>
      <SkyCard className="sky-workspace-overview" tone="pink">
        <SectionHeading
          eyebrow="Tool map"
          title={`${activeCase.id} investigation workspace`}
          description="Choose only the records needed for this case. The map is navigation, not an evidence relationship."
          action={<StatusChip>{reviewed} / {total} reviewed</StatusChip>}
        />
        <div className="sky-metric-grid">
          <div className="sky-metric"><span>Reviewed tools</span><strong>{reviewed}</strong><small>case scoped</small></div>
          <div className="sky-metric"><span>Pinned evidence</span><strong>{tray.length}</strong><small>saved objects</small></div>
          <div className="sky-metric"><span>Notes</span><strong>{notes.length}</strong><small>investigation notes</small></div>
        </div>
      </SkyCard>

      <div className="sky-tool-map">
        {groups.map((group, groupIndex) => (
          <SkyCard key={group.key} tone={groupIndex % 2 ? 'pink' : undefined}>
            <SectionHeading
              eyebrow={group.label}
              title={group.question}
              action={<span className="sky-tool-group-icon" aria-hidden="true">{group.icon}</span>}
              level={2}
            />
            <div className="sky-tool-buttons">
              {group.tools.map((tool) => {
                const isReviewed = completedTools.includes(tool);
                return (
                  <button
                    type="button"
                    className="sky-tool-button"
                    key={tool}
                    onClick={() => navigate('tool', { tool })}
                  >
                    <span className="sky-tool-glyph" aria-hidden="true">
                      {isReviewed ? '✓' : '✦'}
                    </span>
                    <span>
                      <strong>{tool}</strong>
                      <small>{isReviewed ? 'Reviewed' : 'Open tool'}</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                );
              })}
            </div>
          </SkyCard>
        ))}
      </div>

      <SkyCard>
        <div className="sky-next-action">
          <span>Ready to organize the evidence you gathered?</span>
          <button className="sky-button" type="button" onClick={() => navigate('summary')}>
            Build investigation summary →
          </button>
        </div>
      </SkyCard>
    </>
  );
}
