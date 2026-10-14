// Satu kucing di strip: animasi pose, gerak (jalan, lari, lompat, jatuh,
// diangkat), gelembung emosi, dan bayangan. Keputusan "mau apa berikutnya"
// diambil oleh Stage; aktor hanya menjalankan perintah dan memberi tahu
// lewat `needsDecision` saat tugasnya selesai.

import { Container, Graphics, Sprite } from "pixi.js";
import type { FacilityId } from "../core/types";
import type { Effects } from "./effects";
import { poseBounds, poseHead, poseSize, type CatPose, type ObjectId } from "./pixelart";
import { catTexture, objectTexture, shapeTexture } from "./textures";

export type SpotKind = "perch" | "box";

export interface SpotRef {
  facility: FacilityId;
  index: number;
  kind: SpotKind;
}

export interface ActorHost {
  readonly pixelScale: number;
  readonly groundY: number;
  readonly focusMode: boolean;
  readonly fx: Effects;
  walkRange(): [number, number];
  /** Posisi kaki di sebuah tempat; null bila fasilitasnya sudah tidak ada. */
  spotPos(spot: SpotRef): { x: number; y: number } | null;
  /** Tempat yang dilewati saat jatuh dari yPrev ke yNow di x (untuk mendarat di fasilitas). */
  surfaceAt(x: number, yPrev: number, yNow: number, ignore: CatActor): SpotRef | null;
  /** Dipanggil setelah kucing yang jatuh/dilempar menyentuh permukaan. */
  landed(actor: CatActor, hard: boolean): void;
  sound(id: "thud"): void;
}

export type CatMode =
  | "idle"
  | "sit"
  | "groom"
  | "sleep"
  | "eat"
  | "walk"
  | "run"
  | "play"
  | "happy"
  | "purr"
  | "angry"
  | "sulk"
  | "startled"
  | "held"
  | "fall"
  | "land"
  | "leap"
  | "hidden"
  | "watch"
  | "stalk"
  | "beg"
  | "treat"
  | "proud"
  | "boop"
  | "playfight"
  | "arrive"
  | "wait"
  | "leave"
  | "announce"
  | "stretch"
  | "yawn"
  | "talk"
  | "type";

interface Anim {
  frames: CatPose[];
  seconds: number;
}

const WALK: Anim = { frames: ["walk1", "stand", "walk2", "stand"], seconds: 0.15 };

const ANIMS: Record<CatMode, Anim> = {
  idle: { frames: ["stand"], seconds: 1 },
  sit: { frames: ["sit"], seconds: 1 },
  groom: { frames: ["groom", "groom2"], seconds: 0.32 },
  sleep: { frames: ["sleep", "sleep2"], seconds: 1.3 },
  eat: { frames: ["eat", "eat2"], seconds: 0.3 },
  walk: WALK,
  run: { frames: ["jump", "crouch"], seconds: 0.09 },
  play: { frames: ["crouch", "jump", "crouch", "sitAlert"], seconds: 0.22 },
  happy: { frames: ["sitHappy"], seconds: 1 },
  purr: { frames: ["sitHappy"], seconds: 1 },
  angry: { frames: ["hiss"], seconds: 1 },
  sulk: { frames: ["sit"], seconds: 1 },
  startled: { frames: ["jump"], seconds: 1 },
  held: { frames: ["held", "held2"], seconds: 0.6 },
  fall: { frames: ["jump"], seconds: 1 },
  land: { frames: ["crouch"], seconds: 1 },
  leap: { frames: ["jump"], seconds: 1 },
  hidden: { frames: ["sit"], seconds: 1 },
  watch: { frames: ["sitAlert"], seconds: 1 },
  stalk: { frames: ["crouch"], seconds: 1 },
  beg: { frames: ["sitAlert"], seconds: 1 },
  treat: { frames: ["eat", "eat2"], seconds: 0.2 },
  proud: { frames: ["sitHappy"], seconds: 1 },
  boop: { frames: ["stand"], seconds: 1 },
  playfight: { frames: ["crouch", "jump", "hiss", "jump"], seconds: 0.2 },
  arrive: WALK,
  wait: { frames: ["sit"], seconds: 1 },
  leave: WALK,
  announce: { frames: ["sitAlert", "sitAlert", "sitHappy"], seconds: 0.6 },
  stretch: { frames: ["stretch"], seconds: 1 },
  yawn: { frames: ["sitYawn", "sitBlink", "sitBlink"], seconds: 0.9 },
  talk: { frames: ["sitTalk", "sit2", "sitTalk", "sitHappy"], seconds: 0.16 },
  type: { frames: ["tapUp"], seconds: 1 },
};

/** Mode yang tidak terganggu kalau kucing ditinggal sendiri dan tidak sedang bergerak. */
const CALM: ReadonlySet<CatMode> = new Set(["idle", "sit", "groom", "watch", "wait", "happy", "proud", "beg", "sulk", "announce", "talk"]);

/** Mode yang bisa ditimpa oleh keinginan lain (mainan, camilan, ajakan bermain). */
const INTERRUPTIBLE: ReadonlySet<CatMode> = new Set([
  "idle",
  "sit",
  "groom",
  "walk",
  "watch",
  "happy",
  "proud",
  "play",
  "eat",
  "beg",
]);

/** Baris jangkar "tengkuk" di pose diangkat (kanvas 15×29). */
const HELD_ANCHOR_ROW = 8;
/** Jarak tengkuk ke telapak kaki pada pose lompat, dalam piksel sprite. */
const HELD_TO_FEET = 15;

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

interface Leap {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  duration: number;
  apex: number;
}

export class CatActor {
  readonly container = new Container();
  readonly sprite: Sprite;
  private shadow = new Sprite(shapeTexture("shadow"));
  private dotsKey = "";
  private emoteNode: Container | null = null;
  private emoteLife = 0;
  private emoteMax = 0;
  private needNode: Container | null = null;
  private dots: Graphics | null = null;
  private carryNode: Sprite | null = null;

  /** Posisi kaki (atau tengkuk saat diangkat), koordinat layar. */
  x: number;
  y: number;
  dir: 1 | -1 = 1;
  mode: CatMode = "idle";
  modeTime = 0;
  private modeDuration = 2;
  private after: (() => void) | null = null;
  /** true saat tugas selesai dan Stage perlu memilih kegiatan berikutnya. */
  needsDecision = false;

  private frameTime = 0;
  private frameIndex = 0;
  private blinkTimer = rand(2, 5);
  private blinking = 0;
  private flickTimer = rand(3, 8);
  private flicking = 0;
  private zzzTimer = 1;
  private noteTimer = 0;
  private dustTimer = 0;
  private crumbTimer = 0;
  /** Sisa waktu pose menepuk keyboard. */
  private tapTimer = 0;

  private targetX = 0;
  private speed = 0;
  private leap: Leap | null = null;
  vx = 0;
  vy = 0;
  /** Kecepatan horizontal yang dihaluskan saat diangkat (untuk ayunan). */
  private swing = 0;
  private hop = 0;
  private squash = 1;
  private offsetX = 0;

  /** Tempat bertengger / bersembunyi saat ini (null = di lantai). */
  spot: SpotRef | null = null;
  /** Ke mana kucing akan mendarat setelah dilempar. */
  private landingSpot: SpotRef | null = null;

  coat: string;
  accessory: string | null = null;
  removed = false;
  pose: CatPose = "stand";

  // Diisi oleh Stage.
  /** Meteran usapan kursor (dalam piksel sprite). */
  rub = 0;
  lastRubAt = 0;
  /** Waktu klik terakhir (ms) untuk mendeteksi klik beruntun. */
  clicks: number[] = [];
  lastHardLanding = 0;
  /** Tempat yang sedang dituju (agar dua kucing tidak berebut tempat yang sama). */
  claim: string | null = null;
  /** Kucing yang dilepas: koordinat x tujuan keluar layar. */
  exitTo: number | null = null;
  /** Sedang hujan: kucing yang berjalan memakai payung. */
  rainy = false;
  private umbrellaNode: Sprite | null = null;
  /** Kegiatan yang sedang dikoordinasikan Stage (sosial, mainan, hadiah...). */
  task: string | null = null;
  /** Kursor dekat kepala: kucing tampak penasaran. */
  curious = false;
  private lastTurn = 0;

  constructor(
    private host: ActorHost,
    readonly id: string,
    coat: string,
    x: number,
    readonly isVisitor: boolean,
  ) {
    this.coat = coat;
    this.x = x;
    this.y = host.groundY;
    this.sprite = new Sprite(catTexture(coat, "stand"));
    this.sprite.anchor.set(0.5, 1);
    this.shadow.anchor.set(0.5, 0.5);
    this.shadow.tint = 0x000000;
    this.container.addChild(this.shadow, this.sprite);
    if (isVisitor) {
      this.dir = -1;
    } else {
      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.setMode(Math.random() < 0.5 ? "sit" : "idle");
    }
  }

  get scale(): number {
    return this.host.pixelScale;
  }

  // -------------------------------------------------------------------------
  // Perintah

  setMode(mode: CatMode, duration?: number, after?: () => void): void {
    if (this.mode === "hidden" && mode !== "hidden") this.sprite.visible = true;
    this.mode = mode;
    this.modeTime = 0;
    this.frameIndex = 0;
    this.frameTime = 0;
    this.hop = 0;
    this.offsetX = 0;
    this.after = after ?? null;
    this.needsDecision = false;
    const focus = this.host.focusMode;
    switch (mode) {
      case "idle":
        this.modeDuration = duration ?? rand(2, 5);
        break;
      case "sit":
      case "watch":
        this.modeDuration = duration ?? rand(focus ? 10 : 4, focus ? 30 : 12);
        break;
      case "groom":
        this.modeDuration = duration ?? rand(2.5, 5);
        break;
      case "sleep":
        this.modeDuration = duration ?? rand(focus ? 40 : 12, focus ? 90 : 30);
        this.zzzTimer = 1.2;
        break;
      case "eat":
        this.modeDuration = duration ?? rand(3, 6);
        break;
      case "play":
        this.modeDuration = duration ?? rand(2, 4);
        break;
      case "happy":
        this.modeDuration = duration ?? 1.6;
        break;
      case "purr":
        this.modeDuration = duration ?? 4;
        this.noteTimer = 0;
        break;
      case "angry":
        this.modeDuration = duration ?? 1.3;
        break;
      case "sulk":
        this.modeDuration = duration ?? rand(6, 9);
        break;
      case "startled":
        this.modeDuration = duration ?? 0.5;
        break;
      case "land":
        this.modeDuration = duration ?? 0.28;
        break;
      case "stalk":
        this.modeDuration = duration ?? rand(0.5, 1.1);
        break;
      case "treat":
        this.modeDuration = duration ?? 1.8;
        break;
      case "proud":
        this.modeDuration = duration ?? 3;
        break;
      case "boop":
        this.modeDuration = duration ?? 1.8;
        break;
      case "playfight":
        this.modeDuration = duration ?? rand(2.5, 4);
        break;
      case "hidden":
        this.modeDuration = duration ?? rand(15, 40);
        this.sprite.visible = false;
        break;
      case "stretch":
        this.modeDuration = duration ?? rand(2, 3.2);
        break;
      case "yawn":
        this.modeDuration = duration ?? 2.7;
        break;
      case "talk":
      case "type":
      case "announce":
      case "beg":
      case "wait":
      case "held":
      case "fall":
      case "leap":
      case "walk":
      case "run":
      case "arrive":
      case "leave":
        this.modeDuration = duration ?? Infinity;
        break;
    }
  }

  /** Berjalan (atau berlari) ke x, lalu menjalankan `after`. */
  walkTo(x: number, after?: () => void, run = false): void {
    const [minX, maxX] = this.host.walkRange();
    this.targetX = Math.min(maxX, Math.max(minX, x));
    const s = this.scale;
    this.speed = run ? 46 * s : (this.host.focusMode ? 9 : 14) * s;
    this.setMode(run ? "run" : "walk", undefined, after);
  }

  /** Untuk tamu: masuk dari kanan, keluar ke kanan. */
  arriveAt(x: number): void {
    this.targetX = x;
    this.speed = 14 * this.scale;
    this.setMode("arrive");
  }

  leaveTo(x: number): void {
    this.targetX = x;
    this.speed = 16 * this.scale;
    this.spot = null;
    this.setMode("leave");
  }

  /** Lompat melengkung ke (x, y) kaki. */
  leapTo(x: number, y: number, after?: () => void, apexPx?: number): void {
    const s = this.scale;
    const dx = x - this.x;
    if (Math.abs(dx) > 2) this.dir = dx > 0 ? 1 : -1;
    const dist = Math.hypot(dx, y - this.y);
    this.leap = {
      x0: this.x,
      y0: this.y,
      x1: x,
      y1: y,
      t: 0,
      duration: Math.min(0.75, 0.32 + dist / (220 * s)),
      apex: apexPx ?? 10 * s + Math.abs(dx) * 0.12,
    };
    this.setMode("leap", undefined, after);
  }

  /** Naik ke tempat bertengger / masuk kardus. */
  jumpToSpot(spot: SpotRef, after?: () => void): boolean {
    const pos = this.host.spotPos(spot);
    if (!pos) return false;
    this.spot = null;
    this.leapTo(pos.x, pos.y, () => {
      this.spot = spot;
      this.land(false);
      if (after) after();
      else this.needsDecision = true;
    });
    return true;
  }

  /** Turun dari tempat bertengger ke lantai. */
  jumpDown(after?: () => void, toX?: number): void {
    const s = this.scale;
    const [minX, maxX] = this.host.walkRange();
    const side = toX !== undefined ? Math.sign(toX - this.x) || 1 : Math.random() < 0.5 ? -1 : 1;
    const x = Math.min(maxX, Math.max(minX, this.x + side * rand(14, 24) * s));
    if (this.mode === "hidden") {
      this.sprite.visible = true;
      this.host.fx.dust(this.x, this.y, 4);
    }
    this.spot = null;
    this.leapTo(x, this.host.groundY, () => {
      this.land(false);
      if (after) after();
      else this.needsDecision = true;
    }, 8 * s);
  }

  /** Gerakan kecil mendarat (debu, sedikit gepeng). */
  private land(hard: boolean): void {
    this.squash = hard ? 0.7 : 0.85;
    this.host.fx.dust(this.x, this.y, hard ? 7 : 3);
  }

  pickUp(): void {
    this.spot = null;
    this.landingSpot = null;
    this.leap = null;
    this.swing = 0;
    this.task = null;
    this.setMode("held");
    this.sprite.visible = true;
  }

  /** Dipanggil setiap gerakan pointer saat kucing diangkat. */
  dragTo(x: number, y: number): void {
    this.x = x;
    this.y = Math.max(HELD_ANCHOR_ROW * this.scale, y);
  }

  /** Dilepas dari genggaman dengan kecepatan lempar (px/detik). */
  drop(vx: number, vy: number, landing: SpotRef | null): void {
    const s = this.scale;
    // Tengkuk → telapak kaki pada pose lompat, agar kepala tidak meloncat.
    this.y = this.y + HELD_TO_FEET * s;
    this.vx = Math.max(-1600, Math.min(1600, vx));
    this.vy = Math.max(-1400, Math.min(1400, vy));
    this.landingSpot = landing;
    if (Math.abs(this.vx) > 30) this.dir = this.vx > 0 ? 1 : -1;
    this.setMode("fall");
  }

  /** Satu tepukan ke keyboard (mode "type"). */
  tap(): void {
    if (this.mode !== "type") return;
    this.tapTimer = 0.09;
    this.squash = 0.94;
  }

  /** Tampilkan ikon di atas kepala, dengan atau tanpa gelembung. */
  emote(id: ObjectId, seconds = 1.6, bubble = true): void {
    this.clearEmote();
    const c = new Container();
    if (bubble) {
      const b = new Sprite(objectTexture("bubble"));
      b.anchor.set(0.5, 1);
      c.addChild(b);
    }
    const icon = new Sprite(objectTexture(id));
    icon.anchor.set(0.5, 0.5);
    icon.position.set(0, bubble ? -6 : -3);
    if (bubble) icon.scale.set(Math.min(1, 7 / Math.max(icon.texture.width, icon.texture.height)));
    c.addChild(icon);
    this.emoteNode = c;
    this.emoteLife = seconds;
    this.emoteMax = seconds;
    this.container.addChild(c);
  }

  private clearEmote(): void {
    this.emoteNode?.destroy({ children: true });
    this.emoteNode = null;
  }

  setCarry(id: ObjectId | null): void {
    this.carryNode?.destroy();
    this.carryNode = null;
    if (id) {
      this.carryNode = new Sprite(objectTexture(id));
      this.carryNode.anchor.set(0.5, 0.2);
      this.container.addChild(this.carryNode);
    }
  }

  face(x: number): void {
    if (Math.abs(x - this.x) > 2) this.dir = x > this.x ? 1 : -1;
  }

  /** Menoleh ke arah kursor bila sedang santai (dengan jeda agar tidak gelisah). */
  lookToward(x: number, now: number): void {
    if (!CALM.has(this.mode) || this.mode === "sulk" || this.mode === "groom") return;
    const s = this.scale;
    const side = x > this.x ? 1 : -1;
    if (side !== this.dir && Math.abs(x - this.x) > 10 * s && now - this.lastTurn > 700) {
      this.dir = side;
      this.lastTurn = now;
    }
  }

  get airborne(): boolean {
    return this.mode === "held" || this.mode === "fall" || this.mode === "leap";
  }

  get hidden(): boolean {
    return this.mode === "hidden";
  }

  get calm(): boolean {
    return CALM.has(this.mode);
  }

  /** Bisa diajak melakukan hal lain sekarang. */
  get interruptible(): boolean {
    return INTERRUPTIBLE.has(this.mode) || this.needsDecision;
  }

  /** Batalkan tugas yang sedang berjalan tanpa memindahkan kucing. */
  cancelTask(): void {
    this.after = null;
    this.task = null;
    this.claim = null;
    this.setCarry(null);
  }

  /** Jalankan `cb` setelah mode sekarang selesai. */
  queue(cb: () => void): void {
    this.after = cb;
  }

  /** Perpanjang mode sekarang paling tidak `seconds` lagi. */
  extendMode(seconds: number): void {
    this.modeDuration = Math.max(this.modeDuration, this.modeTime + seconds);
  }

  /** Ubah tujuan jalan/lari tanpa mengulang animasi. */
  retarget(x: number): void {
    const [minX, maxX] = this.host.walkRange();
    this.targetX = Math.min(maxX, Math.max(minX, x));
  }

  get destination(): number {
    return this.targetX;
  }

  // -------------------------------------------------------------------------
  // Geometri

  /** Tengah-atas kepala, koordinat layar. */
  headPos(): { x: number; y: number } {
    const s = this.scale;
    if (this.mode === "held") return { x: this.x, y: this.y - 1 * s };
    const { w, h } = poseSize(this.pose);
    const hd = poseHead(this.pose);
    return {
      x: this.x + this.offsetX + (hd.x + 4.5 - w / 2) * s * this.dir,
      y: this.y - this.hop - (h - hd.y) * s * this.squash,
    };
  }

  /** Mulut, untuk membawa barang. */
  mouthPos(): { x: number; y: number } {
    const s = this.scale;
    const head = this.headPos();
    return { x: head.x + this.dir * 3 * s, y: head.y + 6 * s };
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (this.mode === "held") {
      const b = this.sprite.getBounds();
      return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
    }
    const s = this.scale;
    const { w, h } = poseSize(this.pose);
    const pb = poseBounds(this.pose);
    const left = this.dir === 1 ? pb.x0 - w / 2 : w / 2 - pb.x1;
    const right = this.dir === 1 ? pb.x1 - w / 2 : w / 2 - pb.x0;
    const bottom = this.y - this.hop;
    // Aksesori topi bisa menjulang di atas kepala; beri sedikit kelonggaran.
    const top = this.accessory ? Math.min(pb.y0, poseHead(this.pose).y - 4) : pb.y0;
    return {
      minX: this.x + left * s,
      maxX: this.x + right * s,
      minY: bottom - (h - top) * s,
      maxY: bottom - (h - pb.y1) * s,
    };
  }

  contains(x: number, y: number, pad = 0): boolean {
    if (this.hidden) return false;
    const b = this.bounds();
    return x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;
  }

  // -------------------------------------------------------------------------

  private finish(): void {
    const cb = this.after;
    this.after = null;
    if (cb) cb();
    else this.needsDecision = true;
  }

  private choosePose(dt: number, now: number): CatPose {
    const anim = ANIMS[this.mode];
    this.frameTime += dt;
    if (this.frameTime >= anim.seconds) {
      this.frameTime = 0;
      this.frameIndex = (this.frameIndex + 1) % anim.frames.length;
    }
    let pose = anim.frames[this.frameIndex % anim.frames.length];

    if (this.mode === "type") {
      this.tapTimer -= dt;
      return this.tapTimer > 0 ? "tapDown" : "tapUp";
    }

    if (this.mode === "held") {
      // Kaki menendang-nendang saat diayun cepat.
      const wiggle = Math.abs(this.swing) > 250 ? 0.18 : 0.6;
      pose = Math.floor(now / (wiggle * 1000)) % 2 === 0 ? "held" : "held2";
    }

    // Diusap: wajah senang.
    const rubbed = now - this.lastRubAt < 300 && this.rub > 15;
    if (rubbed && (this.mode === "sit" || this.mode === "idle" || this.mode === "watch" || this.mode === "beg" || this.mode === "wait" || this.mode === "sulk")) {
      return "sitHappy";
    }

    if (this.mode === "sit" || this.mode === "wait" || this.mode === "sulk") {
      if (this.curious && this.mode !== "sulk") pose = "sitAlert";
      this.flickTimer -= dt;
      if (this.flickTimer <= 0) {
        this.flicking = 0.45;
        this.flickTimer = rand(3, 9);
      }
      if (this.flicking > 0) {
        this.flicking -= dt;
        if (pose === "sit") pose = "sit2";
      }
    }

    // Kedipan sesekali.
    if (this.mode === "idle" || this.mode === "sit" || this.mode === "wait" || this.mode === "watch" || this.mode === "sulk" || this.mode === "beg") {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinking = 0.14;
        this.blinkTimer = rand(2, 6);
      }
      if (this.blinking > 0) {
        this.blinking -= dt;
        pose = pose === "stand" ? "blink" : "sitBlink";
      }
    }
    return pose;
  }

  update(dt: number, now: number): void {
    const s = this.scale;
    const host = this.host;
    this.modeTime += dt;
    this.squash += (1 - this.squash) * Math.min(1, dt * 12);
    this.offsetX = 0;
    this.hop = 0;

    // Posisi menempel pada tempat bertengger / lantai.
    if (!this.airborne) {
      if (this.spot) {
        const pos = host.spotPos(this.spot);
        if (pos) {
          this.x = pos.x;
          this.y = pos.y;
        } else {
          // Fasilitas hilang (misalnya setelah Pindah Rumah): jatuh ke lantai.
          this.spot = null;
          this.vx = 0;
          this.vy = 0;
          this.landingSpot = null;
          this.setMode("fall");
        }
      } else {
        this.y = host.groundY;
      }
    }

    switch (this.mode) {
      case "walk":
      case "run":
      case "arrive":
      case "leave": {
        const dx = this.targetX - this.x;
        if (Math.abs(dx) > 0.5) this.dir = dx >= 0 ? 1 : -1;
        const step = Math.min(Math.abs(dx), this.speed * dt);
        this.x += step * Math.sign(dx);
        if (this.mode === "run") {
          this.hop = Math.abs(Math.sin(this.modeTime * 18)) * 1.5 * s;
          this.dustTimer -= dt;
          if (this.dustTimer <= 0) {
            this.dustTimer = 0.12;
            host.fx.dust(this.x - this.dir * 6 * s, this.y, 1, this.dir);
          }
        }
        if (Math.abs(this.targetX - this.x) < 0.5) {
          if (this.mode === "arrive") {
            this.dir = -1;
            this.setMode("wait");
          } else if (this.mode === "leave") {
            this.removed = true;
          } else this.finish();
        }
        break;
      }
      case "leap": {
        const l = this.leap;
        if (!l) {
          this.finish();
          break;
        }
        l.t = Math.min(1, l.t + dt / l.duration);
        const t = l.t;
        const top = Math.min(l.y0, l.y1) - l.apex;
        // Kurva Bezier kuadrat lewat titik puncak.
        const cy = 2 * top - (l.y0 + l.y1) / 2;
        this.x = l.x0 + (l.x1 - l.x0) * t;
        this.y = (1 - t) * (1 - t) * l.y0 + 2 * (1 - t) * t * cy + t * t * l.y1;
        if (t >= 1) {
          this.leap = null;
          this.x = l.x1;
          this.y = l.y1;
          this.finish();
        }
        break;
      }
      case "fall": {
        const g = 300 * s;
        const prevY = this.y;
        this.vy += g * dt;
        this.vx *= Math.max(0, 1 - 0.6 * dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const [minX, maxX] = host.walkRange();
        if (this.x < minX) {
          this.x = minX;
          this.vx = Math.abs(this.vx) * 0.4;
        } else if (this.x > maxX) {
          this.x = maxX;
          this.vx = -Math.abs(this.vx) * 0.4;
        }
        if (Math.abs(this.vx) > 40) this.dir = this.vx > 0 ? 1 : -1;
        const impact = this.vy;
        let landed = false;
        if (this.vy > 0) {
          const surface = host.surfaceAt(this.x, prevY, this.y, this);
          if (surface && (!this.landingSpot || this.landingSpot.facility === surface.facility)) {
            const pos = host.spotPos(surface);
            if (pos) {
              this.spot = surface;
              this.x = pos.x;
              this.y = pos.y;
              landed = true;
            }
          }
        }
        if (!landed && this.y >= host.groundY) {
          this.y = host.groundY;
          this.spot = null;
          landed = true;
        }
        if (landed) {
          const hard = impact > 120 * s;
          if (hard) host.sound("thud");
          this.land(hard);
          if (this.spot?.kind === "box") {
            this.host.fx.dust(this.x, this.y, 5);
            this.setMode("hidden", rand(6, 14));
          } else this.setMode("land", hard ? 0.4 : 0.22);
          host.landed(this, hard);
        }
        break;
      }
      case "held": {
        // Ayunan pendulum: miring berlawanan arah gerak, kembali pelan.
        this.swing += (this.vx - this.swing) * Math.min(1, dt * 10);
        break;
      }
      case "play": {
        const phase = (this.modeTime * 2.2) % 1;
        this.hop = Math.sin(phase * Math.PI) * 4 * s;
        if (phase < 0.04 && Math.random() < 0.5) this.dir = this.dir === 1 ? -1 : 1;
        break;
      }
      case "playfight": {
        const phase = (this.modeTime * 3) % 1;
        this.hop = Math.max(0, Math.sin(phase * Math.PI)) * 5 * s;
        if (phase < 0.05 && Math.random() < 0.15) host.fx.dust(this.x, this.y, 2);
        break;
      }
      case "startled": {
        const t = Math.min(1, this.modeTime / 0.4);
        this.hop = Math.sin(t * Math.PI) * 7 * s;
        break;
      }
      case "announce": {
        // Melompat-lompat kecil agar pemain menoleh.
        const phase = this.modeTime % 1.8;
        if (phase < 0.36) this.hop = Math.sin((phase / 0.36) * Math.PI) * 5 * s;
        break;
      }
      case "purr":
        this.offsetX = (Math.floor(now / 60) % 2 === 0 ? 0.35 : -0.35) * s;
        this.noteTimer -= dt;
        if (this.noteTimer <= 0) {
          this.noteTimer = 0.7;
          const head = this.headPos();
          host.fx.notes(head.x + this.dir * 4 * s, head.y);
        }
        break;
      case "angry":
        this.offsetX = Math.sin(now / 25) * 0.8 * s;
        break;
      case "stalk":
        // Pantat bergoyang sebelum menerkam.
        this.offsetX = Math.sin(this.modeTime * 34) * 0.6 * s;
        break;
      case "sleep":
        this.zzzTimer -= dt;
        if (this.zzzTimer <= 0) {
          this.zzzTimer = 2.2;
          const head = this.headPos();
          host.fx.zzz(head.x + this.dir * 4 * s, head.y);
        }
        break;
      case "treat":
      case "eat":
        this.crumbTimer -= dt;
        if (this.crumbTimer <= 0) {
          this.crumbTimer = this.mode === "treat" ? 0.35 : 1.1;
          const m = this.mouthPos();
          host.fx.crumbs(m.x, m.y + 2 * s, this.y, this.mode === "treat" ? 2 : 1);
        }
        break;
      default:
        break;
    }

    if (this.modeTime >= this.modeDuration) {
      if (this.mode === "hidden") this.sprite.visible = true;
      this.finish();
    }

    this.render(dt, now);
  }

  private render(dt: number, now: number): void {
    const s = this.scale;
    const pose = this.choosePose(dt, now);
    this.pose = pose;
    const sprite = this.sprite;
    sprite.texture = catTexture(this.coat, pose, this.accessory);
    if (this.mode === "held") {
      const { h } = poseSize(pose);
      sprite.anchor.set(0.5, HELD_ANCHOR_ROW / h);
      sprite.rotation = Math.max(-0.6, Math.min(0.6, -this.swing * 0.0009));
      sprite.scale.set(s, s);
      sprite.position.set(Math.round(this.x), Math.round(this.y));
    } else {
      sprite.anchor.set(0.5, 1);
      sprite.rotation = 0;
      sprite.scale.set(this.dir * s, s * this.squash);
      sprite.position.set(Math.round(this.x + this.offsetX), Math.round(this.y - this.hop));
    }
    sprite.visible = this.mode !== "hidden";

    // Yang di udara atau di tempat tinggi digambar di depan.
    const raised = this.airborne || (this.spot !== null && this.spot.kind === "perch");
    this.container.zIndex = Math.round(this.x) + (raised ? 100_000 : 0);

    // Bayangan di permukaan di bawah kucing.
    this.shadow.visible = this.mode !== "hidden";
    if (this.shadow.visible) {
      const surfaceY = this.spot ? this.y : this.host.groundY;
      const feetY = this.mode === "held" ? this.y + (HELD_TO_FEET + 6) * s : this.y - this.hop;
      const height = Math.max(0, surfaceY - feetY);
      const fade = 1 - Math.min(1, height / (60 * s));
      const w = (pose.startsWith("sleep") ? 9 : this.mode === "held" ? 5 : 8) * s * (0.6 + 0.4 * fade);
      // Tekstur bayangan 16×4 piksel: skala ke lebar 2w dan tinggi ±3 piksel sprite.
      this.shadow.scale.set((2 * w) / 16, (3.2 * s) / 4);
      this.shadow.position.set(Math.round(this.x), surfaceY - s * 0.5);
      this.shadow.alpha = 0.18 * fade;
    }

    // Gelembung emosi.
    const head = this.headPos();
    if (this.emoteNode) {
      this.emoteLife -= dt;
      if (this.emoteLife <= 0 || this.mode === "hidden") this.clearEmote();
      else {
        const age = this.emoteMax - this.emoteLife;
        const pop = age < 0.15 ? 0.4 + (age / 0.15) * 0.75 : age < 0.25 ? 1.15 - ((age - 0.15) / 0.1) * 0.15 : 1;
        this.emoteNode.scale.set(s * 0.75 * pop);
        this.emoteNode.alpha = Math.min(1, this.emoteLife * 3);
        const bob = Math.sin(now / 300) * 0.5 * s;
        this.emoteNode.position.set(Math.round(head.x + this.dir * 2 * s), Math.round(head.y - 2 * s + bob));
      }
    }
    if (this.needNode) {
      this.needNode.visible = !this.emoteNode && this.mode !== "hidden" && this.mode !== "held";
      const bob = Math.sin(now / 300) * 0.6 * s;
      this.needNode.scale.set(s * 0.75);
      this.needNode.position.set(Math.round(head.x + this.dir * 2 * s), Math.round(head.y - 2 * s + bob));
    }
    // Payung kecil saat berjalan di bawah hujan.
    const walking = this.mode === "walk" || this.mode === "run" || this.mode === "arrive" || this.mode === "leave";
    const showUmbrella = this.rainy && walking;
    if (showUmbrella && !this.umbrellaNode) {
      this.umbrellaNode = new Sprite(objectTexture("umbrella"));
      this.umbrellaNode.anchor.set(0.5, 1);
      this.container.addChild(this.umbrellaNode);
    }
    if (this.umbrellaNode) {
      this.umbrellaNode.visible = showUmbrella;
      if (showUmbrella) {
        this.umbrellaNode.scale.set(s * 0.9);
        // Sedikit miring ke arah jalan.
        this.umbrellaNode.rotation = this.dir * (this.mode === "run" ? 0.25 : 0.1);
        this.umbrellaNode.position.set(Math.round(head.x - this.dir * 1 * s), Math.round(head.y + 3 * s));
      }
    }
    if (this.carryNode) {
      const m = this.mouthPos();
      this.carryNode.scale.set(s * 0.7);
      this.carryNode.position.set(Math.round(m.x), Math.round(m.y));
      this.carryNode.visible = this.mode !== "hidden";
    }
  }

  /** Gelembung kebutuhan yang menetap (lapar, tamu menunggu makan). */
  setNeed(id: ObjectId | null): void {
    const current = this.needNode?.label ?? null;
    if (current === id) return;
    this.needNode?.destroy({ children: true });
    this.needNode = null;
    if (!id) return;
    const c = new Container();
    c.label = id;
    const b = new Sprite(objectTexture("bubble"));
    b.anchor.set(0.5, 1);
    const icon = new Sprite(objectTexture(id));
    icon.anchor.set(0.5, 0.5);
    icon.scale.set(0.75);
    icon.position.set(0, -7);
    c.addChild(b, icon);
    this.needNode = c;
    this.container.addChild(c);
  }

  /** Titik di bawah tamu: berapa kali sudah diberi makan. */
  setDots(fed: number | null): void {
    if (fed === null) {
      this.dots?.destroy();
      this.dots = null;
      return;
    }
    if (!this.dots) {
      this.dots = new Graphics();
      this.container.addChild(this.dots);
      this.dotsKey = "";
    }
    const s = this.scale;
    // Digambar ulang hanya bila jumlah makan atau skala berubah; posisinya cukup digeser.
    const key = `${fed}:${s}`;
    if (key !== this.dotsKey) {
      this.dotsKey = key;
      this.dots.clear();
      for (let i = 0; i < 3; i++) {
        this.dots
          .circle(-4 * s + i * 4 * s, 2 * s, 1.2 * s)
          .fill({ color: i < fed ? 0xef5b7b : 0xfffaf0 })
          .stroke({ color: 0x3b2f2a, width: Math.max(1, s * 0.5) });
      }
    }
    this.dots.position.set(Math.round(this.x), Math.round(this.host.groundY));
  }

  destroy(): void {
    this.removed = true;
    this.container.destroy({ children: true });
  }
}
