# CET 词汇斩（CET Study）

基于 CET 全大纲（6325 词 = 新东方四级 4440 + 六级 2072 合并去重后）的网页学习工具：在 CET6 风格阅读中记忆单词，已斩词正常显示、未斩词带下划线；点词看释义发音，对角滑词即可"斩"掉已经完全掌握的词。

线上地址：<https://english-7xa.pages.dev>　·　版本历史见 [CHANGELOG.md](./CHANGELOG.md)

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
- `data/mastered.json`：百词斩已斩词清单。**仅作历史数据保留，不参与初始化**（初始进度一律为 0）。
- `data/basic-words.json`：基础词表（321 词，分两类）：202 个语法功能词（`a/an/the`、代词、助动词、介词、连词）点击显示释义并恒为「已斩」、不进斩词统计；另有 119 个日常基础词（people/online/email/performance 等）**不是恒已斩**：未斩带下划线、可手动斩、计入进度。`data/common-words.retired.json` 是已停用的旧「常用词」存档。
- `data/extra-words.json`：超纲词表（**79 词**，含 `algorithm` 这类学术词，也含 `pay`、`parent`、`patience`、`app` 这类新东方两份表未收的基础实词），**每个超纲词都有音标和中文释义**；阅读中标注「超纲」；能还原成大纲原形的词（如 `flexibility`→`flexible`、`consumed`→`consume`）不在此表，由运行时词形还原归为变形词——还原规则覆盖复数（含 `-ies/-ves`）、过去式/过去分词（含不规则表）、`-ing`、比较级/最高级（`deepest`→`deep`、`busiest`→`busy`）、所有格（`candidate's`）与常见派生后缀。
- `data/articles.json`：文章语料（当前 50 篇，每篇约 310-430 词、中英对照，风格贴近 CET6 阅读），全部通过「超纲词 ≤3%」校验。运行时自动把文中命中词库的单词标注为学习对象，因此**无需手动标注**。新增文章在 `data/articles.src.txt` 手写源里追加后跑 `scripts/build_articles.py` 重建，再用 `scripts/check_articles.py` 校验；AI 规模化可用 `scripts/build_corpus.py`。
- 进度存浏览器 localStorage（键 `cet.study.v1`）。

**初始进度为 0**：未登录的游客、以及新注册的账号，一律从空白开始（见下文「账号与同步」）。

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

> 改了 `src/` 里的 JS/CSS 之后，记得同步把 `index.html` 里的三处 `?v=` 和 `window.__BUILD__` 改成同一个新版本号（当前 `20261026-14`），否则浏览器/CDN 会用缓存里的旧文件，看起来像"改动没生效"。版本号规则见 CHANGELOG 末尾。


## 架构说明

这个项目由四个角色拼起来，各自只干一件事。搞清楚这层关系，后面的很多设计就都说得通了。

| 角色 | 本质上是什么 | 在本项目里负责 |
|---|---|---|
| Cloudflare Pages | 静态文件托管 + 全球 CDN | 把 `index.html`、`src/*.js`、`data/*.json` 送到浏览器 |
| Cloudflare Worker | 无服务器函数（serverless） | `english-study-sync`，处理注册/登录/读写进度 |
| Workers KV | 键值存储（Key-Value Store） | 存账号凭据、进度快照、会话令牌 |
| 浏览器本地存储 | 本机缓存 | 进度的一份拷贝，断网也能继续用 |

### Workers 是什么

一个跑在 Cloudflare 边缘的 `fetch` 函数：收到 HTTP 请求，返回 HTTP 响应。上传一次，自动部署到全球 300+ 节点，用户就近执行。

它和普通函数有三点不同，这三点直接决定了本项目的形态：

1. **有 `env`** —— 第二个参数由 Cloudflare 注入，里面挂着绑定的 KV（`env.STATE`）。代码本身不含配置。
2. **无状态** —— 每次请求独立，没有能跨请求保留的内存变量。想记住东西只能写进外部存储（KV）。
3. **多副本** —— 同一份代码同时跑在很多节点上，各跑各的。不能用进程内计数器做全局统计。

> 所以「进度必须存 KV」不是选型偏好，是这三条推出来的必然结果。

附带一个实际限制：**免费版每个请求只有 10ms CPU 时间**。这就是密码哈希用单次 SHA-256 而不用 PBKDF2 的原因——后者十万次迭代必然超时。网络等待（读 KV）不计入这 10ms。

### KV 是什么

Key-Value Store 的缩写，Cloudflare 的产品名叫 **Workers KV**。它只有两个动作：按 key 取一整块、按 key 覆盖一整块。**没有表、没有字段、不能 `WHERE` 查询**。

它不是「通用数据库」，而是「云端的一个个抽屉」。本项目的三个抽屉：

| Key | 内容 | 用途 |
|---|---|---|
| `user:<用户名>` | `{ salt, hash, createdAt, profile: { nickname, color } }` | 账号凭据 + 昵称头像 |
| `state:<用户名>` | 整份进度 JSON（约 392 KB） | 583 个已斩词等全部进度 |
| `session:<token>` | `{ user }`，30 天 TTL | 登录凭证 |

`session` 会有好几条是正常的：**每次登录发一个新 token，旧的不作废**（否则多设备会互相挤下线），30 天后自动过期。

### 数据量与选型

| 单用户数据量 | 该用什么 | 原因 |
|---|---|---|
| < 1 MB | KV 整体快照（**现状**） | 一次读写搞定 |
| 1–25 MB | KV，但要拆成多个 key | 避开单值上限，也能只传变动那块 |
| > 25 MB | **R2**（文件）+ 数据库（索引） | KV 单 value 上限 25 MiB，硬性卡死 |
| 需要查询/统计 | **D1** / Postgres | KV 不能查询 |

两个要记住的数：**KV 单值上限 25 MiB**、**免费额度存储 1 GB**。

如果哪天数据涨到几百 MB，「整块覆盖」的同步方式就得一起换掉——改成上报操作日志、服务端自己算状态（增量同步）。按现在每天几十个词的速度，基本碰不到这个天花板。

### KV 的两个特性

- **最终一致**：写入后传播到全球节点需要时间（官方口径最多 60 秒）。所以「电脑上斩完立刻在手机刷新」可能还是旧数据，一般等几秒就好。
- **写多会吞额度**：免费版 1000 写/天。本项目每次斩词 1 次写（1.5s 内合并），一天最多几百次，够用。

## 账号与同步

**账号由 Cloudflare Worker 认证**，进度按账号存在云端，可跨设备同步。

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

### 部署 Worker

1. **建 KV**：Dashboard → **存储和数据库 → Workers KV** → Create namespace。本项目用 `english`。
2. **建 Worker**：命名 `english-study-sync`，把 `worker/sync.js` **全文替换**进去，Deploy。
3. **绑 KV**：该 Worker → 设置 → 绑定 → 添加 → KV 命名空间，**变量名称必须正好是 `STATE`**（大写，代码里写死的）。
4. 地址填进 `index.html` 的 `window.__SYNC__.url`；置 `__SYNC__ = null` 则退回纯本地。

### 几个必须知道的技术点

- **CORS 不能省**：页面在 `xxx.pages.dev`、接口在 `xxx.workers.dev`，跨域；请求带 `Authorization` 头会触发 `OPTIONS` 预检。`worker/sync.js` 已返回完整 `access-control-*` 并放行 `OPTIONS`，少了这步同步会**静默失败**（看着像没同步，其实请求根本没发出去）。
- **密码哈希是单次加盐 SHA-256**（不是 PBKDF2）：受 Workers 免费版 10ms CPU 限制，原因见上文「架构说明」。对背单词进度这类数据够用；要更强得换付费计划。
- **同步是整体覆盖、后写赢**：别两台设备同时斩词。切设备前停 2 秒，等当前设备的 1.5s 防抖推送完成。
- **localStorage 按域名隔离**：`localhost:8321` 和线上域名是两个独立存储；换域名时进度靠"登录 + 云端同步"搬运，不是自动带过去。


## 待扩展

- 语料规模：当前 50 篇；新文章走 `data/articles.src.txt` + `scripts/build_articles.py`（自动校验超纲 ≤3%），或按 design.md 用 `scripts/build_corpus.py` AI 批量扩库。
- 间隔复习（SRS）、词库范围子集、edge-tts 音色试听确认。
