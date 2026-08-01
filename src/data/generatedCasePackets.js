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
  if (productType === PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT || productType === PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT) return 'line';
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
      fields: [['Merchant account login', deviceMatch], ['Subscription status', /subscription|cancel|recurring/i.test(signal) ? 'Enrollment and cancellation dates differ across sources' : 'No recurring enrollment in scope'], ['Marketplace account', /online|digital/i.test(`${channel} ${category}`) ? 'Marketplace order account available' : 'Not applicable'], ['Billing descriptor comparison', `Statement descriptor ${profile.descriptor}`]],
      relatedRecords: [orderId, authorizationId],
    });
  }

  return { profile, authorization: auth, response, records, reasonCode: reasonCodeFor(signal), responseDeadline: deadlineFrom(reportedDate, 10, '3:00 PM') };
}

function makeCreditProfile({ id, index, claimType, scenario, person, business, amount, reportedDate, difficulty }) {
  const seed = stableNumber(`${id}-${scenario.id}-credit`);
  const family = scenario.family ?? 'Credit review';
  const businessReview = scenario.customerType === CUSTOMER_TYPES.BUSINESS;
  const existing = scenario.workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW;
  const tone = creditDeterminationTone(scenario);
  const confirmedApplicationFinding = !existing && scenario.caseTruth?.finalFinding === FINAL_FINDINGS.FRAUD_CONFIRMED;
  const financialTone = confirmedApplicationFinding ? 'established' : tone;
  const statedAnnual = Math.max(businessReview ? 420000 : 68000, Math.round(amount * (businessReview ? 28 : 8)));
  const verifiedRatio = financialTone === 'established' ? 0.96 : financialTone === 'mixed' ? 0.74 : 0.48;
  const verifiedAnnual = Math.round(statedAnnual * verifiedRatio);
  const monthlyGross = Math.round(verifiedAnnual / 12);
  const housing = businessReview ? 0 : 1450 + (seed % 900);
  const monthlyDebt = Math.round(monthlyGross * (financialTone === 'established' ? 0.25 : financialTone === 'mixed' ? 0.43 : 0.61));
  const dti = businessReview ? 'Not used as the primary business measure' : `${Math.round(((monthlyDebt + housing) / Math.max(1, monthlyGross)) * 100)}%`;
  const utilization = financialTone === 'established' ? 34 + (seed % 16) : financialTone === 'mixed' ? 68 + (seed % 15) : 91 + (seed % 8);
  const inquiries = existing ? seed % 3 : 3 + (seed % 6);
  const delinquencies = financialTone === 'established' ? 0 : financialTone === 'mixed' ? 1 : 2 + (seed % 3);
  const nsf = financialTone === 'established' ? 0 : financialTone === 'mixed' ? 2 : 4 + (seed % 5);
  const deposits = Math.round(verifiedAnnual / 12 * (businessReview ? 1.05 : 0.84));
  const outflow = Math.round(deposits * (financialTone === 'established' ? 0.68 : financialTone === 'mixed' ? 0.92 : 1.14));
  const missingDocuments = financialTone === 'established' ? [] : businessReview ? ['Current tax return', 'Two recent operating-account statements'] : ['Current paystub', 'Income-source confirmation'];

  return {
    id: `${id}-CRP-1`,
    family,
    customerType: businessReview ? 'Business' : 'Consumer',
    relationshipStage: existing ? 'Existing relationship review' : 'New application review',
    subject: businessReview ? business : person,
    applicationStatus: existing ? 'Portfolio review open' : 'Application review open',
    requestedExposure: money(amount),
    statedAnnualIncome: money(statedAnnual),
    verifiedAnnualIncome: money(verifiedAnnual),
    incomeSource: businessReview ? 'Operating deposits, tax support, invoices, and contracts' : 'Payroll deposits, paystub, employer, and bank statements',
    incomeFrequency: businessReview ? 'Monthly operating cycle' : 'Biweekly payroll',
    employerOrBusiness: businessReview ? business : `Employer record for ${person}`,
    monthlyGrossIncome: money(monthlyGross),
    monthlyDebt: money(monthlyDebt),
    housingExpense: businessReview ? 'Included in business cash-flow review' : money(housing),
    dti,
    bureau: pick(creditBureaus, seed),
    creditScoreBand: financialTone === 'established' ? '680-719 training band' : financialTone === 'mixed' ? '620-659 training band' : 'Below 620 training band',
    tradelines: 3 + (seed % 7),
    utilization: `${Math.min(99, utilization)}%`,
    delinquencies,
    inquiries,
    collections: financialTone === 'exception' ? 1 + (seed % 2) : 0,
    bankruptcyPublicRecord: /bankruptcy/i.test(generationSignal(scenario)) ? 'Training public record located' : 'No bankruptcy record located in the training packet',
    averageMonthlyDeposits: money(deposits),
    averageMonthlyOutflow: money(outflow),
    averageBalance: money(Math.max(320, deposits - outflow + 1100)),
    overdrafts: nsf,
    nsfReturns: nsf,
    paymentHistory: financialTone === 'established' ? 'Paid as agreed in the available history' : financialTone === 'mixed' ? 'One recent late payment and otherwise established history' : 'Multiple missed or returned payments in the current review window',
    existingLimit: existing ? money(Math.max(amount * 1.4, 5000)) : 'No existing limit',
    requestedLimit: money(Math.max(amount, 2500)),
    completedDocuments: businessReview ? ['Business registration', 'Owner identity record', 'Application or review request'] : ['Identity record', 'Application or review request', 'Credit-file summary'],
    missingDocuments,
    findingBoundary: confirmedApplicationFinding
      ? 'Credit strength and document completeness are recorded separately. The application finding must be supported by independent source records.'
      : 'Credit strength and document completeness do not by themselves establish an application finding.',
    sourceNote: `All values are fictional and derived for ${scenario.subtype} training.`,
    complexityNote: difficulty === 'deep' ? 'Deep review includes a source conflict and an additional missing-document dependency.' : difficulty === 'standard' ? 'Standard review includes one reconciliation issue.' : 'Focused review contains the primary income, credit, and cash-flow records.',
    deadline: deadlineFrom(reportedDate, businessReview ? 3 : 2, '4:00 PM'),
    reasonCode: businessReview ? `Training ${existing ? 'existing-business exposure' : 'new-business application'} review` : `Training ${existing ? 'existing-consumer account' : 'new-consumer application'} review`,
  };
}

function makeTransactions({ id, claimType, scenario, amount, reportedDate, issueStartDate, recordCount, difficulty, merchantPacket }) {
  if (!claimType.availableTools.includes('Transaction History')) return [];
  if (scenario.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) return [];
  const rail = productRailFor(claimType, scenario);
  const signal = generationSignal(scenario);
  const primaryName = merchantPacket?.profile.name ?? scenario.transactionInfo.split(' - ')[0];
  const step = Math.max(18, Math.round(Math.max(amount, 120) * 0.13));
  const recurring = /subscription|cancel|recurring/i.test(signal);
  const recurringDays = /annual/i.test(`${signal} ${scenario.transactionInfo}`) ? 365 : 30;
  const records = Array.from({ length: Math.max(2, recordCount) }, (_, itemIndex) => {
    const current = itemIndex === 0;
    const itemAmount = current ? amount : Math.max(0, amount - (itemIndex * step));
    let channel = 'Account activity';
    let instrument = 'Training payment object';
    let merchant = current || recurring ? primaryName : `${primaryName} prior activity ${itemIndex}`;
    let category = 'Account activity';
    let entryMode = 'Not supplied';

    if (rail === 'card') {
      channel = merchantChannel(signal) === 'Recurring' ? 'Recurring card billing' : merchantChannel(signal) === 'In-store' ? 'Card present' : merchantChannel(signal) === 'Digital wallet' ? 'Digital wallet payment' : 'Card not present';
      instrument = scenario.transactionInfo.match(/training card ending \d+/i)?.[0] ?? 'Training card';
      category = recurring ? 'Subscription billing' : 'Card activity';
      entryMode = channel;
    } else if (rail === 'payroll') {
      channel = current ? 'Direct deposit destination activity' : 'Prior payroll deposit';
      instrument = 'Training payroll account';
      merchant = current ? 'Payroll destination change' : `Payroll deposit period ${itemIndex}`;
      category = 'Payroll activity';
      entryMode = 'Account record';
    } else if (rail === 'wire') {
      channel = current ? 'Wire instruction record' : 'Prior beneficiary payment';
      instrument = 'Training business payment account';
      merchant = current ? scenario.transactionInfo.split(' - ')[0] : `Established beneficiary ${itemIndex}`;
      category = 'Wire activity';
      entryMode = 'Account instruction';
    } else if (/credit|loan|line/.test(rail)) {
      channel = current
        ? rail === 'line' ? 'Credit-line draw activity' : 'Credit exposure activity'
        : rail === 'line' ? 'Line utilization history' : 'Scheduled payment history';
      instrument = rail === 'line'
        ? scenario.productType === PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT ? 'Training business line of credit' : 'Training personal line of credit'
        : scenario.productType === PRODUCT_TYPES.BUSINESS_LOAN ? 'Training business installment loan' : 'Training personal installment loan';
      merchant = current ? scenario.transactionInfo.split(' - ')[0] : `Credit relationship record ${itemIndex}`;
      category = 'Credit relationship activity';
      entryMode = 'Account record';
    }

    return {
      id: `${id}-TXN-${itemIndex + 1}`,
      posted: current ? reportedDate : shiftedDate(recurring ? reportedDate : issueStartDate, -(itemIndex * (recurring ? recurringDays : 21))),
      time: current ? '9:18 AM' : `${String(8 + itemIndex).padStart(2, '0')}:42 AM`,
      merchant,
      amount: money(itemAmount),
      direction: itemAmount === 0 ? 'Non-monetary' : 'Debit',
      channel,
      category,
      entryMode,
      location: 'Not supplied',
      instrument,
      status: current ? 'Posted record' : 'Historical record',
      context: current ? `${scenario.subtype} activity in the current fictional case.` : `Prior ${claimType.shortLabel.toLowerCase()} activity supplied for baseline comparison.`,
      relatedRecords: [],
      relatedDocuments: [],
    };
  });

  if (difficulty === 'deep') {
    records.push({
      id: `${id}-TXN-C1`,
      posted: shiftedDate(reportedDate, -1),
      time: '7:56 PM',
      merchant: primaryName,
      amount: money(Math.max(1, Math.round(amount * 0.03 * 100) / 100)),
      direction: 'Debit',
      channel: records[0].channel,
      category: records[0].category,
      entryMode: records[0].entryMode,
      location: 'Not supplied',
      instrument: records[0].instrument,
      status: 'Declined attempt',
      context: 'Additional deep-review attempt record with timing that must be compared to the settled activity.',
      relatedRecords: [],
      relatedDocuments: [],
    });
  }
  return records;
}

function makePaymentVerification({ id, claimType, scenario, person, business, reportedDate, issueStartDate, transactions, index }) {
  if (!claimType.availableTools.includes('Payment Verification')) return [];
  const seed = stableNumber(`${id}-payment`);
  const rail = productRailFor(claimType, scenario);
  const applicationReview = scenario.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW;
  const destinationType = applicationReview
    ? 'Application repayment account'
    : rail === 'payroll' ? 'Payroll destination' : rail === 'wire' ? 'Beneficiary destination' : /credit|loan|line/.test(rail) ? 'Payment account' : 'Card authorization object';
  const destination = `DST-${String(seed).slice(-7).padStart(7, '0')}`;
  const bankCode = `BC-${String(seed).slice(-5)}`;
  const tone = claimType.id === WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE ? 'established' : /credit|loan|line/.test(rail) ? creditDeterminationTone(scenario) : determinationTone(scenario);
  const recordedOwner = rail === 'wire' || (scenario.customerType === CUSTOMER_TYPES.BUSINESS && /loan|line/.test(rail)) ? business : person;
  return [{
    id: `${id}-PV-1`, type: destinationType, object: `Destination ID ${destination}`, status: 'Lookup completed', lastSeen: `${reportedDate} - 9:18 AM`,
    context: applicationReview
      ? `${destinationType} ${destination} appears in the application packet; no transaction is in scope.`
      : `${destinationType} ${destination} is linked to ${scenario.transactionInfo} and ${transactions.length} transaction record(s).`, bankName: pick(['Training Atlantic Bank', 'Training Community Bank', 'Training Mobile Money Network', 'Training Federal Credit Union'], seed),
    accountType: applicationReview ? 'Proposed repayment account' : rail === 'payroll' ? 'Payroll destination account' : rail === 'wire' ? 'Business beneficiary account' : /credit|loan|line/.test(rail) ? 'External payment account' : 'Card network object',
    accountHolder: tone === 'established'
      ? recordedOwner
      : tone === 'mixed'
        ? `${recordedOwner.split(' ')[0]?.[0] ?? 'T'}. ${recordedOwner.split(' ').at(-1)}`
        : `Training holder ${String(seed).slice(-4)}`,
    ownerMatch: tone === 'established' ? 'Match' : tone === 'mixed' ? 'Partial Match' : 'No Match',
    accountStatus: 'Open', standing: tone === 'exception' ? 'Limited history' : 'Good standing', priorUse: tone === 'established' ? 'Prior use recorded' : 'No prior use located', firstSeen: issueStartDate,
    verificationMethod: applicationReview ? 'Application account ownership comparison' : rail === 'card' ? 'Network authorization packet' : 'Training ownership and history comparison', recoverability: applicationReview ? 'Not applicable — no funds moved' : rail === 'wire' ? 'Recall status pending receiving-bank response' : 'Review path documented in the payment packet',
    bankCode, destinationId: destination, oldDestination: applicationReview ? 'No prior application repayment account supplied' : rail === 'payroll' || rail === 'wire' ? 'Established destination ending 2204' : 'Prior payment object on file', newDestination: `Bank Code ${bankCode} · Destination ID ${destination}`,
    changeComparison: `${destination} was ${tone === 'established' ? 'used before the current activity window' : `first observed ${issueStartDate}`}.`, verificationOutcome: `${destinationType}, ownership, status, prior use, and first-seen date recorded`, relatedRecords: transactions.map((item) => item.id),
    actions: ['Compare ownership and prior use', 'Document the trusted verification source'], verificationLog: [{ time: `${reportedDate} - 9:30 AM`, method: 'Training lookup', result: tone === 'mixed' ? 'Unable to Verify' : 'Recorded', note: 'The log records source evidence only.' }], notes: `Generated payment object ${index} for ${scenario.subtype}.`,
  }];
}

function sourceRecordId(prefix, seed, offset = 0) {
  const suffix = String((Math.abs(seed) + (offset * 7919)) % 1000000).padStart(6, '0');
  return `${prefix}-${suffix}`;
}

function applicationComparisonRecord({
  caseId,
  sequence,
  type,
  value,
  observed,
  context,
  sourceRecordIds,
  sourceSystems,
  relatedRecords = [],
}) {
  return {
    id: `${caseId}-AVR-${sequence}`,
    type,
    value,
    observed,
    status: 'Mismatch corroborated',
    context,
    source: 'Independent fictional source comparison',
    sourceRecordIds,
    sourceSystems,
    comparisonStatus: 'Mismatch corroborated across independent sources',
    corroboration: `${sourceSystems.join(' and ')} independently record the conflicting values.`,
    basisCategory: 'Independent source mismatch',
    relatedRecords,
    conclusionBoundary: 'Document completeness and credit strength are separate review questions and do not establish this source mismatch.',
  };
}

function makeApplicationVerification({
  id,
  scenario,
  person,
  business,
  parties = [],
  trainingId,
  phone,
  email,
  address,
  reportedDate,
}) {
  if (
    scenario.workflowType !== WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
    || scenario.caseTruth?.finalFinding !== FINAL_FINDINGS.FRAUD_CONFIRMED
  ) {
    return [];
  }

  const seed = stableNumber(`${id}-${scenario.id}-application-sources`);
  const signal = generationSignal(scenario).toLowerCase();
  const applicationRecordId = sourceRecordId('APP', seed);
  const alternateTrainingId = `TRN-SRC-${String(seed).slice(-6).padStart(6, '0')}`;
  const applicationContact = `${phone ?? 'application phone'} · ${email ?? 'application email'}`;
  const applicationAddress = address ?? 'application address';

  if (scenario.customerType === CUSTOMER_TYPES.PERSONAL) {
    if (/stolen identity application/.test(signal)) {
      const holderContactId = sourceRecordId('HCV', seed, 1);
      const deviceSourceId = sourceRecordId('DVC', seed, 2);
      const carrierSourceId = sourceRecordId('TEL', seed, 3);
      return [
        applicationComparisonRecord({
          caseId: id,
          sequence: 1,
          type: 'Applicant confirmation comparison',
          value: `${applicationRecordId} ↔ ${holderContactId}`,
          observed: reportedDate,
          context: `${applicationRecordId} records an online submission for ${person} using ${trainingId}. ${holderContactId}, created through a trusted previously established contact, records that ${person} did not submit or authorize that application.`,
          sourceRecordIds: [applicationRecordId, holderContactId],
          sourceSystems: ['Fictional application system', 'Trusted-holder verification record'],
          relatedRecords: [`${id}-IDR-1`, `${id}-DOC-1`],
        }),
        applicationComparisonRecord({
          caseId: id,
          sequence: 2,
          type: 'Contact and device ownership comparison',
          value: `${deviceSourceId} · ${carrierSourceId}`,
          observed: reportedDate,
          context: `${deviceSourceId} links the submitting device to ${alternateTrainingId}; ${carrierSourceId} assigns the application phone from ${applicationContact} to the same unrelated training profile. Neither source links the device or phone to ${trainingId}.`,
          sourceRecordIds: [deviceSourceId, carrierSourceId],
          sourceSystems: ['Fictional device registry', 'Fictional carrier ownership source'],
          relatedRecords: [`${id}-IDR-2`, `${id}-DOC-2`],
        }),
      ];
    }

    const identityRegistryId = sourceRecordId('TIR', seed, 1);
    const carrierSourceId = sourceRecordId('TEL', seed, 2);
    const creditHeaderId = sourceRecordId('CRH', seed, 3);
    return [
      applicationComparisonRecord({
        caseId: id,
        sequence: 1,
        type: 'Identity-key source comparison',
        value: `${applicationRecordId} ↔ ${identityRegistryId}`,
        observed: reportedDate,
        context: `${applicationRecordId} lists ${person}, ${trainingId}, and ${applicationAddress}. ${identityRegistryId} resolves ${trainingId} to a different fictional source profile and a different first-seen address.`,
        sourceRecordIds: [applicationRecordId, identityRegistryId],
        sourceSystems: ['Fictional application system', 'Independent training-identity registry'],
        relatedRecords: [`${id}-IDR-1`, `${id}-IDR-3`],
      }),
      applicationComparisonRecord({
        caseId: id,
        sequence: 2,
        type: 'Contact-file corroboration',
        value: `${carrierSourceId} · ${creditHeaderId}`,
        observed: reportedDate,
        context: `${carrierSourceId} assigns the application phone in ${applicationContact} to ${alternateTrainingId}. ${creditHeaderId} independently records the application email and address under another training source profile rather than ${trainingId}.`,
        sourceRecordIds: [carrierSourceId, creditHeaderId],
        sourceSystems: ['Fictional carrier ownership source', 'Independent credit-header source'],
        relatedRecords: [`${id}-IDR-2`, `${id}-DOC-2`],
      }),
    ];
  }

  const entityParty = parties.find((party) => /business account holder/i.test(party.role)) ?? { id: `${id}-PTY-1`, name: business };
  const submitterParty = parties.find((party) => /application submitter/i.test(party.role)) ?? { id: `${id}-PTY-2`, name: person };
  const registrationRecordId = sourceRecordId('REG', seed, 1);

  if (/tradeline piggyback/.test(signal)) {
    const applicationTradeId = sourceRecordId('ATR', seed, 2);
    const bureauTradeId = sourceRecordId('TBR', seed, 3);
    const providerVerificationId = sourceRecordId('RPV', seed, 4);
    const unrelatedBusinessId = `BIZ-SRC-${String(seed).slice(-5).padStart(5, '0')}`;
    return [
      applicationComparisonRecord({
        caseId: id,
        sequence: 1,
        type: 'Trade-reference ownership comparison',
        value: `${applicationTradeId} ↔ ${bureauTradeId}`,
        observed: reportedDate,
        context: `${applicationTradeId} attributes the submitted trade reference to ${business}. ${bureauTradeId} records the same reference number under ${unrelatedBusinessId}, with no obligor, guarantor, or ownership relationship to ${entityParty.name}.`,
        sourceRecordIds: [applicationTradeId, bureauTradeId],
        sourceSystems: ['Business application trade-reference file', 'Independent training-bureau trade file'],
        relatedRecords: [entityParty.id, submitterParty.id, `${id}-DOC-4`],
      }),
      applicationComparisonRecord({
        caseId: id,
        sequence: 2,
        type: 'Reference-provider corroboration',
        value: `${bureauTradeId} · ${providerVerificationId}`,
        observed: reportedDate,
        context: `${providerVerificationId} records a trusted verification with the named reference provider, which confirms that ${business} was not the customer on ${bureauTradeId} and was not authorized to use that history.`,
        sourceRecordIds: [bureauTradeId, providerVerificationId],
        sourceSystems: ['Independent training-bureau trade file', 'Trusted reference-provider verification'],
        relatedRecords: [entityParty.id, `${id}-DOC-1`],
      }),
    ];
  }

  const bankOwnershipId = sourceRecordId('BNK', seed, 2);
  const invoiceRecordId = sourceRecordId('INV', seed, 3);
  const counterpartyVerificationId = sourceRecordId('CPV', seed, 4);
  const unrelatedBusinessId = `BIZ-SRC-${String(seed).slice(-5).padStart(5, '0')}`;
  return [
    applicationComparisonRecord({
      caseId: id,
      sequence: 1,
      type: 'Entity and account ownership comparison',
      value: `${registrationRecordId} · ${bankOwnershipId}`,
      observed: reportedDate,
      context: `${registrationRecordId} corroborates that ${business} has a fictional registration. ${bankOwnershipId} records the operating account cited in ${applicationRecordId} as owned by ${unrelatedBusinessId}, not ${entityParty.name}.`,
      sourceRecordIds: [applicationRecordId, registrationRecordId, bankOwnershipId],
      sourceSystems: ['Fictional application system', 'Independent entity registry', 'Independent account-ownership source'],
      relatedRecords: [entityParty.id, submitterParty.id, `${id}-PV-1`],
    }),
    applicationComparisonRecord({
      caseId: id,
      sequence: 2,
      type: 'Operating-record corroboration',
      value: `${invoiceRecordId} ↔ ${counterpartyVerificationId}`,
      observed: reportedDate,
      context: `${invoiceRecordId} is the invoice reference submitted for ${business}. ${counterpartyVerificationId} records a trusted verification with the named counterparty, which confirms it did not issue that invoice or maintain the stated customer relationship.`,
      sourceRecordIds: [invoiceRecordId, counterpartyVerificationId],
      sourceSystems: ['Submitted invoice source', 'Trusted counterparty verification'],
      relatedRecords: [entityParty.id, `${id}-DOC-4`],
    }),
  ];
}

function makeBusinessRecords({ id, claimType, scenario, person, employer, business, parties = [], reportedDate, issueStartDate, amount, recordCount, creditProfile, applicationVerification = [], paymentVerification = [] }) {
  const tools = new Set(claimType.availableTools);
  const result = {};
  const seed = stableNumber(`${id}-${business}-${employer}`);
  const suffix = String(seed).slice(-5).padStart(5, '0');
  const legalName = /llc|inc\.?|corp\.?|company|co\./i.test(employer) ? employer : `${employer} LLC`;
  if (tools.has('Business 360')) {
    const entity = /business|vendor|payroll|merchant/i.test(`${scenario.entityRole} ${claimType.lane}`) ? business : scenario.transactionInfo.split(' - ')[0];
    const namedBusinessParties = parties.filter((party) => party.name && party.name !== business).slice(0, 5);
    result.business360 = [
      { id: `${id}-BIZ-1`, entity, relationship: `${scenario.family ?? claimType.lane} relationship`, status: 'Active profile', observed: reportedDate, context: `${entity} is connected to ${person} and claim ${id}.` },
      ...namedBusinessParties.map((party, partyIndex) => ({
        id: `${id}-BIZ-${partyIndex + 2}`,
        entity: party.name,
        relationship: party.role,
        status: 'Named in case records',
        observed: reportedDate,
        context: `${party.name} is recorded as ${party.role.toLowerCase()} for ${business}.`,
      })),
      { id: `${id}-BIZ-${namedBusinessParties.length + 2}`, entity: scenario.transactionInfo, relationship: 'Activity or exposure in scope', status: scenario.amount, observed: issueStartDate, context: `${scenario.subtype} review covers ${scenario.amount} from ${issueStartDate} through ${reportedDate}.` },
    ];
  }
  if (tools.has('Employee Profile')) {
    const payrollParties = parties.filter((party) => /employee|payroll initiator|payroll approver|payroll administrator/i.test(party.role));
    result.employeeProfile = (payrollParties.length ? payrollParties : [{ name: person, role: scenario.entityRole }]).map((party, partyIndex) => ({
      id: `${id}-EMP-${partyIndex + 1}`,
      name: party.name,
      role: party.role,
      employer,
      status: 'Active profile',
      lastSeen: partyIndex ? issueStartDate : reportedDate,
      context: `${party.name} is separately recorded as ${party.role.toLowerCase()} for ${employer}.`,
    }));
  }
  if (tools.has('Payroll History')) {
    const payrollPeople = (result.employeeProfile?.length ? result.employeeProfile : [
      { id: `${id}-EMP-1`, name: person, role: 'Payroll employee', employer: legalName },
    ]).slice(0, 3);
    const employeeProfiles = payrollPeople.map((employee, employeeIndex) => {
      const verification = employeeIndex === 0 ? paymentVerification[0] : null;
      const baselineDestination = {
        id: `${id}-PD-${employeeIndex + 1}`,
        bankCode: `BC-${String(seed + employeeIndex + 101).slice(-4)}`,
        destinationId: `DST-${String(seed + employeeIndex + 2101).slice(-6)}`,
        percentage: 1,
        status: 'Settled',
        firstSeen: shiftedDate(reportedDate, -365),
        paymentRecordId: `${id}-PV-HIST-${employeeIndex + 1}`,
      };
      return {
        ...employee,
        employer: legalName,
        department: employeeIndex ? 'Operations' : 'Payroll operations',
        position: employee.role ?? 'Employee',
        employmentStatus: 'Active',
        payType: 'Hourly',
        paySchedule: 'Biweekly',
        compensationType: 'Hourly',
        currentRate: `$${(20 + employeeIndex * 2).toFixed(2)} per hour`,
        hireDate: shiftedDate(reportedDate, -(500 + employeeIndex * 180)),
        w4Setup: 'Standard withholding election',
        taxElections: 'Federal withholding · Social Security · Medicare',
        rateHistory: [{ effectiveDate: shiftedDate(reportedDate, -180), value: 20 + employeeIndex * 2 }],
        regularHours: 80,
        federalTaxRate: 0.08 + (employeeIndex * 0.005),
        healthDeduction: 80 + (employeeIndex * 12),
        dentalDeduction: 10 + employeeIndex,
        retirementRate: 0.04,
        employerHealthContribution: 165 + (employeeIndex * 10),
        employerRetirementRate: 0.02,
        employerTaxRate: 0.0815,
        paymentHistory: [{
          effectiveDate: baselineDestination.firstSeen,
          method: 'Direct deposit',
          paymentRecordId: baselineDestination.paymentRecordId,
          destinations: [baselineDestination],
        }, ...(verification ? [{
          effectiveDate: issueStartDate,
          method: 'Direct deposit',
          paymentRecordId: verification.id,
          destinations: [{
            ...baselineDestination,
            id: `${baselineDestination.id}-CURRENT`,
            bankCode: verification.bankCode,
            destinationId: verification.destinationId,
            firstSeen: issueStartDate,
            paymentRecordId: verification.id,
          }],
        }] : [])],
      };
    });
    const runDates = [42, 28, 14, 0].map((days) => shiftedDate(reportedDate, -days));
    const payroll = createCompanyPayrollData({
      companyPayrollProfile: {
        businessId: `BIZ-${suffix}`,
        legalName,
        address: `${300 + (seed % 6000)} Company Training Drive, Dallas, TX`,
        maskedEin: `**-***${suffix.slice(-4)}`,
        payrollId: `PAYROLL-${suffix}`,
        paySchedule: 'Biweekly',
        nextPayDate: shiftedDate(reportedDate, 14),
        activeEmployeeCount: employeeProfiles.length,
        selectedDateRange: `${runDates[0]} – ${runDates.at(-1)}`,
      },
      employeeProfiles,
      runDefinitions: runDates.map((payDate, itemIndex) => ({
        id: `${id}-PR-${itemIndex + 1}`,
        payPeriodStart: shiftedDate(payDate, -13),
        payPeriodEnd: payDate,
        payDate,
        runType: itemIndex === 2 && seed % 4 === 0 ? 'Correction' : 'Regular',
        status: 'Settled',
        fundingBankCode: `BC-FUND-${suffix.slice(-4)}`,
        fundingAccount: `Operating checking ending ${suffix.slice(-4)}`,
        fundingPaymentRecordId: `PV-FUND-${suffix}`,
        submissionDate: shiftedDate(payDate, -3),
        settlementDate: payDate,
        submittedBy: parties.find((party) => /initiator|administrator/i.test(party.role ?? ''))?.name ?? 'Payroll administrator',
        approvedBy: parties.find((party) => /approver|owner|control/i.test(party.role ?? ''))?.name ?? 'Controlling party',
      })),
    });
    result.employeeProfile = employeeProfiles;
    result.companyPayrollProfile = payroll.companyPayrollProfile;
    result.payrollRuns = payroll.payrollRuns;
  }
  return result;
}

function makeIdentityReport({ id, claimType, trainingId, person, reportedDate }) {
  if (!claimType.availableTools.includes('Identity Intel / People Search')) return [];
  return [
    { id: `${id}-IDR-1`, label: 'Training identity', type: 'Training ID', value: trainingId, observed: reportedDate, lastSeen: reportedDate, history: `${trainingId} is the identifier supplied in the current fictional case record.` },
    { id: `${id}-IDR-2`, label: 'Profile subject', type: 'Profile subject', value: person, observed: reportedDate, lastSeen: reportedDate, history: `${person} is the subject named in the current fictional case record.` },
  ];
}

function makeFinancialIntel({ id, claimType, scenario, reportedDate, issueStartDate, amount, creditProfile, recordCount, transactions, documents }) {
  if (!claimType.availableTools.includes('Financial Investigation')) return [];
  if (creditProfile) {
    if (creditProfile.customerType === 'Business') {
      return [
        ['Stated annual revenue', creditProfile.statedAnnualIncome, creditProfile.incomeSource],
        ['Verified annual revenue', creditProfile.verifiedAnnualIncome, creditProfile.employerOrBusiness],
        ['Operating cash flow', `${creditProfile.averageMonthlyDeposits} deposits; ${creditProfile.averageMonthlyOutflow} outflow`, `${creditProfile.nsfReturns} NSF or returned-payment event(s)`],
        ['Business credit summary', `${creditProfile.creditScoreBand}; ${creditProfile.utilization} utilization`, `${creditProfile.tradelines} tradelines; ${creditProfile.delinquencies} delinquencies; ${creditProfile.inquiries} recent inquiries`],
        ['Exposure and payment history', creditProfile.requestedExposure, creditProfile.paymentHistory],
        ['Document status', `${creditProfile.completedDocuments.length} complete; ${creditProfile.missingDocuments.length} missing`, creditProfile.missingDocuments.join(', ') || 'No required document is missing'],
      ].map(([type, value, context], itemIndex) => ({ id: `${id}-FIN-${itemIndex + 1}`, type, value, observed: reportedDate, context }));
    }
    return [
      ['Stated income / revenue', creditProfile.statedAnnualIncome, creditProfile.incomeSource],
      ['Verified income / revenue', creditProfile.verifiedAnnualIncome, creditProfile.employerOrBusiness],
      ['Debt-to-income', creditProfile.dti, `${creditProfile.monthlyDebt} monthly debt; ${creditProfile.housingExpense} housing`],
      ['Credit-file summary', `${creditProfile.creditScoreBand}; ${creditProfile.utilization} utilization`, `${creditProfile.tradelines} tradelines; ${creditProfile.delinquencies} delinquencies; ${creditProfile.inquiries} recent inquiries`],
      ['Cash flow', `${creditProfile.averageMonthlyDeposits} deposits; ${creditProfile.averageMonthlyOutflow} outflow`, `${creditProfile.nsfReturns} NSF or returned-payment event(s)`],
      ['Document status', `${creditProfile.completedDocuments.length} complete; ${creditProfile.missingDocuments.length} missing`, creditProfile.missingDocuments.join(', ') || 'No required document is missing'],
    ].map(([type, value, context], itemIndex) => ({ id: `${id}-FIN-${itemIndex + 1}`, type, value, observed: reportedDate, context }));
  }
  const availableDocuments = documents.filter((item) => item.status !== 'Requested').length;
  const requestedDocuments = documents.filter((item) => item.status === 'Requested').length;
  const values = [
    money(amount),
    scenario.transactionInfo,
    `${transactions.length} transaction or activity record(s)`,
    `${availableDocuments} document(s) available; ${requestedDocuments} requested`,
    `${issueStartDate} to ${reportedDate}`,
  ];
  return claimType.evidenceAreas.slice(0, Math.max(2, recordCount)).map((area, itemIndex) => ({
    id: `${id}-FIN-${itemIndex + 1}`,
    type: area,
    value: values[itemIndex % values.length],
    observed: shiftedDate(reportedDate, -itemIndex),
    context: `${scenario.subtype}: ${scenario.statement} Source: ${scenario.channel}.`,
  }));
}

function makeEvidence({ id, scenario, documents, transactions, reportedDate }) {
  return {
    evidence: documents.map((document, itemIndex) => ({ id: `${id}-EVD-${itemIndex + 1}`, status: document.status, type: itemIndex === 0 ? 'Case packet' : 'Supporting document', name: document.name, source: itemIndex === 0 ? scenario.channel : 'Generated training packet', received: document.status === 'Requested' ? 'Pending' : shiftedDate(reportedDate, -itemIndex), summary: document.detail, linkedObject: itemIndex === 0 ? id : transactions[itemIndex % Math.max(1, transactions.length)]?.id ?? id })),
    documents: documents.map((document, itemIndex) => ({ id: document.id, title: document.name, category: document.status === 'Requested' ? 'Requested document' : 'Case document', status: document.status, updated: document.status === 'Requested' ? 'Pending' : shiftedDate(reportedDate, -itemIndex), preview: document.detail, fields: `Case ID, ${scenario.subtype}, source, observed date, training packet status` })),
  };
}

export function buildGeneratedPersona(index, scenario) {
  const firstNames = ['Avery', 'Cameron', 'Drew', 'Emery', 'Harper', 'Jordan', 'Kai', 'Morgan', 'Parker', 'Quinn', 'Reese', 'Riley', 'Rowan', 'Sage', 'Sienna', 'Skyler', 'Taylor', 'Tatum', 'Val', 'Wren'];
  const lastNames = ['Bennett', 'Blake', 'Brooks', 'Carter', 'Ellis', 'Foster', 'Grant', 'Hayes', 'James', 'Lane', 'Monroe', 'Nash', 'Owens', 'Price', 'Reed', 'Shaw', 'Stone', 'Vale', 'West', 'Young'];
  const cities = ['Dallas, TX', 'Fort Worth, TX', 'Arlington, TX', 'Irving, TX', 'DeSoto, TX', 'Cedar Hill, TX', 'Plano, TX', 'Grapevine, TX', 'Austin, TX', 'San Antonio, TX', 'Houston, TX', 'Phoenix, AZ', 'Denver, CO', 'Chicago, IL', 'Charlotte, NC', 'Atlanta, GA'];
  const employers = ['Lakeside Office Supply', 'Riverbend Services', 'Northline Operations', 'Cedar Square Logistics', 'Brightline Studio', 'Oakline Health Group', 'Juniper Field Services', 'Parkline Manufacturing', 'Westhaven Education', 'Harbor City Works'];
  const businesses = ['Northline Services LLC', 'Cedar Square Market LLC', 'Riverbend Operations Inc.', 'Brightline Supply Co.', 'Lakeside Trade Group LLC', 'Oakline Media Works LLC', 'Juniper Logistics Inc.', 'Parkline Home Services LLC', 'Westhaven Consulting LLC', 'Harbor Retail Group Inc.'];
  const seed = stableNumber(`${index}-${scenario.id}`);
  const person = `${pick(firstNames, seed)} ${pick(lastNames, seed, 7)}`;
  const city = pick(cities, seed, 3);
  const phoneSuffix = 100 + (seed % 900);
  const street = 100 + (seed % 9700);
  return {
    person,
    city,
    employer: pick(employers, seed, 5),
    business: pick(businesses, seed, 9),
    phone: `(555) 010-${String(phoneSuffix).padStart(4, '0')}`,
    email: `${person.toLowerCase().replace(/[^a-z0-9]+/g, '.')}+${String(seed).slice(-4)}@training.example.test`,
    address: `${street} Training Way, ${city}`,
  };
}

export function buildGeneratedToolResults({ id, index, person, city, employer, business, phone, email, address, parties = [], claimType, scenario, documents, recordCount, trainingId, reportedDate, issueStartDate, difficulty }) {
  const amount = numberFromMoney(scenario.amount);
  const merchantRelevant = [WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM, WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE].includes(claimType.id);
  const merchantPacket = merchantRelevant ? makeMerchantPacket({ id, index, claimType, scenario, person, reportedDate, issueStartDate, amount, recordCount, difficulty }) : null;
  const creditRelevant = [WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW, WORKFLOW_TYPES.CREDIT_RISK_REVIEW].includes(claimType.id);
  const creditProfile = creditRelevant ? makeCreditProfile({ id, index, claimType, scenario, person, business, amount, reportedDate, difficulty }) : null;
  const transactions = makeTransactions({ id, claimType, scenario, amount, reportedDate, issueStartDate, recordCount, difficulty, merchantPacket });
  const paymentVerification = makePaymentVerification({ id, claimType, scenario, person, business, reportedDate, issueStartDate, transactions, index });
  const applicationVerification = makeApplicationVerification({
    id,
    scenario,
    person,
    business,
    parties,
    trainingId,
    phone,
    email,
    address,
    reportedDate,
  });
  const evidence = makeEvidence({ id, scenario, documents, transactions, reportedDate });
  const result = {
    transactions,
    financialIntel: makeFinancialIntel({ id, claimType, scenario, reportedDate, issueStartDate, amount, creditProfile, recordCount, transactions, documents }),
    paymentVerification,
    applicationVerification,
    ...makeBusinessRecords({ id, claimType, scenario, person, employer, business, parties, reportedDate, issueStartDate, amount, recordCount, creditProfile, applicationVerification, paymentVerification }),
    ...evidence,
    identityReport: makeIdentityReport({ id, claimType, trainingId, person, reportedDate }),
  };
  if (merchantPacket) result.merchantIntelligence = merchantPacket;
  if (creditProfile) result.creditProfile = creditProfile;
  return result;
}

export function buildScenarioDecisionData({ claimType, scenario, reportedDate, toolResults }) {
  if ([WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM, WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE].includes(claimType.workflowType)) {
    const merchant = toolResults.merchantIntelligence;
    return {
      chargebackDecision: {
        reasonCode: merchant?.reasonCode ?? reasonCodeFor(scenario.subtype),
        responseDeadline: merchant?.responseDeadline ?? deadlineFrom(reportedDate, 10, '3:00 PM'),
        merchantEvidence: 'Merchant identity, order, customer history, response, fulfillment, refund, dispute, and contact records',
        authorizationReview: 'Entry mode, AVS, CVV, 3DS, OTP, wallet token, device, IP, and approval or decline attempts',
        fulfillmentReview: 'Delivery, service, activation, usage, return, cancellation, and refund evidence for the selected subtype',
        customerContact: 'Cardholder statement and merchant-contact history compared to the reason-code requirement',
      },
      creditDecision: null,
    };
  }
  if ([WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW, WORKFLOW_TYPES.CREDIT_RISK_REVIEW].includes(claimType.workflowType)) {
    const credit = toolResults.creditProfile;
    return {
      chargebackDecision: null,
      creditDecision: {
        family: scenario.family ?? 'Credit review',
        deadline: credit?.deadline ?? deadlineFrom(reportedDate, 2, '4:00 PM'),
        reasonCode: credit?.reasonCode ?? `Training ${scenario.subtype} review`,
        completeDocuments: credit?.completedDocuments ?? [],
        missingDocuments: credit?.missingDocuments ?? [],
      },
    };
  }
  return { chargebackDecision: null, creditDecision: null };
}

export function buildScenarioEvents({ id, scenario, claimType, reportedDate, issueStartDate, difficulty, evidenceDepth, documents = [] }) {
  const availableDocuments = documents.filter((item) => item.status !== 'Requested');
  const requestedDocuments = documents.filter((item) => item.status === 'Requested');
  const isCustomerReport = scenario.caseOriginType === 'customer-reported-claim';
  const events = [
    { id: `${id}-EVT-1`, time: `${issueStartDate} - 10:10 AM`, label: 'Activity in review window', detail: `${scenario.transactionInfo} for ${scenario.amount} was recorded. This activity alone is not a finding.`, chip: 'Case event', object: 'Case' },
    { id: `${id}-EVT-2`, time: `${reportedDate} - 9:05 AM`, label: isCustomerReport ? 'Claim or report received' : 'Alert routed to manual review', detail: isCustomerReport ? `${scenario.channel} received this report: ${scenario.statement}` : scenario.caseEscalationReason, chip: 'Intake', object: 'Statement' },
    { id: `${id}-EVT-3`, time: `${reportedDate} - 9:18 AM`, label: 'Evidence packet initialized', detail: `${evidenceDepth} packet created with ${availableDocuments.length} available document(s) and ${requestedDocuments.length} requested document(s) for ${claimType.label}.`, chip: 'Packet', object: 'Document' },
  ];
  if (difficulty !== 'light') events.push({ id: `${id}-EVT-C1`, time: `${reportedDate} - 10:20 AM`, label: 'Cross-source comparison added', detail: `Compare the ${scenario.channel} statement with ${scenario.transactionInfo}, payment ownership, and dated profile records.`, chip: 'Comparison', object: 'Record' });
  if (difficulty === 'deep') events.push({ id: `${id}-EVT-C2`, time: `${reportedDate} - 11:35 AM`, label: 'Additional evidence dependency recorded', detail: requestedDocuments.length ? `${requestedDocuments.map((item) => item.name).join(' and ')} remain requested while the available records are reviewed.` : `The ${scenario.subtype} timing must be reconciled across transaction, profile, and document records.`, chip: 'Dependency', object: 'Document' });
  return events;
}
