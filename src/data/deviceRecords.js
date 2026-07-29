import {
  fullAccessTimestamp,
  hasCreatedSession,
  stableAccessNumber,
  uniqueAccessValues,
} from './accessHistoryUtils.js';

const deviceProfilesByCase = {
  'FA-ATO-24018': [
    {
      id: 'DEV-MAYA-IP16-001',
      deviceName: 'iPhone 16',
      deviceType: 'Mobile phone',
      operatingSystem: 'iOS 18 training build',
      browser: 'Mobile Safari / bank app webview',
      deviceFingerprint: 'FP-MAYA-IP16-A71C',
      browserFingerprint: 'BR-SAFARI-8842',
      firstSeen: 'Jan 18, 2026',
      lastSeen: 'Jul 8, 2026 10:42 AM',
      trustedStatus: 'Trusted device',
      rootedJailbroken: 'No indicator',
      emulatorIndicator: 'No indicator',
      vpnProxyIndicator: 'No proxy indicator',
      sharedDeviceDetection: 'Not shared',
      linkedProfiles: ['TRN-8842-19'],
      walletUsage: 'Debit card wallet not newly provisioned in this case window',
      normalBehavior: 'Matches normal Dallas / Irving mobile access pattern',
      lookupResult: 'Known device match',
      history: [
        'Jul 8, 2026 10:42 AM · Face ID · Dallas, TX · SES-7781',
        'Jun 30, 2026 6:51 PM · Face ID · Irving, TX · SES-7604',
        'Jun 14, 2026 7:24 PM · Face ID · Dallas, TX · SES-7421',
        'Apr 9, 2026 9:48 AM · Face ID · Dallas, TX · SES-6602',
      ],
      relatedRecords: ['LOG-1008', 'LOG-0998', 'LOG-0981', 'LOG-0928', 'IP-198.51.100.42'],
      investigatorUse: 'Use this to compare the disputed transaction session against the customer known mobile pattern.',
    },
    {
      id: 'DEV-MAYA-CHRM-002',
      deviceName: 'Chrome Mobile',
      deviceType: 'Mobile browser',
      operatingSystem: 'Android browser profile',
      browser: 'Chrome Mobile',
      deviceFingerprint: 'FP-MAYA-CHRM-22B9',
      browserFingerprint: 'BR-CHROME-8842',
      firstSeen: 'May 22, 2026',
      lastSeen: 'Jul 8, 2026 8:13 AM',
      trustedStatus: 'Known secondary device',
      rootedJailbroken: 'No indicator',
      emulatorIndicator: 'No indicator',
      vpnProxyIndicator: 'No proxy indicator',
      sharedDeviceDetection: 'Not shared',
      linkedProfiles: ['TRN-8842-19'],
      walletUsage: 'No new wallet activity tied to this device',
      normalBehavior: 'Occasional known access from Dallas area',
      lookupResult: 'Known device match',
      history: [
        'Jul 8, 2026 8:13 AM · Password · Dallas, TX · SES-7760',
        'May 22, 2026 12:13 PM · Password · Dallas, TX · SES-7014',
      ],
      relatedRecords: ['LOG-1005', 'LOG-0954', 'IP-198.51.100.11'],
      investigatorUse: 'Use as a secondary-device comparison point; it does not by itself decide the claim.',
    },
  ],
  'FA-CB-24007': [
    {
      id: 'DEV-JORDAN-AND-001',
      deviceName: 'Android phone',
      deviceType: 'Mobile phone',
      operatingSystem: 'Android 15 training build',
      browser: 'Mobile app / Chrome WebView',
      deviceFingerprint: 'FP-JORDAN-AND-55F1',
      browserFingerprint: 'BR-ANDROID-5510',
      firstSeen: 'May 8, 2026',
      lastSeen: 'Jul 8, 2026 8:19 AM',
      trustedStatus: 'Trusted device',
      rootedJailbroken: 'No indicator',
      emulatorIndicator: 'No indicator',
      vpnProxyIndicator: 'No proxy indicator',
      sharedDeviceDetection: 'Not shared',
      linkedProfiles: ['TRN-5510-06'],
      walletUsage: 'No wallet provisioning event in dispute window',
      normalBehavior: 'Matches normal Fort Worth mobile app behavior',
      lookupResult: 'Known device match',
      history: [
        'Jul 8, 2026 8:19 AM · Password · Fort Worth, TX · SES-4412',
        'Jul 2, 2026 4:02 PM · Biometric · Fort Worth, TX · SES-4310',
        'Jun 8, 2026 8:36 AM · Biometric · Fort Worth, TX · SES-4018',
        'May 8, 2026 9:11 AM · Biometric · Fort Worth, TX · SES-3880',
      ],
      relatedRecords: ['LOG-2204', 'LOG-2200', 'LOG-2178', 'LOG-2142'],
      investigatorUse: 'Use this to confirm the dispute form came from the same normal device pattern before reviewing merchant evidence.',
    },
    {
      id: 'DEV-JORDAN-DSK-002',
      deviceName: 'Desktop Chrome',
      deviceType: 'Desktop browser',
      operatingSystem: 'Windows training workstation',
      browser: 'Chrome desktop',
      deviceFingerprint: 'FP-JORDAN-DSK-8D22',
      browserFingerprint: 'BR-CHROME-5510',
      firstSeen: 'Jun 21, 2026',
      lastSeen: 'Jun 21, 2026 11:10 AM',
      trustedStatus: 'Known secondary device',
      rootedJailbroken: 'Not applicable',
      emulatorIndicator: 'No indicator',
      vpnProxyIndicator: 'No proxy indicator',
      sharedDeviceDetection: 'Not shared',
      linkedProfiles: ['TRN-5510-06'],
      walletUsage: 'No wallet activity',
      normalBehavior: 'Older profile activity only',
      lookupResult: 'Known secondary device',
      history: ['Jun 21, 2026 11:10 AM · Password · Fort Worth, TX · SES-4201'],
      relatedRecords: ['LOG-2191', 'IP-203.0.113.10'],
      investigatorUse: 'Use only as background history; this device is not tied to the current billing dispute form.',
    },
  ],
  'FA-CR-24003': [
    {
      id: 'DEV-AVERY-SAF-001',
      deviceName: 'Mobile Safari',
      deviceType: 'Mobile browser',
      operatingSystem: 'iOS mobile browser profile',
      browser: 'Mobile Safari',
      deviceFingerprint: 'FP-AVERY-SAF-2044',
      browserFingerprint: 'BR-SAFARI-2044',
      firstSeen: 'Jul 7, 2026 5:05 PM',
      lastSeen: 'Jul 8, 2026 7:43 AM',
      trustedStatus: 'New account device',
      rootedJailbroken: 'No indicator',
      emulatorIndicator: 'No indicator',
      vpnProxyIndicator: 'No proxy indicator',
      sharedDeviceDetection: 'Not shared',
      linkedProfiles: ['TRN-2044-77'],
      walletUsage: 'No wallet history; payment setup used external Destination ID',
      normalBehavior: 'Only early-history device available',
      lookupResult: 'Limited history',
      history: [
        'Jul 8, 2026 7:43 AM · Password · Arlington, TX · SES-9302',
        'Jul 8, 2026 7:36 AM · Password · Arlington, TX · SES-9299',
        'Jul 7, 2026 5:18 PM · Email code · Arlington, TX · SES-9100',
        'Jul 7, 2026 5:05 PM · Password setup · Arlington, TX · SES-9094',
      ],
      relatedRecords: ['LOG-3314', 'LOG-3309', 'LOG-3301', 'LOG-3298', 'PAY-3302'],
      investigatorUse: 'Use this to separate normal early-history behavior from the rapid payment setup and credit usage sequence.',
    },
  ],
};

function inferredDeviceType(login = {}) {
  const source = `${login.device ?? ''} ${login.authChannel ?? ''} ${login.browserSource ?? ''}`.toLowerCase();
  if (/desktop|windows|macos/.test(source)) return 'Desktop browser';
  if (/mobile app|bank app|training app/.test(source)) return 'Mobile app device';
  if (/mobile|iphone|android|safari|webview/.test(source)) return 'Mobile browser';
  return 'Device / browser';
}

function accessTimeValue(activeCase, login) {
  const parsed = Date.parse(fullAccessTimestamp(activeCase, login.time).replace('·', ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function deviceSignal(logins, field, fallback) {
  return logins.find((login) => login[field])?.[field] ?? fallback;
}

function generatedDeviceStatus(id, logins) {
  const successfulLogins = logins.filter(hasCreatedSession);
  const source = `${id} ${logins.map((login) => login.device).join(' ')}`.toLowerCase();
  if (!successfulLogins.length) return 'No successful session returned';
  if (/-n\b|new training|newly observed/.test(source)) return 'Newly observed device';
  if (successfulLogins.length > 1 || /-m\b|established|trusted|known/.test(source)) return 'Established device history';
  return 'Limited device history';
}

function generatedNormalBehavior(activeCase, id, logins) {
  const successfulLogins = logins.filter(hasCreatedSession);
  const locations = uniqueAccessValues(logins.map((login) => login.location));
  const locationSummary = locations.join(' · ') || activeCase.intake?.customerLocation || 'No location returned';
  const source = `${id} ${logins.map((login) => login.device).join(' ')}`.toLowerCase();

  if (!successfulLogins.length) {
    return `Only failed or locked authentication events returned from ${locationSummary}; no successful device baseline is established.`;
  }
  if (/-n\b|new training|newly observed/.test(source)) {
    return `First observed in ${locationSummary}; compare this device with the established-device and customer-location history.`;
  }
  if (successfulLogins.length > 1 || /-m\b|established|trusted|known/.test(source)) {
    return `${successfulLogins.length} successful session${successfulLogins.length === 1 ? '' : 's'} returned across ${locationSummary}; compare timing and activity with the active claim.`;
  }
  return `One successful session returned from ${locationSummary}; compare it with earlier device and login history.`;
}

function fallbackDeviceProfiles(activeCase) {
  const devices = new Map();
  for (const login of activeCase.loginHistory ?? []) {
    const id = login.deviceId ?? `DEV-${login.id}`;
    const deviceLogins = devices.get(id) ?? [];
    deviceLogins.push(login);
    devices.set(id, deviceLogins);
  }

  return [...devices.entries()].map(([id, deviceLogins]) => {
    const sortedLogins = [...deviceLogins].sort((left, right) => accessTimeValue(activeCase, right) - accessTimeValue(activeCase, left));
    const newestLogin = sortedLogins[0] ?? {};
    const oldestLogin = sortedLogins.at(-1) ?? newestLogin;
    const relatedProfileChanges = (activeCase.customer?.profileChanges ?? []).filter((event) => event.device === id);
    const linkedProfiles = uniqueAccessValues([
      ...deviceLogins.map((login) => login.trainingId),
      activeCase.trainingId,
    ]);
    const browserSources = uniqueAccessValues(deviceLogins.map((login) => login.browserSource ?? login.browser ?? login.device));
    const operatingSystems = uniqueAccessValues(deviceLogins.map((login) => login.operatingSystem));
    const deviceNames = uniqueAccessValues(deviceLogins.map((login) => login.device));
    const walletEvents = relatedProfileChanges.filter((event) => /wallet|token|payee/i.test(`${event.eventType} ${event.item}`));
    const fingerprintSuffix = stableAccessNumber(`${activeCase.id}-${id}`).toString(16).toUpperCase().padStart(4, '0');
    const browserSuffix = stableAccessNumber(`${id}-${browserSources.join('-')}`).toString(16).toUpperCase().padStart(4, '0');

    return {
      id,
      deviceName: deviceNames.join(' · ') || id,
      deviceType: inferredDeviceType(newestLogin),
      operatingSystem: operatingSystems.join(' · ') || 'Operating system not supplied by source',
      browser: browserSources.join(' · ') || 'Browser not supplied by source',
      deviceFingerprint: deviceSignal(deviceLogins, 'deviceFingerprint', `FP-${id}-${fingerprintSuffix}`),
      browserFingerprint: deviceSignal(deviceLogins, 'browserFingerprint', `BR-${id}-${browserSuffix}`),
      firstSeen: fullAccessTimestamp(activeCase, oldestLogin.time),
      lastSeen: fullAccessTimestamp(activeCase, newestLogin.time),
      trustedStatus: deviceSignal(deviceLogins, 'trustedStatus', generatedDeviceStatus(id, deviceLogins)),
      rootedJailbroken: deviceSignal(deviceLogins, 'rootedJailbroken', 'No rooted or jailbroken indicator returned'),
      emulatorIndicator: deviceSignal(deviceLogins, 'emulatorIndicator', 'No emulator-like indicator returned'),
      vpnProxyIndicator: deviceSignal(deviceLogins, 'vpnProxyIndicator', 'No device-level VPN or proxy indicator returned'),
      sharedDeviceDetection: deviceSignal(deviceLogins, 'sharedDeviceDetection', linkedProfiles.length > 1
        ? `${linkedProfiles.length} linked training profiles returned`
        : 'No additional linked training profile returned'),
      linkedProfiles: linkedProfiles.length ? linkedProfiles : ['No linked training profile returned'],
      walletUsage: deviceSignal(deviceLogins, 'walletUsage', walletEvents.length
        ? walletEvents.map((event) => `${event.id} · ${event.item}`).join(' · ')
        : 'No wallet, token, or payee activity returned for this device'),
      normalBehavior: generatedNormalBehavior(activeCase, id, deviceLogins),
      lookupResult: `${deviceLogins.length} authentication event${deviceLogins.length === 1 ? '' : 's'} returned for ${id}`,
      history: sortedLogins.map((login) => (
        `${fullAccessTimestamp(activeCase, login.time)} · ${login.result} · ${login.method} · ${login.location} · ${hasCreatedSession(login) ? login.session : 'No session created'}`
      )),
      relatedRecords: uniqueAccessValues(deviceLogins.flatMap((login) => [
        login.id,
        hasCreatedSession(login) ? login.session : null,
        login.ip ? `IP-${login.ip}` : null,
      ]).concat(relatedProfileChanges.map((event) => event.id))),
      investigatorUse: 'Use this returned profile to compare device timing, authentication, browser, network, and profile activity against the case story.',
    };
  });
}

export function getDeviceProfiles(activeCase) {
  return deviceProfilesByCase[activeCase.id] ?? fallbackDeviceProfiles(activeCase);
}
