// 账号：走 Cloudflare Worker（worker/sync.js）的服务端认证。
// 本地只保存会话 { user, token }，**不再保存密码或密码哈希**。
// 没登录也能用（游客态），进度存在本机，但不跨设备。

const SESSION_KEY = 'cet.session.v2';

function apiBase() {
  const u = window.__SYNC__ && window.__SYNC__.url;
  return u ? String(u).replace(/\/+$/, '') : '';
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
  catch (e) { return null; }
}
function writeSession(v) {
  try {
    if (v) localStorage.setItem(SESSION_KEY, JSON.stringify(v));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* ignore */ }
}

async function call(path, { method = 'GET', body, token, timeout = 12000 } = {}) {
  const base = apiBase();
  if (!base) throw new Error('同步服务未配置');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const res = await fetch(base + path, {
      method,
      headers,
      signal: ctrl.signal,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 非 JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `请求失败（${res.status}）`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('连接超时，请检查网络');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const auth = {
  current() { return readSession(); },
  authed() { return !!readSession()?.token; },
  token() { return readSession()?.token || null; },
  user() { return readSession()?.user || null; },
  // 账号隔离用的进度命名空间：登录用户用自己的用户名，游客用 guest
  scope() { return readSession()?.user || 'guest'; },

  async register(username, password) {
    const name = String(username || '').trim();
    if (name.length < 2) throw new Error('用户名至少 2 个字符');
    if (!password || password.length < 6) throw new Error('密码至少 6 位');
    const out = await call('/auth/register', { method: 'POST', body: { username: name, password } });
    writeSession({ user: out.user, token: out.token });
    return out;
  },

  async login(username, password) {
    const name = String(username || '').trim();
    if (!name) throw new Error('请输入用户名');
    const out = await call('/auth/login', { method: 'POST', body: { username: name, password } });
    writeSession({ user: out.user, token: out.token });
    return out;
  },

  async logout() {
    const s = readSession();
    if (s && s.token) {
      try { await call('/auth/logout', { method: 'POST', token: s.token }); } catch (e) { /* 本地照样清 */ }
    }
    writeSession(null);
  },

  async changePassword(oldPassword, newPassword) {
    const s = readSession();
    if (!s) throw new Error('未登录');
    if (!newPassword || newPassword.length < 6) throw new Error('新密码至少 6 位');
    await call('/auth/password', { method: 'POST', token: s.token, body: { oldPassword, newPassword } });
  },

  async rename(newName) {
    const s = readSession();
    if (!s) throw new Error('未登录');
    const name = String(newName || '').trim();
    if (name === s.user) return s.user;
    const out = await call('/auth/rename', { method: 'POST', token: s.token, body: { newUsername: name } });
    writeSession({ ...s, user: out.user });
    return out.user;
  },

  // 昵称 / 头像色等资料存在服务端 user:<用户名> 记录里，本地 session 只做缓存，
  // 这样换设备登录也能拿到同一套资料。
  profile() {
    const s = readSession();
    return (s && s.profile) || {};
  },

  // 启动时调一次，把服务端资料同步到本地缓存。失败就沿用缓存，不阻塞渲染。
  async loadProfile() {
    const s = readSession();
    if (!s || !s.token) return null;
    try {
      const out = await call('/me', { token: s.token, timeout: 6000 });
      const next = { ...s, user: out.user || s.user, profile: out.profile || {} };
      writeSession(next);
      return next.profile;
    } catch (e) {
      return this.profile();
    }
  },

  // 保存资料到服务端（失败抛出，由调用方提示）
  async saveProfile(patch) {
    const s = readSession();
    if (!s || !s.token) throw new Error('未登录');
    const out = await call('/profile', { method: 'PUT', token: s.token, body: patch });
    writeSession({ ...s, profile: out.profile || {} });
    return out.profile;
  },
};
