function collapsed(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeBusinessIntelName(value = '') {
  return collapsed(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeBusinessIntelId(value = '') {
  return collapsed(value).replace(/[^a-z0-9]/g, '');
}

export function normalizeBusinessIntelPhone(value = '') {
  return String(value).replace(/\D/g, '');
}

export function normalizeBusinessIntelAddress(value = '') {
  const replacements = new Map([
    ['street', 'st'],
    ['avenue', 'ave'],
    ['boulevard', 'blvd'],
    ['drive', 'dr'],
    ['road', 'rd'],
    ['lane', 'ln'],
    ['court', 'ct'],
    ['circle', 'cir'],
    ['parkway', 'pkwy'],
    ['suite', 'ste'],
    ['apartment', 'apt'],
    ['north', 'n'],
    ['south', 's'],
    ['east', 'e'],
    ['west', 'w'],
  ]);
  return collapsed(value)
    .replace(/\(training\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => replacements.get(token) ?? token)
    .join(' ');
}

export const businessIntelSearchModes = {
  businessId: {
    label: 'Training Business ID',
    placeholder: 'Enter the registration or business ID',
    expected(profile = {}) {
      return [profile.businessId, profile.registrationFileNumber];
    },
    normalize: normalizeBusinessIntelId,
  },
  phone: {
    label: 'Business phone',
    placeholder: 'Enter the recorded business phone',
    expected(profile = {}) {
      return profile.phone;
    },
    normalize: normalizeBusinessIntelPhone,
  },
  address: {
    label: 'Business address',
    placeholder: 'Enter the recorded operating address',
    expected(profile = {}) {
      return profile.operatingAddress;
    },
    normalize: normalizeBusinessIntelAddress,
  },
};

function normalizedExpectedValues(mode, profile) {
  const expected = mode.expected(profile);
  const values = Array.isArray(expected) ? expected : [expected];
  return values.map((value) => mode.normalize(value)).filter(Boolean);
}

export function matchesBusinessIntelSearch(dossier = {}, criteria = null) {
  if (!criteria || !businessIntelSearchModes[criteria.mode]) return false;
  const profile = dossier.profile ?? {};
  const mode = businessIntelSearchModes[criteria.mode];
  const expectedName = normalizeBusinessIntelName(profile.legalName);
  const submittedName = normalizeBusinessIntelName(criteria.businessName);
  const expectedSecondaryValues = normalizedExpectedValues(mode, profile);
  const submittedSecondary = mode.normalize(criteria.secondary);
  return Boolean(
    expectedName
    && submittedName
    && expectedSecondaryValues.length
    && submittedSecondary
    && expectedName === submittedName
    && expectedSecondaryValues.includes(submittedSecondary)
  );
}

export function prefillBusinessIntelSearch(dossier = {}, routedQuery = '') {
  const query = String(routedQuery ?? '').trim();
  if (!query) return null;
  const profile = dossier.profile ?? {};
  const match = Object.entries(businessIntelSearchModes).find(([, mode]) => {
    const expectedValues = normalizedExpectedValues(mode, profile);
    return expectedValues.includes(mode.normalize(query));
  });
  if (!match) return null;
  const [mode] = match;
  return {
    mode,
    businessName: profile.legalName,
    secondary: query,
  };
}

export function businessIntelSearchLabel(criteria = {}) {
  const mode = businessIntelSearchModes[criteria.mode];
  return `${criteria.businessName || 'Business'} · ${mode?.label ?? 'Business value'}: ${criteria.secondary || 'Not supplied'}`;
}
