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

const BODY: Grid = [
  ".bbbbbbbbbbb.",
  "bbbbbbbbbbbbc",
  "bbbbbbbbbbbcc",
  "bbbbbbbbbbbcc",
  ".bbbbbbbbbbb.",
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

const LEG: Grid = ["ll", "ll", "ll"];
const LEG_SHORT: Grid = ["ll", "ll"];
const PAW: Grid = ["ll"];

const TAIL_UP: Grid = [".t", "t.", "t.", "t.", ".t", ".t"];
const TAIL_UP_2: Grid = ["t.", "t.", "t.", "t.", ".t", ".t"];
const TAIL_SIT: Grid = ["....t", "tttt."];
const TAIL_LOAF: Grid = ["tttttttt"];

interface Pose {
  parts: Part[];
}

function cat(parts: Part[]): Pose {
  return { parts };
}

/** Pose kucing. Koordinat di kanvas 24×17, kaki menapak di baris 16 (garis tepi). */
export const CAT_POSES = {
  stand: cat([
    { name: "tail", grid: TAIL_UP, x: 3, y: 3 },
    { name: "body", grid: BODY, x: 4, y: 8, ring: true },
    { name: "leg", grid: LEG, x: 5, y: 13 },
    { name: "leg", grid: LEG, x: 8, y: 13 },
    { name: "leg", grid: LEG, x: 12, y: 13 },
    { name: "leg", grid: LEG, x: 15, y: 13 },
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
    { name: "leg", grid: LEG, x: 5, y: 13 },
    { name: "leg", grid: LEG, x: 8, y: 13 },
    { name: "leg", grid: LEG, x: 12, y: 13 },
    { name: "leg", grid: LEG, x: 15, y: 13 },
    { name: "head", grid: HEAD_CLOSED, x: 13, y: 2, ring: true },
  ]),
  sit: cat([
    { name: "tail", grid: TAIL_SIT, x: 2, y: 14 },
    { name: "body", grid: BODY_SIT, x: 7, y: 9, ring: true },
    { name: "leg", grid: PAW, x: 13, y: 15 },
    { name: "leg", grid: PAW, x: 15, y: 15 },
    { name: "head", grid: HEAD, x: 10, y: 3, ring: true },
  ]),
  sitBlink: cat([
    { name: "tail", grid: TAIL_SIT, x: 2, y: 14 },
    { name: "body", grid: BODY_SIT, x: 7, y: 9, ring: true },
    { name: "leg", grid: PAW, x: 13, y: 15 },
    { name: "leg", grid: PAW, x: 15, y: 15 },
    { name: "head", grid: HEAD_CLOSED, x: 10, y: 3, ring: true },
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
    { name: "leg", grid: LEG, x: 5, y: 13 },
    { name: "leg", grid: LEG, x: 8, y: 13 },
    { name: "leg", grid: LEG, x: 12, y: 13 },
    { name: "leg", grid: LEG, x: 15, y: 13 },
    { name: "head", grid: HEAD_CLOSED, x: 14, y: 6, ring: true },
  ]),
  eat2: cat([
    { name: "tail", grid: TAIL_UP_2, x: 3, y: 3 },
    { name: "body", grid: BODY, x: 4, y: 8, ring: true },
    { name: "leg", grid: LEG, x: 5, y: 13 },
    { name: "leg", grid: LEG, x: 8, y: 13 },
    { name: "leg", grid: LEG, x: 12, y: 13 },
    { name: "leg", grid: LEG, x: 15, y: 13 },
    { name: "head", grid: HEAD_CLOSED, x: 14, y: 7, ring: true },
  ]),
} as const;

export type CatPose = keyof typeof CAT_POSES;
export const CAT_POSE_NAMES = Object.keys(CAT_POSES) as CatPose[];

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

export function renderCat(pose: CatPose, coat: CoatDef): PixelImage {
  const cells = composeCells([...CAT_POSES[pose].parts], CAT_W, CAT_H);
  return toImage(cells, (cell) => cellColor(cell, coat));
}

/** Siluet untuk Kucingpedia (bulu yang belum ditemukan). */
export function renderSilhouette(pose: CatPose, color = "#6d5f5a"): PixelImage {
  const cells = composeCells([...CAT_POSES[pose].parts], CAT_W, CAT_H);
  return toImage(cells, (cell) => (cell.ch === "." ? null : cell.ch === "o" ? "#3b302c" : color));
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
} satisfies Record<string, ObjectArt>;

export type ObjectId = keyof typeof OBJECTS;

export function renderObject(id: ObjectId): PixelImage {
  const art: ObjectArt = OBJECTS[id];
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
