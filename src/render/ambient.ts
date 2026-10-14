// Suasana: kupu-kupu di siang hari dan kunang-kunang di malam hari.

import { Container, Graphics, Sprite } from "pixi.js";
import { objectTexture } from "./textures";

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface AmbientContext {
  scale: number;
  groundY: number;
  minX: number;
  maxX: number;
  width: number;
  focus: boolean;
  hour: number;
}

export function isNight(hour: number): boolean {
  return hour >= 19 || hour < 5;
}

export class Butterfly {
  readonly sprite = new Sprite(objectTexture("butterfly"));
  x: number;
  y: number;
  private vx: number;
  private t = 0;
  private baseY: number;
  private fleeing = 0;
  done = false;

  constructor(ctx: AmbientContext) {
    const fromLeft = Math.random() < 0.5;
    this.x = fromLeft ? -20 : ctx.maxX + 20;
    this.vx = (fromLeft ? 1 : -1) * rand(9, 14) * ctx.scale;
    this.baseY = ctx.groundY - rand(18, 40) * ctx.scale;
    this.y = this.baseY;
    this.sprite.anchor.set(0.5);
  }

  /** Ketinggian di atas lantai, piksel layar. */
  height(groundY: number): number {
    return groundY - this.y;
  }

  /** Dikejar kucing: terbang menjauh ke atas. */
  scare(): void {
    this.fleeing = 1.6;
  }

  update(dt: number, ctx: AmbientContext): void {
    const s = ctx.scale;
    this.t += dt;
    const flap = Math.floor(this.t * (this.fleeing > 0 ? 14 : 7)) % 2 === 0;
    this.sprite.texture = objectTexture(flap ? "butterfly" : "butterfly2");
    if (this.fleeing > 0) {
      this.fleeing -= dt;
      this.baseY -= 22 * s * dt;
      this.x += this.vx * 1.8 * dt;
    } else {
      this.x += this.vx * dt;
      // Turun-naik pelan, kadang mendekati lantai (menggoda kucing).
      this.baseY += Math.sin(this.t * 0.7) * 6 * s * dt;
      this.baseY = Math.min(ctx.groundY - 10 * s, Math.max(ctx.groundY - 60 * s, this.baseY));
    }
    this.y = this.baseY + Math.sin(this.t * 3.1) * 3 * s;
    this.sprite.scale.set(s * (this.vx < 0 ? -1 : 1), s);
    this.sprite.position.set(Math.round(this.x), Math.round(this.y));
    if (this.x < -40 || this.x > ctx.width + 40 || this.y < -20) this.done = true;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

interface Firefly {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export class Ambient {
  readonly layer = new Container();
  butterfly: Butterfly | null = null;
  private fireflies: Firefly[] = [];
  private nextButterfly = rand(25, 70);
  private wander = 0;

  /** Kunang-kunang terdekat, untuk ditatap kucing. */
  firefly(): { x: number; y: number } | null {
    const f = this.fireflies[Math.floor(Math.random() * this.fireflies.length)];
    return f ? { x: f.x, y: f.y } : null;
  }

  update(dt: number, ctx: AmbientContext): void {
    const s = ctx.scale;
    const night = isNight(ctx.hour);
    const day = ctx.hour >= 7 && ctx.hour < 17;

    // Kupu-kupu
    if (this.butterfly) {
      this.butterfly.update(dt, ctx);
      if (this.butterfly.done) {
        this.butterfly.destroy();
        this.butterfly = null;
      }
    } else if (day && !ctx.focus) {
      this.nextButterfly -= dt;
      if (this.nextButterfly <= 0) {
        this.nextButterfly = rand(90, 240);
        this.butterfly = new Butterfly(ctx);
        this.layer.addChild(this.butterfly.sprite);
      }
    }

    // Kunang-kunang
    const want = night && !ctx.focus ? 7 : 0;
    while (this.fireflies.length < want) {
      const g = new Graphics();
      g.circle(0, 0, 3 * s).fill({ color: 0xd9ff6b, alpha: 0.18 });
      g.circle(0, 0, 1.6 * s).fill({ color: 0xeaff9e, alpha: 0.35 });
      g.rect(-s / 2, -s / 2, s, s).fill(0xfbffd6);
      this.layer.addChild(g);
      this.fireflies.push({
        g,
        x: rand(ctx.minX, ctx.maxX),
        y: ctx.groundY - rand(10, 70) * s,
        vx: rand(-6, 6) * s,
        vy: rand(-3, 3) * s,
        phase: rand(0, Math.PI * 2),
      });
    }
    while (this.fireflies.length > want) this.fireflies.pop()!.g.destroy();
    this.wander -= dt;
    const steer = this.wander <= 0;
    if (steer) this.wander = 1.5;
    const t = performance.now() / 1000;
    for (const f of this.fireflies) {
      if (steer) {
        f.vx += rand(-4, 4) * s;
        f.vy += rand(-3, 3) * s;
        f.vx = Math.max(-10 * s, Math.min(10 * s, f.vx));
        f.vy = Math.max(-6 * s, Math.min(6 * s, f.vy));
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < ctx.minX || f.x > ctx.maxX) f.vx *= -1;
      const top = ctx.groundY - 80 * s;
      const bottom = ctx.groundY - 6 * s;
      if (f.y < top || f.y > bottom) f.vy *= -1;
      f.x = Math.max(ctx.minX, Math.min(ctx.maxX, f.x));
      f.y = Math.max(top, Math.min(bottom, f.y));
      f.g.position.set(Math.round(f.x), Math.round(f.y));
      f.g.alpha = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.7 + f.phase));
    }
  }
}
