// Efek suara sintetis kecil (WebAudio), tanpa file audio. Mati secara bawaan.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freqs: number[], duration: number, type: OscillatorType = "triangle", volume = 0.06): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  const step = duration / Math.max(1, freqs.length - 1);
  freqs.forEach((f, i) => osc.frequency.linearRampToValueAtTime(f, t0 + i * step));
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export type SoundId = "buy" | "pet" | "meow" | "coin" | "feed" | "denied";

export function playSound(id: SoundId, enabled: boolean): void {
  if (!enabled) return;
  switch (id) {
    case "buy":
      tone([520, 780], 0.12, "square", 0.03);
      break;
    case "pet":
      tone([300, 340, 300], 0.35, "sine", 0.05);
      break;
    case "meow":
      tone([620, 900, 760, 520], 0.45, "sawtooth", 0.025);
      break;
    case "coin":
      tone([880, 1320], 0.18, "square", 0.03);
      break;
    case "feed":
      tone([440, 560, 660], 0.2, "triangle", 0.05);
      break;
    case "denied":
      tone([220, 180], 0.15, "square", 0.025);
      break;
  }
}
