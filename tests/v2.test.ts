import { describe, expect, it } from "vitest";
import { ACCESSORIES, BALANCE } from "../src/core/data";
import { catContribution, hearts } from "../src/core/economy";
import { Game, type GameEvent } from "../src/core/game";
import { createInitialState, migrateState } from "../src/core/state";

const NOW = 1_800_000_000_000;

function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function newGame(rand = seeded()) {
  const game = new Game(createInitialState(NOW), rand);
  const events: GameEvent[] = [];
  game.on((e) => events.push(e));
  return { game, events, oyen: game.state.cats[0] };
}

describe("ikatan", () => {
  it("elusan menambah ikatan dengan jeda", () => {
    const { game, oyen } = newGame();
    game.petCat(oyen.id, NOW);
    game.petCat(oyen.id, NOW + 500);
    expect(oyen.bond).toBe(BALANCE.bondPerPet);
    game.petCat(oyen.id, NOW + BALANCE.petBondCooldownMs);
    expect(oyen.bond).toBe(2 * BALANCE.bondPerPet);
  });

  it("dengkur, camilan, dan mainan menaikkan hati dan memberi event naik level", () => {
    const { game, events, oyen } = newGame();
    game.purr(oyen.id, NOW);
    game.giveTreat(oyen.id, NOW);
    game.giveTreat(oyen.id, NOW);
    expect(oyen.bond).toBe(BALANCE.bondPerPurr + 2 * BALANCE.bondPerTreat);
    expect(hearts(oyen)).toBe(1);
    expect(events.some((e) => e.type === "bond" && e.levelUp)).toBe(true);
  });

  it("dengkuran memberi ikatan dengan jeda per kucing", () => {
    const { game, oyen } = newGame();
    expect(game.purr(oyen.id, NOW)).toBe(true);
    expect(game.purr(oyen.id, NOW + 1000)).toBe(false);
    expect(oyen.bond).toBe(BALANCE.bondPerPurr);
    expect(game.purr(oyen.id, NOW + BALANCE.purrCooldownMs)).toBe(true);
    expect(oyen.bond).toBe(2 * BALANCE.bondPerPurr);
  });

  it("ikatan dibatasi 100 dan memberi bonus produksi per hati", () => {
    const { game, oyen } = newGame();
    oyen.bond = 99;
    game.purr(oyen.id, NOW);
    expect(oyen.bond).toBe(100);
    expect(hearts(oyen)).toBe(5);
    const withBond = catContribution(oyen, { online: true, now: NOW });
    oyen.bond = 0;
    const without = catContribution(oyen, { online: true, now: NOW });
    expect(withBond - without).toBeCloseTo(5 * BALANCE.heartBonus);
  });
});

describe("camilan", () => {
  it("dimulai dengan 3, berkurang saat diberikan, bisa dibeli", () => {
    const { game, oyen } = newGame();
    expect(game.state.inventory.treats).toBe(BALANCE.startingTreats);
    for (let i = 0; i < 3; i++) expect(game.giveTreat(oyen.id, NOW)).toBe(true);
    expect(game.giveTreat(oyen.id, NOW)).toBe(false);
    game.state.fish = 1000;
    expect(game.buyTreats(5, NOW)).toBe(true);
    expect(game.state.inventory.treats).toBe(5);
    expect(game.state.fish).toBe(1000 - 5 * game.treatPrice(NOW));
  });

  it("camilan mengurangi rasa lapar", () => {
    const { game, oyen } = newGame();
    oyen.hunger = 0.1;
    game.giveTreat(oyen.id, NOW);
    expect(oyen.hunger).toBeCloseTo(0.45);
  });
});

describe("mainan bulu", () => {
  it("memberi hadiah dengan jeda per kucing", () => {
    const { game, oyen } = newGame();
    const fish = game.state.fish;
    const r1 = game.toyCatch(oyen.id, NOW);
    expect(r1).toBeGreaterThan(0);
    expect(game.toyCatch(oyen.id, NOW + 1000)).toBe(0);
    expect(game.toyCatch(oyen.id, NOW + BALANCE.toyCatchCooldownMs)).toBeGreaterThan(0);
    expect(game.state.fish).toBeGreaterThan(fish);
    expect(oyen.bond).toBe(2 * BALANCE.bondPerToyCatch);
  });
});

describe("aksesori", () => {
  it("bisa dibeli sekali, hadiah-saja tidak dijual", () => {
    const { game } = newGame();
    game.state.fish = 1e6;
    expect(game.buyAccessory("pita")).toBe(true);
    expect(game.buyAccessory("pita")).toBe(false);
    expect(game.buyAccessory("mahkota")).toBe(false);
    expect(game.state.inventory.accessories).toEqual(["pita"]);
  });

  it("satu aksesori hanya dipakai satu kucing", () => {
    const { game, oyen } = newGame();
    game.state.fish = 1e6;
    game.state.cats.push({ ...oyen, id: "cat-2", name: "Mochi", accessory: null });
    game.buyAccessory("peci");
    expect(game.equipAccessory("cat-1", "peci")).toBe(true);
    expect(game.equipAccessory("cat-2", "peci")).toBe(true);
    expect(game.state.cats[0].accessory).toBeNull();
    expect(game.state.cats[1].accessory).toBe("peci");
    expect(game.equipAccessory("cat-1", "kacamata")).toBe(false);
  });
});

describe("hadiah dari kucing", () => {
  it("kucing dengan 3 hati akhirnya membawa hadiah saat online", () => {
    const { game, events, oyen } = newGame(seeded(3));
    oyen.bond = 60;
    for (let t = 1; t <= 600 && game.state.gifts.length === 0; t++) game.tick(NOW + t * 10_000);
    expect(game.state.gifts.length).toBe(1);
    expect(events.some((e) => e.type === "giftDropped")).toBe(true);
  });

  it("kucing dengan ikatan rendah tidak membawa hadiah", () => {
    const { game } = newGame(seeded(3));
    for (let t = 1; t <= 600; t++) game.tick(NOW + t * 10_000);
    expect(game.state.gifts.length).toBe(0);
  });

  it("mengambil hadiah memberi isinya", () => {
    const { game, oyen } = newGame();
    const fishGift = game.dropGift(oyen, NOW, { kind: "fish", seconds: 120 });
    const before = game.state.fish;
    expect(game.collectGift(fishGift.id, NOW)?.title).toContain("Oyen");
    expect(game.state.fish).toBeGreaterThanOrEqual(before + 25);

    const accGift = game.dropGift(oyen, NOW, { kind: "accessory", id: "mahkota" });
    game.collectGift(accGift.id, NOW);
    expect(game.state.inventory.accessories).toContain("mahkota");

    const treatGift = game.dropGift(oyen, NOW, { kind: "treats", amount: 2 });
    game.collectGift(treatGift.id, NOW);
    expect(game.state.inventory.treats).toBe(BALANCE.startingTreats + 2);
    expect(game.collectGift(treatGift.id, NOW)).toBeNull();
    expect(game.state.stats.giftsReceived).toBe(3);
  });

  it("hadiah aksesori hanya memilih yang khusus hadiah dan belum dimiliki", () => {
    const giftOnly = ACCESSORIES.filter((a) => a.price === null).map((a) => a.id);
    const { game, oyen } = newGame(() => 0.99);
    const g = game.dropGift(oyen, NOW);
    expect(g.item.kind).toBe("accessory");
    if (g.item.kind === "accessory") expect(giftOnly).toContain(g.item.id);
    game.state.inventory.accessories = [...giftOnly];
    game.state.gifts = [];
    expect(game.dropGift(oyen, NOW).item.kind).toBe("fish");
  });
});

describe("migrasi v1 ke v2", () => {
  it("simpanan v1 mendapat nilai awal ikatan, camilan, dan hadiah", () => {
    const v1 = {
      version: 1,
      fish: 500,
      cats: [{ id: "cat-1", name: "Oyen", coat: "oyen", trait: "aktif", facility: null, hunger: 1, lastPetAt: 0, adoptedAt: 1 }],
      facilities: { mangkuk: 2 },
    };
    const s = migrateState(v1, NOW)!;
    expect(s.version).toBe(2);
    expect(s.cats[0].bond).toBe(0);
    expect(s.cats[0].accessory).toBeNull();
    expect(s.inventory.treats).toBe(BALANCE.startingTreats);
    expect(s.gifts).toEqual([]);
  });

  it("aksesori dipakai dua kucing atau tak dimiliki diperbaiki", () => {
    const s = migrateState(
      {
        cats: [
          { id: "a", coat: "oyen", accessory: "peci" },
          { id: "b", coat: "siam", accessory: "peci" },
          { id: "c", coat: "hitam", accessory: "palsu" },
        ],
        inventory: { treats: 2, accessories: [] },
        gifts: [{ id: "g1", catId: "a", item: { kind: "accessory", id: "mahkota" }, x: 0.4 }, { item: { kind: "aneh" } }],
      },
      NOW,
    )!;
    expect(s.cats.map((c) => c.accessory)).toEqual(["peci", null, null]);
    expect(s.inventory.accessories).toEqual(["peci"]);
    expect(s.gifts).toHaveLength(1);
  });
});
