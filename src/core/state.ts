// Pembuatan state awal dan migrasi data simpanan.

import { ACHIEVEMENT_BY_ID } from "./achievements";
import { defaultAssistant, migrateAssistant } from "./assistant";
import { defaultWeather, migrateWeather } from "./weather";
import { ACCESSORY_BY_ID, BALANCE, COAT_BY_ID, TRAIT_IDS, UPGRADE_BY_ID } from "./data";
import type {
  CatState,
  ChatState,
  FacilityId,
  GameState,
  GiftItem,
  GiftState,
  Inventory,
  Settings,
  Stats,
  TraitId,
  TypingState,
  VisitorState,
} from "./types";
import { FACILITY_IDS } from "./types";

/**
 * v1: rilis pertama. v2: ikatan, aksesori, camilan, hadiah. v3: asisten, prestasi,
 * hadiah harian. v4: suara menyala bawaan, volume, musik, ukuran panel bawah.
 * v5: cuaca dan waktu. v6: obrolan dengan kucing dan kucing ikut mengetik.
 */
export const SAVE_VERSION = 6;

const MINUTE = 60_000;

export function emptyFacilities(): Record<FacilityId, number> {
  return { mangkuk: 0, benang: 0, kardus: 0, tiang: 0, akuarium: 0, rak: 0 };
}

export function defaultSettings(): Settings {
  return {
    scale: 3,
    sound: true,
    volume: 0.7,
    music: false,
    focusMode: false,
    hudSize: "full",
    hudCollapsed: false,
    hudOpacity: 1,
  };
}

function defaultStats(now: number): Stats {
  return {
    petted: 0,
    prestiges: 0,
    sparklesCaught: 0,
    catsAdopted: 1,
    startedAt: now,
    treatsGiven: 0,
    toyCatches: 0,
    giftsReceived: 0,
    purrs: 0,
    catsReleased: 0,
    remindersFired: 0,
    focusSessions: 0,
    focusMinutes: 0,
    todosDone: 0,
    wellnessDone: 0,
    photos: 0,
    chats: 0,
    taps: 0,
  };
}

export function defaultChat(): ChatState {
  return { playerName: "", askedName: false, chatter: true, story: {} };
}

export function defaultTyping(): TypingState {
  return { enabled: false, asked: false, catId: null, today: 0, todayDate: "", fishToday: 0, best: 0 };
}

/** Nama panggilan pemain: dipangkas, tanpa karakter kendali, paling panjang 20 huruf. */
export function cleanPlayerName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f<>{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
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
    bond: 0,
    accessory: null,
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
    inventory: { treats: BALANCE.startingTreats, accessories: [] },
    gifts: [],
    giftCounter: 0,
    settings: defaultSettings(),
    stats: defaultStats(now),
    assistant: defaultAssistant(now),
    achievements: [],
    daily: { lastDate: "", streak: 0, best: 0 },
    weather: defaultWeather(),
    chat: defaultChat(),
    typing: defaultTyping(),
  };
}

// ---------------------------------------------------------------------------
// Migrasi: menerima data mentah dari file simpanan dan memulihkannya dengan
// aman. Field yang hilang atau rusak diganti nilai bawaan, bukan membuat crash.
// Simpanan v1 tidak punya ikatan/aksesori/camilan; semuanya diberi nilai awal.

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
  const accessory = str(raw.accessory, "");
  return {
    id: str(raw.id, `cat-${Math.floor(now)}-${Math.random().toString(36).slice(2, 6)}`),
    name: str(raw.name, "Kucing").slice(0, 16),
    coat,
    trait,
    facility,
    hunger: Math.min(1, num(raw.hunger, 1, 0)),
    lastPetAt: num(raw.lastPetAt, 0, 0),
    adoptedAt: num(raw.adoptedAt, now, 0),
    bond: Math.min(BALANCE.maxBond, num(raw.bond, 0, 0)),
    accessory: ACCESSORY_BY_ID[accessory] ? accessory : null,
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

function migrateGiftItem(raw: unknown): GiftItem | null {
  if (!isRecord(raw)) return null;
  switch (raw.kind) {
    case "fish":
      return { kind: "fish", seconds: num(raw.seconds, BALANCE.giftFishSeconds, 0) };
    case "treats":
      return { kind: "treats", amount: Math.floor(num(raw.amount, 1, 1)) };
    case "accessory": {
      const id = str(raw.id, "");
      return ACCESSORY_BY_ID[id] ? { kind: "accessory", id } : null;
    }
    case "trinket":
      return { kind: "trinket", name: str(raw.name, "Benda kecil").slice(0, 32) };
    default:
      return null;
  }
}

function migrateGifts(raw: unknown, now: number): GiftState[] {
  if (!Array.isArray(raw)) return [];
  const gifts: GiftState[] = [];
  for (const g of raw) {
    if (!isRecord(g)) continue;
    const item = migrateGiftItem(g.item);
    if (!item) continue;
    gifts.push({
      id: str(g.id, `gift-${gifts.length}-${Math.floor(now)}`),
      catId: str(g.catId, ""),
      item,
      x: Math.min(1, num(g.x, 0.5, 0)),
      createdAt: num(g.createdAt, now, 0),
    });
  }
  // Hadiah harian boleh melebihi batas kado acak; jangan sampai hilang saat dimuat.
  return gifts.slice(0, BALANCE.maxGiftsOnStrip + 7);
}

function migrateInventory(raw: unknown): Inventory {
  if (!isRecord(raw)) return { treats: BALANCE.startingTreats, accessories: [] };
  const accessories = Array.isArray(raw.accessories)
    ? [...new Set(raw.accessories.filter((a): a is string => typeof a === "string" && !!ACCESSORY_BY_ID[a]))]
    : [];
  return { treats: Math.floor(num(raw.treats, 0, 0)), accessories };
}

function migrateChat(raw: unknown, catIds: Set<string>): ChatState {
  const base = defaultChat();
  if (!isRecord(raw)) return base;
  const story: Record<string, number> = {};
  if (isRecord(raw.story)) {
    for (const [id, v] of Object.entries(raw.story)) if (catIds.has(id)) story[id] = Math.floor(num(v, 0, 0));
  }
  return {
    playerName: cleanPlayerName(str(raw.playerName, "")),
    askedName: raw.askedName === true,
    chatter: raw.chatter !== false,
    story,
  };
}

function migrateTyping(raw: unknown, catIds: Set<string>): TypingState {
  const base = defaultTyping();
  if (!isRecord(raw)) return base;
  const catId = str(raw.catId, "");
  return {
    enabled: raw.enabled === true,
    asked: raw.asked === true,
    catId: catIds.has(catId) ? catId : null,
    today: Math.floor(num(raw.today, 0, 0)),
    todayDate: /^\d{4}-\d{2}-\d{2}$/.test(str(raw.todayDate, "")) ? (raw.todayDate as string) : "",
    fishToday: num(raw.fishToday, 0, 0),
    best: Math.floor(num(raw.best, 0, 0)),
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

  const inventory = migrateInventory(raw.inventory);
  // Aksesori yang dipakai kucing harus tercatat sebagai milik pemain, dan satu
  // aksesori hanya dipakai satu kucing.
  const worn = new Set<string>();
  for (const c of cats) {
    if (!c.accessory) continue;
    if (worn.has(c.accessory)) c.accessory = null;
    else {
      worn.add(c.accessory);
      if (!inventory.accessories.includes(c.accessory)) inventory.accessories.push(c.accessory);
    }
  }

  const settings = defaultSettings();
  if (isRecord(raw.settings)) {
    const rs = raw.settings;
    settings.scale = rs.scale === 2 ? 2 : 3;
    // Sebelum v4 suara mati secara bawaan dan banyak pemain tidak tahu ada suara;
    // nyalakan sekali saat pindah ke v4. Setelah itu pilihan pemain dihormati.
    const before4 = num(raw.version, 1) < 4;
    settings.sound = before4 ? true : rs.sound !== false;
    settings.volume = num(rs.volume, 0.7, 0) > 1 ? 1 : num(rs.volume, 0.7, 0);
    settings.music = rs.music === true;
    settings.focusMode = rs.focusMode === true;
    settings.hudSize = rs.hudSize === "compact" ? "compact" : "full";
    settings.hudCollapsed = rs.hudCollapsed === true;
    settings.hudOpacity = Math.min(1, num(rs.hudOpacity, 1, 0.3));
  }

  const stats = defaultStats(now);
  if (isRecord(raw.stats)) {
    const rs = raw.stats;
    stats.petted = num(rs.petted, 0, 0);
    stats.prestiges = num(rs.prestiges, 0, 0);
    stats.sparklesCaught = num(rs.sparklesCaught, 0, 0);
    stats.catsAdopted = num(rs.catsAdopted, cats.length, 0);
    stats.startedAt = num(rs.startedAt, now, 0);
    stats.treatsGiven = num(rs.treatsGiven, 0, 0);
    stats.toyCatches = num(rs.toyCatches, 0, 0);
    stats.giftsReceived = num(rs.giftsReceived, 0, 0);
    stats.purrs = num(rs.purrs, 0, 0);
    stats.catsReleased = num(rs.catsReleased, 0, 0);
    stats.remindersFired = num(rs.remindersFired, 0, 0);
    stats.focusSessions = num(rs.focusSessions, 0, 0);
    stats.focusMinutes = num(rs.focusMinutes, 0, 0);
    stats.todosDone = num(rs.todosDone, 0, 0);
    stats.wellnessDone = num(rs.wellnessDone, 0, 0);
    stats.photos = num(rs.photos, 0, 0);
    stats.chats = num(rs.chats, 0, 0);
    stats.taps = num(rs.taps, 0, 0);
  }

  const daily = { lastDate: "", streak: 0, best: 0 };
  if (isRecord(raw.daily)) {
    daily.lastDate = /^\d{4}-\d{2}-\d{2}$/.test(str(raw.daily.lastDate, "")) ? (raw.daily.lastDate as string) : "";
    daily.streak = Math.floor(num(raw.daily.streak, 0, 0));
    daily.best = Math.max(daily.streak, Math.floor(num(raw.daily.best, 0, 0)));
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
    inventory,
    gifts: migrateGifts(raw.gifts, now),
    giftCounter: Math.floor(num(raw.giftCounter, 0, 0)),
    settings,
    stats,
    assistant: migrateAssistant(raw.assistant, now),
    achievements: Array.isArray(raw.achievements)
      ? [...new Set(raw.achievements.filter((a): a is string => typeof a === "string" && !!ACHIEVEMENT_BY_ID[a]))]
      : [],
    daily,
    weather: migrateWeather(raw.weather),
    chat: migrateChat(raw.chat, new Set(cats.map((c) => c.id))),
    typing: migrateTyping(raw.typing, new Set(cats.map((c) => c.id))),
  };
}
