import { chromium } from '/Users/David/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';

const BASE = 'http://127.0.0.1:8321';
const LAUNCH = {
  executablePath: '/Users/David/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',
};
mkdirSync('.verify', { recursive: true });

const browser = await chromium.launch(LAUNCH);
const page = await browser.newPage({ viewport: { width: 980, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));

const log = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
const count = (sel) => page.locator(sel).count();
let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) pass++; else fail++; log(name, !!cond, extra); }

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForSelector('.article', { timeout: 10000 });

// —— 当日推送: 直接展示文章正文, 无列表条目 ——
const segTexts = await page.locator('.seg button').allInnerTexts();
check('顶部结构: 当日推送 / 全部篇目', segTexts.some((t) => t.includes('当日推送')) && segTexts.some((t) => t.includes('全部篇目')), segTexts.join(' | '));
check('当日推送直接展示正文(无条目)', (await count('.picklist .pick')) === 0 && (await count('.article')) >= 1);
check('今日推送注记存在', (await count('.today-note')) === 1);
await page.screenshot({ path: '.verify/v0-daily.png' });

const metaTxt = await page.locator('.reader-meta').innerText();
check('阅读 meta 含总词数', metaTxt.includes('总词数'), metaTxt.split('\n')[1]);

const under0 = await count('.article .word.under');
const allWords = await count('.article .word');
check('文章渲染 CET 词且未斩下划线', allWords > 50 && under0 > 0, `${allWords} words / ${under0} underlined`);

// —— 点词 -> 跟随单词浮卡 ——
const firstWord = page.locator('.article .word.under').first();
const wb = await firstWord.boundingBox();
await page.mouse.click(wb.x + wb.width / 2, wb.y + wb.height / 2);
await page.waitForSelector('.wordcard', { timeout: 5000 });
const wcTxt = await page.locator('.wordcard').innerText();
check('点词出现跟随浮卡', wcTxt.includes('斩') && wcTxt.includes('/'), wcTxt.split('\n').slice(0, 4).join(' | '));
await page.screenshot({ path: '.verify/v3-wordcard.png' });
await page.locator('.reader-meta').click({ position: { x: 6, y: 6 } });
await page.waitForSelector('.wordcard', { state: 'detached', timeout: 3000 });

// —— 中英对照 ——
await page.locator('.reader-bar button').filter({ hasText: /中英对照|English/ }).click();
await page.waitForSelector('.article.biling', { timeout: 5000 });
const brow = await count('.article .brow');
check('中英对照双边排版', brow >= 2, `${brow} 行对照`);
const zhLen = (await page.locator('.article .bzh').first().innerText()).length;
check('对照含中文译文', zhLen > 10, `首段译文 ${zhLen} 字`);
await page.screenshot({ path: '.verify/v4-bilingual.png' });

// —— 对角滑动斩词 ——
const target = page.locator('.ben .word.under').first();
const b = await target.boundingBox();
await page.mouse.move(b.x + 2, b.y + 2);
await page.mouse.down();
await page.mouse.move(b.x + 2 + 60, b.y + 2 + 44, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(800);
const under1 = await count('.article .word.under');
check('对角滑动斩词生效', under1 < under0, `underlined ${under0} -> ${under1}`);
const cutInfo = await page.evaluate(() => {
  const cut = [...document.querySelectorAll('.article .word.cut')];
  const plainMaster = [...document.querySelectorAll('.article .word.master')].filter((e) => !e.classList.contains('cut'));
  return {
    cut: cut.length,
    deco: cut.length ? getComputedStyle(cut[0]).textDecorationLine : 'none',
    preMastered: plainMaster.length,
  };
});
check('本篇刚斩掉的词有横划线', cutInfo.cut >= 1 && cutInfo.deco === 'line-through', JSON.stringify(cutInfo));
check('进文章前就斩过的词没有横划线', cutInfo.preMastered >= 1, `${cutInfo.preMastered} 个`);
await page.screenshot({ path: '.verify/v5-slash.png' });

// —— 已学习按钮(可切换: 标记 / 撤销) ——
const learnBtn = page.locator('.reader-bar button').filter({ hasText: '已学习' });
check('存在已学习按钮', (await learnBtn.count()) === 1);
await learnBtn.click();
await page.waitForTimeout(600);
const lbl = await page.locator('.reader-bar button').filter({ hasText: '已学习' }).innerText();
check('已学习可点击切换(非禁用)', lbl.includes('已学习') && lbl.includes('撤销') && !(await learnBtn.isDisabled()), lbl);
const learningNow = await count('.article .word.mastering');
check('全篇生词转入学习中', learningNow > 0, `${learningNow} 个学习中文词`);
// 再点一次撤销
await learnBtn.click();
await page.waitForTimeout(400);
const lblBack = await page.locator('.reader-bar button').filter({ hasText: '已学习' }).innerText();
check('再点一次撤销已学习', lblBack.trim() === '已学习', lblBack);

// —— 全部篇目(含滑块/列表/总词数) ——
await page.locator('.seg button').filter({ hasText: '全部篇目' }).click();
await page.waitForSelector('.picklist .pick', { timeout: 8000 });
check('全部篇目展示列表', (await count('.picklist .pick')) >= 1);
check('全部篇目含生词比例滑块', (await count('.rate-ctl input[type=range]')) === 1);
// —— 用户反馈: 明明没斩却显示已斩(automated / applicants / oversight) ——
const ghost = await page.evaluate(() => {
  const out = {};
  for (const w of ['automated', 'applicants', 'oversight']) {
    const el = [...document.querySelectorAll('.article .word')].find((x) => x.textContent.trim().toLowerCase() === w);
    out[w] = el ? el.className : 'missing';
  }
  return out;
});
check('没有被误标成已斩的词', Object.values(ghost).every((c) => c === 'missing' || !/\bmaster\b/.test(c)), JSON.stringify(ghost));

const pick0 = await page.locator('.picklist .pick').first().innerText();
check('文章卡片含总词数', pick0.includes('总词数'), pick0.split('\n').slice(0, 3).join(' | '));
check('全部篇目不直接展开正文', (await count('.article')) === 0);
const pickBorder = await page.evaluate(() => getComputedStyle(document.querySelector('.pick')).borderTopWidth);
check('全部篇目条目有边框', pickBorder === '1px', pickBorder);
const chipBox = await page.evaluate(() => {
  const c = document.querySelector('.pick .pick-status');
  if (!c) return null;
  const r = c.getBoundingClientRect(); const card = document.querySelector('.pick').getBoundingClientRect();
  return { left: Math.round(r.left - card.left), top: Math.round(r.top - card.top), pe: getComputedStyle(c).pointerEvents };
});
check('学习状态为左上角标签(非按钮)', !!chipBox && chipBox.left <= 20 && chipBox.top <= 20 && chipBox.pe === 'none', JSON.stringify(chipBox));
check('列表右侧无按钮式胶囊', (await count('.pick-stats .ratio-pill')) === 0);
// 固定编号: 每篇都有「第 N 篇」, 且与 data 里的 no 一致
const listNos = await page.locator('.pick .pt .no').allInnerTexts();
check('全部篇目每条都有固定编号', listNos.length === (await count('.pick')) && listNos.every((t) => /^第 \d+ 篇$/.test(t)), listNos.join(' / '));
await page.screenshot({ path: '.verify/v7-reading-pick.png' });

// —— 从全部篇目进入篇目, 编号沿用同一号, 返回应回到全部篇目 ——
await page.locator('.picklist .pick').first().click();
await page.waitForSelector('.reader-bar', { timeout: 8000 });
const readerNo = (await page.locator('.topbar h1 .h1-no').innerText()).trim();
check('阅读页沿用列表编号', readerNo === listNos[0], `${listNos[0]} vs ${readerNo}`);
await page.locator('.topbar button').filter({ hasText: '返回' }).click();
await page.waitForTimeout(500);
const segActive = await page.locator('.seg button.active').innerText();
check('返回回到全部篇目列表', segActive.includes('全部篇目') && (await count('.picklist .pick')) >= 1, segActive);

// —— 全词可点 + 超纲/变形 ——
await page.goto(BASE + '/#/reading/a8', { waitUntil: 'networkidle' });
await page.waitForSelector('.article .word', { timeout: 8000 });
check('换一篇文章后没有残留横划线', (await count('.article .word.cut')) === 0);
await page.waitForSelector('.article', { timeout: 8000 });
const allClick = await page.evaluate(() => {
  const text = document.querySelector('.article').innerText;
  const tokens = (text.match(/[A-Za-z]+(?:['\u2019][A-Za-z]+)?/g) || []).length;
  const spans = document.querySelectorAll('.article .word').length;
  return { tokens, spans };
});
check('文章内所有英文单词均可点击', allClick.spans === allClick.tokens, `${allClick.spans}/${allClick.tokens}`);
const basicCls = await page.evaluate(() => {
  const f = (t) => [...document.querySelectorAll('.article .word')].find((s) => s.textContent.toLowerCase() === t);
  const pick = (t) => { const el = f(t); return el ? { cls: el.className, cat: el.dataset.cat } : null; };
  return { a: pick('a'), had: pick('had'), of: pick('of'), and: pick('and'), people: pick('people'), person: pick('person') };
});
check('基础词 a 可点且不标超纲/不划线', !!basicCls.a && basicCls.a.cat === 'basic' && basicCls.a.cls.includes('plain'), JSON.stringify(basicCls.a));
check('基础词 of 优先归为基础词', !!basicCls.of && basicCls.of.cat === 'basic', JSON.stringify(basicCls.of));
check('基础词 and 优先归为基础词', !!basicCls.and && basicCls.and.cat === 'basic', JSON.stringify(basicCls.and));
// 「常用词」这一层已取消(它把 performance/applicant/oversight 也算成已斩), 现在这类词按超纲处理
check('people 不再被强制算「已斩」', !basicCls.people || basicCls.people.cat !== 'common', JSON.stringify(basicCls.people));
check('person 不再被强制算「已斩」', !basicCls.person || basicCls.person.cat !== 'common', JSON.stringify(basicCls.person));
// 日常基础词(people)已并入基础词层: 是「可斩的基础词」, 未斩时带下划线而非超纲
check('people 为基础词可斩(划线非已斩)', !!basicCls.people && basicCls.people.cat === 'daily' && /\bunder\b/.test(basicCls.people.cls), JSON.stringify(basicCls.people));
const classes = await page.evaluate(() => {
  const f = (t) => [...document.querySelectorAll('.article .word')].find((s) => s.textContent.toLowerCase() === t);
  const c = f('consumed'), a = f('algorithm');
  return { consumed: c ? { cls: c.className, cat: c.dataset.cat } : null, algorithm: a ? { cls: a.className, cat: a.dataset.cat } : null };
});
check('consumed 为变形词(有下划线, 标变形)', !!classes.consumed && classes.consumed.cls.includes('under') && classes.consumed.cat === 'variant', JSON.stringify(classes.consumed));
check('algorithm 为超纲可点(无下划线)', !!classes.algorithm && classes.algorithm.cls.includes('outline') && !classes.algorithm.cls.includes('under'), JSON.stringify(classes.algorithm));
// 点击超纲词 algorithm -> 浮卡显示超纲标签 + 释义
const algoEl = page.locator('.article .word', { hasText: 'algorithm' }).first();
const ab = await algoEl.boundingBox();
await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2);
await page.waitForSelector('.wordcard', { timeout: 4000 });
const algoCard = await page.locator('.wordcard').innerText();
check('超纲词浮卡含超纲标签与释义', algoCard.includes('超纲词') && algoCard.includes('算法'), algoCard.replace(/\n/g, ' | '));
await page.locator('.reader-meta').click({ position: { x: 6, y: 6 } });
await page.waitForTimeout(150);
await page.waitForSelector('.wordcard', { state: 'detached', timeout: 3000 });

// ambiguity(a7) 变形 -> 映射大纲词 ambiguous, 显示原词意
await page.goto(BASE + '/#/reading/a7', { waitUntil: 'networkidle' });
await page.waitForSelector('.article', { timeout: 8000 });
const amb = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.article .word')].find((s) => s.textContent.toLowerCase() === 'ambiguity');
  return el ? { cls: el.className, cat: el.dataset.cat } : null;
});
check('ambiguity 识别为变形词(有下划线)', !!amb && amb.cls.includes('under') && amb.cat === 'variant', JSON.stringify(amb));
const ambEl = page.locator('.article .word', { hasText: 'ambiguity' }).first();
const mb2 = await ambEl.boundingBox();
await page.mouse.click(mb2.x + mb2.width / 2, mb2.y + mb2.height / 2);
await page.waitForSelector('.wordcard', { timeout: 4000 });
const ambCard = await page.locator('.wordcard').innerText();
check('ambiguity 浮卡标变形词/斩/原词意', ambCard.includes('变形词') && ambCard.includes('斩') && ambCard.includes('模糊') && !ambCard.includes('超纲词'), ambCard.replace(/\n/g, ' | '));
await page.locator('.reader-meta').click({ position: { x: 6, y: 6 } });
await page.waitForTimeout(150);
await page.waitForSelector('.wordcard', { state: 'detached', timeout: 3000 });
// 变形词 converges -> 浮卡标「变形词」+ 原形释义
const cvEl = page.locator('.article .word', { hasText: 'converges' }).first();
const cvBox = await cvEl.boundingBox();
await page.mouse.click(cvBox.x + cvBox.width / 2, cvBox.y + cvBox.height / 2);
await page.waitForSelector('.wordcard', { timeout: 4000 });
const cvCard = await page.locator('.wordcard').innerText();
check('变形词 converges 标变形/带斩', cvCard.includes('变形词') && cvCard.includes('converge') && cvCard.includes('斩') && !cvCard.includes('超纲词'), cvCard.replace(/\n/g, ' | '));
await page.locator('.reader-meta').click({ position: { x: 6, y: 6 } });
await page.waitForTimeout(150);
await page.waitForSelector('.wordcard', { state: 'detached', timeout: 3000 });

// 基础词 a -> 浮卡标「基础词」
const aEl = page.locator('.article .word', { hasText: /\ba\b/ }).first();
const aBox = await aEl.boundingBox();
await page.mouse.click(aBox.x + aBox.width / 2, aBox.y + aBox.height / 2);
await page.waitForSelector('.wordcard', { timeout: 4000 });
const aCard = await page.locator('.wordcard').innerText();
check('基础词 a 浮卡标「基础词」且「已斩」', aCard.includes('基础词') && aCard.includes('已斩'), aCard.replace(/\n/g, ' | '));
await page.locator('.reader-meta').click({ position: { x: 6, y: 6 } });
await page.waitForTimeout(150);
await page.waitForSelector('.wordcard', { state: 'detached', timeout: 3000 });

// 已斩大纲词 -> 浮卡显示「已斩」而非斩/学习中; 且可「不熟，加回」
const mEl = page.locator('.article .word.master').first();
const mBox = await mEl.boundingBox();
const mId = await page.evaluate(() => Number(document.querySelector('.article .word.master').dataset.id));
await page.mouse.click(mBox.x + mBox.width / 2, mBox.y + mBox.height / 2);
await page.waitForSelector('.wordcard', { timeout: 4000 });
const mCardLines = (await page.locator('.wordcard').innerText()).split('\n');
check('已斩大纲词浮卡显示「已斩」', mCardLines.includes('已斩') && !mCardLines.includes('学习中') && !mCardLines.some((l) => l.trim() === '斩'), mCardLines.filter(Boolean).join(' | '));
check('已斩词浮卡提供「不熟，加回」', mCardLines.some((l) => l.includes('不熟，加回')), mCardLines.filter(Boolean).pop());
await page.locator('.wordcard [data-act="revert"]').click();
await page.waitForTimeout(400);
const reverted = await page.evaluate((id) => {
  const s = JSON.parse(localStorage.getItem('cet.study.v1'));
  const el = document.querySelector(`.article .word[data-id="${id}"]`);
  return { status: s.statuses[id] || 'new', cls: el ? el.className : '', open: !!document.querySelector('.wordcard') };
}, mId);
check('加回后回到未学并重新划线', reverted.status === 'new' && /\bunder\b/.test(reverted.cls) && !reverted.open, JSON.stringify(reverted));
// 再斩回来, 恢复快照不影响后续断言
const mBox2 = await page.locator(`.article .word[data-id="${mId}"]`).boundingBox();
await page.mouse.move(mBox2.x + 2, mBox2.y + 2);
await page.mouse.down();
await page.mouse.move(mBox2.x + 2 + 55, mBox2.y + 2 + 40, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);
const reslashed = await page.evaluate((id) => JSON.parse(localStorage.getItem('cet.study.v1')).statuses[id], mId);
check('加回的词可以再斩', reslashed === 'mastered', String(reslashed));
await page.waitForSelector('.wordcard', { state: 'detached', timeout: 3000 }).catch(() => {});

// —— 词库 ——
await page.goto(BASE + '/#/library', { waitUntil: 'networkidle' });
await page.waitForSelector('.seg', { timeout: 8000 });
const segTxt = await page.locator('.seg button').allInnerTexts();
check('词库标签顺序', segTxt.length === 4 && /^未学习/.test(segTxt[0]) && /^学习中/.test(segTxt[1]) && /^全部/.test(segTxt[2]) && /^已斩/.test(segTxt[3]), segTxt.join(' | '));

await page.selectOption('.sortsel', 'freq');
await page.waitForTimeout(300);
const firstFreq = await page.locator('.wcard .word').first().innerText();
await page.selectOption('.sortsel', 'order');
await page.waitForTimeout(300);
const firstOrder = await page.locator('.wcard .word').first().innerText();
check('排序: 重要程度提升高频词', firstFreq !== firstOrder, `freq=${firstFreq} order=${firstOrder}`);

await page.locator('.libtools .iconbtn').nth(1).click();
await page.waitForSelector('.wrow', { timeout: 5000 });
check('横条视图渲染', (await count('.wrow')) > 0, `${await count('.wrow')} 行`);
await page.screenshot({ path: '.verify/v8-library-list.png' });
await page.locator('.libtools .iconbtn').nth(0).click();
await page.waitForSelector('.wcard', { timeout: 4000 });

await page.fill('.searchbar .q', 'mayor');
await page.waitForTimeout(400);
const wcards = page.locator('.wcard');
check('搜索 mayor 出现卡片', (await wcards.count()) >= 1, `${await wcards.count()} 张`);
await wcards.first().click();
await page.waitForTimeout(450);
const mayorDef = await page.locator('.wcard .wface.back .def').first().innerText();
check('mayor 释义非空', mayorDef.includes('市长'), mayorDef.slice(0, 40));
await page.fill('.searchbar .q', '');
await page.waitForTimeout(400);

const flipsBefore = await count('.wcard.flip');
await page.locator('.wcard:not(.flip) .wface.front [data-act="speak"]').first().click();
await page.waitForTimeout(200);
const flipsAfter = await count('.wcard.flip');
check('卡片正面发音可点且不触发翻卡', flipsBefore === flipsAfter, `flipped ${flipsBefore} -> ${flipsAfter}`);

// —— 听读 ——
await page.click('.tabs a[data-tab="listening"]');
await page.waitForSelector('.picklist .pick', { timeout: 8000 });
const listenCard = await page.locator('.picklist .pick').first().innerText();
check('听读卡片含总词数', listenCard.includes('总词数'));
await page.locator('.picklist .pick').first().click();
await page.waitForSelector('.sentence', { timeout: 8000 });
check('听读逐句渲染', (await count('.sentence')) >= 10, `${await count('.sentence')} 句`);

// —— 我的: 登录 -> 学习记录(去重 + 双状态) ——
await page.click('.tabs a[data-tab="me"]');
await page.waitForSelector('.mtitle', { timeout: 8000 });
const user = 't' + String(Date.now()).slice(-7);
await page.fill('#m-user', user);
await page.fill('#m-pass', 'Secret123!');
await page.click('#m-switch');
await page.waitForTimeout(150);
await page.click('#m-submit');
await page.waitForSelector('.mname', { timeout: 8000 });
await page.screenshot({ path: '.verify/v9-me.png' });
check('登录后显示个人主页', (await page.locator('.mname').innerText()) === user);

// —— 我的 · 斩词日历(一级界面) ——
check('我的页有斩词日历', (await count('.mcal')) === 1);
check('日历标出今天', (await count('.mcal-cell.today')) === 1);
const calSum = await page.locator('.mcal-sum').innerText();
check('日历显示本月统计', /本月 \d+ 个 · 打卡 \d+ 天 · 连续 \d+ 天/.test(calSum), calSum);
const calMon0 = await page.locator('.mcal-mon').innerText();
await page.locator('#cal-prev').click();
await page.waitForTimeout(150);
const calMon1 = await page.locator('.mcal-mon').innerText();
check('日历可翻到上个月', calMon0 !== calMon1, `${calMon0} -> ${calMon1}`);
await page.locator('#cal-next').click();
await page.waitForTimeout(150);
check('当月时下月按钮禁用', await page.locator('#cal-next').isDisabled());
check('今日已斩计入日历(水位有高度)', (await count('.mcal-cell[data-day]:not(.dry)')) >= 1);
const fills = await page.evaluate(() => [...document.querySelectorAll('.mcal-cell[data-day]:not(.dry)')]
  .map((c) => parseFloat(c.style.getPropertyValue('--fill'))));
check('水位按当月最高日归一(最高那天是满杯)', fills.length >= 1 && Math.max(...fills) === 100 && fills.every((f) => f > 0 && f <= 100), fills.join(','));
const calShadow = await page.evaluate(() => ['.mcal-cell.today', '.mcal-cell.sel']
  .map((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).boxShadow : 'none'; }));
check('日历不给某日加边框', calShadow.every((v) => v === 'none'), JSON.stringify(calShadow));

await page.click('#m-records');
await page.waitForSelector('.hlist .hrec', { timeout: 8000 });
const recTexts = await page.locator('.hlist .hrec').allInnerTexts();
check('学习记录角标为 学习完成/学习中', recTexts.some((t) => t.includes('学习完成') || t.includes('学习中')), `${recTexts.length} 条记录`);
const titles = [];
for (const c of await page.locator('.hlist .hrec').all()) titles.push((await c.locator('.ht').innerText()).split('学习')[0]);
check('学习记录按文章去重', new Set(titles).size === titles.length, `${titles.length} 条 / ${new Set(titles).size} 去重`);
await page.screenshot({ path: '.verify/v10-records.png' });

// —— 横线按「文章 + 单词」永久保留: 刷新后仍在, 别的文章没有 ——
await page.goto(BASE + '/#/reading/a1', { waitUntil: 'networkidle' });
await page.waitForSelector('.article .word.under', { timeout: 10000 });
const w0 = page.locator('.article .word.under').first();
await w0.scrollIntoViewIfNeeded();
const wb0 = await w0.boundingBox();
await page.mouse.move(wb0.x + 3, wb0.y + 3);
await page.mouse.down();
await page.mouse.move(wb0.x + 58, wb0.y + 43, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);
const cutNow = await count('.article .word.cut');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.article .word', { timeout: 10000 });
const cutReload = await count('.article .word.cut');
check('横线刷新后仍然保留', cutNow >= 1 && cutReload >= cutNow, `斩后 ${cutNow} / 刷新后 ${cutReload}`);
const srcOf = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('cet.study.v1'));
  return [...new Set(Object.values(s.slashArt || {}))];
});
check('斩词记录了来源文章', srcOf.includes('a1'), JSON.stringify(srcOf));
await page.goto(BASE + '/#/reading/a2', { waitUntil: 'networkidle' });
await page.waitForSelector('.article .word', { timeout: 10000 });
check('别的文章不带横线', (await count('.article .word.cut')) === 0);

// —— 我的 · 日历点日期看当天数量 ——
await page.goto(BASE + '/#/me', { waitUntil: 'networkidle' });
await page.waitForSelector('.mcal', { timeout: 8000 });
const sel0 = await page.locator('.mcal-sel').innerText();
check('日历默认显示今天的数据', /月 \d+ 日/.test(sel0), sel0);
await page.locator('.mcal-cell[data-day$="-01"]').first().click();
await page.waitForTimeout(150);
const sel1 = await page.locator('.mcal-sel').innerText();
check('点日期切换当天文案', sel1 !== sel0 && /1 日/.test(sel1), sel1);
const calBox = await page.locator('.mcal').boundingBox();
check('日历高度已压缩', calBox.height < 320, Math.round(calBox.height) + 'px');

// —— 斩词音效: 用 assets/sfx/sword.mp3 采样 ——
const sfxReady = await page.evaluate(async () => {
  const fx = await import('/src/fx.js');
  await fx.preloadSlash();
  return fx.slashSampleReady();
});
check('斩词音效用的是 mp3 采样', sfxReady === true, String(sfxReady));

check('无控制台/页面错误', errors.length === 0, errors.join('; '));
console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
