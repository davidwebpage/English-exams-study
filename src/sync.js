// Optional multi-device sync: if sync-config.json is present and reachable,
// pull remote state on boot and push local changes (debounced). When the file
// is absent (default), every call is a silent no-op so the app stays pure-local.

// 网络不通时 fetch 可能挂很久（尤其国内直连 *.workers.dev），
// 而 boot() 里是 await initSync，所以必须自己兜一层超时，不能让它拖住首屏。
function timed(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

export async function initSync(store) {
  const cfg = window.__SYNC__;
  if (!cfg?.url || !cfg?.token) return () => {};

  const headers = { 'content-type': 'application/json', 'x-token': cfg.token };

  // --- 启动时拉取远程 ---
  let remoteHasData = false;
  try {
    const t = timed(3000);
    const res = await fetch(cfg.url, { headers, signal: t.signal });
    t.clear();
    if (res.ok) {
      const remote = await res.json();
      if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) {
        remoteHasData = true;
        store.hydrate(remote);
      }
    }
  } catch (e) { /* 离线/超时：退回纯本地 */ }

  // --- 远程为空（第一次开启同步）：立刻把本机进度推上去 ---
  // 否则用户只要不做任何操作，本地就永远不会上传，另一台设备拉到的永远是空。
  // 注意：只在远程为空时自动上传，远程已有数据时绝不用本机覆盖它。
  if (!remoteHasData) {
    try {
      const t = timed(5000);
      await fetch(cfg.url, { method: 'PUT', headers, signal: t.signal, body: JSON.stringify(store.state()) });
      t.clear();
    } catch (e) { /* 离线：下一次状态变化会重试 */ }
  }

  // --- 之后：本地每次落盘，1.5s 防抖推到远程 ---
  let timer = null;
  const off = store.onPersist(() => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const t = timed(8000);
        await fetch(cfg.url, { method: 'PUT', headers, signal: t.signal, body: JSON.stringify(store.state()) });
        t.clear();
      } catch (e) { /* 离线；下次变更再试 */ }
    }, 1500);
  });
  return off;
}
