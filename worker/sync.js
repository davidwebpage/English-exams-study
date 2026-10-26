// Cloudflare Worker: per-token state blob in KV. Single-user phase-1 sync.
// GET /  -> latest state JSON (or {})
// PUT /  -> store state JSON, body = raw state, x-token header identifies user
//
// 前端（xxx.pages.dev）与 Worker（xxx.workers.dev）不同域，所以必须处理 CORS：
// GET/PUT 都带 x-token 自定义头，浏览器会先发 OPTIONS 预检，预检不过请求根本不会发出。

const CORS = {
  'access-control-allow-origin': '*',        // 想收紧就换成自己的 pages.dev 源
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, x-token',
  'access-control-max-age': '86400',
};

function send(data, status = 200) {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    // 预检：不校验 token，直接放行
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const token = request.headers.get('x-token') || url.searchParams.get('token');
    if (!token) return send({ error: 'missing token' }, 401);
    const key = `state:${token}`;

    if (request.method === 'PUT') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return send({ error: 'invalid json' }, 400);
      }
      await env.STATE.put(key, JSON.stringify(body));
      return send({ ok: true });
    }

    if (request.method === 'GET') {
      const val = await env.STATE.get(key);
      return send(val || '{}');          // 原样透传，前端直接 res.json()
    }

    return send({ error: 'method not allowed' }, 405);
  },
};
