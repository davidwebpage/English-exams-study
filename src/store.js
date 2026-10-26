// Core store: word library, per-word status, reading history, stats.
// Persisted to localStorage, **按账号隔离**：cet.study.v1:<scope>，游客用 guest。
// Vanilla pub/sub reactive store.

const LEGACY_KEY = 'cet.study.v1';       // 旧的全局键（改账号体系前用的），只用于一次性迁移
const KEY_PREFIX = 'cet.study.v1:';     // 新键：KEY_PREFIX + scope
let scope = 'guest';
const lsKey = () => KEY_PREFIX + scope;

// 本地日期(不用 toISOString: 那是 UTC, 中国时区凌晨斩词会被记到前一天)
function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const today = () => dayKey();

const listeners = new Set();

function blankState() {
  return {
    statuses: {},          // wordId -> 'new'|'learning'|'mastered'
    history: [],           // {articleId,title,readAt,snapshot:{id:status},counts}
    settings: { ratio: 0.5, sitRate: 0.9 },
    slashedByDay: {},      // 旧字段(早期逻辑有 bug, 一直记不上), 保留兼容
    slashLog: {},          // wordId -> 'YYYY-MM-DD' 斩词日期, 日历/统计的唯一数据源
    slashArt: {},          // wordId -> articleId 这个词是在哪篇里斩的(决定横线在哪篇出现)
    learnedArticles: {},  // articleId -> true (该篇已标记学习完成)
    seeded: true,          // 2026-10-26 起不再自动灌百词斩种子, 置 true 表示这步已跳过
    purgedCommon: true,
  };
}

let state = blankState();

function readRaw(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function writeRaw(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage full */ }
}

// 读某个 scope 的进度；不存在就建一份空的。
// 迁移规则：登录账号第一次出现、且本机还留着旧的全局进度时，把旧进度接收过来
// （只发生一次，接收后旧键删除）。游客不接收，所以未登录永远是干净的 0。
function loadScope(name) {
  const saved = readRaw(KEY_PREFIX + name);
  if (saved) return { ...blankState(), ...saved };

  if (name !== 'guest') {
    const legacy = readRaw(LEGACY_KEY);
    if (legacy) {
      try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
      const s = { ...blankState(), ...legacy, seeded: true };
      writeRaw(KEY_PREFIX + name, s);
      return s;
    }
  }
  const s = blankState();
  writeRaw(KEY_PREFIX + name, s);
  return s;
}

const persistHooks = new Set();
function save() {
  writeRaw(lsKey(), state);
  persistHooks.forEach((fn) => fn());
}
function emit() { listeners.forEach((fn) => fn()); }

export const store = {
  words: [],
  byId: new Map(),
  byWord: new Map(),
  articles: [],
  freq: {},
  syllabusIds: new Set(),
  basicIds: new Set(),
  extraIds: new Set(),
  commonIds: new Set(),
  dailyIds: new Set(),
  basicWords: new Set(),
  dailyWords: new Set(),
  daily: [],
  ready: false,

  async init(scopeName) {
    if (this.ready) return;
    scope = scopeName || 'guest';
    state = loadScope(scope);
    const [words, articles, freq, extra, basic, common] = await Promise.all([
      fetch('./data/words.json').then((r) => r.json()),
      fetch('./data/articles.json').then((r) => r.json()),
      fetch('./data/wordfreq.json').then((r) => r.json()),
      fetch('./data/extra-words.json').then((r) => r.json()).catch(() => ({ words: [] })),
      fetch('./data/basic-words.json').then((r) => r.json()).catch(() => ({ words: [] })),
      fetch('./data/common-words.json').then((r) => r.json()).catch(() => ({ words: [] })),
    ]);
    this.words = words;
    this.articles = Array.isArray(articles) ? articles : (articles.articles || []);
    this.freq = freq || {};
    this.syllabusIds = new Set(words.map((w0) => w0.id));
    for (const w of words) {
      this.byId.set(w.id, w);
      this.byWord.set(w.word, w);
    }
    // 基础词分两类(basic-words.json 的 words 数组):
    // - 语法词(the/a/an/had...): 恒已斩, 不划线, 不进斩词
    // - 日常基础词(people/online/email...): 2026-10-26 起并入基础词层,
    //   标记 learnable=true —— 不是恒已斩, 需手动斩、参与进度
    this.basicIds = new Set();
    this.basicWords = new Set();
    this.dailyIds = new Set();
    this.dailyWords = new Set();
    this.daily = [];
    for (const w of (basic.words || [])) {
      if (w.learnable) {
        if (this.byWord.has(w.word)) continue;
        this.dailyIds.add(w.id);
        this.dailyWords.add(w.word);
        this.daily.push(w);
      } else {
        this.basicWords.add(w.word);
        if (this.byWord.has(w.word)) continue;
        this.basicIds.add(w.id);
      }
      this.byId.set(w.id, w);
      this.byWord.set(w.word, w);
    }
    // 常用词(漏于CET大纲的基础实义词): 恒为已斩, 不进斩词
    // 2026-10-26 取消这一层(它把 performance/applicant/oversight 这类词也算成「已斩」),
    // 文件保留为空数组, 代码路径留着以便以后再用。
    this.commonIds = new Set();
    for (const w of (common.words || [])) {
      if (this.byWord.has(w.word)) continue;
      this.commonIds.add(w.id);
      this.byId.set(w.id, w);
      this.byWord.set(w.word, w);
      state.statuses[w.id] = 'mastered';
    }
    // 一次性迁移: 清掉旧「常用词」在 localStorage 里留下的孤儿状态(104001-104138)
    if (!state.purgedCommon) {
      for (const id of Object.keys(state.statuses)) {
        const n = Number(id);
        if (n >= 104001 && n <= 104199) delete state.statuses[id];
      }
      state.purgedCommon = true;
      save();
    }
    // 扩展超纲词(学术/生僻): 提供释义与朗读, 不进词库/斩词
    this.extraIds = new Set();
    for (const w of (extra.words || [])) {
      if (this.byWord.has(w.word)) continue;
      this.extraIds.add(w.id);
      this.byId.set(w.id, w);
      this.byWord.set(w.word, w);
    }
    // 2026-10-26 起不再自动灌百词斩种子：未登录/新账号一律从 0 开始。
    // 老用户的历史进度走 loadScope() 的一次性迁移。
    this.ready = true;
    emit();
  },

  // 切换账号（登录/登出时调用）：先把当前进度落盘，再载入目标 scope 的那份。
  switchScope(scopeName) {
    const next = scopeName || 'guest';
    if (next === scope) return;
    writeRaw(lsKey(), state);
    scope = next;
    state = loadScope(scope);
    emit();
  },
  currentScope() { return scope; },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  onPersist(fn) { persistHooks.add(fn); return () => persistHooks.delete(fn); },
  hydrate(s) {
    state = { ...state, ...s };
    save(); emit();
  },

  status(id) { return state.statuses[id] || 'new'; },
  isMastered(id) { return state.statuses[id] === 'mastered'; },
  isLearning(id) { return state.statuses[id] === 'learning'; },
  isNew(id) { return !state.statuses[id] || state.statuses[id] === 'new'; },


  freqOf(id) { const w = this.byId.get(Number(id)); return w ? (this.freq[w.word] || 0) : 0; },
  isSyllabus(id) { return this.syllabusIds.has(Number(id)); },
  isBasic(id) { return this.basicIds.has(Number(id)); },
  isBasicWord(t) { return this.basicWords.has(String(t).toLowerCase()); },
  isExtra(id) { return this.extraIds.has(Number(id)); },
  isCommon(id) { return this.commonIds.has(Number(id)); },
  isDaily(id) { return this.dailyIds.has(Number(id)); },
  isDailyWord(t) { return this.dailyWords.has(String(t).toLowerCase()); },
  // 可学习词 = 大纲词 + 日常基础词: 可斩/划线/计进度; 语法词和超纲词不在内
  isLearnable(id) {
    const n = Number(id);
    return this.syllabusIds.has(n) || this.dailyIds.has(n);
  },
  allWords() { return this.words.concat(this.daily); },

  markArticleLearned(articleId, ids) {
    state.learnedArticles[articleId] = true;
    ids.forEach((id) => { if (!state.statuses[id] || state.statuses[id] === 'new') state.statuses[id] = 'learning'; });
    save(); emit();
  },
  isArticleLearned(articleId) { return !!state.learnedArticles[articleId]; },
  unmarkArticleLearned(articleId) {
    delete state.learnedArticles[articleId];
    save(); emit();
  },

  // art: 这次是在哪篇文章里斩的(用于「本篇划掉」的横线永久保留; 词库里斩的传空)
  setStatus(id, st, art) {
    const prev = state.statuses[id] || 'new';
    state.statuses[id] = st;
    // 斩词日期/出自哪篇文章都按词记录: 撤销(加回未学)时一并删掉, 统计不会虚高
    if (st === 'mastered' && prev !== 'mastered') {
      state.slashLog[id] = today();
      if (art) state.slashArt[id] = art;
      else delete state.slashArt[id];
    } else if (st !== 'mastered' && prev === 'mastered') {
      delete state.slashLog[id];
      delete state.slashArt[id];
    }
    save(); emit();
  },
  slash(id, art) { if (!this.isMastered(id)) this.setStatus(id, 'mastered', art); },
  // 这个词当初是在哪篇文章里斩的(没有则 null)
  slashArticleOf(id) { return state.slashArt[id] || null; },
  learn(id) { this.setStatus(id, 'learning'); },
  reset(id) { this.setStatus(id, 'new'); },

  counts() {
    let n = 0, ler = 0, mas = 0;
    const tally = (id) => {
      const s = state.statuses[id] || 'new';
      if (s === 'mastered') mas++;
      else if (s === 'learning') ler++;
      else n++;
    };
    for (const w of this.words) tally(w.id);
    for (const w of this.daily) tally(w.id);
    return { new: n, learning: ler, mastered: mas, total: this.words.length + this.daily.length };
  },

  countsFor(ids) {
    let ler = 0, mas = 0;
    for (const id of ids) {
      const s = state.statuses[id] || 'new';
      if (s === 'mastered') mas++;
      else if (s === 'learning') ler++;
    }
    return { new: ids.size - ler - mas, learning: ler, mastered: mas, total: ids.size };
  },

  readSnapshot(article) {
    const ids = article.wordIds || new Set();
    const snap = {};
    ids.forEach((id) => { snap[id] = this.status(id); });
    const counts = this.countsFor(ids);
    return { snap, counts };
  },

  recordRead(article) {
    const { snap, counts } = this.readSnapshot(article);
    state.history.unshift({
      articleId: article.id,
      title: article.title,
      readAt: Date.now(),
      snapshot: snap,
      counts,
    });
    if (state.history.length > 400) state.history.pop();
    save(); emit();
  },
  history() { return state.history.slice(); },

  // 每日斩词数: {'YYYY-MM-DD': n} —— 由 slashLog 聚合, 供日历/统计用
  slashByDay() {
    const out = {};
    for (const day of Object.values(state.slashLog)) out[day] = (out[day] || 0) + 1;
    return out;
  },
  todaySlashes() { return this.slashByDay()[today()] || 0; },
  totalSlashes() { return Object.keys(state.slashLog).length; },
  // 连续天数: 今天没斩不算断(从昨天往前数), 一旦断档就停
  streak() {
    const byDay = this.slashByDay();
    const d = new Date();
    if (!byDay[dayKey(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    while (byDay[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },

  settings() { return state.settings; },
  setSetting(k, v) { state.settings[k] = v; save(); emit(); },

  // article helpers
  wordById(id) { return this.byId.get(Number(id)); },
  masteredSet() {
    const set = new Set();
    for (const [id, s] of Object.entries(state.statuses)) if (s === 'mastered') set.add(Number(id));
    return set;
  },
  state() { return state; },
};
