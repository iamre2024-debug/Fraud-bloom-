import { fullAccessTimestamp, hasCreatedSession, stableAccessNumber, uniqueAccessValues } from './accessHistoryUtils.js';

const ipLookupDetails = {
  '198.51.100.42': { city: 'Dallas', country: 'United States', isp: 'Lone Star Fiber training network', networkType: 'Residential broadband', residentialStatus: 'Residential connection', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jan 18, 2026', lastSeen: 'Jul 8, 2026 10:42 AM', historicalLocations: ['Dallas, TX', 'Irving, TX'], velocity: '1 recorded session in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Known network context available' },
  '198.51.100.11': { city: 'Dallas', country: 'United States', isp: 'Metro Mobile Broadband training network', networkType: 'Mobile carrier network', residentialStatus: 'Carrier network', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'May 22, 2026', lastSeen: 'Jul 8, 2026 8:13 AM', historicalLocations: ['Dallas, TX'], velocity: '1 recorded session in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Known secondary network context available' },
  '198.51.100.77': { city: 'Irving', country: 'United States', isp: 'Lone Star Fiber training network', networkType: 'Residential broadband', residentialStatus: 'Residential connection', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jun 30, 2026', lastSeen: 'Jun 30, 2026 6:51 PM', historicalLocations: ['Irving, TX'], velocity: 'No repeated session recorded in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Prior network context available' },
  '198.51.100.40': { city: 'Dallas', country: 'United States', isp: 'Lone Star Fiber training network', networkType: 'Residential broadband', residentialStatus: 'Residential connection', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jun 14, 2026', lastSeen: 'Jun 14, 2026 7:24 PM', historicalLocations: ['Dallas, TX'], velocity: 'No repeated session recorded in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Prior network context available' },
  '198.51.100.13': { city: 'Dallas', country: 'United States', isp: 'Metro Mobile Broadband training network', networkType: 'Mobile carrier network', residentialStatus: 'Carrier network', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'May 22, 2026', lastSeen: 'May 22, 2026 12:13 PM', historicalLocations: ['Dallas, TX'], velocity: 'No repeated session recorded in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Prior secondary-network context available' },
  '198.51.100.38': { city: 'Dallas', country: 'United States', isp: 'Lone Star Fiber training network', networkType: 'Residential broadband', residentialStatus: 'Residential connection', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Apr 9, 2026', lastSeen: 'Apr 9, 2026 9:48 AM', historicalLocations: ['Dallas, TX'], velocity: 'No repeated session recorded in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Historical network context available' },
  '203.0.113.24': { city: 'Fort Worth', country: 'United States', isp: 'Fort Worth Mobile training network', networkType: 'Mobile carrier network', residentialStatus: 'Carrier network', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jul 8, 2026 8:19 AM', lastSeen: 'Jul 8, 2026 8:19 AM', historicalLocations: ['Fort Worth, TX'], velocity: '1 recorded session in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Active-case network context available' },
  '203.0.113.18': { city: 'Fort Worth', country: 'United States', isp: 'Fort Worth Mobile training network', networkType: 'Mobile carrier network', residentialStatus: 'Carrier network', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jul 2, 2026', lastSeen: 'Jul 2, 2026 4:02 PM', historicalLocations: ['Fort Worth, TX'], velocity: 'No repeated session recorded in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Prior network context available' },
  '203.0.113.10': { city: 'Fort Worth', country: 'United States', isp: 'North Texas Business training network', networkType: 'Business broadband', residentialStatus: 'Business connection', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jun 21, 2026', lastSeen: 'Jun 21, 2026 11:10 AM', historicalLocations: ['Fort Worth, TX'], velocity: 'No repeated session recorded in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Older network context available' },
  '203.0.113.16': { city: 'Fort Worth', country: 'United States', isp: 'Fort Worth Mobile training network', networkType: 'Mobile carrier network', residentialStatus: 'Carrier network', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jun 8, 2026', lastSeen: 'Jun 8, 2026 8:36 AM', historicalLocations: ['Fort Worth, TX'], velocity: 'No repeated session recorded in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Prior network context available' },
  '203.0.113.14': { city: 'Fort Worth', country: 'United States', isp: 'Fort Worth Mobile training network', networkType: 'Mobile carrier network', residentialStatus: 'Carrier network', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'May 8, 2026', lastSeen: 'May 8, 2026 9:11 AM', historicalLocations: ['Fort Worth, TX'], velocity: 'No repeated session recorded in the active 24-hour window', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Historical network context available' },
  '192.0.2.44': { city: 'Arlington', country: 'United States', isp: 'Arlington Wireless training network', networkType: 'Mobile carrier network', residentialStatus: 'Carrier network', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jul 8, 2026 7:36 AM', lastSeen: 'Jul 8, 2026 7:43 AM', historicalLocations: ['Arlington, TX'], velocity: '2 recorded sessions in 7 minutes', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Repeated active-case network context available' },
  '192.0.2.21': { city: 'Arlington', country: 'United States', isp: 'Arlington Wireless training network', networkType: 'Mobile carrier network', residentialStatus: 'Carrier network', vpnProxyTor: 'No VPN, proxy, or TOR indicator', firstSeen: 'Jul 7, 2026 5:05 PM', lastSeen: 'Jul 7, 2026 5:18 PM', historicalLocations: ['Arlington, TX'], velocity: '2 recorded setup sessions in 13 minutes', crossCasePresence: 'No other training profile match recorded', lookupResult: 'Early-account network context available' },
};

function defaultDetails(activeCase, ip, logins) {
  const seed = stableAccessNumber(`${activeCase.id}-${ip}`);
  const locations = uniqueAccessValues(logins.map((login) => login.location));
  const city = String(locations[0] ?? activeCase.intake?.customerLocation ?? 'Training city').split(',')[0].trim();
  const networkTypes = ['Residential broadband', 'Mobile carrier network', 'Business broadband', 'Hosting network'];
  const networkType = networkTypes[seed % networkTypes.length];
  const ispNames = ['Northstar Fiber training network', 'Metro Mobile training network', 'Regional Business Net training network', 'Cloud Transit training network'];
  const vpnProxyTor = seed % 7 === 0
    ? 'Proxy indicator returned by fictional lookup'
    : seed % 5 === 0
      ? 'VPN endpoint indicator returned by fictional lookup'
      : 'No VPN, proxy, or TOR indicator returned';
  const sortedTimestamps = logins
    .map((login) => fullAccessTimestamp(activeCase, login.time))
    .sort((left, right) => Date.parse(left.replace('·', '')) - Date.parse(right.replace('·', '')));
  const crossCaseCount = seed % 4;
  return {
    city,
    country: 'United States',
    isp: ispNames[seed % ispNames.length],
    networkType,
    residentialStatus: networkType === 'Residential broadband' ? 'Residential connection' : networkType === 'Mobile carrier network' ? 'Carrier connection' : networkType === 'Business broadband' ? 'Business connection' : 'Non-residential hosting connection',
    vpnProxyTor,
    firstSeen: sortedTimestamps[0] ?? activeCase.issueStartDate ?? activeCase.opened ?? 'Not recorded',
    lastSeen: sortedTimestamps.at(-1) ?? activeCase.reportedDate ?? activeCase.opened ?? 'Not recorded',
    historicalLocations: locations.length ? locations : [city],
    velocity: `${logins.length} authentication event${logins.length === 1 ? '' : 's'} returned for this IP in the training history`,
    crossCasePresence: crossCaseCount ? `${crossCaseCount} other fictional training profile match${crossCaseCount === 1 ? '' : 'es'} returned` : 'No other fictional training profile match returned',
    lookupResult: `Network history returned for ${ip}`,
  };
}

export function getIpRecords(activeCase) {
  const grouped = new Map();
  for (const login of activeCase.loginHistory ?? []) {
    const records = grouped.get(login.ip) ?? [];
    records.push(login);
    grouped.set(login.ip, records);
  }

  return [...grouped.entries()].map(([ip, logins]) => {
    const detail = ipLookupDetails[ip] ?? defaultDetails(activeCase, ip, logins);
    const sessions = uniqueAccessValues(logins.filter(hasCreatedSession).map((login) => login.session));
    const devices = uniqueAccessValues(logins.map((login) => login.deviceId ?? login.device));
    return {
      id: `IP-${ip}`,
      ip,
      ...detail,
      observedSessions: sessions,
      observedDevices: devices,
      observedLogins: logins.map((login) => login.id),
      observedLoginEvents: logins.map((login) => ({ id: login.id, time: fullAccessTimestamp(activeCase, login.time), result: login.result, session: hasCreatedSession(login) ? login.session : 'No session created', device: login.deviceId ?? login.device, location: login.location })),
      relatedRecords: uniqueAccessValues(logins.flatMap((login) => [login.id, hasCreatedSession(login) ? login.session : null, login.deviceId ?? login.device])),
      investigatorUse: 'Use the lookup to compare network context with Login History, Session History, Device Intelligence, and the customer baseline. Network data is supporting evidence, not a standalone decision maker.',
    };
  });
}
