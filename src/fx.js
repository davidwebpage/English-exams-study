// 斩词音效 + DOM 特效。
// 音效优先用采样素材 assets/sfx/sword.mp3（剑刃/剑斩/挥剑，爱给网）；加载失败时
// 回落到现场合成的「破风」声，保证任何情况下斩词都有声音。

let ac = null;
function audio() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

// ---- 采样音效 ----
const SAMPLE_URL = './assets/sfx/sword.mp3';
const SAMPLE_FROM = 0.02;    // 素材 0.06s 才起声，前面留一点余量
const SAMPLE_TO = 0.58;      // 素材 0.54s 之后是静音，直接截掉
let sampleBuf = null;
let sampleLoading = null;

// 截取一段并做 5ms 淡出，避免尾巴被硬切断的「啪」
function sliceBuffer(ctx, buf, from, to) {
  const sr = buf.sampleRate;
  const a = Math.max(0, Math.floor(from * sr));
  const b = Math.min(buf.length, Math.floor(to * sr));
  const len = Math.max(1, b - a);
  const out = ctx.createBuffer(buf.numberOfChannels, len, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c).slice(a, b);
    const fade = Math.min(data.length, Math.floor(sr * 0.005));
    for (let i = 0; i < fade; i++) data[data.length - 1 - i] *= i / fade;
    out.copyToChannel(data, c);
  }
  return out;
}

// 用 OfflineAudioContext 解码：不需要用户手势，也不会在控制台冒出
// "AudioContext was not allowed to start" 的自动播放告警
let decodeCtx = null;
function decoder() {
  if (!decodeCtx) {
    const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    decodeCtx = new C(1, 1, 44100);
  }
  return decodeCtx;
}

export function preloadSlash() {
  if (sampleBuf || sampleLoading) return sampleLoading;
  const ctx = decoder();
  sampleLoading = fetch(SAMPLE_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((ab) => ctx.decodeAudioData(ab))
    .then((decoded) => {
      sampleBuf = sliceBuffer(ctx, decoded, SAMPLE_FROM, SAMPLE_TO);
      return sampleBuf;
    })
    .catch(() => null);        // 出错就静默回落到合成音
  return sampleLoading;
}

export function slashSampleReady() { return !!sampleBuf; }

function playSample(ctx) {
  const src = ctx.createBufferSource();
  src.buffer = sampleBuf;
  const g = ctx.createGain();
  g.gain.value = 0.9;
  src.connect(g).connect(ctx.destination);
  src.start();
}

// ---- 合成兜底（素材没加载好时用） ----

// 噪声源只生成一次，各层复用（闪电和刀风都吃它）
let noiseBuf = null;
function noise(ctx) {
  if (!noiseBuf) {
    const len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// 挥剑的一声「唰」: 只有破风, 没有金属音、没有爆点、没有低频砸地。
// 导出来是为了能用 OfflineAudioContext 离线渲染自检。
export function renderSlash(ctx, dest, t, vol = 1) {
  const master = ctx.createGain();
  master.gain.value = 1.9 * vol;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 4;
  comp.attack.value = 0.004; comp.release.value = 0.14;
  master.connect(comp).connect(dest);

  const DUR = 0.34;

  // 主体: 宽带噪声穿过带通, 中心频率先升后降 —— 像刃口由远及近再划过去
  const swish = ctx.createBufferSource();
  swish.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.0;
  bp.frequency.setValueAtTime(750, t);
  bp.frequency.exponentialRampToValueAtTime(2900, t + 0.11);
  bp.frequency.exponentialRampToValueAtTime(820, t + DUR);
  // 平滑包络: 45ms 起、快速到峰、再拖一条长尾巴, 没有硬起音所以不成「咔」
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.95, t + 0.045);
  g.gain.exponentialRampToValueAtTime(0.30, t + 0.17);
  g.gain.exponentialRampToValueAtTime(0.0005, t + DUR);
  swish.connect(bp).connect(g).connect(master);
  swish.start(t); swish.stop(t + DUR + 0.02);

  // 气流的高频细节: 一点高通噪声, 只在前 120ms, 让「唰」有锋利的边
  const air = ctx.createBufferSource();
  air.buffer = noise(ctx); air.playbackRate.value = 1.35;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 2600;
  const gAir = ctx.createGain();
  gAir.gain.setValueAtTime(0.0001, t);
  gAir.gain.exponentialRampToValueAtTime(0.26, t + 0.05);
  gAir.gain.exponentialRampToValueAtTime(0.0004, t + 0.15);
  air.connect(hp).connect(gAir).connect(master);
  air.start(t); air.stop(t + 0.17);
}

export function playSlash() {
  try {
    const ctx = audio();
    if (sampleBuf) { playSample(ctx); return; }
    // 素材还没解码完：先给一记合成音，同时把加载挂起来（下次就用素材）
    renderSlash(ctx, ctx.destination, ctx.currentTime + 0.005);
    preloadSlash();
  } catch (e) { /* 没有音频权限就静默 */ }
}

// Animate a slash burst centered on the word element.
export function slashBurst(el) {
  const r = el.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.style.left = r.left + r.width / 2 + 'px';
  layer.style.top = r.top + r.height / 2 + 'px';
  document.body.appendChild(layer);

  const slashEl = document.createElement('div');
  slashEl.className = 'fx-slash';
  layer.appendChild(slashEl);

  const zi = document.createElement('div');
  zi.className = 'fx-zi';
  zi.textContent = '斩';
  layer.appendChild(zi);

  const colors = ['#14b8a6', '#f59e0b', '#22d3ee'];
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('span');
    const a = Math.random() * Math.PI * 2;
    const d = 34 + Math.random() * 46;
    p.className = 'fx-spark';
    p.style.setProperty('--dx', Math.cos(a) * d + 'px');
    p.style.setProperty('--dy', Math.sin(a) * d + 'px');
    p.style.background = colors[i % colors.length];
    layer.appendChild(p);
  }
  if (navigator.vibrate) navigator.vibrate(18);
  setTimeout(() => layer.remove(), 700);
}
