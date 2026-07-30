// Scenario-aware merchant, network, and document packet builder.
import { getEvidenceRecords, getFinancialRecords } from './caseToolData.js';
import { WORKFLOW_TYPES } from './caseDomain.js';

export const merchantIntelligenceTabs = [
  { id: 'claim-details', label: 'Claim Details' },
  { id: 'network-submission', label: 'Network Submission' },
  { id: 'merchant-response', label: 'Merchant Response' },
  { id: 'customer-evidence', label: 'Customer Evidence' },
  { id: 'visa-requirements', label: 'Visa Requirements' },
  { id: 'case-status', label: 'Case Status' },
];

function stableNumber(value = '') {
  return [...String(value)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) % 100000, 17);
}

function parseDisplayDate(value) {
  const date = new Date(String(value ?? '').replace(/\s+[·-]\s+\d{1,2}:\d{2}.*$/i, ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDisplayDate(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
}

function shiftedDisplayDate(value, days) {
  const date = parseDisplayDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return formatDisplayDate(date);
}

function recurringCadence(transactions = []) {
  const dated = transactions.map((item) => parseDisplayDate(item.posted)).filter(Boolean).sort((left, right) => left - right);
  if (dated.length < 2) return { label: 'Recurring cadence recorded', days: 30 };
  const gap = Math.round((dated[1] - dated[0]) / 86400000);
  if (gap >= 330) return { label: 'Annual recurring renewal', days: 365 };
  if (gap >= 80) return { label: 'Quarterly recurring renewal', days: 90 };
  if (gap >= 25) return { label: 'Monthly recurring renewal', days: 30 };
  if (gap >= 6) return { label: 'Weekly recurring renewal', days: 7 };
  return { label: `Recurring every ${Math.max(1, gap)} days`, days: Math.max(1, gap) };
}

function cardSuffix(transactions = []) {
  return transactions.find((item) => /ending\s+\d{4}/i.test(item.instrument ?? ''))?.instrument?.match(/ending\s+(\d{4})/i)?.[1] ?? 'not supplied';
}

function merchantCategory(name = '', channel = '') {
  if (/stream|subscription|recurring/i.test(`${name} ${channel}`)) return ['4899', 'Digital subscription services'];
  if (/air|flight|travel|hotel|lodging/i.test(`${name} ${channel}`)) return ['4722', 'Travel services'];
  if (/restaurant|food|table/i.test(name)) return ['5812', 'Eating places and restaurants'];
  if (/digital|online|marketplace/i.test(`${name} ${channel}`)) return ['5734', 'Digital goods and online retail'];
  return ['5399', 'General merchandise'];
}

function merchantNameFor(activeCase, transactions = [], generated = {}) {
  return generated.profile?.name ?? transactions[0]?.merchant ?? activeCase.transactionInfo?.split(/[·-]/)[0]?.trim() ?? 'Training merchant';
}

function scenarioFor(activeCase = {}, merchantName = '') {
  const source = [activeCase.claimTypeId, activeCase.subtype, activeCase.scenarioTitle, activeCase.scenarioFamily, activeCase.statement?.value, activeCase.chargebackDecision?.reasonCode, merchantName].filter(Boolean).join(' ');
  const subtype = String(activeCase.subtype ?? '');
  if (
    (activeCase.workflowType ?? activeCase.claimTypeId) === WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM
    || activeCase.claimTypeId === 'fraud-chargeback'
  ) return {
    id: 'unauthorized-transaction', label: 'Unauthorized transaction dispute',
    customerRequirements: ['Customer unauthorized-activity statement', 'Card possession and recognition details', 'Recognized device or wallet information', 'Prior merchant relationship, if any', 'Relevant account-security documentation'],
    visaRequirements: ['Transaction authorization data is reviewed', 'Card-present, wallet, or card-not-present indicators are identified', 'Merchant order and fulfillment records are compared', 'Customer recognition and prior merchant history are documented', 'Filing and response deadlines remain open'],
  };
  if (/refund not|credit not|return credit|refund\/return abuse/i.test(source)) return {
    id: 'credit-not-processed', label: /abuse/i.test(subtype) ? 'Refund or return dispute' : 'Credit or refund not processed',
    customerRequirements: ['Return or cancellation receipt', 'Promised refund amount and date', 'Original purchase record', 'Merchant communication confirming the credit', 'Statement showing the credit is absent'],
    visaRequirements: ['Original transaction and expected credit are linked', 'Merchant promised or issued a credit', 'Expected credit processing time has passed', 'Account history is checked for a posted credit', 'Filing and response deadlines remain open'],
  };
  if (/digital goods used|dispute after usage/i.test(subtype)) return {
    id: 'usage-dispute', label: 'Digital goods or service usage dispute',
    customerRequirements: ['Customer statement describing the disputed purchase', 'Recognized account and device details', 'Any household-member access information', 'Merchant contact attempting resolution', 'Relevant cancellation or refund communication'],
    visaRequirements: ['Transaction authorization data is reviewed', 'Merchant account identity is compared with the customer', 'Download, login, playback, or service-usage records are reviewed', 'Prior merchant history is documented', 'Filing and response deadlines remain open'],
  };
  if (activeCase.claimTypeId === 'first-party-fraud' && /friendly fraud|household member|digital goods|usage/i.test(subtype)) return {
    id: 'usage-dispute', label: 'Customer account usage dispute',
    customerRequirements: ['Customer statement describing the disputed purchase', 'Recognized account and household access details', 'Recognized device information', 'Merchant contact attempting resolution', 'Relevant cancellation or refund communication'],
    visaRequirements: ['Transaction authorization data is reviewed', 'Merchant account identity is compared with the customer', 'Download, login, playback, or service-usage records are reviewed', 'Prior claim and merchant history are documented separately', 'Filing and response deadlines remain open'],
  };
  if (/subscription terms|trial.*convert|annual subscription/i.test(source)) return {
    id: 'subscription-terms', label: 'Subscription enrollment and terms dispute',
    customerRequirements: ['Customer statement about the enrollment or trial', 'Checkout or trial terms shown to the customer', 'Renewal or conversion notice received', 'Merchant contact attempting resolution', 'Any cancellation or refund communication'],
    visaRequirements: ['Enrollment and disputed renewal are linked', 'Price and renewal cadence disclosures are reviewed', 'Trial conversion or renewal notice is documented', 'Usage and merchant-contact records are compared', 'Filing and response deadlines remain open'],
  };
  if (/cancel|recurring|subscription|renewal/i.test(source)) return {
    id: 'recurring-cancellation', label: 'Recurring billing dispute',
    customerRequirements: ['Cancellation confirmation or receipt', 'Date and method of cancellation', 'Email, chat, or call proof', 'Evidence cancellation occurred before renewal', 'Any merchant acknowledgement'],
    visaRequirements: ['Disputed transaction and cancellation date are identified', 'Customer attempted cancellation before the billed service period', 'Merchant cancellation or refund terms are documented', 'Customer and merchant communications are preserved', 'Filing and response deadlines remain open'],
  };
  if (/not received|non.?receipt|delivery|merchandise.*missing/i.test(source)) return {
    id: 'merchandise-not-received', label: 'Merchandise not received',
    customerRequirements: ['Order confirmation or receipt', 'Expected delivery date and address', 'Merchant contact attempting resolution', 'Statement that goods were not received', 'Any carrier or delivery communication'],
    visaRequirements: ['Transaction and purchased merchandise are identified', 'Expected delivery date has passed', 'Delivery evidence is compared with the customer address', 'Customer attempted merchant resolution when required', 'Response deadline remains open'],
  };
  if (/item not as described|merchandise.*not as described|listing mismatch/i.test(source)) return {
    id: 'merchandise-not-as-described', label: 'Merchandise not as described',
    customerRequirements: ['Order receipt and product listing', 'Photos or inspection record showing the difference', 'Return request and merchant response', 'Description of the material mismatch', 'Any refund, replacement, or return record'],
    visaRequirements: ['Purchased merchandise and listing are identified', 'The alleged material difference is documented', 'Return or resolution requirements are reviewed', 'Merchant fulfillment and response records are compared', 'Filing and response deadlines remain open'],
  };
  if (/service.*not|not provided|quality|not as described/i.test(source)) return {
    id: 'service-dispute', label: /not as described|quality/i.test(source) ? 'Service not as described' : 'Service not provided',
    customerRequirements: ['Service agreement, booking, or receipt', 'Expected service date and location', 'Description of what was not provided', 'Merchant contact attempting resolution', 'Photos, messages, or supporting records when relevant'],
    visaRequirements: ['Purchased service and service date are identified', 'Merchant fulfillment evidence is reviewed', 'Customer description is specific to the disputed service', 'Cancellation or refund terms are documented', 'Filing and response deadlines remain open'],
  };
  if (/duplicate|incorrect amount|altered amount|amount difference/i.test(source)) return {
    id: /duplicate/i.test(source) ? 'duplicate-processing' : 'incorrect-amount', label: /duplicate/i.test(source) ? 'Duplicate processing dispute' : 'Incorrect amount dispute',
    customerRequirements: ['Customer receipt or agreed amount', 'Both transaction dates and amounts', 'Proof only one purchase was made', 'Merchant contact attempting correction', 'Any refund or reversal record'],
    visaRequirements: ['Transactions are matched by amount, date, and merchant', 'Separate purchases are ruled in or out using receipts', 'Authorization and settlement records are compared', 'Any refund or reversal is accounted for', 'Filing and response deadlines remain open'],
  };
  const fraudSource = source.replace(/non[- ]?fraud(?: chargeback)?/gi, '');
  if (/fraud|unauthor|card.?not.?present|lost|stolen|wallet/i.test(fraudSource)) return {
    id: 'unauthorized-transaction', label: 'Unauthorized transaction dispute',
    customerRequirements: ['Customer fraud statement', 'Card possession and recognition details', 'Recognized device or wallet information', 'Prior merchant relationship, if any', 'Relevant account-security documentation'],
    visaRequirements: ['Transaction authorization data is reviewed', 'Card-present, wallet, or card-not-present indicators are identified', 'Merchant order and fulfillment records are compared', 'Customer recognition and prior merchant history are documented', 'Filing and response deadlines remain open'],
  };
  return {
    id: 'general-chargeback', label: activeCase.subtype || 'Merchant dispute',
    customerRequirements: ['Transaction receipt or order confirmation', 'Clear description of the dispute', 'Merchant contact attempting resolution', 'Relevant cancellation, return, or service dates', 'Supporting customer communication'],
    visaRequirements: ['Disputed transaction is identified', 'Claim category matches the customer allegation', 'Merchant response and supporting documents are reviewed', 'Missing customer evidence is requested', 'Filing and response deadlines remain open'],
  };
}

function documentBase({ id, title, source, kind, brand, department, date, reference, classification, mark, ...rest }) {
  return { id, title, source, kind, brand, department, date, reference, classification, mark, status: 'Available', icon: kind === 'email' ? 'MSG' : kind === 'log' ? 'LOG' : 'DOC', ...rest };
}

function transactionRows(transactions = [], merchantName, activeCase) {
  const source = transactions.length ? transactions : [{ posted: activeCase.reportedDate, merchant: merchantName, amount: activeCase.amount, status: 'Posted', channel: activeCase.lane }];
  return source.slice(0, 6).map((item) => [item.posted ?? 'Training date', item.merchant ?? merchantName, item.amount ?? activeCase.amount, item.status ?? 'Posted', item.channel ?? 'Card transaction']);
}

function buildMerchantDocuments({ activeCase, profile, scenario, transactions, responseDate, responseStatus, cancellationDate }) {
  const currentAmount = transactions[0]?.amount ?? activeCase.amount ?? '$0.00';
  const currentDate = transactions[0]?.posted ?? activeCase.reportedDate ?? 'Training date';
  const merchant = profile.name;
  const cadence = recurringCadence(transactions);
  const fulfillmentDate = activeCase.claimDetails?.expectedDeliveryDate ?? activeCase.claimDetails?.serviceOrDeliveryDate ?? currentDate;
  const earliestTransaction = transactions.map((item) => item.posted).filter(Boolean).sort((left, right) => (parseDisplayDate(left) ?? 0) - (parseDisplayDate(right) ?? 0))[0] ?? currentDate;
  const enrollmentDate = activeCase.subscription?.enrollmentDate ?? activeCase.claimDetails?.enrollmentOrTrialDate ?? shiftedDisplayDate(earliestTransaction, -cadence.days);
  const cancellationMethod = activeCase.claimDetails?.cancellationMethod ?? 'Not supplied at intake';
  const activityRows = [
    ...(cancellationDate !== 'Not supplied at intake' ? [[cancellationDate, 'Account settings accessed', cancellationMethod, 'Session recorded; completion not established']] : []),
    [`${currentDate} · 12:03 AM`, 'Subscription renewed', 'Stored credential', 'Completed'],
    [`${currentDate} · 7:42 PM`, 'Service usage event', 'Subscriber application', 'Usage record returned by merchant'],
    [responseDate, responseStatus === 'Pending' ? 'Response deadline pending' : 'Dispute response prepared', 'Merchant support', responseStatus],
  ];
  const common = [documentBase({
    id: `${activeCase.id}-MER-RSP`, title: 'Merchant response letter', source: merchant, kind: 'letter', brand: merchant, department: 'Disputes & Account Services', mark: profile.mark, date: responseDate, reference: `MR-${String(stableNumber(activeCase.id)).padStart(5, '0')}`, classification: 'MERCHANT RESPONSE', subject: `${scenario.label} · ${currentAmount} · ${currentDate}`, to: 'Card issuer disputes team', salutation: 'To the reviewing disputes specialist:',
    paragraphs: responseStatus === 'Accepted'
      ? [`${merchant} reviewed the disputed transaction and accepted the chargeback through the card-network response channel.`, 'The account and transaction references used for the response appear below. Any credit timing should be confirmed in the issuer account record.']
      : responseStatus === 'Pending'
        ? ['A complete merchant response has not been received. This placeholder records the submission reference and response deadline only.']
        : [`${merchant} reviewed the disputed transaction and is challenging the chargeback. The enclosed records reflect the merchant account, transaction, and service information used for the response.`, 'This statement represents the merchant position. The issuer should compare the enclosed source records with the customer claim and applicable card-network requirements.'],
    facts: [['Merchant account', `SB-${String(stableNumber(activeCase.id + merchant)).padStart(7, '0')}`], ['Disputed amount', currentAmount], ['Transaction date', currentDate], ['Response', responseStatus]],
    signature: { name: 'Merchant Disputes Team', role: `${merchant} · Account Resolution` },
  })];

  if (scenario.id === 'recurring-cancellation') return [...common,
    documentBase({ id: `${activeCase.id}-SUB-ENROLL`, title: 'Subscription enrollment record', source: merchant, kind: 'form', brand: merchant, department: 'Subscriber Account Record', mark: profile.mark, date: enrollmentDate, reference: `SUB-${stableNumber(activeCase.id + 'sub')}`, classification: 'SUBSCRIPTION RECORD', subject: 'Plan enrollment and renewal settings', facts: [['Subscriber', activeCase.person ?? 'Training customer'], ['Plan', `${merchant} recurring plan`], ['Enrollment date', enrollmentDate], ['Renewal cadence', cadence.label], ['Stored credential', `Card ending ${cardSuffix(transactions)}`], ['Account status', 'Active through current billing cycle']], paragraphs: ['This system-generated account record shows the subscription enrollment values stored by the merchant. Review the enrollment date, cadence, and account status against the customer statement.'], footer: 'Merchant subscriber system · Training record' }),
    documentBase({ id: `${activeCase.id}-BILL-HIST`, title: 'Billing history statement', source: merchant, kind: 'statement', brand: merchant, department: 'Subscriber Billing', mark: profile.mark, date: responseDate, reference: `BILL-${stableNumber(activeCase.id + 'bill')}`, classification: 'BILLING HISTORY', subject: 'Subscription billing activity', tables: [{ title: 'Account billing ledger', columns: ['Posted', 'Descriptor', 'Amount', 'Status', 'Type'], rows: transactionRows(transactions, merchant, activeCase) }], callout: { label: 'Ledger note', value: 'A posted refund or reversal would appear as a separate credit entry. Review the ledger rather than relying on the merchant statement alone.' } }),
    documentBase({ id: `${activeCase.id}-POLICY`, title: 'Terms and cancellation policy', source: merchant, kind: 'policy', brand: merchant, department: 'Terms of Service', mark: profile.mark, date: 'Effective Jan 1, 2026', reference: 'TOS-REC-2026.1', classification: 'POLICY EXCERPT', subject: 'Recurring subscription cancellation and renewal', paragraphs: ['Subscribers may cancel from Account Settings or through Subscriber Support. Cancellation stops the next renewal when the request is completed before the renewal date.', 'A cancellation request is complete when the account displays a confirmation number or Subscriber Support issues a written acknowledgement. Access may continue through the paid billing period.', 'Refund eligibility is reviewed under the plan terms and does not replace the requirement to retain cancellation confirmation.'], callout: { label: 'Investigator review', value: 'Compare the policy effective date, cancellation method, renewal date, and any confirmation supplied by either party.' } }),
    documentBase({ id: `${activeCase.id}-ACTIVITY`, title: 'Account activity log', source: merchant, kind: 'log', brand: merchant, department: 'Subscriber Activity', mark: profile.mark, date: responseDate, reference: `ACT-${stableNumber(activeCase.id + 'activity')}`, classification: 'SYSTEM ACTIVITY', subject: 'Account events around the claimed cancellation', tables: [{ title: 'Recorded account events', columns: ['Date / time', 'Event', 'Channel', 'Result'], rows: activityRows }], footer: 'System event export · Times displayed in merchant account timezone' }),
  ];

  if (scenario.id === 'subscription-terms') return [...common,
    documentBase({ id: `${activeCase.id}-SUB-ENROLL`, title: 'Subscription enrollment record', source: merchant, kind: 'form', brand: merchant, department: 'Subscriber Account Record', mark: profile.mark, date: enrollmentDate, reference: `SUB-${stableNumber(activeCase.id + 'sub')}`, classification: 'SUBSCRIPTION RECORD', subject: 'Trial or plan enrollment and renewal settings', facts: [['Subscriber', activeCase.person ?? 'Training customer'], ['Plan', `${merchant} subscription plan`], ['Enrollment date', enrollmentDate], ['Renewal cadence', cadence.label], ['Stored credential', `Card ending ${cardSuffix(transactions)}`], ['Account status', 'Active through current billing cycle']], paragraphs: ['This system-generated account record shows the plan, enrollment date, price cadence, and stored-credential values retained by the merchant.'] }),
    documentBase({ id: `${activeCase.id}-BILL-HIST`, title: 'Billing history statement', source: merchant, kind: 'statement', brand: merchant, department: 'Subscriber Billing', mark: profile.mark, date: responseDate, reference: `BILL-${stableNumber(activeCase.id + 'bill')}`, classification: 'BILLING HISTORY', subject: 'Subscription billing activity', tables: [{ title: 'Account billing ledger', columns: ['Posted', 'Descriptor', 'Amount', 'Status', 'Type'], rows: transactionRows(transactions, merchant, activeCase) }] }),
    documentBase({ id: `${activeCase.id}-TERMS`, title: 'Subscription terms and trial disclosure', source: merchant, kind: 'policy', brand: merchant, department: 'Terms of Service', mark: profile.mark, date: 'Effective Jan 1, 2026', reference: 'TOS-SUB-2026.1', classification: 'TERMS DISCLOSURE', subject: 'Trial conversion, price, and renewal cadence', paragraphs: ['The subscription converts or renews at the price and cadence displayed during checkout unless canceled within the disclosed window.', 'The merchant records whether the terms acknowledgement was completed and whether a renewal reminder was sent.'], callout: { label: 'Investigator review', value: 'Compare the enrollment screen, acknowledgement, reminder timing, disputed amount, and customer statement.' } }),
    documentBase({ id: `${activeCase.id}-NOTICE`, title: 'Renewal notice and account activity log', source: merchant, kind: 'log', brand: merchant, department: 'Subscriber Communications', mark: profile.mark, date: responseDate, reference: `NTC-${stableNumber(activeCase.id + 'notice')}`, classification: 'SYSTEM ACTIVITY', subject: 'Renewal notice, billing, and usage events', tables: [{ title: 'Recorded account events', columns: ['Date / time', 'Event', 'Channel', 'Result'], rows: [[enrollmentDate, 'Plan enrollment', 'Merchant checkout', 'Acknowledgement recorded'], [shiftedDisplayDate(currentDate, -7), 'Renewal notice event', 'Account email', 'Delivery status recorded'], [`${currentDate} · 12:03 AM`, 'Subscription renewed', 'Stored credential', 'Completed'], [`${currentDate} · 7:42 PM`, 'Service usage event', 'Subscriber application', 'Usage record returned by merchant'], [responseDate, 'Dispute response prepared', 'Merchant support', responseStatus]] }] }),
  ];

  if (scenario.id === 'merchandise-not-received') return [...common,
    documentBase({ id: `${activeCase.id}-ORDER`, title: 'Order confirmation', source: merchant, kind: 'receipt', brand: merchant, department: 'Order Services', mark: profile.mark, date: currentDate, reference: `ORD-${stableNumber(activeCase.id + 'order')}`, classification: 'ORDER RECEIPT', facts: [['Customer', activeCase.person ?? 'Training customer'], ['Order total', currentAmount], ['Ship-to area', activeCase.intake?.customerLocation ?? 'Address on merchant order'], ['Order status', 'Fulfillment record attached']], tables: [{ title: 'Order items', columns: ['Item', 'Qty', 'Unit price', 'Total'], rows: [['Training merchandise item', '1', currentAmount, currentAmount]] }] }),
    documentBase({ id: `${activeCase.id}-TRACKING`, title: 'Carrier tracking record', source: 'Training Parcel Network', kind: 'log', brand: 'Training Parcel Network', department: 'Shipment Detail', mark: 'TP', date: responseDate, reference: `TRK-${stableNumber(activeCase.id + 'track')}`, classification: 'CARRIER RECORD', tables: [{ title: 'Shipment scans', columns: ['Date / time', 'Location', 'Scan'], rows: [[`${shiftedDisplayDate(fulfillmentDate, -2)} · 6:14 PM`, 'Origin facility', 'Shipment accepted'], [`${fulfillmentDate} · 8:20 AM`, 'Destination city', 'Out for delivery'], [`${fulfillmentDate} · 2:17 PM`, 'Delivery address', 'Delivery scan recorded']] }], callout: { label: 'Delivery detail', value: 'Review the complete address, delivery image, recipient, and carrier correction history when supplied.' } }),
    documentBase({ id: `${activeCase.id}-FULFILL`, title: 'Merchant fulfillment record', source: merchant, kind: 'form', brand: merchant, department: 'Order Fulfillment', mark: profile.mark, date: responseDate, reference: `FUL-${stableNumber(activeCase.id + 'fulfill')}`, classification: 'FULFILLMENT RECORD', facts: [['Order', `ORD-${stableNumber(activeCase.id + 'order')}`], ['Shipment status', 'Carrier scan attached'], ['Delivery address', 'Matches merchant order record'], ['Replacement', 'No replacement recorded']] }),
  ];

  if (scenario.id === 'credit-not-processed') return [...common,
    documentBase({ id: `${activeCase.id}-RETURN`, title: 'Return receipt', source: merchant, kind: 'receipt', brand: merchant, department: 'Returns Desk', mark: profile.mark, date: activeCase.issueStartDate ?? currentDate, reference: `RET-${stableNumber(activeCase.id + 'return')}`, classification: 'RETURN RECEIPT', facts: [['Original transaction', currentAmount], ['Return status', 'Received for review'], ['Refund method', 'Original payment method'], ['Expected processing', '5–10 business days']] }),
    documentBase({ id: `${activeCase.id}-CREDIT-LOG`, title: 'Merchant credit ledger', source: merchant, kind: 'statement', brand: merchant, department: 'Refund Accounting', mark: profile.mark, date: responseDate, reference: `CR-${stableNumber(activeCase.id + 'credit')}`, classification: 'CREDIT LEDGER', tables: [{ title: 'Refund events', columns: ['Date', 'Event', 'Amount', 'Status'], rows: [[activeCase.issueStartDate ?? currentDate, 'Return received', currentAmount, 'Logged'], [responseDate, 'Refund review', currentAmount, 'Merchant status recorded']] }] }),
    documentBase({ id: `${activeCase.id}-REF-POLICY`, title: 'Return and refund policy', source: merchant, kind: 'policy', brand: merchant, department: 'Customer Terms', mark: profile.mark, date: 'Effective Jan 1, 2026', reference: 'RET-2026.1', classification: 'POLICY EXCERPT', paragraphs: ['Approved refunds are sent to the original payment method. Processing time begins after the returned item or cancellation is accepted.', 'Customers should retain the return receipt and any written refund acknowledgement until the credit appears.'] }),
  ];

  if (scenario.id === 'duplicate-processing' || scenario.id === 'incorrect-amount') return [...common,
    documentBase({ id: `${activeCase.id}-TXN-LEDGER`, title: 'Merchant transaction ledger', source: merchant, kind: 'statement', brand: merchant, department: 'Payment Operations', mark: profile.mark, date: responseDate, reference: `LED-${stableNumber(activeCase.id + 'ledger')}`, classification: 'TRANSACTION LEDGER', tables: [{ title: 'Payment events', columns: ['Date', 'Descriptor', 'Amount', 'Status', 'Channel'], rows: transactionRows(transactions, merchant, activeCase) }] }),
    documentBase({ id: `${activeCase.id}-RECEIPT`, title: 'Merchant sales receipt', source: merchant, kind: 'receipt', brand: merchant, department: 'Sales Record', mark: profile.mark, date: currentDate, reference: `RCPT-${stableNumber(activeCase.id + 'receipt')}`, classification: 'SALES RECEIPT', facts: [['Customer', activeCase.person ?? 'Training customer'], ['Merchant', merchant], ['Total authorized', currentAmount], ['Transaction date', currentDate]], tables: [{ title: 'Purchase detail', columns: ['Description', 'Qty', 'Amount'], rows: [['Training purchase', '1', currentAmount]] }] }),
    documentBase({ id: `${activeCase.id}-AUTH-SETTLE`, title: 'Authorization and settlement record', source: merchant, kind: 'log', brand: merchant, department: 'Payment Gateway Export', mark: profile.mark, date: responseDate, reference: `AUTH-${stableNumber(activeCase.id + 'auth')}`, classification: 'PAYMENT RECORD', tables: [{ title: 'Processing events', columns: ['Timestamp', 'Event', 'Amount', 'Result'], rows: [[`${currentDate} · 10:14 AM`, 'Authorization', currentAmount, 'Approved'], [`${currentDate} · 11:58 PM`, 'Settlement', currentAmount, 'Completed']] }] }),
  ];

  if (scenario.id === 'merchandise-not-as-described') return [...common,
    documentBase({ id: `${activeCase.id}-ORDER`, title: 'Order receipt', source: merchant, kind: 'receipt', brand: merchant, department: 'Order Services', mark: profile.mark, date: currentDate, reference: `ORD-${stableNumber(activeCase.id + 'order')}`, classification: 'ORDER RECEIPT', facts: [['Customer', activeCase.person ?? 'Training customer'], ['Order total', currentAmount], ['Transaction date', currentDate], ['Order status', 'Delivered order record attached']] }),
    documentBase({ id: `${activeCase.id}-LISTING`, title: 'Product listing captured at purchase', source: merchant, kind: 'form', brand: merchant, department: 'Catalog Record', mark: profile.mark, date: currentDate, reference: `LST-${stableNumber(activeCase.id + 'listing')}`, classification: 'PRODUCT LISTING', facts: [['Listing title', 'Training merchandise item'], ['Advertised condition', 'Merchant listing condition recorded'], ['Included components', 'Item and component list attached'], ['Return window', 'Policy terms linked']] }),
    documentBase({ id: `${activeCase.id}-RETURN-LOG`, title: 'Return request and merchant correspondence', source: merchant, kind: 'email', brand: merchant, department: 'Returns Support', mark: profile.mark, date: responseDate, reference: `RET-${stableNumber(activeCase.id + 'return')}`, classification: 'MERCHANT CORRESPONDENCE', paragraphs: ['The merchant recorded the customer return request and its response. Review whether the stated product difference, return instructions, and any retained component agree across the source records.'] }),
    documentBase({ id: `${activeCase.id}-INSPECTION`, title: 'Merchant item inspection record', source: merchant, kind: 'form', brand: merchant, department: 'Returns Inspection', mark: profile.mark, date: responseDate, reference: `INSP-${stableNumber(activeCase.id + 'inspection')}`, classification: 'INSPECTION RECORD', facts: [['Order amount', currentAmount], ['Inspection status', 'Merchant inspection record supplied'], ['Return status', 'Compare with customer return evidence'], ['Resolution', 'Merchant position recorded in response letter']] }),
  ];

  return [...common,
    documentBase({ id: `${activeCase.id}-ORDER-RECEIPT`, title: scenario.id === 'service-dispute' ? 'Service booking and receipt' : 'Merchant order receipt', source: merchant, kind: 'receipt', brand: merchant, department: scenario.id === 'service-dispute' ? 'Service Reservations' : 'Order Services', mark: profile.mark, date: currentDate, reference: `ORD-${stableNumber(activeCase.id + 'receipt')}`, classification: 'TRANSACTION RECORD', facts: [['Customer', activeCase.person ?? 'Training customer'], ['Amount', currentAmount], ['Transaction date', currentDate], ['Channel', transactions[0]?.channel ?? 'Merchant account']], tables: [{ title: 'Purchased item or service', columns: ['Description', 'Date', 'Amount'], rows: [[scenario.label, currentDate, currentAmount]] }] }),
    documentBase({ id: `${activeCase.id}-AUTH`, title: 'Authorization record', source: merchant, kind: 'log', brand: merchant, department: 'Payment Processing', mark: profile.mark, date: responseDate, reference: `AUTH-${stableNumber(activeCase.id + 'authorization')}`, classification: 'AUTHORIZATION DATA', facts: [['Entry mode', /wallet/i.test(activeCase.subtype ?? '') ? 'Tokenized wallet credential' : /card present/i.test(transactions[0]?.channel ?? '') ? 'Card present' : 'Card not present'], ['Authorization result', 'Approved'], ['Amount', currentAmount], ['Merchant descriptor', profile.descriptor]] }),
    documentBase({ id: `${activeCase.id}-FULFILLMENT`, title: scenario.id === 'service-dispute' ? 'Service fulfillment record' : 'Order fulfillment record', source: merchant, kind: 'form', brand: merchant, department: 'Fulfillment', mark: profile.mark, date: responseDate, reference: `FUL-${stableNumber(activeCase.id + 'fulfillment')}`, classification: 'FULFILLMENT RECORD', facts: [['Transaction', currentAmount], ['Service / order date', currentDate], ['Account reference', `ACCT-${stableNumber(activeCase.id + merchant)}`], ['Evidence source', 'Merchant system export']], paragraphs: ['This record reflects the merchant fulfillment entry associated with the disputed transaction. Compare it with the customer statement and any independent delivery, booking, usage, or service record.'] }),
  ];
}

function customerDocumentsFor({ activeCase, profile, scenario, cancellationDate }) {
  const customer = activeCase.person ?? 'Training customer';
  const currentAmount = activeCase.amount ?? '$0.00';
  const claimFacts = [['Cardholder', customer], ['Merchant', profile.name], ['Disputed amount', currentAmount], ['Claim type', scenario.label], ['Date reported', activeCase.reportedDate ?? 'Training date']];
  if (scenario.id === 'recurring-cancellation') claimFacts.push(['Cancellation date', cancellationDate], ['Cancellation method', activeCase.claimDetails?.cancellationMethod ?? 'Not supplied at intake']);
  if (activeCase.claimDetails?.enrollmentOrTrialDate) claimFacts.push(['Enrollment / trial date', activeCase.claimDetails.enrollmentOrTrialDate]);
  if (activeCase.claimDetails?.returnOrRefundDate) claimFacts.push(['Return / refund date', activeCase.claimDetails.returnOrRefundDate]);
  if (activeCase.claimDetails?.expectedDeliveryDate) claimFacts.push(['Expected delivery date', activeCase.claimDetails.expectedDeliveryDate]);
  if (activeCase.claimDetails?.serviceOrDeliveryDate) claimFacts.push(['Service / delivery date', activeCase.claimDetails.serviceOrDeliveryDate]);
  const disputeForm = documentBase({ id: `${activeCase.id}-CUS-FORM`, title: 'Customer dispute form', source: 'Issuer claim intake', kind: 'form', brand: 'Fraud Academy Bank', department: 'Cardholder Disputes', mark: 'FA', date: activeCase.reportedDate ?? 'Training date', reference: activeCase.claimId ?? `CLM-${activeCase.id}`, classification: 'CUSTOMER SUBMISSION', subject: scenario.label, facts: claimFacts, paragraphs: [activeCase.statement?.value ?? activeCase.allegation ?? 'Customer statement recorded at claim intake.'], footer: 'Issuer claim intake · Customer-provided information' });
  const docs = [disputeForm];
  if (scenario.id === 'recurring-cancellation') docs.push({ id: `${activeCase.id}-CUS-CANCEL`, title: 'Cancellation confirmation', source: customer, kind: 'email', brand: profile.name, department: 'Cancellation acknowledgement', mark: profile.mark, date: cancellationDate, reference: `CAN-${stableNumber(activeCase.id + 'customer-cancel')}`, classification: 'CUSTOMER EVIDENCE', status: 'Not Requested', icon: 'MSG', subject: 'Subscription cancellation confirmation' });
  else if (scenario.id === 'subscription-terms') docs.push({ id: `${activeCase.id}-CUS-TERMS`, title: 'Customer copy of trial or enrollment terms', source: customer, kind: 'form', brand: 'Customer evidence', department: 'Subscription enrollment', mark: 'C', date: activeCase.issueStartDate ?? 'Training date', reference: `CUS-${stableNumber(activeCase.id + 'terms')}`, classification: 'CUSTOMER EVIDENCE', status: 'Not Requested', icon: 'DOC' });
  else if (scenario.id === 'merchandise-not-received') docs.push({ id: `${activeCase.id}-CUS-CONTACT`, title: 'Customer delivery correspondence', source: customer, kind: 'email', brand: 'Customer email record', department: 'Merchant correspondence', mark: '@', date: activeCase.issueStartDate ?? 'Training date', reference: `MSG-${stableNumber(activeCase.id)}`, classification: 'CUSTOMER EVIDENCE', status: 'Not Requested', icon: 'MSG' });
  else if (scenario.id === 'credit-not-processed') docs.push({ id: `${activeCase.id}-CUS-REFUND`, title: 'Merchant refund confirmation', source: customer, kind: 'email', brand: profile.name, department: 'Refund correspondence', mark: profile.mark, date: activeCase.issueStartDate ?? 'Training date', reference: `REF-${stableNumber(activeCase.id)}`, classification: 'CUSTOMER EVIDENCE', status: 'Not Requested', icon: 'MSG' });
  else if (scenario.id === 'merchandise-not-as-described') docs.push({ id: `${activeCase.id}-CUS-ITEM`, title: 'Customer photos and item comparison', source: customer, kind: 'form', brand: 'Customer evidence', department: 'Merchandise condition', mark: 'C', date: activeCase.issueStartDate ?? 'Training date', reference: `CUS-${stableNumber(activeCase.id + 'item')}`, classification: 'CUSTOMER EVIDENCE', status: 'Not Requested', icon: 'DOC' });
  else if (scenario.id === 'service-dispute') docs.push({ id: `${activeCase.id}-CUS-SERVICE`, title: 'Service agreement and merchant correspondence', source: customer, kind: 'email', brand: 'Customer evidence', department: 'Service dispute', mark: 'C', date: activeCase.issueStartDate ?? 'Training date', reference: `CUS-${stableNumber(activeCase.id + 'service')}`, classification: 'CUSTOMER EVIDENCE', status: 'Not Requested', icon: 'MSG' });
  else if (scenario.id === 'duplicate-processing' || scenario.id === 'incorrect-amount') docs.push({ id: `${activeCase.id}-CUS-RECEIPT`, title: 'Customer receipt and purchase record', source: customer, kind: 'receipt', brand: 'Customer evidence', department: 'Transaction comparison', mark: 'C', date: activeCase.issueStartDate ?? 'Training date', reference: `CUS-${stableNumber(activeCase.id + 'receipt')}`, classification: 'CUSTOMER EVIDENCE', status: 'Not Requested', icon: 'DOC' });
  else docs.push({ id: `${activeCase.id}-CUS-SUPPORT`, title: 'Customer supporting document', source: customer, kind: 'form', brand: 'Customer evidence', department: scenario.label, mark: 'C', date: activeCase.issueStartDate ?? 'Training date', reference: `CUS-${stableNumber(activeCase.id)}`, classification: 'CUSTOMER EVIDENCE', status: 'Not Requested', icon: 'DOC' });
  return docs;
}

function legacyRecords({ activeCase, profile, scenario, authorization, merchantDocuments, responseDeadline }) {
  const observed = activeCase.reportedDate ?? 'Training date';
  const base = (section, title, summary, fields = []) => ({ id: `${activeCase.id}-${section.toUpperCase()}`, section, title, status: 'Available', observed, summary, fields, relatedRecords: merchantDocuments.map((item) => item.id) });
  return [
    base('overview', 'Merchant identity and category', `${profile.name} is recorded under MCC ${profile.mcc}.`, [['Merchant', profile.name], ['MCC', profile.mcc], ['Category', profile.category], ['Descriptor', profile.descriptor]]),
    base('history', 'Customer and merchant history', `${profile.priorTransactionCount} prior transaction(s) are available for comparison.`, [['Prior transactions', profile.priorTransactionCount], ['Prior disputes', profile.priorDisputeCount], ['Refunds', profile.refundCount]]),
    base('authorization', 'Authorization and billing record', `${authorization.entryMode}; ${authorization.attempts}.`, [['Entry mode', authorization.entryMode], ['AVS', authorization.avs], ['CVV', authorization.cvv], ['3DS', authorization.threeDS], ['Wallet token', authorization.walletToken]]),
    base('fulfillment', 'Fulfillment evidence packet', `${merchantDocuments.length} scenario-specific merchant document(s) are available.`, [['Scenario', scenario.label], ['Documents', merchantDocuments.length]]),
    base('disputes', 'Dispute, response, and refund history', 'Customer claim and merchant response are grouped for comparison.', [['Prior disputes', profile.priorDisputeCount], ['Refunds', profile.refundCount]]),
    base('marketplace', 'Subscription or marketplace context', scenario.label, [['Claim scenario', scenario.label]]),
    base('reason-code', 'Reason-code documentation guide', 'Guidance remains neutral and does not select an outcome.', [['Response deadline', responseDeadline], ['Scenario', scenario.label]]),
  ];
}

export function getMerchantIntelligence(activeCase = {}) {
  const financial = getFinancialRecords(activeCase);
  const evidence = getEvidenceRecords(activeCase);
  const transactions = financial.transactions ?? [];
  const generated = activeCase.toolResults?.merchantIntelligence ?? {};
  const merchantName = merchantNameFor(activeCase, transactions, generated);
  const primary = transactions[0] ?? {};
  const scenario = scenarioFor(activeCase, merchantName);
  const [fallbackMcc, fallbackCategory] = merchantCategory(merchantName, primary.channel);
  const profile = {
    name: merchantName,
    legalName: generated.profile?.legalName ?? `${merchantName} Training Commerce LLC`,
    descriptor: generated.profile?.descriptor ?? merchantName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18),
    mcc: generated.profile?.mcc ?? fallbackMcc,
    category: generated.profile?.category ?? fallbackCategory,
    location: generated.profile?.location ?? primary.location ?? 'Online merchant',
    channel: generated.profile?.channel ?? primary.channel ?? 'Card-not-present',
    firstUsed: generated.profile?.firstUsed ?? transactions.at(-1)?.posted ?? primary.posted ?? activeCase.reportedDate,
    priorTransactionCount: generated.profile?.priorTransactionCount ?? Math.max(0, transactions.length - 1),
    priorDisputeCount: generated.profile?.priorDisputeCount ?? activeCase.merchantHistory?.priorDisputeCount ?? 0,
    refundCount: generated.profile?.refundCount ?? transactions.filter((item) => /refund|credit|reversal/i.test(`${item.status} ${item.context}`)).length,
    mark: merchantName.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase(),
  };
  const cancellationDate = activeCase.claimDetails?.cancellationDate ?? generated.claimDetails?.cancellationDate ?? 'Not supplied at intake';
  const responseDeadline = activeCase.chargebackDecision?.responseDeadline ?? `${shiftedDisplayDate(activeCase.reportedDate ?? primary.posted, 20)} · 3:00 PM`;
  const seed = stableNumber(activeCase.id);
  const explicitResponse = generated.response?.status ?? activeCase.merchantResponse?.status;
  const responseStatus = explicitResponse ?? (seed % 5 === 0 ? 'Accepted' : seed % 4 === 0 ? 'Pending' : 'Challenged');
  const responseDate = generated.response?.receivedDate ?? activeCase.merchantResponse?.receivedDate ?? (responseStatus === 'Pending' ? 'Pending' : activeCase.reportedDate ?? 'Training response date');
  const merchantDocuments = buildMerchantDocuments({ activeCase, profile, scenario, transactions, responseDate, responseStatus, cancellationDate });
  const customerDocuments = customerDocumentsFor({ activeCase, profile, scenario, cancellationDate, evidence });
  const currentAmount = primary.amount ?? activeCase.amount ?? '$0.00';
  const currentDate = primary.posted ?? activeCase.reportedDate ?? 'Training date';
  const reasonCode = activeCase.chargebackDecision?.reasonCode ?? generated.reasonCode ?? `${scenario.label} documentation lane`;
  const suppliedAuthorization = { ...(generated.authorization ?? {}), ...(activeCase.merchantAuthorization ?? {}) };
  const authorization = {
    id: `${activeCase.id}-AUTH-1`, authorizedAt: `${currentDate} ${primary.time ?? ''}`.trim(), amount: currentAmount,
    entryMode: suppliedAuthorization.entryMode ?? (/recurring/i.test(`${primary.channel} ${scenario.label}`) ? 'Card not present' : /card present/i.test(primary.channel ?? '') ? 'EMV chip or contactless' : 'Card not present'),
    storedCredential: suppliedAuthorization.storedCredential ?? (/recurring/i.test(`${primary.channel} ${scenario.label}`) ? 'Recurring stored credential' : 'No recurring indicator supplied'),
    authorizationResult: suppliedAuthorization.authorizationResult ?? 'Approved',
    avs: suppliedAuthorization.avs ?? 'Merchant authorization response supplied when available',
    cvv: suppliedAuthorization.cvv ?? 'Merchant authorization response supplied when available',
    threeDS: suppliedAuthorization.threeDS ?? 'Not supplied in the base packet',
    otp: suppliedAuthorization.otp ?? 'Not supplied in the base packet',
    walletToken: suppliedAuthorization.walletToken ?? 'No wallet token supplied',
    device: suppliedAuthorization.device ?? 'Merchant device record not supplied',
    ip: suppliedAuthorization.ip ?? 'Merchant IP record not supplied',
    attempts: suppliedAuthorization.attempts ?? '1 authorization attempt; decline count not supplied',
  };
  const merchantStatement = responseStatus === 'Accepted'
    ? `${profile.name} accepted the chargeback through the card-network response channel. Review the merchant response letter and issuer account history for the credit record.`
    : responseStatus === 'Pending'
      ? `The chargeback was submitted to ${profile.name}. A merchant response has not yet been received; the response deadline is ${responseDeadline}.`
      : scenario.id === 'recurring-cancellation'
        ? `${profile.name} reports that no completed cancellation request was located before the renewal. The merchant challenges the chargeback and supplied the subscription record, billing history, account activity, and cancellation policy for review.`
        : `${profile.name} challenges the chargeback and supplied a response letter plus ${scenario.label.toLowerCase()} records. Review each source document against the customer statement and card-network requirements.`;
  const responseFields = scenario.id === 'recurring-cancellation'
    ? [['Response status', responseStatus], ['Response received', responseDate], ['Chargeback accepted', responseStatus === 'Accepted' ? 'Yes' : 'No'], ['Cancellation request found', generated.response?.cancellationRequestFound ?? activeCase.merchantResponse?.cancellationRequestFound ?? (responseStatus === 'Accepted' ? 'Not contested' : 'No completed request located')], ['Refund issued', generated.response?.refundIssued ?? activeCase.merchantResponse?.refundIssued ?? (profile.refundCount ? 'Refund entry recorded' : 'No')], ['Merchant policy', 'Cancellation required before renewal date']]
    : [['Response status', responseStatus], ['Response received', responseDate], ['Chargeback accepted', responseStatus === 'Accepted' ? 'Yes' : 'No'], ['Merchant evidence', `${merchantDocuments.length} document(s)`], ['Refund / reversal', profile.refundCount ? 'Entry recorded' : 'None recorded'], ['Response deadline', responseDeadline]];
  const networkFacts = [['Case ID', activeCase.id], ['Merchant', profile.name], ['Disputed amount', currentAmount], ['Transaction date', currentDate], ['Reason-code lane', reasonCode], ['Response deadline', responseDeadline]];
  if (scenario.id === 'recurring-cancellation') networkFacts.push(['Cancellation date sent', cancellationDate], ['Cancellation method sent', activeCase.claimDetails?.cancellationMethod ?? 'Not supplied at intake']);
  if (activeCase.claimDetails?.enrollmentOrTrialDate) networkFacts.push(['Enrollment / trial date sent', activeCase.claimDetails.enrollmentOrTrialDate]);
  const networkDocument = documentBase({ id: `${activeCase.id}-NET-SUB`, title: 'Card-network submission record', source: 'Issuer dispute system', kind: 'form', brand: 'Fraud Academy Bank', department: 'Chargeback Operations', mark: 'FA', date: activeCase.reportedDate ?? 'Training date', reference: `NET-${stableNumber(activeCase.id + 'network')}`, classification: 'NETWORK SUBMISSION', subject: scenario.label, facts: networkFacts, paragraphs: ['This internal training record represents the claim information transmitted through the card-network process. It is not a replica of the network platform interface.'], footer: 'Issuer dispute system · Training-safe network record' });
  const records = generated.records?.length ? generated.records : legacyRecords({ activeCase, profile, scenario, authorization, merchantDocuments, responseDeadline });
  const openCustomerDocuments = customerDocuments.filter((item) => item.status !== 'Available');
  const recurringDetected = /recurring|subscription/i.test(`${primary.channel} ${scenario.label}`);
  const workflowStatus = responseStatus === 'Pending'
    ? 'Submitted — merchant response pending'
    : responseStatus === 'Accepted'
      ? 'Merchant accepted — account credit review'
      : openCustomerDocuments.length
        ? 'Merchant challenged — customer evidence pending'
        : 'Merchant challenged — evidence review open';
  const claimDetailFields = [['Customer', activeCase.person ?? 'Training customer'], ['Merchant', profile.name], ['Disputed transaction', `${currentDate} · ${currentAmount}`], ['Claim scenario', scenario.label], ['Date reported', activeCase.reportedDate ?? 'Training date'], ['Intake channel', activeCase.intake?.channel ?? activeCase.statement?.source ?? 'Claim intake']];
  if (scenario.id === 'recurring-cancellation') claimDetailFields.push(['Cancellation date', cancellationDate], ['Cancellation method', activeCase.claimDetails?.cancellationMethod ?? 'Not supplied at intake']);
  if (activeCase.claimDetails?.enrollmentOrTrialDate) claimDetailFields.push(['Enrollment / trial date', activeCase.claimDetails.enrollmentOrTrialDate]);
  const authorizationFields = [
    ['Processing channel', authorization.entryMode],
    ['Recurring / stored credential', authorization.storedCredential],
    ['Authorization result', authorization.authorizationResult],
    ['Authorized amount', authorization.amount],
    ['Authorization date', authorization.authorizedAt],
    ['Attempts / declines', authorization.attempts],
    ['Device detail', authorization.device],
    ['Wallet / token detail', authorization.walletToken],
  ];
  const networkFields = [['Submission reference', networkDocument.reference], ['Submitted', activeCase.reportedDate ?? 'Training date'], ['Reason-code lane', reasonCode], ['Disputed amount', currentAmount], ['Merchant response deadline', responseDeadline], ['Response source', 'Card-network exchange']];
  if (scenario.id === 'recurring-cancellation') networkFields.push(['Cancellation date sent', cancellationDate], ['Cancellation method sent', activeCase.claimDetails?.cancellationMethod ?? 'Not supplied at intake']);
  if (activeCase.claimDetails?.enrollmentOrTrialDate) networkFields.push(['Enrollment / trial date sent', activeCase.claimDetails.enrollmentOrTrialDate]);
  const claimReportedTime = activeCase.intake?.contactTime ? `${activeCase.reportedDate ?? currentDate} · ${activeCase.intake.contactTime}` : activeCase.reportedDate ?? currentDate;
  const submissionTime = activeCase.networkSubmission?.submittedAt ?? `${activeCase.reportedDate ?? currentDate} · 11:06 AM`;
  const issueDate = scenario.id === 'recurring-cancellation'
    ? cancellationDate
    : activeCase.claimDetails?.returnOrRefundDate
      ?? activeCase.claimDetails?.enrollmentOrTrialDate
      ?? activeCase.claimDetails?.expectedDeliveryDate
      ?? activeCase.claimDetails?.serviceOrDeliveryDate
      ?? activeCase.claimDetails?.disputedTransactionDate
      ?? activeCase.issueStartDate
      ?? currentDate;

  return {
    profile, scenario, authorization, records, reasonCode, responseDeadline, merchantDocuments, customerDocuments,
    claimLane: (activeCase.workflowType ?? activeCase.claimTypeId) === WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM
      ? 'Unauthorized Card Transaction Claim'
      : 'Merchant / Non-Fraud Dispute',
    summaryFields: [['Disputed amount', currentAmount], [scenario.id === 'recurring-cancellation' ? 'Cancellation date' : 'Issue date', issueDate], ['Case ID', activeCase.id]],
    quickSummary: [['Prior merchant transactions', profile.priorTransactionCount], ['Prior merchant disputes', profile.priorDisputeCount], ['Refunds / reversals', profile.refundCount], ['Recurring billing', recurringDetected ? 'Detected' : 'Not detected'], ['Merchant response', responseStatus], ['Customer proof missing', openCustomerDocuments.length]],
    claimDetails: claimDetailFields,
    authorizationFields,
    customerStatement: activeCase.statement?.value ?? activeCase.allegation ?? 'Customer statement recorded at intake.',
    customerStatementSource: activeCase.statement?.source ?? activeCase.intake?.channel ?? 'Claim intake',
    network: { status: responseStatus === 'Pending' ? 'Awaiting merchant response' : 'Merchant response received', fields: networkFields, documents: [networkDocument, customerDocuments[0]] },
    response: { status: responseStatus, statement: merchantStatement, fields: responseFields, documents: responseStatus === 'Pending' ? merchantDocuments.map((item) => ({ ...item, status: 'Pending' })) : merchantDocuments },
    customerRequirements: scenario.customerRequirements,
    visa: { fields: [['Possible dispute lane', reasonCode], ['Merchant response', responseStatus], ['Filing / response deadline', responseDeadline], ['Guidance status', 'Investigator review required']], requirements: scenario.visaRequirements },
    caseStatus: workflowStatus,
    timeline: [
      ...(scenario.id === 'recurring-cancellation' && cancellationDate !== 'Not supplied at intake' ? [{ date: cancellationDate, label: 'Merchant account settings accessed', detail: `${activeCase.claimDetails?.cancellationMethod ?? 'Cancellation method not supplied'}; the customer reports cancellation, while merchant completion evidence must be reviewed separately.`, state: 'complete' }] : []),
      { date: claimReportedTime, label: 'Claim received', detail: `${scenario.label} opened for ${profile.name}.`, state: 'complete' },
      { date: submissionTime, label: 'Network submission recorded', detail: `Disputed transaction and customer claim details sent through the card-network process.`, state: 'complete' },
      { date: responseDate, label: responseStatus === 'Pending' ? 'Merchant response pending' : `Merchant response: ${responseStatus}`, detail: responseStatus === 'Pending' ? `Response due ${responseDeadline}.` : `${merchantDocuments.length} merchant document(s) returned for review.`, state: responseStatus === 'Pending' ? 'current' : 'complete' },
      ...(responseStatus === 'Challenged' ? [{ date: responseDate, label: 'Customer evidence review', detail: `${openCustomerDocuments.length} customer evidence item(s) remain outstanding; an agent request is not sent automatically.`, state: 'current' }] : []),
      { date: responseDeadline, label: 'Response deadline', detail: 'Confirm eligibility and required evidence before continuing the dispute lane.', state: 'future' },
    ],
  };
}

export function merchantRecordSearchText(item = {}) {
  return [item.id, item.section, item.title, item.status, item.observed, item.summary, ...(item.fields ?? []).flat(), ...(item.relatedRecords ?? [])].filter(Boolean).join(' ').toLowerCase();
}
