// Game: memegang GameState, menjalankan simulasi, dan menyediakan aksi pemain.
// Tidak tahu apa pun soal tampilan; UI mendengarkan event-nya.

import {
  ACCESSORIES,
  ACCESSORY_BY_ID,
  BALANCE,
  CAT_NAMES,
  COATS,
  COAT_BY_ID,
  FACILITIES,
  RARITY_WEIGHT,
  TRAIT_IDS,
  TRINKETS,
  UPGRADES,
  UPGRADE_BY_ID,
} from "./data";
import {
  baitCost,
  facilityCost,
  feedCost,
  hasTrait,
  hearts,
  treatCost,
  offlineGain,
  prestigeGain,
  productionPerSecond,
  unlockedRarities,
} from "./economy";
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from "./achievements";
import {
  HOUR,
  MINUTE as MIN,
  WELLNESS_TEXT,
  wellnessAt,
  buildSchedule,
  dateKey,
  defaultDateFor,
  formatClock,
  atDateTime,
  nextReminderAt,
  parseTime,
  startOfDay,
  type Alert,
  type DueItem,
} from "./assistant";
import { cleanPlayerName, createInitialState } from "./state";
import { currentWeather, dayPhase, greetKey, sunFor, type DayPhase } from "./weather";
import type {
  AssistantState,
  CatState,
  ChatState,
  TypingState,
  FacilityId,
  GameState,
  GiftItem,
  GiftState,
  Rarity,
  Reminder,
  Repeat,
  Todo,
  UpgradeDef,
  WeatherKind,
  WeatherPlace,
  WeatherSnapshot,
  WeatherState,
  WellnessKind,
} from "./types";
import { FACILITY_IDS } from "./types";

export type GameEvent =
  | { type: "purchased"; facility: FacilityId; amount: number }
  | { type: "upgraded"; upgrade: string }
  | { type: "visitorArrived" }
  | { type: "visitorFed"; fed: number }
  | { type: "visitorReady" }
  | { type: "visitorLeft" }
  | { type: "adopted"; cat: CatState }
  | { type: "released"; cat: CatState }
  | { type: "fed" }
  | { type: "petted"; catId: string }
  | { type: "sparkleAppeared" }
  | { type: "sparkleCaught"; reward: number }
  | { type: "sparkleExpired" }
  | { type: "offline"; fish: number; seconds: number }
  | { type: "prestiged"; gained: number }
  | { type: "catUpdated"; catId: string }
  | { type: "settings" }
  | { type: "bond"; catId: string; hearts: number; levelUp: boolean }
  | { type: "purr"; catId: string }
  | { type: "treatGiven"; catId: string }
  | { type: "toyCatch"; catId: string; reward: number }
  | { type: "inventory" }
  | { type: "giftDropped"; gift: GiftState }
  | { type: "giftCollected"; gift: GiftState; title: string; detail: string }
  | { type: "assistant" }
  | { type: "alert"; alert: Alert }
  | { type: "achievement"; ids: string[] }
  | { type: "daily"; streak: number; catId: string }
  | { type: "todoDone"; todoId: string; reward: number }
  | { type: "weather" }
  /**
   * Jenis cuaca yang berlaku berubah. `reason`: "live" bila cuaca sungguhan berganti
   * (hujan mulai/reda), "manual" bila pemain memilih cuaca, "other" untuk sekadar
   * data pertama/lokasi baru/efek dinyalakan (tanpa pengumuman).
   */
  | { type: "weatherChanged"; from: WeatherKind; to: WeatherKind; reason: "live" | "manual" | "other" }
  | { type: "greeting"; phase: DayPhase }
  /** Pengaturan obrolan atau nama pemain berubah. */
  | { type: "chat" }
  /** Pengaturan kucing mengetik berubah. */
  | { type: "typing" };

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
    if (dt <= OFFLINE_THRESHOLD_SECONDS && this.visible) this.maybeSpawnGifts(dt, now);
    this.updateVisitor(now);
    this.updateSparkle(now);
    s.lastTick = now;
    if (now - this.lastSlowCheck >= 1000) {
      this.lastSlowCheck = now;
      this.checkDaily(now);
      this.checkAchievements(now);
    }
  }

  private lastSlowCheck = 0;

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
    const cat = this.cat(catId);
    if (!cat) return false;
    cat.lastPetAt = now;
    this.state.spiritUntil = now + BALANCE.spiritMinutes * MINUTE;
    this.state.stats.petted += 1;
    this.emit({ type: "petted", catId });
    // Ikatan dari klik dibatasi jeda agar tidak bisa dipanen dengan klik beruntun.
    const last = this.lastPetBond.get(catId) ?? 0;
    if (now - last >= BALANCE.petBondCooldownMs) {
      this.lastPetBond.set(catId, now);
      this.addBond(cat, BALANCE.bondPerPet);
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Ikatan, dengkur, camilan, mainan (v2)

  private lastPetBond = new Map<string, number>();
  private lastToyCatch = new Map<string, number>();
  private lastPurr = new Map<string, number>();

  cat(catId: string): CatState | undefined {
    return this.state.cats.find((c) => c.id === catId);
  }

  private addBond(cat: CatState, amount: number): void {
    const before = hearts(cat);
    cat.bond = Math.min(BALANCE.maxBond, Math.max(0, cat.bond + amount));
    const after = hearts(cat);
    this.emit({ type: "bond", catId: cat.id, hearts: after, levelUp: after > before });
  }

  /** Kucing mendengkur setelah diusap cukup lama. false bila masih dalam jeda. */
  purr(catId: string, now: number): boolean {
    const cat = this.cat(catId);
    if (!cat) return false;
    const last = this.lastPurr.get(catId);
    if (last !== undefined && now - last < BALANCE.purrCooldownMs) return false;
    this.lastPurr.set(catId, now);
    cat.lastPetAt = now;
    this.state.spiritUntil = now + BALANCE.spiritMinutes * MINUTE;
    this.state.stats.purrs += 1;
    this.emit({ type: "purr", catId });
    this.addBond(cat, BALANCE.bondPerPurr);
    return true;
  }

  treatPrice(now: number): number {
    return treatCost(this.state, now);
  }

  buyTreats(amount: number, now: number): boolean {
    if (amount < 1) return false;
    const cost = this.treatPrice(now) * amount;
    if (this.state.fish < cost) return false;
    this.state.fish -= cost;
    this.state.inventory.treats += amount;
    this.emit({ type: "inventory" });
    return true;
  }

  giveTreat(catId: string, _now: number): boolean {
    const cat = this.cat(catId);
    if (!cat || this.state.inventory.treats <= 0) return false;
    this.state.inventory.treats -= 1;
    cat.hunger = Math.min(1, cat.hunger + 0.35);
    this.state.stats.treatsGiven += 1;
    this.emit({ type: "treatGiven", catId });
    this.emit({ type: "inventory" });
    this.addBond(cat, BALANCE.bondPerTreat);
    return true;
  }

  /** Kucing menangkap mainan bulu. Mengembalikan hadiah ikan (0 bila masih jeda). */
  toyCatch(catId: string, now: number): number {
    const cat = this.cat(catId);
    if (!cat) return 0;
    const last = this.lastToyCatch.get(catId) ?? 0;
    if (now - last < BALANCE.toyCatchCooldownMs) return 0;
    this.lastToyCatch.set(catId, now);
    const reward = Math.max(1, this.rate(now) * BALANCE.toyRewardSeconds);
    this.addFish(reward);
    this.state.stats.toyCatches += 1;
    this.emit({ type: "toyCatch", catId, reward });
    this.addBond(cat, BALANCE.bondPerToyCatch);
    return reward;
  }

  // -------------------------------------------------------------------------
  // Aksesori (v2)

  buyAccessory(id: string): boolean {
    const acc = ACCESSORY_BY_ID[id];
    if (!acc || acc.price === null || this.state.inventory.accessories.includes(id)) return false;
    if (this.state.fish < acc.price) return false;
    this.state.fish -= acc.price;
    this.state.inventory.accessories.push(id);
    this.emit({ type: "inventory" });
    return true;
  }

  /** Pakaikan aksesori; bila sedang dipakai kucing lain, dipindahkan. */
  equipAccessory(catId: string, id: string | null): boolean {
    const cat = this.cat(catId);
    if (!cat) return false;
    if (id !== null && !this.state.inventory.accessories.includes(id)) return false;
    if (id !== null) {
      for (const other of this.state.cats) {
        if (other.id !== catId && other.accessory === id) {
          other.accessory = null;
          this.emit({ type: "catUpdated", catId: other.id });
        }
      }
    }
    cat.accessory = id;
    this.emit({ type: "catUpdated", catId });
    return true;
  }

  // -------------------------------------------------------------------------
  // Hadiah dari kucing (v2)

  private maybeSpawnGifts(dt: number, now: number): void {
    const s = this.state;
    if (s.gifts.length >= BALANCE.maxGiftsOnStrip) return;
    const chance = BALANCE.giftChancePerMinute * (dt / 60);
    for (const cat of s.cats) {
      if (hearts(cat) < BALANCE.giftMinHearts) continue;
      if (s.gifts.some((g) => g.catId === cat.id)) continue;
      if (this.rand() < chance) {
        this.dropGift(cat, now);
        if (s.gifts.length >= BALANCE.maxGiftsOnStrip) return;
      }
    }
  }

  private rollGiftItem(): GiftItem {
    const r = this.rand();
    if (r < 0.55) return { kind: "fish", seconds: BALANCE.giftFishSeconds };
    if (r < 0.8) return { kind: "treats", amount: 2 };
    if (r < 0.92) return { kind: "trinket", name: TRINKETS[Math.floor(this.rand() * TRINKETS.length)] };
    const owned = new Set(this.state.inventory.accessories);
    const pending = new Set(
      this.state.gifts.flatMap((g) => (g.item.kind === "accessory" ? [g.item.id] : [])),
    );
    const giftOnly = ACCESSORIES.filter((a) => a.price === null && !owned.has(a.id) && !pending.has(a.id));
    if (giftOnly.length === 0) return { kind: "fish", seconds: BALANCE.giftFishSeconds };
    return { kind: "accessory", id: giftOnly[Math.floor(this.rand() * giftOnly.length)].id };
  }

  /** Dipakai juga oleh tes dan mode pengembangan. */
  dropGift(cat: CatState, now: number, item: GiftItem = this.rollGiftItem()): GiftState {
    this.state.giftCounter += 1;
    const gift: GiftState = {
      id: `gift-${this.state.giftCounter}`,
      catId: cat.id,
      item,
      x: 0.1 + this.rand() * 0.7,
      createdAt: now,
    };
    this.state.gifts.push(gift);
    this.emit({ type: "giftDropped", gift });
    return gift;
  }

  collectGift(giftId: string, now: number): { title: string; detail: string } | null {
    const s = this.state;
    const index = s.gifts.findIndex((g) => g.id === giftId);
    if (index < 0) return null;
    const [gift] = s.gifts.splice(index, 1);
    const giver = this.cat(gift.catId)?.name ?? "Kucingmu";
    let title: string;
    let detail: string;
    switch (gift.item.kind) {
      case "fish": {
        const fish = Math.max(25, this.rate(now) * gift.item.seconds);
        this.addFish(fish);
        title = `${giver} membawakan ikan segar!`;
        detail = `+${Math.round(fish).toLocaleString("id-ID")} ikan`;
        break;
      }
      case "treats":
        s.inventory.treats += gift.item.amount;
        title = `${giver} menemukan camilan!`;
        detail = `+${gift.item.amount} camilan`;
        break;
      case "accessory": {
        const acc = ACCESSORY_BY_ID[gift.item.id];
        if (!s.inventory.accessories.includes(acc.id)) s.inventory.accessories.push(acc.id);
        title = `${giver} memberimu ${acc.name}!`;
        detail = "Aksesori baru. Pakaikan lewat panel Kucing.";
        break;
      }
      case "trinket": {
        const fish = Math.max(10, this.rate(now) * 30);
        this.addFish(fish);
        title = `${giver} membawa ${gift.item.name.toLowerCase()}.`;
        detail = `Tidak berguna, tapi manis. +${Math.round(fish).toLocaleString("id-ID")} ikan`;
        break;
      }
    }
    s.stats.giftsReceived += 1;
    this.emit({ type: "giftCollected", gift, title, detail });
    this.emit({ type: "inventory" });
    return { title, detail };
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

  /**
   * Lepaskan kucing yang sudah diadopsi: ia pergi dan tidak kembali. Kucing
   * terakhir tidak bisa dilepas. Aksesorinya kembali ke inventaris, dan hadiah
   * yang sudah ia letakkan tetap bisa diambil.
   */
  releaseCat(catId: string): CatState | null {
    const s = this.state;
    if (s.cats.length <= 1) return null;
    const index = s.cats.findIndex((c) => c.id === catId);
    if (index < 0) return null;
    const [cat] = s.cats.splice(index, 1);
    this.lastPetBond.delete(catId);
    this.lastToyCatch.delete(catId);
    this.lastPurr.delete(catId);
    this.lastChatBond.delete(catId);
    delete s.chat.story[catId];
    if (s.typing.catId === catId) s.typing.catId = null;
    s.stats.catsReleased += 1;
    this.emit({ type: "released", cat });
    return cat;
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
      bond: 10,
      accessory: null,
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
  // Asisten (v3): pengingat, fokus, pengingat sehat, daftar tugas

  private get assistant(): AssistantState {
    return this.state.assistant;
  }

  private assistantId(prefix: string, now: number): string {
    this.assistant.counter += 1;
    return `${prefix}-${this.assistant.counter}-${now.toString(36)}`;
  }

  private assistantChanged(): void {
    this.emit({ type: "assistant" });
  }

  /** Jadwal kejadian berikutnya, untuk pengecek di sisi Rust atau di browser. */
  schedule(now: number): DueItem[] {
    return buildSchedule(this.assistant, now);
  }

  addReminder(input: { text: string; time: string; repeat: Repeat; date?: string | null }, now: number): Reminder | null {
    const text = input.text.trim().slice(0, 80);
    if (!text || !parseTime(input.time)) return null;
    let date: string | null = null;
    if (input.repeat === "once") {
      date = input.date && atDateTime(input.date, input.time) !== null ? input.date : defaultDateFor(input.time, now);
      // Pengingat sekali di masa lalu langsung berbunyi; tolak saja.
      if ((atDateTime(date, input.time) ?? 0) <= now) return null;
    }
    const reminder: Reminder = {
      id: this.assistantId("r", now),
      text,
      time: input.time,
      repeat: input.repeat,
      date,
      enabled: true,
      lastFired: 0,
      snoozeUntil: null,
      createdAt: now,
    };
    this.assistant.reminders.push(reminder);
    this.assistantChanged();
    return reminder;
  }

  setReminderEnabled(id: string, enabled: boolean, now: number): boolean {
    const r = this.assistant.reminders.find((x) => x.id === id);
    if (!r) return false;
    if (enabled && r.repeat === "once" && (atDateTime(r.date ?? "", r.time) ?? 0) <= now) return false;
    r.enabled = enabled;
    r.snoozeUntil = null;
    // Menyalakan lagi tidak membunyikan kejadian yang sudah lewat.
    if (enabled && r.repeat !== "once") r.createdAt = now;
    this.assistantChanged();
    return true;
  }

  deleteReminder(id: string): void {
    const a = this.assistant;
    a.reminders = a.reminders.filter((r) => r.id !== id);
    this.assistantChanged();
  }

  snoozeReminder(id: string, minutes: number, now: number): boolean {
    const r = this.assistant.reminders.find((x) => x.id === id);
    if (!r) return false;
    r.enabled = true;
    r.snoozeUntil = now + minutes * MIN;
    this.assistantChanged();
    return true;
  }

  addTodo(text: string, now: number): Todo | null {
    const clean = text.trim().slice(0, 100);
    if (!clean || this.assistant.todos.length >= 100) return null;
    const todo: Todo = { id: this.assistantId("t", now), text: clean, done: false, createdAt: now, doneAt: null, rewarded: false };
    this.assistant.todos.push(todo);
    this.assistantChanged();
    return todo;
  }

  /** Centang/hapus centang. Mengembalikan ikan hadiah (0 bila tidak ada). */
  toggleTodo(id: string, now: number): number {
    const a = this.assistant;
    const todo = a.todos.find((t) => t.id === id);
    if (!todo) return 0;
    todo.done = !todo.done;
    todo.doneAt = todo.done ? now : null;
    let reward = 0;
    if (todo.done && !todo.rewarded) {
      const today = dateKey(now);
      if (a.todoRewardDate !== today) {
        a.todoRewardDate = today;
        a.todoRewardCount = 0;
      }
      todo.rewarded = true;
      this.state.stats.todosDone += 1;
      // Hadiah dibatasi agar daftar tugas tidak jadi ladang ikan.
      if (a.todoRewardCount < BALANCE.todoRewardsPerDay) {
        a.todoRewardCount += 1;
        reward = Math.max(10, this.rate(now) * BALANCE.todoRewardSeconds);
        this.addFish(reward);
      }
      this.emit({ type: "todoDone", todoId: id, reward });
    }
    this.assistantChanged();
    return reward;
  }

  deleteTodo(id: string): void {
    const a = this.assistant;
    a.todos = a.todos.filter((t) => t.id !== id);
    this.assistantChanged();
  }

  clearDoneTodos(): void {
    const a = this.assistant;
    a.todos = a.todos.filter((t) => !t.done);
    this.assistantChanged();
  }

  startFocus(now: number, focusMinutes?: number, breakMinutes?: number): void {
    const f = this.assistant.focus;
    if (focusMinutes) f.focusMinutes = focusMinutes;
    if (breakMinutes) f.breakMinutes = breakMinutes;
    f.phase = "focus";
    f.startedAt = now;
    f.endsAt = now + f.focusMinutes * MIN;
    this.assistantChanged();
  }

  stopFocus(): void {
    const f = this.assistant.focus;
    f.phase = "idle";
    f.endsAt = 0;
    this.assistantChanged();
  }

  setFocusDurations(focusMinutes: number, breakMinutes: number): void {
    const f = this.assistant.focus;
    f.focusMinutes = Math.min(120, Math.max(5, focusMinutes));
    f.breakMinutes = Math.min(60, Math.max(1, breakMinutes));
    this.assistantChanged();
  }

  setWellnessInterval(kind: WellnessKind, minutes: number, now: number): void {
    const w = this.assistant.wellness;
    w.intervals[kind] = Math.max(0, minutes);
    w.next[kind] = now + Math.max(1, minutes) * MIN;
    this.assistantChanged();
  }

  setActiveHours(from: string, to: string): void {
    if (!parseTime(from) || !parseTime(to)) return;
    const w = this.assistant.wellness;
    w.from = from;
    w.to = to;
    this.assistantChanged();
  }

  /** Pemain mengikuti pengingat sehat (sudah minum, sudah peregangan...). */
  ackWellness(kind: WellnessKind, now: number): number {
    this.state.stats.wellnessDone += 1;
    const reward = Math.max(5, this.rate(now) * BALANCE.wellnessRewardSeconds);
    this.addFish(reward);
    for (const cat of this.state.cats) this.addBond(cat, 1);
    this.assistantChanged();
    void kind;
    return reward;
  }

  updateAssistant(patch: Partial<Pick<AssistantState, "chime" | "bedtime" | "clock" | "showOnAlert" | "nativeNotify">>): void {
    // Jam tidur kosong/rusak (misalnya kolom jam dikosongkan) diabaikan.
    if (typeof patch.bedtime === "string" && !parseTime(patch.bedtime)) delete patch.bedtime;
    Object.assign(this.assistant, patch);
    // Jam tidur diganti: boleh berbunyi lagi hari ini pada jam yang baru.
    if (patch.bedtime !== undefined) this.assistant.lastBedtime = "";
    this.assistantChanged();
  }

  /**
   * Jalankan kejadian terjadwal. Kunci yang sudah basi (sudah ditangani atau
   * jadwalnya berubah) diabaikan, jadi aman dipanggil lebih dari sekali.
   */
  handleDue(key: string, now: number): Alert | null {
    const a = this.assistant;
    const [kind, ...rest] = key.split(":");
    let alert: Alert | null = null;
    const make = (k: Alert["kind"], title: string, body: string, at: number, refId: string | null = null, reward = 0): Alert => ({
      key,
      kind: k,
      title,
      body,
      refId,
      at,
      reward,
      missed: now - at > 10 * MIN,
    });

    switch (kind) {
      case "rem": {
        const at = Number(rest[rest.length - 1]);
        const id = rest.slice(0, -1).join(":");
        const r = a.reminders.find((x) => x.id === id);
        if (!r || nextReminderAt(r) !== at || at > now + 5000) return null;
        r.lastFired = at;
        r.snoozeUntil = null;
        // Komputer sempat tidur: lewati semua kejadian yang sudah lewat, cukup satu pesan.
        let latest = at;
        for (let next = nextReminderAt(r), guard = 0; next !== null && next <= now && guard < 500; next = nextReminderAt(r), guard++) {
          latest = next;
          r.lastFired = next;
        }
        this.state.stats.remindersFired += 1;
        alert = make("reminder", r.text, `${now - latest > 10 * MIN ? "Terlewat" : "Pengingat"} pukul ${formatClock(latest)}`, latest, r.id);
        break;
      }
      case "focus": {
        const at = Number(rest[0]);
        const f = a.focus;
        if (f.phase !== "focus" || f.endsAt !== at || at > now + 5000) return null;
        if (now - at > 10 * MIN) {
          // Sesi berakhir saat komputer tidur: tidak dihitung, timer cukup dihentikan.
          f.phase = "idle";
          f.endsAt = 0;
          this.assistantChanged();
          return null;
        }
        const today = dateKey(now);
        if (f.todayDate !== today) {
          f.todayDate = today;
          f.todayCount = 0;
        }
        f.todayCount += 1;
        this.state.stats.focusSessions += 1;
        this.state.stats.focusMinutes += f.focusMinutes;
        const reward = Math.max(20, this.rate(now) * BALANCE.focusRewardSeconds * (f.focusMinutes / 25));
        this.addFish(reward);
        for (const cat of this.state.cats) this.addBond(cat, BALANCE.bondPerFocus);
        f.phase = "break";
        f.startedAt = now;
        f.endsAt = now + f.breakMinutes * MIN;
        alert = make("focusDone", "Sesi fokus selesai!", `Kerja bagus! Istirahat ${f.breakMinutes} menit dulu.`, at, null, reward);
        break;
      }
      case "break": {
        const at = Number(rest[0]);
        const f = a.focus;
        if (f.phase !== "break" || f.endsAt !== at || at > now + 5000) return null;
        f.phase = "idle";
        f.endsAt = 0;
        alert = make("breakDone", "Istirahat selesai", "Siap fokus lagi?", at);
        break;
      }
      case "well": {
        const k = rest[0] as WellnessKind;
        const scheduled = Number(rest[1]);
        const w = a.wellness;
        if (!(k in w.intervals) || w.intervals[k] <= 0 || w.next[k] !== scheduled) return null;
        const due = wellnessAt(w, k, scheduled);
        w.next[k] = now + w.intervals[k] * MIN;
        if (now - due > 10 * MIN) {
          // Terlambat jauh (komputer tidur): jadwalkan ulang tanpa pesan.
          this.assistantChanged();
          return null;
        }
        alert = make(k, WELLNESS_TEXT[k].title, WELLNESS_TEXT[k].body, now);
        break;
      }
      case "chime": {
        const at = Number(rest[0]);
        if (!a.chime || at > now + 5000 || at <= a.lastChime) return null;
        a.lastChime = at;
        if (now - at > 5 * MIN) {
          this.assistantChanged();
          return null;
        }
        alert = make("chime", `Sudah jam ${formatClock(at)}`, "", at);
        break;
      }
      case "bed": {
        const at = Number(rest[0]);
        const date = dateKey(at);
        if (!a.bedtime || a.lastBedtime === date || at > now + 5000) return null;
        a.lastBedtime = date;
        if (now - at > HOUR) {
          this.assistantChanged();
          return null;
        }
        alert = make("bedtime", "Sudah malam", "Kucing-kucing mau tidur. Kamu juga istirahat, ya.", now);
        break;
      }
      default:
        return null;
    }
    this.assistantChanged();
    this.emit({ type: "alert", alert });
    return alert;
  }

  /**
   * Jalankan kejadian yang sudah waktunya. Di browser dipakai sebagai pengecek
   * utama; di Tauri sebagai jaring pengaman (graceMs > 0) bila event dari Rust hilang.
   */
  pollDue(now: number, graceMs = 0): void {
    for (const item of this.schedule(now)) if (item.at <= now - graceMs) this.handleDue(item.key, now);
  }

  /**
   * Dipanggil saat aplikasi dibuka: pengingat yang terlewat selama aplikasi tertutup
   * dicatat (dan dikembalikan untuk ditampilkan), timer yang kedaluwarsa direset.
   */
  catchUp(now: number): Alert[] {
    const a = this.assistant;
    const missed: Alert[] = [];
    for (const r of a.reminders) {
      let at = nextReminderAt(r);
      let latest: number | null = null;
      for (let guard = 0; at !== null && at < now - 2 * MIN && guard < 500; guard++) {
        latest = at;
        r.lastFired = at;
        r.snoozeUntil = null;
        at = nextReminderAt(r);
      }
      if (latest !== null && now - latest < 12 * HOUR) {
        missed.push({
          key: `missed:${r.id}:${latest}`,
          kind: "reminder",
          title: r.text,
          body: `Terlewat pukul ${formatClock(latest)}`,
          refId: r.id,
          at: latest,
          reward: 0,
          missed: true,
        });
      }
    }
    const f = a.focus;
    if (f.phase !== "idle" && f.endsAt < now - MIN) {
      f.phase = "idle";
      f.endsAt = 0;
    }
    const w = a.wellness;
    for (const k of Object.keys(w.intervals) as WellnessKind[]) {
      if (w.intervals[k] > 0 && w.next[k] < now) w.next[k] = now + Math.min(w.intervals[k], 10) * MIN;
    }
    if (a.bedtime) {
      const today = dateKey(now);
      const bed = atDateTime(today, a.bedtime);
      if (bed !== null && now - bed > 30 * MIN && a.lastBedtime !== today) a.lastBedtime = today;
    }
    this.assistantChanged();
    return missed;
  }

  // -------------------------------------------------------------------------
  // Hadiah harian dan prestasi

  /** Hadiah pertama setiap hari, dibawa kucing yang paling sayang padamu. */
  checkDaily(now: number): boolean {
    const d = this.state.daily;
    const today = dateKey(now);
    // Jam komputer dimundurkan: jangan beri hadiah lagi.
    if (d.lastDate >= today || this.state.cats.length === 0) return false;
    const yesterday = dateKey(startOfDay(now) - HOUR);
    d.streak = d.lastDate === yesterday ? d.streak + 1 : 1;
    d.best = Math.max(d.best, d.streak);
    d.lastDate = today;
    const giver = [...this.state.cats].sort((p, q) => q.bond - p.bond || p.adoptedAt - q.adoptedAt)[0];
    let item: GiftItem;
    if (d.streak % 7 === 0) {
      const owned = new Set(this.state.inventory.accessories);
      for (const g of this.state.gifts) if (g.item.kind === "accessory") owned.add(g.item.id);
      const special = ACCESSORIES.filter((acc) => acc.price === null && !owned.has(acc.id));
      item = special.length > 0 ? { kind: "accessory", id: special[0].id } : { kind: "treats", amount: 5 };
    } else if (d.streak % 3 === 0) {
      item = { kind: "treats", amount: 3 };
    } else {
      item = { kind: "fish", seconds: BALANCE.dailyFishSeconds * Math.min(d.streak, 10) };
    }
    this.dropGift(giver, now, item);
    this.emit({ type: "daily", streak: d.streak, catId: giver.id });
    return true;
  }

  checkAchievements(now: number): string[] {
    const s = this.state;
    const unlocked: string[] = [];
    for (const def of ACHIEVEMENTS) {
      if (s.achievements.includes(def.id)) continue;
      const [value, target] = def.progress(s);
      if (value < target) continue;
      s.achievements.push(def.id);
      unlocked.push(def.id);
      if (def.reward.treats) s.inventory.treats += def.reward.treats;
      if (def.reward.fishSeconds) this.addFish(Math.max(50, this.rate(now) * def.reward.fishSeconds));
    }
    if (unlocked.length > 0) {
      this.emit({ type: "achievement", ids: unlocked });
      this.emit({ type: "inventory" });
    }
    return unlocked;
  }

  achievementUnlocked(id: string): boolean {
    return this.state.achievements.includes(id) && !!ACHIEVEMENT_BY_ID[id];
  }

  recordPhoto(): void {
    this.state.stats.photos += 1;
  }

  // -------------------------------------------------------------------------
  // Cuaca dan waktu (v5)

  /** Ubah keadaan cuaca, lalu kabari bila jenis cuaca yang berlaku berubah. */
  private changeWeather(now: number, apply: (w: WeatherState) => void): void {
    const w = this.state.weather;
    const before = currentWeather(w, now);
    apply(w);
    const after = currentWeather(w, now);
    this.emit({ type: "weather" });
    if (before.kind !== after.kind) {
      const reason = before.source === "live" && after.source === "live" ? "live" : after.source === "manual" ? "manual" : "other";
      this.emit({ type: "weatherChanged", from: before.kind, to: after.kind, reason });
    }
  }

  setWeatherPlace(place: WeatherPlace | null, now: number): void {
    this.changeWeather(now, (w) => {
      w.place = place;
      // Lokasi baru: data lama tidak berlaku lagi.
      w.last = null;
    });
  }

  setWeatherSnapshot(snapshot: WeatherSnapshot, now: number): void {
    this.changeWeather(now, (w) => {
      w.last = snapshot;
    });
  }

  updateWeather(patch: Partial<Pick<WeatherState, "enabled" | "mode" | "tint" | "rainSound" | "greet">>, now: number): void {
    this.changeWeather(now, (w) => Object.assign(w, patch));
  }

  /** Fase hari sekarang (memakai jam matahari kota pilihan bila ada). */
  phase(now: number): DayPhase {
    return dayPhase(now, sunFor(now, this.state.weather.last));
  }

  /**
   * Sapaan "Selamat pagi/siang/sore/malam", sekali per fase per hari.
   * Mengembalikan fase yang disapa, atau null.
   */
  checkGreeting(now: number): DayPhase | null {
    const w = this.state.weather;
    if (!w.greet) return null;
    const p = this.phase(now);
    const phase: DayPhase | null = p === "pagi" || p === "fajar" ? "pagi" : p === "siang" ? "siang" : p === "sore" || p === "senja" ? "sore" : p === "malam" ? "malam" : null;
    if (!phase) return null;
    const key = greetKey(now, phase, w.last?.utcOffset ?? null);
    if (w.greeted === key) return null;
    w.greeted = key;
    this.emit({ type: "greeting", phase });
    return phase;
  }

  // -------------------------------------------------------------------------
  // Obrolan (v6)

  private lastChatBond = new Map<string, number>();

  /** Catat satu obrolan yang dimulai. */
  chatStarted(): void {
    this.state.stats.chats += 1;
  }

  /** Ikatan dari mengobrol; paling sering sekali per jeda untuk setiap kucing. */
  chatBond(catId: string, now: number): boolean {
    const cat = this.cat(catId);
    if (!cat) return false;
    const last = this.lastChatBond.get(catId);
    if (last !== undefined && now - last < BALANCE.chatBondCooldownMs) return false;
    this.lastChatBond.set(catId, now);
    cat.lastPetAt = now;
    this.addBond(cat, BALANCE.bondPerChat);
    return true;
  }

  /** Simpan nama panggilan pemain ("" = tidak mau memberi tahu). */
  setPlayerName(name: string): string {
    const clean = cleanPlayerName(name);
    this.state.chat.playerName = clean;
    this.state.chat.askedName = true;
    this.emit({ type: "chat" });
    return clean;
  }

  updateChat(patch: Partial<Pick<ChatState, "chatter" | "askedName">>): void {
    Object.assign(this.state.chat, patch);
    this.emit({ type: "chat" });
  }

  /** Nomor cerita berikutnya untuk kucing ini (berputar setelah semua cerita habis). */
  nextStory(catId: string, count: number): number {
    if (count <= 0) return 0;
    const story = this.state.chat.story;
    const index = Math.floor(story[catId] ?? 0) % count;
    story[catId] = index + 1;
    return index;
  }

  // -------------------------------------------------------------------------
  // Kucing ikut mengetik (v6)

  private tapWindowStart = 0;
  private tapWindowCount = 0;

  /**
   * Tambahkan ketukan keyboard/klik. Hanya jumlahnya yang diketahui game.
   * Ketukan di atas batas per detik diabaikan. Mengembalikan [ketukan dihitung, ikan].
   */
  addTaps(count: number, now: number): [number, number] {
    const t = this.state.typing;
    if (!t.enabled || !(count > 0)) return [0, 0];
    if (now - this.tapWindowStart >= 1000 || now < this.tapWindowStart) {
      this.tapWindowStart = now;
      this.tapWindowCount = 0;
    }
    const n = Math.min(Math.floor(count), BALANCE.tapMaxPerSecond - this.tapWindowCount);
    if (n <= 0) return [0, 0];
    this.tapWindowCount += n;
    const today = dateKey(now);
    if (t.todayDate !== today) {
      t.todayDate = today;
      t.today = 0;
      t.fishToday = 0;
    }
    const fish = n * Math.max(BALANCE.tapMinFish, this.rate(now) * BALANCE.tapFishSeconds);
    this.addFish(fish);
    t.today += n;
    t.fishToday += fish;
    t.best = Math.max(t.best, t.today);
    this.state.stats.taps += n;
    return [n, fish];
  }

  updateTyping(patch: Partial<Pick<TypingState, "enabled" | "asked" | "catId">>): void {
    const t = this.state.typing;
    if (patch.catId !== undefined && patch.catId !== null && !this.cat(patch.catId)) patch = { ...patch, catId: null };
    Object.assign(t, patch);
    if (patch.enabled !== undefined) t.asked = true;
    this.emit({ type: "typing" });
  }

  /** Ketukan hari ini (0 bila tanggal sudah berganti). */
  tapsToday(now: number): number {
    const t = this.state.typing;
    return t.todayDate === dateKey(now) ? t.today : 0;
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
