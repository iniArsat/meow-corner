// Partikel kecil di atas strip: hati, bintang, not musik, debu, remah, teks melayang.

import { Container, Graphics, Sprite, Text, type TextStyleOptions } from "pixi.js";
import type { ObjectId } from "./pixelart";
import { objectTexture, shapeTexture } from "./textures";

interface Particle {
  node: Container;
  vx: number;
  vy: number;
  gravity: number;
  /** Faktor pengurang kecepatan per detik (0 = tanpa hambatan). */
  drag: number;
  life: number;
  maxLife: number;
  spin: number;
  /** Ukuran berubah sepanjang umur: skala akhir relatif terhadap awal. */
  grow: number;
  baseScale: number;
  /** Batas bawah (y lantai); partikel berhenti jatuh di sini. */
  floor: number | null;
  wobble: number;
  phase: number;
  baseAlpha: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export const TEXT_STYLE: TextStyleOptions = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: 15,
  fontWeight: "800",
  fill: 0xffe08a,
  stroke: { color: 0x2a1d1a, width: 4 },
};

export interface ParticleOptions {
  vx?: number;
  vy?: number;
  gravity?: number;
  drag?: number;
  life?: number;
  spin?: number;
  grow?: number;
  scale?: number;
  floor?: number | null;
  wobble?: number;
  alpha?: number;
}

export class Effects {
  readonly layer = new Container();
  private particles: Particle[] = [];
  /** Skala piksel saat ini, diatur oleh Stage. */
  scale = 3;
  /** Mode Fokus: partikel dikurangi. */
  calm = false;

  add(node: Container, x: number, y: number, o: ParticleOptions = {}): void {
    node.position.set(x, y);
    const baseScale = o.scale ?? 1;
    node.scale.set(baseScale);
    if (o.alpha !== undefined) node.alpha = o.alpha;
    this.layer.addChild(node);
    const life = o.life ?? 1;
    this.particles.push({
      node,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      gravity: o.gravity ?? 0,
      drag: o.drag ?? 0,
      life,
      maxLife: life,
      spin: o.spin ?? 0,
      grow: o.grow ?? 1,
      baseScale,
      floor: o.floor ?? null,
      wobble: o.wobble ?? 0,
      phase: Math.random() * Math.PI * 2,
      baseAlpha: o.alpha ?? 1,
    });
  }

  icon(id: ObjectId, x: number, y: number, o: ParticleOptions = {}): void {
    const sp = new Sprite(objectTexture(id));
    sp.anchor.set(0.5);
    this.add(sp, x, y, { ...o, scale: (o.scale ?? 0.6) * this.scale });
  }

  hearts(x: number, y: number, n: number): void {
    const s = this.scale;
    for (let i = 0; i < (this.calm ? Math.min(n, 1) : n); i++) {
      this.icon("heart", x + rand(-6, 6) * s, y, {
        vx: rand(-6, 6) * s,
        vy: rand(-26, -16) * s,
        life: rand(1, 1.6),
        wobble: 3 * s,
        scale: rand(0.45, 0.65),
      });
    }
  }

  stars(x: number, y: number, n: number): void {
    const s = this.scale;
    for (let i = 0; i < (this.calm ? Math.min(n, 2) : n); i++) {
      this.icon("star", x, y, {
        vx: rand(-30, 30) * s,
        vy: rand(-40, -15) * s,
        gravity: 60 * s,
        life: rand(0.6, 1),
        spin: rand(-6, 6),
        scale: 0.5,
      });
    }
  }

  zzz(x: number, y: number): void {
    const s = this.scale;
    this.icon("zzz", x, y, { vx: 4 * s, vy: -6 * s, life: 2, grow: 1.5, scale: 0.45, wobble: 1.5 * s });
  }

  notes(x: number, y: number, n = 1): void {
    const s = this.scale;
    for (let i = 0; i < n; i++) {
      this.icon("note", x + rand(-4, 4) * s, y, {
        vx: rand(-5, 5) * s,
        vy: rand(-18, -12) * s,
        life: rand(1.2, 1.8),
        wobble: 4 * s,
        scale: 0.5,
      });
    }
  }

  /** Kepulan debu di kaki (berlari, mendarat). */
  dust(x: number, y: number, n: number, dir = 0): void {
    if (this.calm) return;
    const s = this.scale;
    for (let i = 0; i < n; i++) {
      const g = new Sprite(shapeTexture("puff"));
      g.anchor.set(0.5);
      g.tint = 0xf3e6cf;
      this.add(g, x + rand(-4, 4) * s, y - rand(0, 2) * s, {
        vx: (dir === 0 ? rand(-16, 16) : -dir * rand(6, 18)) * s,
        vy: rand(-8, -2) * s,
        drag: 2.5,
        life: rand(0.35, 0.6),
        grow: 1.8,
        scale: rand(0.6, 1.1) * s,
        alpha: 0.85,
      });
    }
  }

  /** Remah camilan yang jatuh ke lantai. */
  crumbs(x: number, y: number, floor: number, n = 3): void {
    if (this.calm) return;
    const s = this.scale;
    for (let i = 0; i < n; i++) {
      const g = new Sprite(shapeTexture("pixel"));
      g.anchor.set(0.5);
      g.tint = Math.random() < 0.5 ? 0xc98a4b : 0xe9b97a;
      this.add(g, x, y, {
        scale: s,
        vx: rand(-14, 14) * s,
        vy: rand(-20, -6) * s,
        gravity: 140 * s,
        life: rand(0.6, 0.9),
        floor,
      });
    }
  }

  /** Cincin melebar (misalnya saat hadiah dibuka atau kucing naik level). */
  ring(x: number, y: number, color = 0xffe08a): void {
    const s = this.scale;
    const g = new Graphics().circle(0, 0, 6 * s).stroke({ color, width: s, alpha: 0.9 });
    this.add(g, x, y, { life: 0.5, grow: 2.6 });
  }

  text(x: number, y: number, text: string, color = 0xffe08a, size = 15): void {
    const t = new Text({ text, style: { ...TEXT_STYLE, fill: color, fontSize: size } });
    t.anchor.set(0.5, 1);
    this.add(t, Math.round(x), Math.round(y), { vy: -28, life: 1.6, drag: 0.6 });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.node.destroy({ children: true });
        this.particles.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.node.x += p.vx * dt + (p.wobble ? Math.cos(t * 9 + p.phase) * p.wobble * dt * 3 : 0);
      p.node.y += p.vy * dt;
      if (p.floor !== null && p.node.y > p.floor) {
        p.node.y = p.floor;
        p.vy = 0;
        p.vx *= 0.5;
      }
      p.node.rotation += p.spin * dt;
      if (p.grow !== 1) p.node.scale.set(p.baseScale * (1 + (p.grow - 1) * t));
      p.node.alpha = p.baseAlpha * Math.min(1, (p.life / p.maxLife) * 2.2);
    }
  }

  clear(): void {
    for (const p of this.particles) p.node.destroy({ children: true });
    this.particles = [];
  }
}
