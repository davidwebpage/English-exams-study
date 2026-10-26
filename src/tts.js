// Speech production: single-word pronunciation + full article listening.

// Uses the browser speech synthesis engine (offline-friendly) as v1 fallback;
// audio-file mode (edge-tts mp3s) can be dropped in behind the same API later.

const enVoicePrefs = /en[-_]US/i;

function SS() { return typeof speechSynthesis !== 'undefined' ? speechSynthesis : null; }

function pickVoice() {
  const synth = SS();
  if (!synth) return null;
  const vs = synth.getVoices();
  if (!vs.length) return null;
  const preferred = vs.filter((v) => enVoicePrefs.test(v.lang) && /(Jenny|Aria|Zira|Samantha|Female)/i.test(v.name));
  if (preferred.length) return preferred[0];
  const en = vs.filter((v) => enVoicePrefs.test(v.lang));
  return en.length ? en[0] : vs.find((v) => /^en/i.test(v.lang)) || null;
}

function utter(rate = 0.9) {
  const u = new SpeechSynthesisUtterance();
  u.lang = 'en-US';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = rate;
  return u;
}

let audioIndex = null;
async function audioAvailable() {
  if (audioIndex === null) {
    try { audioIndex = await fetch('./data/audio.index.json').then((r) => r.json()); }
    catch { audioIndex = {}; }
  }
  return audioIndex;
}

export async function speakWord(word, { preferMp3 = true } = {}) {
  if (preferMp3) {
    const idx = await audioAvailable();
    const key = word.toLowerCase();
    if (idx[key]) {
      const a = new Audio(`./audio/${key}.mp3`);
      a.play().catch(() => synthFallback(word));
      return;
    }
  }
  synthFallback(word);
}

function synthFallback(word) {
  const synth = SS();
  if (!synth) return;
  const u = utter(0.85);
  u.text = word;
  try { synth.cancel(); } catch (e) { /* ignore */ }
  try { synth.speak(u); } catch (e) { /* voice unavailable */ }
}

// Listens through an article, chunking by sentence so we can highlight in sync.
export class ListenSession {
  constructor(paragraphs, { rate = 0.9, onSentence = () => {}, onWord = () => {}, onEnd = () => {} } = {}) {
    this.paragraphs = paragraphs;
    this.sentences = [];
    paragraphs.forEach((p, pi) => {
      p.split(/(?<=[.!?])\s+/).forEach((s) => {
        if (s.trim()) this.sentences.push({ text: s, pi });
      });
    });
    this.i = 0;
    this.rate = rate;
    this.onSentence = onSentence;
    this.onWord = onWord;
    this.onEnd = onEnd;
    this.stopped = false;
    this.paused = false;
  }

  start() {
    this.stopped = false;
    this.speakCurrent();
  }

  speakCurrent() {
    if (this.stopped || this.i >= this.sentences.length) { this.onEnd(); return; }
    const s = this.sentences[this.i];
    this.onSentence(this.i, s);
    const u = utter(this.rate);
    u.text = s.text;
    u.onboundary = (e) => {
      if (e.name === 'word' && typeof e.charIndex === 'number') this.onWord(e.charIndex, s);
    };
    u.onend = () => { if (!this.stopped) { this.i++; this.speakCurrent(); } };
    u.onerror = () => { if (!this.stopped) { this.i++; this.speakCurrent(); } };
    const synth = SS();
    if (!synth) { this.i++; this.speakCurrent(); return; }
    try { synth.speak(u); } catch (e) { this.i++; this.speakCurrent(); }
  }

  pause() { try { SS() && SS().pause(); } catch (e) {} this.paused = true; }
  resume() { try { SS() && SS().resume(); } catch (e) {} this.paused = false; }
  stop() { this.stopped = true; try { SS() && SS().cancel(); } catch (e) {} }
}
