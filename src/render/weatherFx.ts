// Efek cuaca di strip: hujan (tetes, percikan, genangan), salju, awan, kabut,
// kilat, daun tertiup angin, serta bulan dan bintang di malam cerah.
// Semua efek hanya tampil di pita rendah di atas area kucing (kiri bawah layar),
// tidak di seluruh jendela, agar tidak mengganggu pekerjaan di layar.

import { Container, Graphics, Sprite } from "pixi.js";
import type { WeatherKind } from "../core/types";
import { isDark, mixColor, type DayPhase } from "../core/weather";
import { objectTexture, shapeTexture } from "./textures";

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface WeatherView {
  kind: WeatherKind;
  /** Kekuatan hujan/salju 0..1. */
  intensity: number;
  /** Angin, km/jam. */
  wind: number;
  phase: DayPhase;
  scale: number;
  /** Tepi kanan area kucing (efek tidak melewatinya). */
  width: number;
  groundY: number;
  minX: number;
  maxX: number;
  /** Mode Fokus: efek dikurangi. */
  calm: boolean;
}

/** Tinggi pita langit di atas lantai, dalam piksel sprite. */
export const SKY_HEIGHT = 44;

interface Drop {
  sprite: Sprite;
  vx: number;
  vy: number;
  snow: boolean;
  phase: number;
}

interface Splash {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
}

interface Cloud {
  sprite: Sprite;
  speed: number;
  /** Kepekatan tujuan (0 saat awan tidak dibutuhkan lagi). */
  target: number;
}

interface Puddle {
  sprite: Sprite;
  x: number;
  size: number;
  max: number;
}

const CLOUDS_FOR: Record<WeatherKind, number> = {
  clear: 0,
  partly: 2,
  cloudy: 5,
  fog: 1,
  drizzle: 4,
  rain: 5,
  storm: 6,
  snow: 4,
};

const CLOUD_TINT: Record<WeatherKind, number> = {
  clear: 0xffffff,
  partly: 0xffffff,
  cloudy: 0xd6dce4,
  fog: 0xe8eaee,
  drizzle: 0xc4ccd6,
  rain: 0xaab4c2,
  storm: 0x7f889a,
  snow: 0xe6ecf4,
};

export class WeatherFx {
  /** Di belakang fasilitas: awan, bulan, bintang. */
  readonly back = new Container();
  /** Di atas lantai, di bawah kucing: genangan. */
  readonly ground = new Container();
  /** Di depan kucing: hujan, salju, kabut, daun, kilat. */
  readonly front = new Container();

  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private clouds: Cloud[] = [];
  private puddles: Puddle[] = [];
  private stars: Sprite[] = [];
  private moon: Sprite;
  private fogs: Graphics[] = [];
  private leaves: { sprite: Sprite; vx: number; vy: number; spin: number }[] = [];
  private flash: Sprite;
  private flashLife = 0;
  private nextLightning = rand(6, 12);
  private spawnDebt = 0;
  private t = 0;

  /** Dipanggil saat kilat menyambar (untuk guruh dan reaksi kucing). */
  onLightning: (() => void) | null = null;

  /** Potongan pita langit untuk setiap lapisan (agar efek tidak keluar dari area kucing). */
  private masks: Graphics[] = [];
  private maskKey = "";

  constructor() {
    for (const layer of [this.back, this.ground, this.front]) {
      const m = new Graphics();
      layer.addChild(m);
      layer.mask = m;
      this.masks.push(m);
    }
    this.moon = new Sprite(objectTexture("moon"));
    this.moon.anchor.set(0.5);
    this.moon.alpha = 0;
    this.back.addChild(this.moon);
    this.flash = new Sprite(shapeTexture("pixel"));
    this.flash.tint = 0xf4f8ff;
    this.flash.alpha = 0;
    this.front.addChild(this.flash);
  }

  /** Air yang sedang turun? (untuk payung kucing) */
  wet = false;

  update(dt: number, v: WeatherView): void {
    this.t += dt;
    const s = v.scale;
    const dark = isDark(v.phase);
    const wet = v.kind === "drizzle" || v.kind === "rain" || v.kind === "storm";
    this.wet = wet && v.intensity > 0;
    const top = v.groundY - SKY_HEIGHT * s;

    // Pita langit: dari lantai sampai SKY_HEIGHT di atasnya, selebar area kucing.
    const key = `${v.width}:${v.groundY}:${s}`;
    if (key !== this.maskKey) {
      this.maskKey = key;
      for (const m of this.masks) m.clear().rect(0, top - 6 * s, v.width, v.groundY - top + 10 * s).fill(0xffffff);
    }

    // ---- Tetes hujan / salju
    const snowing = v.kind === "snow";
    const maxDrops = Math.round((wet || snowing ? v.intensity : 0) * v.width * (v.calm ? 0.025 : snowing ? 0.05 : 0.09));
    const fallTime = snowing ? 4 : 0.45;
    this.spawnDebt += (maxDrops / fallTime) * dt;
    const slant = Math.max(-1, Math.min(1, v.wind / 45));
    while (this.spawnDebt >= 1 && this.drops.length < maxDrops) {
      this.spawnDebt -= 1;
      const sp = this.pool.pop() ?? new Sprite(shapeTexture("pixel"));
      sp.anchor.set(0.5, 1);
      sp.rotation = 0;
      sp.visible = true;
      const drop: Drop = {
        sprite: sp,
        vx: snowing ? rand(-4, 4) * s : -slant * 70 * s,
        vy: snowing ? rand(14, 22) * s : rand(230, 290) * s,
        snow: snowing,
        phase: rand(0, Math.PI * 2),
      };
      if (snowing) {
        sp.tint = 0xffffff;
        sp.width = sp.height = Math.max(2, Math.round(s * rand(0.7, 1.1)));
        sp.alpha = 0.9;
      } else {
        sp.tint = 0xc4dcf4;
        sp.width = Math.max(1, Math.round(s * 0.6));
        sp.height = 4 * s;
        sp.alpha = 0.6;
        sp.rotation = Math.atan2(-drop.vx, drop.vy);
      }
      sp.position.set(rand(-40, v.width + 40), top + rand(-10, 20) * s);
      if (sp.parent !== this.front) this.front.addChild(sp);
      this.drops.push(drop);
    }
    if (this.spawnDebt > 2) this.spawnDebt = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const sp = d.sprite;
      sp.x += (d.vx + (d.snow ? Math.sin(this.t * 2 + d.phase) * 6 * s : 0)) * dt;
      sp.y += d.vy * dt;
      // Muncul perlahan di bagian atas zona hujan.
      if (!d.snow) sp.alpha = Math.min(0.6, (sp.y - top + 10 * s) / (20 * s));
      const floor = v.groundY - (d.snow ? 0 : rand(0, 1.5) * s);
      if (sp.y >= floor) {
        if (!d.snow && !v.calm && Math.random() < 0.6) this.splash(sp.x, v.groundY, s);
        // Daur ulang sprite agar tidak membuat ratusan objek baru tiap detik.
        this.recycle(sp);
        this.drops.splice(i, 1);
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const p = this.splashes[i];
      p.life -= dt;
      p.vy += 200 * s * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.alpha = Math.max(0, p.life * 3);
      if (p.life <= 0 || p.sprite.y > v.groundY + 2) {
        this.recycle(p.sprite);
        this.splashes.splice(i, 1);
      }
    }

    // ---- Genangan: tumbuh saat hujan, mengering perlahan
    if (this.puddles.length === 0) {
      for (let i = 0; i < 5; i++) {
        const sp = new Sprite(shapeTexture("shadow"));
        sp.anchor.set(0.5);
        sp.tint = 0x86b6dc;
        this.ground.addChild(sp);
        this.puddles.push({ sprite: sp, x: rand(0.05, 0.95), size: 0, max: rand(0.6, 1) });
      }
    }
    for (const p of this.puddles) {
      p.size = wet ? Math.min(p.max, p.size + dt * v.intensity * 0.02) : Math.max(0, p.size - dt / 240);
      const w = (14 + p.max * 10) * s * p.size;
      p.sprite.visible = p.size > 0.02;
      p.sprite.width = w;
      p.sprite.height = 2.4 * s * Math.max(0.4, p.size);
      p.sprite.alpha = 0.4 * Math.min(1, p.size * 2);
      p.sprite.position.set(Math.round(v.minX + p.x * (v.maxX - v.minX)), v.groundY - s * 0.6);
    }

    // ---- Awan
    const want = v.calm ? Math.min(2, CLOUDS_FOR[v.kind]) : CLOUDS_FOR[v.kind];
    const alive = this.clouds.filter((c) => c.target > 0).length;
    for (let i = alive; i < want; i++) {
      const sp = new Sprite(objectTexture(Math.random() < 0.55 ? "cloud1" : "cloud2"));
      sp.anchor.set(0.5);
      sp.alpha = 0;
      const scaleK = rand(0.7, 1);
      sp.scale.set(s * scaleK);
      sp.position.set(rand(0, v.width), v.groundY - rand(34, 40) * s);
      this.back.addChild(sp);
      this.clouds.push({ sprite: sp, speed: rand(3, 7) * s, target: 1 });
    }
    let extra = alive - want;
    for (const c of this.clouds) {
      if (extra > 0 && c.target > 0) {
        c.target = 0;
        extra--;
      }
    }
    const cloudTint = mixColor(CLOUD_TINT[v.kind], dark ? 0x6a729a : CLOUD_TINT[v.kind], dark ? 0.6 : 0);
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      const dir = v.wind >= 0 ? 1 : -1;
      c.sprite.x += (c.speed + Math.abs(v.wind) * 0.25 * s) * dir * dt;
      if (c.sprite.x > v.width + 20 * s) c.sprite.x = -20 * s;
      if (c.sprite.x < -20 * s) c.sprite.x = v.width + 20 * s;
      const targetAlpha = c.target * (v.kind === "partly" ? 0.75 : 0.92);
      c.sprite.alpha += (targetAlpha - c.sprite.alpha) * Math.min(1, dt * 0.6);
      c.sprite.tint = cloudTint;
      if (c.target === 0 && c.sprite.alpha < 0.02) {
        c.sprite.destroy();
        this.clouds.splice(i, 1);
      }
    }

    // ---- Bulan dan bintang di malam yang tidak mendung
    const clearNight = dark && (v.kind === "clear" || v.kind === "partly");
    if (this.stars.length === 0) {
      for (let i = 0; i < 16; i++) {
        const st = new Sprite(shapeTexture("pixel"));
        st.anchor.set(0.5);
        st.tint = 0xfffbe0;
        this.back.addChild(st);
        this.stars.push(st);
      }
    }
    this.stars.forEach((st, i) => {
      const fx = ((i * 7919) % 997) / 997;
      const fy = ((i * 104729) % 991) / 991;
      st.position.set(Math.round(v.minX + fx * (v.maxX - v.minX)), Math.round(v.groundY - (22 + fy * 20) * s));
      st.width = st.height = Math.max(2, Math.round(s * (i % 4 === 0 ? 1 : 0.67)));
      const twinkle = 0.45 + 0.45 * Math.sin(this.t * (1.3 + (i % 5) * 0.3) + i);
      const target = clearNight ? twinkle : 0;
      st.alpha += (target - st.alpha) * Math.min(1, dt * 1.5);
    });
    this.moon.scale.set(s * 0.8);
    this.moon.position.set(Math.round(v.minX + (v.maxX - v.minX) * 0.9), Math.round(v.groundY - 36 * s));
    this.moon.alpha += ((clearNight ? 0.95 : 0) - this.moon.alpha) * Math.min(1, dt);

    // ---- Kabut
    const foggy = v.kind === "fog";
    if (foggy && this.fogs.length === 0) {
      for (let i = 0; i < 4; i++) {
        const g = new Graphics();
        const w = rand(120, 200) * s;
        for (let k = 0; k < 4; k++) g.ellipse(0, 0, w * (1 - k * 0.2), (10 + k * 2) * s * (1 - k * 0.15)).fill({ color: 0xffffff, alpha: 0.07 });
        g.position.set(rand(0, v.width), v.groundY - rand(4, 22) * s);
        g.alpha = 0;
        this.front.addChild(g);
        this.fogs.push(g);
      }
    }
    for (let i = this.fogs.length - 1; i >= 0; i--) {
      const g = this.fogs[i];
      g.x += (4 + i) * s * dt * (i % 2 ? 1 : -1);
      if (g.x > v.width + 60 * s) g.x = -60 * s;
      if (g.x < -60 * s) g.x = v.width + 60 * s;
      g.alpha += ((foggy ? 1 : 0) - g.alpha) * Math.min(1, dt * 0.4);
      if (!foggy && g.alpha < 0.02) {
        g.destroy();
        this.fogs.splice(i, 1);
      }
    }

    // ---- Daun tertiup angin (kering dan berangin)
    if (!wet && !snowing && v.wind >= 22 && !v.calm && Math.random() < dt * (v.wind / 40)) {
      const sp = new Sprite(objectTexture("leaf"));
      sp.anchor.set(0.5);
      sp.scale.set(s * 0.8);
      const fromLeft = v.wind >= 0;
      sp.position.set(fromLeft ? -20 : v.width + 20, v.groundY - rand(6, 34) * s);
      this.front.addChild(sp);
      this.leaves.push({ sprite: sp, vx: (fromLeft ? 1 : -1) * rand(50, 90) * s * (v.wind / 30), vy: rand(-6, 10) * s, spin: rand(-3, 3) });
    }
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i];
      l.sprite.x += l.vx * dt;
      l.sprite.y += (l.vy + Math.sin(this.t * 3 + i) * 12 * s) * dt;
      l.sprite.rotation += l.spin * dt;
      if (l.sprite.y > v.groundY - 2 * s) l.sprite.y = v.groundY - 2 * s;
      if (l.sprite.x < -40 || l.sprite.x > v.width + 40) {
        l.sprite.destroy();
        this.leaves.splice(i, 1);
      }
    }

    // ---- Kilat
    this.flash.position.set(0, top - 6 * s);
    this.flash.width = v.width;
    this.flash.height = v.groundY - top + 16 * s;
    if (v.kind === "storm") {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.nextLightning = rand(7, 16);
        this.flashLife = 0.55;
        this.onLightning?.();
      }
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      // Dua kedipan cepat.
      const t = 0.55 - this.flashLife;
      this.flash.alpha = v.calm ? 0 : t < 0.08 ? 0.32 : t < 0.16 ? 0.05 : t < 0.24 ? 0.24 : Math.max(0, 0.24 - (t - 0.24));
    } else this.flash.alpha = 0;
  }

  /** Sprite piksel bekas tetes/percikan, dipakai lagi. */
  private pool: Sprite[] = [];

  private recycle(sp: Sprite): void {
    if (this.pool.length < 400) {
      sp.visible = false;
      this.pool.push(sp);
    } else sp.destroy();
  }

  private splash(x: number, groundY: number, s: number): void {
    for (let k = 0; k < 2; k++) {
      const sp = this.pool.pop() ?? new Sprite(shapeTexture("pixel"));
      sp.visible = true;
      sp.rotation = 0;
      sp.alpha = 1;
      sp.anchor.set(0.5);
      sp.tint = 0xdcecfa;
      sp.width = sp.height = Math.max(1, Math.round(s * 0.6));
      sp.position.set(x, groundY - s);
      if (sp.parent !== this.front) this.front.addChild(sp);
      this.splashes.push({ sprite: sp, vx: rand(-14, 14) * s, vy: rand(-40, -20) * s, life: rand(0.18, 0.3) });
    }
  }
}
