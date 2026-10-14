// Tampilan strip: fasilitas, kucing, tamu, ikan berkilau, dan efek partikel.
// Membaca GameState, tidak pernah mengubahnya langsung (aksi lewat callback).

import { Application, Container, Graphics, Sprite, Text, TextureSource } from "pixi.js";
import { isHungry } from "../core/economy";
import type { Game } from "../core/game";
import type { CatState, FacilityId } from "../core/types";
import { FACILITY_IDS } from "../core/types";
import type { CatPose, ObjectId } from "./pixelart";
import { catTexture, objectTexture } from "./textures";

export interface StageCallbacks {
  onCatClick(catId: string): void;
  onVisitorClick(): void;
  onSparkleClick(): void;
  onFacilityClick(id: FacilityId): void;
}

/** Lebar bawaan area kanan yang dipakai HUD; diperbarui dari ukuran HUD sebenarnya. */
const DEFAULT_RESERVED = 340;
const GROUND_MARGIN = 4;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

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

// ---------------------------------------------------------------------------
// Partikel

interface Particle {
  node: Sprite | Text;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
}

// ---------------------------------------------------------------------------

type CatMode =
  | "idle"
  | "walk"
  | "sit"
  | "sleep"
  | "eat"
  | "play"
  | "petted"
  | "arrive"
  | "wait"
  | "leave";

const FRAME_SEQUENCES: Record<CatMode, CatPose[]> = {
  idle: ["stand"],
  walk: ["walk1", "stand", "walk2", "stand"],
  sit: ["sit"],
  sleep: ["sleep", "sleep2"],
  eat: ["eat", "eat2"],
  play: ["stand"],
  petted: ["sitBlink"],
  arrive: ["walk1", "stand", "walk2", "stand"],
  wait: ["sit"],
  leave: ["walk1", "stand", "walk2", "stand"],
};

const FRAME_SECONDS: Record<CatMode, number> = {
  idle: 1,
  walk: 0.15,
  sit: 1,
  sleep: 1.3,
  eat: 0.35,
  play: 1,
  petted: 1,
  arrive: 0.15,
  wait: 1,
  leave: 0.15,
};

class CatActor {
  readonly container = new Container();
  readonly sprite: Sprite;
  private shadow = new Graphics();
  private bubble: Container | null = null;
  private dots: Graphics | null = null;
  x: number;
  hop = 0;
  dir: 1 | -1 = 1;
  mode: CatMode = "idle";
  private modeTime = 0;
  private modeDuration = 2;
  private frameTime = 0;
  private frameIndex = 0;
  private blinkTimer = rand(2, 5);
  private blinking = 0;
  private targetX = 0;
  private zzzTimer = 0;
  removed = false;
  /** Pose saat ini, dipakai untuk menempatkan gelembung di atas kepala. */
  pose: CatPose = "stand";

  constructor(
    private stage: Stage,
    readonly id: string,
    private coat: string,
    x: number,
    readonly isVisitor: boolean,
  ) {
    this.x = x;
    this.sprite = new Sprite(catTexture(coat, "stand"));
    this.sprite.anchor.set(0.5, 1);
    this.sprite.eventMode = "static";
    this.sprite.cursor = "pointer";
    this.sprite.on("pointertap", () => {
      if (this.isVisitor) stage.callbacks.onVisitorClick();
      else stage.callbacks.onCatClick(this.id);
    });
    this.container.addChild(this.shadow, this.sprite);
    if (isVisitor) {
      this.dir = -1;
      this.setMode("arrive");
    } else {
      this.setMode(Math.random() < 0.5 ? "sit" : "idle");
    }
  }

  get scale(): number {
    return this.stage.pixelScale;
  }

  setCoat(coat: string): void {
    this.coat = coat;
  }

  setMode(mode: CatMode, duration?: number): void {
    this.mode = mode;
    this.modeTime = 0;
    this.frameIndex = 0;
    this.frameTime = 0;
    this.hop = 0;
    const focus = this.stage.focusMode;
    switch (mode) {
      case "idle":
        this.modeDuration = duration ?? rand(2, 6);
        break;
      case "sit":
        this.modeDuration = duration ?? rand(focus ? 10 : 4, focus ? 30 : 12);
        break;
      case "sleep":
        this.modeDuration = duration ?? rand(focus ? 40 : 15, focus ? 90 : 40);
        break;
      case "eat":
        this.modeDuration = duration ?? rand(3, 6);
        break;
      case "play":
        this.modeDuration = duration ?? rand(1.6, 2.8);
        break;
      case "petted":
        this.modeDuration = duration ?? 1.6;
        break;
      case "walk":
      case "arrive":
      case "leave":
        this.modeDuration = Infinity;
        break;
      case "wait":
        this.modeDuration = Infinity;
        break;
    }
    if (mode === "arrive") {
      const [minX, maxX] = this.stage.walkRange();
      this.targetX = rand(minX + 80, Math.max(minX + 120, maxX - 60));
    }
    if (mode === "leave") this.targetX = this.stage.width + 80;
  }

  walkTo(x: number): void {
    const [minX, maxX] = this.stage.walkRange();
    this.targetX = Math.min(maxX, Math.max(minX, x));
    this.setMode("walk");
  }

  /** Dipanggil saat kucing dielus. */
  pet(): void {
    this.stage.emitHearts(this.x, this.headY(), 3);
    if (this.mode === "sleep" || this.mode === "walk" || this.mode === "idle" || this.mode === "sit" || this.mode === "play" || this.mode === "eat") {
      this.setMode("petted");
    }
  }

  /** Tamu yang pergi tidak bisa diklik lagi. */
  disableInput(): void {
    this.sprite.eventMode = "none";
    this.sprite.cursor = "default";
  }

  private chooseNext(cat: CatState | undefined): void {
    const stage = this.stage;
    const focus = stage.focusMode;
    const hungryish = cat ? cat.hunger < 0.6 : false;
    const bowlX = stage.facilityX("mangkuk");
    const playX = stage.facilityX("benang") ?? stage.facilityX("tiang");

    if (hungryish && bowlX !== null && Math.random() < 0.5) {
      if (Math.abs(this.x - bowlX) < 24 * this.scale) {
        this.dir = bowlX >= this.x ? 1 : -1;
        this.setMode("eat");
      } else {
        this.walkTo(bowlX - 20 * this.scale);
      }
      return;
    }

    const next = pickWeighted<CatMode>(
      focus
        ? { sleep: 50, sit: 30, idle: 15, walk: 5 }
        : { walk: 34, idle: 18, sit: 24, sleep: 14, play: playX !== null ? 10 : 0 },
    );
    if (next === "walk") {
      const home = cat?.facility ? stage.facilityX(cat.facility) : null;
      const [minX, maxX] = stage.walkRange();
      const target = home !== null ? home + rand(-140, 140) : rand(minX, maxX);
      this.walkTo(target);
    } else if (next === "play" && playX !== null) {
      if (Math.abs(this.x - playX) < 40 * this.scale) this.setMode("play");
      else this.walkTo(playX + rand(-30, 30) * this.scale * 0.5);
    } else {
      this.setMode(next);
    }
  }

  update(dt: number, cat: CatState | undefined): void {
    const s = this.scale;
    this.modeTime += dt;
    this.frameTime += dt;
    const frames = FRAME_SEQUENCES[this.mode];
    if (this.frameTime >= FRAME_SECONDS[this.mode]) {
      this.frameTime = 0;
      this.frameIndex = (this.frameIndex + 1) % frames.length;
    }
    let pose = frames[this.frameIndex % frames.length];

    // Kedipan sesekali saat diam atau duduk.
    if (this.mode === "idle" || this.mode === "sit" || this.mode === "wait") {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinking = 0.14;
        this.blinkTimer = rand(2, 6);
      }
      if (this.blinking > 0) {
        this.blinking -= dt;
        pose = pose === "sit" ? "sitBlink" : "blink";
      }
    }

    // Gerak
    const speed = (this.stage.focusMode ? 9 : 14) * s;
    if (this.mode === "walk" || this.mode === "arrive" || this.mode === "leave") {
      const dx = this.targetX - this.x;
      this.dir = dx >= 0 ? 1 : -1;
      const step = Math.min(Math.abs(dx), speed * dt);
      this.x += step * this.dir;
      if (Math.abs(dx) < 1) {
        if (this.mode === "arrive") {
          this.dir = -1;
          this.setMode("wait");
        } else if (this.mode === "leave") {
          this.removed = true;
        } else {
          const bowlX = this.stage.facilityX("mangkuk");
          if (cat && cat.hunger < 0.6 && bowlX !== null && Math.abs(this.x - bowlX) < 24 * s) {
            this.dir = 1;
            this.setMode("eat");
          } else {
            this.setMode(Math.random() < 0.5 ? "idle" : "sit");
          }
        }
      }
    }

    if (this.mode === "play") {
      const phase = (this.modeTime * 2.4) % 1;
      this.hop = Math.sin(phase * Math.PI) * 5 * s;
      if (phase < 0.05) this.dir = Math.random() < 0.5 ? 1 : -1;
    }

    if (this.mode === "sleep") {
      this.zzzTimer -= dt;
      if (this.zzzTimer <= 0) {
        this.zzzTimer = 2.2;
        this.stage.emitZzz(this.x + 6 * s * this.dir, this.headY(pose));
      }
    }

    if (this.modeTime >= this.modeDuration && !this.isVisitor) this.chooseNext(cat);

    this.pose = pose;
    this.sprite.texture = catTexture(this.coat, pose);
    this.sprite.scale.set(this.dir * s, s);
    this.sprite.position.set(Math.round(this.x), Math.round(this.stage.groundY - this.hop));
    // Kucing yang lebih bawah-kanan digambar belakangan agar tumpukan konsisten.
    this.container.zIndex = Math.round(this.x);
    this.shadow.clear();
    const shadowW = (pose.startsWith("sleep") ? 9 : 8) * s;
    this.shadow
      .ellipse(Math.round(this.x), this.stage.groundY - s * 0.5, shadowW, 1.6 * s)
      .fill({ color: 0x000000, alpha: 0.18 * (1 - Math.min(1, this.hop / (8 * s))) });

    this.updateBubble(cat);
  }

  /** Perkiraan posisi y atas kepala untuk pose ini. */
  headY(pose: CatPose = this.pose): number {
    const s = this.scale;
    const top = pose.startsWith("sleep") ? 7 : pose.startsWith("sit") ? 2 : pose.startsWith("eat") ? 5 : 1;
    return this.stage.groundY - this.hop - (17 - top) * s;
  }

  private updateBubble(cat: CatState | undefined): void {
    const showFish = this.isVisitor ? this.mode === "wait" : !!cat && isHungry(cat) && this.mode !== "sleep";
    if (showFish && !this.bubble) {
      const c = new Container();
      const b = new Sprite(objectTexture("bubble"));
      const f = new Sprite(objectTexture(this.isVisitor ? "fish" : "fish"));
      b.anchor.set(0.5, 1);
      f.anchor.set(0.5, 0.5);
      f.scale.set(0.75);
      f.position.set(0, -7);
      c.addChild(b, f);
      c.eventMode = "none";
      this.bubble = c;
      this.container.addChild(c);
      if (this.isVisitor) {
        this.dots = new Graphics();
        this.container.addChild(this.dots);
      }
    } else if (!showFish && this.bubble) {
      this.bubble.destroy({ children: true });
      this.bubble = null;
      this.dots?.destroy();
      this.dots = null;
    }
    if (this.bubble) {
      const s = this.scale;
      const bob = Math.sin(performance.now() / 300) * 0.6 * s;
      this.bubble.scale.set(s * 0.75);
      this.bubble.position.set(Math.round(this.x + 3 * s), Math.round(this.headY() - 2 * s + bob));
      // Gelembung tamu berkedip pelan agar menarik perhatian; gelembung lapar lebih tenang.
      this.bubble.alpha = this.isVisitor ? 1 : 0.9;
    }
    if (this.dots) {
      const s = this.scale;
      const fed = this.stage.visitorFed();
      this.dots.clear();
      for (let i = 0; i < 3; i++) {
        this.dots
          .circle(Math.round(this.x - 4 * s + i * 4 * s), Math.round(this.stage.groundY + 2 * s), 1.2 * s)
          .fill({ color: i < fed ? 0xef5b7b : 0xfffaf0 })
          .stroke({ color: 0x3b2f2a, width: Math.max(1, s * 0.5) });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------

interface FacilityView {
  id: FacilityId;
  container: Container;
  sprite: Sprite;
  count: Text;
  shadow: Graphics;
  x: number;
}

export class Stage {
  readonly app: Application;
  readonly callbacks: StageCallbacks;
  private game: Game;
  private facilityLayer = new Container();
  private actorLayer = new Container();
  private fxLayer = new Container();
  private labelLayer = new Container();
  private facilities = new Map<FacilityId, FacilityView>();
  private cats = new Map<string, CatActor>();
  private visitor: CatActor | null = null;
  /** Tamu yang sedang berjalan keluar layar; tidak bisa diklik. */
  private leaving: CatActor[] = [];
  private sparkle: Container | null = null;
  private particles: Particle[] = [];
  private hoverLabel: Text;
  private sparkleTimer = 0;
  focusMode = false;
  pixelScale = 3;
  /** Lebar area kanan yang tertutup HUD; kucing tidak berjalan ke sana. */
  reservedRight = DEFAULT_RESERVED;
  width = 0;
  height = 0;
  groundY = 0;

  private constructor(app: Application, game: Game, callbacks: StageCallbacks) {
    this.app = app;
    this.game = game;
    this.callbacks = callbacks;
    app.stage.addChild(this.facilityLayer, this.actorLayer, this.fxLayer, this.labelLayer);
    this.actorLayer.sortableChildren = true;
    this.hoverLabel = new Text({
      text: "",
      style: {
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: 13,
        fontWeight: "700",
        fill: 0xfffaf0,
        stroke: { color: 0x2a1d1a, width: 4 },
        align: "center",
      },
    });
    this.hoverLabel.anchor.set(0.5, 1);
    this.hoverLabel.visible = false;
    this.labelLayer.addChild(this.hoverLabel);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    app.ticker.add((ticker) => this.update(Math.min(0.1, ticker.deltaMS / 1000)));
  }

  static async create(el: HTMLElement, game: Game, callbacks: StageCallbacks): Promise<Stage> {
    TextureSource.defaultOptions.scaleMode = "nearest";
    const app = new Application();
    await app.init({
      backgroundAlpha: 0,
      resizeTo: window,
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    el.appendChild(app.canvas);
    const stage = new Stage(app, game, callbacks);
    stage.setFocusMode(game.state.settings.focusMode);
    stage.setPixelScale(game.state.settings.scale);
    stage.sync();
    return stage;
  }

  // -------------------------------------------------------------------------
  // Tata letak

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.groundY = this.height - GROUND_MARGIN;
    this.layoutFacilities();
  }

  walkRange(): [number, number] {
    return [16 * this.pixelScale, Math.max(200, this.width - this.reservedRight)];
  }

  setPixelScale(scale: number): void {
    this.pixelScale = scale;
    this.layoutFacilities();
  }

  setFocusMode(on: boolean): void {
    this.focusMode = on;
    this.app.ticker.maxFPS = on ? 12 : 30;
  }

  setPaused(paused: boolean): void {
    if (paused) this.app.ticker.stop();
    else this.app.ticker.start();
  }

  facilityX(id: FacilityId): number | null {
    return this.facilities.get(id)?.x ?? null;
  }

  visitorFed(): number {
    return this.game.state.visitor?.fed ?? 0;
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
        actor.destroy();
        this.cats.delete(id);
      }
    }
    const [minX, maxX] = this.walkRange();
    for (const cat of state.cats) {
      if (this.cats.has(cat.id)) continue;
      const home = cat.facility ? this.facilityX(cat.facility) : null;
      const actor = new CatActor(this, cat.id, cat.coat, home ?? rand(minX, maxX), false);
      this.cats.set(cat.id, actor);
      this.actorLayer.addChild(actor.container);
    }

    if (!state.visitor && this.visitor) {
      const v = this.visitor;
      v.setMode("leave");
      v.disableInput();
      this.leaving.push(v);
      this.visitor = null;
    }
    if (state.visitor && !this.visitor) {
      const actor = new CatActor(this, "visitor", state.visitor.coat, this.walkRange()[1] + 40, true);
      // Tamu yang sudah siap diadopsi (dipulihkan dari simpanan) langsung duduk menunggu.
      if (state.visitor.fed >= 3) {
        actor.x = this.walkRange()[1] - 60;
        actor.setMode("wait");
      }
      this.visitor = actor;
      this.actorLayer.addChild(actor.container);
    }

    if (state.sparkle && !this.sparkle) this.createSparkle();
    if (!state.sparkle && this.sparkle) {
      this.sparkle.destroy({ children: true });
      this.sparkle = null;
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
      actor.setMode("petted");
    }
    this.emitHearts(v.x, v.headY(), 6);
    v.destroy();
  }

  private createFacility(id: FacilityId): FacilityView {
    const container = new Container();
    const shadow = new Graphics();
    const sprite = new Sprite(objectTexture(id as ObjectId));
    sprite.anchor.set(0.5, 1);
    sprite.eventMode = "static";
    sprite.cursor = "pointer";
    sprite.on("pointertap", () => this.callbacks.onFacilityClick(id));
    const count = new Text({
      text: "",
      style: {
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "800",
        fill: 0xfffaf0,
        stroke: { color: 0x2a1d1a, width: 3 },
      },
    });
    count.anchor.set(1, 1);
    container.addChild(shadow, sprite, count);
    this.facilityLayer.addChild(container);
    return { id, container, sprite, count, shadow, x: 0 };
  }

  private createSparkle(): void {
    const sp = this.game.state.sparkle;
    if (!sp) return;
    const c = new Container();
    const fish = new Sprite(objectTexture("goldfish"));
    fish.anchor.set(0.5, 0.5);
    fish.eventMode = "static";
    fish.cursor = "pointer";
    fish.on("pointertap", () => this.callbacks.onSparkleClick());
    c.addChild(fish);
    this.sparkle = c;
    this.fxLayer.addChild(c);
  }

  // -------------------------------------------------------------------------
  // Efek

  private addParticle(node: Sprite | Text, vx: number, vy: number, life: number, gravity = 0): void {
    this.fxLayer.addChild(node);
    this.particles.push({ node, vx, vy, gravity, life, maxLife: life });
  }

  emitHearts(x: number, y: number, n: number): void {
    const s = this.pixelScale;
    for (let i = 0; i < n; i++) {
      const h = new Sprite(objectTexture("heart"));
      h.anchor.set(0.5);
      h.scale.set(s * 0.6);
      h.position.set(x + rand(-6, 6) * s, y);
      this.addParticle(h, rand(-8, 8) * s, rand(-26, -16) * s, rand(1, 1.6));
    }
  }

  emitZzz(x: number, y: number): void {
    const s = this.pixelScale;
    const z = new Sprite(objectTexture("zzz"));
    z.anchor.set(0.5);
    z.scale.set(s * 0.6);
    z.position.set(x, y);
    this.addParticle(z, 4 * s, -6 * s, 2);
  }

  emitStars(x: number, y: number, n: number): void {
    const s = this.pixelScale;
    for (let i = 0; i < n; i++) {
      const st = new Sprite(objectTexture("star"));
      st.anchor.set(0.5);
      st.scale.set(s * 0.5);
      st.position.set(x, y);
      this.addParticle(st, rand(-30, 30) * s, rand(-40, -15) * s, rand(0.6, 1), 60 * s);
    }
  }

  floatText(x: number, y: number, text: string, color = 0xffe08a): void {
    const t = new Text({
      text,
      style: {
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: 15,
        fontWeight: "800",
        fill: color,
        stroke: { color: 0x2a1d1a, width: 4 },
      },
    });
    t.anchor.set(0.5, 1);
    t.position.set(x, y);
    this.addParticle(t, 0, -28, 1.6);
  }

  catPosition(catId: string): { x: number; y: number } | null {
    const a = catId === "visitor" ? this.visitor : this.cats.get(catId);
    return a ? { x: a.x, y: a.headY() } : null;
  }

  petCat(catId: string): void {
    this.cats.get(catId)?.pet();
  }

  sparklePosition(): { x: number; y: number } | null {
    return this.sparkle ? { x: this.sparkle.x, y: this.sparkle.y } : null;
  }

  // -------------------------------------------------------------------------
  // Hover dan uji klik (untuk klik tembus)

  private actorAt(x: number, y: number): CatActor | null {
    const all = [...this.cats.values()];
    if (this.visitor) all.push(this.visitor);
    for (let i = all.length - 1; i >= 0; i--) {
      const b = all[i].sprite.getBounds();
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return all[i];
    }
    return null;
  }

  hitTest(x: number, y: number): boolean {
    if (this.actorAt(x, y)) return true;
    if (this.sparkle) {
      const b = this.sparkle.getBounds();
      if (x >= b.minX - 6 && x <= b.maxX + 6 && y >= b.minY - 6 && y <= b.maxY + 6) return true;
    }
    for (const v of this.facilities.values()) {
      const b = v.sprite.getBounds();
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return true;
    }
    return false;
  }

  setHover(x: number | null, y: number | null): void {
    const actor = x === null || y === null ? null : this.actorAt(x, y);
    if (!actor) {
      this.hoverLabel.visible = false;
      return;
    }
    let label: string;
    if (actor.isVisitor) {
      const v = this.game.state.visitor;
      const fed = v?.fed ?? 0;
      label = fed >= 3 ? "Mau tinggal di sini!" : `Kucing liar · beri makan (${fed}/3)`;
    } else {
      const cat = this.game.state.cats.find((c) => c.id === actor.id);
      label = cat ? (isHungry(cat) ? `${cat.name} · lapar` : cat.name) : "";
    }
    this.hoverLabel.text = label;
    this.hoverLabel.position.set(Math.round(actor.x), Math.round(actor.headY() - 4));
    this.hoverLabel.visible = label.length > 0;
  }

  // -------------------------------------------------------------------------

  private update(dt: number): void {
    const state = this.game.state;
    const byId = new Map(state.cats.map((c) => [c.id, c]));
    for (const actor of this.cats.values()) actor.update(dt, byId.get(actor.id));
    this.visitor?.update(dt, undefined);
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const actor = this.leaving[i];
      actor.update(dt, undefined);
      if (actor.removed) {
        actor.destroy();
        this.leaving.splice(i, 1);
      }
    }


    if (this.sparkle && state.sparkle) {
      const s = this.pixelScale;
      const sp = state.sparkle;
      const [minX, maxX] = this.walkRange();
      const x = minX + sp.x * (maxX - minX);
      const t = performance.now() / 1000;
      this.sparkle.position.set(Math.round(x), Math.round(this.groundY - 12 * s + Math.sin(t * 3) * 2 * s));
      this.sparkle.scale.set(s);
      const remaining = (sp.expiresAt - Date.now()) / 1000;
      this.sparkle.alpha = remaining < 4 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 6)) : 1;
      this.sparkleTimer -= dt;
      if (this.sparkleTimer <= 0) {
        this.sparkleTimer = 0.5;
        this.emitStars(x, this.groundY - 12 * s, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.node.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.node.x += p.vx * dt;
      p.node.y += p.vy * dt;
      p.node.alpha = Math.min(1, (p.life / p.maxLife) * 2);
    }
  }
}

