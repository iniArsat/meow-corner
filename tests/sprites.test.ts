import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COATS } from "../src/core/data";
import { CAT_H, CAT_POSE_NAMES, CAT_W, OBJECTS, renderCat, renderObject, type ObjectId, type PixelImage } from "../src/render/pixelart";

function hasMagenta(img: PixelImage): boolean {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] === 255 && img.data[i + 1] === 0 && img.data[i + 2] === 255 && img.data[i + 3] > 0) return true;
  }
  return false;
}

describe("sprite", () => {
  it("semua pose dan bulu kucing ter-render dengan ukuran tetap", () => {
    for (const coat of COATS) {
      for (const pose of CAT_POSE_NAMES) {
        const img = renderCat(pose, coat);
        expect(img.w).toBe(CAT_W);
        expect(img.h).toBe(CAT_H);
        expect(hasMagenta(img)).toBe(false);
      }
    }
  });

  it("semua benda memakai warna yang terdefinisi", () => {
    for (const id of Object.keys(OBJECTS) as ObjectId[]) {
      expect(hasMagenta(renderObject(id)), id).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Pratinjau opsional: PREVIEW=path npx vitest run tests/sprites.test.ts

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function png(img: PixelImage): Buffer {
  const chunk = (type: string, data: Uint8Array) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), Buffer.from(data)]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    Buffer.from(img.data.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ]);
}

function sheet(images: PixelImage[], cols: number, scale: number, gap = 2, bg = [206, 226, 236, 255]): PixelImage {
  const cw = Math.max(...images.map((i) => i.w)) + gap;
  const ch = Math.max(...images.map((i) => i.h)) + gap;
  const rows = Math.ceil(images.length / cols);
  const w = cols * cw * scale;
  const h = rows * ch * scale;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(bg, i * 4);
  images.forEach((img, n) => {
    const ox = (n % cols) * cw;
    const oy = Math.floor(n / cols) * ch + (ch - gap - img.h);
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const si = (y * img.w + x) * 4;
        if (img.data[si + 3] === 0) continue;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const di = (((oy + y) * scale + sy) * w + (ox + x) * scale + sx) * 4;
            data.set(img.data.subarray(si, si + 4), di);
          }
      }
  });
  return { w, h, data };
}

const previewDir = process.env.PREVIEW;
if (previewDir) {
  it("tulis pratinjau", () => {
    const poses = COATS.slice(0, 1).flatMap((c) => CAT_POSE_NAMES.map((p) => renderCat(p, c)));
    writeFileSync(`${previewDir}/poses.png`, png(sheet(poses, 5, 8)));
    const coats = COATS.map((c) => renderCat("stand", c));
    writeFileSync(`${previewDir}/coats.png`, png(sheet(coats, 6, 6)));
    const sits = COATS.map((c) => renderCat("sit", c));
    writeFileSync(`${previewDir}/coats-sit.png`, png(sheet(sits, 6, 6)));
    const objects = (Object.keys(OBJECTS) as ObjectId[]).map((id) => renderObject(id));
    writeFileSync(`${previewDir}/objects.png`, png(sheet(objects, 6, 6)));
    // Sprite tunggal tanpa latar, dipakai sebagai bahan ikon aplikasi.
    writeFileSync(`${previewDir}/icon-cat.png`, png(sheet([renderCat("sit", COATS[0])], 1, 1, 0, [0, 0, 0, 0])));
  });
}
