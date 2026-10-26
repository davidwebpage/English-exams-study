// 多设备同步：只在**已登录**时启用。游客是纯本地，不联网。
// 每次请求带 Bearer token，服务端据此判断是谁的进度（见 worker/sync.js）。

import { auth } from './auth.js';

// 网络不通时 fetch 可能挂很久（尤其国内直连 *.workers.dev），
// 而 boot() 里是 await initSync，所以必须自己兜一层超时，不能让它拖住首屏。
function timed(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

export async function initSync(store) {
  const cfg = window.__SYNC__;
  if (!cfg || !cfg.url) return () => {};

  const token = auth.token();
  if (!token) return () => {};   // 未登录：不同步

  const endpoint = String(cfg.url).replace(/\/+$/, '') + '/state';
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };

  // --- 启动时拉取远端 ---
  let remoteHasData = false;
  try {
    const t = timed(3000);
    const res = await fetch(endpoint, { headers, signal: t.signal });
    t.clear();
    if (res.ok) {
      const remote = await res.json();
      if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) {
        remoteHasData = true;
        store.hydrate(remote);
      }
    }
  } catch (e) { /* 离线/超时：退回本地 */ }

  // --- 远端为空（这个账号第一次同步）：立刻把本机进度推上去 ---
  // 否则用户只要不做任何操作，本地就永远不会上传，另一台设备拉到的永远是空。
  // 注意：只在远端为空时自动上传，远端已有数据时绝不用本机覆盖它。
  if (!remoteHasData) {
    try {
      const t = timed(5000);
      await fetch(endpoint, { method: 'PUT', headers, signal: t.signal, body: JSON.stringify(store.state()) });
      t.clear();
    } catch (e) { /* 离线：下一次状态变化会重试 */ }
  }

  // --- 之后：本地每次落盘，1.5s 防抖推到远端 ---
  let timer = null;
  const off = store.onPersist(() => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const t = timed(8000);
        await fetch(endpoint, { method: 'PUT', headers, signal: t.signal, body: JSON.stringify(store.state()) });
        t.clear();
      } catch (e) { /* 离线；下次变更再试 */ }
    }, 1500);
  });
  return off;
}
