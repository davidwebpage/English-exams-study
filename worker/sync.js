// Cloudflare Worker: per-token state blob in KV. Single-user phase-1 sync.
// GET /  -> latest state JSON (or {})
// PUT /  -> store state JSON, body = raw state, x-token header identifies user

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const token = request.headers.get('x-token') || url.searchParams.get('token');
    if (!token) return new Response('missing token', { status: 401 });
    const key = `state:${token}`;

    if (request.method === 'PUT') {
      const body = await request.json();
      await env.STATE.put(key, JSON.stringify(body));
      return new Response('ok');
    }
    if (request.method === 'GET') {
      const val = await env.STATE.get(key);
      return new Response(val || '{}', { headers: { 'content-type': 'application/json' } });
    }
    return new Response('method not allowed', { status: 405 });
  },
};
