import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/core/data";
import {
  catContribution,
  facilityCost,
  facilityRate,
  fishToNextStar,
  maxAffordable,
  offlineGain,
  prestigeGain,
  productionPerSecond,
  unlockedRarities,
} from "../src/core/economy";
import { formatDuration, formatFish, formatRate } from "../src/core/format";
import { createInitialState, migrateState } from "../src/core/state";
import type { CatState } from "../src/core/types";

const NOW = 1_800_000_000_000;

function cat(partial: Partial<CatState>): CatState {
  return {
    id: "c",
    name: "Tes",
    coat: "oyen",
    trait: "rakus",
    facility: "mangkuk",
    hunger: 1,
    lastPetAt: 0,
    adoptedAt: 0,
    bond: 0,
    accessory: null,
    ...partial,
  };
}

describe("harga fasilitas", () => {
  it("naik 15% setiap pembelian", () => {
    expect(facilityCost("mangkuk", 0)).toBe(15);
    expect(facilityCost("mangkuk", 1)).toBe(Math.ceil(15 * 1.15));
    expect(facilityCost("benang", 10)).toBe(Math.ceil(100 * Math.pow(1.15, 10)));
  });

  it("harga beli banyak sama dengan jumlah harga satuan", () => {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += 100 * Math.pow(1.15, 5 + i);
    expect(facilityCost("benang", 5, 10)).toBe(Math.ceil(sum));
  });

  it("maxAffordable tidak pernah melebihi ikan yang ada", () => {
    for (const fish of [0, 14, 15, 100, 1234, 99_999, 5e7]) {
      for (const owned of [0, 3, 40]) {
        const n = maxAffordable("kardus", owned, fish);
        if (n > 0) expect(facilityCost("kardus", owned, n)).toBeLessThanOrEqual(fish);
        expect(facilityCost("kardus", owned, n + 1)).toBeGreaterThan(fish);
      }
    }
  });
});

describe("produksi", () => {
  it("state awal hanya menghasilkan pendapatan dasar", () => {
    const s = createInitialState(NOW);
    expect(productionPerSecond(s, { online: true, now: NOW })).toBeCloseTo(BALANCE.baseIncome);
  });

  it("kucing menambah produksi fasilitas tempatnya bekerja", () => {
    const s = createInitialState(NOW);
    s.facilities.mangkuk = 10;
    s.cats = [];
    const without = facilityRate(s, "mangkuk", { online: true, now: NOW });
    s.cats = [cat({ trait: "rakus" })]; // biasa 5% + rakus 20%
    const withCat = facilityRate(s, "mangkuk", { online: true, now: NOW });
    expect(without).toBeCloseTo(1.0);
    expect(withCat).toBeCloseTo(1.25);
  });

  it("kucing lapar hanya menyumbang setengah", () => {
    const full = catContribution(cat({ hunger: 1 }), { online: true, now: NOW });
    const hungry = catContribution(cat({ hunger: 0.1 }), { online: true, now: NOW });
    expect(hungry).toBeCloseTo(full / 2);
  });

  it("sifat pemalas: kuat saat offline, tidak pernah negatif saat online", () => {
    const c = cat({ trait: "pemalas" });
    expect(catContribution(c, { online: true, now: NOW })).toBe(0);
    expect(catContribution(c, { online: false, now: NOW })).toBeCloseTo(0.55);
  });

  it("sifat manja aktif 24 jam setelah dielus", () => {
    const c = cat({ trait: "manja", lastPetAt: NOW - 3_600_000 });
    expect(catContribution(c, { online: true, now: NOW })).toBeCloseTo(0.35);
    expect(catContribution(c, { online: true, now: NOW + 86_400_000 })).toBeCloseTo(0.05);
  });

  it("slot fasilitas dibatasi", () => {
    const s = createInitialState(NOW);
    s.facilities.mangkuk = 1;
    s.cats = Array.from({ length: 5 }, (_, i) => cat({ id: `c${i}`, adoptedAt: i, trait: "rakus" }));
    const rate = facilityRate(s, "mangkuk", { online: true, now: NOW });
    expect(rate).toBeCloseTo(0.1 * (1 + 0.25 * BALANCE.slotsPerFacility));
  });

  it("Bintang menambah 2% per bintang", () => {
    const s = createInitialState(NOW);
    s.stars = 10;
    expect(productionPerSecond(s, { online: true, now: NOW })).toBeCloseTo(BALANCE.baseIncome * 1.2);
  });
});

describe("offline dan prestige", () => {
  it("offline dibatasi 8 jam pada setengah laju", () => {
    const s = createInitialState(NOW);
    s.cats = [];
    const gain = offlineGain(s, 24 * 3600, NOW);
    expect(gain.seconds).toBe(8 * 3600);
    expect(gain.fish).toBeCloseTo(BALANCE.baseIncome * 0.5 * 8 * 3600);
  });

  it("upgrade kasur memperpanjang batas offline", () => {
    const s = createInitialState(NOW);
    s.upgrades = ["kasur-1"];
    expect(offlineGain(s, 24 * 3600, NOW).seconds).toBe(12 * 3600);
  });

  it("rumus Bintang = akar(total / 1 juta)", () => {
    expect(prestigeGain(999_999)).toBe(0);
    expect(prestigeGain(1_000_000)).toBe(1);
    expect(prestigeGain(4_000_000)).toBe(2);
    expect(fishToNextStar(1_000_000)).toBe(3_000_000);
  });

  it("kelangkaan terbuka mengikuti fasilitas", () => {
    const s = createInitialState(NOW);
    expect(unlockedRarities(s)).toEqual(["biasa"]);
    s.facilities.akuarium = 1;
    expect(unlockedRarities(s)).toEqual(["biasa", "epik"]);
  });
});

describe("migrasi simpanan", () => {
  it("menolak data bukan objek", () => {
    expect(migrateState("rusak", NOW)).toBeNull();
    expect(migrateState(null, NOW)).toBeNull();
  });

  it("memperbaiki field yang rusak tanpa crash", () => {
    const s = migrateState(
      { fish: "banyak", facilities: { mangkuk: 3, rak: -2 }, cats: [{ coat: "tidak-ada" }, { coat: "siam", trait: "x" }], upgrades: ["mangkuk-1", "palsu"], lastTick: NOW + 10_000 },
      NOW,
    );
    expect(s).not.toBeNull();
    expect(s!.fish).toBe(BALANCE.startingFish);
    expect(s!.facilities.mangkuk).toBe(3);
    expect(s!.facilities.rak).toBe(0);
    expect(s!.cats).toHaveLength(1);
    expect(s!.cats[0].trait).toBe("aktif");
    expect(s!.upgrades).toEqual(["mangkuk-1"]);
    expect(s!.lastTick).toBe(NOW);
    expect(s!.discovered).toContain("siam");
  });
});

describe("format angka", () => {
  it("memakai gaya Indonesia", () => {
    expect(formatFish(0.25)).toBe("0,2");
    expect(formatFish(1234)).toBe("1.234");
    expect(formatFish(12_345_678)).toBe("12,34 jt");
    expect(formatFish(3.456e9)).toBe("3,45 M");
    expect(formatRate(1.25)).toBe("1,3/dtk");
    expect(formatDuration(3 * 3600 + 12 * 60)).toBe("3 jam 12 menit");
  });
});
