import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/core/data";
import { Game, type GameEvent } from "../src/core/game";
import { createInitialState } from "../src/core/state";

const NOW = 1_800_000_000_000;

/** RNG deterministik untuk tes. */
function seeded(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function newGame(): { game: Game; events: GameEvent[] } {
  const game = new Game(createInitialState(NOW), seeded());
  const events: GameEvent[] = [];
  game.on((e) => events.push(e));
  return { game, events };
}

describe("alur dasar", () => {
  it("pembelian pertama bisa langsung dilakukan", () => {
    const { game } = newGame();
    expect(game.buyFacility("mangkuk")).toBe(true);
    expect(game.state.facilities.mangkuk).toBe(1);
    expect(game.state.fish).toBe(0);
    expect(game.buyFacility("mangkuk")).toBe(false);
  });

  it("kucing awal otomatis bekerja di fasilitas pertama", () => {
    const { game } = newGame();
    game.buyFacility("mangkuk");
    expect(game.state.cats[0].facility).toBe("mangkuk");
  });

  it("produksi berjalan sesuai waktu", () => {
    const { game } = newGame();
    game.state.fish = 0;
    game.tick(NOW + 10_000);
    expect(game.state.fish).toBeCloseTo(BALANCE.baseIncome * 10, 5);
  });

  it("jeda panjang dihitung sebagai offline dan mengirim event", () => {
    const { game, events } = newGame();
    game.state.fish = 0;
    game.tick(NOW + 3_600_000);
    const offline = events.find((e) => e.type === "offline");
    expect(offline).toBeDefined();
    expect(game.state.fish).toBeCloseTo(BALANCE.baseIncome * 0.5 * 3600, 3);
  });

  it("rasa lapar berkurang dan bisa dipulihkan", () => {
    const { game } = newGame();
    game.tick(NOW + 25_000);
    for (let t = 1; t <= 4 * 60; t++) game.tick(NOW + 25_000 + t * 25_000);
    expect(game.state.cats[0].hunger).toBeLessThan(1);
    game.state.fish = 1_000;
    expect(game.feedAll(NOW + 7_000_000)).toBe(true);
    expect(game.state.cats[0].hunger).toBe(1);
  });
});

describe("tamu dan adopsi", () => {
  it("tamu datang, diberi makan 3 kali, lalu bisa diadopsi", () => {
    const { game, events } = newGame();
    const arrival = game.state.nextVisitAt + 1;
    // Maju bertahap agar tidak dihitung offline.
    for (let t = NOW; t <= arrival; t += 20_000) game.tick(t);
    game.tick(arrival);
    expect(game.state.visitor).not.toBeNull();
    expect(events.some((e) => e.type === "visitorArrived")).toBe(true);

    expect(game.adoptVisitor("Mochi", arrival)).toBeNull();
    game.feedVisitor(arrival);
    game.feedVisitor(arrival);
    game.feedVisitor(arrival);
    expect(events.some((e) => e.type === "visitorReady")).toBe(true);

    const cat = game.adoptVisitor("Mochi", arrival);
    expect(cat?.name).toBe("Mochi");
    expect(game.state.cats).toHaveLength(2);
    expect(game.state.visitor).toBeNull();
  });

  it("tamu yang tidak diberi makan akhirnya pergi", () => {
    const { game, events } = newGame();
    game.state.fish = 1e6;
    expect(game.callVisitor(NOW)).toBe(true);
    const leaveAt = game.state.visitor!.leavesAt;
    for (let t = NOW; t <= leaveAt + 20_000; t += 20_000) game.tick(t);
    expect(game.state.visitor).toBeNull();
    expect(events.some((e) => e.type === "visitorLeft")).toBe(true);
  });

  it("slot fasilitas tidak bisa melebihi batas", () => {
    const { game } = newGame();
    game.state.facilities.mangkuk = 1;
    game.state.cats = Array.from({ length: 4 }, (_, i) => ({
      ...game.state.cats[0],
      id: `c${i}`,
      facility: null,
    }));
    expect(game.assignCat("c0", "mangkuk")).toBe(true);
    expect(game.assignCat("c1", "mangkuk")).toBe(true);
    expect(game.assignCat("c2", "mangkuk")).toBe(true);
    expect(game.assignCat("c3", "mangkuk")).toBe(false);
    expect(game.assignCat("c3", "rak")).toBe(false);
  });
});

describe("upgrade dan prestige", () => {
  it("upgrade muncul setelah syarat terpenuhi", () => {
    const { game } = newGame();
    expect(game.availableUpgrades().some((u) => u.id === "mangkuk-1")).toBe(false);
    game.buyFacility("mangkuk");
    expect(game.availableUpgrades().some((u) => u.id === "mangkuk-1")).toBe(true);
    game.state.fish = 150;
    expect(game.buyUpgrade("mangkuk-1")).toBe(true);
    expect(game.buyUpgrade("mangkuk-1")).toBe(false);
  });

  it("Pindah Rumah mereset fasilitas tetapi menyimpan kucing dan Bintang", () => {
    const { game } = newGame();
    game.state.totalFishRun = 9_000_000;
    game.state.facilities.kardus = 12;
    game.state.upgrades = ["kardus-1", "kasur-1"];
    const gained = game.prestige(NOW);
    expect(gained).toBe(3);
    expect(game.state.stars).toBe(3);
    expect(game.state.facilities.kardus).toBe(0);
    expect(game.state.upgrades).toEqual(["kasur-1"]);
    expect(game.state.cats).toHaveLength(1);
    expect(game.prestige(NOW)).toBe(0);
  });

  it("ikan berkilau memberi hadiah minimal 10", () => {
    const { game } = newGame();
    game.state.sparkle = { x: 0.5, appearedAt: NOW, expiresAt: NOW + 10_000 };
    const before = game.state.fish;
    const reward = game.catchSparkle(NOW);
    expect(reward).toBeGreaterThanOrEqual(10);
    expect(game.state.fish).toBeCloseTo(before + reward);
  });
});

describe("pemuatan simpanan", () => {
  it("memakai cadangan bila simpanan utama rusak", async () => {
    const { loadState, serialize } = await import("../src/core/save");
    const good = createInitialState(NOW);
    good.fish = 4242;
    const backend = {
      load: async () => "{rusak",
      save: async () => {},
      loadBackup: async () => serialize(good),
    };
    const { state, fresh } = await loadState(backend, NOW);
    expect(fresh).toBe(false);
    expect(state.fish).toBe(4242);
  });

  it("memulai baru bila tidak ada simpanan", async () => {
    const { loadState } = await import("../src/core/save");
    const { fresh } = await loadState({ load: async () => null, save: async () => {} }, NOW);
    expect(fresh).toBe(true);
  });
});

describe("tamu yang siap diadopsi", () => {
  it("tidak hilang setelah jeda panjang", () => {
    const { game } = newGame();
    game.state.fish = 1e6;
    game.callVisitor(NOW);
    for (let i = 0; i < 3; i++) game.feedVisitor(NOW);
    game.tick(NOW + 3_600_000);
    expect(game.state.visitor?.fed).toBe(3);
  });

  it("dipulihkan dari simpanan", async () => {
    const { migrateState } = await import("../src/core/state");
    const { game } = newGame();
    game.state.fish = 1e6;
    game.callVisitor(NOW);
    for (let i = 0; i < 3; i++) game.feedVisitor(NOW);
    const restored = migrateState(JSON.parse(JSON.stringify(game.state)), NOW + 5_000);
    expect(restored?.visitor?.fed).toBe(3);
    expect(restored!.visitor!.leavesAt).toBeGreaterThanOrEqual(NOW + 65_000);
  });

  it("tamu yang belum siap tidak dipulihkan", async () => {
    const { migrateState } = await import("../src/core/state");
    const { game } = newGame();
    game.state.fish = 1e6;
    game.callVisitor(NOW);
    game.feedVisitor(NOW);
    expect(migrateState(JSON.parse(JSON.stringify(game.state)), NOW)?.visitor).toBeNull();
  });
});
