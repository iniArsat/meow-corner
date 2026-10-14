// Pengambilan data cuaca dari internet: Open-Meteo (cuaca dan pencarian kota,
// gratis tanpa akun) dan GeoJS (perkiraan lokasi dari alamat IP, hanya bila diminta).

import type { WeatherPlace, WeatherSnapshot } from "../core/types";
import { IP_GEO_URL, forecastUrl, geocodeUrl, parseForecast, parseGeocode, parseIpGeo } from "../core/weather";

async function fetchJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (controller.signal.aborted) throw new Error("waktu habis");
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchForecast(place: WeatherPlace): Promise<WeatherSnapshot> {
  const snap = parseForecast(await fetchJson(forecastUrl(place.lat, place.lon)), Date.now());
  if (!snap) throw new Error("data cuaca tidak dikenali");
  return snap;
}

export async function searchPlaces(name: string): Promise<WeatherPlace[]> {
  if (name.trim().length < 2) return [];
  return parseGeocode(await fetchJson(geocodeUrl(name)));
}

export async function detectPlace(): Promise<WeatherPlace | null> {
  return parseIpGeo(await fetchJson(IP_GEO_URL));
}

/** Pesan galat yang ramah untuk ditampilkan. */
export function weatherError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch|NetworkError|Load failed|waktu habis/i.test(msg)) return "Tidak bisa terhubung ke internet.";
  return `Gagal mengambil cuaca (${msg}).`;
}
