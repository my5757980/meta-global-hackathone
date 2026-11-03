/** Chat media helpers: picture resize before upload, and a WAV voice recorder (Muse Spark Open accepts WAV, not webm). */

export async function resizeImage(file: File, max = 1600, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process the picture"))), "image/jpeg", quality));
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (const s0 of samples) {
    const s = Math.max(-1, Math.min(1, s0));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Down-sample to 16 kHz mono so a minute of voice is ~2 MB. */
function downsample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

/**
 * Hears one thing said at a time on a call: it waits for speech, keeps it until a second of quiet, and hands back a WAV.
 * The microphone stays open for the whole call; what is heard while the other side speaks is thrown away.
 */
export class VoiceListener {
  muted = false;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private done: ((b: Blob | null) => void) | null = null;
  private pre: Float32Array[] = [];
  private chunks: Float32Array[] = [];
  private speaking = false;
  private loudMs = 0;
  private quietMs = 0;
  private noise = 0.004;
  private since = 0;
  private limit = 0;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(2048, 1, 1);
    this.node.onaudioprocess = (e) => this.hear(e.inputBuffer.getChannelData(0));
    src.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  /** The next thing said, or null if nothing was said in time. */
  next(giveUpAfterMs: number): Promise<Blob | null> {
    this.pre = [];
    this.chunks = [];
    this.speaking = false;
    this.loudMs = 0;
    this.quietMs = 0;
    this.since = Date.now();
    this.limit = giveUpAfterMs;
    return new Promise((res) => (this.done = res));
  }

  private hear(input: Float32Array) {
    if (!this.done || !this.ctx) return;
    const copy = new Float32Array(input);
    let sum = 0;
    for (const v of copy) sum += v * v;
    const level = this.muted ? 0 : Math.sqrt(sum / copy.length);
    const ms = (copy.length / this.ctx.sampleRate) * 1000;
    const bar = Math.max(0.012, this.noise * 2.5);
    if (!this.speaking) {
      if (level < bar) this.noise = this.noise * 0.97 + level * 0.03;
      this.pre.push(copy);
      if (this.pre.length > 12) this.pre.shift(); // keeps the start of the first word
      this.loudMs = level > bar ? this.loudMs + ms : 0;
      if (this.loudMs >= 150) {
        this.speaking = true;
        this.chunks = [...this.pre];
        this.since = Date.now();
      } else if (Date.now() - this.since > this.limit) {
        this.finish(null);
      }
      return;
    }
    this.chunks.push(copy);
    this.quietMs = level < bar ? this.quietMs + ms : 0;
    if (this.quietMs >= 1100 || Date.now() - this.since > 30_000) {
      const total = this.chunks.reduce((a, c) => a + c.length, 0);
      const all = new Float32Array(total);
      let o = 0;
      for (const c of this.chunks) {
        all.set(c, o);
        o += c.length;
      }
      this.finish(encodeWav(downsample(all, this.ctx.sampleRate), 16000));
    }
  }

  private finish(b: Blob | null) {
    const d = this.done;
    this.done = null;
    d?.(b);
  }

  stop() {
    this.finish(null);
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

const LANGS: Record<string, string> = { english: "en", urdu: "ur", hindi: "hi", arabic: "ar", swahili: "sw", french: "fr", spanish: "es", portuguese: "pt", russian: "ru", japanese: "ja", chinese: "zh", bengali: "bn", turkish: "tr" };

export const stopSpeaking = () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
};

/** Reads a reply aloud with the browser's own voice (not a model call). It always finishes, even on a machine with no voices. */
export function speakAloud(text: string, language = ""): Promise<void> {
  const plain = text.replace(/https?:\/\/\S+/g, "").replace(/[*_#`>~]/g, "").replace(/\p{Extended_Pictographic}/gu, "").trim();
  if (!plain || !("speechSynthesis" in window)) return Promise.resolve();
  const synth = window.speechSynthesis;
  const code = /[\u0600-\u06FF]/.test(plain) ? (language.toLowerCase() === "arabic" ? "ar" : "ur") : (LANGS[language.toLowerCase()] ?? "");
  const voice = code ? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(code)) : undefined;
  // long utterances stall in some browsers: one sentence at a time
  const parts = plain.split(/(?<=[.!?\u06D4])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const one = (part: string) =>
    new Promise<void>((res) => {
      const u = new SpeechSynthesisUtterance(part);
      if (voice) u.voice = voice;
      if (code) u.lang = voice?.lang ?? code;
      const t = setTimeout(res, Math.max(2500, part.length * 110));
      u.onend = u.onerror = () => {
        clearTimeout(t);
        res();
      };
      synth.speak(u);
    });
  return parts.reduce((p, part) => p.then(() => one(part)), Promise.resolve());
}

export class WavRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  startedAt = 0;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.node.onaudioprocess = (e) => this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(this.node);
    this.node.connect(this.ctx.destination);
    this.startedAt = Date.now();
  }

  async stop(): Promise<{ blob: Blob; seconds: number }> {
    const rate = this.ctx?.sampleRate ?? 48000;
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close();
    const total = this.chunks.reduce((a, c) => a + c.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) {
      all.set(c, o);
      o += c.length;
    }
    const seconds = total / rate;
    return { blob: encodeWav(downsample(all, rate), 16000), seconds };
  }

  cancel() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
  }
}
