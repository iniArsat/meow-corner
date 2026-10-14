// Format angka dan durasi gaya Indonesia: 1.234; 12,5 jt; 3,4 M; 5,6 T.

const SUFFIXES: [number, string][] = [
  [1e18, "Kt"],
  [1e15, "Kd"],
  [1e12, "T"],
  [1e9, "M"],
  [1e6, "jt"],
];

const intFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function decimal(n: number, digits: number): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Jumlah ikan untuk tampilan. */
export function formatFish(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  const abs = Math.abs(n);
  if (abs >= 1e21) return n.toExponential(2).replace(".", ",");
  for (const [size, suffix] of SUFFIXES) {
    if (abs >= size) return `${decimal(Math.floor((n / size) * 100) / 100, 2)} ${suffix}`;
  }
  if (abs < 10 && abs !== Math.floor(abs)) return decimal(Math.floor(n * 10) / 10, 1);
  return intFormat.format(Math.floor(n));
}

/** Laju produksi, ikan per detik. */
export function formatRate(perSecond: number): string {
  if (perSecond < 10) return `${decimal(perSecond, 1)}/dtk`;
  return `${formatFish(perSecond)}/dtk`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h} jam ${m} menit`;
  if (h > 0) return `${h} jam`;
  if (m > 0) return `${m} menit`;
  return `${s} detik`;
}

export function formatPercent(fraction: number): string {
  return `${fraction >= 0 ? "+" : ""}${decimal(fraction * 100, 1)}%`;
}
