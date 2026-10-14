// Generator pixel art. Sprite disusun dari bagian (ekor, badan, kaki, kepala)
// berisi huruf wilayah tanpa garis tepi; garis tepi dibuat otomatis. Warna
// diterapkan per wilayah lewat pola bulu, jadi satu set pose cukup untuk
// semua jenis kucing. Modul ini murni (tanpa DOM) agar bisa diuji dan dipratinjau.

import type { CoatDef, PatternId } from "../core/types";

export interface PixelImage {
  w: number;
  h: number;
  /** RGBA, panjang w*h*4. */
  data: Uint8ClampedArray;
}

/** Huruf wilayah kucing:
 *  h kepala · r telinga · p merah muda (hidung, dalam telinga) · m moncong
 *  k pupil · e iris · c dada · b badan · l kaki · t ekor · x mata tertutup */
type Grid = readonly string[];

interface Part {
  name: "head" | "body" | "tail" | "leg";
  grid: Grid;
  x: number;
  y: number;
  /** Gambar cincin garis tepi di atas bagian sebelumnya (memisahkan kepala dari badan). */
  ring?: boolean;
}

interface Cell {
  ch: string;
  part: Part["name"] | "";
  lx: number;
  ly: number;
}

export const CAT_W = 24;
export const CAT_H = 17;
/** Ruang kosong di atas setiap pose untuk topi tinggi. */
export const CAT_PAD_TOP = 6;

// ---------------------------------------------------------------------------
// Bagian tubuh kucing (menghadap kanan)

const HEAD: Grid = [
  ".r.....r.",
  "rpr...rpr",
  "hhhhhhhhh",
  "hhkhhhkhh",
  "hhehhhehh",
  "hhhmpmhhh",
  ".hhmmmhh.",
];

const HEAD_CLOSED: Grid = [
  ".r.....r.",
  "rpr...rpr",
  "hhhhhhhhh",
  "hhhhhhhhh",
  "hxxhhhxxh",
  "hhhmpmhhh",
  ".hhmmmhh.",
];

/** Mata tersenyum ^ ^ saat senang atau mendengkur. */
const HEAD_HAPPY: Grid = [
  ".r.....r.",
  "rpr...rpr",
  "hhhhhhhhh",
  "hhxhhhxhh",
  "hxhxhxhxh",
  "hhhmpmhhh",
  ".hhmmmhh.",
];

/** Telinga rata, alis menukik, mulut terbuka: kesal. */
const HEAD_ANGRY: Grid = [
  ".........",
  "rr.....rr",
  "hhhhhhhhh",
  "hxkhhhkxh",
  "hhehhhehh",
  "hhhmpmhhh",
  ".hhmkmhh.",
];

/** Mata bulat besar: penasaran / siap menerkam. */
const HEAD_ALERT: Grid = [
  ".r.....r.",
  "rpr...rpr",
  "hhhhhhhhh",
  "hkkhhhkkh",
  "hekhhhekh",
  "hhhmpmhhh",
  ".hhmmmhh.",
];

/** Menguap: mata terpejam, mulut terbuka lebar. */
const HEAD_YAWN: Grid = [
  ".r.....r.",
  "rpr...rpr",
  "hhhhhhhhh",
  "hxxhhhxxh",
  "hhhmpmhhh",
  "hhmkkkmhh",
  ".hmkpkmh.",
];

const BODY: Grid = [
  ".bbbbbbbbbbb.",
  "bbbbbbbbbbbbc",
  "bbbbbbbbbbbcc",
  "bbbbbbbbbbbcc",
  ".bbbbbbbbbbb.",
];

const BODY_LONG: Grid = [
  ".bbbbbbbbbbbbb.",
  "bbbbbbbbbbbbbbc",
  "bbbbbbbbbbbbbcc",
  ".bbbbbbbbbbbbb.",
];

const BODY_ARCH: Grid = [
  "...bbbbbbb...",
  ".bbbbbbbbbbb.",
  "bbbbbbbbbbbbc",
  "bbbbbbbbbbbcc",
  "bbbbbbbbbbbcc",
  ".bbb.....bbb.",
];

const BODY_SIT: Grid = [
  "..bbbbbcc.",
  ".bbbbbbccc",
  "bbbbbbbccc",
  "bbbbbbbbcc",
  "bbbbbbbbbb",
  "bbbbbbbbbb",
];

const BODY_LOAF: Grid = [
  "..bbbbbbbbbb..",
  ".bbbbbbbbbbbbb",
  "bbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbb",
  ".bbbbbbbbbbbb.",
];

const BODY_HANG: Grid = [
  ".bbbbb.",
  "bbcccbb",
  "bbcccbb",
  "bbbcbbb",
  "bbbbbbb",
  "bbbbbbb",
  "bbbbbbb",
  ".bbbbb.",
];

/** Peregangan: badan belakang tinggi, depan rendah. */
const BODY_HIGH: Grid = [".bbbbbb.", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", ".bbbbbb."];
const BODY_LOW: Grid = ["bbbbbbb.", "bbbbbbcc", "bbbbbbcc", ".bbbbbc."];

const LEG: Grid = ["ll", "ll", "ll"];
const LEG_TALL: Grid = ["ll", "ll", "ll", "ll", "ll", "ll"];
const LEG_LONG: Grid = ["ll", "ll", "ll", "ll"];
const LEG_SHORT: Grid = ["ll", "ll"];
const LEG_SIDE: Grid = ["lll", "lll"];
const PAW: Grid = ["ll"];
const PAW_UP: Grid = ["ll", "ll", "ll"];

const TAIL_UP: Grid = [".t", "t.", "t.", "t.", ".t", ".t"];
const TAIL_UP_2: Grid = ["t.", "t.", "t.", "t.", ".t", ".t"];
const TAIL_STRAIGHT: Grid = ["t", "t", "t", "t", "t", "t", "t"];
const TAIL_PUFF: Grid = [".t.", "ttt", "ttt", "ttt", "ttt", ".tt", "..t"];
const TAIL_BACK: Grid = ["tttt.", "....t"];
const TAIL_SIT: Grid = ["....t", "tttt."];
const TAIL_SIT_2: Grid = ["t...t", ".ttt."];
const TAIL_LOAF: Grid = ["tttttttt"];
const TAIL_HANG: Grid = ["t", "t", "t", "t", ".t"];

interface Pose {
  parts: Part[];
  /** Ukuran kanvas pose sebelum ditambah ruang topi; bawaan 24×17. */
  w?: number;
  h?: number;
}

function cat(parts: Part[], size?: { w: number; h: number }): Pose {
  return { parts, ...size };
}

const STAND_LEGS: Part[] = [
  { name: "leg", grid: LEG, x: 5, y: 13 },
  { name: "leg", grid: LEG, x: 8, y: 13 },
  { name: "leg", grid: LEG, x: 12, y: 13 },
  { name: "leg", grid: LEG, x: 15, y: 13 },
];

const SIT_BASE = (tail: Grid): Part[] => [
  { name: "tail", grid: tail, x: 2, y: 14 },
  { name: "body", grid: BODY_SIT, x: 7, y: 9, ring: true },
  { name: "leg", grid: PAW, x: 13, y: 15 },
  { name: "leg", grid: PAW, x: 15, y: 15 },
];

/** Pose kucing. Koordinat di kanvas 24×17, kaki menapak di baris 16 (garis tepi). */
export const CAT_POSES = {
  stand: cat([
    { name: "tail", grid: TAIL_UP, x: 3, y: 3 },
    { name: "body", grid: BODY, x: 4, y: 8, ring: true },
    ...STAND_LEGS,
    { name: "head", grid: HEAD, x: 13, y: 2, ring: true },
  ]),
  walk1: cat([
    { name: "tail", grid: TAIL_UP_2, x: 3, y: 3 },
    { name: "body", grid: BODY, x: 4, y: 8, ring: true },
    { name: "leg", grid: LEG, x: 4, y: 13 },
    { name: "leg", grid: LEG, x: 9, y: 13 },
    { name: "leg", grid: LEG, x: 11, y: 13 },
    { name: "leg", grid: LEG, x: 16, y: 13 },
    { name: "head", grid: HEAD, x: 13, y: 2, ring: true },
  ]),
  walk2: cat([
    { name: "tail", grid: TAIL_UP, x: 3, y: 4 },
    { name: "body", grid: BODY, x: 4, y: 9, ring: true },
    { name: "leg", grid: LEG_SHORT, x: 6, y: 14 },
    { name: "leg", grid: LEG_SHORT, x: 8, y: 14 },
    { name: "leg", grid: LEG_SHORT, x: 13, y: 14 },
    { name: "leg", grid: LEG_SHORT, x: 15, y: 14 },
    { name: "head", grid: HEAD, x: 13, y: 3, ring: true },
  ]),
  blink: cat([
    { name: "tail", grid: TAIL_UP, x: 3, y: 3 },
    { name: "body", grid: BODY, x: 4, y: 8, ring: true },
    ...STAND_LEGS,
    { name: "head", grid: HEAD_CLOSED, x: 13, y: 2, ring: true },
  ]),
  sit: cat([...SIT_BASE(TAIL_SIT), { name: "head", grid: HEAD, x: 10, y: 3, ring: true }]),
  sit2: cat([...SIT_BASE(TAIL_SIT_2), { name: "head", grid: HEAD, x: 10, y: 3, ring: true }]),
  sitBlink: cat([...SIT_BASE(TAIL_SIT), { name: "head", grid: HEAD_CLOSED, x: 10, y: 3, ring: true }]),
  sitHappy: cat([...SIT_BASE(TAIL_SIT_2), { name: "head", grid: HEAD_HAPPY, x: 10, y: 3, ring: true }]),
  sitAlert: cat([...SIT_BASE(TAIL_SIT), { name: "head", grid: HEAD_ALERT, x: 10, y: 3, ring: true }]),
  sitYawn: cat([...SIT_BASE(TAIL_SIT_2), { name: "head", grid: HEAD_YAWN, x: 10, y: 3, ring: true }]),
  /** Peregangan ala kucing: kaki depan terjulur, pantat naik. */
  stretch: cat([
    { name: "tail", grid: TAIL_UP, x: 3, y: 0 },
    { name: "leg", grid: LEG_TALL, x: 5, y: 10 },
    { name: "leg", grid: LEG_TALL, x: 8, y: 10 },
    { name: "body", grid: BODY_HIGH, x: 4, y: 5, ring: true },
    { name: "body", grid: BODY_LOW, x: 10, y: 8 },
    { name: "leg", grid: LEG_SIDE, x: 13, y: 14 },
    { name: "leg", grid: LEG_SIDE, x: 19, y: 14 },
    { name: "head", grid: HEAD_HAPPY, x: 14, y: 7, ring: true },
  ]),
  groom: cat([
    ...SIT_BASE(TAIL_SIT),
    { name: "head", grid: HEAD_CLOSED, x: 10, y: 3, ring: true },
    { name: "leg", grid: PAW_UP, x: 14, y: 8, ring: true },
  ]),
  groom2: cat([
    ...SIT_BASE(TAIL_SIT_2),
    { name: "head", grid: HEAD_CLOSED, x: 10, y: 4, ring: true },
    { name: "leg", grid: PAW_UP, x: 14, y: 10, ring: true },
  ]),
  sleep: cat([
    { name: "tail", grid: TAIL_LOAF, x: 6, y: 15 },
    { name: "body", grid: BODY_LOAF, x: 3, y: 11, ring: true },
    { name: "head", grid: HEAD_CLOSED, x: 13, y: 8, ring: true },
  ]),
  sleep2: cat([
    { name: "tail", grid: TAIL_LOAF, x: 6, y: 15 },
    { name: "body", grid: BODY_LOAF, x: 3, y: 10, ring: true },
    { name: "head", grid: HEAD_CLOSED, x: 13, y: 8, ring: true },
  ]),
  eat: cat([
    { name: "tail", grid: TAIL_UP, x: 3, y: 3 },
    { name: "body", grid: BODY, x: 4, y: 8, ring: true },
    ...STAND_LEGS,
    { name: "head", grid: HEAD_CLOSED, x: 14, y: 6, ring: true },
  ]),
  eat2: cat([
    { name: "tail", grid: TAIL_UP_2, x: 3, y: 3 },
    { name: "body", grid: BODY, x: 4, y: 8, ring: true },
    ...STAND_LEGS,
    { name: "head", grid: HEAD_CLOSED, x: 14, y: 7, ring: true },
  ]),
  /** Merunduk siap menerkam: badan rendah, ekor tegak, mata membulat. */
  crouch: cat([
    { name: "tail", grid: TAIL_STRAIGHT, x: 3, y: 4 },
    { name: "body", grid: BODY, x: 4, y: 10, ring: true },
    { name: "leg", grid: LEG_SHORT, x: 5, y: 15 },
    { name: "leg", grid: LEG_SHORT, x: 8, y: 15 },
    { name: "leg", grid: LEG_SHORT, x: 13, y: 15 },
    { name: "leg", grid: LEG_SHORT, x: 16, y: 15 },
    { name: "head", grid: HEAD_ALERT, x: 14, y: 6, ring: true },
  ]),
  /** Melompat: badan memanjang, kaki depan dan belakang terentang. */
  jump: cat([
    { name: "tail", grid: TAIL_BACK, x: 0, y: 5 },
    { name: "leg", grid: LEG_SIDE, x: 1, y: 10 },
    { name: "body", grid: BODY_LONG, x: 3, y: 7, ring: true },
    { name: "leg", grid: LEG_SIDE, x: 17, y: 10 },
    { name: "head", grid: HEAD_ALERT, x: 14, y: 1, ring: true },
  ]),
  /** Punggung melengkung dan ekor mengembang: kesal. */
  hiss: cat([
    { name: "tail", grid: TAIL_PUFF, x: 1, y: 1 },
    { name: "body", grid: BODY_ARCH, x: 4, y: 6, ring: true },
    { name: "leg", grid: LEG_LONG, x: 5, y: 12 },
    { name: "leg", grid: LEG_LONG, x: 8, y: 12 },
    { name: "leg", grid: LEG_LONG, x: 12, y: 12 },
    { name: "leg", grid: LEG_LONG, x: 15, y: 12 },
    { name: "head", grid: HEAD_ANGRY, x: 14, y: 3, ring: true },
  ]),
  /** Diangkat dengan mouse: menggantung, kaki terjuntai. */
  held: cat(
    [
      { name: "tail", grid: TAIL_HANG, x: 7, y: 16 },
      { name: "leg", grid: LEG_LONG, x: 4, y: 15 },
      { name: "leg", grid: LEG_LONG, x: 9, y: 15 },
      { name: "body", grid: BODY_HANG, x: 4, y: 8, ring: true },
      { name: "leg", grid: LEG, x: 2, y: 9 },
      { name: "leg", grid: LEG, x: 11, y: 9 },
      { name: "head", grid: HEAD, x: 3, y: 1, ring: true },
    ],
    { w: 15, h: 23 },
  ),
  held2: cat(
    [
      { name: "tail", grid: TAIL_HANG, x: 7, y: 16 },
      { name: "leg", grid: LEG_LONG, x: 3, y: 15 },
      { name: "leg", grid: LEG_LONG, x: 10, y: 15 },
      { name: "body", grid: BODY_HANG, x: 4, y: 8, ring: true },
      { name: "leg", grid: LEG, x: 2, y: 10 },
      { name: "leg", grid: LEG, x: 11, y: 10 },
      { name: "head", grid: HEAD_HAPPY, x: 3, y: 1, ring: true },
    ],
    { w: 15, h: 23 },
  ),
} as const;

export type CatPose = keyof typeof CAT_POSES;
export const CAT_POSE_NAMES = Object.keys(CAT_POSES) as CatPose[];

/** Ukuran kanvas akhir sebuah pose (termasuk ruang topi). */
export function poseSize(pose: CatPose): { w: number; h: number } {
  const p: Pose = CAT_POSES[pose];
  return { w: p.w ?? CAT_W, h: (p.h ?? CAT_H) + CAT_PAD_TOP };
}

/** Posisi kiri-atas kepala di kanvas akhir (untuk gelembung dan efek). */
export function poseHead(pose: CatPose): { x: number; y: number } {
  const head = CAT_POSES[pose].parts.find((p) => p.name === "head")!;
  return { x: head.x, y: head.y + CAT_PAD_TOP };
}

// ---------------------------------------------------------------------------
// Komposisi dan garis tepi otomatis

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function composeCells(parts: Part[], w: number, h: number): Cell[][] {
  const cells: Cell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ch: ".", part: "" as Cell["part"], lx: 0, ly: 0 })),
  );
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  for (const part of parts) {
    const filled = new Set<string>();
    part.grid.forEach((row, ly) => {
      for (let lx = 0; lx < row.length; lx++) if (row[lx] !== ".") filled.add(`${part.x + lx},${part.y + ly}`);
    });
    if (part.ring) {
      for (const key of filled) {
        const [x, y] = key.split(",").map(Number);
        for (const [dx, dy] of NEIGHBORS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny) || filled.has(`${nx},${ny}`)) continue;
          if (cells[ny][nx].ch !== ".") cells[ny][nx] = { ch: "o", part: "", lx: 0, ly: 0 };
        }
      }
    }
    part.grid.forEach((row, ly) => {
      for (let lx = 0; lx < row.length; lx++) {
        const ch = row[lx];
        const x = part.x + lx;
        const y = part.y + ly;
        if (ch === "." || !inBounds(x, y)) continue;
        cells[y][x] = { ch, part: part.name, lx, ly };
      }
    });
  }

  // Garis tepi luar: piksel kosong yang bersebelahan dengan isi.
  const outline: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cells[y][x].ch !== ".") continue;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny) && cells[ny][nx].ch !== "." && cells[ny][nx].ch !== "o") {
          outline.push([x, y]);
          break;
        }
      }
    }
  }
  for (const [x, y] of outline) cells[y][x] = { ch: "o", part: "", lx: 0, ly: 0 };
  return cells;
}

// ---------------------------------------------------------------------------
// Warna

type RGBA = [number, number, number, number];

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const v = hex.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), alpha];
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgba(a);
  const cb = hexToRgba(b);
  const c = ca.slice(0, 3).map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

const PINK = "#f19aa8";

function furColor(cell: Cell, pattern: PatternId, p: CoatDef["palette"]): string {
  const { part, lx, ly } = cell;
  switch (pattern) {
    case "solid":
      return p.base;
    case "tabby":
      if (part === "head" && ((ly === 2 && (lx === 3 || lx === 5)) || (ly === 5 && (lx === 0 || lx === 8)))) return p.dark;
      if (part === "body" && lx % 3 === 1 && ly > 0) return p.dark;
      if (part === "tail" && ly % 2 === 0) return p.dark;
      return p.base;
    case "tuxedo":
      if (part === "leg" && ly === 0 && cell.ch === "l") return p.base;
      if (part === "leg") return p.light;
      return p.base;
    case "calico": {
      if (part === "head") {
        if (ly <= 3 && lx <= 3) return p.patch;
        if (ly <= 2 && lx >= 6) return p.dark;
        return p.base;
      }
      if (part === "tail") return ly % 2 === 0 || lx % 2 === 0 ? p.dark : p.patch;
      if (part === "body") {
        const v = hash(lx >> 2, ly >> 1, 7) % 3;
        return v === 0 ? p.base : v === 1 ? p.patch : p.dark;
      }
      return p.base;
    }
    case "point":
      if (part === "tail" || part === "leg") return p.dark;
      if (cell.ch === "r") return p.dark;
      if (part === "head" && ly >= 4) return mix(p.base, p.dark, 0.35);
      return p.base;
    case "spotted":
      if (part === "body" && hash(lx, ly, 3) % 4 === 0) return p.dark;
      if (part === "head" && ly === 2 && lx % 2 === 1) return p.dark;
      if (part === "tail" && ly % 2 === 0) return p.dark;
      if (part === "leg" && hash(lx, ly, 9) % 3 === 0) return p.dark;
      return p.base;
    case "starry":
      if ((part === "body" || part === "tail") && hash(lx, ly, part === "tail" ? 5 : 11) % 9 === 0) return p.dark;
      if (part === "head" && ly <= 2 && hash(lx, ly, 13) % 5 === 0) return p.dark;
      return p.base;
  }
}

function cellColor(cell: Cell, coat: CoatDef): string | null {
  const p = coat.palette;
  switch (cell.ch) {
    case ".":
      return null;
    case "o":
      return p.outline;
    case "k":
      return p.outline;
    case "x":
      return p.outline;
    case "e":
      return p.eye;
    case "p":
      return coat.pattern === "starry" ? p.light : PINK;
    case "m":
      if (coat.pattern === "point") return p.dark;
      if (coat.pattern === "calico") return p.light;
      return p.light;
    case "c":
      if (coat.pattern === "point" || coat.pattern === "starry") return p.light;
      return p.light;
    default:
      return furColor(cell, coat.pattern, p);
  }
}

function toImage(cells: Cell[][], colorOf: (cell: Cell) => string | null): PixelImage {
  const h = cells.length;
  const w = cells[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = colorOf(cells[y][x]);
      if (!color) continue;
      const [r, g, b, a] = hexToRgba(color);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { w, h, data };
}

function poseCells(pose: CatPose): Cell[][] {
  const { w, h } = poseSize(pose);
  const parts = CAT_POSES[pose].parts.map((p) => ({ ...p, y: p.y + CAT_PAD_TOP }));
  return composeCells(parts, w, h);
}

const boundsCache = new Map<CatPose, { x0: number; y0: number; x1: number; y1: number }>();

/** Kotak terisi sebuah pose (tanpa ruang topi kosong), untuk uji klik yang pas. x1/y1 eksklusif. */
export function poseBounds(pose: CatPose): { x0: number; y0: number; x1: number; y1: number } {
  let b = boundsCache.get(pose);
  if (!b) {
    const cells = poseCells(pose);
    b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    cells.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c.ch === ".") return;
        b!.x0 = Math.min(b!.x0, x);
        b!.y0 = Math.min(b!.y0, y);
        b!.x1 = Math.max(b!.x1, x + 1);
        b!.y1 = Math.max(b!.y1, y + 1);
      }),
    );
    boundsCache.set(pose, b);
  }
  return b;
}

/** Tempel gambar kecil (dengan garis tepinya sendiri) di atas gambar lain. */
function overlay(target: PixelImage, src: PixelImage, ox: number, oy: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4;
      if (src.data[si + 3] === 0) continue;
      const tx = ox + x;
      const ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= target.w || ty >= target.h) continue;
      target.data.set(src.data.subarray(si, si + 4), (ty * target.w + tx) * 4);
    }
  }
}

export function renderCat(pose: CatPose, coat: CoatDef, accessory: string | null = null): PixelImage {
  const img = toImage(poseCells(pose), (cell) => cellColor(cell, coat));
  const art = accessory ? ACCESSORY_ART[accessory] : undefined;
  if (art) {
    const head = poseHead(pose);
    // renderArt memberi margin 1 piksel untuk garis tepi.
    overlay(img, renderArt(art), head.x + art.dx - 1, head.y + art.dy - 1);
  }
  return img;
}

/** Siluet untuk Kucingpedia (bulu yang belum ditemukan). */
export function renderSilhouette(pose: CatPose, color = "#6d5f5a"): PixelImage {
  return toImage(poseCells(pose), (cell) => (cell.ch === "." ? null : cell.ch === "o" ? "#3b302c" : color));
}

// ---------------------------------------------------------------------------
// Benda: fasilitas dan ikon. Huruf dipetakan langsung ke warna; garis tepi otomatis.

interface ObjectArt {
  grid: Grid;
  colors: Record<string, string>;
  outline: string;
}

const OBJ_OUTLINE = "#2a1d1a";

export const OBJECTS = {
  mangkuk: {
    grid: [
      "...FfFfFf...",
      "..fFfFfFfF..",
      "RRRRRRRRRRRR",
      ".rRwRRRRRRr.",
      "..rRRRRRRr..",
      "...rrrrrr...",
    ],
    colors: { F: "#b5652b", f: "#8a4a1e", R: "#d9534f", r: "#a8322f", w: "#f6b2a8" },
    outline: OBJ_OUTLINE,
  },
  benang: {
    grid: [
      "...pPp.......",
      ".pPpppPp.....",
      ".PppPpppP....",
      "pppPpppPpp...",
      "pPpppPpppP...",
      "ppPpppPppp...",
      ".pppPpppP....",
      ".PpppPppp....",
      "...pPpp.ppppp",
    ],
    colors: { p: "#e76f9a", P: "#b8406b" },
    outline: OBJ_OUTLINE,
  },
  kardus: {
    grid: [
      "ff..............ff",
      ".fff..........fff.",
      "..ffdddddddddddff.",
      "..BBBBBBBBBBBBBB..",
      "..BBBBBBBBBBBBBB..",
      "..BBBBBTTTTBBBBb..",
      "..BBBBBBBBBBBBBb..",
      "..BBBBBBBBBBBBBb..",
      "..BBBBBBBBBBBBBb..",
      "..bbbbbbbbbbbbbb..",
    ],
    colors: { f: "#d9a86c", d: "#5c3d22", B: "#c48a4f", b: "#9c6a3a", T: "#e9d7a8" },
    outline: OBJ_OUTLINE,
  },
  tiang: {
    grid: [
      "..PPPPPPPPP...",
      ".PPPPPPPPPPP..",
      ".QQQQQQQQQQQ..",
      ".....sS.....L.",
      ".....Ss.....L.",
      ".....sS.....L.",
      ".....Ss....YYY",
      ".....sS....YYY",
      ".....Ss.......",
      "PPPPPPPPP.....",
      "QQQQQQQQQ.....",
      ".....Ss.......",
      ".....sS.......",
      ".....Ss.......",
      ".....sS.......",
      ".....Ss.......",
      ".....sS.......",
      "..PPPPPPPPPP..",
      ".QQQQQQQQQQQQ.",
    ],
    colors: { P: "#8e7cc3", Q: "#5f4f94", s: "#d8c39a", S: "#b49a6a", L: "#e9d7a8", Y: "#f2c14e" },
    outline: OBJ_OUTLINE,
  },
  akuarium: {
    grid: [
      "GGGGGGGGGGGGGGGG",
      "gwwwwwwwwwwwwwwg",
      "gWWWWWWWWWWWWbWg",
      "gWWWWOOWWWWWWWWg",
      "gWWWOOOOWWWWbWWg",
      "gWWWWOOWWWWWWWWg",
      "gWWVWWWWWWWWWWWg",
      "gWVVWWWWWWWOOWWg",
      "gWVVWWWWWWOOOOWg",
      "gWVVWVWWWWWOOWWg",
      "gssVsVsssssssssg",
      "GGGGGGGGGGGGGGGG",
      ".KK..........KK.",
    ],
    colors: {
      G: "#4a5a66",
      g: "#9fd3e6",
      w: "#c9eef7",
      W: "#5cb6d6",
      O: "#f08a3a",
      b: "#e4f6fb",
      V: "#3f9a5a",
      s: "#e3c995",
      K: "#6b4a2f",
    },
    outline: OBJ_OUTLINE,
  },
  rak: {
    grid: [
      ".WWWWWWWWWWWWWWWW.",
      ".WkkkkkkkWkkkkkkW.",
      ".WkccckkkWkkkkukW.",
      ".WccccckkWkkkuuuW.",
      ".WkkkkkkkWkkkkukW.",
      ".WkkkkkkkWkkkkkkW.",
      ".WWWWWWWWWWWWWWWW.",
      ".WkkkkkkkWkkkkkkW.",
      ".WkkkkkkkWkkcckkW.",
      ".WkkkkkkkWkcccckkW.",
      ".WCCCCCCCCCCCCCCW.",
      ".WCcCCCCcCCCCcCCW.",
      "SSSSSSSSSSSSSSSSSS",
      "..ww..........ww..",
      "..ww..........ww..",
      "..ww..........ww..",
    ],
    colors: {
      W: "#8a5a35",
      k: "#9ed4f0",
      c: "#ffffff",
      u: "#ffd84d",
      C: "#d9534f",
      S: "#6b4226",
      w: "#7a4e2d",
    },
    outline: OBJ_OUTLINE,
  },
  fish: {
    grid: ["..FFF...F", ".FFFFF.FF", "FeFFFFFF.", ".FFFFF.FF", "..FFF...F"],
    colors: { F: "#7fb2d9", e: "#1f2a35" },
    outline: "#24384a",
  },
  goldfish: {
    grid: ["..FFF...F", ".FfFFF.FF", "FeFFFFFF.", ".FFFfF.FF", "..FFF...F"],
    colors: { F: "#f7c948", f: "#fff3b0", e: "#3b2a10" },
    outline: "#7a5410",
  },
  heart: {
    grid: [".HH.HH.", "HhHHHHH", "HHHHHHH", ".HHHHH.", "..HHH..", "...H..."],
    colors: { H: "#ef5b7b", h: "#ffc2cf" },
    outline: "#6b1f33",
  },
  heartEmpty: {
    grid: [".HH.HH.", "HhHHHHH", "HHHHHHH", ".HHHHH.", "..HHH..", "...H..."],
    colors: { H: "#d9c8b4", h: "#efe4d4" },
    outline: "#5a4a42",
  },
  zzz: {
    grid: ["ZZZZ", "..Z.", ".Z..", "ZZZZ"],
    colors: { Z: "#e9e3f5" },
    outline: "#3a3150",
  },
  bubble: {
    grid: [
      ".WWWWWWWWW.",
      "WWWWWWWWWWW",
      "WWWWWWWWWWW",
      "WWWWWWWWWWW",
      "WWWWWWWWWWW",
      "WWWWWWWWWWW",
      ".WWWWWWWWW.",
      "...WW......",
      "...W.......",
    ],
    colors: { W: "#fffaf0" },
    outline: "#3b2f2a",
  },
  star: {
    grid: ["..Y..", ".YYY.", "YYYYY", ".YYY.", "Y...Y"],
    colors: { Y: "#ffd84d" },
    outline: "#7a5410",
  },
  note: {
    grid: ["..NNN", "..N.N", "..N.N", "NNN.N", "NNN.."],
    colors: { N: "#7a5cd6" },
    outline: "#2a1d4a",
  },
  question: {
    grid: [".QQQ.", "Q...Q", "...QQ", "..QQ.", "..Q..", ".....", "..Q.."],
    colors: { Q: "#3f8fd1" },
    outline: "#14304a",
  },
  exclaim: {
    grid: ["EE", "EE", "EE", "EE", "..", "EE"],
    colors: { E: "#e8913a" },
    outline: "#5a3010",
  },
  anger: {
    grid: [".A...A.", "AAA.AAA", ".A...A.", ".......", ".A...A.", "AAA.AAA", ".A...A."],
    colors: { A: "#e2443e" },
    outline: "#5a1414",
  },
  feather: {
    grid: [
      "..pp...",
      ".pPp...",
      ".pPPp..",
      "..pPpp.",
      "..ppPp.",
      "...pPp.",
      "....pP.",
      ".....p.",
    ],
    colors: { p: "#c77dff", P: "#f2c14e" },
    outline: "#3a1d5a",
  },
  treat: {
    grid: ["..TTT..T", ".TtTTT.TT", "TeTTTtTT.", ".TTtTT.TT", "..TTT..T"],
    colors: { T: "#c98a4b", t: "#e9b97a", e: "#3b2414" },
    outline: "#4a2a12",
  },
  giftbox: {
    grid: [".r...r.", "..r.r..", "LLLrLLL", "BBBrBBB", "BBBrBBB", "BBBrBBB"],
    colors: { r: "#ef5b7b", L: "#2f7fb8", B: "#4aa3df" },
    outline: "#14304a",
  },
  leaf: {
    grid: ["...GG", "..GgG", ".GgG.", "GgG..", "G...."],
    colors: { G: "#5d9b47", g: "#8cc56d" },
    outline: "#1f3a14",
  },
  bell: {
    grid: ["...Y...", "..YYY..", ".YyYYY.", ".YyYYY.", ".YYYYY.", "YYYYYYY", "...K..."],
    colors: { Y: "#f2c14e", y: "#fff3b0", K: "#8a5a1c" },
    outline: "#5a3a08",
  },
  water: {
    grid: ["..B..", ".BBB.", "BwBBB", "BwBBB", "BBBBB", ".BBB."],
    colors: { B: "#4aa3df", w: "#c9eef7" },
    outline: "#14304a",
  },
  clock: {
    grid: [".WWWWW.", "WWWKWWW", "WWWKWWW", "WWWKKWW", "WWWWWWW", ".WWWWW."],
    colors: { W: "#fffaf0", K: "#2a1d1a" },
    outline: "#6b5850",
  },
  tomato: {
    grid: ["..GgG..", ".RRGRR.", "RrRRRRR", "RrRRRRR", "RRRRRRR", ".RRRRR."],
    colors: { R: "#e2443e", r: "#ff8a7a", G: "#5d9b47", g: "#8cc56d" },
    outline: "#5a1414",
  },
  trophy: {
    grid: ["YYYYYYY", "YyYYYYY", ".YyYYY.", "..YYY..", "...Y...", "..YYY..", ".BBBBB."],
    colors: { Y: "#f2c14e", y: "#fff3b0", B: "#8a5a35" },
    outline: "#5a3a08",
  },
  eye: {
    grid: ["..WWW..", ".WWKWW.", "WWKKKWW", ".WWKWW.", "..WWW.."],
    colors: { W: "#fffaf0", K: "#3f8fd1" },
    outline: "#2a1d1a",
  },
  moon: {
    grid: ["..YYY", ".YY..", "YY...", "YY...", "YY...", ".YY..", "..YYY"],
    colors: { Y: "#ffe08a" },
    outline: "#5a4a10",
  },
  butterfly: {
    grid: ["YY.k.YY", "YYYkYYY", "yYYkYYy", ".YYkYY.", ".yY.Yy."],
    colors: { Y: "#f4a340", y: "#fff1c9", k: "#2a1d1a" },
    outline: "#4a2408",
  },
  butterfly2: {
    grid: ["..Y.Y..", ".YYkYY.", ".YYkYY.", "..YkY..", "..y.y.."],
    colors: { Y: "#f4a340", y: "#fff1c9", k: "#2a1d1a" },
    outline: "#4a2408",
  },
} satisfies Record<string, ObjectArt>;

export type ObjectId = keyof typeof OBJECTS;

interface AccessoryArt extends ObjectArt {
  /** Posisi relatif terhadap kiri-atas kepala. */
  dx: number;
  dy: number;
}

const ACC_OUTLINE = "#2a1d1a";

export const ACCESSORY_ART: Record<string, AccessoryArt> = {
  pita: {
    grid: ["RR.RR", "RRrRR", "RR.RR"],
    colors: { R: "#e0405a", r: "#a52a3f" },
    outline: ACC_OUTLINE,
    dx: 5,
    dy: -1,
  },
  "topi-pesta": {
    grid: ["..Y..", "..P..", ".PQP.", ".QPQ.", "PQPQP"],
    colors: { P: "#4aa3df", Q: "#f2c14e", Y: "#ef5b7b" },
    outline: ACC_OUTLINE,
    dx: 2,
    dy: -4,
  },
  "kalung-lonceng": {
    grid: ["CCCCCCC", "...Y...", "..YYY.."],
    colors: { C: "#d9534f", Y: "#f2c14e" },
    outline: ACC_OUTLINE,
    dx: 1,
    dy: 6,
  },
  peci: {
    grid: [".KKKKK.", "KKKKKKK", "KkkkkkK"],
    colors: { K: "#1d1d22", k: "#3a3a46" },
    outline: "#000000",
    dx: 1,
    dy: -1,
  },
  bandana: {
    grid: ["RRRRRRR", ".RwRwR.", "..RRR..", "...R..."],
    colors: { R: "#d9534f", w: "#ffffff" },
    outline: ACC_OUTLINE,
    dx: 1,
    dy: 6,
  },
  "topi-koki": {
    grid: [".WW.WW.", "WWWWWWW", "WWWWWWW", ".WWWWW.", ".wwwww."],
    colors: { W: "#ffffff", w: "#d8d2c6" },
    outline: "#6b5a52",
    dx: 1,
    dy: -4,
  },
  "dasi-kupu": {
    grid: ["KK.KK", "KKkKK", "KK.KK"],
    colors: { K: "#2a2440", k: "#6a5aa0" },
    outline: "#0d0a18",
    dx: 2,
    dy: 6,
  },
  kacamata: {
    grid: ["KKKKKKKKK", ".KgK.KgK."],
    colors: { K: "#141418", g: "#5a6a8a" },
    outline: "#000000",
    dx: 0,
    dy: 3,
  },
  blangkon: {
    grid: [".BBBBBBB.", "BbBbBbBbB", "BBBBBBBBB"],
    colors: { B: "#6b3e1f", b: "#c9973e" },
    outline: "#2a160a",
    dx: 0,
    dy: -1,
  },
  "topi-penyihir": {
    grid: ["....PP...", "...PPP...", "...PPP...", "..PPYPP..", "..PPPPP..", "PPPPPPPPP"],
    colors: { P: "#5b3f9e", Y: "#ffd84d" },
    outline: "#1d1238",
    dx: 0,
    dy: -4,
  },
  bunga: {
    grid: [".RRR.", "RRYRR", ".RRR."],
    colors: { R: "#ef3b5b", Y: "#ffd84d" },
    outline: "#5a1424",
    dx: 6,
    dy: -1,
  },
  "kacamata-bulat": {
    grid: [".K.K.K.K.", ".KKK.KKK."],
    colors: { K: "#7a5410" },
    outline: "#3b2a10",
    dx: 0,
    dy: 3,
  },
  syal: {
    grid: ["GGGGGGGGG", ".gGgGgGg.", "......GG.", "......Gg."],
    colors: { G: "#3f9a5a", g: "#2e7a45" },
    outline: "#123a1d",
    dx: 0,
    dy: 6,
  },
  mahkota: {
    grid: ["Y.YRY.Y", "YYYYYYY", "YyYyYyY"],
    colors: { Y: "#f2c14e", y: "#c98e1a", R: "#e0405a" },
    outline: "#5a3a08",
    dx: 1,
    dy: -2,
  },
};

export function renderObject(id: ObjectId): PixelImage {
  return renderArt(OBJECTS[id]);
}

function renderArt(art: ObjectArt): PixelImage {
  // Satu piksel margin di setiap sisi untuk garis tepi.
  const w = Math.max(...art.grid.map((r) => r.length)) + 2;
  const h = art.grid.length + 2;
  const cells = composeCells([{ name: "body", grid: art.grid, x: 1, y: 1 }], w, h);
  return toImage(cells, (cell) => {
    if (cell.ch === ".") return null;
    if (cell.ch === "o") return art.outline;
    return art.colors[cell.ch] ?? "#ff00ff";
  });
}
