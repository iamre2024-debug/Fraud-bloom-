import {
  buildQuickPadDestinationPayload,
  buildQuickPadDestinationRoute,
  validateQuickPadDestinationPayload,
} from '../src/data/quickPadController.js';

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

console.log('Quick Pad controller smoke check passed for destination-specific routes and correlated Payment Verification identifiers.');
