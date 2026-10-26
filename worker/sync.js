// Cloudflare Worker: 账号 + 进度同步
//
// 路由
//   POST /auth/register  { username, password } -> { token, user }
//   POST /auth/login     { username, password } -> { token, user }
//   POST /auth/logout    (Bearer)               -> { ok }
//   GET  /me             (Bearer)               -> { user }
//   GET  /state          (Bearer)               -> 进度 JSON
//   PUT  /state          (Bearer)               -> { ok }
//
// KV 键
//   user:<username>   { salt, hash, createdAt }
//   state:<username>  进度 JSON（整块快照）
//   session:<token>   { user }  TTL 30 天
//
// 说明：前端在 xxx.pages.dev、Worker 在 xxx.workers.dev，属跨域；请求带 Authorization
// 自定义头，浏览器会先发 OPTIONS 预检，所以 CORS 头必须齐全，否则同步会静默失败。
//
// 密码哈希用单次 SHA-256(salt:password)。没错，这比 PBKDF2 弱，但 Workers 免费版
// 每请求只有 10ms CPU，PBKDF2 十万次迭代必然超时被打断。对「背单词进度」这类数据，
// 这个强度够用；真要升级得换付费计划或在客户端预先做慢哈希。

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

const SESSION_TTL = 60 * 60 * 24 * 30;

function send(data, status = 200) {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normUser(v) {
  return String(v || '').trim();
}

async function newSession(env, user) {
  const token = randomHex(32);
  await env.STATE.put(`session:${token}`, JSON.stringify({ user }), { expirationTtl: SESSION_TTL });
  return token;
}

async function bearerUser(env, request) {
  const h = request.headers.get('authorization') || '';
  const token = h.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const raw = await env.STATE.get(`session:${token}`);
  if (!raw) return null;
  try { return JSON.parse(raw).user || null; } catch (e) { return null; }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    try {
      if (path === '/auth/register' && method === 'POST') {
        const body = await request.json();
        const user = normUser(body.username);
        const password = String(body.password || '');
        if (user.length < 2) return send({ error: '用户名至少 2 个字符' }, 400);
        if (user.length > 32) return send({ error: '用户名最多 32 个字符' }, 400);
        if (password.length < 6) return send({ error: '密码至少 6 位' }, 400);

        const ukey = `user:${user}`;
        if (await env.STATE.get(ukey)) return send({ error: '该用户名已注册' }, 409);

        const salt = randomHex(16);
        const hash = await sha256Hex(`${salt}:${password}`);
        await env.STATE.put(ukey, JSON.stringify({ salt, hash, createdAt: Date.now() }));
        const token = await newSession(env, user);
        return send({ token, user });
      }

      if (path === '/auth/login' && method === 'POST') {
        const body = await request.json();
        const user = normUser(body.username);
        const password = String(body.password || '');
        const raw = await env.STATE.get(`user:${user}`);
        if (!raw) return send({ error: '用户名不存在' }, 401);
        const rec = JSON.parse(raw);
        const hash = await sha256Hex(`${rec.salt}:${password}`);
        if (hash !== rec.hash) return send({ error: '密码错误' }, 401);
        const token = await newSession(env, user);
        return send({ token, user });
      }

      if (path === '/auth/logout' && method === 'POST') {
        const h = request.headers.get('authorization') || '';
        const token = h.replace(/^Bearer\s+/i, '').trim();
        if (token) await env.STATE.delete(`session:${token}`);
        return send({ ok: true });
      }

      if (path === '/me' && method === 'GET') {
        const user = await bearerUser(env, request);
        if (!user) return send({ error: '未登录或会话已过期' }, 401);
        const rec = JSON.parse(await env.STATE.get(`user:${user}`) || '{}');
        return send({ user, profile: rec.profile || {} });
      }

      // 昵称、头像色等资料，存在 user:<用户名> 记录里
      if (path === '/profile' && method === 'PUT') {
        const user = await bearerUser(env, request);
        if (!user) return send({ error: '未登录或会话已过期' }, 401);
        const ukey = `user:${user}`;
        const raw = await env.STATE.get(ukey);
        const rec = raw ? JSON.parse(raw) : null;
        if (!rec) return send({ error: '账号数据丢失' }, 404);
        let body;
        try { body = await request.json(); }
        catch (e) { return send({ error: 'invalid json' }, 400); }
        const patch = {};
        if (typeof body.nickname === 'string') patch.nickname = body.nickname.trim().slice(0, 24);
        if (typeof body.color === 'string') patch.color = body.color.slice(0, 24);
        rec.profile = { ...(rec.profile || {}), ...patch };
        await env.STATE.put(ukey, JSON.stringify(rec));
        return send({ profile: rec.profile });
      }

      if (path === '/auth/password' && method === 'POST') {
        const user = await bearerUser(env, request);
        if (!user) return send({ error: '未登录或会话已过期' }, 401);
        const body = await request.json();
        const oldPass = String(body.oldPassword || '');
        const newPass = String(body.newPassword || '');
        if (newPass.length < 6) return send({ error: '新密码至少 6 位' }, 400);
        const ukey = `user:${user}`;
        const rec = JSON.parse(await env.STATE.get(ukey) || 'null');
        if (!rec) return send({ error: '账号数据丢失' }, 404);
        if (await sha256Hex(`${rec.salt}:${oldPass}`) !== rec.hash) {
          return send({ error: '原密码错误' }, 401);
        }
        rec.salt = randomHex(16);
        rec.hash = await sha256Hex(`${rec.salt}:${newPass}`);
        await env.STATE.put(ukey, JSON.stringify(rec));
        return send({ ok: true });
      }

      if (path === '/auth/rename' && method === 'POST') {
        const user = await bearerUser(env, request);
        if (!user) return send({ error: '未登录或会话已过期' }, 401);
        const body = await request.json();
        const next = normUser(body.newUsername);
        if (next.length < 2) return send({ error: '用户名至少 2 个字符' }, 400);
        if (next.length > 32) return send({ error: '用户名最多 32 个字符' }, 400);
        if (next === user) return send({ user });

        const oldKey = `user:${user}`;
        const newKey = `user:${next}`;
        if (await env.STATE.get(newKey)) return send({ error: '该用户名已被占用' }, 409);

        const rec = await env.STATE.get(oldKey);
        if (!rec) return send({ error: '账号数据丢失' }, 404);
        await env.STATE.put(newKey, rec);
        await env.STATE.delete(oldKey);

        const oldState = await env.STATE.get(`state:${user}`);
        if (oldState) {
          await env.STATE.put(`state:${next}`, oldState);
          await env.STATE.delete(`state:${user}`);
        }
        // 会话里记的是用户名，改名后必须同步更新，否则下一次请求就找不到自己
        const h = request.headers.get('authorization') || '';
        const token = h.replace(/^Bearer\s+/i, '').trim();
        if (token) {
          await env.STATE.put(`session:${token}`, JSON.stringify({ user: next }), { expirationTtl: SESSION_TTL });
        }
        return send({ user: next });
      }

      if (path === '/state' && method === 'GET') {
        const user = await bearerUser(env, request);
        if (!user) return send({ error: '未登录或会话已过期' }, 401);
        const val = await env.STATE.get(`state:${user}`);
        return send(val || '{}');
      }

      if (path === '/state' && method === 'PUT') {
        const user = await bearerUser(env, request);
        if (!user) return send({ error: '未登录或会话已过期' }, 401);
        let body;
        try { body = await request.json(); }
        catch (e) { return send({ error: 'invalid json' }, 400); }
        await env.STATE.put(`state:${user}`, JSON.stringify(body));
        return send({ ok: true });
      }

      if (path === '/' && method === 'GET') {
        return send({ service: 'cet-study-sync', ok: true });
      }

      return send({ error: 'not found' }, 404);
    } catch (e) {
      return send({ error: String(e && e.message ? e.message : e) }, 500);
    }
  },
};
