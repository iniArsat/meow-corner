// Pembuatan state awal dan migrasi data simpanan.

import { BALANCE, COAT_BY_ID, TRAIT_IDS, UPGRADE_BY_ID } from "./data";
import type { CatState, FacilityId, GameState, Settings, TraitId, VisitorState } from "./types";
import { FACILITY_IDS } from "./types";

export const SAVE_VERSION = 1;

const MINUTE = 60_000;

export function emptyFacilities(): Record<FacilityId, number> {
  return { mangkuk: 0, benang: 0, kardus: 0, tiang: 0, akuarium: 0, rak: 0 };
}

export function defaultSettings(): Settings {
  return { scale: 3, sound: false, focusMode: false };
}

export function createInitialState(now: number): GameState {
  const starter: CatState = {
    id: "cat-1",
    name: "Oyen",
    coat: "oyen",
    trait: "aktif",
    facility: null,
    hunger: 1,
    lastPetAt: 0,
    adoptedAt: now,
  };
  return {
    version: SAVE_VERSION,
    fish: BALANCE.startingFish,
    totalFishRun: 0,
    totalFishAll: 0,
    stars: 0,
    facilities: emptyFacilities(),
    upgrades: [],
    cats: [starter],
    discovered: ["oyen"],
    lastTick: now,
    spiritUntil: 0,
    // Tamu pertama datang cepat supaya pemain langsung mengenal mekanik adopsi.
    nextVisitAt: now + 2 * MINUTE,
    visitor: null,
    nextSparkleAt: now + 90_000,
    sparkle: null,
    catCounter: 1,
    settings: defaultSettings(),
    stats: { petted: 0, prestiges: 0, sparklesCaught: 0, catsAdopted: 1, startedAt: now },
  };
}

// ---------------------------------------------------------------------------
// Migrasi: menerima data mentah dari file simpanan dan memulihkannya dengan
// aman. Field yang hilang atau rusak diganti nilai bawaan, bukan membuat crash.

function num(v: unknown, fallback: number, min = -Infinity): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, v) : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function migrateCat(raw: unknown, now: number): CatState | null {
  if (!isRecord(raw)) return null;
  const coat = str(raw.coat, "");
  if (!COAT_BY_ID[coat]) return null;
  const trait = (TRAIT_IDS as readonly string[]).includes(str(raw.trait, ""))
    ? (raw.trait as TraitId)
    : "aktif";
  const facility = (FACILITY_IDS as readonly string[]).includes(str(raw.facility, ""))
    ? (raw.facility as FacilityId)
    : null;
  return {
    id: str(raw.id, `cat-${Math.floor(now)}-${Math.random().toString(36).slice(2, 6)}`),
    name: str(raw.name, "Kucing").slice(0, 16),
    coat,
    trait,
    facility,
    hunger: Math.min(1, num(raw.hunger, 1, 0)),
    lastPetAt: num(raw.lastPetAt, 0, 0),
    adoptedAt: num(raw.adoptedAt, now, 0),
  };
}

function migrateVisitor(raw: unknown, now: number): VisitorState | null {
  if (!isRecord(raw)) return null;
  const coat = str(raw.coat, "");
  const trait = str(raw.trait, "");
  const fed = Math.floor(num(raw.fed, 0, 0));
  if (!COAT_BY_ID[coat] || !(TRAIT_IDS as readonly string[]).includes(trait)) return null;
  if (fed < BALANCE.feedsToAdopt) return null;
  return {
    coat,
    trait: trait as TraitId,
    name: str(raw.name, "Kucing").slice(0, 16),
    fed: BALANCE.feedsToAdopt,
    arrivedAt: num(raw.arrivedAt, now, 0),
    leavesAt: Math.max(num(raw.leavesAt, now, 0), now + 60_000),
  };
}

export function migrateState(raw: unknown, now: number): GameState | null {
  if (!isRecord(raw)) return null;
  const base = createInitialState(now);

  const facilities = emptyFacilities();
  if (isRecord(raw.facilities)) {
    for (const id of FACILITY_IDS) facilities[id] = Math.floor(num(raw.facilities[id], 0, 0));
  }

  const cats = Array.isArray(raw.cats)
    ? raw.cats.map((c) => migrateCat(c, now)).filter((c): c is CatState => c !== null)
    : base.cats;

  const settings = defaultSettings();
  if (isRecord(raw.settings)) {
    settings.scale = raw.settings.scale === 2 ? 2 : 3;
    settings.sound = raw.settings.sound === true;
    settings.focusMode = raw.settings.focusMode === true;
  }

  const stats = { ...base.stats };
  if (isRecord(raw.stats)) {
    stats.petted = num(raw.stats.petted, 0, 0);
    stats.prestiges = num(raw.stats.prestiges, 0, 0);
    stats.sparklesCaught = num(raw.stats.sparklesCaught, 0, 0);
    stats.catsAdopted = num(raw.stats.catsAdopted, cats.length, 0);
    stats.startedAt = num(raw.stats.startedAt, now, 0);
  }

  const discovered = Array.isArray(raw.discovered)
    ? raw.discovered.filter((d): d is string => typeof d === "string" && !!COAT_BY_ID[d])
    : [];
  for (const c of cats) if (!discovered.includes(c.coat)) discovered.push(c.coat);

  const lastTick = num(raw.lastTick, now, 0);

  return {
    version: SAVE_VERSION,
    fish: num(raw.fish, base.fish, 0),
    totalFishRun: num(raw.totalFishRun, 0, 0),
    totalFishAll: num(raw.totalFishAll, 0, 0),
    stars: Math.floor(num(raw.stars, 0, 0)),
    facilities,
    upgrades: Array.isArray(raw.upgrades)
      ? raw.upgrades.filter((u): u is string => typeof u === "string" && !!UPGRADE_BY_ID[u])
      : [],
    cats: cats.length > 0 ? cats : base.cats,
    discovered,
    // Jam sistem yang mundur tidak boleh membuat waktu offline negatif.
    lastTick: Math.min(lastTick, now),
    spiritUntil: num(raw.spiritUntil, 0, 0),
    // Tamu yang belum siap dan ikan berkilau tidak dipulihkan; dijadwalkan ulang dari sekarang.
    // Tamu yang sudah diberi makan 3 kali dipulihkan agar umpan pemain tidak hilang.
    nextVisitAt: now + 60_000,
    visitor: migrateVisitor(raw.visitor, now),
    nextSparkleAt: now + 90_000,
    sparkle: null,
    catCounter: Math.floor(num(raw.catCounter, cats.length, 0)),
    settings,
    stats,
  };
}
