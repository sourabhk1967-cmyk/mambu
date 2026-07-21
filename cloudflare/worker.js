const DEFAULT_API_ORIGIN = 'https://kyrovia.loca.lt';

function apiOrigin(env) {
  return String(env.KYROVIA_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
}

function apiBaseUrl(env) {
  return `${apiOrigin(env)}/api`;
}

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');

  return new Response(JSON.stringify(payload), {
    ...init,
    headers
  });
}

function createProxyRequest(request, targetUrl) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('content-length');
  headers.set('Bypass-Tunnel-Reminder', 'true');

  return new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual'
  });
}

async function proxyApiRequest(request, env) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${apiOrigin(env)}${incomingUrl.pathname}${incomingUrl.search}`);
  const response = await fetch(createProxyRequest(request, targetUrl));
  const headers = new Headers(response.headers);

  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return proxyApiRequest(request, env);
    }

    if (url.pathname === '/.well-known/kyrovia-runtime.json') {
      return jsonResponse({
        apiBaseUrl: apiBaseUrl(env),
        checkedAt: new Date().toISOString()
      });
    }

    return env.ASSETS.fetch(request);
  }
};
