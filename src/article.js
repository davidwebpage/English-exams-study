// Tokenize + render article paragraphs. Every English word becomes an
// interactive span; words matched to the library (via inflection/derivation)
// carry an id and join the 斩/下划线 system; unmatched words render as plain
// clickable "超纲" tokens (no underline, no slash, but still tappable).

import { store } from './store.js';

const WORD_RE = /[A-Za-z]+(?:['\u2019][A-Za-z]+)?/;

// 不规则动词/名词变形, 直接映射到原形
const IRREGULAR = {
  built: 'build', made: 'make', seen: 'see', told: 'tell', grew: 'grow',
  meant: 'mean', hidden: 'hide', paid: 'pay', won: 'win', lost: 'lose',
  sent: 'send', spent: 'spend', lent: 'lend', bent: 'bend', dealt: 'deal',
  felt: 'feel', kept: 'keep', left: 'leave', held: 'hold', met: 'meet',
  ran: 'run', sat: 'sit', stood: 'stand', understood: 'understand',
  became: 'become', came: 'come', took: 'take', gave: 'give', got: 'get',
  found: 'find', said: 'say', went: 'go', knew: 'know', threw: 'throw',
  drew: 'draw', flew: 'fly', blew: 'blow', grew: 'grow', swore: 'swear',
  bore: 'bear', tore: 'tear', wore: 'wear', arose: 'arise', chose: 'choose',
  taken: 'take', known: 'know', grown: 'grow', outgrown: 'outgrow', heard: 'hear',
  brought: 'bring', led: 'lead', eaten: 'eat', spoken: 'speak', shaken: 'shake',
  worn: 'wear', woven: 'weave', written: 'write', rebuilt: 'rebuild', borne: 'bear',
  forgotten: 'forget', hidden: 'hide', proven: 'prove', sworn: 'swear', torn: 'tear',
  crises: 'crisis', analyses: 'analysis', theses: 'thesis', bases: 'basis',
  caught: 'catch',
  begun: 'begin',
  fallen: 'fall',
  sold: 'sell',
  blurs: 'blur',
  erodes: 'erode',
  equipped: 'equip',
  froze: 'freeze', stole: 'steal', spoke: 'speak', broke: 'break', woke: 'wake',
  ate: 'eat', fell: 'fall', drove: 'drive', rode: 'ride', rose: 'rise',
  wrote: 'write', bit: 'bite', hid: 'hide', slid: 'slide', rang: 'ring',
  sang: 'sing', drank: 'drink', shrank: 'shrink', sank: 'sink', began: 'begin',
  children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth',
  geese: 'goose', mice: 'mouse', oxen: 'ox', criteria: 'criterion',
  phenomena: 'phenomenon', data: 'datum', analyses: 'analysis',
  bases: 'basis', crises: 'crisis', theses: 'thesis',
};

function lookup(word) {
  let w = word.toLowerCase().replace(/[\u2019']s$/, '');   // candidate's -> candidate
  if (w !== word.toLowerCase() && store.byWord.has(w)) return store.byWord.get(w).id;
  if (store.byWord.has(w)) return store.byWord.get(w).id;
  // 不规则变形
  if (IRREGULAR[w] && store.byWord.has(IRREGULAR[w])) return store.byWord.get(IRREGULAR[w]).id;
  // 常见屈折后缀
  const flex = [
    (x) => x.endsWith('ies') ? x.slice(0, -3) + 'y' : x,
    (x) => x.endsWith('es') ? x.slice(0, -2) : x,
    (x) => x.endsWith('s') ? x.slice(0, -1) : x,
    (x) => x.endsWith('ed') ? x.slice(0, -2) : x,
    (x) => (x.endsWith('ed') && x.length > 3 ? x.slice(0, -2) + 'e' : x),
    (x) => {
      if (!x.endsWith('ed') || x.length <= 3) return x;
      const s2 = x.slice(0, -2);
      return (s2.length > 1 && s2.endsWith(s2[s2.length - 1])) ? s2.slice(0, -1) : s2;
    },
    (x) => x.endsWith('ing') && x.length > 4 ? x.slice(0, -3) : x,
    (x) => (x.endsWith('ing') && x.length > 4 ? x.slice(0, -3) + 'e' : x),
    (x) => {
      if (!x.endsWith('ing') || x.length <= 5) return x;
      const s2 = x.slice(0, -3);
      return (s2.length > 1 && s2.endsWith(s2[s2.length - 1])) ? s2.slice(0, -1) : s2;
    },
  ];
  for (const fn of flex) {
    const t = fn(w);
    if (t && t !== w && store.byWord.has(t)) return store.byWord.get(t).id;
  }

  // 形容词/副词的比较级、最高级: deepest->deep, busiest->busy, bigger->big
  // 只认 pos 是形容词/副词的词, 免得 career 被当成 care 的比较级
  const isAdj = (t) => {
    const hit = store.byWord.get(t);
    if (!hit) return false;
    const pos = (hit.pos || []).join(' ').toLowerCase();
    return /\b(adj|a|adv|ad)\b/.test(pos.replace(/\./g, '')) || /adj|adv/.test(pos);
  };
  for (const suf of ['est', 'er']) {
    if (!w.endsWith(suf) || w.length <= suf.length + 1) continue;
    const stem = w.slice(0, -suf.length);
    const cands = [stem, stem + 'e'];
    if (stem.endsWith('i')) cands.push(stem.slice(0, -1) + 'y');
    if (stem.length > 1 && stem.endsWith(stem[stem.length - 1])) cands.push(stem.slice(0, -1));
    for (const t of cands) {
      if (t && isAdj(t)) return store.byWord.get(t).id;
    }
  }

  // carried->carry / denied->deny
  if (w.endsWith('ied') && w.length > 4) {
    const t = w.slice(0, -3) + 'y';
    if (store.byWord.has(t)) return store.byWord.get(t).id;
  }
  // shelves->shelf / lives->life
  if (w.endsWith('ves') && w.length > 4) {
    for (const t of [w.slice(0, -3) + 'f', w.slice(0, -3) + 'fe']) {
      if (store.byWord.has(t)) return store.byWord.get(t).id;
    }
  }
  // 派生后缀: 尝试 stem / stem+e / stem 改 y->i
  const derSuffixes = ['ment', 'tion', 'sion', 'ness', 'ity', 'er', 'or', 'ly', 'al', 'ous', 'ive', 'ance', 'ence', 'ure', 'ation', 'ization', 'ally'];
  for (const suf of derSuffixes) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      const stem = w.slice(0, -suf.length);
      for (const t of [stem, stem + 'e', stem.replace(/y$/, 'i')]) {
        if (t && store.byWord.has(t)) return store.byWord.get(t).id;
      }
      // ity -> ous (ambiguity->ambiguous), ity -> al
      if (suf === 'ity') {
        for (const t of [stem + 'ous', stem + 'al', stem + 'e']) {
          if (t && store.byWord.has(t)) return store.byWord.get(t).id;
        }
      }
      // ness -> y / ful (darkness->dark 已 stem 命中; happiness->happy)
      if (suf === 'ness') {
        for (const t of [stem + 'y', stem + 'ful']) {
          if (t && store.byWord.has(t)) return store.byWord.get(t).id;
        }
      }
    }
  }
  // -ility -> -(e)le / -ible  (flexibility->flexible, ability->able)
  if (w.endsWith('ility') && w.length > 6) {
    const t = w.slice(0, -5) + 'le';
    if (t && store.byWord.has(t)) return store.byWord.get(t).id;
  }
  if (w.endsWith('ibility') && w.length > 8) {
    const t = w.slice(0, -5) + 'ible';
    if (t && store.byWord.has(t)) return store.byWord.get(t).id;
  }
  return null;
}

export function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const m = WORD_RE.exec(text.slice(i));
    if (!m) { tokens.push({ text: text.slice(i), type: 'sep' }); break; }
    if (m.index > 0) tokens.push({ text: text.slice(i, i + m.index), type: 'sep' });
    tokens.push({ text: m[0], type: 'word' });
    i += m.index + m[0].length;
  }
  return tokens;
}

export function annotate(paragraph) {
  const toks = tokenize(paragraph);
  const ids = new Set();
  for (const t of toks) {
    if (t.type === 'word') {
      t.id = lookup(t.text);   // may be null (真未知词) or 扩展/基础/常用词
      t.isBasic = store.isBasicWord(t.text);
      t.variant = !!(t.id && !t.isBasic && !store.byWord.has(t.text.toLowerCase()));  // 词形还原命中=变形词
      if (t.id && store.isLearnable(t.id)) ids.add(t.id);   // 大纲词 + 日常基础词参与斩词/统计
    }
  }
  return { tokens: toks, ids };
}

export function annotateArticle(article) {
  const ids = new Set();
  const paragraphs = (article.paragraphs || []).map((p) => {
    const a = annotate(p);
    a.ids.forEach((id) => ids.add(id));
    return a;
  });
  article._annotated = { paragraphs, ids };
  return article;
}

// statusFn(id) -> 'new'|'learning'|'mastered'; id 可能为 null (超纲词)
// freshIds: 本篇里「刚被斩掉」的单词 id 集合 —— 这些词加一条细横线表示划掉。
// 已在别处斩过的词不在这个集合里, 所以别的文章/旧词都不会多出标记。
export function renderParagraph(ann, statusFn, freshIds) {
  const p = document.createElement('p');
  for (const t of ann.tokens) {
    if (t.type === 'sep') {
      p.appendChild(document.createTextNode(t.text));
      continue;
    }
    // 所有英文单词都渲染为可点击 span
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = t.text;
    const syll = !!(t.id && store.isSyllabus(t.id));
    const exact = !t.variant;
    if (t.isBasic) {
      // 基础语法词(优先级最高, 即使也在大纲表里): 恒已斩, 不划线
      span.classList.add('plain');
      if (t.id) span.dataset.id = t.id;
      span.dataset.cat = 'basic';
      span.dataset.lab = '基础·已斩';
    } else if (t.id && syll) {
      // 大纲词(原形 + 变形词): 与同一词同状态, 未掌握加下划线, 可斩
      const st = statusFn(t.id);
      const cat = exact ? 'syll' : 'variant';
      span.dataset.id = t.id;
      span.dataset.cat = cat;
      span.dataset.lab = st === 'mastered' ? (cat === 'syll' ? '大纲·已斩' : '变形·已斩')
        : st === 'learning' ? (cat === 'syll' ? '大纲·学习中' : '变形·学习中')
        : (cat === 'syll' ? '大纲·未斩' : '变形·未斩');
      if (st === 'mastered') {
        span.classList.add('master');
        if (freshIds && freshIds.has(t.id)) span.classList.add('cut');
      } else if (st === 'learning') span.classList.add('mastering', 'under');
      else span.classList.add('under');
    } else if (t.id && store.isDaily(t.id)) {
      // 日常基础词(people/online...): 不是恒已斩, 与大纲词同套状态, 需手动斩
      const st = statusFn(t.id);
      span.dataset.id = t.id;
      span.dataset.cat = 'daily';
      span.dataset.lab = st === 'mastered' ? '基础·已斩'
        : st === 'learning' ? '基础·学习中' : '基础·未斩';
      if (st === 'mastered') {
        span.classList.add('master');
        if (freshIds && freshIds.has(t.id)) span.classList.add('cut');
      } else if (st === 'learning') span.classList.add('mastering', 'under');
      else span.classList.add('under');
    } else if (t.id && store.isCommon(t.id)) {
      // 常用词(漏于大纲的基础实义词): 恒已斩, 不划线
      span.classList.add('plain');
      span.dataset.id = t.id;
      span.dataset.cat = 'common';
      span.dataset.lab = '常用·已斩';
    } else {
      // 超纲词(学术/生僻): 可点击看释义, 标注超纲, 不下划线
      span.classList.add('outline');
      span.dataset.cat = 'outline';
      span.dataset.lab = '超纲';
      if (t.id) span.dataset.id = t.id;
    }
    p.appendChild(span);
  }
  return p;
}

export function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+(?:\s|\u2026|$)/g) || [text];
}

// 固定编号: 优先取数据里的 no 字段, 其次从 id(a8) 解析。
// 同一篇文章无论从列表/听读/记录进入, 编号都不变。
export function articleNo(article) {
  if (!article) return 0;
  const n = Number(article.no);
  if (Number.isFinite(n) && n > 0) return n;
  const m = String(article.id || '').match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

// 「第 8 篇」; 没有编号时返回空串
export function articleLabel(article) {
  const n = articleNo(article);
  return n ? `第 ${n} 篇` : '';
}
