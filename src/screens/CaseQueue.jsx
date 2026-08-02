import { useEffect, useMemo, useState } from 'react';
import {
  publicAlertReason,
  publicCaseSearchText,
  publicCaseTaxonomy,
} from '../data/publicCaseView.js';
import { getWorkspaceProgress } from '../data/workspaceProgress.js';
import { claimGeneratorChoices, coreClaimTypes } from '../data/claimRegistry.js';
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
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [customerType, setCustomerType] = useState('All');
  const [productType, setProductType] = useState('All');
  const [workflowType, setWorkflowType] = useState('All');
  const [visibleLimit, setVisibleLimit] = useState(pageSize);
  const [creating, setCreating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const generatorChoices = useMemo(() => claimGeneratorChoices(), []);
  const [generatorCustomerType, setGeneratorCustomerType] = useState(
    () => generatorChoices[0]?.id ?? '',
  );
  const generatorCustomer = generatorChoices.find(
    (item) => item.id === generatorCustomerType,
  ) ?? generatorChoices[0];
  const [generatorProductType, setGeneratorProductType] = useState(
    () => generatorChoices[0]?.products?.[0]?.id ?? '',
  );
  const generatorProduct = generatorCustomer?.products.find(
    (item) => item.id === generatorProductType,
  ) ?? generatorCustomer?.products?.[0];
  const [generatorWorkflowType, setGeneratorWorkflowType] = useState(
    () => generatorChoices[0]?.products?.[0]?.workflows?.[0]?.id ?? '',
  );
  const generatorWorkflow = generatorProduct?.workflows.find(
    (item) => item.id === generatorWorkflowType,
  ) ?? generatorProduct?.workflows?.[0];
  const [generatorScenarioId, setGeneratorScenarioId] = useState('auto');
  const [generatorDifficulty, setGeneratorDifficulty] = useState('standard');
  const [generatorDepth, setGeneratorDepth] = useState('standard');
  const generatorDefinition = coreClaimTypes.find(
    (item) => item.id === generatorWorkflow?.id,
  );

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
    if (!generatorCustomer || !generatorProduct || !generatorWorkflow) return;
    setCreating(true);
    setGenerationError('');
    try {
      const selectedScenario = generatorWorkflow.scenarios.find(
        (item) => item.id === generatorScenarioId,
      );
      await createCase({
        customerType: generatorCustomer.id,
        productType: generatorProduct.id,
        workflowType: generatorWorkflow.id,
        claimTypeId: generatorWorkflow.id,
        scenarioId: selectedScenario?.id,
        alertReason: selectedScenario?.alertReason,
        reportedAllegation: selectedScenario?.reportedAllegation,
        difficulty: generatorDifficulty,
        evidenceDepth: generatorDepth,
      });
      setGeneratorOpen(false);
    } catch {
      setGenerationError('The practice case could not be generated. Try again.');
    } finally {
      setCreating(false);
    }
  }

  function changeGeneratorCustomer(nextCustomerType) {
    const nextCustomer = generatorChoices.find((item) => item.id === nextCustomerType)
      ?? generatorChoices[0];
    const nextProduct = nextCustomer?.products?.[0];
    setGeneratorCustomerType(nextCustomer?.id ?? '');
    setGeneratorProductType(nextProduct?.id ?? '');
    setGeneratorWorkflowType(nextProduct?.workflows?.[0]?.id ?? '');
    setGeneratorScenarioId('auto');
  }

  function changeGeneratorProduct(nextProductType) {
    const nextProduct = generatorCustomer?.products.find((item) => item.id === nextProductType)
      ?? generatorCustomer?.products?.[0];
    setGeneratorProductType(nextProduct?.id ?? '');
    setGeneratorWorkflowType(nextProduct?.workflows?.[0]?.id ?? '');
    setGeneratorScenarioId('auto');
  }

  function changeGeneratorWorkflow(nextWorkflowType) {
    setGeneratorWorkflowType(nextWorkflowType);
    setGeneratorScenarioId('auto');
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
          <img src="/assets/luna-anime-purple-v1.webp" alt="" />
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
            onClick={() => setGeneratorOpen((value) => !value)}
            disabled={creating}
            aria-expanded={generatorOpen}
            aria-controls="case-generator"
          >
            <SkyIcon name="sparkle" size={17} />
            <span>{creating ? 'Building…' : generatorOpen ? 'Close generator' : 'New case'}</span>
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

      {generatorOpen ? (
        <section className="sky-case-generator" id="case-generator" aria-label="Generate fictional training case">
          <header>
            <div>
              <p className="sky-eyebrow">Unlimited fictional practice</p>
              <h2>Create a training case</h2>
              <span>Choose the customer, product, and neutral review workflow. Hidden findings stay locked until submission.</span>
            </div>
            <strong>{coreClaimTypes.length} workflows</strong>
          </header>
          <div className="sky-case-generator-grid">
            <label>
              <span>1. Customer type</span>
              <select
                aria-label="Generate case customer type"
                value={generatorCustomer?.id ?? ''}
                onChange={(event) => changeGeneratorCustomer(event.target.value)}
              >
                {generatorChoices.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>2. Product</span>
              <select
                aria-label="Generate case product"
                value={generatorProduct?.id ?? ''}
                onChange={(event) => changeGeneratorProduct(event.target.value)}
              >
                {(generatorCustomer?.products ?? []).map((product) => (
                  <option key={product.id} value={product.id}>{product.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>3. Review workflow</span>
              <select
                aria-label="Generate case review workflow"
                value={generatorWorkflow?.id ?? ''}
                onChange={(event) => changeGeneratorWorkflow(event.target.value)}
              >
                {(generatorProduct?.workflows ?? []).map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>{workflow.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>4. Scenario</span>
              <select
                aria-label="Generate case scenario"
                value={generatorScenarioId}
                onChange={(event) => setGeneratorScenarioId(event.target.value)}
              >
                <option value="auto">Auto mix</option>
                {(generatorWorkflow?.scenarios ?? []).map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
                ))}
              </select>
            </label>
            <label>
              <span>5. Difficulty</span>
              <select
                aria-label="Generate case difficulty"
                value={generatorDifficulty}
                onChange={(event) => setGeneratorDifficulty(event.target.value)}
              >
                <option value="light">Light</option>
                <option value="standard">Standard</option>
                <option value="deep">Deep</option>
              </select>
            </label>
            <label>
              <span>6. Evidence depth</span>
              <select
                aria-label="Generate case evidence depth"
                value={generatorDepth}
                onChange={(event) => setGeneratorDepth(event.target.value)}
              >
                <option value="light">Light packet</option>
                <option value="standard">Standard packet</option>
                <option value="deep">Deep packet</option>
              </select>
            </label>
          </div>
          <div className="sky-case-generator-context">
            <span><strong>Selected:</strong> {generatorCustomer?.label} · {generatorProduct?.label} · {generatorWorkflow?.label}</span>
            <span><strong>Evidence areas:</strong> {(generatorDefinition?.evidenceAreas ?? []).slice(0, 3).join(' · ')}</span>
          </div>
          <button
            className="sky-button sky-case-generator-submit"
            type="button"
            onClick={generatePracticeCase}
            disabled={creating || !generatorWorkflow}
            aria-busy={creating}
          >
            <SkyIcon name="sparkle" size={18} />
            <span>{creating ? 'Building case…' : 'Generate and open case'}</span>
          </button>
        </section>
      ) : null}

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
