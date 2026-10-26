// 记录模块: 学习统计 + 历史文章列表(保留当时掌握快照, 可回放续斩)

import { store } from '../store.js';
import { articleLabel } from '../article.js';
import { el, esc, fmtDate } from '../ui.js';
import { renderReader } from './reading.js';

export function renderRecords() {
  const app = document.getElementById('app');
  const root = el('div', 'view');

  const topbar = el('div', 'topbar');
  topbar.append(el('h1', '', '学习记录'), el('span', 'sub', '足迹与快照回放'));
  root.append(topbar);

  const stats = el('div', 'stats3 panel');
  stats.innerHTML = `
    <div class="stat"><div class="sn">${store.todaySlashes()}</div><div class="sl">今日已斩</div></div>
    <div class="stat"><div class="sn">${store.counts().mastered}</div><div class="sl">已斩单词</div></div>
    <div class="stat"><div class="sn">${store.streak()}</div><div class="sl">连续天数</div></div>`;
  root.append(stats);

  const list = el('div', 'hlist');
  const history = store.history();
  root.append(list);

  if (!history.length) {
    list.append(el('div', 'empty', '<div class="big">—</div><div>还没有学习记录，去读一篇文章吧</div>'));
  } else {
    // 同一篇文章只展示一条(保留最近一次)
    const seen = new Set();
    const rows = [];
    history.forEach((h, i) => {
      if (seen.has(h.articleId)) return;
      seen.add(h.articleId);
      rows.push({ h, i });
    });
    rows.forEach(({ h, i }) => {
      const card = el('button', 'btn hrec');
      const learned = store.isArticleLearned(h.articleId);
      const art = store.articles.find((a) => a.id === h.articleId);
      const no = art ? `<span class="no">${articleLabel(art)}</span> ` : '';
      card.innerHTML = `
        <div class="ht">${no}${esc(h.title)}<span class="stat-pill ${learned ? 'ok' : 'pend'}">${learned ? '学习完成' : '学习中'}</span></div>
        <div class="hm">
          <span>${fmtDate(h.readAt)}</span>
          <span>未斩 ${h.counts.new}</span>
          <span>已斩 ${h.counts.mastered}</span>
          <span>点击回放</span>
        </div>`;
      card.addEventListener('click', () => { location.hash = `#/records/${i}`; });
      list.append(card);
    });
  }
  app.replaceChildren(root);
  return { destroy: () => {} };
}

export function renderRecordDetail(idx) {
  const app = document.getElementById('app');
  const history = store.history();
  const h = history[idx];
  if (!h) { renderRecords(); return { destroy: () => {} }; }
  const article = store.articles.find((a) => a.id === h.articleId);
  if (!article) { renderRecords(); return { destroy: () => {} }; }
  return renderReader(article, h.snapshot);
}
