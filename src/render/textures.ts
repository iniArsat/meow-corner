// Mengubah PixelImage menjadi tekstur PixiJS (untuk kanvas) dan data URL (untuk HTML).

import { Texture } from "pixi.js";
import { COAT_BY_ID } from "../core/data";
import {
  ACCESSORY_ART,
  renderCat,
  renderObject,
  renderSilhouette,
  type CatPose,
  type ObjectId,
  type PixelImage,
} from "./pixelart";

function toCanvas(img: PixelImage, scale = 1): HTMLCanvasElement {
  const base = document.createElement("canvas");
  base.width = img.w;
  base.height = img.h;
  const ctx = base.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
  if (scale === 1) return base;
  const big = document.createElement("canvas");
  big.width = img.w * scale;
  big.height = img.h * scale;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(base, 0, 0, big.width, big.height);
  return big;
}

const textureCache = new Map<string, Texture>();
const urlCache = new Map<string, string>();

function cachedTexture(key: string, make: () => PixelImage): Texture {
  let tex = textureCache.get(key);
  if (!tex) {
    tex = Texture.from(toCanvas(make()));
    tex.source.scaleMode = "nearest";
    textureCache.set(key, tex);
  }
  return tex;
}

export function catTexture(coatId: string, pose: CatPose, accessory: string | null = null): Texture {
  const acc = accessory && ACCESSORY_ART[accessory] ? accessory : null;
  return cachedTexture(`cat:${coatId}:${pose}:${acc ?? ""}`, () => renderCat(pose, COAT_BY_ID[coatId], acc));
}

export function objectTexture(id: ObjectId): Texture {
  return cachedTexture(`obj:${id}`, () => renderObject(id));
}

/** Bentuk sederhana bersama (bayangan, kepulan debu, piksel) agar tidak menggambar Graphics tiap frame. */
const SHAPES = {
  shadow: [".XXXXXXXXXXXXXX.", "XXXXXXXXXXXXXXXX", "XXXXXXXXXXXXXXXX", ".XXXXXXXXXXXXXX."],
  puff: [".XX.", "XXXX", "XXXX", ".XX."],
  pixel: ["X"],
} as const;

export type ShapeId = keyof typeof SHAPES;

export function shapeTexture(id: ShapeId): Texture {
  return cachedTexture(`shape:${id}`, () => {
    const grid = SHAPES[id];
    const w = grid[0].length;
    const h = grid.length;
    const data = new Uint8ClampedArray(w * h * 4);
    grid.forEach((row, y) => {
      for (let x = 0; x < w; x++) if (row[x] === "X") data.set([255, 255, 255, 255], (y * w + x) * 4);
    });
    return { w, h, data };
  });
}

function cachedUrl(key: string, make: () => PixelImage, scale: number): string {
  const k = `${key}@${scale}`;
  let url = urlCache.get(k);
  if (!url) {
    url = toCanvas(make(), scale).toDataURL("image/png");
    urlCache.set(k, url);
  }
  return url;
}

export function catImageUrl(coatId: string, pose: CatPose = "sit", scale = 3, accessory: string | null = null): string {
  const acc = accessory && ACCESSORY_ART[accessory] ? accessory : null;
  return cachedUrl(`cat:${coatId}:${pose}:${acc ?? ""}`, () => renderCat(pose, COAT_BY_ID[coatId], acc), scale);
}

export function silhouetteUrl(scale = 3): string {
  return cachedUrl("silhouette", () => renderSilhouette("sit"), scale);
}

export function objectImageUrl(id: ObjectId, scale = 3): string {
  return cachedUrl(`obj:${id}`, () => renderObject(id), scale);
}
