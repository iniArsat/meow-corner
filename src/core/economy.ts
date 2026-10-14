// Fungsi ekonomi murni: tidak menyentuh UI, mudah diuji.

import { BALANCE, COAT_BY_ID, FACILITIES, RARITY_BONUS, UPGRADE_BY_ID } from "./data";
import type { CatState, FacilityId, GameState, ProductionContext, Rarity } from "./types";
import { FACILITY_IDS } from "./types";

const HOUR = 3_600_000;

/** Harga membeli `amount` unit fasilitas ketika sudah memiliki `owned` unit. */
export function facilityCost(id: FacilityId, owned: number, amount = 1): number {
  const g = BALANCE.costGrowth;
  const first = FACILITIES[id].baseCost * Math.pow(g, owned);
  return Math.ceil((first * (Math.pow(g, amount) - 1)) / (g - 1));
}

/** Jumlah unit terbanyak yang terjangkau dengan ikan yang ada. */
export function maxAffordable(id: FacilityId, owned: number, fish: number): number {
  const g = BALANCE.costGrowth;
  const first = FACILITIES[id].baseCost * Math.pow(g, owned);
  if (fish < first) return 0;
  const n = Math.floor(Math.log((fish * (g - 1)) / first + 1) / Math.log(g));
  // Koreksi pembulatan agar hasil selalu benar-benar terjangkau.
  let k = Math.max(0, n);
  while (k > 0 && facilityCost(id, owned, k) > fish) k--;
  return k;
}

export function rarityOf(cat: CatState): Rarity {
  return COAT_BY_ID[cat.coat]?.rarity ?? "biasa";
}

export function isHungry(cat: CatState): boolean {
  return cat.hunger < BALANCE.hungryThreshold;
}

/** Sumbangan satu kucing terhadap pengali fasilitasnya (0,05 = +5%). */
export function catContribution(cat: CatState, ctx: ProductionContext): number {
  let bonus = RARITY_BONUS[rarityOf(cat)];
  switch (cat.trait) {
    case "pemalas":
      bonus += ctx.online ? -0.1 : 0.5;
      break;
    case "aktif":
      if (ctx.online && ctx.visible !== false) bonus += 0.15;
      break;
    case "rakus":
      bonus += 0.2;
      break;
    case "manja":
      if (cat.lastPetAt > 0 && ctx.now - cat.lastPetAt < 24 * HOUR) bonus += 0.3;
      break;
    case "penjelajah":
      break;
  }
  bonus = Math.max(0, bonus);
  return isHungry(cat) ? bonus * 0.5 : bonus;
}

/** Kucing yang sah bekerja di fasilitas (dibatasi jumlah slot, urut waktu adopsi). */
export function catsAt(state: GameState, id: FacilityId): CatState[] {
  if (state.facilities[id] <= 0) return [];
  return state.cats
    .filter((c) => c.facility === id)
    .sort((a, b) => a.adoptedAt - b.adoptedAt)
    .slice(0, BALANCE.slotsPerFacility);
}

export function upgradeMultiplier(state: GameState, id: FacilityId): number {
  let m = 1;
  for (const uid of state.upgrades) {
    const u = UPGRADE_BY_ID[uid];
    if (u && u.effect.kind === "facility" && u.effect.facility === id) m *= u.effect.multiplier;
  }
  return m;
}

export function facilityMultiplier(state: GameState, id: FacilityId, ctx: ProductionContext): number {
  const catBonus = catsAt(state, id).reduce((sum, c) => sum + catContribution(c, ctx), 0);
  return upgradeMultiplier(state, id) * (1 + catBonus);
}

export function spiritActive(state: GameState, now: number): boolean {
  return state.spiritUntil > now;
}

export function globalMultiplier(state: GameState, ctx: ProductionContext): number {
  let m = 1 + BALANCE.starBonus * state.stars;
  if (ctx.online && spiritActive(state, ctx.now)) m *= 1 + BALANCE.spiritBonus;
  return m;
}

/** Produksi satu jenis fasilitas, ikan per detik. */
export function facilityRate(state: GameState, id: FacilityId, ctx: ProductionContext): number {
  const owned = state.facilities[id];
  if (owned <= 0) return 0;
  return FACILITIES[id].baseRate * owned * facilityMultiplier(state, id, ctx) * globalMultiplier(state, ctx);
}

/** Total produksi, ikan per detik. */
export function productionPerSecond(state: GameState, ctx: ProductionContext): number {
  let total = BALANCE.baseIncome * globalMultiplier(state, ctx);
  for (const id of FACILITY_IDS) total += facilityRate(state, id, ctx);
  return total;
}

export function offlineCapHours(state: GameState): number {
  let hours: number = BALANCE.offlineCapHours;
  for (const uid of state.upgrades) {
    const u = UPGRADE_BY_ID[uid];
    if (u && u.effect.kind === "offlineCap") hours = Math.max(hours, u.effect.hours);
  }
  return hours;
}

/** Ikan yang terkumpul selama game ditutup. */
export function offlineGain(state: GameState, seconds: number, now: number): { fish: number; seconds: number } {
  const capped = Math.min(Math.max(0, seconds), offlineCapHours(state) * 3600);
  const rate = productionPerSecond(state, { online: false, now }) * BALANCE.offlineRate;
  return { fish: rate * capped, seconds: capped };
}

export function prestigeGain(totalFishRun: number): number {
  return Math.floor(Math.sqrt(Math.max(0, totalFishRun) / BALANCE.prestigeDivisor));
}

/** Ikan tambahan yang dibutuhkan untuk Bintang berikutnya. */
export function fishToNextStar(totalFishRun: number): number {
  const next = prestigeGain(totalFishRun) + 1;
  return next * next * BALANCE.prestigeDivisor - totalFishRun;
}

export function feedCost(state: GameState, now: number): number {
  const rate = productionPerSecond(state, { online: true, now });
  return Math.max(BALANCE.feedMinCost, Math.ceil(rate * BALANCE.feedCostSeconds));
}

export function baitCost(state: GameState): number {
  return Math.ceil(BALANCE.baitBaseCost * Math.pow(BALANCE.baitGrowth, state.cats.length));
}

/** Kelangkaan kucing liar yang sudah bisa mampir. */
export function unlockedRarities(state: GameState): Rarity[] {
  const set = new Set<Rarity>(["biasa"]);
  for (const id of FACILITY_IDS) if (state.facilities[id] > 0) set.add(FACILITIES[id].attracts);
  const order: Rarity[] = ["biasa", "langka", "epik", "legenda"];
  return order.filter((r) => set.has(r));
}

export function hasTrait(state: GameState, trait: CatState["trait"]): boolean {
  return state.cats.some((c) => c.trait === trait);
}
