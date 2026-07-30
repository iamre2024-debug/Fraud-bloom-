import {
  buildQuickPadDestinationPayload,
  buildQuickPadDestinationRoute,
  customer360QuickPadItem,
  normalizeQuickPadItemsForActiveCase,
  payrollQuickPadItem,
  validateQuickPadDestinationPayload,
} from '../src/data/quickPadController.js';
import {
  quickPadItemSupportsTool,
  quickPadSearchRoute,
  quickPadSourceRoute,
} from '../src/data/quickPadRouting.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const paymentPair = [
  {
    label: 'Bank Code',
    value: 'BC-TRAINING-001',
    sourceTool: 'Payment Verification',
    sourceRecordId: 'PAY-TRAINING-001',
  },
  {
    label: 'Destination ID',
    value: 'DST-TRAINING-001',
    sourceTool: 'Payment Verification',
    sourceRecordId: 'PAY-TRAINING-001',
  },
];
const paymentPayload = buildQuickPadDestinationPayload('Payment Verification', paymentPair);
assert(
  paymentPayload?.bankCode === 'BC-TRAINING-001'
    && paymentPayload?.destinationId === 'DST-TRAINING-001'
    && paymentPayload?.sourceRecordId === 'PAY-TRAINING-001',
  'Payment Verification should require and preserve a correlated Bank Code + Destination ID pair.',
);
assert(
  validateQuickPadDestinationPayload('Payment Verification', paymentPayload).valid,
  'A complete Payment Verification payload should validate.',
);
assert(
  buildQuickPadDestinationRoute('Payment Verification', paymentPair)?.payload.destinationId === 'DST-TRAINING-001',
  'A complete Payment Verification pair should produce a structured route payload.',
);

for (const incompleteItems of [paymentPair.slice(0, 1), paymentPair.slice(1)]) {
  assert(
    buildQuickPadDestinationRoute('Payment Verification', incompleteItems) === null,
    'Payment Verification must reject a one-field Quick Pad route.',
  );
}
assert(
  !validateQuickPadDestinationPayload('Payment Verification', { bankCode: 'BC-ONLY' }).valid
    && !validateQuickPadDestinationPayload('Payment Verification', { destinationId: 'DST-ONLY' }).valid,
  'Direct Payment Verification payload validation must require both exact identifiers.',
);

const mismatchedPaymentPair = [
  { ...paymentPair[0], sourceRecordId: 'PAY-A' },
  { ...paymentPair[1], sourceRecordId: 'PAY-B' },
];
assert(
  buildQuickPadDestinationRoute('Payment Verification', mismatchedPaymentPair) === null,
  'Bank Code and Destination ID from different source records must never be paired.',
);

const deviceItem = [{
  label: 'Device ID',
  value: 'DEV-TRAINING-001',
  sourceRecordId: 'DEVICE-ROW-001',
}];
const customerItem = [{
  label: 'Training ID',
  value: 'TRN-CUSTOMER-001',
  sourceTool: 'Customer 360',
  sourceRecordId: 'PCH-CUSTOMER-001',
}];
assert(
  buildQuickPadDestinationRoute('Customer 360', customerItem)?.payload.query === 'TRN-CUSTOMER-001',
  'Customer 360 should reopen with the exact Training ID carried by a customer sub-record pin.',
);
const duplicateCustomerItems = [
  customerItem[0],
  { ...customerItem[0], sourceRecordId: 'SVC-CUSTOMER-002' },
];
assert(
  buildQuickPadDestinationRoute('Customer 360', duplicateCustomerItems)?.payload.query === 'TRN-CUSTOMER-001',
  'Customer 360 should retain one route when multiple pins carry the same Training ID.',
);
assert(
  buildQuickPadDestinationRoute('Customer 360', [
    ...duplicateCustomerItems,
    { ...customerItem[0], value: 'TRN-CUSTOMER-OTHER' },
  ]) === null,
  'Customer 360 should reject an ambiguous Quick Pad containing different Training IDs.',
);
assert(
  customer360QuickPadItem({
    id: 'PROFILE-95881-1',
    tool: 'Customer 360',
    value: 'PROFILE-95881-1',
  }, 'TRN-CUSTOMER-001')?.value === 'TRN-CUSTOMER-001',
  'Legacy Customer 360 pins should migrate to the active case Training ID.',
);
const normalizedLegacyCustomerItems = normalizeQuickPadItemsForActiveCase([{
  id: 'PROFILE-95881-1:quick-pad',
  label: 'Record ID',
  value: 'PROFILE-95881-1',
  sourceTool: 'Customer 360',
  sourceRecordId: 'PROFILE-95881-1',
}], 'TRN-CUSTOMER-001');
assert(
  buildQuickPadDestinationRoute('Customer 360', normalizedLegacyCustomerItems)?.payload.query === 'TRN-CUSTOMER-001',
  'Previously saved Customer 360 notebook items should reopen with the active case Training ID.',
);
assert(
  quickPadItemSupportsTool(customerItem[0], 'Customer 360', 'mobile')
    && quickPadSearchRoute(customerItem[0], 'Customer 360')?.query === 'TRN-CUSTOMER-001',
  'Customer 360 source routing must preserve Training ID on mobile and desktop.',
);
assert(
  buildQuickPadDestinationRoute('Device Intelligence', deviceItem)?.payload.query === 'DEV-TRAINING-001',
  'Device Intelligence should accept its exact identifier.',
);
assert(
  buildQuickPadDestinationRoute('Login History', deviceItem) === null,
  'A Device ID must not be injected into Login History.',
);
assert(
  buildQuickPadDestinationRoute('Financial Investigation', [{
    label: 'Email',
    value: 'learner@example.test',
  }]) === null,
  'Financial Investigation must reject unrelated labels.',
);

const transactionItem = {
  label: 'Transaction ID',
  value: 'TXN-TRAINING-001',
  sourceTool: 'Transaction History',
  sourceRecordId: 'TXN-TRAINING-001',
  identifierType: 'transaction-id',
};
const transactionRoute = buildQuickPadDestinationRoute(
  'Transaction History',
  [transactionItem],
);
assert(
  transactionRoute?.payload.query === 'TXN-TRAINING-001'
    && transactionRoute?.payload.sourceRecordId === 'TXN-TRAINING-001',
  'Transaction History must reopen with one exact typed Transaction ID.',
);
assert(
  quickPadItemSupportsTool(transactionItem, 'Transaction History')
    && quickPadSearchRoute(transactionItem, 'Transaction History')?.query === 'TXN-TRAINING-001',
  'Transaction History source routing must preserve its exact Transaction ID.',
);
assert(
  buildQuickPadDestinationRoute('Transaction History', [{
    label: 'Record ID',
    value: 'TXN-TRAINING-001',
  }]) === null
    && buildQuickPadDestinationRoute('Transaction History', [{
      label: 'Merchant Name',
      value: 'Training Merchant',
    }]) === null,
  'Transaction History must reject generic record and merchant labels.',
);
assert(
  buildQuickPadDestinationRoute('Transaction History', [
    transactionItem,
    { ...transactionItem, value: 'TXN-TRAINING-002', sourceRecordId: 'TXN-TRAINING-002' },
  ]) === null,
  'Transaction History must reject an ambiguous Quick Pad containing multiple Transaction IDs.',
);
assert(
  quickPadSourceRoute(transactionItem, {
    availableTools: ['Business 360', 'Payroll History'],
  }) === null,
  'Transaction History must not reopen when it is unavailable for the active case.',
);

const payrollIdentifiers = [
  ['payroll-profile-id', 'Payroll Profile ID', 'PAYROLL-TRAINING-001'],
  ['payroll-run-id', 'Payroll Run ID', 'FA-PDD-G001-PR-4'],
  ['employee-id', 'Employee ID', 'FA-PDD-G001-EMP-1'],
  ['paystub-id', 'Paystub ID', 'FA-PDD-G001-PR-4-STUB-EMP-1'],
  ['payment-destination-record-id', 'Payment Destination Record ID', 'FA-PDD-G001-PD-1'],
  ['destination-id', 'Destination ID', 'DST-PAYROLL-001'],
  ['bank-code', 'Bank Code', 'BC-PAYROLL-001'],
  ['payment-record-id', 'Payment Record ID', 'PV-PAYROLL-001'],
  ['funding-bank-code', 'Funding Bank Code', 'BC-FUNDING-001'],
  ['funding-payment-record-id', 'Funding Payment Record ID', 'PV-FUNDING-001'],
];
for (const [identifierType, label, identifier] of payrollIdentifiers) {
  const item = payrollQuickPadItem({
    tool: 'Payroll History',
    query: identifier,
    value: `${identifier} · decorated display label`,
    identifierType,
  });
  assert(
    item?.label === label
      && item.value === identifier
      && item.sourceRecordId === identifier
      && item.identifierType === identifierType,
    `Payroll History must preserve and accurately label the exact ${identifierType}.`,
  );
  const route = buildQuickPadDestinationRoute('Payroll History', [item]);
  assert(
    route?.payload.query === identifier
      && route?.payload.sourceRecordId === identifier
      && route?.payload.identifierType === identifierType,
    `Payroll History must reopen the exact ${identifierType} without display-label text.`,
  );
  assert(
    quickPadItemSupportsTool(item, 'Payroll History')
      && quickPadSearchRoute(item, 'Payroll History')?.query === identifier,
    `Payroll History source routing must support the exact ${identifierType}.`,
  );
}
const legacyDecoratedPayrollPin = payrollQuickPadItem({
  tool: 'Payroll History',
  value: 'FA-PDD-G001-PR-3 · payroll evidence',
  identifierType: 'payroll-run-id',
});
assert(
  legacyDecoratedPayrollPin?.value === 'FA-PDD-G001-PR-3'
    && legacyDecoratedPayrollPin?.sourceRecordId === 'FA-PDD-G001-PR-3',
  'A decorated Payroll History pin must be normalized back to its clean identifier.',
);
assert(
  buildQuickPadDestinationRoute('Payroll History', [{
    label: 'Payroll Run ID',
    value: 'FA-PDD-G001-PR-2 · display only',
    sourceTool: 'Payroll History',
    sourceRecordId: 'FA-PDD-G001-PR-2',
    identifierType: 'payroll-run-id',
  }])?.payload.query === 'FA-PDD-G001-PR-2',
  'Payroll History destination routing must prefer the exact source identifier over a decorated value.',
);
assert(
  buildQuickPadDestinationRoute('Payroll History', [{
    label: 'Record ID',
    value: 'FA-PDD-G001-PR-2',
    sourceTool: 'Payroll History',
    sourceRecordId: 'FA-PDD-G001-PR-2',
  }]) === null,
  'Payroll History must reject untyped generic record labels.',
);

const employeeProfileItem = {
  label: 'Employee ID',
  value: 'FA-PDD-G001-EMP-2',
  sourceTool: 'Employee Profile',
  sourceRecordId: 'FA-PDD-G001-EMP-2',
  identifierType: 'employee-id',
};
const employeeProfileRoute = buildQuickPadDestinationRoute(
  'Employee Profile',
  [employeeProfileItem],
);
assert(
  employeeProfileRoute?.payload.query === 'FA-PDD-G001-EMP-2'
    && employeeProfileRoute?.payload.sourceRecordId === 'FA-PDD-G001-EMP-2'
    && employeeProfileRoute?.payload.identifierType === 'employee-id',
  'Employee Profile must reopen with one exact typed Employee ID.',
);
assert(
  quickPadItemSupportsTool(employeeProfileItem, 'Employee Profile')
    && quickPadSearchRoute(employeeProfileItem, 'Employee Profile')?.query === 'FA-PDD-G001-EMP-2',
  'Employee Profile source routing must preserve its exact Employee ID.',
);
assert(
  buildQuickPadDestinationRoute('Employee Profile', [{
    ...employeeProfileItem,
    value: 'FA-PDD-G001-EMP-2 · decorated employee label',
  }])?.payload.query === 'FA-PDD-G001-EMP-2',
  'Employee Profile destination routing must prefer the exact source Employee ID over decorated display text.',
);
assert(
  buildQuickPadDestinationRoute('Employee Profile', [{
    label: 'Record ID',
    value: 'FA-PDD-G001-EMP-2',
    sourceTool: 'Employee Profile',
    sourceRecordId: 'FA-PDD-G001-EMP-2',
  }]) === null,
  'Employee Profile must reject an untyped generic record label.',
);
assert(
  buildQuickPadDestinationRoute('Employee Profile', [
    employeeProfileItem,
    {
      ...employeeProfileItem,
      value: 'FA-PDD-G001-EMP-3',
      sourceRecordId: 'FA-PDD-G001-EMP-3',
    },
  ]) === null,
  'Employee Profile must reject an ambiguous Quick Pad containing multiple Employee IDs.',
);
assert(
  quickPadSourceRoute(employeeProfileItem, {
    availableTools: ['Payroll History', 'Payment Verification'],
  }) === null,
  'Employee Profile must not reopen when it is unavailable for the active case.',
);

const merchantItem = {
  label: 'Merchant Name',
  value: 'Blue Sky Market',
  merchantName: 'Blue Sky Market',
  sourceTool: 'Merchant Intelligence',
  sourceRecordId: 'MERCHANT-PACKET-001',
};
const merchantRoute = buildQuickPadDestinationRoute('Merchant Intelligence', [merchantItem]);
assert(
  merchantRoute?.payload.query === 'Blue Sky Market'
    && merchantRoute?.payload.label === 'Merchant Name',
  'Merchant Intelligence must reopen with the exact pinned Merchant Name.',
);
assert(
  quickPadItemSupportsTool(merchantItem, 'Merchant Intelligence')
    && quickPadSearchRoute(merchantItem, 'Merchant Intelligence')?.query === 'Blue Sky Market',
  'Merchant Intelligence source routing must preserve the typed merchant-name query.',
);
assert(
  buildQuickPadDestinationRoute('Merchant Intelligence', [{
    label: 'Merchant ID',
    value: 'MER-001',
  }]) === null,
  'Merchant Intelligence must reject untyped merchant display identifiers.',
);
const merchantRecordItem = {
  label: 'Merchant Record ID',
  value: 'TXN-TS-200',
  sourceTool: 'Merchant Intelligence',
  sourceRecordId: 'TXN-TS-200',
  identifierType: 'record-id',
};
const merchantRecordRoute = buildQuickPadDestinationRoute(
  'Merchant Intelligence',
  [merchantRecordItem],
);
assert(
  merchantRecordRoute?.payload.query === 'TXN-TS-200'
    && merchantRecordRoute?.payload.identifierType === 'record-id',
  'Merchant Intelligence must reopen an explicitly typed source-record lookup.',
);
for (const [label, value, identifierType] of [
  ['Merchant Legal Name', 'Blue Sky Market LLC', 'legal-name'],
  ['Merchant Descriptor', 'BLUESKY*MKT', 'descriptor'],
  ['Merchant MCC', '5411', 'mcc'],
]) {
  const typedRoute = buildQuickPadDestinationRoute('Merchant Intelligence', [{
    label,
    value,
    sourceTool: 'Merchant Intelligence',
    sourceRecordId: 'MERCHANT-PACKET-001',
    identifierType,
  }]);
  assert(
    typedRoute?.payload.query === value
      && typedRoute?.payload.identifierType === identifierType,
    `Merchant Intelligence must preserve the exact ${identifierType} lookup.`,
  );
}

const documentRequestItem = {
  label: 'Document Request ID',
  value: 'REQ-TRAINING-001',
  requestId: 'REQ-TRAINING-001',
  sourceDocumentId: 'DOC-TRAINING-001',
  sourceTool: 'Document Request',
  sourceRecordId: 'REQ-TRAINING-001',
};
const documentRequestRoute = buildQuickPadDestinationRoute('Document Request', [documentRequestItem]);
assert(
  documentRequestRoute?.payload.query === 'REQ-TRAINING-001'
    && documentRequestRoute?.payload.sourceRecordId === 'REQ-TRAINING-001',
  'Document Request must reopen with the exact pinned request ID.',
);
assert(
  quickPadItemSupportsTool(documentRequestItem, 'Document Request')
    && quickPadSearchRoute(documentRequestItem, 'Document Request')?.query === 'REQ-TRAINING-001',
  'Document Request source routing must preserve the typed request ID.',
);

const sourceDocumentItem = {
  label: 'Source Document ID',
  sourceDocumentId: 'DOC-TRAINING-002',
  sourceTool: 'Document Request',
  sourceRecordId: 'REQUEST-HISTORY-002',
};
const sourceDocumentRoute = buildQuickPadDestinationRoute('Document Request', [sourceDocumentItem]);
assert(
  sourceDocumentRoute?.payload.query === 'DOC-TRAINING-002'
    && sourceDocumentRoute?.payload.sourceRecordId === 'DOC-TRAINING-002',
  'Document Request must use sourceDocumentId as the exact query when no request ID is supplied.',
);
assert(
  buildQuickPadDestinationRoute('Document Request', [{
    label: 'Document ID',
    value: 'DOC-VIEWER-ONLY',
  }]) === null,
  'Document Request must not accept a generic Document Viewer ID label.',
);

const systemAccessItem = {
  label: 'System Access Record ID',
  value: 'SYS-ATO-002',
  sourceTool: 'System Access Lane',
  sourceRecordId: 'SYS-ATO-002',
  identifierType: 'system-access-record-id',
};
const systemAccessRoute = buildQuickPadDestinationRoute(
  'System Access Lane',
  [systemAccessItem],
);
assert(
  systemAccessRoute?.payload.query === 'SYS-ATO-002'
    && systemAccessRoute?.payload.sourceRecordId === 'SYS-ATO-002'
    && systemAccessRoute?.payload.identifierType === 'system-access-record-id',
  'System Access Lane must reopen with the exact typed supplied record ID.',
);
assert(
  buildQuickPadDestinationRoute('System Access Lane', [{
    ...systemAccessItem,
    label: 'Record ID',
  }]) === null
    && buildQuickPadDestinationRoute('System Access Lane', [
      systemAccessItem,
      {
        ...systemAccessItem,
        value: 'SYS-ATO-003',
        sourceRecordId: 'SYS-ATO-003',
      },
    ]) === null,
  'System Access Lane must reject generic or ambiguous Quick Pad record identifiers.',
);

console.log('Quick Pad controller smoke check passed for destination-specific routes, exact Payroll and System Access identifiers, Merchant and Document Request reopening, and correlated Payment Verification identifiers.');
