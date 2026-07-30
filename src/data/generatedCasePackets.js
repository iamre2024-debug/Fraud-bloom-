import {
  CUSTOMER_TYPES,
  FINAL_FINDINGS,
  PRODUCT_TYPES,
  WORKFLOW_TYPES,
} from './caseDomain.js';
import { createCompanyPayrollData } from './payrollDataModel.js';

const merchantNames = [
  ['Northstar Digital Market', '5734', 'Computer software and digital goods', 'Austin, TX'],
  ['Cedar Square Outfitters', '5651', 'Family clothing stores', 'Fort Worth, TX'],
  ['Riverbend Home Goods', '5712', 'Furniture and home furnishings', 'Plano, TX'],
  ['Juniper Tech Outlet', '5732', 'Electronics stores', 'Dallas, TX'],
  ['Lakeside Event Services', '7299', 'Business and personal services', 'Grapevine, TX'],
  ['Oakline Games', '5816', 'Digital games and media', 'Seattle, WA'],
  ['BrightCart Online', '5399', 'General merchandise ecommerce', 'Phoenix, AZ'],
  ['Cedar Table Restaurant', '5812', 'Eating places and restaurants', 'Arlington, TX'],
  ['Planwell Learning', '8299', 'Educational services', 'Chicago, IL'],
  ['StreamBox Premium', '4899', 'Digital subscription services', 'San Jose, CA'],
  ['Northline Apparel', '5691', 'Clothing stores', 'Irving, TX'],
  ['Harbor Electronics', '5732', 'Electronics stores', 'Denver, CO'],
];

const creditBureaus = ['Training Bureau North', 'Training Bureau Central', 'Training Bureau South'];

function stableNumber(value = '') {
  return [...String(value)].reduce((total, character) => ((total * 33) + character.charCodeAt(0)) % 2147483647, 5381);
}

function numberFromMoney(value = '') {
  return Number(String(value).replace(/[^0-9.]/g, '')) || 0;
}

function money(value = 0) {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(value);
}

function shiftedDate(displayDate, days) {
  const date = new Date(displayDate);
  if (Number.isNaN(date.getTime())) return displayDate;
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function deadlineFrom(displayDate, days, time) {
  return `${shiftedDate(displayDate, days)} - ${time}`;
}

function pick(values, seed, offset = 0) {
  return values[(Math.abs(seed) + offset) % values.length];
}

function determinationTone(scenario) {
  const finding = scenario.caseTruth?.finalFinding ?? '';
  if ([FINAL_FINDINGS.FRAUD_CONFIRMED].includes(finding)) return 'exception';
  if ([FINAL_FINDINGS.FRAUD_NOT_FOUND, FINAL_FINDINGS.NON_FRAUD_DISPUTE].includes(finding)) return 'established';
  const choice = scenario.caseTruth?.operationalDecision ?? scenario.caseTruth?.correctDetermination ?? '';
  if (/partial|insufficient|more information|request|escalate|unable|restriction/i.test(choice)) return 'mixed';
  return 'established';
}

function creditDeterminationTone(scenario) {
  const finding = scenario.caseTruth?.finalFinding ?? '';
  if (finding === FINAL_FINDINGS.FRAUD_CONFIRMED) return 'exception';
  if (finding === FINAL_FINDINGS.VERIFICATION_INCOMPLETE) return 'mixed';
  const choice = scenario.caseTruth?.operationalDecision ?? scenario.caseTruth?.correctDetermination ?? '';
  if (/maintain|^approve$|release/i.test(choice)) return 'established';
  if (/more information|escalate|request|restriction|hold|unable/i.test(choice)) return 'mixed';
  return 'exception';
}

function generationSignal(scenario) {
  return scenario.generationKey ?? scenario.subtype ?? '';
}

function productRailFor(claimType, scenario) {
  const productType = scenario.productType ?? scenario.taxonomyTags?.productType;
  if (productType === PRODUCT_TYPES.CREDIT_CARD || productType === PRODUCT_TYPES.BUSINESS_CREDIT_CARD) return 'card';
  if (productType === PRODUCT_TYPES.PAYROLL_PRODUCT) return 'payroll';
  if (productType === PRODUCT_TYPES.PERSONAL_LOAN || productType === PRODUCT_TYPES.BUSINESS_LOAN) return 'loan';
  if (scenario.workflowType === WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM || scenario.workflowType === WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW) return 'ach';
  if ([WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM, WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW, WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT].includes(scenario.workflowType)) return 'wire';
  return scenario.taxonomyTags?.productRail ?? claimType.taxonomy.productRail;
}

function merchantChannel(subtype = '') {
  if (/wallet/i.test(subtype)) return 'Digital wallet';
  if (/ATM/i.test(subtype)) return 'ATM';
  if (/lost|stolen|counterfeit|incorrect amount/i.test(subtype)) return 'In-store';
  if (/subscription|cancel|recurring/i.test(subtype)) return 'Recurring';
  return 'Online';
}

function entryMode(subtype = '') {
  if (/wallet/i.test(subtype)) return 'Tokenized wallet credential';
  if (/ATM/i.test(subtype)) return 'EMV chip and PIN';
  if (/counterfeit/i.test(subtype)) return 'Magnetic-stripe fallback';
  if (/lost|stolen|incorrect amount/i.test(subtype)) return 'EMV chip or contactless';
  if (/subscription|cancel|recurring/i.test(subtype)) return 'Stored credential / recurring';
  return 'Card not present';
}

function reasonCodeFor(subtype = '') {
  const mappings = [
    [/duplicate/i, 'Training duplicate-processing review'],
    [/incorrect amount/i, 'Training incorrect-amount review'],
    [/refund not received|return credit/i, 'Training credit-not-processed review'],
    [/cancel|subscription/i, 'Training canceled-recurring-transaction review'],
    [/not as described/i, 'Training merchandise-not-as-described review'],
    [/services not rendered/i, 'Training services-not-provided review'],
    [/ATM/i, 'Training cash-withdrawal authorization review'],
    [/wallet/i, 'Training tokenized-card authorization review'],
    [/lost|stolen|never received|counterfeit|CNP|online purchase/i, 'Training unauthorized-card-activity review'],
  ];
  return mappings.find(([pattern]) => pattern.test(subtype))?.[1] ?? 'Training card-dispute review';
}

function fulfillmentFor(subtype = '', tone = 'mixed') {
  if (/duplicate/i.test(subtype)) return 'Two settled transactions map to the same order and fulfillment record';
  if (/incorrect amount/i.test(subtype)) return 'Signed receipt total differs from the posted transaction amount';
  if (/refund not received/i.test(subtype)) return 'Merchant credit confirmation exists without a matching posted credit';
  if (/return credit/i.test(subtype)) return 'Carrier and warehouse records show the returned item was received';
  if (/canceled service/i.test(subtype)) return 'Customer and merchant records show different cancellation-effective dates';
  if (/not as described/i.test(subtype)) return 'Listing and received-item records differ, while part of the order remains with the customer';
  if (/services not rendered/i.test(subtype)) return 'Merchant schedule shows the service was canceled and not rescheduled';
  if (/subscription terms/i.test(subtype)) return 'Checkout and renewal-notice records show the subscription terms presented to the customer';
  return tone === 'established' ? 'Customer address and recipient fields match' : tone === 'mixed' ? 'One order field matches and one differs' : 'Delivery or service record does not match the customer profile';
}

function makeMerchantPacket({ id, index, claimType, scenario, person, reportedDate, issueStartDate, amount, recordCount, difficulty }) {
  const seed = stableNumber(`${id}-${scenario.id}`);
  const [fallbackName, mcc, category, location] = pick(merchantNames, seed);
  const transactionLabel = scenario.transactionInfo.split(' - ')[0].trim();
  const scenarioMerchant = transactionLabel.replace(/\s+(purchase|billing|payment|order|disputes?|activity)$/i, '').trim();
  const name = /merchant|retail|online|card|transaction/i.test(scenarioMerchant) && scenarioMerchant.split(/\s+/).length < 3 ? fallbackName : scenarioMerchant || fallbackName;
  const tone = determinationTone(scenario);
  const signal = generationSignal(scenario);
  const authorizationTone = claimType.id === WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE ? 'established' : tone;
  const channel = merchantChannel(signal);
  const authEntryMode = entryMode(signal);
  const priorCount = Math.max(1, recordCount - 1);
  const disputeCount = /first-party/i.test(signal) ? 2 + (seed % 3) : seed % 2;
  const refundCount = /refund|return|cancel/i.test(signal) ? 1 + (seed % 3) : seed % 2;
  const attemptCount = difficulty === 'deep' ? 4 : difficulty === 'standard' ? 2 : 1;
  const declineCount = authorizationTone === 'exception' ? Math.min(2, attemptCount - 1) : seed % 2;
  const orderId = `ORD-${String(seed).slice(-7).padStart(7, '0')}`;
  const authorizationId = `AUTH-${String(seed * 7).slice(-8).padStart(8, '0')}`;
  const deliveryMatch = fulfillmentFor(signal, tone);
  const deviceMatch = authorizationTone === 'established' ? 'Established customer device' : authorizationTone === 'mixed' ? 'Device seen once in prior browsing history' : 'Device not found in prior customer history';
  const avs = authorizationTone === 'established' ? 'Full street and postal-code match' : authorizationTone === 'mixed' ? 'Postal code match only' : 'No match';
  const cvv = authorizationTone === 'established' ? 'Match' : authorizationTone === 'mixed' ? 'Not supplied by merchant' : 'Mismatch or not processed';
  const auth = {
    id: authorizationId,
    authorizedAt: `${issueStartDate} - 6:42 PM`,
    amount: money(amount),
    entryMode: authEntryMode,
    avs,
    cvv,
    threeDS: /online|CNP|wallet/i.test(`${signal} ${channel}`) ? (authorizationTone === 'established' ? 'Challenge completed' : 'No challenge result supplied') : 'Not applicable',
    otp: /wallet/i.test(signal) ? (authorizationTone === 'established' ? 'OTP completed on established device' : 'OTP destination changed before enrollment') : 'Not used for this authorization',
    walletToken: /wallet/i.test(signal) ? `TKN-${String(seed).slice(-6)} - ${deviceMatch}` : 'No wallet token in scope',
    device: deviceMatch,
    ip: authorizationTone === 'established' ? '198.51.100.42 - previously recorded training range' : '203.0.113.84 - new training range',
    attempts: `${attemptCount} attempt${attemptCount === 1 ? '' : 's'}; ${declineCount} declined before settlement`,
  };
  const responseStatus = seed % 7 === 0 ? 'Pending' : seed % 5 === 0 ? 'Accepted' : 'Challenged';
  const response = {
    status: responseStatus,
    receivedDate: responseStatus === 'Pending' ? 'Pending' : `${shiftedDate(reportedDate, 1)} - 2:14 PM`,
    cancellationRequestFound: /cancel|subscription|recurring/i.test(signal)
      ? responseStatus === 'Accepted' ? 'Not contested' : 'No completed request located'
      : 'Not applicable to this dispute type',
    refundIssued: responseStatus === 'Accepted' ? 'Chargeback accepted; issuer credit review pending' : refundCount ? 'Refund entry recorded' : 'No',
  };
  const profile = {
    name,
    legalName: `${name} Training Commerce LLC`,
    descriptor: name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18),
    mcc,
    category,
    location,
    channel,
    website: `https://${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example.test`,
    firstUsed: priorCount ? shiftedDate(issueStartDate, -(120 + (seed % 600))) : issueStartDate,
    priorTransactionCount: priorCount,
    priorDisputeCount: disputeCount,
    refundCount,
    attemptedTransactions: attemptCount,
    declinedTransactions: declineCount,
  };
  const records = [
    {
      id: `${id}-MER-PROFILE`, section: 'overview', title: 'Merchant identity and category', status: 'Record available', observed: reportedDate,
      summary: `${name} is recorded under MCC ${mcc} for ${category.toLowerCase()}.`,
      fields: [['Merchant name', name], ['Legal name', profile.legalName], ['Descriptor', profile.descriptor], ['MCC', mcc], ['Category', category], ['Location', location], ['Channel', channel], ['Website', profile.website]],
      relatedRecords: [orderId, authorizationId],
    },
    {
      id: `${id}-MER-HISTORY`, section: 'history', title: 'Customer and merchant history', status: 'History available', observed: reportedDate,
      summary: `${priorCount} prior transaction(s), ${disputeCount} prior dispute(s), and ${refundCount} prior refund(s) are recorded.`,
      fields: [['First used', profile.firstUsed], ['Prior transaction count', priorCount], ['Prior dispute count', disputeCount], ['Refund count', refundCount], ['Prior relationship', priorCount ? 'Recorded in customer transaction history' : 'No prior customer transaction located']],
      relatedRecords: Array.from({ length: Math.min(recordCount, Math.max(1, priorCount)) }, (_, itemIndex) => `${id}-TXN-${itemIndex + 2}`),
    },
    {
      id: `${id}-MER-AUTH`, section: 'authorization', title: 'Authorization and order match', status: 'Packet available', observed: issueStartDate,
      summary: `${authEntryMode}; AVS ${avs.toLowerCase()}; CVV ${cvv.toLowerCase()}.`,
      fields: [['Authorization ID', authorizationId], ['Order ID', orderId], ['Authorized amount', money(amount)], ['Entry mode', authEntryMode], ['AVS', avs], ['CVV', cvv], ['3DS', auth.threeDS], ['OTP', auth.otp], ['Wallet token', auth.walletToken], ['Device', auth.device], ['IP record', auth.ip], ['Attempts', auth.attempts]],
      relatedRecords: [authorizationId, `${id}-TXN-1`],
    },
    {
      id: `${id}-MER-FULFILLMENT`, section: 'fulfillment', title: 'Delivery, service, or usage record', status: /requested|missing/i.test(deliveryMatch) ? 'Requested' : 'Record available', observed: shiftedDate(issueStartDate, 2),
      summary: deliveryMatch,
      fields: [['Order ID', orderId], ['Fulfillment type', /digital|subscription/i.test(category) ? 'Digital activation or service access' : 'Carrier or merchant delivery'], ['Address / recipient comparison', deliveryMatch], ['Usage or activation', tone === 'established' ? 'Recorded after purchase' : tone === 'mixed' ? 'Partial activity recorded' : 'No supported customer usage supplied'], ['Merchant response', difficulty === 'light' ? 'Summary response supplied' : 'Detailed response packet available in Document Viewer']],
      relatedRecords: [orderId, `${id}-DOC-1`],
    },
    {
      id: `${id}-MER-DISPUTES`, section: 'disputes', title: 'Disputes, refunds, and customer contact', status: 'History available', observed: reportedDate,
      summary: `Prior disputes: ${disputeCount}; refunds: ${refundCount}; current contact record is included in the case packet.`,
      fields: [['Prior disputes', disputeCount], ['Prior refunds', refundCount], ['Customer contact', scenario.channel], ['Cancellation or return context', /cancel|return|refund/i.test(signal) ? 'Merchant and customer records are both available for date comparison' : 'No cancellation or return is central to this review'], ['Current response status', difficulty === 'deep' ? 'Merchant response contains an additional record requiring reconciliation' : 'Merchant response available']],
      relatedRecords: [`${id}-DOC-1`, `${id}-INT-1`],
    },
    {
      id: `${id}-MER-REASON`, section: 'reason-code', title: 'Reason-code evidence checklist', status: 'Training guide available', observed: reportedDate,
      summary: `${reasonCodeFor(signal)} is the recorded training standard for this packet.`,
      fields: [['Reason-code guide', reasonCodeFor(signal)], ['Required authorization evidence', 'Authorization ID, entry mode, AVS/CVV, device or token context'], ['Required merchant evidence', 'Order, response, fulfillment or service, and customer-contact history'], ['Response deadline', deadlineFrom(reportedDate, 10, '3:00 PM')], ['Provisional-credit context', 'Training status recorded separately; no outcome is assigned here']],
      relatedRecords: [authorizationId, orderId, `${id}-DOC-1`],
    },
  ];

  if (difficulty === 'deep') {
    records.push({
      id: `${id}-MER-COMPARISON`, section: 'marketplace', title: 'Marketplace and subscription comparison', status: 'Comparison available', observed: reportedDate,
      summary: 'An additional merchant-account or subscription record must be reconciled with the card transaction.',
      fields: [['Merchant account login', deviceMatch], ['Subscription status', /subscription|cancel|recurring/i.test(signal) ? 'Enrollment and cancellation dates differ across sources' : 'No recurring enrollment in scope'], ['Marketplace account', /online|digital/i.test(`${channel} ${category}`) ? 'Marketplace order account available' : 'Not applicable']