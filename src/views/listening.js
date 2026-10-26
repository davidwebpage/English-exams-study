// 听读模式: 整篇 TTS 朗读 + 当前句/当前词高亮 + 语速控制

import { store } from '../store.js';
import { ListenSession } from '../tts.js';
import { totalWordsOf } from './reading.js';
import { articleLabel } from '../article.js';
import { showWordPopup } from '../ui.js';
import { el, esc, icon } from '../ui.js';

export function renderListenPick() {
  const app = document.getElementById('app');
  const root = el('div', 'view');
  const topbar = el('div', 'topbar');
  topbar.append(el('h1', '', '听读'), el('span', 'sub', '边听边看 · 听力加粗'));
  root.append(topbar);

  const list = el('div', 'picklist');
  store.articles.forEach((a) => {
    const card = el('button', 'btn pick');
    card.innerHTML = `
      <div class="pt"><span class="no">${articleLabel(a)}</span> ${esc(a.title)}</div>
      <div class="pm"><span>${esc(a.topic)}</span><span>总词数 ${totalWordsOf(a)}</span><span>${esc(a.level)}</span></div>`;
    card.addEventListener('click', () => { location.hash = `#/listening/${a.id}`; });
    list.append(card);
  });
  root.append(list);
  app.replaceChildren(root);
  return { destroy: () => {} };
}

export function renderListen(article) {
  const app = document.getElementById('app');
  const root = el('div', 'view');

  const back = el('button', 'btn ghost', `${icon('back')} 返回`);
  back.addEventListener('click', () => { location.hash = '#/listening'; });
  const topbar = el('div', 'topbar');
  topbar.append(back, el('h1', '', `<span class="h1-no">${articleLabel(article)}</span> ${esc(article.title)}`));
  root.append(topbar);

  const rate = store.settings().sitRate || 0.9;
  const controls = el('div', 'listen-controls');
  const playBtn = el('button', 'btn primary', `${icon('play')} 播放`);
  const pauseBtn = el('button', 'btn', `${icon('pause')} 暂停`);
  const stopBtn = el('button', 'btn', `${icon('stop')} 停止`);
  pauseBtn.addEventListener('click', () => { if (session) session.pause(); });
  const rateCtl = el('div', 'rate-ctl');
  const rateInput = el('input');
  rateInput.type = 'range'; rateInput.min = 0.5; rateInput.max = 1.4; rateInput.step = 0.05; rateInput.value = rate;
  const rateLabel = el('span', 'muted', `${rate.toFixed(2)}x`);
  rateInput.addEventListener('input', () => { rateLabel.textContent = `${Number(rateInput.value).toFixed(2)}x`; });
  controls.append(playBtn, pauseBtn, stopBtn, rateCtl);
  rateCtl.append(rateInput, rateLabel);
  root.append(controls);

  const progressBar = el('div', 'progressbar');
  const progressFill = el('i');
  progressBar.append(progressFill);
  root.append(progressBar);

  const body = el('div', 'listen-body');
  const nowSel = el('div', 'nowword');
  nowSel.innerHTML = '<span class="big">…</span>';
  root.append(body, nowSel);

  // one sentence element per sentence, with lw word spans
  const sentenceEls = [];
  article.paragraphs.forEach((p) => {
    const sentences = p.split(/(?<=[.!?])\s+/);
    sentences.forEach((s) => {
      if (!s.trim()) return;
      const pEl = el('div', 'sentence');
      const words = s.split(/\s+/);
      const offsets = [];
      let idx = 0;
      const frag = document.createDocumentFragment();
      words.forEach((wt, wi) => {
        if (wi) frag.append(document.createTextNode(' '));
        const sp = el('span', 'lw', esc(wt));
        sp.dataset.wi = wi;
        sp.addEventListener('pointerdown', () => {
          const w = wordAt(wt);
          if (!w) return;
          showWordPopup(w.id, { slash: () => store.slash(w.id), learn: () => store.learn(w.id) });
        });
        frag.append(sp);
        offsets.push({ wi, start: idx, end: idx + wt.length });
        idx += wt.length + 1;
      });
      pEl.append(frag);
      sentenceEls.push({ el: pEl, text: s, offsets });
      body.append(pEl);
    });
  });

  let session = null;
  let active = null;

  function wordAt(wt) {
    const clean = wt.replace(/[^A-Za-z]/g, '').toLowerCase();
    return store.byWord.get(clean);
  }

  function clearHighlights() {
    sentenceEls.forEach((s) => {
      s.el.classList.remove('active');
      s.el.querySelectorAll('.lw.cur').forEach((el2) => el2.classList.remove('cur'));
    });
  }

  playBtn.addEventListener('click', () => {
    if (session) session.stop();
    let current = 0;
    clearHighlights();
    progressFill.style.width = '0%';
    const allWords = sentenceEls.flatMap((s) => s.offsets).length;
    let spokenWords = 0;
    session = new ListenSession(article.paragraphs, {
      rate: Number(rateInput.value) || rate,
      onSentence: (i, s) => {
        clearHighlights();
        sentenceEls[i]?.el.classList.add('active');
        current = i;
        sentenceEls[i]?.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
      onWord: (charIndex, s) => {
        const se = sentenceEls[current];
        if (!se) return;
        se.el.querySelectorAll('.lw.cur').forEach((el2) => el2.classList.remove('cur'));
        const w = se.offsets.find((o) => charIndex >= o.start && charIndex < o.end);
        if (w) {
          const span = se.el.querySelector(`.lw[data-wi="${w.wi}"]`);
          if (span) { span.classList.add('cur'); nowSel.innerHTML = `<span class="big">${esc(span.textContent)}</span>`; }
        }
        spokenWords++;
        progressFill.style.width = `${Math.min(100, Math.round((spokenWords / allWords) * 100))}%`;
      },
      onEnd: () => { session = null; nowSel.innerHTML = '<span class="big">完</span>'; },
    });
    session.start();
  });

  stopBtn.addEventListener('click', () => { if (session) { session.stop(); session = null; } clearHighlights(); nowSel.innerHTML = '<span class="big">…</span>'; });

  app.replaceChildren(root);
  return { destroy: () => { if (session) session.stop(); } };
}
