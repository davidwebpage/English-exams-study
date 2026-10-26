// 阅读模块:
//  顶部结构「当日推送 / 全部篇目」
//  当日推送: 按日期确定性随机一篇, 直接展示文章内容
//  全部篇目: 列表 + 生词比例滑块(可选项)
// 阅读内: 下划线标注 / 点词浮卡 / 手势斩词 / 中英对照 / 标记已学习

import { store } from '../store.js';
import { annotateArticle, renderParagraph, articleLabel } from '../article.js';
import { playSlash, slashBurst } from '../fx.js';
import { showWordCard } from '../ui.js';
import { el, esc, icon } from '../ui.js';

const MIN_SWIPE = 20;
const MAX_TAP = 9;

// 记住最近停留的列表视图（当日推送 / 全部篇目），
// 从具体篇目点「返回」时回到同一个列表，而不是被默认模式拉走。
let lastListMode = null;

export function totalWordsOf(article) {
  const ann = annotateArticle(article)._annotated;
  let n = 0;
  ann.paragraphs.forEach((par) => par.tokens.forEach((t) => { if (t.type === 'word') n++; }));
  return n;
}

// 确定性 PRNG, 保证同一天内“今日推送”稳定不变
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dailyArticle() {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const rng = mulberry32(Math.abs(h));
  const arr = store.articles;
  if (!arr.length) return null;
  return arr[Math.floor(rng() * arr.length)];
}

export function renderPick() {
  const app = document.getElementById('app');
  const root = el('div', 'view');

  const topbar = el('div', 'topbar');
  topbar.append(el('h1', '', '阅读'), el('span', 'sub', '在语境中斩词'));
  root.append(topbar);

  const seg = el('div', 'seg');
  const bToday = el('button', '', '当日推送');
  const bAll = el('button', '', '全部篇目');
  bToday.dataset.m = 'today';
  bAll.dataset.m = 'all';
  seg.append(bToday, bAll);
  root.append(seg);

  const holder = el('div', '');
  root.append(holder);

  // 记录上次所在视图, 返回时回到对应列表
  let mode = lastListMode || (store.settings().pickMode === 'all' ? 'all' : 'today');
  let embedded = null;

  function clearEmbedded() {
    if (embedded) {
      try { embedded.destroy(); } catch (e) { /* ignore */ }
      embedded.root.remove();
      embedded = null;
    }
  }

  function apply() {
    holder.innerHTML = '';
    clearEmbedded();
    lastListMode = mode;            // 供阅读页「返回」定位到同一个列表
    [...seg.children].forEach((b) => b.classList.toggle('active', b.dataset.m === mode));
    if (mode === 'today') {
      const a = dailyArticle();
      if (!a) { holder.append(el('div', 'empty', '<div>还没有文章</div>')); return; }
      const r = createReader(a, null, { showBack: false });
      embedded = r;
      holder.append(r.root);
      const note = el('div', 'today-note', `今日推送 · ${a.topic}`);
      holder.insertBefore(note, r.root);
    } else {
      buildAll();
    }
  }

  bToday.addEventListener('click', () => { mode = 'today'; store.setSetting('pickMode', 'today'); apply(); });
  bAll.addEventListener('click', () => { mode = 'all'; store.setSetting('pickMode', 'all'); apply(); });
  [...seg.children].forEach((b) => b.classList.toggle('active', b.dataset.m === mode));

  // ---- 全部篇目列表 + 生词比例滑块 ----
  function buildAll() {
    const list = el('div', 'picklist');
    holder.append(list);

    const rangeRow = el('div', 'lista');
    const slider = el('input');
    slider.type = 'range'; slider.min = 5; slider.max = 80; slider.step = 1;
    slider.value = Math.round(store.settings().ratio * 100);
    const ratioLabel = el('span', 'muted', `生词比例 ≤ ${slider.value}%`);
    slider.addEventListener('input', () => {
      store.setSetting('ratio', Number(slider.value) / 100);
      ratioLabel.textContent = `生词比例 ≤ ${slider.value}%`;
      renderAll();
    });
    const rateCtl = el('div', 'rate-ctl');
    rateCtl.append(slider, ratioLabel);
    rangeRow.append(rateCtl);
    holder.insertBefore(rangeRow, list);

    function ratioOf(article) {
      const ann = annotateArticle(article)._annotated;
      let total = 0, unmastered = 0;
      ann.paragraphs.forEach((par) => {
        par.tokens.forEach((t) => {
          if (t.type !== 'word') return;
          total++;
          if (t.id && store.isLearnable(t.id) && !store.isMastered(t.id)) unmastered++;
        });
      });
      return total ? unmastered / total : 0;
    }

    function renderAll() {
      const limit = Number(slider.value) / 100;
      let items = store.articles.filter((a) => ratioOf(a) <= limit);
      let fallback = false;
      if (!items.length) {
        fallback = true;
        items = store.articles.slice().sort((a, b) => ratioOf(a) - ratioOf(b)).slice(0, 2);
      }
      list.innerHTML = '';
      if (!items.length) {
        list.append(el('div', 'empty', '<div class="big">—</div><div>还没有可用的文章</div>'));
        return;
      }
      if (fallback) {
        list.append(el('div', 'snapshot-note', `所有文章的生词比例都高于 ${slider.value}%，以下为最接近的一批，可继续上调比例`));
      }
      items.forEach((a) => {
        annotateArticle(a);
        const c = store.countsFor(a._annotated.ids);
        const r = Math.round(ratioOf(a) * 100);
        const learned = store.isArticleLearned(a.id);
        const card = el('div', 'pick');
        // 学习状态只作为左上角的状态标签展示（不可点、不是按钮）；
        // 右侧统计一律用纯文字，不用按钮样的胶囊。
        card.innerHTML = `
          <div class="pick-main">
            <span class="pick-status ${learned ? 'done' : 'learning'}">${learned ? '已学习' : '学习中'}</span>
            <div class="pt"><span class="no">${articleLabel(a)}</span> ${esc(a.title)}</div>
            <div class="ptopic">${esc(a.topic)}</div>
          </div>
          <div class="pick-stats">
            <span class="ratio">生词 ${r}%</span>
            <span>总词数 ${totalWordsOf(a)}</span>
            <span>已斩 ${c.mastered}/${c.total}</span>
          </div>`;
        card.addEventListener('click', () => { location.hash = `#/reading/${a.id}`; });
        list.append(card);
      });
    }
    renderAll();
  }

  apply();
  app.replaceChildren(root);
  return { destroy: () => { if (embedded) try { embedded.destroy(); } catch (e) { /* ignore */ } } };
}

// 阅读器核心: 组装阅读页, 可独立渲染(当日推送内嵌)或整页(renderReader)
function createReader(article, snapshot, { showBack = true } = {}) {
  const root = el('div', '');
  annotateArticle(article);
  const ann = article._annotated;
  const hasTranslation = !!(article.translation && article.translation.length === article.paragraphs.length);
  let bilingual = false;
  let learned = store.isArticleLearned(article.id);

  const topbar = el('div', 'topbar');
  if (showBack) {
    const back = el('button', 'btn ghost', `${icon('back')} 返回`);
    // 回到进入本篇时所在的列表（全部篇目进来的就回全部篇目）
    back.addEventListener('click', () => { location.hash = '#/reading'; });
    topbar.append(back);
  }
  topbar.append(el('h1', '', `<span class="h1-no">${articleLabel(article)}</span> ${esc(article.title)}`));
  if (!showBack) topbar.classList.add('daily-top');
  root.append(topbar);

  const meta = el('div', 'reader-meta');
  root.append(meta);

  const bar = el('div', 'reader-bar');
  root.append(bar);

  if (snapshot) {
    const snapNote = el('div', 'snapshot-note', '正在回顾历史快照：下划线为当时未斩的单词，可继续斩词');
    root.append(snapNote);
  }

  const body = el('div', 'article panel');
  root.append(body);

  const slashOver = new Set();
  function statusOf(id) {
    if (slashOver.has(id)) return 'mastered';
    if (snapshot) return snapshot[id] || 'new';
    return store.status(id);
  }

  const learnedBtn = el('button', 'btn', '已学习');
  const bilingualBtn = el('button', 'btn', '中英对照');

  function rebuildBar() {
    bar.innerHTML = '';
    learnedBtn.textContent = learned ? '✓ 已学习 · 撤销' : '已学习';
    learnedBtn.classList.toggle('primary', !learned);
    learnedBtn.classList.toggle('done', learned);
    learnedBtn.title = learned ? '再点一次撤销「已学习」标记' : '标记本篇为已学习';
    bilingualBtn.textContent = bilingual ? 'English' : '中英对照';
    bilingualBtn.classList.toggle('primary', bilingual);
    bilingualBtn.disabled = !hasTranslation;
    bar.append(bilingualBtn);
    if (!snapshot) bar.append(learnedBtn);
  }

  // 可反复切换：标记 -> 撤销 -> 再标记
  learnedBtn.addEventListener('click', () => {
    learned = !learned;
    if (learned) store.markArticleLearned(article.id, ann.ids);
    else store.unmarkArticleLearned(article.id);
  });
  bilingualBtn.addEventListener('click', () => {
    if (!hasTranslation) return;
    bilingual = !bilingual;
    rerender();
  });

  // 本篇要打横线的词: 本次阅读里斩的(slashOver) + 当初就是在这篇里斩的(存在 slashArt)
  // 后者刷新/重进都还在; 同一个词出现在别的文章里就不会进这个集合。
  function cutSet() {
    const set = new Set(slashOver);
    for (const id of ann.ids) {
      if (store.slashArticleOf(id) === article.id) set.add(id);
    }
    return set;
  }

  function rerender() {
    if (openCard) { openCard(); openCard = null; }
    const c = store.countsFor(ann.ids);
    const cuts = cutSet();
    meta.innerHTML = `
      <span>主题：${esc(article.topic)}</span>
      <span>总词数 <b>${totalWordsOf(article)}</b></span>
      <span>已斩 <b>${c.mastered + slashOver.size}/${c.total}</b> 个词</span>
      <span>未斩 <b>${c.total - c.mastered - slashOver.size}</b></span>
      <span style="opacity:.75">对角滑词可斩词 · 轻点查看释义</span>`;
    rebuildBar();

    if (bilingual) {
      body.classList.add('biling');
      body.innerHTML = '';
      ann.paragraphs.forEach((p, pi) => {
        const row = el('div', 'brow');
        const en = el('div', 'ben');
        en.append(renderParagraph(p, statusOf, cuts));
        const zh = el('div', 'bzh');
        zh.textContent = (article.translation && article.translation[pi]) || '（暂无译文）';
        row.append(en, zh);
        body.append(row);
      });
    } else {
      body.classList.remove('biling');
      body.innerHTML = '';
      ann.paragraphs.forEach((p) => body.append(renderParagraph(p, statusOf, cuts)));
    }
  }

  let openCard = null;
  let down = null;
  body.addEventListener('pointerdown', (e) => {
    const word = e.target.closest('.word');
    if (!word) return;
    try { word.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const wid = word.dataset.id ? Number(word.dataset.id) : null;
    down = { id: wid, el: word, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY };
  });
  body.addEventListener('pointermove', (e) => {
    if (!down) return;
    down.lx = e.clientX; down.ly = e.clientY;
  });
  function doSlash(d) {
    if (!d.id || !store.isLearnable(d.id)) return;
    if (store.isMastered(d.id)) return;
    slashOver.add(d.id);
    playSlash();
    slashBurst(d.el);
    store.slash(d.id, article.id);
    rerender();
  }
  function finish(px, py, allowTap) {
    if (!down) return;
    const d = down; down = null;
    const dx = px - d.x, dy = py - d.y;
    const dist = Math.hypot(dx, dy);
    const diag = dx > MIN_SWIPE && dy > MIN_SWIPE * 0.35 && (dy / dx) > 0.22 && (dy / dx) < 2.5;
    if (diag && dist > MIN_SWIPE && d.id && store.isLearnable(d.id)) { doSlash(d); return; }
    if (allowTap && dist < MAX_TAP) {
      const opts = d.id ? {
        slash: () => { if (!store.isMastered(d.id)) { doSlash(d); } },
        learn: () => { store.learn(d.id); rerender(); },
        // 已斩但其实不熟: 加回未学, 重新出现下划线, 可再斩
        revert: () => {
          slashOver.delete(d.id);
          store.reset(d.id);
          rerender();
        },
      } : {};
      openCard = showWordCard(d.el, d.id, opts);
    }
  }
  body.addEventListener('pointerup', (e) => finish(e.clientX, e.clientY, true));
  body.addEventListener('pointercancel', (e) => finish(down ? down.lx : e.clientX, down ? down.ly : e.clientY, false));

  rerender();
  const unsub = store.subscribe(() => { rerender(); });
  article.wordIds = ann.ids;
  store.recordRead(article);

  return { root, destroy: () => { unsub(); if (openCard) { openCard(); openCard = null; } } };
}

export function renderReader(article, snapshot) {
  const app = document.getElementById('app');
  const r = createReader(article, snapshot, { showBack: true });
  app.replaceChildren(r.root);
  return { destroy: r.destroy };
}
