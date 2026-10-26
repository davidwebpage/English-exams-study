// 我的: 登录/注册 + 个人主页(可编辑资料/改密码/头像色) + 学习记录 + 设置 + 退出

import { auth } from '../auth.js';
import { store } from '../store.js';
import { el, esc, icon } from '../ui.js';

const AVATAR_COLORS = [
  { id: 'teal', grad: 'linear-gradient(150deg,#12988b,#0e846f)' },
  { id: 'blue', grad: 'linear-gradient(150deg,#2563eb,#1d4ed8)' },
  { id: 'purple', grad: 'linear-gradient(150deg,#7c3aed,#6d28d9)' },
  { id: 'rose', grad: 'linear-gradient(150deg,#e11d48,#be123c)' },
  { id: 'amber', grad: 'linear-gradient(150deg,#d97706,#b45309)' },
  { id: 'slate', grad: 'linear-gradient(150deg,#475569,#334155)' },
];

export function renderMe() {
  const app = document.getElementById('app');
  const root = el('div', 'view');
  const topbar = el('div', 'topbar');
  topbar.append(el('h1', '', '我的'), el('span', 'sub', '账号与学习数据'));
  root.append(topbar);
  if (!auth.authed()) {
    root.append(loginCard());
    root.append(calendarCard());   // 日历用的是本地数据, 没登录也照样能看
  } else {
    root.append(profileCard());
    root.append(calendarCard());
    root.append(menuCard());
  }
  // 版本戳: 手机/浏览器还在跑旧缓存时, 一眼就能看出来
  root.append(el('div', 'buildstamp', `版本 ${window.__BUILD__ || 'dev'} · 数据保存在本机浏览器`));
  app.replaceChildren(root);
  return { destroy: () => {} };
}

function navMe() {
  if (location.hash === '#/me') renderMe();
  else location.hash = '#/me';
}

function avatarColor() {
  const me = auth.current() || {};
  const id = me.color || 'teal';
  return AVATAR_COLORS.find((c) => c.id === id) || AVATAR_COLORS[0];
}

function loginCard() {
  const panel = el('div', 'panel card');
  let mode = 'login';
  panel.innerHTML = `
    <div class="mtitle">登录</div>
    <div class="mfield"><label>用户名</label><input id="m-user" autocomplete="username"></div>
    <div class="mfield"><label>密码</label><input id="m-pass" type="password" autocomplete="current-password"></div>
    <div class="merr" id="m-err"></div>
    <button class="btn primary msubmit" id="m-submit">登录</button>
    <button class="mswitch" id="m-switch">没有账号？去注册</button>
    <div class="mnote">数据仅保存在当前浏览器</div>`;
  const user = panel.querySelector('#m-user');
  const pass = panel.querySelector('#m-pass');
  const err = panel.querySelector('#m-err');
  const submit = panel.querySelector('#m-submit');
  const sw = panel.querySelector('#m-switch');
  const title = panel.querySelector('.mtitle');
  function setMode(m) {
    mode = m;
    title.textContent = m === 'login' ? '登录' : '注册';
    submit.textContent = m === 'login' ? '登录' : '注册';
    sw.textContent = m === 'login' ? '没有账号？去注册' : '已有账号？去登录';
    pass.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    pass.type = 'password';
    err.textContent = '';
  }
  sw.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
  async function go() {
    err.textContent = '';
    try {
      if (mode === 'login') await auth.login(user.value, pass.value);
      else await auth.register(user.value, pass.value);
      renderMe();
    } catch (e) { err.textContent = e.message; }
  }
  submit.addEventListener('click', go);
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  user.addEventListener('keydown', (e) => { if (e.key === 'Enter') pass.focus(); });
  return panel;
}

function profileCard() {
  const me = auth.current();
  const panel = el('div', 'panel mprofile');
  const ac = avatarColor();
  const up = (n) => String(n).padStart(2, '0');
  const d = new Date(me.at);
  const joined = `${d.getFullYear()}-${up(d.getMonth() + 1)}-${up(d.getDate())}`;
  const c = store.counts();
  panel.innerHTML = `
    <div class="mavatar" style="background:${ac.grad}">${esc((me.user || '?')[0].toUpperCase())}</div>
    <div class="mname">${esc(me.user)}</div>
    <div class="mjoined">加入于 ${joined}</div>
    <div class="mstats">
      <div><b>${c.mastered}</b><span>已斩单词</span></div>
      <div><b>${store.streak()}</b><span>连续天数</span></div>
      <div><b>${Math.round((c.mastered / c.total) * 100)}%</b><span>掌握进度</span></div>
    </div>`;
  return panel;
}

// 菜单单独一块, 这样斩词日历可以插在资料卡和菜单之间(不用滚过一整屏才看见)
function menuCard() {
  const panel = el('div', 'panel mmenu-panel');
  panel.innerHTML = `
    <div class="mmenu">
      <button class="mitem" id="m-edit">${icon('user')} 编辑资料</button>
      <button class="mitem" id="m-pass">${icon('slash')} 修改密码</button>
      <button class="mitem" id="m-records">${icon('book')} 学习记录</button>
      <button class="mitem" id="m-settings">设置</button>
      <button class="mitem danger" id="m-logout">退出登录</button>
    </div>`;
  panel.querySelector('#m-edit').addEventListener('click', () => { editProfile(); });
  panel.querySelector('#m-pass').addEventListener('click', () => { changePassword(); });
  panel.querySelector('#m-records').addEventListener('click', () => { location.hash = '#/me/records'; });
  panel.querySelector('#m-settings').addEventListener('click', () => { location.hash = '#/me/settings'; });
  panel.querySelector('#m-logout').addEventListener('click', () => { auth.logout(); renderMe(); });
  return panel;
}

// 斩词日历: 一级界面按月展示每天的斩词数(数据来自 store.slashByDay())

function dayKeyOf(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function calendarCard() {
  const panel = el('div', 'panel mcal');
  const byDay = store.slashByDay();
  const WD = ['一', '二', '三', '四', '五', '六', '日'];
  const now = new Date();
  const todayK = dayKeyOf(now);
  let cur = new Date(now.getFullYear(), now.getMonth(), 1);
  let picked = todayK;          // 当前选中的日期(默认今天)

  panel.innerHTML = `
    <div class="mcal-head">
      <div class="mcal-title">斩词日历</div>
      <button class="iconbtn mcal-nav" id="cal-prev" title="上个月">${icon('back')}</button>
      <span class="mcal-mon"></span>
      <button class="iconbtn mcal-nav" id="cal-next" title="下个月">${icon('next')}</button>
    </div>
    <div class="mcal-grid" id="cal-grid"></div>
    <div class="mcal-sel"></div>
    <div class="mcal-hint" hidden></div>
    <div class="mcal-foot">
      <span class="mcal-sum"></span>
    </div>`;

  // 选中日期的文案: 「10 月 26 日 · 斩 7 个」/「… · 没有斩词」
  function showSel() {
    const box = panel.querySelector('.mcal-sel');
    if (!picked) { box.textContent = '点某一天，看当天斩了多少词'; return; }
    const [y, m, d] = picked.split('-').map(Number);
    const n = byDay[picked] || 0;
    box.innerHTML = `<b>${m} 月 ${d} 日</b> · ${n ? `斩了 <b>${n}</b> 个词` : '没有斩词'}`;
  }

  function draw() {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    panel.querySelector('.mcal-mon').textContent = `${y} 年 ${m + 1} 月`;
    panel.querySelector('#cal-next').disabled =
      y === now.getFullYear() && m === now.getMonth();

    const lead = (new Date(y, m, 1).getDay() + 6) % 7;   // 周一开头
    const days = new Date(y, m + 1, 0).getDate();
    const cells = WD.map((w) => `<div class="mcal-wd">${w}</div>`);
    for (let i = 0; i < lead; i++) cells.push('<div class="mcal-cell blank"></div>');

    let sum = 0, active = 0, maxN = 0;
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const n = byDay[k] || 0;
      sum += n;
      if (n) active++;
      if (n > maxN) maxN = n;
      rows.push([k, d, n]);
    }
    // 水位归一化: 以「当月斩得最多的那天」为满杯(1.0), 其余按比例
    const base = Math.max(maxN, 1);
    for (const [k, d, n] of rows) {
      const fill = n ? Math.min(1, n / base) : 0;
      const cls = ['mcal-cell'];
      if (!n) cls.push('dry');   // 别用 empty: 会撞上全局的空状态样式
      if (k > todayK) cls.push('future');
      if (k === todayK) cls.push('today');
      if (k === picked) cls.push('sel');
      const tip = `${m + 1} 月 ${d} 日 · ${n ? `斩 ${n} 个` : '没有斩词'}`;
      cells.push(`<div class="${cls.join(' ')}" data-day="${k}" title="${tip}" `
        + `style="--fill:${Math.round(fill * 100)}%">`
        + `<i class="w"></i><span class="d">${d}</span></div>`);
    }
    panel.querySelector('#cal-grid').innerHTML = cells.join('');
    panel.querySelector('.mcal-sum').textContent =
      `本月 ${sum} 个 · 打卡 ${active} 天 · 连续 ${store.streak()} 天`;
    showSel();
    // 空月给一句提示: 否则一整屏灰格子看着像「功能没做出来」
    const hint = panel.querySelector('.mcal-hint');
    hint.hidden = sum !== 0;
    if (sum === 0) {
      hint.textContent = (y === now.getFullYear() && m === now.getMonth())
        ? '本月还没有斩词记录 —— 去阅读里对角滑掉几个词，这里就会亮起来'
        : '这个月没有斩词记录';
    }
  }

  // 点某天 -> 选中并显示那天斩了多少
  panel.querySelector('#cal-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.mcal-cell[data-day]');
    if (!cell) return;
    picked = cell.dataset.day;
    panel.querySelectorAll('.mcal-cell.sel').forEach((c) => c.classList.remove('sel'));
    cell.classList.add('sel');
    showSel();
  });

  panel.querySelector('#cal-prev').addEventListener('click', () => {
    cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
    draw();
  });
  panel.querySelector('#cal-next').addEventListener('click', () => {
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    draw();
  });
  draw();
  return panel;
}

// 编辑资料: 用户名 + 头像色, 内联替换面板内容
function editProfile() {
  const app = document.getElementById('app');
  const me = auth.current();
  const root = el('div', 'view');
  const back = el('button', 'btn ghost', `${icon('back')} 返回`);
  back.addEventListener('click', () => { location.hash = '#/me'; });
  const topbar = el('div', 'topbar');
  topbar.append(back, el('h1', '', '编辑资料'));
  root.append(topbar);

  const panel = el('div', 'panel card');
  const cur = avatarColor();
  panel.innerHTML = `
    <div class="mfield">
      <label>用户名</label>
      <input id="e-user" value="${esc(me.user)}">
    </div>
    <div class="mfield">
      <label>头像颜色</label>
      <div class="avatar-pick" id="e-colors"></div>
    </div>
    <div class="merr" id="e-err"></div>
    <div class="row">
      <button class="btn primary" id="e-save">保存</button>
      <button class="btn ghost" id="e-cancel">取消</button>
    </div>`;
  const colors = panel.querySelector('#e-colors');
  let picked = me.color || 'teal';
  AVATAR_COLORS.forEach((c) => {
    const dot = el('button', 'avatar-dot');
    dot.style.background = c.grad;
    dot.title = c.id;
    if (c.id === picked) dot.classList.add('active');
    dot.addEventListener('click', () => {
      picked = c.id;
      colors.querySelectorAll('.avatar-dot').forEach((d) => d.classList.toggle('active', d === dot));
    });
    colors.append(dot);
  });
  const err = panel.querySelector('#e-err');
  panel.querySelector('#e-save').addEventListener('click', async () => {
    err.textContent = '';
    const name = panel.querySelector('#e-user').value.trim();
    try {
      if (name && name !== me.user) await auth.rename(name);
      auth.setProfile({ color: picked });
      navMe();
    } catch (e) { err.textContent = e.message; }
  });
  panel.querySelector('#e-cancel').addEventListener('click', () => { navMe(); });
  root.append(panel);
  app.replaceChildren(root);
  return { destroy: () => {} };
}

// 修改密码
function changePassword() {
  const app = document.getElementById('app');
  const root = el('div', 'view');
  const back = el('button', 'btn ghost', `${icon('back')} 返回`);
  back.addEventListener('click', () => { location.hash = '#/me'; });
  const topbar = el('div', 'topbar');
  topbar.append(back, el('h1', '', '修改密码'));
  root.append(topbar);

  const panel = el('div', 'panel card');
  panel.innerHTML = `
    <div class="mfield"><label>原密码</label><input id="p-old" type="password" autocomplete="current-password"></div>
    <div class="mfield"><label>新密码（至少 6 位）</label><input id="p-new" type="password" autocomplete="new-password"></div>
    <div class="mfield"><label>确认新密码</label><input id="p-confirm" type="password" autocomplete="new-password"></div>
    <div class="merr" id="p-err"></div>
    <div class="row">
      <button class="btn primary" id="p-save">保存</button>
      <button class="btn ghost" id="p-cancel">取消</button>
    </div>`;
  const err = panel.querySelector('#p-err');
  panel.querySelector('#p-save').addEventListener('click', async () => {
    err.textContent = '';
    const o = panel.querySelector('#p-old').value;
    const n = panel.querySelector('#p-new').value;
    const c = panel.querySelector('#p-confirm').value;
    if (n !== c) { err.textContent = '两次输入的新密码不一致'; return; }
    try { await auth.changePassword(o, n); navMe(); }
    catch (e) { err.textContent = e.message; }
  });
  panel.querySelector('#p-cancel').addEventListener('click', () => { navMe(); });
  root.append(panel);
  app.replaceChildren(root);
  return { destroy: () => {} };
}

export function renderSettings() {
  const app = document.getElementById('app');
  const root = el('div', 'view');
  const back = el('button', 'btn ghost', `${icon('back')} 返回`);
  back.addEventListener('click', () => { navMe(); });
  const topbar = el('div', 'topbar');
  topbar.append(back, el('h1', '', '设置'));
  root.append(topbar);

  const ratio = store.settings().ratio;
  const sitRate = store.settings().sitRate || 0.9;
  const rPanel = el('div', 'panel card mset');
  rPanel.innerHTML = `
    <div class="mset-row">
      <div class="mset-l"><b>生词比例</b><span>推荐文章的新词密度上限</span></div>
      <input id="s-ratio" type="range" min="5" max="80" step="1" value="${Math.round(ratio * 100)}">
    </div>
    <div class="mset-row">
      <div class="mset-l"><b>听读语速</b><span>整篇朗读的播放速度</span></div>
      <input id="s-rate" type="range" min="0.5" max="1.4" step="0.05" value="${sitRate}">
    </div>`;
  rPanel.querySelector('#s-ratio').addEventListener('input', (e) => store.setSetting('ratio', Number(e.target.value) / 100));
  rPanel.querySelector('#s-rate').addEventListener('input', (e) => store.setSetting('sitRate', Number(e.target.value)));
  root.append(rPanel);
  app.replaceChildren(root);
  return { destroy: () => {} };
}
