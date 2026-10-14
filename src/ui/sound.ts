// Suara sintetis (WebAudio), tanpa file audio: eongan dengan formant vokal,
// dengkur, desis, bunyi antarmuka, dan musik latar kotak musik yang opsional.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let enabled = true;
let volume = 0.7;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function out(): AudioNode {
  return master!;
}

/** Pengaturan dari game: efek suara menyala/mati dan volume 0..1. */
export function configureSound(on: boolean, vol: number): void {
  enabled = on;
  volume = Math.min(1, Math.max(0, vol));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  applyMusic();
  applyRain();
}

/** Browser biasa baru mengizinkan suara setelah interaksi pertama. */
export function unlockAudio(): void {
  if (enabled) audio();
}

function tone(freqs: number[], duration: number, type: OscillatorType = "triangle", vol = 0.06, delay = 0): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  const step = duration / Math.max(1, freqs.length - 1);
  osc.frequency.setValueAtTime(freqs[0], t0);
  freqs.forEach((f, i) => osc.frequency.linearRampToValueAtTime(f, t0 + i * step));
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(out());
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise(a: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Semburan derau dengan filter, untuk desis, remah, dan dengkur. */
function hiss(duration: number, filter: BiquadFilterType, freq: number, vol: number, delay = 0, rumbleHz = 0): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noise(a);
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.08, duration / 4));
  gain.gain.setValueAtTime(vol, t0 + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  let node: AudioNode = gain;
  if (rumbleHz > 0) {
    // Modulasi amplitudo: getaran dengkur.
    const am = a.createGain();
    am.gain.value = 0.5;
    const lfo = a.createOscillator();
    lfo.frequency.value = rumbleHz;
    const depth = a.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    lfo.start(t0);
    lfo.stop(t0 + duration + 0.05);
    gain.connect(am);
    node = am;
  }
  src.connect(f).connect(gain);
  node.connect(out());
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + duration + 0.05);
}

interface MeowOptions {
  /** Pengali nada (1 = kucing dewasa, 1,5 = anak kucing). */
  pitch?: number;
  duration?: number;
  vol?: number;
  delay?: number;
  /** Getaran "prrr" pada awal eongan (kucing senang). */
  trill?: boolean;
}

/**
 * Eongan: gelombang gigi gergaji dengan nada naik-turun, dilewatkan dua filter
 * formant yang bergeser dari vokal "i" ke "a" ke "u" (mi-a-u).
 */
function meow({ pitch = 1, duration = 0.55, vol = 0.09, delay = 0, trill = false }: MeowOptions = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const end = t0 + duration;
  const peak = t0 + duration * 0.35;

  const src = a.createOscillator();
  src.type = "sawtooth";
  src.frequency.setValueAtTime(480 * pitch, t0);
  src.frequency.linearRampToValueAtTime(760 * pitch, peak);
  src.frequency.exponentialRampToValueAtTime(400 * pitch, end);
  const vib = a.createOscillator();
  vib.frequency.value = 6.5;
  const vibDepth = a.createGain();
  vibDepth.gain.value = 9 * pitch;
  vib.connect(vibDepth).connect(src.frequency);

  const env = a.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(vol, t0 + 0.05);
  env.gain.linearRampToValueAtTime(vol * 0.85, t0 + duration * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  const formants: [number, number, number, number][] = [
    // [awal, puncak, akhir, Q]
    [700, 1050, 560, 5],
    [2300, 1600, 950, 7],
    [3200, 3000, 2600, 9],
  ];
  const gains = [1, 0.6, 0.18];
  formants.forEach(([f0, f1, f2, q], i) => {
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0 * Math.sqrt(pitch), t0);
    bp.frequency.linearRampToValueAtTime(f1 * Math.sqrt(pitch), peak);
    bp.frequency.linearRampToValueAtTime(f2 * Math.sqrt(pitch), end);
    const g = a.createGain();
    g.gain.value = gains[i] * 2.2;
    src.connect(bp).connect(g).connect(env);
  });

  let tail: AudioNode = env;
  if (trill) {
    const am = a.createGain();
    am.gain.value = 0.6;
    const lfo = a.createOscillator();
    lfo.frequency.value = 26;
    const depth = a.createGain();
    depth.gain.setValueAtTime(0.4, t0);
    depth.gain.linearRampToValueAtTime(0, peak);
    lfo.connect(depth).connect(am.gain);
    lfo.start(t0);
    lfo.stop(end + 0.05);
    env.connect(am);
    tail = am;
  }
  tail.connect(out());
  src.start(t0);
  vib.start(t0);
  src.stop(end + 0.05);
  vib.stop(end + 0.05);
}

export type SoundId =
  | "buy"
  | "pet"
  | "meow"
  | "coin"
  | "feed"
  | "denied"
  | "purr"
  | "hiss"
  | "thud"
  | "chirp"
  | "talk"
  | "pop"
  | "crunch"
  | "levelup"
  | "alarm"
  | "chime"
  | "shutter"
  | "achievement"
  | "thunder";

/** Jeda minimal antar-bunyi yang sama, agar klik beruntun tidak jadi bising. */
const MIN_GAP_MS: Partial<Record<SoundId, number>> = { meow: 350, pet: 120, purr: 900, pop: 50, chirp: 120, crunch: 200, talk: 220 };
const lastPlayed = new Map<SoundId, number>();

export function playSound(id: SoundId): void {
  if (!enabled || volume <= 0) return;
  const now = performance.now();
  const gap = MIN_GAP_MS[id] ?? 30;
  if (now - (lastPlayed.get(id) ?? -Infinity) < gap) return;
  lastPlayed.set(id, now);
  switch (id) {
    case "buy":
      tone([520, 780], 0.12, "square", 0.03);
      break;
    case "pet":
      // "Prrrp" pendek: eongan anak kucing dengan getaran.
      meow({ pitch: 1.35, duration: 0.28, vol: 0.06, trill: true });
      break;
    case "meow":
      meow({ pitch: 0.9 + Math.random() * 0.35, duration: 0.45 + Math.random() * 0.2 });
      break;
    case "coin":
      tone([880, 1320], 0.18, "square", 0.03);
      break;
    case "feed":
      tone([440, 560, 660], 0.2, "triangle", 0.05);
      meow({ pitch: 1.2, duration: 0.3, vol: 0.05, delay: 0.15 });
      break;
    case "denied":
      tone([220, 180], 0.15, "square", 0.025);
      break;
    case "purr":
      hiss(1.6, "lowpass", 240, 0.16, 0, 24);
      tone([52, 48, 52], 1.5, "sine", 0.05);
      break;
    case "hiss":
      hiss(0.6, "highpass", 2600, 0.08);
      break;
    case "thud":
      tone([140, 50], 0.18, "sine", 0.12);
      break;
    case "chirp":
      meow({ pitch: 1.6, duration: 0.16, vol: 0.05 });
      break;
    case "talk":
      // Gumaman kucing saat "berbicara" di gelembung obrolan.
      meow({ pitch: 1.1 + Math.random() * 0.45, duration: 0.16 + Math.random() * 0.12, vol: 0.04, trill: Math.random() < 0.35 });
      break;
    case "pop":
      tone([500, 950], 0.09, "square", 0.03);
      tone([1200, 1600], 0.12, "triangle", 0.025, 0.08);
      break;
    case "crunch":
      for (let i = 0; i < 3; i++) hiss(0.06, "bandpass", 1800 + i * 300, 0.07, i * 0.13);
      break;
    case "levelup":
      tone([660, 880], 0.12, "triangle", 0.04);
      tone([880, 1320], 0.2, "triangle", 0.04, 0.12);
      break;
    case "alarm":
      // Tiga eongan makin tinggi lalu lonceng: jelas untuk pengingat, tidak menyakitkan telinga.
      for (let i = 0; i < 3; i++) meow({ pitch: 1 + i * 0.14, duration: 0.36, vol: 0.1, delay: i * 0.45 });
      tone([1318], 0.7, "sine", 0.06, 1.4);
      tone([1046], 0.9, "sine", 0.05, 1.6);
      break;
    case "chime":
      tone([1318], 0.6, "sine", 0.05);
      tone([988], 0.8, "sine", 0.04, 0.35);
      break;
    case "shutter":
      hiss(0.05, "highpass", 4000, 0.08);
      hiss(0.07, "bandpass", 2200, 0.06, 0.09);
      break;
    case "thunder":
      // Gemuruh: derau rendah yang panjang dengan getaran pelan.
      hiss(2.8, "lowpass", 150, 0.32, 0, 7);
      hiss(0.35, "lowpass", 600, 0.12);
      break;
    case "achievement":
      tone([523, 659], 0.12, "triangle", 0.045);
      tone([659, 784], 0.12, "triangle", 0.045, 0.12);
      tone([784, 1046], 0.3, "triangle", 0.05, 0.24);
      break;
  }
}

// ---------------------------------------------------------------------------
// Musik latar: kotak musik pentatonik yang tenang, dibuat acak terus-menerus.

/** C mayor pentatonik, dua oktaf. */
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
/** Akar akor C – Am – F – G (satu oktaf di bawah). */
const BASS = [130.81, 110.0, 87.31, 98.0];
const STEP = 0.4;

interface Music {
  timer: number;
  next: number;
  step: number;
  note: number;
  bus: GainNode;
  /** Semua simpul gema, diputus saat musik berhenti agar tidak menumpuk. */
  nodes: AudioNode[];
}

let music: Music | null = null;
let musicWanted = false;
let musicPaused = false;

function pluck(a: AudioContext, bus: AudioNode, freq: number, t: number, vol: number, decay: number): void {
  for (const [mult, g] of [
    [1, 1],
    [2, 0.25],
    [3, 0.08],
  ] as const) {
    const osc = a.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    const env = a.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol * g, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay / mult);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}

function startMusic(): void {
  const a = audio();
  if (!a || music) return;
  const bus = a.createGain();
  bus.gain.value = 0.35;
  // Gema lembut.
  const delay = a.createDelay(1);
  delay.delayTime.value = STEP * 0.75;
  const fb = a.createGain();
  fb.gain.value = 0.28;
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  bus.connect(out());
  bus.connect(delay);
  delay.connect(lp).connect(fb).connect(delay);
  lp.connect(out());
  const m: Music = { timer: 0, next: a.currentTime + 0.1, step: 0, note: 5, bus, nodes: [bus, delay, fb, lp] };
  m.timer = window.setInterval(() => {
    const ac = ctx;
    if (!ac || !music) return;
    // Bila timer sempat tertahan (jendela tersembunyi), jangan menumpuk nada.
    if (m.next < ac.currentTime) m.next = ac.currentTime + 0.05;
    while (m.next < ac.currentTime + 0.5) {
      const t = m.next;
      if (m.step % 16 === 0) pluck(ac, bus, BASS[Math.floor(m.step / 16) % BASS.length], t, 0.09, 2.6);
      if (Math.random() < (m.step % 2 === 0 ? 0.7 : 0.35)) {
        // Melodi berjalan acak di tangga nada, sesekali melompat.
        const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        m.note = Math.min(SCALE.length - 1, Math.max(0, m.note + move));
        pluck(ac, bus, SCALE[m.note], t, 0.06, 1.6);
      }
      m.step += 1;
      m.next += STEP;
    }
  }, 120);
  music = m;
}

function stopMusic(): void {
  if (!music) return;
  window.clearInterval(music.timer);
  const { bus, nodes } = music;
  if (ctx) bus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  window.setTimeout(() => nodes.forEach((n) => n.disconnect()), 1500);
  music = null;
}

function applyMusic(): void {
  if (musicWanted && enabled && !musicPaused) startMusic();
  else stopMusic();
}

export function setMusic(on: boolean): void {
  musicWanted = on;
  applyMusic();
}

/** Musik berhenti saat strip disembunyikan. */
export function setMusicPaused(paused: boolean): void {
  musicPaused = paused;
  applyMusic();
}

// ---------------------------------------------------------------------------
// Suara hujan: derau berfilter yang terus berputar, kerasnya mengikuti hujan.

let rain: { src: AudioBufferSourceNode; gain: GainNode; nodes: AudioNode[] } | null = null;
let rainLevel = 0;
let rainPaused = false;

function applyRain(): void {
  const level = enabled && !rainPaused ? rainLevel : 0;
  if (level <= 0) {
    if (rain && ctx) {
      const r = rain;
      r.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
      window.setTimeout(() => {
        try {
          r.src.stop();
        } catch {
          // Sudah berhenti.
        }
        r.nodes.forEach((n) => n.disconnect());
      }, 3000);
      rain = null;
    }
    return;
  }
  const a = audio();
  if (!a) return;
  if (!rain) {
    const src = a.createBufferSource();
    src.buffer = noise(a);
    src.loop = true;
    const hp = a.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 500;
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const gain = a.createGain();
    gain.gain.value = 0;
    src.connect(hp).connect(lp).connect(gain).connect(out());
    src.start();
    rain = { src, gain, nodes: [src, hp, lp, gain] };
  }
  rain.gain.gain.setTargetAtTime(0.05 + level * 0.09, a.currentTime, 1.2);
}

/** Kekuatan suara hujan 0..1 (0 = diam). */
export function setRainSound(level: number): void {
  rainLevel = Math.max(0, Math.min(1, level));
  applyRain();
}

/** Suara hujan berhenti saat strip disembunyikan. */
export function setRainPaused(paused: boolean): void {
  rainPaused = paused;
  applyRain();
}
