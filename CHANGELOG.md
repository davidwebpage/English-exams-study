# 更新日志

本项目所有值得记录的变更都在这里。格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> **说明**：0.1.0 – 0.5.0 是首次提交到 GitHub（commit `45319c8`，2026-10-26 21:53）之前的开发阶段，
> 在 git 上合并为一个初始提交；这里按功能阶段拆开记录，便于回溯"当时的想法是什么"。
> 0.6.0 起每一次功能迭代都有独立的 commit。

---

## [0.7.0] — 2026-10-26

真账号体系。这一版把「本地假账号」换成 Cloudflare Worker 认证，进度首次做到按账号隔离。

### 新增

- **Worker 账号接口**：`POST /auth/register`、`/auth/login`、`/auth/logout`、`/auth/password`、`/auth/rename`，配合 `GET /state`、`PUT /state`（Bearer token 鉴权）。
- **进度按账号隔离**：localStorage 键从全局 `cet.study.v1` 改为 `cet.study.v1:<用户名>`，未登录用 `cet.study.v1:guest`。
- **旧进度一次性迁移**：改版前存在全局键里的进度，会被**第一个登录的账号**自动接管并删除旧键，之后的账号一律是干净的 0。
- **会话机制**：登录后只在本机保存 `{user, token}`（`cet.session.v2`），token 有效期 30 天。

### 变更

- **`auth.js` 重写**：不再在本地保存密码或密码哈希，改为调用 Worker 接口；新增 `scope()` 作为进度命名空间。
- **`store.js`**：`init(scope)` 接收命名空间；新增 `switchScope()`；`blankState()` 里 `seeded` 默认为 `true`。
- **`sync.js`**：改用 Bearer token 请求 `/state`；**游客完全不联网**。
- **登录/注册/登出/改名后整页重载**，确保切换命名空间时状态干净。
- 密码存放位置：Cloudflare KV 的 `user:<用户名>`，加盐 SHA-256。浏览器端不再持有任何密码材料。

### 移除

- **不再自动灌百词斩种子**：`data/mastered.json` 里的 48 个词不再自动置为「已斩」。未登录与新注册账号一律从 0 开始。
- 本地账号表 `cet.users.v1`、旧会话 `cet.session.v1` 不再使用。

### 修复

- 修复「登录与否跟进度无关」的架构问题——旧实现的 `auth.authed()` 只控制界面显示，没有参与决定显示谁的进度。

### 待办

- Worker 新代码需在 Cloudflare 控制台重新粘贴部署后，账号功能才在前端生效。

---

## [0.6.0] — 2026-10-26

上线。从「本地能跑」到「手机随时能开」。

### 新增

- **Git 仓库与 GitHub 远端**：`davidwebpage/English-exams-study`（public）。
- **Cloudflare Pages 部署**：连 GitHub 自动部署，线上地址 `https://english-7xa.pages.dev`，每次 push 约 30 秒生效。
- **多设备同步**：Cloudflare Worker（`english-study-sync`）+ KV namespace（绑定名 `STATE`）。
- `.nojekyll`：确保 Pages 原样托管静态文件。

### 变更

- 远端仓库名从 `Engligh-exams-study` 更正为 `English-exams-study`（初次手误拼写）。
- Pages 项目名从 `engligh` 改为 `english`，重建后子域 `english` 已被占用，Cloudflare 自动分配 `english-7xa`。

### 修复

- **Worker 缺 CORS 与 OPTIONS 预检**：页面在 `pages.dev`、接口在 `workers.dev` 属跨域，请求带自定义头必然触发预检。原代码返回 405，导致同步**静默失败**（表面看是"没同步"，实际请求根本没发出去）。
- **首次开启同步不会上传**：远程为空时若用户不做任何操作，本地进度永远不会推上去。改为远程为空时自动首推一次。
- **网络不通时首屏白屏**：`boot()` 里 `await initSync` 会阻塞渲染，而国内直连 `workers.dev` 容易挂起。给所有同步请求加分级超时（3s / 5s / 8s）+ AbortController。
- `.gitignore` 补充 `__pycache__/`、`*.pyc`。

### 文档

- README 补充 Cloudflare Pages 部署步骤、KV 绑定注意事项、新版控制台路径（Workers & Pages 在「计算」下，KV 在「存储和数据库」下）。

---

## [0.5.0] — 2026-10-26

词形还原与释义补全，目标是"文章里点任何词都不出现「暂无释义」"。

### 新增

- **不规则变化表补全**：`taken / known / grown / heard / brought / led / eaten / spoken / shaken / worn / woven / written / rebuilt / crises / analyses` 等，并与 Python 校验脚本 `check_articles.IRREG` 对齐（此前 JS 侧缺 `caught / begun / fallen / sold`）。
- **比较级/最高级还原**：`-er / -est`，含 `y→i`（`busiest→busy`）与双写；**仅当目标词词性是 adj/adv 才认**，否则 `career` 会被误判成 `care` 的比较级。
- **更多派生规则**：`-ied→y`（`carried→carry`）、`-ves→f/fe`（`shelves→shelf`）、`ally→al`（`automatically→automatic`，顺序须在 `ly` 之后，否则误伤 `finally→final`）。
- **所有格剥离**：`'s` / `’s` 先去掉再查（`candidate's→candidate`）。
- `data/extra-words.json` 从 27 词扩到 **79 词**，补齐新东方词表跳过的常用实词（`parent / patient / pay / pass / perform / park / app / laptop / patience / migrant / mainstream / risky / warranty / supplier / workforce` 等），音标用 `eng_to_ipa` 自动补。

### 修复

- **浏览器缓存导致改动"看不见"**：ES module 的 URL 不带版本号，`serve.py` 只对 `.json` 设 no-store。改为所有响应 `Cache-Control: no-store`，并给 `index.html` 的资源加 `?v=` 版本号 + `window.__BUILD__`，「我的」页底部显示版本号，一眼确认是否旧缓存。
- 版本号在多处被改得不一致（`styles.css` 是 `-8`，`main.js` 是 `-7`），统一管理。

---

## [0.4.0] — 2026-10-26

斩词音效，来回迭代了四版。

### 变更

- **v1 合成「剑 + 闪电」**：四层 Web Audio 合成——刀风（噪声 bandpass 5400→680Hz）、金属锐响（三非谐 triangle）、闪电（噪声 highpass + 46Hz 方波抖动）、低频冲击（sine 130→46Hz）。出口加 `DynamicsCompressor` 防削波。
- **v2 纯剑斩**：去掉闪电层与低频砸击，改为破风（bandpass **Q 0.8**，Q 高了会变口哨）+ 刃口厚度 + 钢刃锐鸣（4 个非谐分音）+ 刃口瞬态。
- **v3 只留挥剑破风**：金属分音、爆点、低频全删，只剩空气噪声两层，起音改平滑（8ms 硬起音会带「咔」味）。
- **v4 改用真实采样**：用户提供的 mp3 裁成 `assets/sfx/sword.mp3`，用 `OfflineAudioContext` 解码、`AudioBufferSourceNode` 播放（可重叠，快斩不打架），素材未就绪时回退合成音。素材有声段只有 0.06–0.54s，播放截 `0.02–0.58s` 并末尾 5ms 淡出防爆音。

### 经验

- 挥砍声的关键是 **Q 值低 + 平滑起音 + 长尾巴**；堆金属分音只会变成"刀剑相击"，不是"挥剑"。

---

## [0.3.0] — 2026-10-26

斩词日历与「本篇横划线」。

### 新增

- **斩词日历**（「我的」一级界面）：每天一个「水杯」，水位按**当月斩得最多的那天**归一（那天满杯）；水面双层正弦波（`background-position-x` 循环动画，28px/19px 两个周期、方向相反），`prefers-reduced-motion` 时停止。
- **点日期看当日数量**：「10 月 26 日 · 斩了 7 个词」，默认选中今天；日期不加边框，选中只加粗字号。
- **可翻月** + 底部汇总「本月 N 个 · 打卡 D 天 · 连续 S 天」。
- **本篇横划线**：在这篇文章里斩掉的词带一条 1.5px 细横线（字色压灰、线不遮字母），且**永久保留**——刷新、重进本篇都还在；同一个词出现在别的文章里则没有标记。数据记在 `slashArt`（词 → 来源文章）。
- 未登录也能看日历（数据本就在本地，不该被登录拦住）。

### 变更

- 日历格子从正方形（≈45px）压到 `height:29px`，整块高度 360 → **288px**。
- 日期移到格子顶部并固定深灰，避免白字阈值把水线穿过数字时切成两半。

### 修复

- **统计恒为 0**：`store.setStatus` 先赋值再判断 `!== 'mastered'`，条件永远为假，`slashedByDay` 从未累加。改为以 `slashLog = {词id: 'YYYY-MM-DD'}` 为唯一真源，`slashByDay()` 聚合。
- **时区偏移**：`today()` 原用 `toISOString()`（UTC），中国时区凌晨斩词会记到前一天。改为本地日期计算。
- 给空水杯加 class `empty` 撞上全局 `.empty` 样式（40px padding），格子被撑到 96px、日历 623px 高。改名 `dry` 解决。

---

## [0.2.0] — 2026-10-26

阅读体验修正 + 词库重建。

### 新增

- **篇目固定编号**：`articles.json` 每篇写入 `no` 字段，列表、阅读页、听读、学习记录显示同一个「第 N 篇」，刷新换入口都不变。
- **「不熟，加回」**：已斩词在浮卡里有琥珀色按钮，一点退回未学、重新出现下划线，可再斩一次。
- **已学习可撤销**：再点一次即撤销，可反复切换。

### 变更

- 全部篇目列表：学习状态改为左上角纯标签（`pointer-events: none`），右侧统计从胶囊改纯文字。
- 返回时回到进入时的那个列表（模块级 `lastListMode`），不再被默认模式拉回「当日推送」。
- 词库从 5518 扩到 **6325 词**：解析新东方四级/六级乱序版 PDF，合并 807 个缺失词（id 从 6001 起，原有 id 不变）。

### 移除

- **取消「常用词」层**：原 `common-words.json` 的 138 个词被强制写成「已斩」且不可斩，导致 `automated / applicants / oversight` 未学却显示已斩。文件清空并归档为 `common-words.retired.json`，`store.init` 加一次性迁移清掉 104001–104199 的孤儿状态。

### 修复

- `library.js` 的 `byAlphabet` 原用区分大小写的比较，`X-ray` 被排到词库第一个；改为小写比较。
- PDF 解析的两处错位：四级表序号行与单词行不等高，改用**注音列**当锚；六级表词与释义粘连（`delayvi.推迟`），按「找第一个 `.` 再回退 1–4 字母凑词性」切分。

---

## [0.1.0] — 2026-10-26

初版。基于 CET 全大纲的阅读式背单词工具。

### 新增

- **阅读**：「当日推送 / 全部篇目」两级结构，每天确定性随机一篇；文章内每个英文单词可点击看释义、音标、发音；对角滑动即可「斩」掉完全掌握的词（剑斩音效 + 粒子特效）；「中英对照」左右对照译文。
- **四层词汇分类**：大纲词（未斩划线、可斩）、变形词（映射回原形，同状态）、基础词（语法词恒已斩、日常基础词可斩）、超纲词（标注但不进斩词）。
- **词库**：状态分页（未学习 / 学习中 / 全部 / 已斩）、搜索、排序（顺序 / 倒序 / 乱序 / 重要程度）、卡片与横条两种展示；卡片正面即可发音。
- **听读**：整篇 TTS 朗读，当前句/当前词同步高亮，语速可调。
- **我的**：登录/注册、学习记录（保留"当时"掌握快照可回放续斩）、设置（生词比例、听读语速）。
- **数据**：`words.json`（6325 词，含音标与释义）、`articles.json`（50 篇 CET6 风格语料，每篇 310–430 词）、`wordfreq.json`（离线词频）、`basic-words.json`、`extra-words.json`。
- **发音双通道**：优先 `audio/<word>.mp3`（`edge-tts` 生成），缺失时回退浏览器内置语音。

### 基础设施

- 纯静态 ES module，`scripts/serve.py` 本地服务（默认 8321，局域网手机可访问）。
- `scripts/verify.mjs` 端到端断言脚本（Playwright），功能回归从 47 条一路累积到 72 条。
- 语料构建与校验：`build_words.py`、`build_articles.py`、`check_articles.py`（超纲率 ≤3%）、`build_corpus.py`（AI 批量扩库）。

---

## 版本号约定

- 改界面/交互/数据结构 → 第二位（0.**x**.0）
- 只修 bug / 只改文档 → 第三位（0.7.**x**）
- 同步更新 `index.html` 里的 `?v=` 与 `window.__BUILD__`
