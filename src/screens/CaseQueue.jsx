import { useEffect, useMemo, useState } from 'react';
import {
  publicAlertReason,
  publicCaseSearchText,
  publicCaseTaxonomy,
} from '../data/publicCaseView.js';
import { getWorkspaceProgress } from '../data/workspaceProgress.js';
import {
  SkyIcon,
  SkyProgressRing,
  SkySparkles,
  StatusChip,
} from '../components/SkyPrimitives.jsx';

const pageSize = 10;
const lifecycleOptions = ['All', 'Open', 'In progress', 'Submitted'];

export function queueCaseStatus(item, completedToolsByCase = {}, packagesByCase = {}) {
  if (packagesByCase[item.id]?.length) return 'Submitted';
  if (completedToolsByCase[item.id]?.length) return 'In progress';
  return 'Open';
}

function uniqueOptions(rows, key) {
  return [...new Set(rows.map((row) => row.taxonomy[key]).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export default function CaseQueue({
  cases,
  activeCase,
  completedToolsByCase,
  reviewPackagesByCase = {},
  openCase,
  createCase,
  navigate,
}) {
  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState('All');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customerType, setCustomerType] = useState('All');
  const [productType, setProductType] = useState('All');
  const [workflowType, setWorkflowType] = useState('All');
  const [visibleLimit, setVisibleLimit] = useState(pageSize);
  const [creating, setCreating] = useState(false);
  const [generationError, setGenerationError] = useState('');

  const rows = useMemo(() => cases.map((item) => {
    const completedTools = completedToolsByCase[item.id] ?? [];
    return {
      item,
      taxonomy: publicCaseTaxonomy(item),
      lifecycle: queueCaseStatus(item, completedToolsByCase, reviewPackagesByCase),
      progress: getWorkspaceProgress(item, completedTools),
      briefingComplete: completedTools.includes('Case Briefing'),
    };
  }), [cases, completedToolsByCase, reviewPackagesByCase]);

  const filterOptions = useMemo(() => ({
    customerTypes: uniqueOptions(rows, 'customerType'),
    productTypes: uniqueOptions(rows, 'productType'),
    workflowTypes: uniqueOptions(rows, 'workflowType'),
  }), [rows]);

  const lifecycleCounts = useMemo(() => Object.fromEntries(
    lifecycleOptions.map((option) => [
      option,
      option === 'All' ? rows.length : rows.filter((row) => row.lifecycle === option).length,
    ]),
  ), [rows]);

  const filteredRows = useMemo(() => rows.filter(({ item, taxonomy, lifecycle: rowLifecycle }) => {
    const matchesSearch = !search.trim()
      || publicCaseSearchText(item).includes(search.trim().toLowerCase());
    const matchesLifecycle = lifecycle === 'All' || rowLifecycle === lifecycle;
    const matchesCustomer = customerType === 'All' || taxonomy.customerType === customerType;
    const matchesProduct = productType === 'All' || taxonomy.productType === productType;
    const matchesWorkflow = workflowType === 'All' || taxonomy.workflowType === workflowType;
    return matchesSearch
      && matchesLifecycle
      && matchesCustomer
      && matchesProduct
      && matchesWorkflow;
  }), [customerType, lifecycle, productType, rows, search, workflowType]);

  useEffect(() => {
    setVisibleLimit(pageSize);
  }, [customerType, lifecycle, productType, search, workflowType]);

  async function generatePracticeCase() {
    setCreating(true);
    setGenerationError('');
    try {
      await createCase({
        customerType: activeCase.customerType,
        productType: activeCase.productType,
        workflowType: activeCase.workflowType,
        difficulty: 'standard',
        evidenceDepth: 'expanded',
      });
    } catch {
      setGenerationError('The practice case could not be generated. Try again.');
    } finally {
      setCreating(false);
    }
  }

  function clearFilters() {
    setCustomerType('All');
    setProductType('All');
    setWorkflowType('All');
  }

  const visibleRows = filteredRows.slice(0, visibleLimit);
  const hasAdvancedFilters = [customerType, productType, workflowType]
    .some((value) => value !== 'All');

  return (
    <section className="sky-queue-reference" aria-labelledby="case-queue-heading">
      <header className="sky-queue-reference-header">
        <button
          type="button"
          className="sky-queue-brand"
          onClick={() => navigate('dashboard')}
          aria-label="Open Fraud Bloom dashboard"
        >
          <span className="sky-queue-brand-mark" aria-hidden="true">
            <SkyIcon name="shield" size={30} />
            <i>✦</i>
          </span>
          <span>
            <strong>Fraud Bloom <em>v1</em></strong>
            <small>Investigate. Learn. Prevent.</small>
          </span>
        </button>
        <div className="sky-queue-luna" aria-hidden="true">
          <img src="/assets/luna-sky-vector-v1.svg" alt="" />
          <i>♥</i>
        </div>
      </header>

      <div className="sky-queue-titlebar">
        <div>
          <p className="sky-eyebrow">Evidence First</p>
          <h1 id="case-queue-heading">Case Queue</h1>
          <h2>Choose the next investigation</h2>
        </div>
        <div className="sky-queue-title-actions">
          <button
            className="sky-button-secondary sky-queue-generate"
            type="button"
            onClick={generatePracticeCase}
            disabled={creating}
            aria-busy={creating}
          >
            <SkyIcon name="sparkle" size={17} />
            <span>{creating ? 'Building…' : 'New case'}</span>
          </button>
          <button
            className="sky-button-secondary sky-queue-filter-toggle"
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            aria-expanded={filtersOpen}
            aria-controls="case-queue-filters"
          >
            <SkyIcon name="review" size={17} />
            <span>Filters{hasAdvancedFilters ? ' · On' : ''}</span>
          </button>
        </div>
      </div>

      <form
        className="sky-queue-search"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <SkyIcon name="sparkle" size={20} />
        <label htmlFor="case-queue-search">Search cases</label>
        <input
          id="case-queue-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Case ID, customer, account, product, or alert"
          autoComplete="off"
        />
        {search ? (
          <button type="button" onClick={() => setSearch('')} aria-label="Clear case search">
            ×
          </button>
        ) : null}
      </form>

      <div className="sky-queue-status-tabs" role="group" aria-label="Case lifecycle filters">
        {lifecycleOptions.map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={lifecycle === option}
            onClick={() => setLifecycle(option)}
          >
            <span>{option}</span>
            <strong>{lifecycleCounts[option]}</strong>
          </button>
        ))}
      </div>

      {filtersOpen ? (
        <section className="sky-queue-filter-sheet" id="case-queue-filters" aria-label="Advanced case filters">
          <div className="sky-queue-filter-heading">
            <div>
              <strong>Advanced filters</strong>
              <span>Filter only by neutral intake information.</span>
            </div>
            <button type="button" onClick={clearFilters} disabled={!hasAdvancedFilters}>
              Clear
            </button>
          </div>
          <div className="sky-queue-filter-grid">
            <label>
              <span>Customer type</span>
              <select value={customerType} onChange={(event) => setCustomerType(event.target.value)}>
                <option>All</option>
                {filterOptions.customerTypes.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>Product</span>
              <select value={productType} onChange={(event) => setProductType(event.target.value)}>
                <option>All</option>
                {filterOptions.productTypes.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>Workflow</span>
              <select value={workflowType} onChange={(event) => setWorkflowType(event.target.value)}>
                <option>All</option>
                {filterOptions.workflowTypes.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {creating ? 'Building a practice case.' : `${filteredRows.length} matching cases.`}
      </div>
      {generationError ? <div className="sky-notice" role="alert">{generationError}</div> : null}

      <div className="sky-queue-reference-list">
        {visibleRows.map(({
          item,
          taxonomy,
          lifecycle: rowLifecycle,
          progress,
          briefingComplete,
        }, index) => {
          const isSubmitted = rowLifecycle === 'Submitted';
          const destination = !briefingComplete || isSubmitted ? 'briefing' : 'workspace';
          const actionLabel = isSubmitted
            ? 'View submitted case'
            : briefingComplete
              ? 'Continue workspace'
              : 'Open briefing';
          return (
            <button
              className="sky-case-card sky-queue-reference-card"
              data-accent={index % 3}
              data-active={item.id === activeCase.id || undefined}
              type="button"
              key={item.id}
              onClick={() => openCase(item.id, destination)}
              aria-current={item.id === activeCase.id ? 'true' : undefined}
            >
              <SkySparkles />
              <span className="sky-queue-card-topline">
                <StatusChip tone={rowLifecycle === 'In progress' ? 'pink' : undefined}>
                  {rowLifecycle}
                </StatusChip>
                <small>{taxonomy.workflowType}</small>
              </span>
              <span className="sky-queue-card-main">
                <span>
                  <strong>{item.id}</strong>
                  <b>{item.person ?? 'Name not supplied'}</b>
                </span>
                <span className="sky-queue-progress">
                  <SkyProgressRing
                    value={progress.percent}
                    label="reviewed"
                    size="micro"
                    decorative
                  />
                  <small>{progress.reviewed} / {progress.total} tools</small>
                </span>
              </span>
              <span className="sky-queue-card-alert">{publicAlertReason(item)}</span>
              <span className="sky-queue-card-facts">
                <span>
                  <small>Amount / exposure</small>
                  <strong>{item.amountExposure ?? item.amount ?? 'Not supplied'}</strong>
                </span>
                <span>
                  <small>Product</small>
                  <strong>{taxonomy.productType}</strong>
                </span>
                <span>
                  <small>Opened</small>
                  <strong>{item.opened ?? item.reportedDate ?? 'Not supplied'}</strong>
                </span>
              </span>
              <span className="sky-case-card-action">
                <strong>{actionLabel}</strong>
                <SkyIcon name="arrow" size={18} />
              </span>
            </button>
          );
        })}
      </div>

      {!filteredRows.length ? (
        <div className="sky-empty">No cases match this search and these neutral filters.</div>
      ) : (
        <footer className="sky-queue-pagination">
          <span>Showing {visibleRows.length} of {filteredRows.length} cases</span>
          {visibleRows.length < filteredRows.length ? (
            <button type="button" onClick={() => setVisibleLimit((value) => value + pageSize)}>
              Load more <SkyIcon name="arrow" size={16} />
            </button>
          ) : null}
        </footer>
      )}
    </section>
  );
}
