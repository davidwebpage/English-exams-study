// 单页应用入口: 加载数据 + 哈希路由。记录已并入“我的 → 学习记录”。

import { store } from './store.js';
import { initSync } from './sync.js';
import { auth } from './auth.js';
import { preloadSlash } from './fx.js';
import { renderLibrary } from './views/library.js';
import { renderPick, renderReader } from './views/reading.js';
import { renderRecords, renderRecordDetail } from './views/records.js';
import { renderListenPick, renderListen } from './views/listening.js';
import { renderMe, renderSettings } from './views/me.js';

const view = { ref: null };

function setTab(name) {
  document.querySelectorAll('.tabs a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === name);
  });
}

function show(factory) {
  if (view.ref && view.ref.destroy) view.ref.destroy();
  view.ref = factory();
}

function articleById(id) {
  return store.articles.find((a) => a.id === id);
}

function goto(hash) {
  if (location.hash !== hash) location.hash = hash;
  route();
}

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/');
  const name = parts[0] || 'reading';
  const arg = decodeURIComponent(parts[1] || '');
  const idx = Number(parts[1]);

  if (name === 'library') { setTab('library'); show(renderLibrary); return; }

  if (name === 'listening') {
    setTab('listening');
    if (!parts[1]) show(renderListenPick);
    else show(() => renderListen(articleById(arg)));
    return;
  }

  // 历史快照回放: #/records/:i (旧链接保留)
  if (name === 'records' && parts[1]) {
    setTab('me');
    if (!auth.authed()) { show(renderMe); return; }
    show(() => renderRecordDetail(idx));
    return;
  }
  if (name === 'records' && !parts[1]) { goto('#/me/records'); return; }

  if (name === 'me') {
    setTab('me');
    if (!auth.authed()) { show(renderMe); return; }
    if (parts[1] === 'records') show(renderRecords);
    else if (parts[1] === 'settings') show(renderSettings);
    else show(renderMe);
    return;
  }

  // 默认: 阅读
  setTab('reading');
  if (!parts[1]) show(renderPick);
  else show(() => renderReader(articleById(arg)));
}

async function boot() {
  preloadSlash();            // 提前把斩词音效解码好，第一次斩就是采样音
  await store.init(auth.scope());   // 进度按账号隔离：登录用自己的用户名，未登录是 guest
  await initSync(store);            // 只有登录后才会真的联网
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/reading';
  route();
}

boot();
