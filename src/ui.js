// Small DOM helpers shared by views + the word detail popover.

import { store } from './store.js';
import { speakWord } from './tts.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

export function icon(name) {
  const paths = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    speak: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    slash: '<path d="M6 6l12 12M6 18L18 6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a5.5 5.5 0 0 1 0 11h-3"/>',
    book: '<path d="M4 6a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 1 2-2h14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    trophy: '<path d="M8 21h8m-4-4v4M7 4h10v6a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
  };
  if (!paths[name]) return '';
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function showWordPopup(id, { slash = () => {}, learn = () => {} } = {}) {
  const w = store.wordById(id);
  if (!w) return;
  const mask = el('div', 'mask');
  const pop = el('div', 'popup panel');
  const pos = w.pos && w.pos.length ? `<span class="pos">${esc(w.pos.join(' / '))}</span> ` : '';
  pop.innerHTML = `
    <div class="pw">${esc(w.word)}<button class="iconbtn" data-act="speak">${icon('speak')}</button></div>
    <div class="ph">${esc(w.phonetic)}</div>
    <div class="pdef">${pos}${esc(w.definition)}</div>
    <div class="pacts">
      <button class="btn primary" data-act="slash">${icon('slash')}斩</button>
      <button class="btn learning" data-act="learn">学习中</button>
      <button class="btn iconbtn" data-act="speak" style="flex:0 0 auto">${icon('speak')}</button>
    </div>
    <button class="pwclose" data-act="close">收起</button>`;
  pop.querySelector('[data-act="speak"]').addEventListener('click', (e) => { e.stopPropagation(); speakWord(w.word); });
  pop.querySelectorAll('[data-act="speak"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); speakWord(w.word); }));
  pop.querySelector('[data-act="slash"]').addEventListener('click', () => { slash(id); close(); });
  pop.querySelector('[data-act="learn"]').addEventListener('click', () => { learn(id); close(); });
  pop.querySelector('[data-act="close"]').addEventListener('click', close);
  mask.appendChild(pop);
  mask.addEventListener('pointerdown', (e) => { if (e.target === mask) close(); });
  document.body.appendChild(mask);

  function close() { mask.remove(); }
}

// 跟随单词的小浮卡: 锚定在单词周围排版, 随滚动跟随; 返回关闭函数。
// 已斩的词提供「不熟，加回」: 撤销斩词, 退回未学(重新出现下划线)。
export function showWordCard(anchorEl, id, { slash = () => {}, learn = () => {}, revert = () => {} } = {}) {
  const w = id ? store.wordById(id) : null;
  const wordText = (anchorEl && anchorEl.textContent) || (w && w.word) || '';
  const card = el('div', 'wordcard');
  const CAT = { syll: '大纲词', variant: '变形词', basic: '基础词', daily: '基础词', common: '常用词', outline: '超纲词' };
  const cat = (anchorEl && anchorEl.dataset.cat) || (!id ? 'outline' : store.isSyllabus(id) ? 'syll' : store.isDaily(id) ? 'daily' : store.isBasic(id) ? 'basic' : store.isCommon(id) ? 'common' : 'outline');
  const isSyll = cat === 'syll';
  const isVariant = cat === 'variant';
  const isBasic = cat === 'basic';
  const isCommon = cat === 'common';
  const isDaily = cat === 'daily';
  const mastered = !!(id && store.isMastered(id));
  const statusLabel = (isSyll || isVariant || isDaily)
    ? (mastered ? '已斩' : (store.status(id) === 'learning' ? '学习中' : '未斩'))
    : (isBasic || isCommon) ? '已斩' : '超纲';
  const stKey = statusLabel === '已斩' ? 'done' : statusLabel === '学习中' ? 'learning' : statusLabel === '未斩' ? 'new' : 'out';
  const chip = `<span class="wc-cat cat-${cat}">${CAT[cat]}</span>`;
  const statusChip = `<span class="wc-status st-${stKey}">${statusLabel}</span>`;

  if (isSyll || isDaily) {
    const pos = w.pos && w.pos.length ? `<span class="pos">${esc(w.pos.join(' / '))}</span> ` : '';
    card.innerHTML = `
      <div class="wc-head">
        <b class="wc-word">${esc(w.word)}</b>
        ${chip}${statusChip}
        <button class="iconbtn" data-act="speak">${icon('speak')}</button>
      </div>
      <div class="wc-ph">${esc(w.phonetic)}</div>
      <div class="wc-def">${pos}${esc(w.definition)}</div>
      <div class="wc-acts">
        ${mastered
          ? `<button class="btn learning sm" data-act="revert" title="恢复为未学习, 重新出现下划线">${icon('undo')} 不熟，加回</button>`
          : `<button class="btn primary sm" data-act="slash">${icon('slash')}斩</button>
             <button class="btn learning sm" data-act="learn">学习中</button>`}
      </div>`;
  } else if (isVariant) {
    card.innerHTML = `
      <div class="wc-head">
        <b class="wc-word">${esc(wordText)}</b>
        ${chip}${statusChip}
        <button class="iconbtn" data-act="speak">${icon('speak')}</button>
      </div>
      ${w && w.phonetic ? `<div class="wc-ph">${esc(w.phonetic)}</div>` : ''}
      <div class="wc-def muted">原形 ${esc((w && w.word) || wordText)}</div>
      <div class="wc-def">${w && w.definition ? esc(w.definition) : ''}</div>
      <div class="wc-acts">
        ${mastered
          ? `<button class="btn learning sm" data-act="revert" title="恢复为未学习, 重新出现下划线">${icon('undo')} 不熟，加回</button>`
          : `<button class="btn primary sm" data-act="slash">${icon('slash')}斩</button>
             <button class="btn learning sm" data-act="learn">学习中</button>`}
      </div>`;
  } else if (isBasic || isCommon) {
    card.innerHTML = `
      <div class="wc-head">
        <b class="wc-word">${esc(wordText)}</b>
        ${chip}${statusChip}
        <button class="iconbtn" data-act="speak">${icon('speak')}</button>
      </div>
      ${w && w.phonetic ? `<div class="wc-ph">${esc(w.phonetic)}</div>` : ''}
      <div class="wc-def">${w && w.definition ? esc(w.definition) : '该词不在 CET 大纲内，可朗读。'}</div>
      <div class="wc-acts">
        <button class="btn done sm" disabled>${icon('check')} 已斩</button>
      </div>`;
  } else {
    card.innerHTML = `
      <div class="wc-head">
        <b class="wc-word">${esc(wordText)}</b>
        ${chip}${statusChip}
        <button class="iconbtn" data-act="speak">${icon('speak')}</button>
      </div>
      <div class="wc-ph">${w && w.phonetic ? esc(w.phonetic) : ''}</div>
      ${w && w.definition ? `<div class="wc-def">${esc(w.definition)}</div>` : '<div class="wc-def muted">该词不在 CET 大纲内，暂无释义，可朗读。</div>'}
      <div class="wc-acts">&nbsp;</div>`;
  }

  document.body.appendChild(card);

  const close = () => {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    card.remove();
  };
  function onKey(e) { if (e.key === 'Escape') close(); }
  function outside(e) { if (!card.contains(e.target)) close(); }
  function reposition() {
    const r = anchorEl.getBoundingClientRect();
    if (!r.width || !r.height) { close(); return; }
    const cw = card.offsetWidth || 280;
    const ch = card.offsetHeight || 150;
    let top = r.top - ch - 9;
    let below = false;
    if (top < 10) { top = r.bottom + 9; below = true; }
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - cw - 10));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.classList.toggle('below', below);
  }

  card.querySelector('[data-act="speak"]').addEventListener('click', (e) => { e.stopPropagation(); speakWord(w ? w.word : wordText); });
  if ((isSyll || isVariant || isDaily) && mastered) {
    const rv = card.querySelector('[data-act="revert"]');
    if (rv) rv.addEventListener('click', () => { revert(id); close(); });
  }
  if ((isSyll || isVariant || isDaily) && !mastered) {
    const sl = card.querySelector('[data-act="slash"]');
    const lr = card.querySelector('[data-act="learn"]');
    if (sl) sl.addEventListener('click', () => { slash(id); close(); });
    if (lr) lr.addEventListener('click', () => { learn(id); close(); });
  }

  requestAnimationFrame(() => {
    reposition();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
  });
  return close;
}
