import fs from 'node:fs';
import { trainingCases } from '../src/data/cases.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { coreClaimTypes } from '../src/data/claimRegistry.js';
import { getDeviceProfiles } from '../src/data/deviceRecords.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';

const failures = [];
const placeholderPattern = /\b(?:lookup needed|training os not recorded|compare against login history|placeholder|tbd)\b|^device\s*\/?\s*browser$/i;
const requiredFields = [
  'id',
  'deviceName',
  'deviceType',
  'operatingSystem',
  'browser',
  'deviceFingerprint',
  'browserFingerprint',
  'firstSeen',
  'lastSeen',
  'trustedStatus',
  'rootedJailbroken',
  'emulatorIndicator',
  'vpnProxyIndicator',
  'sharedDeviceDetection',
  'linkedProfiles',
  'walletUsage',
  'normalBehavior',
  'lookupResult',
  'history',
  'relatedRecords',
  'investigatorUse',
];

function fail(message) {
  failures.push(message);
}

function present(value) {
  return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim().length > 0;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function verifyCase(activeCase, label, generated = false) {
  const logins = activeCase.loginHistory ?? [];
  const expectedIds = [...new Set(logins.map((login) => login.deviceId).filter(Boolean))];
  const profiles = getDeviceProfiles(activeCase);
  const actualIds = profiles.map((profile) => profile.id);

  if (JSON.stringify(sorted(actualIds)) !== JSON.stringify(sorted(expectedIds))) {
    fail(`${label} Device Intelligence IDs do not match Login History: expected ${expectedIds.join(', ')}, received ${actualIds.join(', ')}.`);
  }

  for (const profile of profiles) {
    const linkedLogins = logins.filter((login) => login.deviceId === profile.id);
    for (const field of requiredFields) {
      if (!present(profile[field])) fail(`${label}/${profile.id} is missing ${field}.`);
    }

    const revealedText = requiredFields
      .flatMap((field) => Array.isArray(profile[field]) ? profile[field] : [profile[field]])
      .filter(Boolean)
      .join(' ');
    if (placeholderPattern.test(revealedText)) {
      fail(`${label}/${profile.id} still exposes a Device Intelligence placeholder.`);
    }
    if (!/^FP-/i.test(profile.deviceFingerprint ?? '')) fail(`${label}/${profile.id} has a non-canonical device fingerprint.`);
    if (!/^BR-/i.test(profile.browserFingerprint ?? '')) fail(`${label}/${profile.id} has a non-canonical browser fingerprint.`);
    if (!linkedLogins.length) fail(`${label}/${profile.id} has no linked Login History record.`);
    if (!linkedLogins.some((login) => profile.relatedRecords.includes(login.id))) {
      fail(`${label}/${profile.id} does not cross-reference a linked login event.`);
    }
    if (!profile.linkedProfiles.includes(activeCase.trainingId)) {
      fail(`${label}/${profile.id} does not retain Training ID ${activeCase.trainingId}.`);
    }

    if (generated) {
      const expectedOperatingSystems = [...new Set(linkedLogins.map((login) => login.operatingSystem).filter(Boolean))];
      const expectedBrowsers = [...new Set(linkedLogins.map((login) => login.browserSource).filter(Boolean))];
      for (const operatingSystem of expectedOperatingSystems) {
        if (!profile.operatingSystem.includes(operatingSystem)) {
          fail(`${label}/${profile.id} lost generated operating system ${operatingSystem}.`);
        }
      }
      for (const browser of expectedBrowsers) {
        if (!profile.browser.includes(browser)) {
          fail(`${label}/${profile.id} lost generated browser ${browser}.`);
        }
      }
    }
  }

  return profiles.length;
}

let builtInProfiles = 0;
for (const activeCase of enrichTrainingCases(trainingCases).filter((item) => item.availableTools?.includes('Device Intelligence'))) {
  builtInProfiles += verifyCase(activeCase, activeCase.id);
}

let generatedCases = 0;
let generatedProfiles = 0;
let generatedSequence = 2000000000000;
for (const claimType of coreClaimTypes) {
  for (const scenario of claimType.scenarios) {
    generatedSequence += 1;
    const generated = createGeneratedCase({
      index: generatedSequence,
      claimTypeId: claimType.id,
      scenarioId: scenario.id,
      difficulty: 'deep',
      evidenceDepth: 'deep',
    });
    if (!generated.availableTools.includes('Device Intelligence')) continue;
    generatedCases += 1;
    generatedProfiles += verifyCase(generated, scenario.id, true);
  }
}

if (!generatedCases) fail('No generated Device Intelligence cases were exercised.');

const panel = fs.readFileSync(new URL('../src/tools/IdentityDigitalTools.jsx', import.meta.url), 'utf8');
for (const anchor of [
  'export function DeviceIntelligenceTool',
  'Search the complete Device ID, device fingerprint, or browser fingerprint.',
  'Run exact search',
  'No exact record matched the submitted search.',
  'lookup.setSelected(records.find',
  'exactText(record.id, lookup.query)',
]) {
  if (!panel.includes(anchor)) fail(`Device Intelligence search UI is missing: ${anchor}`);
}

if (failures.length) {
  console.error(`Device Intelligence smoke check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Device Intelligence smoke check passed for ${builtInProfiles} built-in profiles and ${generatedProfiles} profiles across ${generatedCases} eligible generated scenarios. Device IDs resolve to complete, non-placeholder profiles and unmatched searches cannot reveal a stale record.`);
