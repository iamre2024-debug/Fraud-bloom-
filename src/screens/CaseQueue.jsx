import { useMemo, useState } from 'react';
import {
  publicAlertReason,
  publicCaseSearchText,
  publicCaseTaxonomy,
} from '../data/publicCaseView.js';
import { SkyCard, SectionHeading, StatusChip } from '../components/SkyPrimitives.jsx';

function caseStatus(item, completedToolsByCase = {}, packageByCase = {}) {
  if (packageByCase[item.id]?.length) return 'Submitted';
  if (completedToolsByCase[item.id]?.length) return 'In progress';
  return item.status ?? 'Open';
}

export default function CaseQueue({
  cases,
  activeCase,
  completedToolsByCase,
  reviewPackagesByCase = {},
  openCase,
  createCase,
}) {
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('All');
  const [creating, setCreating] = useState(false);
  const visibleCases = useMemo(() => cases.filter((item) => {
    const matchesSearch = !search.trim()
      || publicCaseSearchText(item).includes(search.trim().toLowerCase());
    const matchesPriority = priority === 'All' || item.priority === priority;
    return matchesSearch && matchesPriority;
  }), [cases, priority, search]);

  async function generatePracticeCase() {
    setCreating(true);
    try {
      await createCase({
        customerType: activeCase.customerType,
        productType: activeCase.productType,
        workflowType: activeCase.workflowType,
        difficulty: 'standard',
        evidenceDepth: 'expanded',
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <SkyCard>
        <SectionHeading
          eyebrow="Case queue"
          title="Choose the next investigation"
          description="Every case begins with a neutral briefing. The expected outcome stays hidden."
          action={(
            <button className="sky-button" type="button" onClick={generatePracticeCase} disabled={creating}>
              {creating ? 'Building case…' : 'Generate practice case'}
            </button>
          )}
        />
        <div className="sky-queue-controls">
          <label className="sky-field wide">
            <span>Search cases</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Case ID, customer, product, or alert reason"
            />
          </label>
          <div className="sky-tabs" role="group" aria-label="Priority filter">
            {['All', 'High', 'Medium', 'Low'].map((option) => (
              <button
                className="sky-tab"
                type="button"
                key={option}
                aria-selected={priority === option}
                onClick={() => setPriority(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </SkyCard>

      <div className="sky-case-queue">
        {visibleCases.map((item, index) => {
          const taxonomy = publicCaseTaxonomy(item);
          const status = caseStatus(item, completedToolsByCase, reviewPackagesByCase);
          return (
            <button
              className="sky-case-card"
              data-tone={index % 3 === 1 ? 'pink' : undefined}
              type="button"
              key={item.id}
              onClick={() => openCase(item.id)}
            >
              <span className="sky-case-card-top">
                <span className="sky-case-shield" aria-hidden="true">✦</span>
                <span>
                  <small>{taxonomy.workflowType}</small>
                  <strong>{item.id}</strong>
                </span>
                <StatusChip tone={status === 'Submitted' ? undefined : 'pink'}>{status}</StatusChip>
              </span>
              <span className="sky-case-card-body">
                <strong>{item.person ?? 'Training customer'}</strong>
                <small>{publicAlertReason(item)}</small>
              </span>
              <span className="sky-case-card-facts">
                <span>{item.amountExposure ?? item.amount ?? 'Amount not supplied'}</span>
                <span>{taxonomy.productType}</span>
                <span>{item.opened ?? item.reportedDate ?? 'Training date'}</span>
              </span>
              <span className="sky-case-card-action">Open case <b>→</b></span>
            </button>
          );
        })}
      </div>

      {!visibleCases.length ? (
        <div className="sky-empty">No cases match this search and priority.</div>
      ) : null}
    </>
  );
}
