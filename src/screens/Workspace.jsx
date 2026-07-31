import { useEffect, useMemo, useState } from 'react';
import {
  investigationToolGroups,
  workflowReviewGroup,
  workspaceMapBlueprints,
} from '../investigationToolGroups.js';
import { getWorkspaceProgress } from '../data/workspaceProgress.js';
import {
  SkyIcon,
  SkyProgressRing,
  SkySparkles,
  StatusChip,
} from '../components/SkyPrimitives.jsx';

function groupStatus(reviewed, total) {
  if (!total) return 'Not in this case';
  if (reviewed === total) return 'Reviewed';
  if (reviewed) return 'In progress';
  return 'Open';
}

export default function Workspace({
  activeCase,
  completedTools,
  tray,
  notes,
  navigate,
}) {
  const progress = getWorkspaceProgress(activeCase, completedTools);
  const completed = useMemo(() => new Set(completedTools), [completedTools]);
  const sourceGroups = useMemo(
    () => [...investigationToolGroups, workflowReviewGroup],
    [],
  );
  const mapGroups = useMemo(() => {
    const available = new Set(progress.availableTools);
    const groupsByKey = new Map(sourceGroups.map((group) => [group.key, group]));
    return workspaceMapBlueprints.map((blueprint) => {
      const matchedSourceGroups = blueprint.sourceGroups
        .map((key) => groupsByKey.get(key))
        .filter(Boolean);
      const tools = matchedSourceGroups
        .flatMap((group) => group.tools)
        .filter((tool) => available.has(tool));
      const reviewed = tools.filter((tool) => completed.has(tool)).length;
      return {
        ...blueprint,
        tools,
        reviewed,
        total: tools.length,
        status: groupStatus(reviewed, tools.length),
        question: matchedSourceGroups.map((group) => group.question).join(' '),
      };
    });
  }, [completed, progress.availableTools, sourceGroups]);

  const [selectedGroupKey, setSelectedGroupKey] = useState(mapGroups[0]?.key ?? '');
  useEffect(() => {
    if (!mapGroups.some((group) => group.key === selectedGroupKey)) {
      setSelectedGroupKey(mapGroups[0]?.key ?? '');
    }
  }, [mapGroups, selectedGroupKey]);

  const selectedGroup = mapGroups.find((group) => group.key === selectedGroupKey)
    ?? mapGroups[0];

  return (
    <section className="sky-toolmap-reference" aria-labelledby="tool-map-heading">
      <header className="sky-toolmap-reference-header">
        <button
          type="button"
          className="sky-icon-button"
          aria-label="Back to case briefing"
          onClick={() => navigate('briefing')}
        >
          <SkyIcon name="back" size={22} />
        </button>
        <span className="sky-toolmap-header-mark" aria-hidden="true">
          <SkyIcon name="shield" size={30} />
          <i>✦</i>
        </span>
        <div className="sky-toolmap-heading-copy">
          <h1 id="tool-map-heading">
            Tool Map
            <small>{activeCase.id} investigation workspace</small>
          </h1>
        </div>
        <button
          type="button"
          className="sky-toolmap-case-switch"
          onClick={() => navigate('cases')}
        >
          <SkyIcon name="cases" size={18} />
          <span>Switch case</span>
        </button>
        <div className="sky-toolmap-luna" aria-hidden="true">
          <img src="/assets/luna-anime-purple-v1.webp" alt="" />
          <i>♥</i>
        </div>
      </header>

      <div className="sky-toolmap-metrics" aria-label="Current case workspace counts">
        <span><strong>{progress.reviewed}</strong> / {progress.total} tools reviewed</span>
        <span><strong>{tray.length}</strong> pinned objects</span>
        <span><strong>{notes.length}</strong> investigation notes</span>
      </div>

      <figure className="sky-toolmap-canvas" aria-describedby="tool-map-caption">
        <figcaption id="tool-map-caption">
          Select a navigation group to open its case-scoped tools. Connecting lines organize the
          menu and do not represent evidence relationships.
        </figcaption>
        <SkySparkles />
        <svg
          className="sky-toolmap-lines"
          viewBox="0 0 1000 680"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <ellipse cx="500" cy="330" rx="330" ry="235" />
          <ellipse cx="500" cy="330" rx="225" ry="155" />
          <path d="M500 330 C430 230 355 160 260 120" />
          <path d="M500 330 C570 230 645 160 740 120" />
          <path d="M500 330 C390 340 260 350 145 360" />
          <path d="M500 330 C610 340 740 350 855 360" />
          <path d="M500 330 C500 430 500 520 500 615" />
          <circle cx="500" cy="330" r="5" />
          <circle cx="260" cy="120" r="5" />
          <circle cx="740" cy="120" r="5" />
          <circle cx="145" cy="360" r="5" />
          <circle cx="855" cy="360" r="5" />
          <circle cx="500" cy="615" r="5" />
        </svg>
        <svg
          className="sky-toolmap-lines-mobile"
          viewBox="0 0 400 650"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M200 255 C160 205 125 145 100 80" />
          <path d="M200 255 C240 205 275 145 300 80" />
          <path d="M200 255 C155 305 125 350 100 405" />
          <path d="M200 255 C245 305 275 350 300 405" />
          <path d="M200 255 C200 365 200 475 200 580" />
          <circle cx="200" cy="255" r="5" />
          <circle cx="100" cy="80" r="4" />
          <circle cx="300" cy="80" r="4" />
          <circle cx="100" cy="405" r="4" />
          <circle cx="300" cy="405" r="4" />
          <circle cx="200" cy="580" r="4" />
        </svg>

        <div className="sky-toolmap-orbit">
          {mapGroups.map((group) => (
            <button
              type="button"
              className="sky-toolmap-node"
              data-slot={group.key}
              data-tone={group.tone}
              data-selected={selectedGroup?.key === group.key || undefined}
              key={group.key}
              onClick={() => setSelectedGroupKey(group.key)}
              aria-expanded={selectedGroup?.key === group.key}
              aria-controls="tool-map-drawer"
            >
              <span className="sky-toolmap-node-icon" aria-hidden="true">
                <SkyIcon name={group.icon} size={28} />
              </span>
              <strong>{group.label}</strong>
              <span>{group.total ? `${group.reviewed} / ${group.total} reviewed` : 'No assigned tools'}</span>
              <small>{group.status}</small>
            </button>
          ))}

          <button
            type="button"
            className="sky-toolmap-core"
            onClick={() => navigate('briefing')}
            aria-label={`Open ${activeCase.id} case briefing. Workspace ${progress.percent}% reviewed.`}
          >
            <span className="sky-toolmap-core-icon" aria-hidden="true">
              <SkyIcon name="evidence" size={28} />
            </span>
            <strong>Case Briefing</strong>
            <small>{activeCase.id}</small>
            <SkyProgressRing value={progress.percent} label="reviewed" size="micro" decorative />
          </button>
        </div>
      </figure>

      <div className="sr-only" aria-live="polite">
        {selectedGroup
          ? `${selectedGroup.label} selected. ${selectedGroup.total} assigned tools.`
          : 'No tool group selected.'}
      </div>

      {selectedGroup ? (
        <section
          className="sky-toolmap-drawer"
          id="tool-map-drawer"
          aria-labelledby="tool-map-drawer-heading"
        >
          <div className="sky-toolmap-drawer-heading">
            <span
              className="sky-toolmap-drawer-icon"
              data-tone={selectedGroup.tone}
              aria-hidden="true"
            >
              <SkyIcon name={selectedGroup.icon} size={23} />
            </span>
            <div>
              <p className="sky-eyebrow">Selected tool group</p>
              <h2 id="tool-map-drawer-heading">{selectedGroup.label}</h2>
              <p>{selectedGroup.question}</p>
            </div>
            <StatusChip tone={selectedGroup.status === 'In progress' ? 'pink' : undefined}>
              {selectedGroup.total
                ? `${selectedGroup.reviewed} / ${selectedGroup.total} reviewed`
                : 'Not assigned'}
            </StatusChip>
          </div>
          {selectedGroup.total ? (
            <nav className="sky-tool-map sky-toolmap-tool-list" aria-label={`${selectedGroup.label} tools`}>
              {selectedGroup.tools.map((tool) => {
                const isReviewed = completed.has(tool);
                return (
                  <button
                    type="button"
                    className="sky-tool-button sky-toolmap-tool-button"
                    key={tool}
                    onClick={() => navigate('tool', { tool })}
                  >
                    <span className="sky-tool-glyph" aria-hidden="true">
                      <SkyIcon name={isReviewed ? 'check' : 'sparkle'} size={19} />
                    </span>
                    <span>
                      <strong>{tool}</strong>
                      <small>{isReviewed ? 'Reviewed' : 'Open tool'}</small>
                    </span>
                    <SkyIcon name="arrow" size={17} />
                  </button>
                );
              })}
            </nav>
          ) : (
            <div className="sky-toolmap-unavailable">
              <span>
                This category has no tools assigned to {activeCase.id}. No unavailable records are shown.
              </span>
              <button type="button" onClick={() => navigate('cases')}>Switch case</button>
            </div>
          )}
        </section>
      ) : null}

      <section className="sky-toolmap-summary-action">
        <span className="sky-toolmap-summary-icon" aria-hidden="true">
          <SkyIcon name="review" size={24} />
        </span>
        <div>
          <strong>Ready to organize the evidence?</strong>
          <span>Build a neutral summary from the records you reviewed.</span>
        </div>
        <button className="sky-button" type="button" onClick={() => navigate('summary')}>
          Build investigation summary <SkyIcon name="arrow" size={18} />
        </button>
      </section>
    </section>
  );
}
