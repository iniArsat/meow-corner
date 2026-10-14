// Efek suara sintetis kecil (WebAudio), tanpa file audio. Mati secara bawaan.

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freqs: number[], duration: number, type: OscillatorType = "triangle", volume = 0.06, delay = 0): void {
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
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(a.destination);
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
function hiss(duration: number, filter: BiquadFilterType, freq: number, volume: number, delay = 0, rumbleHz = 0): void {
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
  gain.gain.linearRampToValueAtTime(volume, t0 + Math.min(0.08, duration / 4));
  gain.gain.setValueAtTime(volume, t0 + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  let out: AudioNode = gain;
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
    out = am;
  }
  src.connect(f).connect(gain);
  out.connect(a.destination);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + duration + 0.05);
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
  | "pop"
  | "crunch"
  | "levelup";

export function playSound(id: SoundId, enabled: boolean): void {
  if (!enabled) return;
  switch (id) {
    case "buy":
      tone([520, 780], 0.12, "square", 0.03);
      break;
    case "pet":
      tone([300, 340, 300], 0.35, "sine", 0.05);
      break;
    case "meow": {
      const p = 0.85 + Math.random() * 0.35;
      tone([620 * p, 900 * p, 760 * p, 520 * p], 0.4 + Math.random() * 0.15, "sawtooth", 0.022);
      break;
    }
    case "coin":
      tone([880, 1320], 0.18, "square", 0.03);
      break;
    case "feed":
      tone([440, 560, 660], 0.2, "triangle", 0.05);
      break;
    case "denied":
      tone([220, 180], 0.15, "square", 0.025);
      break;
    case "purr":
      hiss(1.4, "lowpass", 260, 0.12, 0, 24);
      break;
    case "hiss":
      hiss(0.55, "highpass", 3000, 0.06);
      break;
    case "thud":
      tone([140, 50], 0.18, "sine", 0.12);
      break;
    case "chirp":
      tone([900, 1500, 1200], 0.14, "triangle", 0.035);
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
  }
}
