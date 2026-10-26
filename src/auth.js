// 本地账号: 注册/登录/登出。数据仅存于浏览器 localStorage, 供单人/演示使用;
// 后续接 Cloudflare Worker 账号体系时只需替换本模块的实现。

const USERS_KEY = 'cet.users.v1';
const SESSION_KEY = 'cet.session.v1';

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch (e) { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function users() { return load(USERS_KEY, {}); }
function session() { return load(SESSION_KEY, null); }

export const auth = {
  current() { return session(); },
  authed() { return !!session(); },

  async register(username, password) {
    const name = String(username || '').trim();
    if (name.length < 2) throw new Error('用户名至少 2 个字符');
    if (!password || password.length < 6) throw new Error('密码至少 6 位');
    const u = users();
    if (u[name]) throw new Error('该用户名已注册');
    const salt = randomHex(16);
    u[name] = { salt, hash: await sha256(salt + ':' + password), createdAt: Date.now() };
    save(USERS_KEY, u);
    this._login(name);
  },

  async login(username, password) {
    const name = String(username || '').trim();
    const u = users();
    const rec = u[name];
    if (!rec) throw new Error('用户名不存在');
    const hash = await sha256(rec.salt + ':' + String(password || ''));
    if (hash !== rec.hash) throw new Error('密码错误');
    this._login(name);
  },

  _login(name) {
    save(SESSION_KEY, { user: name, at: Date.now() });
  },

  logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  },

  async changePassword(oldPass, newPass) {
    const me = session();
    if (!me) throw new Error('未登录');
    if (!newPass || newPass.length < 6) throw new Error('新密码至少 6 位');
    const u = users();
    const rec = u[me.user];
    if (!rec) throw new Error('账号数据丢失');
    const oldHash = await sha256(rec.salt + ':' + String(oldPass || ''));
    if (oldHash !== rec.hash) throw new Error('原密码错误');
    const salt = randomHex(16);
    rec.salt = salt;
    rec.hash = await sha256(salt + ':' + newPass);
    save(USERS_KEY, u);
  },

  async rename(newName) {
    const me = session();
    if (!me) throw new Error('未登录');
    const name = String(newName || '').trim();
    if (name.length < 2) throw new Error('用户名至少 2 个字符');
    if (name === me.user) return;
    const u = users();
    if (u[name]) throw new Error('该用户名已被占用');
    const rec = u[me.user];
    if (!rec) throw new Error('账号数据丢失');
    u[name] = rec;
    delete u[me.user];
    save(USERS_KEY, u);
    me.user = name;
    save(SESSION_KEY, me);
  },

  setProfile(patch) {
    const me = session();
    if (!me) return;
    Object.assign(me, patch);
    save(SESSION_KEY, me);
  },
};
