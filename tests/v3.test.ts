import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "../src/core/achievements";
import {
  MINUTE,
  buildSchedule,
  dateKey,
  defaultDateFor,
  inActiveHours,
  nextActiveTime,
  nextChimeAt,
  nextReminderAt,
} from "../src/core/assistant";
import { BALANCE } from "../src/core/data";
import { Game, type GameEvent } from "../src/core/game";
import { SAVE_VERSION, createInitialState, migrateState } from "../src/core/state";

/** Rabu, 14 Oktober 2026, 16.00 waktu lokal. */
const NOW = new Date(2026, 9, 14, 16, 0).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();

function newGame(now = NOW) {
  const game = new Game(createInitialState(now), () => 0.5);
  // Hadiah harian diuji terpisah.
  game.state.daily.lastDate = dateKey(now);
  const events: GameEvent[] = [];
  game.on((e) => events.push(e));
  return { game, events };
}

describe("jadwal pengingat", () => {
  it("pengingat harian berbunyi hari ini lalu besok", () => {
    const { game } = newGame();
    const r = game.addReminder({ text: "Meeting", time: "17:00", repeat: "daily" }, NOW)!;
    expect(nextReminderAt(r)).toBe(at(14, 17));
    r.lastFired = at(14, 17);
    expect(nextReminderAt(r)).toBe(at(15, 17));
  });

  it("pengingat harian yang jamnya sudah lewat mulai besok", () => {
    const { game } = newGame();
    const r = game.addReminder({ text: "Stand-up", time: "09:30", repeat: "daily" }, NOW)!;
    expect(nextReminderAt(r)).toBe(at(15, 9, 30));
  });

  it("hari kerja melewati Sabtu dan Minggu", () => {
    const friday = at(16, 18);
    const { game } = newGame(friday);
    const r = game.addReminder({ text: "Absen", time: "08:00", repeat: "weekdays" }, friday)!;
    expect(new Date(nextReminderAt(r)!).getDay()).toBe(1);
    expect(nextReminderAt(r)).toBe(at(19, 8));
  });

  it("pengingat sekali: tanggal bawaan dan menolak waktu lampau", () => {
    expect(defaultDateFor("17:00", NOW)).toBe(dateKey(NOW));
    expect(defaultDateFor("08:00", NOW)).toBe(dateKey(at(15, 12)));
    const { game } = newGame();
    expect(game.addReminder({ text: "Lewat", time: "10:00", repeat: "once", date: dateKey(NOW) }, NOW)).toBeNull();
    expect(game.addReminder({ text: "  ", time: "18:00", repeat: "once" }, NOW)).toBeNull();
    const r = game.addReminder({ text: "Jemput adik", time: "18:00", repeat: "once" }, NOW)!;
    expect(nextReminderAt(r)).toBe(at(14, 18));
  });

  it("berbunyi sekali, bisa ditunda, dan kunci basi diabaikan", () => {
    const { game, events } = newGame();
    const r = game.addReminder({ text: "Meeting", time: "17:00", repeat: "once" }, NOW)!;
    const item = game.schedule(NOW).find((i) => i.key.startsWith("rem:"))!;
    expect(item.at).toBe(at(14, 17));
    expect(item.notify).toBe(true);

    const alert = game.handleDue(item.key, at(14, 17))!;
    expect(alert.kind).toBe("reminder");
    expect(alert.title).toBe("Meeting");
    expect(alert.missed).toBe(false);
    expect(game.handleDue(item.key, at(14, 17))).toBeNull();
    expect(game.state.stats.remindersFired).toBe(1);
    expect(events.filter((e) => e.type === "alert")).toHaveLength(1);
    expect(nextReminderAt(r)).toBeNull();

    game.snoozeReminder(r.id, 5, at(14, 17, 1));
    expect(nextReminderAt(r)).toBe(at(14, 17, 6));
    const snoozed = game.schedule(at(14, 17, 2)).find((i) => i.key.startsWith("rem:"))!;
    expect(game.handleDue(snoozed.key, at(14, 17, 6))?.title).toBe("Meeting");
    expect(nextReminderAt(r)).toBeNull();
  });

  it("pengingat yang terlewat saat aplikasi tertutup dilaporkan sekali", () => {
    const { game } = newGame();
    const once = game.addReminder({ text: "Telepon", time: "17:00", repeat: "once" }, NOW)!;
    const daily = game.addReminder({ text: "Minum obat", time: "16:30", repeat: "daily" }, NOW)!;
    const later = at(14, 20);
    const missed = game.catchUp(later);
    expect(missed.map((m) => m.title).sort()).toEqual(["Minum obat", "Telepon"]);
    expect(missed.every((m) => m.missed)).toBe(true);
    expect(nextReminderAt(once)).toBeNull();
    expect(nextReminderAt(daily)).toBe(at(15, 16, 30));
    expect(game.catchUp(later)).toEqual([]);
  });

  it("mematikan dan menyalakan lagi tidak membunyikan kejadian lampau", () => {
    const { game } = newGame();
    const r = game.addReminder({ text: "Makan", time: "16:30", repeat: "daily" }, NOW)!;
    game.setReminderEnabled(r.id, false, NOW);
    expect(nextReminderAt(r)).toBeNull();
    game.setReminderEnabled(r.id, true, at(14, 17));
    expect(nextReminderAt(r)).toBe(at(15, 16, 30));
  });
});

describe("komputer tidur lalu bangun", () => {
  it("pengingat harian yang terlewat beberapa hari cukup berbunyi sekali", () => {
    const { game, events } = newGame();
    game.addReminder({ text: "Stand-up", time: "09:00", repeat: "daily" }, NOW);
    const first = game.schedule(NOW).find((i) => i.key.startsWith("rem:"))!;
    const wake = at(19, 10);
    expect(game.handleDue(first.key, wake)?.body).toBe("Terlewat pukul 09.00");
    game.pollDue(wake);
    expect(events.filter((e) => e.type === "alert")).toHaveLength(1);
    expect(game.schedule(wake).find((i) => i.key.startsWith("rem:"))!.at).toBe(at(20, 9));
  });

  it("sesi fokus yang habis saat tidur tidak memberi hadiah", () => {
    const { game } = newGame();
    game.startFocus(NOW);
    const key = game.schedule(NOW).find((i) => i.key.startsWith("focus:"))!.key;
    expect(game.handleDue(key, NOW + 3 * 60 * MINUTE)).toBeNull();
    expect(game.state.assistant.focus.phase).toBe("idle");
    expect(game.state.stats.focusSessions).toBe(0);
  });
});

describe("timer fokus", () => {
  it("selesai memberi ikan dan ikatan, lalu istirahat", () => {
    const { game } = newGame();
    const fishBefore = game.state.fish;
    game.startFocus(NOW, 25, 5);
    const focus = game.schedule(NOW).find((i) => i.key.startsWith("focus:"))!;
    expect(focus.at).toBe(NOW + 25 * MINUTE);
    const alert = game.handleDue(focus.key, focus.at)!;
    expect(alert.kind).toBe("focusDone");
    expect(alert.reward).toBeGreaterThan(0);
    expect(game.state.fish).toBeGreaterThan(fishBefore);
    expect(game.state.cats[0].bond).toBe(BALANCE.bondPerFocus);
    expect(game.state.assistant.focus.phase).toBe("break");
    expect(game.state.stats.focusSessions).toBe(1);

    const brk = game.schedule(focus.at).find((i) => i.key.startsWith("break:"))!;
    expect(game.handleDue(brk.key, brk.at)?.kind).toBe("breakDone");
    expect(game.state.assistant.focus.phase).toBe("idle");
  });

  it("dihentikan sebelum selesai: kuncinya basi", () => {
    const { game } = newGame();
    game.startFocus(NOW);
    const key = game.schedule(NOW).find((i) => i.key.startsWith("focus:"))!.key;
    game.stopFocus();
    expect(game.handleDue(key, NOW + 25 * MINUTE)).toBeNull();
    expect(game.state.stats.focusSessions).toBe(0);
  });
});

describe("pengingat sehat dan jam", () => {
  it("jam aktif membatasi pengingat sehat", () => {
    expect(inActiveHours(at(14, 9), "08:00", "18:00")).toBe(true);
    expect(inActiveHours(at(14, 19), "08:00", "18:00")).toBe(false);
    expect(inActiveHours(at(14, 23), "22:00", "02:00")).toBe(true);
    expect(nextActiveTime(at(14, 19), "08:00", "18:00")).toBe(at(15, 8));
  });

  it("selang waktu menghasilkan jadwal, dan mengulang setelah berbunyi", () => {
    const { game } = newGame();
    game.setWellnessInterval("water", 60, NOW);
    const item = game.schedule(NOW).find((i) => i.key.startsWith("well:water"))!;
    expect(item.at).toBe(NOW + 60 * MINUTE);
    expect(item.notify).toBe(false);
    const alert = game.handleDue(item.key, item.at)!;
    expect(alert.kind).toBe("water");
    expect(game.handleDue(item.key, item.at)).toBeNull();
    expect(game.state.assistant.wellness.next.water).toBe(item.at + 60 * MINUTE);
    expect(game.ackWellness("water", item.at)).toBeGreaterThan(0);
  });

  it("di luar jam aktif digeser ke pagi berikutnya", () => {
    const evening = at(14, 17, 30);
    const { game } = newGame(evening);
    game.setWellnessInterval("stretch", 60, evening);
    // Digeser ke pagi, dengan jarak 7 menit per jenis agar tidak datang bersamaan.
    expect(game.schedule(evening).find((i) => i.key.startsWith("well:stretch"))!.at).toBe(at(15, 8, 7));
  });

  it("bunyi tiap jam berbunyi sekali tepat saat jam berganti", () => {
    const { game, events } = newGame(at(14, 16, 59));
    game.updateAssistant({ chime: true });
    expect(game.schedule(at(14, 16, 59)).find((i) => i.key.startsWith("chime:"))!.at).toBe(at(14, 17));
    game.pollDue(at(14, 17, 0) + 500);
    game.pollDue(at(14, 17, 1));
    expect(events.filter((e) => e.type === "alert")).toHaveLength(1);
    expect(game.schedule(at(14, 17, 1)).find((i) => i.key.startsWith("chime:"))!.at).toBe(at(14, 18));
  });

  it("jam tidur yang diganti pada hari yang sama punya kunci baru", () => {
    const { game } = newGame();
    game.updateAssistant({ bedtime: "21:00" });
    const k1 = game.schedule(NOW).find((i) => i.key.startsWith("bed:"))!.key;
    game.updateAssistant({ bedtime: "22:30" });
    const k2 = game.schedule(NOW).find((i) => i.key.startsWith("bed:"))!.key;
    expect(k1).not.toBe(k2);
    game.updateAssistant({ bedtime: "" });
    expect(game.state.assistant.bedtime).toBe("22:30");
  });

  it("bunyi tiap jam hanya antara 08.00 dan 22.00", () => {
    expect(nextChimeAt(at(14, 16, 20))).toBe(at(14, 17));
    expect(nextChimeAt(at(14, 22, 5))).toBe(at(15, 8));
  });

  it("jam tidur berbunyi sekali per hari", () => {
    const { game } = newGame();
    game.updateAssistant({ bedtime: "23:00" });
    const bed = game.schedule(NOW).find((i) => i.key.startsWith("bed:"))!;
    expect(bed.at).toBe(at(14, 23));
    expect(game.handleDue(bed.key, bed.at)?.kind).toBe("bedtime");
    expect(game.handleDue(bed.key, bed.at)).toBeNull();
    expect(buildSchedule(game.state.assistant, at(14, 23, 30)).find((i) => i.key.startsWith("bed:"))!.at).toBe(at(15, 23));
  });
});

describe("daftar tugas", () => {
  it("mencentang memberi ikan sekali saja dan dibatasi per hari", () => {
    const { game } = newGame();
    const t = game.addTodo("Kirim laporan", NOW)!;
    expect(game.toggleTodo(t.id, NOW)).toBeGreaterThan(0);
    expect(game.toggleTodo(t.id, NOW)).toBe(0);
    expect(game.toggleTodo(t.id, NOW)).toBe(0);
    expect(game.state.stats.todosDone).toBe(1);

    let rewarded = 1;
    for (let i = 0; i < 30; i++) {
      const x = game.addTodo(`Tugas ${i}`, NOW)!;
      if (game.toggleTodo(x.id, NOW) > 0) rewarded++;
    }
    expect(rewarded).toBe(BALANCE.todoRewardsPerDay);
    game.clearDoneTodos();
    expect(game.state.assistant.todos).toHaveLength(0);
  });
});

describe("hadiah harian dan prestasi", () => {
  it("hari berturut-turut menaikkan streak; bolos sehari mengulang", () => {
    const game = new Game(createInitialState(NOW), () => 0.5);
    expect(game.checkDaily(NOW)).toBe(true);
    expect(game.checkDaily(NOW + MINUTE)).toBe(false);
    expect(game.state.daily.streak).toBe(1);
    game.checkDaily(at(15, 9));
    game.checkDaily(at(16, 9));
    expect(game.state.daily.streak).toBe(3);
    // Hari ke-3 memberi camilan.
    expect(game.state.gifts.at(-1)?.item).toEqual({ kind: "treats", amount: 3 });
    game.checkDaily(at(18, 9));
    expect(game.state.daily.streak).toBe(1);
    expect(game.state.daily.best).toBe(3);
  });

  it("memundurkan jam komputer tidak memberi hadiah harian lagi", () => {
    const game = new Game(createInitialState(NOW), () => 0.5);
    game.checkDaily(at(16, 9));
    expect(game.checkDaily(at(15, 9))).toBe(false);
    expect(game.checkDaily(at(16, 20))).toBe(false);
  });

  it("hari ke-7 memberi aksesori khusus hadiah", () => {
    const game = new Game(createInitialState(NOW), () => 0.5);
    for (let d = 14; d <= 20; d++) game.checkDaily(at(d, 9));
    expect(game.state.daily.streak).toBe(7);
    expect(game.state.gifts.at(-1)?.item.kind).toBe("accessory");
  });

  it("prestasi terbuka sekali dengan hadiahnya, beberapa sekaligus jadi satu event", () => {
    const { game, events } = newGame();
    const treats = game.state.inventory.treats;
    game.petCat("cat-1", NOW);
    game.purr("cat-1", NOW);
    const ids = game.checkAchievements(NOW);
    expect(ids).toEqual(["elus-1", "dengkur-1"]);
    expect(game.state.inventory.treats).toBe(treats + 3);
    expect(events.filter((e) => e.type === "achievement")).toHaveLength(1);
    expect(game.checkAchievements(NOW)).toEqual([]);
  });

  it("setiap prestasi punya id unik dan target yang masuk akal", () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    const s = createInitialState(NOW);
    for (const a of ACHIEVEMENTS) {
      const [v, t] = a.progress(s);
      expect(t, a.id).toBeGreaterThan(0);
      expect(v, a.id).toBeLessThan(t);
    }
  });
});

describe("migrasi v2 ke v3", () => {
  it("asisten diberi nilai awal, data rusak dibuang", () => {
    const s = migrateState(
      {
        version: 2,
        cats: [{ coat: "oyen" }],
        assistant: {
          reminders: [
            { id: "a", text: "Meeting", time: "17:00", repeat: "daily", createdAt: NOW },
            { id: "b", text: "Jam rusak", time: "25:99", repeat: "daily" },
            { id: "c", text: "", time: "10:00" },
          ],
          todos: [{ text: "Belanja", done: true }, { text: 5 }],
          wellness: { intervals: { water: 45 }, from: "salah" },
        },
        achievements: ["elus-1", "palsu", "elus-1"],
        daily: { lastDate: "2026-10-13", streak: 4, best: 2 },
      },
      NOW,
    )!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.assistant.reminders.map((r) => r.id)).toEqual(["a"]);
    expect(s.assistant.todos.map((t) => t.text)).toEqual(["Belanja"]);
    expect(s.assistant.wellness.intervals.water).toBe(45);
    expect(s.assistant.wellness.from).toBe("08:00");
    expect(s.assistant.nativeNotify).toBe(true);
    expect(s.achievements).toEqual(["elus-1"]);
    expect(s.daily).toEqual({ lastDate: "2026-10-13", streak: 4, best: 4 });
    expect(s.stats.focusSessions).toBe(0);
  });
});
