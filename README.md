# CET 词汇斩（CET Study）

基于 CET 全大纲（6325 词 = 新东方四级 4440 + 六级 2072 合并去重后）的网页学习工具：在 CET6 风格阅读中记忆单词，已斩词正常显示、未斩词带下划线；点词看释义发音，对角滑词即可"斩"掉已经完全掌握的词。

## 运行

项目是纯静态 ES 模块，需要一个 HTTP 服务器（直接打开 HTML 会被浏览器拦截模块加载）：

```bash
python scripts/serve.py          # 默认 8321 端口，局域网手机可访问
python scripts/serve.py 9000     # 自定义端口
```

打开 `http://localhost:8321`。

## 功能模块

- 阅读：顶部「当日推送 / 全部篇目」两级结构。**每篇文章有固定编号（第 N 篇，随 `data/articles.json` 的 `no` 字段写入）**，列表、阅读页、听读、学习记录里显示的都是同一个号，刷新、换入口都不变。当日推送每天确定性随机一篇、进入即直接展示文章正文；全部篇目为列表，附生词比例滑块（5%-80%，可选筛选用）。**文章内每个英文单词都可点击查看释义**，浮卡显示清晰的类别与状态标签。四层分类：大纲词（未斩划线、可手势/按钮斩）、变形词（=大纲词原形同状态，未斩划线、可斩，卡片标注「变形词」+原形，如 `flexibility`→`flexible`、`consumed`→`consume`）、基础词（两类：语法词如 `the`/`a`/`an`/`had` 恒为「已斩」、不划线；日常基础词如 `people`/`online`/`email` 不是恒已斩——未斩带下划线、可手动斩、计入进度）、超纲词（学术/生僻词如 `algorithm`，标注「超纲」、不下划、不进斩词）。「已学习」一键把全篇生词转入学习中并把该篇在记录中标记为学习完成，**再点一次即撤销、可反复切换**；**在这篇文章里斩掉的词会带一条细横划线（字色压灰、线不遮字母）表示「划掉了」，并且永久保留——刷新、重进这篇文章都还在；同一个词出现在别的文章里没有任何额外标记**（记在 `slashLog`/`slashArt` 里：词 → 斩词日期 + 出自哪篇文章，撤销已斩会一并清掉）；**已斩的词若发现其实不熟，点开浮卡有「不熟，加回」，一点即退回未学、重新出现下划线，可以再斩一次**；「中英对照」左右对照译文；文章卡片与页头标注总词数。全部篇目列表里，每条只在左上角显示学习状态标签（学习中 / 已学习），右侧统计为纯文字、不做按钮式胶囊；从某篇点「返回」会回到进入时的那个列表（从全部篇目进来的就回全部篇目）。
- 词库：状态分页（未学习 / 学习中 / 全部 / 已斩）、搜索、排序（顺序 / 倒序 / 乱序 / 重要程度，词频为离线词频表）、展示方式（卡片 / 横条）自由切换；卡片正面即可发音；词形还原保证 `consumed`、`retirement` 等变体与原型视为同一词。
- 我的：本地注册/登录；一级界面有**斩词日历**：每个日期是一个「杯子」，绿色水位按「当月斩得最多的那一天」归一（那天是满杯，其余按比例），水面是两条方向相反、速度不同的正弦波（每格约 2 个波峰）；日期不加任何边框，选中某天只是把字号加粗并在下方显示当日数量；点任意一天，下方立刻显示「10 月 26 日 · 斩了 7 个词」；可翻月，底部给「本月 N 个 · 打卡 D 天 · 连续 S 天」。数据按「词 → 斩词日期」记录（`slashLog`），撤销已斩会自动从当天计数里扣掉；连续天数以今天或昨天为终点往前数。此外内含「学习记录」（今日已斩/已斩单词/连续天数统计 + 历史文章去重展示，保留"当时"掌握快照可回放续斩，篇目带 学习完成/学习中 角标）与设置（生词比例、听读语速）。
- 听读：整篇 TTS 朗读，当前句/当前词同步高亮，语速可调，选文页标注总词数。

## 数据

- `data/words.json`：6325 词（单词/音标/词性/中文释义）。前 5518 词由 `scripts/build_words.py` 从原始 xls 清洗生成（剔除人名/地名注记，不会误清空释义；例如 `mayor` → `n. 市长`），后 807 词由 `scripts/merge_pdf_words.py` 从新东方四级/六级乱序版 PDF 合并进来（id 从 6001 起，原有 id 不变，学习进度不受影响）。该词表以**原形词**收词（有 `retire`，无 `retirement`）；前端标注会自动做词形还原，文中 `retirement`/`advertising`/`consumed` 会映射回词库原形词参与学习。
- `data/wordfreq.json`：离线词频/重要度排序（文章语料复现 + 高频考点词加成，功能词后置），供词库「重要程度」排序。
- `data/mastered.json`：百词斩已斩词清单（**2026-10-26 起不再自动灌入**，仅作历史数据保留）。
- `data/basic-words.json`：基础词表（321 词，分两类）：202 个语法功能词（`a/an/the`、代词、助动词、介词、连词）点击显示释义并恒为「已斩」、不进斩词统计；另有 119 个日常基础词（people/online/email/performance 等，2026-10-26 由原「常用词」层并入）**不是恒已斩**：未斩带下划线、可手动斩、计入进度。原「常用词」层已取消，存档在 `data/common-words.retired.json`。
- `data/extra-words.json`：超纲词表（**79 词**，含 `algorithm` 这类学术词，也含 `pay`、`parent`、`patience`、`app` 这类新东方两份表未收的基础实词），**每个超纲词都有音标和中文释义**；阅读中标注「超纲」；能还原成大纲原形的词（如 `flexibility`→`flexible`、`consumed`→`consume`）不在此表，由运行时词形还原归为变形词——还原规则覆盖复数（含 `-ies/-ves`）、过去式/过去分词（含不规则表）、`-ing`、比较级/最高级（`deepest`→`deep`、`busiest`→`busy`）、所有格（`candidate's`）与常见派生后缀。
- `data/articles.json`：文章语料（当前 50 篇，每篇约 310-430 词、中英对照，风格贴近 CET6 阅读），全部通过「超纲词 ≤3%」校验。运行时自动把文中命中词库的单词标注为学习对象，因此**无需手动标注**。新增文章在 `data/articles.src.txt` 手写源里追加后跑 `scripts/build_articles.py` 重建，再用 `scripts/check_articles.py` 校验；AI 规模化可用 `scripts/build_corpus.py`。
- 进度存浏览器 localStorage（键 `cet.study.v1`）。

**初始进度为 0**：不再自动把 `mastered.json` 灌成已斩。未登录的游客、以及新注册的账号，一律从空白开始（见下文「账号与同步」）。

## 语音

- 发音双通道：优先播放 `audio/<word>.mp3`（需要先生成），缺失时回退浏览器内置英文语音。
- 生成 mp3（音色接近 CET6 听力女声，如 `en-US-JennyNeural`）：

```bash
pip install edge-tts
python scripts/generate_audio_edge_tts.py            # 全部词
python scripts/generate_audio_edge_tts.py --limit 50 # 先试 50 个
```

脚本会写入 `data/audio.index.json`，前端据此决定走 mp3 还是回退。

## 上线

静态站点可直接部署到任意静态托管（Cloudflare Pages / Vercel / GitHub Pages），无需构建。

仓库：<https://github.com/davidwebpage/English-exams-study>，默认分支 `main`，根目录即站点根。

**Cloudflare Pages（当前线上环境）**

线上地址：<https://english-7xa.pages.dev>（项目名 `english`；`english` 子域被别人占用，Cloudflare 自动加了 `-7xa` 后缀，域名固定后不可改）

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → **Connect to Git**，授权 GitHub 并选本仓库。
2. 构建设置全部留空：Framework preset = `None`，Build command = 空，Build output directory = `/`。
3. Save and Deploy，约 30 秒出线上地址。本项目实际使用项目名 `english`。注意 **Pages 项目改名不会改变 `*.pages.dev` 子域名**——子域在创建那一刻就固定了，想换只能删项目重建。

之后每次 `git push` 到 `main` 都会自动重新部署（约 30 秒）。手机上用浏览器"添加到主屏幕"，体验接近原生 App。

> 新版控制台把 Workers & Pages 收在左侧「计算」下，没有独立一级入口；KV 在「存储和数据库 → Workers KV」。直达链接：`https://dash.cloudflare.com/?to=/:account/workers-and-pages`。

> **路径注意**：代码里所有资源都是相对路径（`./data/...`、`./src/...`）。用 `*.pages.dev` 根域名访问时天然没问题；但如果以后换到子路径（如 GitHub Pages 的 `/English-exams-study/`），也照样能跑，**前提是别改成 `/data/...` 这种绝对路径**。

**GitHub Pages（备选）**

仓库 **Settings → Pages → Source 选 "Deploy from a branch" → Branch 选 `main` / `/ (root)` → Save**，地址为 `https://davidwebpage.github.io/English-exams-study/`。

**其他**

- 注意事项：`data/words.json`（约 858KB）与音频目录较大，正式部署前建议开启压缩/Cache；本仓库自带 `serve.py` 用于本地调试。

## 日常迭代

```bash
python scripts/serve.py      # 本地看效果（8321 端口）
git add -A && git commit -m "说明这次改了什么"
git push                     # 推上去，Cloudflare Pages 自动更新
```

> 改了 `src/` 里的 JS/CSS 之后，记得同步把 `index.html` 里的 `?v=20261026-11` 和 `window.__BUILD__` 版本号改掉，否则浏览器/CDN 会用缓存里的旧文件，看起来像"改动没生效"。


## 账号与同步

**账号是真账号，走 Cloudflare Worker 认证**，不再是本地假账号。

- **未登录（游客）**：可用，进度只存本机，已斩从 0 开始，不联网。
- **登录后**：进度按账号存在 KV（`state:<用户名>`），多设备共享同一份。
- **新注册账号**：从 0 开始，不继承任何其他账号的进度。
- **旧版本进度**：改账号体系前存在全局键 `cet.study.v1`。**第一个登录的账号**会自动接收这份旧进度并删除旧键（`store.js` 的 `loadScope()`），之后其他账号都是干净的 0。

### 服务端接口（`worker/sync.js`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | `{username, password}` → `{token, user}` |
| POST | `/auth/login` | `{username, password}` → `{token, user}` |
| POST | `/auth/logout` | Bearer token，作废会话 |
| POST | `/auth/password` | `{oldPassword, newPassword}` |
| POST | `/auth/rename` | `{newUsername}`，连同进度一起改名 |
| GET | `/state` | Bearer token，取该账号进度 |
| PUT | `/state` | Bearer token，覆盖该账号进度 |

KV 键：`user:<用户名>`（salt + hash）、`state:<用户名>`（进度快照）、`session:<token>`（30 天 TTL）。

### 部署 Worker

1. **建 KV**：Dashboard → **存储和数据库 → Workers KV** → Create namespace。本项目用 `english`。
2. **建 Worker**：命名 `english-study-sync`，把 `worker/sync.js` **全文替换**进去，Deploy。
3. **绑 KV**：该 Worker → 设置 → 绑定 → 添加 → KV 命名空间，**变量名称必须正好是 `STATE`**（大写，代码里写死的）。
4. 地址填进 `index.html` 的 `window.__SYNC__.url`；置 `__SYNC__ = null` 则退回纯本地。

### 几个必须知道的技术点

- **CORS 不能省**：页面在 `xxx.pages.dev`、接口在 `xxx.workers.dev`，跨域；请求带 `Authorization` 头会触发 `OPTIONS` 预检。`worker/sync.js` 已返回完整 `access-control-*` 并放行 `OPTIONS`，少了这步同步会**静默失败**（看着像没同步，其实请求根本没发出去）。
- **密码哈希用单次加盐 SHA-256**：Workers 免费版每请求只有 10ms CPU，PBKDF2 十万次迭代必然超时。对"背单词进度"这类数据够用；要更强得换成付费计划或在客户端预算慢哈希。
- **同步是整体覆盖、后写赢**：别两台设备同时斩词。切设备前停 2 秒，等当前设备的 1.5s 防抖推送完成。
- **localStorage 按域名隔离**：`localhost:8321` 和线上域名是两个独立存储；换域名时进度靠"登录 + 云端同步"搬运，不是自动带过去。


## 待扩展

- 语料规模：当前 50 篇；新文章走 `data/articles.src.txt` + `scripts/build_articles.py`（自动校验超纲 ≤3%），或按 design.md 用 `scripts/build_corpus.py` AI 批量扩库。
- 间隔复习（SRS）、词库范围子集、edge-tts 音色试听确认。
