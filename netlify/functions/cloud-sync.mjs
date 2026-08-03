import cloudSyncHandler from '../../api/cloud-sync.js';

function requestHeaders(request) {
  return Object.fromEntries(
    [...request.headers.entries()].map(([name, value]) => [name.toLowerCase(), value]),
  );
}

async function requestBody(request) {
  if (!['PUT', 'POST', 'PATCH'].includes(request.method)) return undefined;
  const text = await request.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export default async function cloudSync(request) {
  const responseHeaders = new Headers();
  const req = {
    method: request.method,
    headers: requestHeaders(request),
    body: await requestBody(request),
    socket: { remoteAddress: request.headers.get('x-nf-client-connection-ip') || undefined },
  };
  const result = { statusCode: 200, body: '' };
  const res = {
    set statusCode(value) {
      result.statusCode = value;
    },
    get statusCode() {
      return result.statusCode;
    },
    setHeader(name, value) {
      responseHeaders.set(name, String(value));
    },
    end(body = '') {
      result.body = String(body);
    },
  };

  await cloudSyncHandler(req, res);
  const responseBody = [204, 205, 304].includes(result.statusCode) ? null : result.body;
  return new Response(responseBody, {
    status: result.statusCode,
    headers: responseHeaders,
  });
}
