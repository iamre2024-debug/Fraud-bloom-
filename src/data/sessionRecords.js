import { accessDate, addMinutesToTimestamp, fullAccessTimestamp, hasCreatedSession, stableAccessNumber, uniqueAccessValues } from './accessHistoryUtils.js';

const sessionDetailsById = {
  'SES-7781': {
    end: '10:57 AM', duration: '15 minutes', logoutStatus: 'Session timeout recorded',
    pagesViewed: ['Account overview', 'Profile email', 'Card controls'], securitySettings: ['Card controls viewed'],
    profileActions: ['PCH-1001 · Email viewed', 'PCH-1002 · Card controls viewed'], payeeTokenActivity: ['No payee or token change recorded'],
    moneyMovement: ['EVT-1014 · Card purchase posted after session activity'], sessionPath: ['10:42 AM · Face ID login', '10:47 AM · Profile and card controls viewed', '10:52 AM · Card purchase posted', '10:57 AM · Session timeout'],
    investigatorUse: 'Compare the recorded session sequence with the customer statement and transaction timing.',
  },
  'SES-7760': {
    end: '8:22 AM', duration: '19 minutes', logoutStatus: 'Normal logout recorded',
    pagesViewed: ['Account overview', 'Security center', 'Recovery contact settings', 'Alert preferences'], securitySettings: ['Recovery email settings opened', 'Security-alert delivery settings opened'],
    profileActions: ['PCH-1001 · Recovery email updated', 'PCH-1002 · Security alert delivery updated'], payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['No money movement recorded in this session'],
    sessionPath: ['8:03 AM · Password and SMS-code login', '8:07 AM · Recovery email updated', '8:09 AM · Security-alert delivery updated', '8:22 AM · Normal logout'],
    investigatorUse: 'Compare the failed attempts, authentication, profile-maintenance sequence, alert delivery, and later transaction timing.',
  },
  'SES-7604': {
    end: '6:58 PM', duration: '7 minutes', logoutStatus: 'Normal logout recorded',
    pagesViewed: ['Account overview'], securitySettings: ['No security setting opened'], profileActions: ['No profile change recorded'],
    payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['No money movement recorded'],
    sessionPath: ['6:51 PM · Face ID login', '6:54 PM · Account overview viewed', '6:58 PM · Normal logout'], investigatorUse: 'Use as prior known-device and location context.',
  },
  'SES-7421': {
    end: '7:28 PM', duration: '4 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Statement delivery settings'],
    securitySettings: ['No security setting opened'], profileActions: ['PCH-1004 · Statement delivery viewed'], payeeTokenActivity: ['No payee or token activity recorded'],
    moneyMovement: ['No money movement recorded'], sessionPath: ['7:24 PM · Face ID login', '7:25 PM · Statement delivery settings viewed', '7:28 PM · Normal logout'], investigatorUse: 'Use as longer-term normal mobile session context.',
  },
  'SES-7014': {
    end: '12:19 PM', duration: '6 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Savings transfer setup'],
    securitySettings: ['No security setting opened'], profileActions: ['PCH-1005 · Savings transfer setup viewed'], payeeTokenActivity: ['No payee or token activity recorded'],
    moneyMovement: ['No money movement recorded'], sessionPath: ['12:13 PM · Password login', '12:16 PM · Transfer setup viewed', '12:19 PM · Normal logout'], investigatorUse: 'Use as prior secondary-device context only.',
  },
  'SES-6602': {
    end: '9:53 AM', duration: '5 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Profile address'], securitySettings: ['No security setting opened'],
    profileActions: ['PCH-1006 · Address confirmation viewed'], payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['No money movement recorded'],
    sessionPath: ['9:48 AM · Face ID login', '9:50 AM · Address confirmation viewed', '9:53 AM · Normal logout'], investigatorUse: 'Use as historical device and location context.',
  },
  'SES-4412': {
    end: '8:31 AM', duration: '12 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Dispute form', 'Merchant billing detail'], securitySettings: ['No security setting opened'],
    profileActions: ['PCH-2201 · Dispute form submitted'], payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['EVT-2201 · Merchant charge posted before session'],
    sessionPath: ['8:19 AM · Password login', '8:20 AM · Dispute form opened', '8:28 AM · Prior merchant charge located', '8:31 AM · Normal logout'], investigatorUse: 'Compare this session to the form contents and merchant history.',
  },
  'SES-4310': {
    end: '4:10 PM', duration: '8 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Billing statement'], securitySettings: ['No security setting opened'],
    profileActions: ['PCH-2202 · Statement viewed'], payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['No money movement recorded'],
    sessionPath: ['4:02 PM · Biometric login', '4:05 PM · Billing statement viewed', '4:10 PM · Normal logout'], investigatorUse: 'Use as prior statement-review context.',
  },
  'SES-4201': {
    end: '11:21 AM', duration: '11 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Profile overview'], securitySettings: ['No security setting opened'], profileActions: ['No profile change recorded'],
    payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['No money movement recorded'], sessionPath: ['11:10 AM · Password login', '11:15 AM · Profile overview viewed', '11:21 AM · Normal logout'], investigatorUse: 'Use only as older secondary-device session context.',
  },
  'SES-4018': {
    end: '8:42 AM', duration: '6 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Billing statement'], securitySettings: ['No security setting opened'],
    profileActions: ['PCH-2204 · Merchant transaction viewed'], payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['EVT-2178 · Prior merchant charge viewed'],
    sessionPath: ['8:36 AM · Biometric login', '8:36 AM · Prior merchant charge viewed', '8:42 AM · Normal logout'], investigatorUse: 'Use to compare the earlier recurring billing activity.',
  },
  'SES-3880': {
    end: '9:16 AM', duration: '5 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Billing statement'], securitySettings: ['No security setting opened'],
    profileActions: ['PCH-2205 · Merchant transaction posted'], payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['EVT-2142 · Earlier merchant charge located'],
    sessionPath: ['9:11 AM · Biometric login', '9:12 AM · Earlier merchant charge located', '9:16 AM · Normal logout'], investigatorUse: 'Use as historical billing context only.',
  },
  'SES-9302': {
    end: '7:52 AM', duration: '9 minutes', logoutStatus: 'Session timeout recorded', pagesViewed: ['Profile review', 'Credit line overview'], securitySettings: ['No security setting opened'],
    profileActions: ['PCH-3302 · Limit usage request submitted'], payeeTokenActivity: ['No token change recorded in session'], moneyMovement: ['EVT-3308 · Limit usage request submitted before session'],
    sessionPath: ['7:43 AM · Password login', '7:43 AM · Profile review opened', '7:52 AM · Session timeout'], investigatorUse: 'Compare the early-account session with payment and identity records.',
  },
  'SES-9299': {
    end: '7:42 AM', duration: '14 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Payment method'], securitySettings: ['No security setting opened'],
    profileActions: ['PCH-3301 · Payment method added'], payeeTokenActivity: ['Bank Code and Destination ID tokenized'], moneyMovement: ['EVT-3302 · Payment method added during session'],
    sessionPath: ['7:28 AM · Password login', '7:31 AM · Payment method added', '7:42 AM · Normal logout'], investigatorUse: 'Use to place payment setup and account navigation in sequence.',
  },
  'SES-9100': {
    end: '5:31 PM', duration: '13 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Recovery contact setup', 'Profile overview'], securitySettings: ['Recovery phone verification opened'],
    profileActions: ['PCH-3302 · Recovery phone verified'], payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['No money movement recorded'],
    sessionPath: ['5:18 PM · Email code login', '5:18 PM · Recovery phone verified', '5:31 PM · Normal logout'], investigatorUse: 'Use as early-account recovery-contact setup context only.',
  },
  'SES-9094': {
    end: '5:15 PM', duration: '10 minutes', logoutStatus: 'Normal logout recorded', pagesViewed: ['Password setup', 'Profile creation'], securitySettings: ['Password setup recorded'],
    profileActions: ['PCH-3303 · Profile created'], payeeTokenActivity: ['No payee or token activity recorded'], moneyMovement: ['No money movement recorded'],
    sessionPath: ['5:05 PM · Password setup', '5:05 PM · Profile created', '5:15 PM · Normal logout'], investigatorUse: 'Use to establish the first known account session.',
  },
};

function scenarioTemplate(activeCase = {}) {
  const claim = `${activeCase.claimTypeId ?? ''} ${activeCase.claimType ?? activeCase.type ?? ''} ${activeCase.subtype ?? ''}`.toLowerCase();
  if (/account-takeover|account takeover|session hijack|phishing|sim swap/.test(claim)) return {
    pagesViewed: ['Account overview', 'Security center', 'Profile settings', 'Payment activity'],
    securitySettings: ['Recovery and authentication settings opened'],
    payeeTokenActivity: ['Payee or wallet-token records opened for review'],
    moneyMovement: ['Transaction activity opened for comparison; no authorization conclusion recorded'],
  };
  if (/payroll|direct deposit|ghost employee/.test(claim)) return {
    pagesViewed: ['Employee roster', 'Payroll profile', 'Direct deposit settings', 'Approval queue'],
    securitySettings: ['Payroll-administrator access settings opened'],
    payeeTokenActivity: ['Payroll destination record opened'],
    moneyMovement: ['Next payroll-run preview opened for comparison'],
  };
  if (/email|bec|vendor|beneficiary|wire/.test(claim)) return {
    pagesViewed: ['Vendor profile', 'Payment instruction', 'Beneficiary details', 'Approval queue'],
    securitySettings: ['Business payment-approval settings opened'],
    payeeTokenActivity: ['Beneficiary destination record opened'],
    moneyMovement: ['Payment instruction opened for comparison'],
  };
  if (/chargeback|card dispute|subscription|merchant/.test(claim)) return {
    pagesViewed: ['Transaction detail', 'Merchant history', 'Dispute form'],
    securitySettings: ['No security setting opened'],
    payeeTokenActivity: ['No payee or token activity recorded'],
    moneyMovement: ['Disputed transaction detail opened for comparison'],
  };
  if (/credit|application|bust-out|identity/.test(claim)) return {
    pagesViewed: ['Application status', 'Identity documents', 'Payment profile', 'Account overview'],
    securitySettings: ['Application verification settings opened'],
    payeeTokenActivity: ['External payment destination record opened'],
    moneyMovement: ['Credit or payment setup activity opened for comparison'],
  };
  return {
    pagesViewed: ['Account overview', 'Recent activity'],
    securitySettings: ['No security setting opened'],
    payeeTokenActivity: ['No payee or token activity recorded'],
    moneyMovement: ['No money movement recorded'],
  };
}

function generatedDetails(activeCase, login, itemIndex) {
  const template = scenarioTemplate(activeCase);
  const durationMinutes = 8 + ((stableAccessNumber(login.session) + itemIndex) % 9);
  const start = fullAccessTimestamp(activeCase, login.time);
  const end = addMinutesToTimestamp(activeCase, start, durationMinutes);
  const logoutStatus = login.logoutStatus ?? (itemIndex % 2 ? 'Session timeout recorded' : 'Normal logout recorded');
  return {
    end,
    duration: `${durationMinutes} minutes`,
    logoutStatus,
    ...template,
    profileActions: ['No profile change recorded'],
    sessionPath: [
      `${start} · ${login.method} login`,
      `${addMinutesToTimestamp(activeCase, start, 2)} · ${template.pagesViewed[0]} opened`,
      `${addMinutesToTimestamp(activeCase, start, 5)} · ${template.pagesViewed.at(-1)} opened`,
      `${end} · ${logoutStatus}`,
    ],
    investigatorUse: 'Compare this generated session with its login, profile-maintenance, device, IP, transaction, and timeline records.',
  };
}

function defaultDetails(activeCase, login, itemIndex) {
  if (String(activeCase.id ?? '').includes('-G')) return generatedDetails(activeCase, login, itemIndex);
  return {
    end: 'Not recorded', duration: 'Not recorded', logoutStatus: 'Not recorded', pagesViewed: ['Not recorded'], securitySettings: ['Not recorded'],
    profileActions: ['No linked profile action recorded'], payeeTokenActivity: ['No linked payee or token activity recorded'], moneyMovement: ['No linked money movement recorded'],
    sessionPath: [`${fullAccessTimestamp(activeCase, login.time)} · ${login.method} login`], investigatorUse: 'Compare this session with linked login, device, IP, and timeline records.',
  };
}

export function getSessionRecords(activeCase) {
  const profileChanges = activeCase.customer?.profileChanges ?? [];
  return (activeCase.loginHistory ?? []).filter(hasCreatedSession).map((login, itemIndex) => {
    const detail = sessionDetailsById[login.session] ?? defaultDetails(activeCase, login, itemIndex);
    const start = fullAccessTimestamp(activeCase, login.time);
    const end = /^\d{1,2}:\d{2}\s+[AP]M$/.test(String(detail.end))
      ? `${accessDate(activeCase, start)} · ${detail.end}`
      : fullAccessTimestamp(activeCase, detail.end);
    const matchingProfileChanges = profileChanges.filter((event) => event.session === login.session);
    const profileActions = matchingProfileChanges.length
      ? matchingProfileChanges.map((event) => `${event.id} · ${event.item}: ${event.oldValue} -> ${event.newValue}`)
      : ['No profile change recorded'];
    const pathDate = accessDate(activeCase, start);
    const sessionPath = (detail.sessionPath ?? []).map((item) => (
      /^\d{1,2}:\d{2}\s+[AP]M\s+·/.test(item) ? `${pathDate} · ${item}` : item
    ));
    const hasProfileActivity = matchingProfileChanges.length > 0;
    const hasMoneyActivity = !(detail.moneyMovement ?? []).every((item) => /no money|no linked/i.test(item));
    const activityTypes = uniqueAccessValues([
      hasProfileActivity ? 'Profile maintenance' : null,
      !(detail.securitySettings ?? []).every((item) => /no security|not recorded/i.test(item)) ? 'Security settings' : null,
      !(detail.payeeTokenActivity ?? []).every((item) => /no payee|not recorded/i.test(item)) ? 'Payee or token' : null,
      hasMoneyActivity ? 'Financial activity' : null,
      'Navigation',
    ]);
    return {
      ...login,
      ...detail,
      start,
      end,
      date: accessDate(activeCase, start),
      profileActions,
      sessionPath,
      hasProfileActivity,
      hasMoneyActivity,
      activityTypes,
      relatedRecords: uniqueAccessValues([
        login.id,
        login.deviceId ?? login.device,
        `IP-${login.ip}`,
        ...matchingProfileChanges.map((event) => event.id),
        ...(detail.moneyMovement ?? []).filter((item) => !/no money|no linked/i.test(item)),
      ]),
    };
  }).sort((left, right) => {
    const leftTime = Date.parse(left.start.replace('·', ''));
    const rightTime = Date.parse(right.start.replace('·', ''));
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
    return rightTime - leftTime;
  });
}
