// 词库模块: 状态分页(未学习/学习中/全部/已斩) / 搜索 / 排序(顺序/倒序/乱序/重要程度)
// / 展示方式(卡片 / 横条) / 斩词 / 学习中 / 进度条

import { store } from '../store.js';
import { speakWord } from '../tts.js';
import { playSlash, slashBurst } from '../fx.js';
import { el, esc, icon } from '../ui.js';

const PAGE = 60;
// deterministic shuffle so分批加载顺序稳定
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr) {
  const rng = mulberry32(0xC0FFEE);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 不区分大小写排序: 否则 X-ray / American 这类大写开头的词会被 ASCII 排到最前面
function byAlphabet(x, y) {
  const a = x.word.toLowerCase();
  const b = y.word.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}
function byFreqDesc(x, y) { return store.freqOf(y.id) - store.freqOf(x.id) || byAlphabet(x, y); }

export function renderLibrary() {
  const app = document.getElementById('app');
  let filter = 'new';
  let q = '';
  let offset = 0;
  let sort = 'order';
  let display = 'card';

  const root = el('div', 'view');

  const topbar = el('div', 'topbar');
  topbar.append(el('h1', '', '词库'), el('span', 'sub', 'CET 大纲词 + 基础词'));
  root.append(topbar);

  const progress = el('div', 'progress panel');
  root.append(progress);

  const tabs = el('div', 'seg');
  ['new', 'learning', 'all', 'mastered'].forEach((key) => {
    const b = el('button', '', tabLabel(key));
    b.dataset.k = key;
    b.addEventListener('click', () => { filter = key; offset = 0; apply(); });
    tabs.append(b);
  });
  root.append(tabs);

  const toolRow = el('div', 'libtools');
  const sortSel = el('select', 'sortsel');
  [['order', '顺序'], ['reverse', '倒序'], ['shuffle', '乱序'], ['freq', '重要程度']].forEach(([v, t]) => {
    const o = el('option', '', t);
    o.value = v;
    sortSel.append(o);
  });
  sortSel.addEventListener('change', () => { sort = sortSel.value; offset = 0; apply(); });
  const spacer = el('span', 'spacer');
  const gridBtn = el('button', 'iconbtn', icon('grid'));
  gridBtn.title = '卡片视图';
  const listBtn = el('button', 'iconbtn', icon('list'));
  listBtn.title = '横条视图';
  gridBtn.addEventListener('click', () => { display = 'card'; gridBtn.classList.add('active'); listBtn.classList.remove('active'); apply(); });
  listBtn.addEventListener('click', () => { display = 'list'; listBtn.classList.add('active'); gridBtn.classList.remove('active'); apply(); });
  gridBtn.classList.add('active');
  toolRow.append(sortSel, spacer, gridBtn, listBtn);
  root.append(toolRow);

  const searchRow = el('div', 'searchbar');
  const qInput = el('input', 'q');
  qInput.placeholder = '搜索单词，如 abandon';
  qInput.addEventListener('input', () => { q = qInput.value.trim().toLowerCase(); offset = 0; apply(); });
  searchRow.append(qInput);
  root.append(searchRow);

  const grid = el('div', 'grid');
  const loadMore = el('button', 'btn loadmore', '加载更多');
  loadMore.addEventListener('click', () => { offset += PAGE; apply(); });
  root.append(grid, loadMore);

  function tabLabel(k) {
    const c = store.counts();
    const map = {
      new: `未学习 ${c.new}`,
      learning: `学习中 ${c.learning}`,
      all: `全部 ${c.total}`,
      mastered: `已斩 ${c.mastered}`,
    };
    return map[k];
  }

  function matching() {
    const words = [];
    for (const w of store.allWords()) {
      const st = store.status(w.id);
      if (filter !== 'all' && st !== filter) continue;
      if (q && !w.word.toLowerCase().includes(q)) continue;
      words.push(w);
    }
    let list = words;
    if (sort === 'reverse') list = words.slice().reverse();
    else if (sort === 'shuffle') list = seededShuffle(words);
    else if (sort === 'freq') list = words.slice().sort(byFreqDesc);
    else list = words.slice().sort(byAlphabet);
    return list;
  }

  function renderProgress() {
    const c = store.counts();
    const pct = (n) => (c.total ? Math.round((n / c.total) * 1000) / 10 : 0);
    progress.innerHTML = '';
    const pWrap = el('div', 'grow');
    pWrap.innerHTML = `
      <div class="ptxt"><span>掌握进度</span><b>${c.mastered} / ${c.total} 词</b></div>
      <div class="pbar">
        <i class="i-new" style="width:${pct(c.new)}%"></i>
        <i class="i-learning" style="width:${pct(c.learning)}%"></i>
        <i class="i-mastered" style="width:${pct(c.mastered)}%"></i>
      </div>
      <div class="legend">
        <span class="l-new">未学习 ${c.new}</span>
        <span class="l-learn">学习中 ${c.learning}</span>
        <span class="l-master">已斩 ${c.mastered}</span>
      </div>`;
    progress.append(pWrap);
    const today = el('div', 'stat');
    today.innerHTML = `<div class="sn">${store.todaySlashes()}</div><div class="sl">今日已斩</div>`;
    progress.append(today);
  }

  function statusText(st) { return st === 'new' ? '未学习' : st === 'learning' ? '学习中' : '已斩'; }

  function card(w) {
    const st = store.status(w.id);
    const c = el('div', `wcard ${st}`);
    c.innerHTML = `
      <div class="inner">
        <div class="wface front">
          <div class="wtop">
            <span class="word">${esc(w.word)}</span>
            <button class="iconbtn" data-act="speak">${icon('speak')}</button>
          </div>
          <div class="ph">${esc(w.phonetic)}</div>
          <div class="tw-col">${statusText(st)}</div>
        </div>
        <div class="wface back">
          <div class="def">${esc(w.definition)}</div>
          <div class="wactions" data-acts></div>
        </div>
      </div>
      <span class="tag ${st}">${st === 'new' ? '新' : st === 'learning' ? '学' : '斩'}</span>`;
    c.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      c.classList.toggle('flip');
    });
    // 正面发音按钮在未翻卡时也应可点
    const frontSpeak = c.querySelector('.wface.front [data-act="speak"]');
    if (frontSpeak) frontSpeak.addEventListener('click', (e) => { e.stopPropagation(); speakWord(w.word); });
    bindCardActions(c, w, st);
    return c;
  }

  function bindCardActions(c, w, st) {
    const actions = c.querySelector('[data-acts]');
    const speakBtn = el('button', 'btn', `${icon('speak')} 发音`);
    speakBtn.addEventListener('click', (e) => { e.stopPropagation(); speakWord(w.word); });
    actions.append(speakBtn);
    if (st === 'mastered') {
      const resetBtn = el('button', 'btn ghost', '恢复未学');
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation(); store.reset(w.id);
        slashBurst(c.querySelector('.word') || c); playSlash();
      });
      actions.append(resetBtn);
    } else {
      const learnBtn = el('button', 'btn learning', '学习中');
      const slashBtn = el('button', 'btn primary', `${icon('slash')} 斩`);
      learnBtn.addEventListener('click', (e) => { e.stopPropagation(); store.learn(w.id); });
      slashBtn.addEventListener('click', (e) => {
        e.stopPropagation(); store.slash(w.id);
        slashBurst(c.querySelector('.word') || c); playSlash();
      });
      actions.append(learnBtn, slashBtn);
    }
  }

  function row(w) {
    const st = store.status(w.id);
    const r = el('div', `wrow ${st}`);
    r.innerHTML = `
      <div class="wrow-main">
        <div class="wrow-top">
          <span class="word">${esc(w.word)}</span>
          <span class="ph">${esc(w.phonetic)}</span>
          <span class="wrow-st st-${st}">${statusText(st)}</span>
        </div>
        <div class="def">${esc(w.definition)}</div>
      </div>
      <div class="wrow-acts" data-acts></div>`;
    bindCardActions(r, w, st);
    return r;
  }

  function apply() {
    const list = matching();
    const slice = list.slice(0, offset + PAGE);
    grid.className = display === 'list' ? 'hlist wlist' : 'grid';
    grid.innerHTML = '';
    slice.forEach((w) => grid.append(display === 'list' ? row(w) : card(w)));
    loadMore.style.display = list.length > slice.length ? '' : 'none';
    [...tabs.children].forEach((b) => { b.textContent = tabLabel(b.dataset.k); b.classList.toggle('active', b.dataset.k === filter); });
    renderProgress();
  }

  const unsub = store.subscribe(() => { renderProgress(); apply(); });
  apply();
  app.replaceChildren(root);
  return { destroy: unsub };
}
