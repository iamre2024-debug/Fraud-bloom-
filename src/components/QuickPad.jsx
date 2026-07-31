import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  buildQuickPadDestinationRoute,
  customer360QuickPadItem,
  normalizeQuickPadItemsForActiveCase,
  payrollQuickPadItem,
} from '../data/quickPadController.js';
import { parseLinkAnalysisPin } from '../data/linkAnalysisRecords.js';
import {
  SectionHeading,
  SkyCard,
  SkyIcon,
  StatusChip,
} from './SkyPrimitives.jsx';
import { canonicalToolName } from '../investigationToolGroups.js';

const sourceLabelByTool = {
  'Customer 360': 'Training ID',
  'Identity Intel / People Search': 'Training ID',
  'Login History': 'Login ID',
  'Session History': 'Session ID',
  'Device Intelligence': 'Device ID',
  'IP Intelligence': 'IP Address',
  'Transaction History': 'Transaction ID',
  'Financial Investigation': 'Account ID',
  'Merchant Intelligence': 'Merchant Name',
  'Business 360': 'Business ID',
  'Employee Profile': 'Employee ID',
  'Payroll History': 'Payroll Run ID',
  'Document Viewer': 'Document ID',
  'Document Request': 'Document Request ID',
  'System Access Lane': 'System Access Record ID',
  Timeline: 'Timeline Event ID',
};

const linkLabelByIdentifierType = {
  'training-id': 'Training ID',
  phone: 'Phone Number',
  email: 'Email',
  address: 'Address',
  device: 'Device ID',
  ip: 'IP Address',
  'bank-code': 'Bank Code',
  'destination-id': 'Destination ID',
};

function itemsFromPin(pin, activeCaseTrainingId = '') {
  const sourceRecordId = pin.sourceRecordId ?? pin.recordId ?? pin.id;
  const record = pin.record ?? {};
  if (pin.tool === 'Customer 360') {
    const item = customer360QuickPadItem(pin, activeCaseTrainingId);
    return item ? [item] : [];
  }
  if (pin.tool === 'Payment Verification' && record.bankCode && record.destinationId) {
    return [
      {
        id: `${sourceRecordId}:bank-code`,
        label: 'Bank Code',
        value: record.bankCode,
        sourceTool: pin.tool,
        sourceRecordId,
        routeGroupId: sourceRecordId,
      },
      {
        id: `${sourceRecordId}:destination-id`,
        label: 'Destination ID',
        value: record.destinationId,
        sourceTool: pin.tool,
        sourceRecordId,
        routeGroupId: sourceRecordId,
      },
    ];
  }
  if (canonicalToolName(pin.tool) === 'Transaction History') {
    const transactionId = String(
      pin.query
      || record.id
      || pin.sourceRecordId
      || pin.recordId
      || pin.id
      || '',
    ).trim();
    return transactionId ? [{
      id: `${transactionId}:quick-pad`,
      label: 'Transaction ID',
      value: transactionId,
      sourceTool: 'Transaction History',
      sourceRecordId: transactionId,
      identifierType: 'transaction-id',
    }] : [];
  }
  if (canonicalToolName(pin.tool) === 'Payroll History') {
    const item = payrollQuickPadItem(pin);
    return item ? [item] : [];
  }
  if (pin.tool === 'Link Analysis') {
    const parsed = parseLinkAnalysisPin(pin.value ?? pin.id);
    const identifierType = pin.identifierType ?? parsed?.identifierType ?? '';
    const query = pin.query ?? parsed?.searchedIdentifier ?? '';
    return query ? [{
      id: `${sourceRecordId}:quick-pad`,
      label: linkLabelByIdentifierType[identifierType] ?? 'Exact Identifier',
      value: query,
      sourceTool: pin.tool,
      sourceRecordId,
      identifierType,
    }] : [];
  }
  if (pin.tool === 'Merchant Intelligence') {
    const lookupType = String(pin.lookupType ?? pin.identifierType ?? '').trim();
    const labelByLookupType = {
      'merchant-name': 'Merchant Name',
      'legal-name': 'Merchant Legal Name',
      descriptor: 'Merchant Descriptor',
      mcc: 'Merchant MCC',
      'record-id': 'Merchant Record ID',
    };
    const merchantName = String(
      pin.merchantName
      || record.profile?.name
      || record.merchantName
      || pin.query
      || '',
    ).trim();
    const queryValue = String(lookupType ? pin.query : merchantName).trim();
    const label = labelByLookupType[lookupType] ?? 'Merchant Name';
    return queryValue ? [{
      id: `${sourceRecordId}:${lookupType || 'merchant-name'}`,
      label,
      value: queryValue,
      merchantName,
      sourceTool: pin.tool,
      sourceRecordId,
      identifierType: lookupType,
    }] : [];
  }
  if (pin.tool === 'Document Request') {
    const requestId = String(
      pin.requestId
      || record.id
      || '',
    ).trim();
    const sourceDocumentId = String(
      pin.sourceDocumentId
      || record.sourceDocumentId
      || '',
    ).trim();
    const requestQuery = requestId || sourceDocumentId;
    return requestQuery ? [{
      id: `${sourceRecordId}:document-request`,
      label: requestId ? 'Document Request ID' : 'Source Document ID',
      value: requestQuery,
      requestId,
      sourceDocumentId,
      sourceTool: pin.tool,
      sourceRecordId: requestQuery,
      routeGroupId: sourceRecordId,
    }] : [];
  }
  return [{
    id: `${sourceRecordId}:quick-pad`,
    label: sourceLabelByTool[pin.tool] ?? pin.identifierType ?? 'Record ID',
    value: pin.value ?? pin.recordId ?? pin.id,
    sourceTool: pin.tool,
    sourceRecordId,
    identifierType: pin.identifierType ?? '',
  }];
}

export default function QuickPad({
  tray,
  quickPad,
  setQuickPad,
  navigate,
  variant = 'card',
  activeCaseId = '',
  activeCaseTrainingId = '',
  activeCaseAvailableTools = null,
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const items = quickPad.items ?? [];
  const routeItems = useMemo(
    () => normalizeQuickPadItemsForActiveCase(items, activeCaseTrainingId),
    [activeCaseTrainingId, items],
  );
  const destinations = useMemo(() => [
    'Customer 360',
    'Identity Intel / People Search',
    'Login History',
    'Session History',
    'Device Intelligence',
    'IP Intelligence',
    'Transaction History',
    'Financial Investigation',
    'Merchant Intelligence',
    'Business 360',
    'Employee Profile',
    'Payment Verification',
    'Payroll History',
    'Document Viewer',
    'Document Request',
    'Link Analysis',
    'System Access Lane',
    'Timeline',
  ].filter((toolName) => (
    !Array.isArray(activeCaseAvailableTools)
    || activeCaseAvailableTools.map(canonicalToolName).includes(toolName)
  )).map((toolName) => ({
    toolName,
    route: buildQuickPadDestinationRoute(toolName, routeItems),
  })), [activeCaseAvailableTools, routeItems]);

  function addPin(pin) {
    const additions = itemsFromPin(pin, activeCaseTrainingId);
    setQuickPad((current) => {
      const currentItems = current.items ?? [];
      const seen = new Set(currentItems.map((item) => item.id));
      return {
        ...current,
        items: [
          ...currentItems,
          ...additions.filter((item) => !seen.has(item.id)),
        ],
      };
    });
  }

  const closePad = useCallback(() => {
    setOpen(false);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!open || variant !== 'floating') return undefined;
    const panel = panelRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusableSelector = [
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const focusable = () => [...(panel?.querySelectorAll(focusableSelector) ?? [])]
      .filter((element) => !element.hasAttribute('hidden'));
    const initialFocus = focusable()[0] ?? panel;
    initialFocus?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePad();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePad, open, variant]);

  const padContents = (
    <div className="sky-grid sky-quick-pad-content">
      <div className="span-6">
        <label className="sky-field wide">
          <span>Scratch notes</span>
          <textarea
            value={quickPad.scratch ?? ''}
            onChange={(event) => setQuickPad((current) => ({
              ...current,
              scratch: event.target.value,
            }))}
            placeholder="Temporary working notes for this case…"
          />
        </label>
        <h3 className="sky-subheading">Add pinned objects</h3>
        <div className="sky-record-list">
          {tray.map((pin, index) => (
            <button
              className="sky-record"
              type="button"
              key={pin.id ?? index}
              onClick={() => addPin(pin)}
            >
              <span>
                <strong>{pin.label ?? pin.id ?? pin}</strong>
                <small>{pin.tool ?? 'Case evidence'}</small>
              </span>
              <span>+</span>
            </button>
          ))}
        </div>
        {!tray.length ? <div className="sky-empty">Pin an evidence object to add it here.</div> : null}
      </div>
      <div className="span-6">
        <h3 className="sky-subheading">Typed notebook items</h3>
        <ul className="sky-summary-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
              <small>{item.sourceTool} · {item.sourceRecordId}</small>
            </li>
          ))}
        </ul>
        {!items.length ? <div className="sky-empty">No typed items saved.</div> : null}
        <h3 className="sky-subheading">Valid routes</h3>
        <div className="sky-action-row">
          {destinations.map(({ toolName, route }) => (
            <button
              className="sky-button-secondary"
              type="button"
              key={toolName}
              onClick={() => navigate('tool', {
                tool: toolName,
                query: route?.payload?.query ?? '',
                initialPayload: route?.payload,
              })}
            >
              Open {toolName}
            </button>
          ))}
        </div>
        {!destinations.length ? (
          <div className="sky-empty">
            No investigation tools are assigned to the active case.
          </div>
        ) : null}
      </div>
    </div>
  );

  if (variant === 'floating') {
    return (
      <div className="sky-quick-pad-floating" data-open={open || undefined}>
        {open ? (
          <>
            <button
              type="button"
              className="sky-quick-pad-backdrop"
              onClick={closePad}
              aria-label="Close Quick Pad"
              tabIndex="-1"
            />
            <section
              ref={panelRef}
              className="sky-quick-pad-sheet"
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${panelId}-title`}
              tabIndex="-1"
            >
              <span className="sky-quick-pad-sheet-sheen" aria-hidden="true" />
              <header>
                <div>
                  <p className="sky-eyebrow">Case-scoped scratchpad</p>
                  <h2 id={`${panelId}-title`}>Quick Pad</h2>
                  <span>{activeCaseId || 'Active case'} · {items.length} typed items</span>
                </div>
                <button
                  type="button"
                  className="sky-icon-button"
                  onClick={closePad}
                  aria-label="Close Quick Pad"
                >
                  ×
                </button>
              </header>
              {padContents}
            </section>
          </>
        ) : null}
        <button
          ref={triggerRef}
          className="sky-quick-pad-fab"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? 'Close' : 'Open'} Quick Pad for ${activeCaseId || 'the active case'}${items.length ? `, ${items.length} typed items` : ''}`}
        >
          <span aria-hidden="true"><SkyIcon name="pin" size={24} /><i>✦</i></span>
          {items.length ? <strong aria-hidden="true">{items.length}</strong> : null}
        </button>
      </div>
    );
  }

  return (
    <SkyCard className="sky-quick-pad" tone="pink">
      <SectionHeading
        eyebrow="Quick Pad"
        title="Case-scoped scratchpad"
        description="Typed routes open only when the selected identifiers satisfy a tool’s input contract."
        action={(
          <button className="sky-button-secondary" type="button" onClick={() => setOpen((value) => !value)}>
            {open ? 'Close' : 'Open'} <StatusChip>{items.length}</StatusChip>
          </button>
        )}
      />
      {open ? padContents : null}
    </SkyCard>
  );
}
