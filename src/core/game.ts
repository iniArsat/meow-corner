// Game: memegang GameState, menjalankan simulasi, dan menyediakan aksi pemain.
// Tidak tahu apa pun soal tampilan; UI mendengarkan event-nya.

import { BALANCE, CAT_NAMES, COATS, COAT_BY_ID, FACILITIES, RARITY_WEIGHT, TRAIT_IDS, UPGRADES, UPGRADE_BY_ID } from "./data";
import {
  baitCost,
  facilityCost,
  feedCost,
  hasTrait,
  offlineGain,
  prestigeGain,
  productionPerSecond,
  unlockedRarities,
} from "./economy";
import { createInitialState } from "./state";
import type { CatState, FacilityId, GameState, Rarity, UpgradeDef } from "./types";
import { FACILITY_IDS } from "./types";

export type GameEvent =
  | { type: "purchased"; facility: FacilityId; amount: number }
  | { type: "upgraded"; upgrade: string }
  | { type: "visitorArrived" }
  | { type: "visitorFed"; fed: number }
  | { type: "visitorReady" }
  | { type: "visitorLeft" }
  | { type: "adopted"; cat: CatState }
  | { type: "fed" }
  | { type: "petted"; catId: string }
  | { type: "sparkleAppeared" }
  | { type: "sparkleCaught"; reward: number }
  | { type: "sparkleExpired" }
  | { type: "offline"; fish: number; seconds: number }
  | { type: "prestiged"; gained: number }
  | { type: "catUpdated"; catId: string }
  | { type: "settings" };

type Listener = (e: GameEvent) => void;

/** Jeda lebih dari ini dianggap game sempat tertutup/tertidur (dihitung offline). */
export const OFFLINE_THRESHOLD_SECONDS = 30;

const MINUTE = 60_000;

export class Game {
  state: GameState;
  private listeners = new Set<Listener>();
  private rand: () => number;
  /** false saat strip disembunyikan; memengaruhi sifat Aktif dan kemunculan tamu. */
  visible = true;

  constructor(state?: GameState, rand: () => number = Math.random) {
    this.state = state ?? createInitialState(Date.now());
    this.rand = rand;
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  // -------------------------------------------------------------------------
  // Simulasi

  rate(now: number): number {
    return productionPerSecond(this.state, { online: true, now, visible: this.visible });
  }

  /** Majukan simulasi sampai `now`. Aman dipanggil setiap frame atau tiap detik. */
  tick(now: number): void {
    const s = this.state;
    const dt = (now - s.lastTick) / 1000;
    if (dt <= 0) {
      s.lastTick = Math.min(s.lastTick, now);
      return;
    }

    if (dt > OFFLINE_THRESHOLD_SECONDS) {
      const gain = offlineGain(s, dt, now);
      this.addFish(gain.fish);
      if (gain.fish > 0) this.emit({ type: "offline", fish: gain.fish, seconds: dt });
      // Jadwal tamu dan ikan berkilau dimulai lagi dari sekarang.
      s.nextVisitAt = Math.max(s.nextVisitAt, now + MINUTE);
      s.nextSparkleAt = Math.max(s.nextSparkleAt, now + MINUTE);
      // Tamu yang sudah siap diadopsi tetap menunggu; yang belum, pergi.
      if (s.visitor && s.visitor.fed < BALANCE.feedsToAdopt) {
        s.visitor = null;
        this.emit({ type: "visitorLeft" });
      }
      if (s.sparkle) {
        s.sparkle = null;
        this.emit({ type: "sparkleExpired" });
      }
    } else {
      this.addFish(this.rate(now) * dt);
    }

    this.drainHunger(dt);
    this.updateVisitor(now);
    this.updateSparkle(now);
    s.lastTick = now;
  }

  private addFish(n: number): void {
    if (!(n > 0)) return;
    const s = this.state;
    s.fish += n;
    s.totalFishRun += n;
    s.totalFishAll += n;
  }

  private drainHunger(dt: number): void {
    const perSecond = 1 / (BALANCE.hungerHours * 3600);
    for (const cat of this.state.cats) {
      const speed = cat.trait === "rakus" ? 2 : 1;
      cat.hunger = Math.max(0, cat.hunger - perSecond * speed * dt);
    }
  }

  private visitInterval(): number {
    const min = BALANCE.visitMinMinutes;
    const max = BALANCE.visitMaxMinutes;
    const minutes = min + this.rand() * (max - min);
    return (minutes * MINUTE) / (hasTrait(this.state, "penjelajah") ? 2 : 1);
  }

  private updateVisitor(now: number): void {
    const s = this.state;
    if (s.visitor) {
      const ready = s.visitor.fed >= BALANCE.feedsToAdopt;
      if (!ready && now >= s.visitor.leavesAt) {
        s.visitor = null;
        s.nextVisitAt = now + this.visitInterval();
        this.emit({ type: "visitorLeft" });
      }
      return;
    }
    if (this.visible && now >= s.nextVisitAt) this.spawnVisitor(now);
  }

  private updateSparkle(now: number): void {
    const s = this.state;
    if (s.sparkle) {
      if (now >= s.sparkle.expiresAt) {
        s.sparkle = null;
        s.nextSparkleAt = now + this.sparkleInterval();
        this.emit({ type: "sparkleExpired" });
      }
      return;
    }
    if (this.visible && now >= s.nextSparkleAt) {
      s.sparkle = {
        x: 0.08 + this.rand() * 0.6,
        appearedAt: now,
        expiresAt: now + BALANCE.sparkleStaySeconds * 1000,
      };
      this.emit({ type: "sparkleAppeared" });
    }
  }

  private sparkleInterval(): number {
    const min = BALANCE.sparkleMinMinutes;
    const max = BALANCE.sparkleMaxMinutes;
    return (min + this.rand() * (max - min)) * MINUTE;
  }

  // -------------------------------------------------------------------------
  // Toko

  facilityPrice(id: FacilityId, amount = 1): number {
    return facilityCost(id, this.state.facilities[id], amount);
  }

  /** Fasilitas tampil di toko setelah fasilitas sebelumnya dimiliki. */
  isFacilityVisible(id: FacilityId): boolean {
    const index = FACILITY_IDS.indexOf(id);
    if (index <= 1) return true;
    const prev = FACILITY_IDS[index - 1];
    return this.state.facilities[prev] > 0 || this.state.totalFishAll >= FACILITIES[id].baseCost * 0.5;
  }

  buyFacility(id: FacilityId, amount = 1): boolean {
    if (amount < 1) return false;
    const cost = this.facilityPrice(id, amount);
    if (this.state.fish < cost) return false;
    this.state.fish -= cost;
    const firstTime = this.state.facilities[id] === 0;
    this.state.facilities[id] += amount;
    if (firstTime) this.autoAssignIdleCats();
    this.emit({ type: "purchased", facility: id, amount });
    return true;
  }

  availableUpgrades(): UpgradeDef[] {
    const s = this.state;
    return UPGRADES.filter((u) => {
      if (s.upgrades.includes(u.id)) return false;
      const r = u.requires;
      if (r.facility && s.facilities[r.facility] < (r.owned ?? 1)) return false;
      if (r.upgrade && !s.upgrades.includes(r.upgrade)) return false;
      return true;
    });
  }

  buyUpgrade(id: string): boolean {
    const u = UPGRADE_BY_ID[id];
    if (!u || !this.availableUpgrades().some((a) => a.id === id)) return false;
    if (this.state.fish < u.cost) return false;
    this.state.fish -= u.cost;
    this.state.upgrades.push(id);
    this.emit({ type: "upgraded", upgrade: id });
    return true;
  }

  // -------------------------------------------------------------------------
  // Kucing

  feedPrice(now: number): number {
    return feedCost(this.state, now);
  }

  needsFood(): boolean {
    return this.state.cats.some((c) => c.hunger < 0.5);
  }

  feedAll(now: number): boolean {
    if (!this.state.cats.some((c) => c.hunger < 0.999)) return false;
    const cost = this.feedPrice(now);
    if (this.state.fish < cost) return false;
    this.state.fish -= cost;
    for (const c of this.state.cats) c.hunger = 1;
    this.emit({ type: "fed" });
    return true;
  }

  petCat(catId: string, now: number): boolean {
    const cat = this.state.cats.find((c) => c.id === catId);
    if (!cat) return false;
    cat.lastPetAt = now;
    this.state.spiritUntil = now + BALANCE.spiritMinutes * MINUTE;
    this.state.stats.petted += 1;
    this.emit({ type: "petted", catId });
    return true;
  }

  slotsUsed(id: FacilityId, exceptCatId?: string): number {
    return this.state.cats.filter((c) => c.facility === id && c.id !== exceptCatId).length;
  }

  assignCat(catId: string, facility: FacilityId | null): boolean {
    const cat = this.state.cats.find((c) => c.id === catId);
    if (!cat) return false;
    if (facility !== null) {
      if (this.state.facilities[facility] <= 0) return false;
      if (this.slotsUsed(facility, catId) >= BALANCE.slotsPerFacility) return false;
    }
    cat.facility = facility;
    this.emit({ type: "catUpdated", catId });
    return true;
  }

  renameCat(catId: string, name: string): boolean {
    const cat = this.state.cats.find((c) => c.id === catId);
    const clean = name.trim().slice(0, 16);
    if (!cat || !clean) return false;
    cat.name = clean;
    this.emit({ type: "catUpdated", catId });
    return true;
  }

  /** Tugaskan kucing yang menganggur ke fasilitas yang masih punya slot. */
  private autoAssignIdleCats(): void {
    for (const cat of this.state.cats) {
      if (cat.facility !== null) continue;
      const target = this.bestFreeFacility(COAT_BY_ID[cat.coat]?.rarity ?? "biasa");
      if (target) cat.facility = target;
    }
  }

  private bestFreeFacility(rarity: Rarity): FacilityId | null {
    const owned = FACILITY_IDS.filter((id) => this.state.facilities[id] > 0);
    const free = owned.filter((id) => this.slotsUsed(id) < BALANCE.slotsPerFacility);
    // Utamakan fasilitas yang menarik kelangkaan kucing ini, lalu yang paling produktif.
    const matching = free.filter((id) => FACILITIES[id].attracts === rarity);
    const pool = matching.length > 0 ? matching : free;
    if (pool.length === 0) return null;
    return pool.reduce((best, id) => (FACILITIES[id].baseRate > FACILITIES[best].baseRate ? id : best));
  }

  // -------------------------------------------------------------------------
  // Kucing liar (tamu)

  baitPrice(): number {
    return baitCost(this.state);
  }

  callVisitor(now: number): boolean {
    if (this.state.visitor) return false;
    const cost = this.baitPrice();
    if (this.state.fish < cost) return false;
    this.state.fish -= cost;
    this.spawnVisitor(now);
    return true;
  }

  private pickRarity(): Rarity {
    const rarities = unlockedRarities(this.state);
    const total = rarities.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0);
    let roll = this.rand() * total;
    for (const r of rarities) {
      roll -= RARITY_WEIGHT[r];
      if (roll < 0) return r;
    }
    return rarities[rarities.length - 1];
  }

  private pickName(): string {
    const used = new Set(this.state.cats.map((c) => c.name));
    const free = CAT_NAMES.filter((n) => !used.has(n));
    const pool = free.length > 0 ? free : CAT_NAMES;
    return pool[Math.floor(this.rand() * pool.length)];
  }

  private spawnVisitor(now: number): void {
    const rarity = this.pickRarity();
    const coats = COATS.filter((c) => c.rarity === rarity);
    const owned = new Set(this.state.cats.map((c) => c.coat));
    const fresh = coats.filter((c) => !owned.has(c.id));
    // Separuh peluang diarahkan ke bulu yang belum dimiliki, agar koleksi terasa maju.
    const pool = fresh.length > 0 && this.rand() < 0.5 ? fresh : coats;
    const coat = pool[Math.floor(this.rand() * pool.length)];
    const trait = TRAIT_IDS[Math.floor(this.rand() * TRAIT_IDS.length)];
    this.state.visitor = {
      coat: coat.id,
      trait,
      name: this.pickName(),
      fed: 0,
      arrivedAt: now,
      leavesAt: now + BALANCE.visitStayMinutes * MINUTE,
    };
    if (!this.state.discovered.includes(coat.id)) this.state.discovered.push(coat.id);
    this.emit({ type: "visitorArrived" });
  }

  feedVisitor(now: number): number {
    const v = this.state.visitor;
    if (!v || v.fed >= BALANCE.feedsToAdopt) return v?.fed ?? 0;
    v.fed += 1;
    v.leavesAt = Math.max(v.leavesAt, now + MINUTE);
    this.emit({ type: "visitorFed", fed: v.fed });
    if (v.fed >= BALANCE.feedsToAdopt) this.emit({ type: "visitorReady" });
    return v.fed;
  }

  adoptVisitor(name: string, now: number): CatState | null {
    const v = this.state.visitor;
    if (!v || v.fed < BALANCE.feedsToAdopt) return null;
    this.state.catCounter += 1;
    const cat: CatState = {
      id: `cat-${this.state.catCounter}-${now.toString(36)}`,
      name: name.trim().slice(0, 16) || v.name,
      coat: v.coat,
      trait: v.trait,
      facility: this.bestFreeFacility(COAT_BY_ID[v.coat]?.rarity ?? "biasa"),
      hunger: 1,
      lastPetAt: 0,
      adoptedAt: now,
    };
    this.state.cats.push(cat);
    this.state.visitor = null;
    this.state.stats.catsAdopted += 1;
    this.state.nextVisitAt = now + this.visitInterval();
    this.emit({ type: "adopted", cat });
    return cat;
  }

  releaseVisitor(now: number): void {
    if (!this.state.visitor) return;
    this.state.visitor = null;
    this.state.nextVisitAt = now + this.visitInterval();
    this.emit({ type: "visitorLeft" });
  }

  // -------------------------------------------------------------------------
  // Ikan berkilau

  catchSparkle(now: number): number {
    if (!this.state.sparkle) return 0;
    const reward = Math.max(10, this.rate(now) * BALANCE.sparkleRewardSeconds);
    this.addFish(reward);
    this.state.sparkle = null;
    this.state.nextSparkleAt = now + this.sparkleInterval();
    this.state.stats.sparklesCaught += 1;
    this.emit({ type: "sparkleCaught", reward });
    return reward;
  }

  // -------------------------------------------------------------------------
  // Prestige: Pindah Rumah

  prestigePreview(): number {
    return prestigeGain(this.state.totalFishRun);
  }

  prestige(now: number): number {
    const gained = this.prestigePreview();
    if (gained < 1) return 0;
    const s = this.state;
    s.stars += gained;
    s.fish = BALANCE.startingFish;
    s.totalFishRun = 0;
    for (const id of FACILITY_IDS) s.facilities[id] = 0;
    // Upgrade fasilitas ikut hilang; upgrade kasur (offline) tetap.
    s.upgrades = s.upgrades.filter((id) => UPGRADE_BY_ID[id]?.effect.kind === "offlineCap");
    for (const c of s.cats) c.facility = null;
    s.stats.prestiges += 1;
    s.lastTick = now;
    this.emit({ type: "prestiged", gained });
    return gained;
  }

  // -------------------------------------------------------------------------

  updateSettings(patch: Partial<GameState["settings"]>): void {
    Object.assign(this.state.settings, patch);
    this.emit({ type: "settings" });
  }
}
