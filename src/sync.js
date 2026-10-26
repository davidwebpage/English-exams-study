// Optional multi-device sync: if sync-config.json is present and reachable,
// pull remote state on boot and push local changes (debounced). When the file
// is absent (default), every call is a silent no-op so the app stays pure-local.

export async function initSync(store) {
  const cfg = window.__SYNC__;
  if (!cfg?.url || !cfg?.token) return () => {};

  const headers = { 'content-type': 'application/json', 'x-token': cfg.token };
  try {
    const res = await fetch(cfg.url, { headers });
    if (res.ok) {
      const remote = await res.json();
      if (remote && typeof remote === 'object') store.hydrate(remote);
    }
  } catch (e) { /* offline: fall back to local */ }

  let timer = null;
  const off = store.onPersist(() => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await fetch(cfg.url, { method: 'PUT', headers, body: JSON.stringify(store.state()) }); }
      catch (e) { /* offline; retried on next change */ }
    }, 1500);
  });
  return off;
}
