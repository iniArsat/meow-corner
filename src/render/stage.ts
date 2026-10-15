// Tampilan strip: fasilitas, kucing, tamu, hadiah, mainan, dan semua interaksi
// langsung dengan kucing (elus, usap, angkat-lempar, mainan bulu, camilan).
// Stage membaca GameState; perubahan state selalu lewat StageActions.

import { Application, Container, Graphics, Rectangle, Sprite, Text, TextureSource } from "pixi.js";
import type { Alert, AlertKind } from "../core/assistant";
import type { ChatAnim } from "../core/dialogue";
import { BALANCE, FACILITIES } from "../core/data";
import { hearts as heartCount, isHungry } from "../core/economy";
import { formatFish } from "../core/format";
import type { Game, GameEvent } from "../core/game";
import type { CatState, FacilityId, GiftState } from "../core/types";
import { FACILITY_IDS } from "../core/types";
import { currentWeather, isDark, isWet, lightTint, precipitation, sunFor, type CurrentWeather, type DayPhase } from "../core/weather";
import { Ambient } from "./ambient";
import { WeatherFx } from "./weatherFx";
import { CatActor, rand, type ActorHost, type SpotKind, type SpotRef } from "./catActor";
import { Effects, TEXT_STYLE } from "./effects";
import type { ObjectId } from "./pixelart";
import { objectTexture } from "./textures";

export type StageSound =
  | "pet"
  | "meow"
  | "purr"
  | "hiss"
  | "thud"
  | "chirp"
  | "pop"
  | "crunch"
  | "coin"
  | "feed"
  | "denied"
  | "alarm"
  | "chime"
  | "shutter"
  | "thunder";

export interface StageActions {
  pet(catId: string): void;
  /** true bila dengkuran ini menambah ikatan (tidak sedang jeda). */
  purr(catId: string): boolean;
  treat(catId: string): boolean;
  toyCatch(catId: string): number;
  assign(catId: string, facility: FacilityId): boolean;
  feedVisitor(): number;
  catchSparkle(): number;
  collectGift(giftId: string): { title: string; detail: string } | null;
  openFacility(id: FacilityId): void;
  sound(id: StageSound): void;
  tip(key: string, text: string): void;
  /** Mode mainan/camilan berubah dari sisi Stage (misalnya camilan habis). */
  modesChanged(): void;
  /** Kucing pembawa pesan diklik: anggap pesannya sudah dibaca. */
  alertCatClicked(catId: string): void;
  /** Klik kanan kucing: buka obrolan. */
  chat(catId: string): void;
  /** Klik kanan kucing liar yang mampir. */
  visitorTalk(): void;
}

/** Sesi kucing ikut mengetik: kucing duduk di depan keyboard mini. */
interface TypingSession {
  actor: CatActor;
  keyboard: Sprite;
  lastTap: number;
  /** Tepukan yang belum dianimasikan. */
  pending: number;
  tapCooldown: number;
  keyTimer: number;
  flip: boolean;
  fish: number;
  fishTimer: number;
}

/** Diam tanpa ketukan selama ini: kucing berhenti mengetik. */
const TYPING_IDLE_MS = 6_000;

/** Ikon gelembung untuk setiap jenis pesan asisten. */
const ALERT_ICON: Record<AlertKind, ObjectId> = {
  reminder: "bell",
  focusDone: "tomato",
  breakDone: "tomato",
  water: "water",
  stretch: "heart",
  eyes: "eye",
  chime: "clock",
  bedtime: "moon",
};

/** Lama kucing mengeong berulang bila pesan belum dibaca. */
const ALARM_REPEAT_MS = 10_000;
const ALARM_MAX_MS = 120_000;

/** Lebar bawaan area kanan yang dipakai HUD; diperbarui dari ukuran HUD sebenarnya. */
const DEFAULT_RESERVED = 340;
const GROUND_MARGIN = 4;
const DRAG_THRESHOLD = 6;
/** Panjang usapan (piksel sprite) sampai kucing mendengkur. */
const RUB_TO_PURR = 150;
const CLICKS_TO_ANGER = 7;
const CLICK_WINDOW_MS = 2500;
const MAX_HUNTERS = 3;

function pickWeighted<T extends string>(weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= Math.max(0, w);
    if (r < 0) return k;
  }
  return entries[0][0];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ---------------------------------------------------------------------------
// Tempat bertengger di fasilitas (dalam piksel sprite dari tengah-bawah fasilitas)

interface SpotDef {
  kind: SpotKind;
  dx: number;
  elev: number;
  /** Setengah lebar area mendarat. */
  half: number;
}

const SPOTS: Partial<Record<FacilityId, SpotDef[]>> = {
  kardus: [{ kind: "box", dx: 0, elev: 9, half: 6 }],
  tiang: [
    { kind: "perch", dx: -1, elev: 20, half: 5 },
    { kind: "perch", dx: -3, elev: 11, half: 4 },
  ],
  akuarium: [{ kind: "perch", dx: 0, elev: 14, half: 7 }],
  rak: [{ kind: "perch", dx: 0, elev: 7, half: 7 }],
};

function spotKey(s: SpotRef): string {
  return `${s.facility}:${s.index}`;
}

// ---------------------------------------------------------------------------

interface FacilityView {
  id: FacilityId;
  container: Container;
  sprite: Sprite;
  count: Text;
  shadow: Graphics;
  glow: Graphics;
  eyes: Graphics;
  x: number;
  wobble: number;
  glowKey: string;
  eyesKey: string;
}

interface GiftView {
  gift: GiftState;
  sprite: Sprite;
  revealed: boolean;
  carrier: CatActor | null;
  t: number;
  /** Posisi layar tetap (tidak ikut bergeser saat lebar HUD berubah). */
  x: number;
}

type PressTarget =
  | { kind: "actor"; actor: CatActor }
  | { kind: "gift"; view: GiftView }
  | { kind: "sparkle" }
  | { kind: "facility"; id: FacilityId };

interface Press {
  target: PressTarget;
  pointerId: number;
  x0: number;
  y0: number;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
}

type SocialType = "boop" | "groom" | "playfight" | "cuddle";

interface Social {
  type: SocialType;
  a: CatActor;
  b: CatActor;
  arrived: number;
  acting: boolean;
  fxTimer: number;
}

// ---------------------------------------------------------------------------
// Mainan bulu: bulu di ujung tali yang menggantung dari kursor.

class Feather {
  readonly node = new Container();
  private line = new Graphics();
  private sprite = new Sprite(objectTexture("feather"));
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  visible = false;
  heldBy: CatActor | null = null;
  private heldTime = 0;
  private ax = 0;
  private ay = 0;

  constructor() {
    this.sprite.anchor.set(0.5, 0.1);
    this.node.addChild(this.line, this.sprite);
    this.node.visible = false;
  }

  grab(by: CatActor): void {
    this.heldBy = by;
    this.heldTime = 0.8;
  }

  update(dt: number, anchor: { x: number; y: number } | null, s: number, groundY: number): void {
    const length = 30 * s;
    if (!anchor) {
      this.visible = false;
      this.heldBy = null;
      this.node.visible = false;
      return;
    }
    if (!this.visible) {
      this.visible = true;
      this.x = anchor.x;
      this.y = anchor.y + length;
      this.vx = 0;
      this.vy = 0;
    }
    this.ax = anchor.x;
    this.ay = anchor.y;

    if (this.heldBy) {
      const m = this.heldBy.mouthPos();
      this.x = m.x;
      this.y = m.y;
      this.heldTime -= dt;
      if (this.heldTime <= 0 || this.heldBy.mode === "held" || this.heldBy.removed) {
        this.heldBy = null;
        this.vy = -90 * s;
      }
    } else {
      this.vy += 260 * s * dt;
      const damp = Math.max(0, 1 - 1.6 * dt);
      this.vx *= damp;
      this.vy *= damp;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const dx = this.x - anchor.x;
      const dy = this.y - anchor.y;
      const dist = Math.hypot(dx, dy);
      if (dist > length) {
        const nx = dx / dist;
        const ny = dy / dist;
        this.x = anchor.x + nx * length;
        this.y = anchor.y + ny * length;
        const radial = this.vx * nx + this.vy * ny;
        if (radial > 0) {
          this.vx -= radial * nx;
          this.vy -= radial * ny;
        }
      }
      const floor = groundY - 2 * s;
      if (this.y > floor) {
        this.y = floor;
        this.vy = Math.min(0, this.vy);
        this.vx *= Math.max(0, 1 - 5 * dt);
      }
    }
    this.draw(s);
  }

  /** Sentakan kecil saat pemain menggerakkan kursor cepat. */
  nudge(vx: number, vy: number): void {
    if (this.heldBy) return;
    this.vx += vx;
    this.vy += vy;
  }

  private draw(s: number): void {
    this.node.visible = true;
    const g = this.line;
    g.clear();
    // Tongkat pancing pendek.
    g.moveTo(this.ax, this.ay)
      .lineTo(this.ax + 9 * s, this.ay - 13 * s)
      .stroke({ color: 0x8a5a35, width: 1.4 * s, cap: "round" });
    // Tali melengkung sedikit bila kendur.
    const dist = Math.hypot(this.x - this.ax, this.y - this.ay);
    const sag = Math.max(0, 30 * s - dist) * 0.6;
    g.moveTo(this.ax, this.ay)
      .quadraticCurveTo((this.ax + this.x) / 2, (this.ay + this.y) / 2 + sag, this.x, this.y)
      .stroke({ color: 0xfffaf0, width: Math.max(1, 0.5 * s), alpha: 0.9 });
    this.sprite.scale.set(s);
    this.sprite.position.set(Math.round(this.x), Math.round(this.y));
    this.sprite.rotation = clamp(this.vx * 0.002, -0.6, 0.6);
  }
}

// ---------------------------------------------------------------------------

export class Stage implements ActorHost {
  readonly app: Application;
  private game: Game;
  private actions: StageActions;
  readonly fx = new Effects();
  private ambient = new Ambient();
  private facilityLayer = new Container();
  private giftLayer = new Container();
  private actorLayer = new Container();
  private toyLayer = new Container();
  private labelLayer = new Container();
  private facilities = new Map<FacilityId, FacilityView>();
  private cats = new Map<string, CatActor>();
  private visitor: CatActor | null = null;
  /** Tamu yang sedang berjalan keluar layar; tidak bisa diklik. */
  private leaving: CatActor[] = [];
  private sparkle: Container | null = null;
  private sparkleX = 0;
  private sparkleTimer = 0;
  private gifts = new Map<string, GiftView>();
  private hoverLabel: Text;
  private hoverHearts = new Container();
  private feather = new Feather();
  private treatCursor = new Sprite(objectTexture("treat"));

  focusMode = false;
  pixelScale = 3;
  /** Lebar area kanan yang tertutup HUD; kucing tidak berjalan ke sana. */
  reservedRight = DEFAULT_RESERVED;
  width = 0;
  height = 0;
  groundY = 0;

  toyMode = false;
  treatMode = false;

  // Pointer
  private cursor: { x: number; y: number } | null = null;
  private prevCursor: { x: number; y: number } | null = null;
  private cursorMovedAt = 0;
  private press: Press | null = null;
  private dragging: CatActor | null = null;
  private dropTarget: FacilityId | null = null;
  private rubTarget: CatActor | null = null;
  private rubFxTimer = 0;

  // Sutradara kehidupan kucing
  private directorTimer = 3;
  private socials: Social[] = [];
  private lastZoomies = 0;
  private greetedVisitor = false;
  /** Fase hari dan cuaca yang berlaku, diperbarui tiap detik. */
  private phase: DayPhase = "siang";
  private weather: CurrentWeather = { kind: "clear", code: null, temp: null, wind: 0, source: "none" };
  private worldTimer = 0;
  private tint = 0xffffff;
  private light: [number, number, number] = [255, 255, 255];
  readonly weatherFx = new WeatherFx();
  private typing: TypingSession | null = null;
  /** Tidak ada kucing yang bisa mengetik: jangan mencari lagi sampai waktu ini. */
  private typingRetryAt = 0;

  private constructor(app: Application, game: Game, actions: StageActions) {
    this.app = app;
    this.game = game;
    this.actions = actions;
    app.stage.addChild(
      this.weatherFx.back,
      this.ambient.layer,
      this.facilityLayer,
      this.weatherFx.ground,
      this.giftLayer,
      this.actorLayer,
      this.fx.layer,
      this.weatherFx.front,
      this.toyLayer,
      this.labelLayer,
    );
    this.weatherFx.onLightning = () => this.lightningStrike();
    this.actorLayer.sortableChildren = true;
    this.treatCursor.anchor.set(0.5);
    this.treatCursor.visible = false;
    this.toyLayer.addChild(this.feather.node, this.treatCursor);
    this.hoverLabel = new Text({ text: "", style: { ...TEXT_STYLE, fontSize: 13, fontWeight: "700", fill: 0xfffaf0, align: "center" } });
    this.hoverLabel.anchor.set(0.5, 1);
    this.hoverLabel.visible = false;
    this.labelLayer.addChild(this.hoverLabel, this.hoverHearts);
    for (let i = 0; i < 5; i++) {
      const sp = new Sprite(objectTexture("heartEmpty"));
      sp.anchor.set(0.5, 1);
      this.hoverHearts.addChild(sp);
    }
    this.hoverHearts.visible = false;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.bindInput();
    app.ticker.add((ticker) => this.update(Math.min(0.1, ticker.deltaMS / 1000)));
  }

  static async create(el: HTMLElement, game: Game, actions: StageActions): Promise<Stage> {
    TextureSource.defaultOptions.scaleMode = "nearest";
    const app = new Application();
    await app.init({
      backgroundAlpha: 0,
      resizeTo: window,
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      // Semua input ditangani sendiri lewat event DOM.
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
    app.stage.eventMode = "none";
    el.appendChild(app.canvas);
    const stage = new Stage(app, game, actions);
    stage.setFocusMode(game.state.settings.focusMode);
    stage.setPixelScale(game.state.settings.scale);
    stage.sync();
    return stage;
  }

  // -------------------------------------------------------------------------
  // ActorHost

  walkRange(): [number, number] {
    return [16 * this.pixelScale, Math.max(200, this.width - this.reservedRight)];
  }

  spotPos(spot: SpotRef): { x: number; y: number } | null {
    const view = this.facilities.get(spot.facility);
    const def = SPOTS[spot.facility]?.[spot.index];
    if (!view || !def) return null;
    const s = this.pixelScale;
    return { x: view.x + def.dx * s, y: this.groundY - def.elev * s };
  }

  private spotFree(spot: SpotRef, except?: CatActor): boolean {
    const key = spotKey(spot);
    for (const a of this.cats.values()) {
      if (a === except) continue;
      if ((a.spot && spotKey(a.spot) === key) || a.claim === key) return false;
    }
    return true;
  }

  surfaceAt(x: number, yPrev: number, yNow: number, ignore: CatActor): SpotRef | null {
    const s = this.pixelScale;
    for (const [id, defs] of Object.entries(SPOTS) as [FacilityId, SpotDef[]][]) {
      if (!this.facilities.has(id)) continue;
      for (let i = 0; i < defs.length; i++) {
        const ref: SpotRef = { facility: id, index: i, kind: defs[i].kind };
        const pos = this.spotPos(ref)!;
        if (Math.abs(x - pos.x) > defs[i].half * s) continue;
        if (yPrev <= pos.y && yNow >= pos.y && this.spotFree(ref, ignore)) return ref;
      }
    }
    return null;
  }

  landed(actor: CatActor, hard: boolean): void {
    // Tamu dan kucing yang sedang pamit tidak bereaksi pada pendaratan.
    if (actor.isVisitor || this.cats.get(actor.id) !== actor) return;
    const now = Date.now();
    if (actor.spot?.kind === "box") {
      // Masuk kardus: sembunyi sebentar lalu keluar sendiri.
      if (hard) actor.lastHardLanding = now;
      actor.queue(() => actor.jumpDown());
      return;
    }
    if (hard) {
      const again = now - actor.lastHardLanding < 15_000;
      actor.lastHardLanding = now;
      if (again) {
        actor.queue(() => this.makeAngry(actor));
        return;
      }
      // Pendaratan keras: kaget sebentar, lalu pura-pura tidak terjadi apa-apa (menjilati bulu).
      actor.queue(() => {
        actor.emote("question", 1.2, false);
        actor.setMode("sit", 0.6, () => actor.setMode("groom", rand(2, 3.5)));
      });
      return;
    }
    if (actor.spot) actor.queue(() => this.perchActivity(actor));
  }

  sound(id: "thud"): void {
    this.actions.sound(id);
  }

  // -------------------------------------------------------------------------
  // Tata letak dan pengaturan

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.groundY = this.height - GROUND_MARGIN;
    this.layoutFacilities();
  }

  setPixelScale(scale: number): void {
    this.pixelScale = scale;
    this.fx.scale = scale;
    this.layoutFacilities();
  }

  setFocusMode(on: boolean): void {
    this.focusMode = on;
    this.fx.calm = on;
    this.app.ticker.maxFPS = on ? 12 : 30;
  }

  setPaused(paused: boolean): void {
    if (paused) this.app.ticker.stop();
    else this.app.ticker.start();
  }

  setToyMode(on: boolean): void {
    if (this.toyMode === on) return;
    this.toyMode = on;
    if (on) this.treatMode = false;
    if (on) this.actions.tip("toy", "Gerakkan kursor di dekat lantai: kucing akan mengejar dan menerkam bulunya!");
  }

  setTreatMode(on: boolean): void {
    if (this.treatMode === on) return;
    this.treatMode = on;
    if (on) this.toyMode = false;
    if (on) this.actions.tip("treat", "Klik kucing untuk memberinya camilan. Kucing yang ngambek juga luluh dengan camilan.");
  }

  facilityX(id: FacilityId): number | null {
    return this.facilities.get(id)?.x ?? null;
  }

  private layoutFacilities(): void {
    const s = this.pixelScale;
    let x = 28 * s;
    for (const id of FACILITY_IDS) {
      const view = this.facilities.get(id);
      if (!view) continue;
      const w = view.sprite.texture.width * s;
      view.x = Math.round(x + w / 2);
      x += w + 16 * s;
      view.sprite.scale.set(s);
      view.sprite.position.set(view.x, this.groundY);
      view.shadow.clear();
      view.shadow.ellipse(view.x, this.groundY - s * 0.5, w * 0.48, 1.8 * s).fill({ color: 0x000000, alpha: 0.18 });
      view.count.position.set(view.x + w / 2 - 2, this.groundY - 2);
    }
  }

  // -------------------------------------------------------------------------
  // Sinkronisasi dengan GameState

  sync(): void {
    const state = this.game.state;

    for (const id of FACILITY_IDS) {
      const owned = state.facilities[id];
      let view = this.facilities.get(id);
      if (owned > 0 && !view) {
        view = this.createFacility(id);
        this.facilities.set(id, view);
      } else if (owned <= 0 && view) {
        view.container.destroy({ children: true });
        this.facilities.delete(id);
        view = undefined;
      }
      if (view) view.count.text = owned > 1 ? `×${owned}` : "";
    }
    this.layoutFacilities();

    const ids = new Set(state.cats.map((c) => c.id));
    for (const [id, actor] of this.cats) {
      if (!ids.has(id)) {
        if (this.dragging === actor) this.dragging = null;
        actor.destroy();
        this.cats.delete(id);
      }
    }
    const [minX, maxX] = this.walkRange();
    for (const cat of state.cats) {
      const existing = this.cats.get(cat.id);
      if (existing) {
        existing.coat = cat.coat;
        existing.accessory = cat.accessory;
        continue;
      }
      const home = cat.facility ? this.facilityX(cat.facility) : null;
      const actor = new CatActor(this, cat.id, cat.coat, home ?? rand(minX, maxX), false);
      actor.accessory = cat.accessory;
      this.cats.set(cat.id, actor);
      this.actorLayer.addChild(actor.container);
    }

    if (!state.visitor && this.visitor) {
      const v = this.visitor;
      v.setNeed(null);
      v.setDots(null);
      v.leaveTo(this.width + 80);
      this.leaving.push(v);
      this.visitor = null;
    }
    if (state.visitor && !this.visitor) {
      const actor = new CatActor(this, "visitor", state.visitor.coat, maxX + 40, true);
      // Tamu yang sudah siap diadopsi (dipulihkan dari simpanan) langsung duduk menunggu.
      if (state.visitor.fed >= 3) {
        actor.x = maxX - 60;
        actor.setMode("wait");
      } else {
        actor.arriveAt(rand(minX + 80, Math.max(minX + 120, maxX - 60)));
      }
      this.visitor = actor;
      this.greetedVisitor = false;
      this.actorLayer.addChild(actor.container);
    }

    if (state.sparkle && !this.sparkle) this.createSparkle();
    if (!state.sparkle && this.sparkle) {
      this.sparkle.destroy({ children: true });
      this.sparkle = null;
    }

    this.syncGifts();
  }

  /** Reaksi visual terhadap event game yang tidak berasal dari klik di strip. */
  onGameEvent(e: GameEvent): void {
    switch (e.type) {
      case "fed":
        this.feedingTime();
        break;
      case "bond":
        if (e.levelUp) {
          const a = this.cats.get(e.catId);
          if (a) {
            const head = a.headPos();
            this.fx.ring(head.x, head.y, 0xef5b7b);
            this.fx.hearts(head.x, head.y, 5);
            a.emote("heart", 2);
          }
        }
        break;
      case "purchased":
        if (this.game.state.facilities[e.facility] === e.amount) this.curiousAbout(e.facility);
        break;
      default:
        break;
    }
  }

  /** Tamu yang diadopsi menjadi kucing biasa di posisi yang sama. */
  adoptVisitorAt(catId: string): void {
    const v = this.visitor;
    this.visitor = null;
    this.sync();
    if (!v) return;
    const actor = this.cats.get(catId);
    if (actor) {
      actor.x = v.x;
      actor.dir = v.dir;
      actor.setMode("happy", 2);
    }
    const head = v.headPos();
    this.fx.hearts(head.x, head.y, 6);
    this.fx.ring(head.x, head.y, 0xef5b7b);
    v.destroy();
  }

  private createFacility(id: FacilityId): FacilityView {
    const container = new Container();
    const shadow = new Graphics();
    const glow = new Graphics();
    const eyes = new Graphics();
    const sprite = new Sprite(objectTexture(id as ObjectId));
    sprite.anchor.set(0.5, 1);
    const count = new Text({ text: "", style: { ...TEXT_STYLE, fontSize: 12, fill: 0xfffaf0, stroke: { color: 0x2a1d1a, width: 3 } } });
    count.anchor.set(1, 1);
    container.addChild(glow, shadow, sprite, eyes, count);
    this.facilityLayer.addChild(container);
    return { id, container, sprite, count, shadow, glow, eyes, x: 0, wobble: 0, glowKey: "", eyesKey: "" };
  }

  private createSparkle(): void {
    const c = new Container();
    const fish = new Sprite(objectTexture("goldfish"));
    fish.anchor.set(0.5, 0.5);
    c.addChild(fish);
    this.sparkle = c;
    this.sparkleX = this.fractionX(this.game.state.sparkle?.x ?? 0.5);
    this.giftLayer.addChild(c);
  }

  // -------------------------------------------------------------------------
  // Hadiah dari kucing

  /** Posisi dari pecahan 0..1 area jalan, dihitung sekali saat benda muncul. */
  private fractionX(fraction: number): number {
    const [minX, maxX] = this.walkRange();
    return minX + fraction * (maxX - minX);
  }

  private giftX(view: GiftView): number {
    const [minX, maxX] = this.walkRange();
    return clamp(view.x, minX, maxX);
  }

  private syncGifts(): void {
    const state = this.game.state;
    const ids = new Set(state.gifts.map((g) => g.id));
    for (const [id, view] of this.gifts) {
      if (ids.has(id)) continue;
      if (view.carrier && view.carrier.task === "gift") {
        view.carrier.cancelTask();
        view.carrier.needsDecision = true;
      }
      view.sprite.destroy();
      this.gifts.delete(id);
    }
    for (const gift of state.gifts) {
      if (this.gifts.has(gift.id)) continue;
      const sprite = new Sprite(objectTexture("giftbox"));
      sprite.anchor.set(0.5, 1);
      sprite.visible = false;
      this.giftLayer.addChild(sprite);
      const view: GiftView = { gift, sprite, revealed: false, carrier: null, t: 0, x: this.fractionX(gift.x) };
      this.gifts.set(gift.id, view);
      const giver = this.cats.get(gift.catId);
      const fresh = Date.now() - gift.createdAt < 5000;
      if (fresh && giver && !giver.airborne && giver !== this.dragging && giver.mode !== "angry" && giver.task !== "alert") {
        this.deliverGift(giver, view);
      }
      else this.revealGift(view, false);
    }
  }

  private deliverGift(a: CatActor, view: GiftView): void {
    a.cancelTask();
    a.task = "gift";
    view.carrier = a;
    a.setCarry("giftbox");
    const go = () => {
      if (a.task !== "gift") return;
      a.setCarry("giftbox");
      const gx = this.giftX(view);
      const tx = gx + (a.x < gx ? -8 : 8) * this.pixelScale;
      a.walkTo(tx, () => {
        a.setCarry(null);
        a.task = null;
        this.revealGift(view, true);
        a.face(this.giftX(view));
        a.setMode("proud", 2.5);
        a.emote("exclaim", 1.4);
        this.actions.sound("meow");
        this.actions.tip("gift", "Kucing yang sayang padamu (3 hati ke atas) kadang membawa hadiah. Klik kadonya!");
      }, Math.abs(tx - a.x) > 200);
    };
    if (a.spot || a.hidden) a.jumpDown(go);
    else go();
  }

  private revealGift(view: GiftView, fromCat: boolean): void {
    view.revealed = true;
    view.carrier = null;
    view.sprite.visible = true;
    view.t = 0;
    if (fromCat) {
      this.fx.dust(this.giftX(view), this.groundY, 4);
      this.actions.sound("pop");
    }
  }

  // -------------------------------------------------------------------------
  // Input

  private bindInput(): void {
    const canvas = this.app.canvas;
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    window.addEventListener("pointercancel", () => this.cancelPress());
    window.addEventListener("blur", () => this.cancelPress());
    // Kursor keluar dari jendela (mode browser): bulu dan camilan disembunyikan.
    document.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget) this.setHover(null, null);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (this.toyMode || this.treatMode)) {
        this.toyMode = false;
        this.treatMode = false;
        this.actions.modesChanged();
      }
    });
  }

  /** Posisi kursor dari polling klik tembus (Tauri) atau pointermove (browser). */
  setHover(x: number | null, y: number | null): void {
    if (x === null || y === null) {
      if (!this.dragging && !this.press) this.cursor = null;
      return;
    }
    this.updateCursor(x, y);
  }

  private updateCursor(x: number, y: number): void {
    const now = performance.now();
    if (!this.cursor || Math.abs(this.cursor.x - x) > 0.5 || Math.abs(this.cursor.y - y) > 0.5) this.cursorMovedAt = now;
    this.cursor = { x, y };
  }

  private onDown(e: PointerEvent): void {
    if (e.button === 2) {
      // Klik kanan kucing: ajak ngobrol.
      const actor = this.actorAt(e.clientX, e.clientY);
      if (!actor) return;
      e.preventDefault();
      if (actor.isVisitor) this.actions.visitorTalk();
      else this.actions.chat(actor.id);
      return;
    }
    if (e.button !== 0) return;
    const target = this.targetAt(e.clientX, e.clientY);
    if (!target) return;
    e.preventDefault();
    this.updateCursor(e.clientX, e.clientY);
    this.press = {
      target,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
      vx: 0,
      vy: 0,
    };
    try {
      this.app.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Abaikan: penangkapan pointer hanya membantu saat menyeret keluar jendela.
    }
  }

  private onMove(e: PointerEvent): void {
    const x = e.clientX;
    const y = e.clientY;
    const prev = this.cursor;
    this.updateCursor(x, y);
    // Gerakan cepat kursor menyentak bulu mainan.
    if (this.toyMode && prev) this.feather.nudge((x - prev.x) * 8, (y - prev.y) * 8);

    const p = this.press;
    if (!p) return;
    if (e.buttons === 0) {
      // Tombol sudah dilepas di luar jendela dan pointerup tidak sampai ke sini.
      this.cancelPress();
      return;
    }
    const now = performance.now();
    const dt = (now - p.lastT) / 1000;
    if (dt > 0.001) {
      p.vx = p.vx * 0.5 + ((x - p.lastX) / dt) * 0.5;
      p.vy = p.vy * 0.5 + ((y - p.lastY) / dt) * 0.5;
    }
    p.lastX = x;
    p.lastY = y;
    p.lastT = now;

    if (!this.dragging && p.target.kind === "actor" && Math.hypot(x - p.x0, y - p.y0) > DRAG_THRESHOLD) {
      const a = p.target.actor;
      if (!a.isVisitor && !a.removed) this.startDrag(a);
    }
    if (this.dragging) {
      this.dragging.vx = p.vx;
      this.dragging.dragTo(x, y);
      this.dropTarget = this.facilityDropAt(x, y);
    }
  }

  private onUp(e: PointerEvent): void {
    const p = this.press;
    if (!p || e.pointerId !== p.pointerId) return;
    this.press = null;
    try {
      this.app.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Tidak masalah bila sudah dilepas.
    }
    if (this.dragging) {
      // Berhenti sejenak sebelum melepas = jatuh pelan, bukan dilempar.
      const still = performance.now() - p.lastT > 90;
      this.endDrag(e.clientX, e.clientY, still ? 0 : p.vx, still ? 0 : p.vy);
      return;
    }
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 14) return;
    this.click(p.target);
  }

  /** Lepaskan tekanan/seretan yang sedang berlangsung (juga saat jendela disembunyikan). */
  cancelPress(): void {
    if (this.dragging && this.press) this.endDrag(this.press.lastX, this.press.lastY, 0, 0);
    else if (this.dragging) this.endDrag(this.dragging.x, this.dragging.y, 0, 0);
    this.press = null;
  }

  private startDrag(a: CatActor): void {
    a.cancelTask();
    a.rub = 0;
    a.pickUp();
    a.emote("exclaim", 0.7, false);
    this.dragging = a;
    this.actions.sound("meow");
    this.actions.tip("drag", "Jatuhkan kucing di atas fasilitas untuk menugaskannya di sana. Jangan dilempar terlalu keras!");
  }

  private endDrag(x: number, y: number, vx: number, vy: number): void {
    const a = this.dragging;
    this.dragging = null;
    this.dropTarget = null;
    if (!a) return;
    const fid = this.facilityDropAt(x, y);
    const s = this.pixelScale;
    if (fid) {
      const cat = this.game.cat(a.id);
      if (cat && cat.facility !== fid) {
        const ok = this.actions.assign(a.id, fid);
        const view = this.facilities.get(fid)!;
        const top = this.groundY - view.sprite.height - 4 * s;
        if (ok) {
          this.fx.text(view.x, top, `${cat.name} bertugas di ${FACILITIES[fid].name}`, 0xfff3b0, 13);
          this.fx.stars(view.x, top, 5);
        } else {
          this.fx.text(view.x, top, "Penuh!", 0xff9a8a, 13);
          this.actions.sound("denied");
        }
      }
    }
    a.drop(vx, vy, null);
  }

  private click(target: PressTarget): void {
    const s = this.pixelScale;
    switch (target.kind) {
      case "actor":
        if (target.actor.isVisitor) this.clickVisitor(target.actor);
        else this.clickCat(target.actor);
        break;
      case "gift": {
        const view = target.view;
        const x = this.giftX(view);
        const y = this.groundY - 5 * s;
        const res = this.actions.collectGift(view.gift.id);
        if (res) {
          this.fx.stars(x, y, 10);
          this.fx.ring(x, y);
          this.actions.sound("pop");
        }
        break;
      }
      case "sparkle": {
        const pos = this.sparkle ? { x: this.sparkle.x, y: this.sparkle.y } : null;
        const reward = this.actions.catchSparkle();
        if (reward > 0 && pos) {
          this.fx.stars(pos.x, pos.y, 8);
          this.fx.text(pos.x, pos.y - 10, `+${formatFish(reward)} ikan`);
          this.actions.sound("coin");
        }
        break;
      }
      case "facility": {
        const hidden = this.hiddenIn(target.id);
        if (hidden) {
          // Ketahuan! Kucing melompat keluar dari kardus.
          hidden.cancelTask();
          hidden.emote("exclaim", 1, false);
          hidden.jumpDown(() => hidden.setMode("happy", 1.2));
          this.actions.sound("meow");
          break;
        }
        this.actions.openFacility(target.id);
        break;
      }
    }
  }

  private clickVisitor(v: CatActor): void {
    const fed = this.actions.feedVisitor();
    const head = v.headPos();
    this.fx.hearts(head.x, head.y, 2);
    this.fx.text(head.x, head.y - 8, `${Math.min(fed, 3)}/3`, 0xffc2cf);
    if (v.mode === "wait") v.setMode("happy", 0.9, () => v.setMode("wait"));
  }

  private clickCat(a: CatActor): void {
    const now = Date.now();
    a.clicks = a.clicks.filter((t) => now - t < CLICK_WINDOW_MS);
    a.clicks.push(now);
    if (a.mode === "angry" || a.airborne || a.hidden) return;

    if (a.task === "alert") {
      // Kucing pembawa pesan: klik berarti "sudah kubaca".
      this.actions.alertCatClicked(a.id);
      const head = a.headPos();
      this.fx.hearts(head.x, head.y, 1);
      return;
    }
    if (this.treatMode && this.treatCat(a.id)) return;

    if (a.task === "chat") {
      // Dielus sambil diajak ngobrol: senang, lalu kembali mendengarkan.
      this.actions.pet(a.id);
      const head = a.headPos();
      this.fx.hearts(head.x, head.y, 2);
      if (a.mode !== "sulk") a.setMode("happy", 1.2);
      return;
    }

    if (a.mode === "sulk") {
      a.emote("anger", 1, false);
      this.actions.sound("hiss");
      this.actions.tip("sulk", "Dia sedang ngambek. Usap-usap pelan dengan kursor, atau bujuk dengan camilan.");
      return;
    }
    if (a.clicks.length >= CLICKS_TO_ANGER) {
      this.makeAngry(a);
      return;
    }

    this.actions.pet(a.id);
    const head = a.headPos();
    this.fx.hearts(head.x, head.y, 3);
    if (a.mode === "sleep") {
      a.cancelTask();
      a.emote("exclaim", 0.9, false);
      a.setMode("startled", 0.5, () => a.setMode("happy", 1.4));
      return;
    }
    if (a.mode === "purr" || a.mode === "treat" || a.mode === "land") return;
    a.cancelTask();
    a.setMode("happy", 1.6);
    if (a.clicks.length === CLICKS_TO_ANGER - 2) a.emote("anger", 0.8, false);
  }

  private makeAngry(a: CatActor): void {
    a.cancelTask();
    a.clicks = [];
    a.rub = 0;
    a.emote("anger", 1.6, false);
    this.actions.sound("hiss");
    this.actions.tip("angry", "Dia kesal karena diganggu terus. Biarkan sebentar, usap pelan, atau beri camilan.");
    a.setMode("angry", 1.3, () => this.flee(a));
  }

  private flee(a: CatActor): void {
    // Selama kabur dan ngambek, mainan dan camilan tidak bisa menarik perhatiannya
    // (kecuali camilan diberikan langsung dengan klik).
    a.task = "flee";
    const sulk = () =>
      a.setMode("sulk", undefined, () => {
        a.task = null;
        a.needsDecision = true;
      });
    if (a.spot) {
      if (this.cursor) a.dir = this.cursor.x > a.x ? -1 : 1;
      sulk();
      return;
    }
    const s = this.pixelScale;
    const away: 1 | -1 = this.cursor ? (a.x >= this.cursor.x ? 1 : -1) : Math.random() < 0.5 ? 1 : -1;
    const [minX, maxX] = this.walkRange();
    let tx = a.x + away * rand(50, 90) * s;
    // Mentok di tepi: lari ke arah sebaliknya, tetap membelakangi kursor di akhir.
    if (tx < minX || tx > maxX) tx = clamp(tx, minX, maxX);
    a.walkTo(
      tx,
      () => {
        a.dir = away;
        sulk();
      },
      true,
    );
  }

  private giveTreat(a: CatActor): boolean {
    if (this.game.state.inventory.treats <= 0) {
      this.setTreatMode(false);
      this.actions.modesChanged();
      return false;
    }
    const wasSulking = a.mode === "sulk";
    if (!this.actions.treat(a.id)) return false;
    a.cancelTask();
    if (this.cursor) a.face(this.cursor.x);
    const head = a.headPos();
    this.fx.hearts(head.x, head.y, 3);
    if (wasSulking) this.fx.text(head.x, head.y - 6, "Sudah baikan ♥", 0xffc2cf, 13);
    a.emote("heart", 1.6);
    a.setMode("treat", 1.8, () => a.setMode("happy", 1.2));
    a.clicks = [];
    this.actions.sound("crunch");
    if (this.game.state.inventory.treats <= 0) {
      this.setTreatMode(false);
      this.actions.modesChanged();
      this.actions.tip("treats-out", "Camilan habis. Beli lagi di Toko.");
    }
    return true;
  }

  private purr(a: CatActor): void {
    const gained = this.actions.purr(a.id);
    const head = a.headPos();
    if (a.mode === "sulk") this.fx.text(head.x, head.y - 6, "Sudah baikan ♥", 0xffc2cf, 13);
    if (a.mode === "sleep") {
      this.fx.notes(head.x, head.y, 2);
      a.extendMode(10);
    } else if (!a.airborne && !a.hidden && a.mode !== "treat") {
      // Yang sedang diajak ngobrol tetap dalam obrolan setelah mendengkur.
      const chatting = a.task === "chat";
      a.cancelTask();
      if (chatting) a.task = "chat";
      a.setMode("purr", 4.5);
    }
    if (gained) {
      this.fx.hearts(head.x, head.y, 2);
      a.emote("heart", 1.6);
    }
    this.actions.sound("purr");
    this.actions.tip("purr", "Prrr... Usapan memberi ikatan lebih banyak daripada klik. Ikatan menambah produksi kucing.");
  }

  // -------------------------------------------------------------------------
  // Uji klik

  private residents(): CatActor[] {
    return [...this.cats.values()];
  }

  private actorAt(x: number, y: number, includeVisitor = true): CatActor | null {
    const list = this.residents();
    if (includeVisitor && this.visitor) list.push(this.visitor);
    let best: CatActor | null = null;
    let bestZ = -Infinity;
    const pad = this.pixelScale;
    for (const a of list) {
      if (a.removed || a.hidden || a === this.dragging) continue;
      if (a.contains(x, y, pad) && a.container.zIndex > bestZ) {
        best = a;
        bestZ = a.container.zIndex;
      }
    }
    return best;
  }

  private giftAt(x: number, y: number): GiftView | null {
    const pad = 3 * this.pixelScale;
    for (const view of this.gifts.values()) {
      if (!view.revealed) continue;
      const b = view.sprite.getBounds();
      if (x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad) return view;
    }
    return null;
  }

  private sparkleAt(x: number, y: number): boolean {
    if (!this.sparkle) return false;
    const b = this.sparkle.getBounds();
    const pad = 2 * this.pixelScale;
    return x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;
  }

  private facilityAt(x: number, y: number): FacilityId | null {
    for (const v of this.facilities.values()) {
      const b = v.sprite.getBounds();
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return v.id;
    }
    return null;
  }

  /** Fasilitas di bawah kucing yang sedang diangkat (area lebih longgar). */
  private facilityDropAt(x: number, y: number): FacilityId | null {
    const s = this.pixelScale;
    for (const v of this.facilities.values()) {
      const b = v.sprite.getBounds();
      if (x >= b.minX - 4 * s && x <= b.maxX + 4 * s && y <= this.groundY + 4) return v.id;
    }
    return null;
  }

  private targetAt(x: number, y: number): PressTarget | null {
    const actor = this.actorAt(x, y);
    if (actor) return { kind: "actor", actor };
    const gift = this.giftAt(x, y);
    if (gift) return { kind: "gift", view: gift };
    if (this.sparkleAt(x, y)) return { kind: "sparkle" };
    const fid = this.facilityAt(x, y);
    if (fid) return { kind: "facility", id: fid };
    return null;
  }

  /** Sedang menekan/menyeret: jendela harus tetap menangkap mouse di mana pun kursornya. */
  isCapturing(): boolean {
    return this.press !== null || this.dragging !== null;
  }

  /** Untuk klik tembus: true bila titik ini harus ditangkap jendela. */
  hitTest(x: number, y: number): boolean {
    if (this.dragging || this.press) return true;
    return this.targetAt(x, y) !== null;
  }

  private hiddenIn(fid: FacilityId): CatActor | null {
    for (const a of this.cats.values()) if (a.hidden && a.spot?.facility === fid) return a;
    return null;
  }

  catPosition(catId: string): { x: number; y: number } | null {
    const a = catId === "visitor" ? this.visitor : this.cats.get(catId);
    return a && !a.hidden ? a.headPos() : null;
  }

  // -------------------------------------------------------------------------
  // Cuaca dan waktu

  private isNightNow(): boolean {
    return isDark(this.phase);
  }

  /** Perbarui fase hari dan cuaca yang berlaku dari GameState. */
  private refreshWorld(now: number): void {
    const w = this.game.state.weather;
    this.phase = this.game.phase(now);
    this.weather = currentWeather(w, now);
  }

  /** Warna cahaya kucing dan fasilitas berpindah halus mengikuti waktu dan cuaca. */
  private updateLighting(dt: number): void {
    const w = this.game.state.weather;
    const now = Date.now();
    const target = w.enabled && w.tint ? lightTint(now, sunFor(now, w.last), this.weather.kind) : 0xffffff;
    // Disimpan sebagai pecahan agar langkah kecil tidak hilang karena pembulatan.
    const k = Math.min(1, dt * 0.8);
    const c = this.light;
    for (let i = 0; i < 3; i++) {
      const goal = (target >> (16 - i * 8)) & 0xff;
      const diff = goal - c[i];
      c[i] = Math.abs(diff) < 0.6 ? goal : c[i] + diff * k;
    }
    const tint = (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
    if (tint !== this.tint) {
      this.tint = tint;
      this.facilityLayer.tint = tint;
      this.actorLayer.tint = tint;
      this.giftLayer.tint = tint;
    }
  }

  /** Ikon cuaca/waktu sekarang (untuk gelembung pikiran dan panel). */
  weatherIcon(): ObjectId {
    switch (this.weather.kind) {
      case "storm":
        return "stormIcon";
      case "rain":
      case "drizzle":
        return "rainIcon";
      case "snow":
        return "snowIcon";
      case "fog":
        return "fogIcon";
      case "cloudy":
        return "cloudIcon";
      case "partly":
        return this.isNightNow() ? "cloudIcon" : "partlyIcon";
      default:
        return this.isNightNow() ? "moon" : "sun";
    }
  }

  /** Teksture rak jendela mengikuti langit. */
  private rakTexture(): ObjectId {
    const w = this.game.state.weather;
    if (!w.enabled) return "rak";
    if (isWet(this.weather.kind) || this.weather.kind === "cloudy" || this.weather.kind === "fog" || this.weather.kind === "snow") {
      return this.isNightNow() ? "rakNight" : "rakRain";
    }
    switch (this.phase) {
      case "fajar":
        return "rakDawn";
      case "senja":
        return "rakDusk";
      case "malam":
      case "dini":
        return "rakNight";
      default:
        return "rak";
    }
  }

  /** Cari tempat berteduh: masuk kardus, naik ke rak, atau ke bawah tiang garuk. */
  private seekShelter(a: CatActor): void {
    const s = this.pixelScale;
    const box: SpotRef = { facility: "kardus", index: 0, kind: "box" };
    if (this.facilities.has("kardus") && this.spotFree(box, a) && Math.random() < 0.6) {
      this.facilityActivity(a, "kardus");
      return;
    }
    if (this.facilities.has("rak") && Math.random() < 0.6 && this.facilityActivity(a, "rak")) return;
    const tiang = this.facilities.get("tiang");
    if (tiang) {
      // Duduk di bawah platform tiang garuk, sesekali menjilati bulu yang basah.
      a.walkTo(tiang.x + (a.x < tiang.x ? -4 : 4) * s, () => {
        a.setMode(Math.random() < 0.5 ? "groom" : "sit", rand(6, 14));
      });
      return;
    }
    a.setMode("groom");
  }

  /** Kilat menyambar: kucing kaget, sebagian lari bersembunyi. */
  private lightningStrike(): void {
    if (this.focusMode) return;
    if (this.game.state.weather.rainSound) window.setTimeout(() => this.actions.sound("thunder"), rand(300, 1400));
    for (const a of this.freeCats()) {
      if (a.spot) continue;
      a.emote("exclaim", 0.9, false);
      a.setMode("startled", 0.5, () => {
        if (Math.random() < 0.6) this.seekShelter(a);
        else a.setMode("sit", rand(2, 4));
      });
    }
  }

  /** Cuaca berganti: kucing bereaksi (berteduh saat mulai hujan, keluar saat reda). */
  onWeatherChanged(to: string, react = true): void {
    this.refreshWorld(Date.now());
    if (this.focusMode || !react) return;
    const wet = to === "rain" || to === "storm" || to === "drizzle";
    for (const a of this.freeCats()) {
      if (Math.random() < 0.5) continue;
      a.emote(this.weatherIcon(), 2);
      if (wet && !a.spot) this.seekShelter(a);
    }
  }

  /** Sapaan pagi/siang/sore/malam: seekor kucing datang dengan ikon cuaca. Mengembalikan id-nya. */
  greet(): string | null {
    this.refreshWorld(Date.now());
    const free = this.freeCats();
    const a = free[Math.floor(Math.random() * free.length)];
    if (!a) return null;
    a.emote(this.weatherIcon(), 3);
    if (this.phase === "pagi" || this.phase === "fajar") a.setMode("stretch", 2.5, () => a.setMode("happy", 1.5));
    else if (this.phase === "malam") a.setMode("yawn", 2.7);
    else a.setMode("happy", 2);
    this.actions.sound("meow");
    return a.id;
  }

  // -------------------------------------------------------------------------
  // Asisten: kucing pembawa pesan

  /** Kucing yang sedang membawa pesan, dengan waktu mulai dan bunyi berikutnya. */
  private messengers = new Map<string, { key: string; kind: AlertKind; since: number; nextBeep: number }>();

  private pickMessenger(): CatActor | null {
    const all = this.residents().filter((a) => !a.removed && a !== this.dragging && a.task !== "alert");
    // Kucing yang sedang diajak ngobrol tidak dipakai bila ada yang lain.
    const others = all.filter((a) => a.task !== "chat");
    const list = others.length > 0 ? others : all;
    if (list.length === 0) return null;
    const bond = (a: CatActor) => this.game.cat(a.id)?.bond ?? 0;
    // Yang paling sayang padamu, tapi jangan selalu yang sama bila ikatan setara.
    list.sort((p, q) => bond(q) - bond(p) || Math.random() - 0.5);
    return list[0];
  }

  /** Kucing-kucing yang sedang bebas (untuk reaksi bersama). */
  private freeCats(): CatActor[] {
    return this.residents().filter((a) => !a.airborne && !a.hidden && !a.task && a !== this.dragging);
  }

  /**
   * Sampaikan pesan asisten lewat kucing: ia berlari ke tengah strip lalu
   * melompat-lompat sampai pesannya dibaca. Mengembalikan id kucing pembawa pesan.
   */
  summonForAlert(alert: Alert): string | null {
    const s = this.pixelScale;
    const icon = ALERT_ICON[alert.kind];

    if (alert.kind === "chime") {
      const a = this.freeCats()[Math.floor(Math.random() * Math.max(1, this.freeCats().length))] ?? this.pickMessenger();
      if (!a) return null;
      a.emote("clock", 2.4);
      if (a.calm) a.setMode("sit", 3);
      this.actions.sound("chime");
      return null;
    }

    const a = this.pickMessenger();
    if (!a) return null;
    a.cancelTask();
    a.task = "alert";
    this.messengers.set(a.id, { key: alert.key, kind: alert.kind, since: performance.now(), nextBeep: Infinity });
    const [minX, maxX] = this.walkRange();
    const target = clamp((minX + maxX) / 2 + rand(-50, 50) * s * 0.4, minX + 30 * s, maxX - 30 * s);
    if (alert.kind === "water") a.setCarry("water");
    a.emote("exclaim", 0.8, false);

    const arrive = () => {
      if (a.task !== "alert") return;
      a.setCarry(null);
      a.face(maxX);
      a.emote(icon, 3);
      if (alert.kind === "bedtime") a.setMode("yawn", 2.7, () => a.task === "alert" && a.setMode("announce"));
      else if (alert.kind === "stretch") a.setMode("stretch", 3, () => a.task === "alert" && a.setMode("announce"));
      else a.setMode("announce");
      this.actions.sound(alert.kind === "reminder" || alert.kind === "focusDone" || alert.kind === "breakDone" ? "alarm" : "meow");
      const now = performance.now();
      this.messengers.set(a.id, { key: alert.key, kind: alert.kind, since: now, nextBeep: now + ALARM_REPEAT_MS });

      // Reaksi bersama.
      if (alert.kind === "focusDone") {
        const head = a.headPos();
        this.fx.confetti(head.x, head.y);
        for (const o of this.freeCats()) o.setMode("happy", rand(1.5, 3));
      } else if (alert.kind === "stretch") {
        for (const o of this.freeCats()) o.setMode("stretch", rand(2, 3.5));
      } else if (alert.kind === "bedtime") {
        for (const o of this.freeCats()) o.setMode(Math.random() < 0.5 ? "yawn" : "sleep", Math.random() < 0.5 ? 2.7 : 60);
      }
    };
    const run = () => a.walkTo(target, arrive, Math.abs(target - a.x) > 60 * s);
    if (a.spot || a.hidden) a.jumpDown(run, target);
    else run();
    return a.id;
  }

  /** Pesan sudah dibaca: kucing kembali beraktivitas (hanya bila ia masih membawa pesan itu). */
  releaseAlert(catId: string | null, key: string): void {
    if (!catId) return;
    const m = this.messengers.get(catId);
    if (!m || m.key !== key) return;
    this.messengers.delete(catId);
    const a = this.cats.get(catId);
    if (!a || a.task !== "alert") return;
    a.task = null;
    a.setCarry(null);
    // Yang sedang di udara cukup dibiarkan mendarat; keputusan berikutnya datang sendiri.
    if (!a.airborne) {
      a.setMode("happy", 1.4);
      const head = a.headPos();
      this.fx.hearts(head.x, head.y, 2);
    }
  }

  private updateMessengers(): void {
    const now = performance.now();
    for (const [id, m] of this.messengers) {
      const a = this.cats.get(id);
      if (!a || a.task !== "alert") {
        this.messengers.delete(id);
        continue;
      }
      if (a.mode !== "announce" || now < m.nextBeep || now - m.since > ALARM_MAX_MS) continue;
      m.nextBeep = now + ALARM_REPEAT_MS;
      a.emote(ALERT_ICON[m.kind], 2.5);
      if (m.kind === "reminder") this.actions.sound("alarm");
    }
  }

  /** Tugas selesai dan semacamnya: seekor kucing ikut senang. */
  cheer(): void {
    const free = this.freeCats();
    const a = free[Math.floor(Math.random() * free.length)];
    if (!a) return;
    a.setMode("happy", 1.6);
    const head = a.headPos();
    this.fx.stars(head.x, head.y, 6);
    this.fx.hearts(head.x, head.y, 1);
  }

  /** Kucing yang dilepas berpamitan lalu berjalan keluar layar. */
  farewell(catId: string): void {
    const a = this.cats.get(catId);
    if (!a) {
      this.sync();
      return;
    }
    this.cats.delete(catId);
    this.messengers.delete(catId);
    if (this.dragging === a) {
      this.dragging = null;
      this.press = null;
      // Dilepas dari genggaman: jatuh dulu, lalu berjalan keluar.
      a.drop(0, 0, null);
    }
    a.cancelTask();
    a.setNeed(null);
    const head = a.headPos();
    this.fx.hearts(head.x, head.y, 4);
    a.emote("heart", 2.5);
    const exit = a.x < this.width / 2 ? -100 : this.width + 100;
    a.exitTo = exit;
    const go = () => a.leaveTo(exit);
    // Yang sedang jatuh dibiarkan mendarat; loop "leaving" mengirimnya keluar.
    if (a.airborne) a.needsDecision = false;
    else if (a.spot || a.hidden) a.jumpDown(go);
    else a.setMode("happy", 1.2, go);
    this.leaving.push(a);
    this.sync();
  }

  /**
   * Foto strip berbingkai untuk disimpan sebagai PNG: kucing, fasilitas, dan
   * kado di atas langit siang/malam, dengan keterangan tanggal.
   */
  photo(caption: string): HTMLCanvasElement {
    const s = this.pixelScale;
    const [, maxX] = this.walkRange();
    // Cukup tinggi untuk kucing yang bertengger di tiang garuk beserta topinya.
    const top = Math.max(0, Math.floor(this.groundY - 54 * s));
    const w = Math.max(200, Math.min(this.width, Math.round(maxX + 40 * s)));
    const h = Math.ceil(this.height - top);
    const overlays: Container[] = [this.hoverLabel, this.hoverHearts, this.toyLayer];
    const was = overlays.map((n) => n.visible);
    overlays.forEach((n) => (n.visible = false));
    let shot: HTMLCanvasElement;
    try {
      shot = this.app.renderer.extract.canvas({
        target: this.app.stage,
        frame: new Rectangle(0, top, w, h),
        resolution: 1,
      }) as HTMLCanvasElement;
    } finally {
      overlays.forEach((n, i) => (n.visible = was[i]));
    }

    const pad = 14;
    const footer = 30;
    const out = document.createElement("canvas");
    out.width = w + pad * 2;
    out.height = h + pad * 2 + footer;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fff8ec";
    ctx.fillRect(0, 0, out.width, out.height);
    const night = this.isNightNow();
    const sky = ctx.createLinearGradient(0, pad, 0, pad + h);
    sky.addColorStop(0, night ? "#1d2346" : "#9cc6e4");
    sky.addColorStop(1, night ? "#3b3f6e" : "#e3eef4");
    ctx.fillStyle = sky;
    ctx.fillRect(pad, pad, w, h);
    if (night) {
      ctx.fillStyle = "#fffbe0";
      for (let i = 0; i < 40; i++) ctx.fillRect(pad + ((i * 9301 + 49297) % w), pad + ((i * 233 + 17) % Math.max(1, h - 60)), 2, 2);
    } else {
      // Awan piksel.
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      for (let i = 0; i < Math.max(2, Math.floor(w / 260)); i++) {
        const cx = pad + 40 + ((i * 7919) % Math.max(1, w - 120));
        const cy = pad + 12 + ((i * 97) % 3) * 10;
        const u = 2 * s;
        ctx.fillRect(cx, cy + u, 10 * u, 2 * u);
        ctx.fillRect(cx + 2 * u, cy, 5 * u, u);
      }
    }
    // Lantai kayu tipis.
    ctx.fillStyle = night ? "#4a3a56" : "#d9b98c";
    ctx.fillRect(pad, pad + h - 4, w, 4);
    ctx.drawImage(shot, pad, pad);
    ctx.strokeStyle = "#2a1d1a";
    ctx.lineWidth = 3;
    ctx.strokeRect(pad - 1.5, pad - 1.5, w + 3, h + 3);
    ctx.fillStyle = "#2a1d1a";
    ctx.font = "800 15px Segoe UI, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("Meow Corner", pad, pad * 2 + h + footer / 2 - 4);
    ctx.font = "600 13px Segoe UI, system-ui, sans-serif";
    ctx.fillStyle = "#6b5850";
    const label = caption;
    ctx.fillText(label, pad + 120, pad * 2 + h + footer / 2 - 4);
    this.fx.flash(this.width, this.height);
    return out;
  }

  // -------------------------------------------------------------------------
  // Obrolan

  /**
   * Kucing berhenti dan mendengarkan. Mengembalikan suasana hatinya, atau null
   * bila kucing sedang tidak bisa diajak ngobrol (diangkat, di udara, membawa pesan).
   */
  startChat(catId: string): { mood: "normal" | "sleepy" | "sulk" } | null {
    const a = this.cats.get(catId);
    if (!a || a.removed || a.airborne || a.hidden || a === this.dragging || a.task === "alert" || a.exitTo !== null) return null;
    if (this.typing?.actor === a) this.endTyping(false);
    const mood = a.mode === "sulk" || a.mode === "angry" ? "sulk" : a.mode === "sleep" ? "sleepy" : "normal";
    a.cancelTask();
    a.task = "chat";
    a.rub = 0;
    if (mood === "sulk") a.setMode("sulk", Infinity);
    else if (mood === "sleepy") a.setMode("yawn", 2.7);
    else {
      if (this.cursor) a.face(this.cursor.x);
      a.setMode("sit", Infinity);
    }
    return { mood };
  }

  /** Kucing masih dalam obrolan (belum diangkat, dipanggil, atau membawa pesan). */
  isChatting(catId: string): boolean {
    return this.cats.get(catId)?.task === "chat";
  }

  /** Mulut bergerak selama kucing "berbicara". */
  chatTalk(catId: string, talking: boolean): void {
    const a = this.cats.get(catId);
    if (!a || a.task !== "chat") return;
    if (talking && (a.mode === "sit" || a.mode === "talk")) a.setMode("talk");
    else if (!talking && a.mode === "talk") a.setMode("sit", Infinity);
  }

  /** Gerakan kucing sebagai jawaban (senang, mendengkur, menguap...). */
  chatAnim(catId: string, anim: ChatAnim): void {
    const a = this.cats.get(catId);
    if (!a || a.task !== "chat" || a.airborne) return;
    const head = a.headPos();
    switch (anim) {
      case "talk":
        break;
      case "happy":
        a.setMode("happy", 1.6);
        break;
      case "purr":
        a.setMode("purr", 3);
        this.fx.hearts(head.x, head.y, 2);
        this.actions.sound("purr");
        break;
      case "proud":
        a.setMode("proud", 2);
        break;
      case "stretch":
        a.setMode("stretch", 2.5);
        break;
      case "yawn":
        a.setMode("yawn", 2.7);
        break;
      case "play":
        a.setMode("play", 2);
        break;
      case "groom":
        a.setMode("groom", 2.5);
        break;
      case "startled":
        a.setMode("startled", 0.5);
        break;
      case "sleep":
      case "zoomies":
        // Ditangani saat obrolan berakhir.
        break;
    }
  }

  /** Hati melayang dari kucing yang diajak ngobrol. */
  chatHearts(catId: string): void {
    const a = this.cats.get(catId);
    if (!a) return;
    const head = a.headPos();
    this.fx.hearts(head.x, head.y, 3);
  }

  /** Beri camilan langsung dari obrolan. */
  treatCat(catId: string): boolean {
    const a = this.cats.get(catId);
    if (!a || a.airborne) return false;
    const chatting = a.task === "chat";
    const ok = this.giveTreat(a);
    // Setelah makan camilan ia kembali mendengarkan.
    if (ok && chatting) a.task = "chat";
    return ok;
  }

  /** Kucing yang ngambek memaafkan. */
  forgive(catId: string): void {
    const a = this.cats.get(catId);
    if (!a) return;
    a.clicks = [];
    if (a.mode === "sulk" || a.mode === "angry") {
      a.setMode("happy", 1.6);
      const head = a.headPos();
      this.fx.hearts(head.x, head.y, 2);
    }
  }

  /** Obrolan selesai: kucing kembali beraktivitas (atau tidur/zoomies sebagai penutup). */
  endChat(catId: string, final?: ChatAnim): void {
    const a = this.cats.get(catId);
    if (!a || a.task !== "chat") return;
    a.task = null;
    if (a.airborne) return;
    if (final === "sleep") {
      a.setMode("sleep");
      return;
    }
    if (final === "zoomies" && !a.spot && !this.focusMode) {
      this.zoomies(a);
      return;
    }
    if (a.mode === "sulk") a.setMode("sulk", rand(3, 6));
    else if (a.mode === "sit" || a.mode === "talk") a.setMode("sit", rand(2, 4));
  }

  /** Kucing bebas yang bisa berceloteh sekarang, atau null. */
  pickChatterCat(): string | null {
    const list = this.freeCats().filter((a) => !a.removed && a.mode !== "sleep" && a.exitTo === null);
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)].id;
  }

  /** Kucing mengajak ngobrol: ikon gelembung kata dan menoleh ke pemain. */
  inviteChat(catId: string): void {
    const a = this.cats.get(catId);
    if (!a || a.task || a.airborne) return;
    a.emote("chat", 8);
    if (a.calm || a.mode === "walk") {
      const [minX, maxX] = this.walkRange();
      a.face(this.cursor?.x ?? (minX + maxX) / 2);
      a.setMode("sit", 8);
    }
    this.actions.sound("meow");
  }

  /** Celoteh singkat: mulut bergerak sebentar. */
  chatterTalk(catId: string): void {
    const a = this.cats.get(catId);
    if (!a || a.task || a.airborne || !a.calm) return;
    a.setMode("talk", 1.2, () => a.setMode("sit", rand(2, 4)));
  }

  // -------------------------------------------------------------------------
  // Kucing ikut mengetik

  /** Ketukan keyboard/klik baru: kucing pengetik menepuk keyboard mini. */
  onTaps(count: number, fish: number): void {
    if (count <= 0) return;
    const now = performance.now();
    let t = this.typing;
    if (t && (t.actor.removed || t.actor.task !== "type" || t.actor.airborne)) {
      this.endTyping(false);
      t = null;
    }
    if (!t) {
      if (now < this.typingRetryAt) return;
      t = this.beginTyping();
      if (!t) {
        this.typingRetryAt = now + 3000;
        return;
      }
    }
    t.lastTap = now;
    t.pending = Math.min(8, t.pending + count);
    t.fish += fish;
  }

  private typistCandidate(): CatActor | null {
    // Hanya kucing yang sedang santai di lantai; yang sedang makan, menuju mangkuk,
    // kesal, tidur, atau bermain tidak diganggu.
    const ok = (a: CatActor) =>
      !a.removed &&
      !a.spot &&
      a !== this.dragging &&
      a.exitTo === null &&
      a.task === null &&
      (a.mode === "idle" || a.mode === "sit" || a.mode === "groom" || a.mode === "watch");
    const preferred = this.game.state.typing.catId;
    if (preferred) {
      const a = this.cats.get(preferred);
      if (a && ok(a)) return a;
    }
    const bond = (a: CatActor) => this.game.cat(a.id)?.bond ?? 0;
    const list = this.residents().filter(ok);
    list.sort((p, q) => bond(q) - bond(p));
    return list[0] ?? null;
  }

  private beginTyping(): TypingSession | null {
    const a = this.typistCandidate();
    if (!a) return null;
    const s = this.pixelScale;
    a.cancelTask();
    a.task = "type";
    const [minX, maxX] = this.walkRange();
    // Keyboard di depan kucing, menghadap ke sisi yang lebih lapang.
    if (a.x + a.dir * 18 * s > maxX || a.x + a.dir * 18 * s < minX) a.dir = a.dir === 1 ? -1 : 1;
    const keyboard = new Sprite(objectTexture("keyboard"));
    keyboard.anchor.set(0.5, 1);
    keyboard.scale.set(s * a.dir, s);
    keyboard.position.set(Math.round(a.x + a.dir * 10 * s), this.groundY);
    this.giftLayer.addChild(keyboard);
    this.fx.dust(keyboard.x, this.groundY, 3);
    a.setMode("type");
    this.typing = { actor: a, keyboard, lastTap: performance.now(), pending: 0, tapCooldown: 0, keyTimer: 0, flip: false, fish: 0, fishTimer: 1.5 };
    return this.typing;
  }

  private endTyping(stretch: boolean): void {
    const t = this.typing;
    if (!t) return;
    this.typing = null;
    this.fx.dust(t.keyboard.x, this.groundY, 3);
    t.keyboard.destroy();
    const a = t.actor;
    if (a.task === "type") {
      a.task = null;
      if (stretch && !a.airborne) a.setMode("stretch", 2.2);
      else if (a.mode === "type") a.needsDecision = true;
    }
  }

  private updateTyping(dt: number, now: number): void {
    const t = this.typing;
    if (!t) return;
    const a = t.actor;
    if (a.removed || a.task !== "type" || a.airborne || !this.game.state.typing.enabled) {
      this.endTyping(false);
      return;
    }
    const s = this.pixelScale;
    t.keyboard.position.set(Math.round(a.x + a.dir * 10 * s), this.groundY);
    t.keyboard.scale.set(s * a.dir, s);
    t.tapCooldown -= dt;
    if (t.pending > 0 && t.tapCooldown <= 0) {
      t.pending -= 1;
      t.tapCooldown = 0.075;
      t.flip = !t.flip;
      t.keyTimer = 0.08;
      a.tap();
      t.keyboard.texture = objectTexture(t.flip ? "keyboardTap" : "keyboardTap2");
    }
    if (t.keyTimer > 0) {
      t.keyTimer -= dt;
      if (t.keyTimer <= 0) t.keyboard.texture = objectTexture("keyboard");
    }
    t.fishTimer -= dt;
    if (t.fishTimer <= 0) {
      t.fishTimer = 2.5;
      if (t.fish > 0) {
        this.fx.text(t.keyboard.x, this.groundY - 10 * s, `+${formatFish(t.fish)}`, 0xfff3b0, 12);
        t.fish = 0;
      }
    }
    if (performance.now() - t.lastTap > TYPING_IDLE_MS) this.endTyping(true);
    void now;
  }

  // -------------------------------------------------------------------------
  // Perintah dari UI

  /** Panggil kucing: ia berlari mendekat ke kursor (atau tengah strip). */
  callCat(catId: string): void {
    const a = this.cats.get(catId);
    if (!a || a.airborne) return;
    const s = this.pixelScale;
    const [minX, maxX] = this.walkRange();
    a.cancelTask();
    a.task = "call";
    a.emote("exclaim", 0.8, false);
    const go = () => {
      const target = clamp(this.cursor?.x ?? (minX + maxX) / 2, minX, maxX);
      a.walkTo(
        target + (a.x < target ? -12 : 12) * s,
        () => {
          a.task = null;
          a.face(target);
          a.setMode("sit", 4);
          a.emote("heart", 1.8);
          this.actions.sound("meow");
        },
        true,
      );
    };
    if (a.spot || a.hidden) a.jumpDown(go, this.cursor?.x);
    else go();
  }

  /** Setelah tombol "Beri makan": semua kucing berlari ke mangkuk. */
  private feedingTime(): void {
    const bowl = this.facilities.get("mangkuk");
    for (const a of this.cats.values()) {
      if (a.airborne || a === this.dragging || a.task === "alert") continue;
      const head = a.headPos();
      this.fx.hearts(head.x, head.y, 1);
      if (!bowl) continue;
      a.cancelTask();
      if (a.spot || a.hidden) a.jumpDown(() => this.goEat(a, true), bowl.x);
      else this.goEat(a, true);
    }
  }

  /** Fasilitas baru: kucing terdekat datang memeriksa. */
  private curiousAbout(fid: FacilityId): void {
    const view = this.facilities.get(fid);
    if (!view) return;
    const candidates = this.residents().filter((a) => a.interruptible && !a.task && !a.spot);
    candidates.sort((p, q) => Math.abs(p.x - view.x) - Math.abs(q.x - view.x));
    const a = candidates[0];
    if (!a) return;
    a.emote("exclaim", 1, false);
    window.setTimeout(() => {
      if (a.removed || a.task || a.airborne) return;
      this.facilityActivity(a, fid);
    }, 600);
  }

  // -------------------------------------------------------------------------
  // Keputusan kucing

  private decide(a: CatActor): void {
    a.needsDecision = false;
    // Kucing yang perlu keputusan baru tidak sedang menuju tempat mana pun.
    a.claim = null;
    if (a.isVisitor) {
      if (a.mode !== "wait" && a.mode !== "arrive" && a.mode !== "leave") a.setMode("wait");
      return;
    }
    switch (a.task) {
      case "hunt":
        this.huntStep(a);
        return;
      case "beg":
        this.begStep(a);
        return;
      case "butterfly":
        this.butterflyStep(a);
        return;
      case "alert":
        // Pembawa pesan tetap menunggu sampai pesannya dibaca.
        a.setMode("announce");
        return;
      case "chat":
        // Sedang diajak ngobrol: duduk mendengarkan.
        a.setMode("sit", Infinity);
        return;
      case "type":
        if (this.typing?.actor === a) {
          a.setMode("type");
          return;
        }
        a.task = null;
        break;
      case null:
        break;
      default:
        // Tugas lain selesai lewat callback; sisanya dianggap selesai.
        a.task = null;
        a.claim = null;
        break;
    }
    this.decideFree(a);
  }

  private decideFree(a: CatActor): void {
    const cat = this.game.cat(a.id);
    if (!cat) return;
    const s = this.pixelScale;
    if (a.spot?.kind === "box" || a.hidden) {
      a.jumpDown();
      return;
    }
    if (a.spot) {
      if (Math.random() < 0.55) this.perchActivity(a);
      else a.jumpDown();
      return;
    }
    const now = Date.now();
    const focus = this.focusMode;
    const night = this.isNightNow();
    const wet = isWet(this.weather.kind);
    const phase = this.phase;
    const hot = this.weather.temp !== null && this.weather.temp >= 31 && (phase === "siang" || phase === "sore");
    if (this.facilities.has("mangkuk") && cat.hunger < 0.5 && Math.random() < 0.7) {
      this.goEat(a);
      return;
    }
    const home = cat.facility && this.facilities.has(cat.facility) ? cat.facility : null;
    const owned = FACILITY_IDS.filter((id) => this.facilities.has(id));
    // Kucing aktif saat fajar dan senja (crepuscular), mengantuk saat malam dan siang terik,
    // dan mencari tempat berteduh saat hujan.
    const dawn = phase === "fajar" || phase === "pagi";
    const dusk = phase === "senja" || phase === "sore";
    const pick = pickWeighted({
      home: home ? (wet ? 10 : 32) : 0,
      explore: owned.length > 0 && !focus ? 7 : 0,
      shelter: wet && owned.some((id) => id === "kardus" || id === "rak" || id === "tiang") ? 30 : 0,
      wander: focus ? 6 : wet ? 4 : 20,
      sit: 16,
      groom: wet ? 14 : 9,
      sleep: focus ? 40 : night ? 28 : hot ? 22 : wet ? 16 : 9,
      idle: 7,
      stretch: dawn && !focus ? 7 : 2,
      yawn: night || phase === "dini" || dawn ? 4 : 1,
      zoomies: !focus && !night && !wet && now - this.lastZoomies > (dusk ? 20_000 : 45_000) ? (dusk ? 7 : dawn ? 4 : 2.5) : 0,
      think: focus ? 0 : 6,
      visit: !focus && heartCount(cat) >= 2 && this.cursor ? 3 : 0,
    });
    const [minX, maxX] = this.walkRange();
    switch (pick) {
      case "home":
        if (!this.facilityActivity(a, home!)) a.setMode("sit");
        break;
      case "explore":
        if (!this.facilityActivity(a, owned[Math.floor(Math.random() * owned.length)])) a.setMode("sit");
        break;
      case "wander": {
        const homeX = home ? this.facilityX(home) : null;
        a.walkTo(homeX !== null ? homeX + rand(-140, 140) : rand(minX, maxX));
        break;
      }
      case "zoomies":
        this.zoomies(a);
        break;
      case "shelter":
        this.seekShelter(a);
        break;
      case "think":
        a.setMode("sit", rand(3, 6));
        a.emote(this.thought(cat), 2);
        break;
      case "visit": {
        const cx = clamp(this.cursor?.x ?? a.x, minX, maxX);
        a.walkTo(cx + (a.x < cx ? -14 : 14) * s, () => {
          if (this.cursor) a.face(this.cursor.x);
          a.setMode("sit", 4);
          a.emote("heart", 1.8);
          this.actions.sound("meow");
        });
        break;
      }
      default:
        a.setMode(pick);
        break;
    }
  }

  private thought(cat: CatState): ObjectId {
    if (cat.hunger < 0.6) return "fish";
    if (this.isNightNow() && Math.random() < 0.5) return "zzz";
    if (Math.random() < 0.35) {
      // Memikirkan cuaca.
      const icon = this.weatherIcon();
      if (icon !== "sun" || !this.isNightNow()) return icon;
    }
    const options: ObjectId[] = ["note", "question", "leaf", "star", "feather"];
    if (heartCount(cat) >= 2) options.push("heart", "heart");
    return options[Math.floor(Math.random() * options.length)];
  }

  private goEat(a: CatActor, run = false): void {
    const bowl = this.facilities.get("mangkuk");
    if (!bowl) {
      a.setMode("sit");
      return;
    }
    const s = this.pixelScale;
    const side = a.x < bowl.x ? -1 : 1;
    const cat = this.game.cat(a.id);
    a.walkTo(
      bowl.x + side * 12 * s,
      () => {
        a.face(bowl.x);
        a.setMode("eat", cat && cat.hunger > 0.95 ? rand(1.5, 3) : undefined);
      },
      run,
    );
  }

  private facilityActivity(a: CatActor, fid: FacilityId): boolean {
    const view = this.facilities.get(fid);
    if (!view) return false;
    const s = this.pixelScale;
    const side = a.x < view.x ? -1 : 1;
    const half = (view.sprite.texture.width * s) / 2;
    const sitBeside = (mode: "sit" | "watch" = "sit") =>
      a.walkTo(view.x + side * (half + 8 * s), () => {
        a.face(view.x);
        a.setMode(mode);
      });

    switch (fid) {
      case "mangkuk":
        this.goEat(a);
        return true;
      case "benang":
        a.walkTo(view.x + side * (half + 6 * s), () => {
          a.face(view.x);
          a.setMode("play", rand(2.5, 4.5));
        });
        return true;
      case "akuarium":
        if (Math.random() < 0.5) {
          a.walkTo(view.x + side * (half + 7 * s), () => {
            a.face(view.x);
            a.setMode("watch", rand(6, 12));
            if (Math.random() < 0.5) a.emote("fish", 1.6);
          });
          return true;
        }
        break;
      default:
        break;
    }

    const defs = SPOTS[fid];
    if (!defs) {
      sitBeside();
      return true;
    }
    const free = defs
      .map((d, index): SpotRef => ({ facility: fid, index, kind: d.kind }))
      .filter((ref) => this.spotFree(ref, a));
    if (free.length === 0) {
      sitBeside(fid === "akuarium" ? "watch" : "sit");
      return true;
    }
    const spot = free[Math.floor(Math.random() * free.length)];
    a.claim = spotKey(spot);
    a.walkTo(view.x + side * (half + 4 * s), () => {
      if (!this.spotFree(spot, a)) {
        a.claim = null;
        a.setMode("sit");
        return;
      }
      const ok = a.jumpToSpot(spot, () => {
        a.claim = null;
        if (spot.kind === "box") {
          a.setMode("hidden", rand(15, 40));
          this.fx.dust(a.x, a.y, 3);
        } else this.perchActivity(a);
      });
      if (!ok) {
        a.claim = null;
        a.needsDecision = true;
      }
    });
    return true;
  }

  private perchActivity(a: CatActor): void {
    const fid = a.spot?.facility;
    if (!fid) {
      a.needsDecision = true;
      return;
    }
    const mode =
      fid === "rak"
        ? pickWeighted({ sleep: 65, groom: 15, sit: 20 })
        : fid === "akuarium"
          ? pickWeighted({ watch: 55, sit: 20, sleep: 25 })
          : pickWeighted({ sit: 35, sleep: 30, groom: 20, watch: 15 });
    a.setMode(mode, mode === "sleep" && fid === "rak" ? rand(30, 70) : undefined);
    if (mode === "watch" && fid === "akuarium" && Math.random() < 0.4) a.emote("fish", 1.6);
  }

  private zoomies(a: CatActor): void {
    a.task = "zoomies";
    this.lastZoomies = Date.now();
    a.emote("exclaim", 0.8, false);
    let legs = 3 + Math.floor(Math.random() * 3);
    const next = () => {
      if (a.task !== "zoomies") return;
      if (legs-- <= 0) {
        a.task = null;
        a.setMode("sit", rand(1.5, 3), () => a.setMode("groom"));
        return;
      }
      const [minX, maxX] = this.walkRange();
      const mid = (minX + maxX) / 2;
      a.walkTo(a.x < mid ? rand(mid, maxX) : rand(minX, mid), next, true);
    };
    next();
  }

  // -------------------------------------------------------------------------
  // Mainan bulu

  private huntStep(a: CatActor): void {
    const f = this.feather;
    const s = this.pixelScale;
    if (!f.visible) {
      a.task = null;
      this.decideFree(a);
      return;
    }
    const dx = f.x - a.x;
    if (a.hidden) {
      // Menyergap dari dalam kardus bila bulunya lewat dekat.
      if (Math.abs(dx) < 40 * s) {
        a.emote("exclaim", 0.8, false);
        a.jumpDown(undefined, f.x);
      } else a.setMode("hidden", 1);
      return;
    }
    if (a.spot) {
      if (Math.abs(dx) < 45 * s && f.y > a.y - 12 * s) this.pounce(a);
      else {
        a.face(f.x);
        a.setMode("watch", rand(0.6, 1.2));
      }
      return;
    }
    const height = this.groundY - f.y;
    const [minX, maxX] = this.walkRange();
    if (height > 55 * s) {
      a.face(f.x);
      const goal = clamp(f.x - Math.sign(dx) * 10 * s, minX, maxX);
      if (Math.abs(dx) > 30 * s && Math.abs(goal - a.x) > 4 * s) a.walkTo(goal);
      else if (Math.abs(dx) <= 30 * s && height < 72 * s && Math.random() < 0.35) this.pounce(a);
      else a.setMode("watch", rand(0.6, 1.2));
      return;
    }
    if (Math.abs(dx) > 24 * s) {
      const goal = clamp(f.x - Math.sign(dx) * 16 * s, minX, maxX);
      // Bulu di luar jangkauan (misalnya di atas panel): tunggu sambil menatap.
      if (Math.abs(goal - a.x) <= 4 * s) {
        a.face(f.x);
        a.setMode("watch", rand(0.6, 1.2));
      } else a.walkTo(goal, undefined, true);
      return;
    }
    a.face(f.x);
    a.setMode("stalk", rand(0.4, 1), () => this.pounce(a));
  }

  private caught = new Set<CatActor>();

  private pounce(a: CatActor): void {
    const f = this.feather;
    const s = this.pixelScale;
    if (!f.visible || a.task !== "hunt") {
      a.needsDecision = true;
      return;
    }
    const [minX, maxX] = this.walkRange();
    const tx = clamp(f.x + f.vx * 0.25, Math.max(minX, a.x - 55 * s), Math.min(maxX, a.x + 55 * s));
    const startY = a.y;
    // Puncak lompatan kira-kira setinggi bulu (mulut ±10 piksel sprite di atas kaki).
    const apex = clamp(Math.min(startY, this.groundY) - (f.y + 10 * s), 6 * s, 55 * s);
    a.spot = null;
    this.caught.delete(a);
    a.leapTo(
      tx,
      this.groundY,
      () => {
        if (this.caught.has(a)) {
          this.caught.delete(a);
          a.setMode("proud", 1.3);
        } else {
          a.setMode("land", 0.3, () => {
            if (Math.random() < 0.3) a.emote("question", 1.1, false);
            a.needsDecision = true;
          });
        }
        this.fx.dust(a.x, a.y, 3);
      },
      apex,
    );
  }

  private catchFeather(a: CatActor): void {
    const f = this.feather;
    f.grab(a);
    this.caught.add(a);
    const reward = this.actions.toyCatch(a.id);
    const head = a.headPos();
    this.fx.stars(head.x, head.y, 6);
    if (reward > 0) {
      this.fx.text(head.x, head.y - 4 * this.pixelScale, `+${formatFish(reward)} ikan`);
      this.actions.sound("coin");
    } else this.actions.sound("chirp");
  }

  private updateToy(dt: number): void {
    const s = this.pixelScale;
    const f = this.feather;
    const anchor = this.toyMode && this.cursor && !this.dragging ? this.cursor : null;
    f.update(dt, anchor, s, this.groundY);
    const residents = this.residents();
    if (!f.visible) {
      for (const a of residents) {
        if (a.task === "hunt" && !a.airborne) {
          a.cancelTask();
          a.needsDecision = true;
        }
      }
      return;
    }
    const canHunt = (a: CatActor) =>
      !a.airborne &&
      a !== this.dragging &&
      (a.task === null || a.task === "hunt" || a.task === "beg") &&
      !["angry", "sulk", "treat", "purr", "startled"].includes(a.mode);
    // Pemburu yang sedang melompat tetap dihitung, agar kursi tidak berpindah-pindah.
    const hunters = residents.filter((a) => a.task === "hunt" && (a.airborne || canHunt(a)));
    for (const a of residents) {
      if (a.task === "hunt" && !hunters.includes(a)) {
        a.cancelTask();
        a.needsDecision = true;
      }
    }
    const dist = (a: CatActor) => Math.abs(a.x - f.x);
    const candidates = residents.filter((a) => a.task !== "hunt" && canHunt(a)).sort((p, q) => dist(p) - dist(q));
    const recruit = (a: CatActor) => {
      a.cancelTask();
      a.task = "hunt";
      a.needsDecision = true;
      hunters.push(a);
    };
    while (hunters.length < MAX_HUNTERS && candidates.length > 0) recruit(candidates.shift()!);
    // Tukar pemburu terjauh hanya bila penantang jauh lebih dekat.
    const grounded = hunters.filter((a) => !a.airborne).sort((p, q) => dist(q) - dist(p));
    if (candidates.length > 0 && grounded.length > 0 && dist(candidates[0]) + 60 * s < dist(grounded[0])) {
      const out = grounded[0];
      hunters.splice(hunters.indexOf(out), 1);
      out.cancelTask();
      out.face(f.x);
      out.setMode("watch", rand(2, 4));
      recruit(candidates.shift()!);
    }
    for (const a of residents) {
      if (a.task !== "hunt" && !a.task && (a.mode === "sit" || a.mode === "idle") && Math.abs(a.x - f.x) < 300 * s) {
        a.setMode("watch", rand(3, 6));
      }
      if (a.task === "hunt" || a.mode === "watch") {
        if (a.mode === "run") a.retarget(f.x - Math.sign(f.x - a.x) * 16 * s);
        if (a.mode === "watch" || a.mode === "stalk") a.face(f.x);
      }
      if (a.task === "hunt" && a.mode === "leap" && !f.heldBy) {
        const m = a.mouthPos();
        if (Math.hypot(m.x - f.x, m.y - f.y) < 12 * s) this.catchFeather(a);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Camilan di kursor

  /** Urutan kucing pengemis di sisi kursor yang sama (0 = paling dekat). */
  private begIndex(a: CatActor): number {
    const cx = this.cursor!.x;
    const side = Math.sign(a.x - cx);
    return this.residents().filter(
      (o) => o !== a && o.task === "beg" && !o.spot && Math.sign(o.x - cx) === side && Math.abs(o.x - cx) < Math.abs(a.x - cx),
    ).length;
  }

  /** Tempat duduk mengemis: berjajar di samping kursor, di dalam area jalan. */
  private begX(a: CatActor): number {
    const s = this.pixelScale;
    const cx = this.cursor!.x;
    const side = a.x < cx ? -1 : 1;
    const [minX, maxX] = this.walkRange();
    return clamp(cx + side * (12 + this.begIndex(a) * 14) * s, minX, maxX);
  }

  private begStep(a: CatActor): void {
    if (!this.cursor || !this.treatMode) {
      a.task = null;
      this.decideFree(a);
      return;
    }
    if (a.spot || a.hidden) {
      if (a.hidden) {
        a.jumpDown(undefined, this.cursor.x);
        return;
      }
      a.face(this.cursor.x);
      a.setMode("beg");
      return;
    }
    const target = this.begX(a);
    if (Math.abs(a.x - target) > 8 * this.pixelScale) {
      a.walkTo(target, undefined, Math.abs(a.x - target) > 50 * this.pixelScale);
      return;
    }
    a.face(this.cursor.x);
    const entering = a.mode !== "beg";
    a.setMode("beg");
    if (entering && Math.random() < 0.4) a.emote(Math.random() < 0.5 ? "heart" : "treat", 1.4);
  }

  private updateTreat(now: number): void {
    const s = this.pixelScale;
    const show = this.treatMode && this.cursor !== null && !this.dragging;
    this.treatCursor.visible = show;
    const residents = this.residents();
    if (!show) {
      for (const a of residents) {
        if (a.task === "beg" && !a.airborne) {
          a.cancelTask();
          a.needsDecision = true;
        }
      }
      return;
    }
    const c = this.cursor!;
    this.treatCursor.scale.set(s * 0.8);
    this.treatCursor.position.set(Math.round(c.x + 5 * s), Math.round(c.y + 6 * s + Math.sin(now / 250) * s));
    for (const a of residents) {
      const eligible =
        !a.airborne &&
        a !== this.dragging &&
        (a.task === null || a.task === "beg") &&
        !["angry", "sulk", "treat", "purr", "startled", "land"].includes(a.mode);
      const near = Math.abs(a.x - c.x) < 220 * s;
      if (eligible && near && a.task !== "beg") {
        a.cancelTask();
        a.task = "beg";
        a.needsDecision = true;
      } else if (a.task === "beg" && (!near || !eligible)) {
        if (!a.airborne) {
          a.cancelTask();
          a.needsDecision = true;
        }
      }
      if (a.task === "beg") {
        if (a.mode === "beg") {
          a.face(c.x);
          // Kursor pindah jauh: cari tempat duduk baru (dengan jeda kecil agar tidak gelisah).
          if (!a.spot && a.modeTime > 0.4 && Math.abs(a.x - this.begX(a)) > 16 * s) a.needsDecision = true;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Kupu-kupu

  private butterflyStep(a: CatActor): void {
    const b = this.ambient.butterfly;
    const s = this.pixelScale;
    if (!b || b.done || this.toyMode) {
      a.task = null;
      this.decideFree(a);
      return;
    }
    const dx = b.x - a.x;
    if (Math.abs(dx) > 22 * s) {
      const [minX, maxX] = this.walkRange();
      const goal = clamp(b.x - Math.sign(dx) * 14 * s, minX, maxX);
      if (Math.abs(goal - a.x) <= 4 * s) {
        // Kupu-kupu terbang di luar jangkauan: menyerah dan menatapnya saja.
        a.task = null;
        a.face(b.x);
        a.setMode("watch", rand(2, 4));
      } else a.walkTo(goal, undefined, true);
      return;
    }
    a.face(b.x);
    a.setMode("stalk", rand(0.4, 0.8), () => {
      const bb = this.ambient.butterfly;
      if (!bb || a.task !== "butterfly") {
        a.needsDecision = true;
        return;
      }
      const apex = clamp(this.groundY - (bb.y + 10 * s), 6 * s, 50 * s);
      const [minX, maxX] = this.walkRange();
      a.leapTo(clamp(bb.x, minX, maxX), this.groundY, () => {
        a.task = null;
        a.setMode("land", 0.3, () => {
          a.emote("question", 1.4, false);
          a.setMode("sit", rand(2, 4));
        });
      }, apex);
      window.setTimeout(() => bb.scare(), 180);
    });
  }

  // -------------------------------------------------------------------------
  // Sutradara: interaksi antar-kucing, sapaan tamu, kupu-kupu

  private freeForSocial(a: CatActor): boolean {
    return !a.task && !a.spot && !a.hidden && !a.airborne && a !== this.dragging && ["idle", "sit", "groom", "watch", "happy"].includes(a.mode);
  }

  private updateDirector(dt: number): void {
    this.directorTimer -= dt;
    if (this.directorTimer > 0) return;
    this.directorTimer = 1.5;
    const s = this.pixelScale;
    const residents = this.residents();

    // Kupu-kupu yang terbang rendah menarik perhatian.
    const b = this.ambient.butterfly;
    if (b && !this.toyMode && !this.treatMode && this.groundY - b.y < 48 * s && !residents.some((a) => a.task === "butterfly")) {
      const hunter = residents
        .filter((a) => this.freeForSocial(a) && Math.abs(a.x - b.x) < 220 * s)
        .sort((p, q) => Math.abs(p.x - b.x) - Math.abs(q.x - b.x))[0];
      if (hunter && Math.random() < 0.5) {
        hunter.task = "butterfly";
        hunter.emote("exclaim", 0.7, false);
        this.butterflyStep(hunter);
      }
    }

    // Menyapa tamu yang menunggu.
    const v = this.visitor;
    if (v && v.mode === "wait" && !this.greetedVisitor && Math.random() < 0.3) {
      const greeter = residents.filter((a) => this.freeForSocial(a)).sort((p, q) => Math.abs(p.x - v.x) - Math.abs(q.x - v.x))[0];
      if (greeter) {
        this.greetedVisitor = true;
        greeter.task = "greet";
        greeter.walkTo(v.x - 10 * s, () => {
          greeter.task = null;
          if (this.visitor !== v) return;
          greeter.face(v.x);
          greeter.setMode("boop", 1.6, () => greeter.setMode("happy", 1.2));
          const head = greeter.headPos();
          this.fx.hearts(head.x + 4 * s, head.y + 4 * s, 2);
          this.actions.sound("chirp");
        });
      }
    }

    if (this.toyMode || this.treatMode) return;
    const chance = this.focusMode ? 0.03 : 0.12;
    if (Math.random() > chance) return;
    const free = residents.filter((a) => this.freeForSocial(a));
    if (free.length < 2) return;
    const a = free[Math.floor(Math.random() * free.length)];
    const b2 = free
      .filter((o) => o !== a && Math.abs(o.x - a.x) < 320 * s)
      .sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x))[0];
    if (!b2) return;
    const night = this.isNightNow();
    const chilly = isWet(this.weather.kind) || (this.weather.temp !== null && this.weather.temp <= 20);
    const type = this.focusMode
      ? "cuddle"
      : pickWeighted<SocialType>({ boop: 40, groom: 25, playfight: night ? 5 : 20, cuddle: night ? 40 : chilly ? 35 : 12 });
    this.startSocial(a, b2, type);
  }

  private startSocial(p: CatActor, q: CatActor, type: SocialType): void {
    const s = this.pixelScale;
    const left = p.x <= q.x ? p : q;
    const right = left === p ? q : p;
    left.cancelTask();
    right.cancelTask();
    left.task = "social";
    right.task = "social";
    const gap = (type === "cuddle" ? 8 : type === "groom" ? 8 : 10) * s;
    const [minX, maxX] = this.walkRange();
    const mid = clamp((left.x + right.x) / 2, minX + gap, maxX - gap);
    const soc: Social = { type, a: left, b: right, arrived: 0, acting: false, fxTimer: 0 };
    this.socials.push(soc);
    const arrive = (actor: CatActor, faceX: number) => () => {
      if (actor.task !== "social") return;
      actor.face(faceX);
      soc.arrived += 1;
      if (soc.arrived >= 2) this.actSocial(soc);
      else actor.setMode("sit", 10, () => this.endSocial(soc));
    };
    left.walkTo(mid - gap, arrive(left, mid + 100));
    right.walkTo(mid + gap, arrive(right, mid - 100));
  }

  private actSocial(soc: Social): void {
    const { a, b } = soc;
    if (a.task !== "social" || b.task !== "social" || a.airborne || b.airborne || a.removed || b.removed) {
      this.endSocial(soc);
      return;
    }
    soc.acting = true;
    const s = this.pixelScale;
    const done = () => this.endSocial(soc);
    const midX = (a.x + b.x) / 2;
    switch (soc.type) {
      case "boop": {
        a.setMode("boop", 1.6, done);
        b.setMode("boop", 1.6);
        this.fx.hearts(midX, a.headPos().y + 3 * s, 2);
        this.actions.sound("chirp");
        break;
      }
      case "groom": {
        const groomer = Math.random() < 0.5 ? a : b;
        const other = groomer === a ? b : a;
        groomer.setMode("groom", 4, done);
        other.setMode("purr", 4);
        break;
      }
      case "playfight":
        a.setMode("playfight", 3.2, done);
        b.setMode("playfight", 3.2);
        break;
      case "cuddle": {
        a.dir = -1;
        b.dir = 1;
        const duration = rand(20, 40);
        a.setMode("sleep", duration, done);
        b.setMode("sleep", duration);
        a.emote("heart", 2);
        break;
      }
    }
  }

  private endSocial(soc: Social): void {
    const i = this.socials.indexOf(soc);
    if (i >= 0) this.socials.splice(i, 1);
    for (const x of [soc.a, soc.b]) {
      if (x.task !== "social") continue;
      x.task = null;
      if (x.airborne) continue;
      x.setMode(soc.type === "boop" || soc.type === "groom" ? "happy" : "sit", rand(1.2, 3));
    }
  }

  private updateSocials(dt: number): void {
    const s = this.pixelScale;
    for (const soc of [...this.socials]) {
      const { a, b } = soc;
      if (a.task !== "social" || b.task !== "social" || a.removed || b.removed) {
        const i = this.socials.indexOf(soc);
        if (i >= 0) this.socials.splice(i, 1);
        for (const x of [a, b]) {
          if (x.task === "social") {
            x.cancelTask();
            x.needsDecision = true;
          }
        }
        continue;
      }
      if (soc.acting && soc.type === "playfight") {
        soc.fxTimer -= dt;
        if (soc.fxTimer <= 0) {
          soc.fxTimer = 0.45;
          this.fx.stars((a.x + b.x) / 2, this.groundY - 12 * s, 1);
          this.fx.dust((a.x + b.x) / 2, this.groundY, 2);
          if (Math.random() < 0.5) {
            a.dir = a.dir === 1 ? -1 : 1;
            b.dir = b.dir === 1 ? -1 : 1;
          } else {
            a.face(b.x);
            b.face(a.x);
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Usapan dan lirikan

  private updateCursorEffects(dt: number, now: number): void {
    const s = this.pixelScale;
    const cur = this.cursor;
    const live = cur !== null;
    let target: CatActor | null = null;
    if (live && !this.press && !this.dragging) target = this.actorAt(cur!.x, cur!.y, false);
    if (target && this.prevCursor && this.rubTarget === target) {
      const d = Math.hypot(cur!.x - this.prevCursor.x, cur!.y - this.prevCursor.y) / s;
      if (d > 0.3 && d < 60 && !target.airborne && target.mode !== "angry") {
        target.rub += d;
        target.lastRubAt = now;
      }
    }
    this.rubTarget = target;

    this.rubFxTimer -= dt;
    const moved = performance.now() - this.cursorMovedAt < 2000;
    for (const a of this.cats.values()) {
      if (now - a.lastRubAt > 250) a.rub = Math.max(0, a.rub - 40 * dt);
      const rubbing = now - a.lastRubAt < 250 && a.rub > 25;
      if (rubbing && this.rubFxTimer <= 0) {
        this.rubFxTimer = 0.5;
        const head = a.headPos();
        this.fx.hearts(head.x, head.y, 1);
        this.actions.tip("rub", "Terus usap-usap... dia mulai suka!");
      }
      if (a.rub >= RUB_TO_PURR) {
        a.rub = 0;
        this.purr(a);
      }
      if (a.mode === "purr" && now - a.lastRubAt < 250) a.extendMode(1.5);

      const head = a.headPos();
      a.curious = live && !this.dragging && Math.hypot(cur!.x - head.x, cur!.y - head.y) < 30 * s;
      if (live && moved && !this.dragging && Math.abs(cur!.x - a.x) < 160 * s && cur!.y > this.groundY - 120 * s) {
        a.lookToward(cur!.x, now);
      }
    }
    if (this.visitor && live && moved) this.visitor.lookToward(cur!.x, now);
    this.prevCursor = cur ? { ...cur } : null;
  }

  // -------------------------------------------------------------------------
  // Label dan kursor

  private updateHover(): void {
    const s = this.pixelScale;
    const label = this.hoverLabel;
    const cur = this.cursor;
    const canvas = this.app.canvas;
    let text = "";
    let lx = 0;
    let ly = 0;
    let cursorStyle = "";
    let heartCountShown = -1;

    if (this.dragging) {
      cursorStyle = "grabbing";
      if (this.dropTarget) {
        const view = this.facilities.get(this.dropTarget)!;
        const cat = this.game.cat(this.dragging.id);
        const used = this.game.slotsUsed(this.dropTarget, this.dragging.id);
        const slots = BALANCE.slotsPerFacility;
        const full = used >= slots && cat?.facility !== this.dropTarget;
        text = cat?.facility === this.dropTarget ? `Sudah di ${FACILITIES[this.dropTarget].name}` : full ? `${FACILITIES[this.dropTarget].name} penuh` : `Tugaskan ke ${FACILITIES[this.dropTarget].name} (${used}/${slots})`;
        lx = view.x;
        ly = this.groundY - view.sprite.height - 6 * s;
      }
    } else if (cur) {
      const target = this.targetAt(cur.x, cur.y);
      if (target?.kind === "actor") {
        const a = target.actor;
        cursorStyle = a.isVisitor || this.treatMode ? "pointer" : "grab";
        if (a.isVisitor) {
          const fed = this.game.state.visitor?.fed ?? 0;
          text = fed >= 3 ? "Mau tinggal di sini!" : `Kucing liar · beri makan (${fed}/3)`;
        } else if (a.task !== "chat") {
          // Kucing yang sedang diajak ngobrol sudah punya gelembungnya sendiri.
          const cat = this.game.cat(a.id);
          if (cat) {
            const h = heartCount(cat);
            const mood =
              a.mode === "sulk" || a.mode === "angry"
                ? " · ngambek"
                : a.mode === "purr"
                  ? " · prrr..."
                  : a.mode === "sleep"
                    ? " · tidur"
                    : isHungry(cat)
                      ? " · lapar"
                      : "";
            text = `${cat.name}${mood}`;
            heartCountShown = h;
          }
        }
        const head = a.headPos();
        lx = head.x;
        ly = head.y - 4;
      } else if (target?.kind === "gift") {
        const giver = this.game.cat(target.view.gift.catId);
        text = `Hadiah dari ${giver?.name ?? "kucingmu"}`;
        lx = this.giftX(target.view);
        ly = this.groundY - 12 * s;
        cursorStyle = "pointer";
      } else if (target?.kind === "facility") {
        cursorStyle = "pointer";
        if (this.hiddenIn(target.id)) {
          text = "Ada yang bersembunyi...";
          const view = this.facilities.get(target.id)!;
          lx = view.x;
          ly = this.groundY - view.sprite.height - 4;
        }
      } else if (target?.kind === "sparkle") {
        cursorStyle = "pointer";
      }
    }
    if (canvas.style.cursor !== cursorStyle) canvas.style.cursor = cursorStyle;
    label.visible = text.length > 0;
    const hearts = this.hoverHearts;
    hearts.visible = label.visible && heartCountShown >= 0;
    if (label.visible) {
      if (label.text !== text) label.text = text;
      const half = Math.max(label.width / 2, 20 * s) + 4;
      const x = Math.round(clamp(lx, half, this.width - half));
      let y = Math.round(Math.max(label.height + 2, ly));
      if (hearts.visible) {
        // Lima hati piksel di bawah nama: penuh = ikatan yang sudah terkumpul.
        const hs = Math.max(2, Math.round(s * 0.6));
        const step = 8 * hs;
        hearts.children.forEach((child, i) => {
          const sp = child as Sprite;
          sp.texture = objectTexture(i < heartCountShown ? "heart" : "heartEmpty");
          sp.scale.set(hs);
          sp.position.set(x + (i - 2) * step, y);
        });
        y -= 6 * hs + 2;
      }
      label.position.set(x, y);
    }
  }

  // -------------------------------------------------------------------------

  private updateFacilities(dt: number, now: number): void {
    const s = this.pixelScale;
    for (const view of this.facilities.values()) {
      // Sorotan saat kucing diangkat di atasnya. Bentuknya digambar sekali; denyutnya lewat alpha.
      const glowOn = this.dragging !== null && this.dropTarget === view.id;
      const glowKey = glowOn ? `${view.x}:${this.groundY}:${s}` : "";
      if (glowKey !== view.glowKey) {
        view.glowKey = glowKey;
        view.glow.clear();
        if (glowOn) {
          const w = view.sprite.texture.width * s;
          const h = view.sprite.texture.height * s;
          view.glow
            .roundRect(view.x - w / 2 - 3 * s, this.groundY - h - 3 * s, w + 6 * s, h + 4 * s, 3 * s)
            .fill({ color: 0xfff3b0, alpha: 0.25 })
            .stroke({ color: 0xffe08a, width: s, alpha: 1 });
        }
      }
      if (glowOn) view.glow.alpha = 0.65 + 0.35 * Math.sin(now / 120);

      if (view.id === "rak") {
        const tex = objectTexture(this.rakTexture());
        if (view.sprite.texture !== tex) view.sprite.texture = tex;
      }
      let offset = 0;
      if (view.id === "benang") {
        const playing = this.residents().some((a) => a.mode === "play" && Math.abs(a.x - view.x) < 30 * s);
        view.wobble = playing ? view.wobble + dt : Math.max(0, view.wobble - dt);
        if (view.wobble > 0) offset = Math.round(Math.sin(view.wobble * 6) * 2) * s;
      }

      if (view.id === "kardus") {
        const hidden = this.hiddenIn("kardus");
        let eyesKey = "";
        let look = 0;
        if (hidden) {
          view.wobble += dt;
          // Sesekali kardus bergoyang.
          const phase = view.wobble % 4;
          if (phase < 0.3) offset = Math.round(Math.sin(phase * 40)) * s;
          // Sepasang mata mengintip dari celah kardus.
          const blink = Math.floor(now / 150) % 23 === 0;
          look = Math.round(Math.sin(now / 900) * 2);
          if (!blink) eyesKey = `${look}:${s}`;
        } else view.wobble = 0;
        if (eyesKey !== view.eyesKey) {
          view.eyesKey = eyesKey;
          view.eyes.clear();
          if (eyesKey) for (const ex of [7, 11]) view.eyes.rect((ex + look - 10) * s, 3 * s, s, s).fill(0xf7e26b);
        }
        view.eyes.position.set(view.x + offset, this.groundY - 12 * s);
      }
      view.sprite.position.set(view.x + offset, this.groundY);
    }
  }

  private updateGifts(dt: number, now: number): void {
    const s = this.pixelScale;
    for (const view of this.gifts.values()) {
      if (!view.revealed) {
        if (!view.carrier || view.carrier.task !== "gift" || view.carrier.removed) this.revealGift(view, false);
        continue;
      }
      view.t += dt;
      const x = this.giftX(view);
      const drop = view.t < 0.35 ? (1 - view.t / 0.35) * 8 * s : 0;
      const wiggle = (now / 1000 + view.gift.x * 10) % 3 < 0.3 ? Math.round(Math.sin(now / 40)) * 0.5 * s : 0;
      view.sprite.scale.set(s);
      view.sprite.position.set(Math.round(x + wiggle), Math.round(this.groundY - drop));
      if (Math.random() < dt * 0.6) this.fx.icon("star", x + rand(-5, 5) * s, this.groundY - rand(6, 12) * s, { vy: -6 * s, life: 0.7, scale: 0.3 });
    }
  }

  private updateSparkle(dt: number): void {
    const state = this.game.state;
    if (!this.sparkle || !state.sparkle) return;
    const s = this.pixelScale;
    const sp = state.sparkle;
    const [minX, maxX] = this.walkRange();
    const x = clamp(this.sparkleX, minX, maxX);
    const t = performance.now() / 1000;
    this.sparkle.position.set(Math.round(x), Math.round(this.groundY - 12 * s + Math.sin(t * 3) * 2 * s));
    this.sparkle.scale.set(s);
    const remaining = (sp.expiresAt - Date.now()) / 1000;
    this.sparkle.alpha = remaining < 4 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 6)) : 1;
    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0) {
      this.sparkleTimer = 0.5;
      this.fx.stars(x, this.groundY - 12 * s, 1);
    }
  }

  private update(dt: number): void {
    const now = Date.now();
    const state = this.game.state;
    this.worldTimer -= dt;
    if (this.worldTimer <= 0) {
      this.worldTimer = 1;
      this.refreshWorld(now);
    }
    this.updateLighting(dt);

    this.updateCursorEffects(dt, now);
    this.updateToy(dt);
    this.updateTreat(performance.now());
    this.updateDirector(dt);

    const butterfly = this.ambient.butterfly;
    const byId = new Map(state.cats.map((c) => [c.id, c]));
    for (const actor of this.cats.values()) {
      if (actor.task === "butterfly" && actor.mode === "run" && butterfly) {
        actor.retarget(butterfly.x - Math.sign(butterfly.x - actor.x) * 14 * this.pixelScale);
      }
      const cat = byId.get(actor.id);
      if (cat) {
        actor.accessory = cat.accessory;
        actor.setNeed(isHungry(cat) && actor.mode !== "sleep" && actor.mode !== "eat" ? "fish" : null);
      }
      actor.rainy = this.weatherFx.wet;
      if (actor.needsDecision) this.decide(actor);
      actor.update(dt, now);
    }
    this.updateSocials(dt);
    this.updateMessengers();
    this.updateTyping(dt, now);

    const v = this.visitor;
    if (v) {
      const fed = state.visitor?.fed ?? 0;
      v.setNeed(v.mode === "wait" && fed < 3 ? "fish" : null);
      v.setDots(v.mode === "wait" || v.mode === "happy" ? fed : null);
      v.rainy = this.weatherFx.wet;
      if (v.needsDecision) this.decide(v);
      v.update(dt, now);
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const actor = this.leaving[i];
      // Kucing yang pamit: setiap kali tugasnya selesai (misalnya selesai mendarat), lanjut berjalan keluar.
      if (actor.exitTo !== null && actor.needsDecision && actor.mode !== "leave") actor.leaveTo(actor.exitTo);
      actor.update(dt, now);
      if (actor.removed) {
        actor.destroy();
        this.leaving.splice(i, 1);
      }
    }

    this.updateFacilities(dt, now);
    this.updateGifts(dt, now);
    this.updateSparkle(dt);
    const [minX, maxX] = this.walkRange();
    // Efek suasana dan cuaca hanya di area kucing (kiri panel bawah), pita rendah.
    const areaRight = Math.min(this.width, maxX + 24 * this.pixelScale);
    this.ambient.update(dt, {
      scale: this.pixelScale,
      groundY: this.groundY,
      minX,
      maxX,
      width: areaRight,
      focus: this.focusMode,
      night: this.isNightNow() && !isWet(this.weather.kind) && this.weather.kind !== "snow",
      butterflies: (this.phase === "pagi" || this.phase === "siang" || this.phase === "sore") && (this.weather.kind === "clear" || this.weather.kind === "partly"),
    });
    this.weatherFx.update(dt, {
      kind: this.weather.kind,
      intensity: precipitation(this.weather.kind, this.weather.code),
      wind: this.weather.wind,
      phase: this.phase,
      scale: this.pixelScale,
      width: areaRight,
      groundY: this.groundY,
      minX,
      maxX,
      calm: this.focusMode,
    });
    this.fx.update(dt);
    this.updateHover();
  }
}
