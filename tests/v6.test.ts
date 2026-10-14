import { describe, expect, it } from "vitest";
import { Conversation, chatterLine, fill, type ChatContext, type ChatStep } from "../src/core/dialogue";
import { STORIES } from "../src/core/dialogueLines";
import { Game } from "../src/core/game";
import { SAVE_VERSION, cleanPlayerName, createInitialState, migrateState } from "../src/core/state";
import type { TraitId, WeatherKind } from "../src/core/types";
import { TRAIT_IDS } from "../src/core/data";
import type { DayPhase } from "../src/core/weather";

/** Pembangkit acak tetap agar tes bisa diulang. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function ctx(over: Partial<ChatContext> = {}, seed = 1): ChatContext {
  return {
    name: "Oyen",
    trait: "aktif",
    hearts: 2,
    hungry: false,
    mood: "normal",
    facility: null,
    accessory: null,
    coatName: "Oyen",
    player: "Arya",
    askedName: true,
    phase: "siang",
    clock: "13.05",
    hour: 13,
    weather: { enabled: true, kind: "clear", temp: 30, source: "live", place: "Jakarta", night: false },
    others: ["Mochi", "Kopi"],
    focus: { phase: "idle", minutesLeft: 0, focusMinutes: 25 },
    todos: { open: 2, top: "Kirim laporan" },
    reminder: { text: "Meeting tim", clock: "17.00", day: "hari ini" },
    typing: { enabled: true, today: 1234, busy: false },
    treats: 3,
    canFeed: true,
    rand: seeded(seed),
    ...over,
  };
}

const PHASES: DayPhase[] = ["dini", "fajar", "pagi", "siang", "sore", "senja", "malam"];
const KINDS: WeatherKind[] = ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "storm", "snow"];

function checkStep(step: ChatStep): void {
  for (const line of step.lines) {
    expect(typeof line).toBe("string");
    expect(line.length).toBeGreaterThan(0);
    // Semua penanda sudah terisi.
    expect(line).not.toMatch(/\{\w+\}/);
    expect(line).not.toContain("undefined");
    expect(line).not.toContain("null");
  }
  for (const choice of step.choices) {
    expect(choice.label.length).toBeGreaterThan(0);
    expect(choice.label).not.toMatch(/\{\w+\}/);
  }
  if (!step.end && !step.input) expect(step.choices.length).toBeGreaterThan(0);
}

describe("obrolan kucing", () => {
  it("setiap jalur obrolan menghasilkan kalimat yang utuh dan selalu berakhir", () => {
    let conversations = 0;
    let seed = 1;
    for (const trait of TRAIT_IDS as readonly TraitId[]) {
      for (let hearts = 0; hearts <= 5; hearts++) {
        for (const mood of ["normal", "sleepy", "sulk"] as const) {
          const phase = PHASES[seed % PHASES.length];
          const kind = KINDS[seed % KINDS.length];
          const c = ctx({
            trait,
            hearts,
            mood,
            phase,
            hour: phase === "malam" ? 23 : 12,
            hungry: seed % 3 === 0,
            treats: seed % 4,
            canFeed: seed % 2 === 0,
            askedName: seed % 5 !== 0,
            player: seed % 7 === 0 ? "" : "Arya",
            accessory: seed % 2 ? "Pita merah" : null,
            facility: seed % 3 === 1 ? "rak" : null,
            others: seed % 4 === 0 ? [] : ["Mochi"],
            reminder: seed % 3 === 0 ? null : { text: "Meeting", clock: "17.00", day: "besok" },
            todos: seed % 2 ? { open: 0, top: null } : { open: 3, top: "Cuci piring" },
            focus: seed % 5 === 0 ? { phase: "focus", minutesLeft: 12.4, focusMinutes: 25 } : { phase: "idle", minutesLeft: 0, focusMinutes: 25 },
            typing: { enabled: seed % 6 !== 0, today: seed * 37, busy: seed % 4 === 0 },
            weather: {
              enabled: seed % 9 !== 0,
              kind,
              temp: seed % 3 === 0 ? null : 15 + (seed % 20),
              source: seed % 8 === 0 ? "none" : seed % 3 === 0 ? "manual" : "live",
              place: seed % 8 === 0 ? null : "Bandung",
              night: phase === "malam" || phase === "dini",
            },
            rand: seeded(seed * 7919),
          });
          seed++;
          const rand = seeded(seed * 104729);
          const conv = new Conversation(() => c, { nextStory: (n) => seed % n, setName: (n) => cleanPlayerName(n), skipName: () => undefined });
          let step = conv.open(null);
          checkStep(step);
          let guard = 0;
          while (!step.end && guard++ < 40) {
            if (step.input) {
              step = rand() < 0.5 ? conv.submitName("Budi") : conv.choose(step.input.skipId);
            } else {
              // Kadang pilih "Dah dulu", lebih sering topik lain.
              const options = step.choices.filter((ch) => ch.kind !== "bye" || rand() < 0.15);
              const pick = options[Math.floor(rand() * options.length)] ?? step.choices[0];
              step = conv.choose(pick.id);
            }
            checkStep(step);
          }
          expect(step.end).toBe(true);
          conversations++;
        }
      }
    }
    expect(conversations).toBe(5 * 6 * 3);
  });

  it("ajakan dari kucing membuka topik yang sesuai", () => {
    for (const invite of ["hungry", "typing", "rain", "night", "morning", "story"] as const) {
      const conv = new Conversation(() => ctx({ hungry: true }), { nextStory: () => 0, setName: (n) => n, skipName: () => undefined });
      const step = conv.open(invite);
      checkStep(step);
    }
    const hungry = new Conversation(() => ctx({ hungry: true, treats: 2 }), { nextStory: () => 0, setName: (n) => n, skipName: () => undefined }).open("hungry");
    expect(hungry.choices.some((ch) => ch.id === "camilan")).toBe(true);
  });

  it("kucing menanyakan nama sekali, lalu memakainya", () => {
    const c = ctx({ askedName: false, player: "", hearts: 2 });
    let saved = "";
    const conv = new Conversation(() => c, {
      nextStory: () => 0,
      setName: (n) => {
        saved = cleanPlayerName(n);
        c.player = saved;
        c.askedName = true;
        return saved;
      },
      skipName: () => {
        c.askedName = true;
      },
    });
    const first = conv.open(null);
    expect(first.input).toBeDefined();
    const after = conv.submitName("  Arya\n");
    expect(saved).toBe("Arya");
    expect(after.lines.join(" ")).toContain("Arya");
    expect(fill("Halo, {You}!", c)).toBe("Halo, Arya!");
    // Isian kosong atau "rahasia" tidak menghapus nama yang sudah ada.
    conv.submitName("<>");
    expect(c.player).toBe("Arya");
    conv.choose("nama.skip");
    expect(c.player).toBe("Arya");
    expect(fill("Halo, {you}!", { ...c, player: "" })).toBe("Halo, kamu!");
  });

  it("menu tidak mengulang topik yang baru dibahas dan menutup dengan sopan", () => {
    const conv = new Conversation(() => ctx({ trait: "pemalas", hearts: 0 }), { nextStory: () => 0, setName: (n) => n, skipName: () => undefined });
    let step = conv.open(null);
    const seen: string[] = [];
    let guard = 0;
    while (!step.end && guard++ < 20) {
      const topic = step.choices.find((ch) => ch.kind !== "bye" && !seen.includes(ch.id)) ?? step.choices[0];
      seen.push(topic.id);
      step = conv.choose(topic.id);
      expect(step.choices.map((ch) => ch.id)).not.toContain(topic.id);
    }
    expect(step.end).toBe(true);
    // Pemalas cepat bosan.
    expect(guard).toBeLessThanOrEqual(8);
  });

  it("topik yang mendesak selalu ditawarkan", () => {
    for (let i = 0; i < 30; i++) {
      const conv = new Conversation(() => ctx({ hungry: true, rand: seeded(i + 11) }), { nextStory: () => 0, setName: (n) => n, skipName: () => undefined });
      const step = conv.open(null);
      expect(step.choices.map((ch) => ch.id)).toContain("lapar");
    }
  });

  it("celoteh dan ajakan", () => {
    for (let i = 0; i < 50; i++) {
      const c = ctx({ hungry: i % 2 === 0, typing: { enabled: true, today: 10, busy: i % 3 === 0 }, rand: seeded(i + 1) });
      const plain = chatterLine(c, false);
      expect(plain.invite).toBeNull();
      expect(plain.line).not.toMatch(/\{\w+\}/);
      const invite = chatterLine(c, true);
      expect(invite.invite).not.toBeNull();
    }
    expect(chatterLine(ctx({ hungry: true }), true).invite).toBe("hungry");
  });
});

describe("game: obrolan dan ketukan", () => {
  const T0 = new Date(2026, 9, 15, 9, 0).getTime();

  it("ikatan dari obrolan dibatasi jeda, nama disimpan dengan aman", () => {
    const game = new Game(createInitialState(T0));
    const cat = game.state.cats[0];
    expect(game.chatBond(cat.id, T0)).toBe(true);
    expect(cat.bond).toBe(2);
    expect(game.chatBond(cat.id, T0 + 60_000)).toBe(false);
    expect(game.chatBond(cat.id, T0 + 11 * 60_000)).toBe(true);
    expect(game.setPlayerName("  <b>Arya</b>\u0007  ")).toBe("bArya/b");
    expect(game.state.chat.askedName).toBe(true);
    expect(cleanPlayerName("x".repeat(40))).toHaveLength(20);
    expect(game.nextStory(cat.id, STORIES.length)).toBe(0);
    expect(game.nextStory(cat.id, STORIES.length)).toBe(1);
  });

  it("ketukan memberi ikan, dibatasi per detik, dan dihitung per hari", () => {
    const game = new Game(createInitialState(T0));
    expect(game.addTaps(5, T0)).toEqual([0, 0]);
    game.updateTyping({ enabled: true });
    expect(game.state.typing.asked).toBe(true);
    const fish0 = game.state.fish;
    const [n, fish] = game.addTaps(10, T0);
    expect(n).toBe(10);
    expect(fish).toBeCloseTo(10 * 0.2);
    expect(game.state.fish).toBeCloseTo(fish0 + fish);
    // Batas 15 per detik.
    expect(game.addTaps(100, T0 + 500)[0]).toBe(5);
    expect(game.addTaps(3, T0 + 900)[0]).toBe(0);
    expect(game.addTaps(3, T0 + 1000)[0]).toBe(3);
    expect(game.state.stats.taps).toBe(18);
    expect(game.tapsToday(T0)).toBe(18);
    // Hari berganti.
    const tomorrow = T0 + 24 * 3600_000;
    expect(game.tapsToday(tomorrow)).toBe(0);
    game.addTaps(4, tomorrow);
    expect(game.state.typing.today).toBe(4);
    expect(game.state.typing.best).toBe(18);
    // Dimatikan: tidak dihitung.
    game.updateTyping({ enabled: false });
    expect(game.addTaps(5, tomorrow + 5000)).toEqual([0, 0]);
  });

  it("prestasi obrolan dan ketukan", () => {
    const game = new Game(createInitialState(T0));
    game.updateTyping({ enabled: true });
    game.chatStarted();
    for (let i = 0; i < 70; i++) game.addTaps(15, T0 + i * 1000);
    game.checkAchievements(T0 + 100_000);
    expect(game.state.achievements).toContain("ngobrol-1");
    expect(game.state.achievements).toContain("ketik-1rb");
  });

  it("melepas kucing membersihkan data obrolan dan pengetik", () => {
    const game = new Game(createInitialState(T0));
    const s = game.state;
    s.cats.push({ ...s.cats[0], id: "cat-2", name: "Mochi" });
    game.updateTyping({ catId: "cat-2" });
    game.nextStory("cat-2", 5);
    game.releaseCat("cat-2");
    expect(s.typing.catId).toBeNull();
    expect(s.chat.story["cat-2"]).toBeUndefined();
    game.updateTyping({ catId: "tidak-ada" });
    expect(s.typing.catId).toBeNull();
  });

  it("migrasi v5 ke v6", () => {
    const s = migrateState({ version: 5, cats: [{ id: "a", coat: "oyen" }], stats: { petted: 3 } }, T0)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.chat).toEqual({ playerName: "", askedName: false, chatter: true, story: {} });
    // Penghitung ketukan seluruh sistem mati sampai pemain setuju.
    expect(s.typing.enabled).toBe(false);
    expect(s.typing.asked).toBe(false);
    expect(s.stats.taps).toBe(0);
    const ok = migrateState(
      {
        version: 6,
        cats: [{ id: "a", coat: "oyen" }],
        chat: { playerName: "Arya", askedName: true, chatter: false, story: { a: 3, hilang: 2 } },
        typing: { enabled: false, catId: "hilang", today: 50, todayDate: "2026-10-15", best: 70, fishToday: 9 },
        stats: { chats: 4, taps: 900 },
      },
      T0,
    )!;
    expect(ok.chat.playerName).toBe("Arya");
    expect(ok.chat.chatter).toBe(false);
    expect(ok.chat.story).toEqual({ a: 3 });
    expect(ok.typing.enabled).toBe(false);
    expect(ok.typing.catId).toBeNull();
    expect(ok.typing.best).toBe(70);
    expect(ok.stats.taps).toBe(900);
  });
});
