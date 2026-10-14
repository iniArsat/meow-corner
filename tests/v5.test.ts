import { describe, expect, it } from "vitest";
import { Game, type GameEvent } from "../src/core/game";
import { SAVE_VERSION, createInitialState, migrateState } from "../src/core/state";
import {
  currentWeather,
  dayPhase,
  forecastUrl,
  geocodeUrl,
  isDark,
  lightTint,
  needsRefresh,
  parseForecast,
  parseGeocode,
  parseIpGeo,
  cityClock,
  greetKey,
  sunFor,
  weatherKind,
} from "../src/core/weather";

/** Rabu, 14 Oktober 2026, waktu lokal. */
const at = (h: number, m = 0, day = 14) => new Date(2026, 9, day, h, m).getTime();

const SNAP = {
  code: 61,
  temp: 26.4,
  feels: 28,
  humidity: 88,
  wind: 12,
  isDay: true,
  sunrise: at(5, 40),
  sunset: at(17, 52),
  utcOffset: null,
  fetchedAt: at(15),
};

describe("kode cuaca", () => {
  it("WMO dipetakan ke jenis cuaca", () => {
    expect(weatherKind(0)).toBe("clear");
    expect(weatherKind(2)).toBe("partly");
    expect(weatherKind(3)).toBe("cloudy");
    expect(weatherKind(45)).toBe("fog");
    expect(weatherKind(53)).toBe("drizzle");
    expect(weatherKind(63)).toBe("rain");
    expect(weatherKind(81)).toBe("rain");
    expect(weatherKind(75)).toBe("snow");
    expect(weatherKind(95)).toBe("storm");
  });
});

describe("fase hari", () => {
  const sun = sunFor(at(12), SNAP);
  it("mengikuti matahari terbit dan terbenam", () => {
    expect(dayPhase(at(3), sun)).toBe("dini");
    expect(dayPhase(at(5, 30), sun)).toBe("fajar");
    expect(dayPhase(at(7), sun)).toBe("pagi");
    expect(dayPhase(at(12), sun)).toBe("siang");
    expect(dayPhase(at(16), sun)).toBe("sore");
    expect(dayPhase(at(17, 45), sun)).toBe("senja");
    expect(dayPhase(at(20), sun)).toBe("malam");
    expect(dayPhase(at(23), sun)).toBe("malam");
    expect(isDark(dayPhase(at(2), sun))).toBe(true);
  });

  it("tanpa data memakai 06.00 dan 18.00; data kemarin digeser ke hari ini", () => {
    expect(sunFor(at(12), null)).toEqual({ sunrise: at(6), sunset: at(18), utcOffset: null });
    const moved = sunFor(at(12, 0, 15), SNAP);
    expect(moved.sunrise).toBe(at(5, 40, 15));
    // Lewat tengah malam: siklus berikutnya yang dipakai, tetap dini hari.
    expect(dayPhase(at(0, 30, 15), sunFor(at(0, 30, 15), SNAP))).toBe("dini");
    expect(dayPhase(at(23, 30), sunFor(at(23, 30), SNAP))).toBe("malam");
  });

  it("kota di zona waktu lain memakai jam kota itu", () => {
    // New York, 14 Okt 2026 (UTC-4): terbit 07.12, terbenam 18.20 waktu setempat.
    const utc = (d: number, h: number, m = 0) => Date.UTC(2026, 9, d, h, m);
    const ny = { ...SNAP, sunrise: utc(14, 11, 12), sunset: utc(14, 22, 20), utcOffset: -4 * 3600 };
    const phaseAt = (t: number) => dayPhase(t, sunFor(t, ny));
    expect(phaseAt(utc(14, 12))).toBe("pagi"); // 08.00 di New York
    expect(phaseAt(utc(14, 16))).toBe("siang"); // 12.00
    expect(phaseAt(utc(14, 20))).toBe("sore"); // 16.00
    expect(phaseAt(utc(15, 2))).toBe("malam"); // 22.00
    expect(phaseAt(utc(15, 7))).toBe("dini"); // 03.00 tanggal 15
    // Data dua hari lalu tetap dipakai untuk siklus terdekat.
    expect(phaseAt(utc(16, 16))).toBe("siang");
    expect(cityClock(ny.sunrise, ny.utcOffset)).toBe("07.12");
    expect(greetKey(utc(15, 2), "malam", ny.utcOffset)).toBe("2026-10-14:malam");
    const noon = lightTint(utc(14, 16), sunFor(utc(14, 16), ny), "clear");
    expect(noon).toBe(0xffffff);
  });

  it("warna cahaya: malam kebiruan, siang putih, hujan lebih kelabu", () => {
    const night = lightTint(at(22), sun, "clear");
    const noon = lightTint(at(12), sun, "clear");
    const rainNoon = lightTint(at(12), sun, "rain");
    expect(noon).toBe(0xffffff);
    expect(night & 0xff).toBeGreaterThan((night >> 16) & 0xff);
    expect(rainNoon).toBeLessThan(noon);
    const dusk = lightTint(at(17, 52), sun, "clear");
    expect((dusk >> 16) & 0xff).toBeGreaterThan(dusk & 0xff);
  });
});

describe("respons API", () => {
  it("Open-Meteo: waktu unix atau ISO lokal", () => {
    const unix = parseForecast(
      {
        utc_offset_seconds: 25200,
        current: { temperature_2m: 26.4, relative_humidity_2m: 88, apparent_temperature: 28, is_day: 1, weather_code: 61, wind_speed_10m: 12 },
        daily: { sunrise: [1792018800], sunset: [1792062720] },
      },
      at(15),
    )!;
    expect(unix.code).toBe(61);
    expect(unix.isDay).toBe(true);
    expect(unix.sunrise).toBe(1792018800 * 1000);
    expect(unix.utcOffset).toBe(25200);
    const iso = parseForecast(
      { utc_offset_seconds: 25200, current: { temperature_2m: 20, weather_code: 3, is_day: 0 }, daily: { sunrise: ["2026-10-14T05:40"], sunset: ["2026-10-14T17:52"] } },
      at(15),
    )!;
    expect(iso.sunrise).toBe(Date.UTC(2026, 9, 14, 5, 40) - 25200 * 1000);
    expect(parseForecast({ current: { weather_code: "x" } }, at(15))).toBeNull();
    expect(parseForecast("rusak", at(15))).toBeNull();
  });

  it("geokoding dan lokasi IP", () => {
    const places = parseGeocode({
      results: [
        { name: "Bandung", admin1: "Jawa Barat", country: "Indonesia", latitude: -6.9, longitude: 107.6 },
        { name: "Tanpa koordinat" },
      ],
    });
    expect(places).toEqual([{ name: "Bandung", region: "Jawa Barat", country: "Indonesia", lat: -6.9, lon: 107.6 }]);
    expect(parseGeocode({})).toEqual([]);
    expect(parseIpGeo({ latitude: "-6.2", longitude: "106.8", city: "Jakarta", country: "Indonesia" })?.lat).toBeCloseTo(-6.2);
    expect(parseIpGeo({ city: "x" })).toBeNull();
    expect(forecastUrl(-6.2, 106.8)).toContain("timeformat=unixtime");
    expect(geocodeUrl(" Surabaya ")).toContain("name=Surabaya");
  });
});

describe("keadaan cuaca di game", () => {
  it("cuaca sungguhan, usang, dan pilihan manual", () => {
    const game = new Game(createInitialState(at(15)));
    const events: GameEvent[] = [];
    game.on((e) => events.push(e));
    const w = game.state.weather;
    expect(needsRefresh(w, at(15))).toBe(false);
    game.setWeatherPlace({ name: "Jakarta", region: "", country: "Indonesia", lat: -6.2, lon: 106.8 }, at(15));
    expect(needsRefresh(w, at(15))).toBe(true);
    game.setWeatherSnapshot(SNAP, at(15));
    expect(currentWeather(w, at(15)).kind).toBe("rain");
    // Data pertama bukan berarti "hujan mulai turun": tanpa pengumuman.
    expect(events.some((e) => e.type === "weatherChanged" && e.from === "clear" && e.to === "rain" && e.reason === "other")).toBe(true);
    game.setWeatherSnapshot({ ...SNAP, code: 1, fetchedAt: at(15, 5) }, at(15, 5));
    expect(events.some((e) => e.type === "weatherChanged" && e.from === "rain" && e.to === "clear" && e.reason === "live")).toBe(true);
    game.setWeatherSnapshot(SNAP, at(15));
    expect(needsRefresh(w, at(15, 10))).toBe(false);
    expect(needsRefresh(w, at(15, 30))).toBe(true);
    // Data lebih dari 3 jam dianggap usang.
    expect(currentWeather(w, at(19)).source).toBe("none");
    game.updateWeather({ mode: "snow" }, at(15));
    expect(currentWeather(w, at(15)).kind).toBe("snow");
    expect(events.some((e) => e.type === "weatherChanged" && e.to === "snow" && e.reason === "manual")).toBe(true);
    game.updateWeather({ enabled: false }, at(15));
    expect(currentWeather(w, at(15)).source).toBe("none");
  });

  it("sapaan sekali per fase per hari", () => {
    const game = new Game(createInitialState(at(7)));
    const events: GameEvent[] = [];
    game.on((e) => events.push(e));
    expect(game.checkGreeting(at(7))).toBe("pagi");
    expect(game.checkGreeting(at(8))).toBeNull();
    expect(game.checkGreeting(at(12))).toBe("siang");
    expect(game.checkGreeting(at(16))).toBe("sore");
    expect(game.checkGreeting(at(20))).toBe("malam");
    expect(game.checkGreeting(at(3, 0, 15))).toBeNull();
    expect(game.checkGreeting(at(7, 0, 15))).toBe("pagi");
    expect(events.filter((e) => e.type === "greeting")).toHaveLength(5);
    game.updateWeather({ greet: false }, at(12, 0, 15));
    expect(game.checkGreeting(at(12, 0, 15))).toBeNull();
  });

  it("migrasi v4 ke v5 dan data cuaca rusak", () => {
    const s = migrateState(
      {
        version: 4,
        cats: [{ coat: "oyen" }],
        weather: { mode: "hujan-es", place: { name: "Kota", lat: 200, lon: 1 }, last: { code: 3 }, tint: false },
      },
      at(12),
    )!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.weather.mode).toBe("auto");
    expect(s.weather.place).toBeNull();
    expect(s.weather.last).toBeNull();
    expect(s.weather.tint).toBe(false);
    expect(s.weather.enabled).toBe(true);
    const ok = migrateState({ version: 5, cats: [{ coat: "oyen" }], weather: { mode: "rain", place: { name: "Bogor", lat: -6.6, lon: 106.8 }, last: SNAP } }, at(12))!;
    expect(ok.weather.mode).toBe("rain");
    expect(ok.weather.place?.name).toBe("Bogor");
    expect(ok.weather.last?.code).toBe(61);
  });
});
