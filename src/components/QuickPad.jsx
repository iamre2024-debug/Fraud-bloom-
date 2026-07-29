import { useMemo, useState } from 'react';
import {
  buildQuickPadDestinationRoute,
} from '../data/quickPadController.js';
import { SectionHeading, SkyCard, StatusChip } from './SkyPrimitives.jsx';

const sourceLabelByTool = {
  'Customer 360': 'Training ID',
  'Identity Intel / People Search': 'Training ID',
  'Login History': 'Login ID',
  'Session History': 'Session ID',
  'Device Intelligence': 'Device ID',
  'IP Intelligence': 'IP Address',
  'Financial Investigation': 'Account ID',
  'Business 360': 'Business ID',
  'Payroll History': 'Payroll Run ID',
  'Document Viewer': 'Document ID',
};

function itemsFromPin(pin) {
  const sourceRecordId = pin.sourceRecordId ?? pin.recordId ?? pin.id;
  const record = pin.record ?? {};
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
}) {
  const [open, setOpen] = useState(false);
  const items = quickPad.items ?? [];
  const destinations = useMemo(() => [
    'Identity Intel / People Search',
    'Login History',
    'Session History',
    'Device Intelligence',
    'IP Intelligence',
    'Financial Investigation',
    'Business 360',
    'Payment Verification',
    'Payroll History',
    'Document Viewer',
    'Link Analysis',
  ].map((toolName) => ({
    toolName,
    route: buildQuickPadDestinationRoute(toolName, items),
  })).filter((item) => item.route), [items]);

  function addPin(pin) {
    const additions = itemsFromPin(pin);
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
      {open ? (
        <div className="sky-grid">
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
                    query: route.payload.query ?? '',
                    initialPayload: route.payload,
                  })}
                >
                  Open {toolName}
                </button>
              ))}
            </div>
            {!destinations.length ? (
              <div className="sky-empty">
                Add one destination-valid ID, or a paired Bank Code and Destination ID from the same payment record.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </SkyCard>
  );
}
