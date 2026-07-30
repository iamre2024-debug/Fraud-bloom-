import { createHmac } from 'node:crypto';

const MAX_BODY_BYTES = 4_500_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const requestWindows = new Map();
const snapshotTable = 'fraud_academy_cloud_snapshots';
const compareAndSetFunction = 'fraud_academy_compare_and_set_cloud_snapshot';

function configuredOrigins() {
  return String(process.env.CLOUD_SYNC_ALLOWED_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function requestOrigin(req) {
  const forwardedProtocol = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  return host ? `${forwardedProtocol}://${host}` : '';
}

function allowedCorsOrigin(req) {
  const origin = String(req.headers?.origin || '');
  const allowed = configuredOrigins();
  if (!origin) return allowed[0] || requestOrigin(req);
  if (allowed.length) return allowed.includes(origin) ? origin : '';
  return origin === requestOrigin(req) ? origin : '';
}

function send(req, res, status, body) {
  const corsOrigin = allowedCorsOrigin(req);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fraud-Academy-Sync-Id');
  res.end(JSON.stringify(body));
}

function requestIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function exceedsRateLimit(req, res) {
  const now = Date.now();
  const ip = requestIp(req);
  const current = requestWindows.get(ip);
  const windowState = !current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS
    ? { startedAt: now, count: 0 }
    : current;
  windowState.count += 1;
  requestWindows.set(ip, windowState);

  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - windowState.count);
  res.setHeader('RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil((windowState.startedAt + RATE_LIMIT_WINDOW_MS) / 1000)));
  return windowState.count > RATE_LIMIT_MAX_REQUESTS;
}

function hasCloudConfiguration() {
  return Boolean(
    process.env.SUPABASE_URL
      && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
      && String(process.env.CLOUD_SYNC_HMAC_SECRET || '').length >= 32,
  );
}

function cleanSyncIdentifier(req) {
  return String(req.headers?.['x-fraud-academy-sync-id'] || '').trim().toLowerCase();
}

function storageDigest(syncIdentifier) {
  return createHmac('sha256', process.env.CLOUD_SYNC_HMAC_SECRET)
    .update(syncIdentifier)
    .digest('hex');
}

function supabaseApiKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function supabaseHeaders() {
  const apiKey = supabaseApiKey();
  const headers = {
    apikey: apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (!process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function supabaseRequest(path, { method = 'GET', body } = {}) {
  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    method,
    headers: supabaseHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error('Cloud storage request failed.');
  return result;
}

export default async function handler(req, res) {
  const origin = String(req.headers?.origin || '');
  if (origin && !allowedCorsOrigin(req)) return send(req, res, 403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return send(req, res, 204, {});
  if (!['GET', 'PUT'].includes(req.method)) return send(req, res, 405, { error: 'Method not allowed' });
  if (exceedsRateLimit(req, res)) {
    res.setHeader('Retry-After', '60');
    return send(req, res, 429, { error: 'Too many cloud sync requests. Try again in one minute.' });
  }
  if (!hasCloudConfiguration()) {
    return send(req, res, 503, { error: 'Cloud saving is not configured' });
  }

  const syncIdentifier = cleanSyncIdentifier(req);
  if (!/^[a-f0-9]{64}$/.test(syncIdentifier)) {
    return send(req, res, 401, { error: 'A valid cloud sync identifier is required' });
  }
  const syncKey = storageDigest(syncIdentifier);

  try {
    if (req.method === 'GET') {
      const query = `${snapshotTable}?sync_key=eq.${encodeURIComponent(syncKey)}&select=revision,payload,updated_at&limit=1`;
      const records = await supabaseRequest(query);
      const record = Array.isArray(records) ? records[0] : null;
      return send(req, res, 200, {
        revision: Number(record?.revision) || 0,
        payload: record?.payload || null,
        updatedAt: record?.updated_at || null,
      });
    }

    if (Number(req.headers?.['content-length'] || 0) > MAX_BODY_BYTES) {
      return send(req, res, 413, { error: 'Cloud recovery payload is too large' });
    }
    const body = req.body || {};
    const baseRevision = Number(body.baseRevision);
    const payload = body.payload;
    if (!Number.isInteger(baseRevision) || baseRevision < 0 || !payload || typeof payload !== 'object') {
      return send(req, res, 400, { error: 'Invalid cloud recovery payload' });
    }
    if (payload.version !== 1 || payload.algorithm !== 'AES-GCM' || typeof payload.ciphertext !== 'string') {
      return send(req, res, 400, { error: 'Unsupported cloud recovery payload' });
    }

    const payloadJson = JSON.stringify(payload);
    if (Buffer.byteLength(payloadJson, 'utf8') > MAX_BODY_BYTES) {
      return send(req, res, 413, { error: 'Cloud recovery payload is too large' });
    }

    const result = await supabaseRequest(`rpc/${compareAndSetFunction}`, {
      method: 'POST',
      body: {
        p_sync_key: syncKey,
        p_base_revision: baseRevision,
        p_payload: payload,
      },
    });
    const record = Array.isArray(result) ? result[0] : result;
    if (!record || record.saved !== true) {
      return send(req, res, 409, {
        error: 'Cloud recovery changed on another device',
        revision: Number(record?.revision) || 0,
        payload: record?.payload || null,
      });
    }

    return send(req, res, 200, {
      revision: Number(record.revision) || baseRevision + 1,
      updatedAt: record.updated_at || null,
    });
  } catch {
    return send(req, res, 502, { error: 'Cloud storage is temporarily unavailable' });
  }
}
