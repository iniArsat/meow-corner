// Cuaca dan waktu: arti kode cuaca WMO, fase hari dari matahari terbit/terbenam,
// warna cahaya untuk strip, dan pembaca respons Open-Meteo / geokoding / lokasi IP.
// Modul murni (tanpa DOM dan tanpa jaringan), memakai waktu lokal komputer.

import { dateKey, formatClock, startOfDay } from "./assistant";
import type { WeatherKind, WeatherPlace, WeatherSnapshot, WeatherState } from "./types";

export const WEATHER_KINDS: readonly WeatherKind[] = ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "storm", "snow"];

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "Cerah",
  partly: "Cerah berawan",
  cloudy: "Mendung",
  fog: "Berkabut",
  drizzle: "Gerimis",
  rain: "Hujan",
  storm: "Badai petir",
  snow: "Salju",
};

/** Kode cuaca WMO (dipakai Open-Meteo) → jenis cuaca untuk efek. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "partly";
}

export function isWet(kind: WeatherKind): boolean {
  return kind === "drizzle" || kind === "rain" || kind === "storm";
}

/** Kekuatan hujan/salju 0..1 untuk banyaknya tetesan. */
export function precipitation(kind: WeatherKind, code: number | null): number {
  switch (kind) {
    case "drizzle":
      return 0.3;
    case "rain":
      return code === 65 || code === 82 || code === 67 ? 1 : code === 61 || code === 80 ? 0.55 : 0.75;
    case "storm":
      return 1;
    case "snow":
      return code === 75 || code === 86 ? 1 : 0.6;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Fase hari

export type DayPhase = "dini" | "fajar" | "pagi" | "siang" | "sore" | "senja" | "malam";

export const PHASE_LABEL: Record<DayPhase, string> = {
  dini: "Dini hari",
  fajar: "Fajar",
  pagi: "Pagi",
  siang: "Siang",
  sore: "Sore",
  senja: "Senja",
  malam: "Malam",
};

const MIN = 60_000;

export interface SunTimes {
  sunrise: number;
  sunset: number;
  /** Selisih jam kota terhadap UTC (detik), null = pakai jam komputer. */
  utcOffset: number | null;
}

const DAY_MS = 24 * 60 * MIN;

/** Awal hari (00.00) menurut jam kota, atau jam komputer bila selisihnya tidak diketahui. */
export function cityDayStart(ms: number, utcOffset: number | null): number {
  if (utcOffset === null) return startOfDay(ms);
  const off = utcOffset * 1000;
  return Math.floor((ms + off) / DAY_MS) * DAY_MS - off;
}

/** Jam (pecahan, 0–24) menurut jam kota. */
export function cityHour(ms: number, utcOffset: number | null): number {
  if (utcOffset === null) {
    const d = new Date(ms);
    return d.getHours() + d.getMinutes() / 60;
  }
  return (ms - cityDayStart(ms, utcOffset)) / (60 * MIN);
}

/** Jam "HH.MM" menurut jam kota. */
export function cityClock(ms: number, utcOffset: number | null): string {
  if (utcOffset === null) return formatClock(ms);
  const mins = Math.floor((ms - cityDayStart(ms, utcOffset)) / MIN);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(mins / 60) % 24)}.${pad(mins % 60)}`;
}

/**
 * Jam terbit/terbenam untuk siklus matahari yang paling dekat dengan `now`.
 * Data Open-Meteo dari hari lain digeser per 24 jam (bedanya antar-hari kecil),
 * sehingga kota yang jauh dari zona waktu komputer pun tetap benar.
 * Tanpa data, pakai 06.00 dan 18.00 jam komputer (wajar untuk Indonesia).
 */
export function sunFor(now: number, snapshot: WeatherSnapshot | null): SunTimes {
  if (snapshot && snapshot.sunrise > 0 && snapshot.sunset > snapshot.sunrise) {
    const mid = (snapshot.sunrise + snapshot.sunset) / 2;
    const shift = Math.round((now - mid) / DAY_MS) * DAY_MS;
    return { sunrise: snapshot.sunrise + shift, sunset: snapshot.sunset + shift, utcOffset: snapshot.utcOffset };
  }
  const today = startOfDay(now);
  return { sunrise: today + 6 * 60 * MIN, sunset: today + 18 * 60 * MIN, utcOffset: null };
}

export function dayPhase(now: number, sun: SunTimes): DayPhase {
  const h = cityHour(now, sun.utcOffset);
  if (now < sun.sunrise - 50 * MIN) return h >= 22 ? "malam" : "dini";
  if (now < sun.sunrise + 30 * MIN) return "fajar";
  if (h < 10) return "pagi";
  if (h < 15 && now < sun.sunset - 50 * MIN) return "siang";
  if (now < sun.sunset - 40 * MIN) return "sore";
  if (now < sun.sunset + 35 * MIN) return "senja";
  return "malam";
}

export function isDark(phase: DayPhase): boolean {
  return phase === "malam" || phase === "dini";
}

// ---------------------------------------------------------------------------
// Warna cahaya (tint) untuk kucing dan fasilitas

type RGB = [number, number, number];

function rgb(c: number): RGB {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function hex([r, g, b]: RGB): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export function mixColor(a: number, b: number, t: number): number {
  const ca = rgb(a);
  const cb = rgb(b);
  const k = Math.min(1, Math.max(0, t));
  return hex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k]);
}

function multiply(a: number, b: number): number {
  const ca = rgb(a);
  const cb = rgb(b);
  return hex([(ca[0] * cb[0]) / 255, (ca[1] * cb[1]) / 255, (ca[2] * cb[2]) / 255]);
}

const NIGHT = 0x9aa4d4;
const DAWN = 0xffd2c4;
const MORNING = 0xfff3e2;
const DAY = 0xffffff;
const AFTERNOON = 0xffefd6;
const DUSK = 0xffc49a;

const WEATHER_TINT: Record<WeatherKind, number> = {
  clear: 0xffffff,
  partly: 0xf8f8f8,
  cloudy: 0xe6e8ee,
  fog: 0xeeeeee,
  drizzle: 0xdde2ea,
  rain: 0xcfd6e2,
  storm: 0xb8c0d0,
  snow: 0xeef2fa,
};

/**
 * Warna cahaya saat ini, berpindah halus antar-fase: biru redup di malam hari,
 * merah muda saat fajar, jingga saat senja, lalu dikalikan warna cuaca.
 */
export function lightTint(now: number, sun: SunTimes, kind: WeatherKind): number {
  // Siang penuh 11.00–14.00 pada hari siklus matahari ini (jam kota).
  const day0 = cityDayStart((sun.sunrise + sun.sunset) / 2, sun.utcOffset);
  const keys: [number, number][] = [
    [sun.sunrise - 70 * MIN, NIGHT],
    [sun.sunrise, DAWN],
    [sun.sunrise + 60 * MIN, MORNING],
    [day0 + 11 * 60 * MIN, DAY],
    [day0 + 14 * 60 * MIN, DAY],
    [sun.sunset - 120 * MIN, AFTERNOON],
    [sun.sunset, DUSK],
    [sun.sunset + 60 * MIN, NIGHT],
  ];
  // Di lintang tinggi (matahari terbenam awal) urutan titik bisa tertukar.
  keys.sort((p, q) => p[0] - q[0]);
  let base = NIGHT;
  if (now >= keys[0][0] && now <= keys[keys.length - 1][0]) {
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, c0] = keys[i];
      const [t1, c1] = keys[i + 1];
      if (now >= t0 && now <= t1) {
        base = mixColor(c0, c1, (now - t0) / Math.max(1, t1 - t0));
        break;
      }
    }
  }
  return multiply(base, WEATHER_TINT[kind]);
}

// ---------------------------------------------------------------------------
// Keadaan cuaca yang berlaku

/** Data cuaca dianggap usang setelah sekian lama (tidak lagi dipakai untuk efek). */
export const STALE_MS = 3 * 60 * MIN;
/** Selang pengambilan data cuaca. */
export const REFRESH_MS = 20 * MIN;

export interface CurrentWeather {
  kind: WeatherKind;
  /** Kode WMO bila dari data sungguhan. */
  code: number | null;
  temp: number | null;
  wind: number;
  source: "live" | "manual" | "none";
}

export function currentWeather(w: WeatherState, now: number): CurrentWeather {
  if (!w.enabled) return { kind: "clear", code: null, temp: null, wind: 0, source: "none" };
  if (w.mode !== "auto") return { kind: w.mode, code: null, temp: w.last?.temp ?? null, wind: w.mode === "storm" ? 35 : 8, source: "manual" };
  const s = w.last;
  if (!s || now - s.fetchedAt > STALE_MS) return { kind: "clear", code: null, temp: null, wind: 0, source: "none" };
  return { kind: weatherKind(s.code), code: s.code, temp: s.temp, wind: s.wind, source: "live" };
}

export function needsRefresh(w: WeatherState, now: number): boolean {
  return w.enabled && w.place !== null && (!w.last || now - w.last.fetchedAt > REFRESH_MS);
}

export function placeLabel(p: WeatherPlace): string {
  return [p.name, p.region && p.region !== p.name ? p.region : "", p.country].filter(Boolean).join(", ");
}

export function defaultWeather(): WeatherState {
  return {
    enabled: true,
    mode: "auto",
    place: null,
    last: null,
    tint: true,
    rainSound: true,
    greet: true,
    greeted: "",
  };
}

// ---------------------------------------------------------------------------
// Alamat dan pembaca respons API

export function forecastUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
    daily: "sunrise,sunset",
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: "1",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function geocodeUrl(name: string): string {
  const q = new URLSearchParams({ name: name.trim(), count: "6", language: "id", format: "json" });
  return `https://geocoding-api.open-meteo.com/v1/search?${q}`;
}

export const IP_GEO_URL = "https://get.geojs.io/v1/ip/geo.json";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Waktu dari Open-Meteo: detik unix (timeformat=unixtime) atau ISO lokal + offset. */
function apiTime(v: unknown, utcOffsetSeconds: number): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v * 1000;
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - utcOffsetSeconds * 1000;
  }
  return null;
}

export function parseForecast(json: unknown, now: number): WeatherSnapshot | null {
  if (!isRecord(json) || !isRecord(json.current)) return null;
  const c = json.current;
  const code = finite(c.weather_code);
  const temp = finite(c.temperature_2m);
  if (code === null || temp === null) return null;
  const utcOffset = finite(json.utc_offset_seconds);
  const offset = utcOffset ?? 0;
  let sunrise = 0;
  let sunset = 0;
  if (isRecord(json.daily) && Array.isArray(json.daily.sunrise) && Array.isArray(json.daily.sunset)) {
    sunrise = apiTime(json.daily.sunrise[0], offset) ?? 0;
    sunset = apiTime(json.daily.sunset[0], offset) ?? 0;
  }
  return {
    code,
    temp,
    feels: finite(c.apparent_temperature) ?? temp,
    humidity: finite(c.relative_humidity_2m) ?? 0,
    wind: finite(c.wind_speed_10m) ?? 0,
    isDay: c.is_day === 1 || c.is_day === true,
    sunrise,
    sunset,
    utcOffset: utcOffset !== null && Math.abs(utcOffset) <= 15 * 3600 ? utcOffset : null,
    fetchedAt: now,
  };
}

export function parseGeocode(json: unknown): WeatherPlace[] {
  if (!isRecord(json) || !Array.isArray(json.results)) return [];
  const places: WeatherPlace[] = [];
  for (const r of json.results) {
    if (!isRecord(r)) continue;
    const lat = finite(r.latitude);
    const lon = finite(r.longitude);
    if (lat === null || lon === null || typeof r.name !== "string") continue;
    places.push({
      name: r.name.slice(0, 60),
      region: typeof r.admin1 === "string" ? r.admin1.slice(0, 60) : "",
      country: typeof r.country === "string" ? r.country.slice(0, 60) : "",
      lat,
      lon,
    });
  }
  return places;
}

export function parseIpGeo(json: unknown): WeatherPlace | null {
  if (!isRecord(json)) return null;
  const lat = finite(json.latitude);
  const lon = finite(json.longitude);
  if (lat === null || lon === null) return null;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 60) : "");
  return { name: str(json.city) || str(json.region) || "Lokasimu", region: str(json.region), country: str(json.country), lat, lon };
}

/** Kunci sapaan harian per fase ("2026-10-14:pagi"), memakai tanggal kota bila diketahui. */
export function greetKey(now: number, phase: DayPhase, utcOffset: number | null = null): string {
  if (utcOffset === null) return `${dateKey(now)}:${phase}`;
  const d = new Date(cityDayStart(now, utcOffset) + utcOffset * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}:${phase}`;
}

// ---------------------------------------------------------------------------
// Migrasi

export function migrateWeather(raw: unknown): WeatherState {
  const base = defaultWeather();
  if (!isRecord(raw)) return base;
  let place: WeatherPlace | null = null;
  if (isRecord(raw.place)) {
    const lat = finite(raw.place.lat);
    const lon = finite(raw.place.lon);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 60) : "");
      place = { name: s(raw.place.name) || "Lokasimu", region: s(raw.place.region), country: s(raw.place.country), lat, lon };
    }
  }
  let last: WeatherSnapshot | null = null;
  if (isRecord(raw.last)) {
    const l = raw.last;
    const code = finite(l.code);
    const temp = finite(l.temp);
    const fetchedAt = finite(l.fetchedAt);
    if (code !== null && temp !== null && fetchedAt !== null) {
      last = {
        code,
        temp,
        feels: finite(l.feels) ?? temp,
        humidity: finite(l.humidity) ?? 0,
        wind: finite(l.wind) ?? 0,
        isDay: l.isDay === true,
        sunrise: finite(l.sunrise) ?? 0,
        sunset: finite(l.sunset) ?? 0,
        utcOffset: (() => {
          const o = finite(l.utcOffset);
          return o !== null && Math.abs(o) <= 15 * 3600 ? o : null;
        })(),
        fetchedAt,
      };
    }
  }
  const mode = typeof raw.mode === "string" && (WEATHER_KINDS as readonly string[]).includes(raw.mode) ? (raw.mode as WeatherKind) : "auto";
  return {
    enabled: raw.enabled !== false,
    mode,
    place,
    last,
    tint: raw.tint !== false,
    rainSound: raw.rainSound !== false,
    greet: raw.greet !== false,
    greeted: typeof raw.greeted === "string" ? raw.greeted.slice(0, 20) : "",
  };
}
