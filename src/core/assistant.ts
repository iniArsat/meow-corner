// Asisten kucing: perhitungan jadwal pengingat, timer fokus, pengingat sehat,
// bunyi tiap jam, dan jam tidur. Modul murni (tanpa DOM), memakai waktu lokal.

import type { AssistantState, FocusState, Reminder, WellnessKind, WellnessState } from "./types";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const WELLNESS_KINDS: readonly WellnessKind[] = ["water", "stretch", "eyes"];

export const WELLNESS_TEXT: Record<WellnessKind, { title: string; body: string; done: string }> = {
  water: { title: "Minum air dulu, yuk!", body: "Segelas air bikin kepala lebih segar.", done: "Sudah minum" },
  stretch: { title: "Waktunya peregangan!", body: "Berdiri, regangkan punggung dan bahu seperti kucing.", done: "Sudah" },
  eyes: { title: "Istirahatkan mata", body: "Lihat benda yang jauh selama 20 detik.", done: "Sudah" },
};

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// ---------------------------------------------------------------------------
// Waktu lokal

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Tanggal lokal "YYYY-MM-DD". */
export function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseTime(t: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

export function parseDate(key: string): { y: number; mo: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return { y: Number(match[1]), mo: Number(match[2]) - 1, d: Number(match[3]) };
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Waktu lokal pada hari yang sama dengan `dayMs`, jam `time`. */
export function atTimeOn(dayMs: number, time: string): number | null {
  const t = parseTime(time);
  if (!t) return null;
  const d = new Date(dayMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m).getTime();
}

export function atDateTime(date: string, time: string): number | null {
  const d = parseDate(date);
  const t = parseTime(time);
  if (!d || !t) return null;
  return new Date(d.y, d.mo, d.d, t.h, t.m).getTime();
}

/** Hari berikutnya (aman terhadap pergantian jam musim panas). */
function nextDay(dayMs: number): number {
  const d = new Date(dayMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

export function isWeekday(ms: number): boolean {
  const day = new Date(ms).getDay();
  return day >= 1 && day <= 5;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}.${pad2(d.getMinutes())}`;
}

export function formatDay(ms: number, now: number): string {
  const day = startOfDay(ms);
  const today = startOfDay(now);
  if (day === today) return "hari ini";
  if (day === nextDay(today)) return "besok";
  const d = new Date(ms);
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/** "dalam 2 jam 5 menit" / "dalam 40 detik". */
export function formatIn(ms: number): string {
  if (ms < MINUTE) return `dalam ${Math.max(1, Math.ceil(ms / 1000))} detik`;
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes < 60) return `dalam ${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) return `dalam ${Math.floor(h / 24)} hari`;
  return m > 0 ? `dalam ${h} jam ${m} menit` : `dalam ${h} jam`;
}

/** Sisa waktu "mm:ss" untuk timer fokus. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// ---------------------------------------------------------------------------
// Pengingat

/** Waktu berbunyi berikutnya, atau null bila mati/sudah selesai. */
export function nextReminderAt(r: Reminder): number | null {
  if (!r.enabled) return null;
  if (r.snoozeUntil !== null) return r.snoozeUntil;
  if (r.repeat === "once") {
    const at = atDateTime(r.date ?? dateKey(r.createdAt), r.time);
    if (at === null || at <= r.lastFired) return null;
    return at;
  }
  // Kejadian pertama setelah bunyi terakhir (atau sejak dibuat).
  const after = Math.max(r.lastFired, r.createdAt);
  let day = startOfDay(after);
  for (let i = 0; i < 9; i++) {
    const at = atTimeOn(day, r.time);
    if (at !== null && at > after && (r.repeat === "daily" || isWeekday(day))) return at;
    day = nextDay(day);
  }
  return null;
}

export function describeRepeat(r: Reminder, now: number): string {
  switch (r.repeat) {
    case "daily":
      return "Setiap hari";
    case "weekdays":
      return "Senin–Jumat";
    case "once": {
      const at = r.date ? atDateTime(r.date, r.time) : null;
      return at ? formatDay(at, now) : "Sekali";
    }
  }
}

export function reminderDone(r: Reminder): boolean {
  return r.repeat === "once" && r.enabled && nextReminderAt(r) === null;
}

/** Tanggal bawaan untuk pengingat sekali: hari ini, atau besok bila jamnya sudah lewat. */
export function defaultDateFor(time: string, now: number): string {
  const at = atTimeOn(now, time);
  return at !== null && at > now ? dateKey(now) : dateKey(nextDay(startOfDay(now)));
}

// ---------------------------------------------------------------------------
// Jam aktif, bunyi tiap jam, jam tidur

/** true bila `ms` berada di antara jam `from` dan `to` (boleh melewati tengah malam). */
export function inActiveHours(ms: number, from: string, to: string): boolean {
  const a = parseTime(from);
  const b = parseTime(to);
  if (!a || !b) return true;
  const d = new Date(ms);
  const t = d.getHours() * 60 + d.getMinutes();
  const start = a.h * 60 + a.m;
  const end = b.h * 60 + b.m;
  if (start === end) return true;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** Bila `ms` di luar jam aktif, geser ke awal jam aktif berikutnya. */
export function nextActiveTime(ms: number, from: string, to: string): number {
  if (inActiveHours(ms, from, to)) return ms;
  let day = startOfDay(ms);
  for (let i = 0; i < 3; i++) {
    const start = atTimeOn(day, from);
    if (start !== null && start > ms) return start;
    day = nextDay(day);
  }
  return ms;
}

export const CHIME_FROM = 8;
export const CHIME_TO = 22;

/** Pergantian jam berikutnya antara 08.00 dan 22.00. */
export function nextChimeAt(now: number): number {
  const d = new Date(now);
  let at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
  for (let i = 0; i < 26; i++) {
    const h = new Date(at).getHours();
    if (h >= CHIME_FROM && h <= CHIME_TO) return at;
    const x = new Date(at);
    at = new Date(x.getFullYear(), x.getMonth(), x.getDate(), x.getHours() + 1).getTime();
  }
  return at;
}

export function nextBedtimeAt(a: AssistantState, now: number): number | null {
  if (!a.bedtime) return null;
  let day = startOfDay(now);
  for (let i = 0; i < 3; i++) {
    const at = atTimeOn(day, a.bedtime);
    if (at !== null && at > now - MINUTE && a.lastBedtime !== dateKey(day)) return at;
    day = nextDay(day);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Peringatan yang disampaikan kucing

export type AlertKind = "reminder" | "focusDone" | "breakDone" | WellnessKind | "chime" | "bedtime";

export interface Alert {
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** Id pengingat (untuk tombol tunda), atau null. */
  refId: string | null;
  /** Waktu kejadian yang dijadwalkan. */
  at: number;
  /** Ikan yang sudah diberikan (sesi fokus selesai). */
  reward: number;
  /** Berbunyi jauh setelah waktunya (komputer tidur atau aplikasi tertutup). */
  missed: boolean;
}

// ---------------------------------------------------------------------------
// Jadwal untuk sisi Rust (atau pengecek di browser)

export interface DueItem {
  /** Kunci unik kejadian; dipakai lagi oleh Game.handleDue. */
  key: string;
  at: number;
  title: string;
  body: string;
  /** Kirim notifikasi Windows juga. */
  notify: boolean;
}

/**
 * Waktu berbunyi pengingat sehat. Di luar jam aktif digeser ke awal jam aktif,
 * dengan jarak antar-jenis agar tidak datang bersamaan.
 */
export function wellnessAt(w: WellnessState, kind: WellnessKind, next: number): number {
  const at = nextActiveTime(next, w.from, w.to);
  return at === next ? at : at + WELLNESS_KINDS.indexOf(kind) * 7 * MINUTE;
}

export function buildSchedule(a: AssistantState, now: number): DueItem[] {
  const items: DueItem[] = [];
  for (const r of a.reminders) {
    const at = nextReminderAt(r);
    if (at === null) continue;
    items.push({ key: `rem:${r.id}:${at}`, at, title: `⏰ ${r.text}`, body: `Pengingat ${formatClock(at)} dari kucingmu`, notify: a.nativeNotify });
  }
  const f = a.focus;
  if (f.phase === "focus") {
    items.push({ key: `focus:${f.endsAt}`, at: f.endsAt, title: "Sesi fokus selesai!", body: `Istirahat ${f.breakMinutes} menit dulu, ya.`, notify: a.nativeNotify });
  } else if (f.phase === "break") {
    items.push({ key: `break:${f.endsAt}`, at: f.endsAt, title: "Istirahat selesai", body: "Siap fokus lagi?", notify: a.nativeNotify });
  }
  const w = a.wellness;
  for (const kind of WELLNESS_KINDS) {
    if (w.intervals[kind] <= 0) continue;
    const at = wellnessAt(w, kind, w.next[kind]);
    items.push({ key: `well:${kind}:${w.next[kind]}`, at, title: WELLNESS_TEXT[kind].title, body: WELLNESS_TEXT[kind].body, notify: false });
  }
  if (a.chime) {
    // Beri kelonggaran beberapa menit agar jam yang baru lewat tetap berbunyi sekali.
    let at = nextChimeAt(now - 5 * MINUTE);
    if (at <= a.lastChime) at = nextChimeAt(a.lastChime);
    items.push({ key: `chime:${at}`, at, title: `Sudah jam ${formatClock(at)}`, body: "", notify: false });
  }
  const bed = nextBedtimeAt(a, now);
  if (bed !== null) {
    items.push({ key: `bed:${bed}`, at: bed, title: "Sudah malam", body: "Kucing-kucing mau tidur. Kamu juga istirahat, ya.", notify: false });
  }
  return items.sort((p, q) => p.at - q.at);
}

// ---------------------------------------------------------------------------
// Nilai bawaan dan migrasi

export function defaultFocus(now: number): FocusState {
  return { phase: "idle", startedAt: 0, endsAt: 0, focusMinutes: 25, breakMinutes: 5, todayCount: 0, todayDate: dateKey(now) };
}

export function defaultWellness(now: number): WellnessState {
  return {
    intervals: { water: 0, stretch: 0, eyes: 0 },
    next: { water: now + HOUR, stretch: now + HOUR, eyes: now + 20 * MINUTE },
    from: "08:00",
    to: "18:00",
  };
}

export function defaultAssistant(now: number): AssistantState {
  return {
    reminders: [],
    todos: [],
    focus: defaultFocus(now),
    wellness: defaultWellness(now),
    chime: false,
    bedtime: null,
    lastBedtime: "",
    lastChime: 0,
    clock: false,
    showOnAlert: true,
    nativeNotify: true,
    counter: 0,
    todoRewardDate: "",
    todoRewardCount: 0,
  };
}

export const FOCUS_CHOICES = [15, 25, 45, 60] as const;
export const BREAK_CHOICES = [5, 10, 15] as const;
export const WELLNESS_CHOICES: Record<WellnessKind, readonly number[]> = {
  water: [0, 30, 45, 60, 90],
  stretch: [0, 45, 60, 90, 120],
  eyes: [0, 20, 30, 45],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function str(v: unknown, fallback: string, maxLen = 120): string {
  return typeof v === "string" ? v.slice(0, maxLen) : fallback;
}

function timeStr(v: unknown, fallback: string): string {
  return typeof v === "string" && parseTime(v) ? v : fallback;
}

export function migrateAssistant(raw: unknown, now: number): AssistantState {
  const base = defaultAssistant(now);
  if (!isRecord(raw)) return base;
  const reminders: Reminder[] = [];
  if (Array.isArray(raw.reminders)) {
    for (const r of raw.reminders) {
      if (!isRecord(r)) continue;
      const time = timeStr(r.time, "");
      const text = str(r.text, "").trim();
      if (!time || !text) continue;
      const repeat = r.repeat === "daily" || r.repeat === "weekdays" ? r.repeat : "once";
      const date = typeof r.date === "string" && parseDate(r.date) ? r.date : null;
      reminders.push({
        id: str(r.id, `r-${reminders.length}-${now}`, 40),
        text,
        time,
        repeat,
        date: repeat === "once" ? (date ?? dateKey(now)) : null,
        enabled: r.enabled !== false,
        lastFired: num(r.lastFired, 0, 0),
        snoozeUntil: typeof r.snoozeUntil === "number" && Number.isFinite(r.snoozeUntil) ? r.snoozeUntil : null,
        createdAt: num(r.createdAt, now, 0),
      });
    }
  }
  const todos = Array.isArray(raw.todos)
    ? raw.todos.filter(isRecord).flatMap((t, i) => {
        const text = str(t.text, "").trim();
        if (!text) return [];
        return [
          {
            id: str(t.id, `t-${i}-${now}`, 40),
            text,
            done: t.done === true,
            createdAt: num(t.createdAt, now, 0),
            doneAt: typeof t.doneAt === "number" ? t.doneAt : null,
            rewarded: t.rewarded === true,
          },
        ];
      })
    : [];
  const f = isRecord(raw.focus) ? raw.focus : {};
  const phase = f.phase === "focus" || f.phase === "break" ? f.phase : "idle";
  const focus: FocusState = {
    phase,
    startedAt: num(f.startedAt, 0, 0),
    endsAt: num(f.endsAt, 0, 0),
    focusMinutes: num(f.focusMinutes, 25, 5, 120),
    breakMinutes: num(f.breakMinutes, 5, 1, 60),
    todayCount: num(f.todayCount, 0, 0),
    todayDate: str(f.todayDate, dateKey(now), 10),
  };
  const w = isRecord(raw.wellness) ? raw.wellness : {};
  const wi = isRecord(w.intervals) ? w.intervals : {};
  const wn = isRecord(w.next) ? w.next : {};
  const wellness: WellnessState = {
    intervals: {
      water: num(wi.water, 0, 0, 600),
      stretch: num(wi.stretch, 0, 0, 600),
      eyes: num(wi.eyes, 0, 0, 600),
    },
    next: {
      water: num(wn.water, base.wellness.next.water, 0),
      stretch: num(wn.stretch, base.wellness.next.stretch, 0),
      eyes: num(wn.eyes, base.wellness.next.eyes, 0),
    },
    from: timeStr(w.from, "08:00"),
    to: timeStr(w.to, "18:00"),
  };
  return {
    reminders,
    todos,
    focus,
    wellness,
    chime: raw.chime === true,
    bedtime: typeof raw.bedtime === "string" && parseTime(raw.bedtime) ? raw.bedtime : null,
    lastBedtime: str(raw.lastBedtime, "", 10),
    lastChime: num(raw.lastChime, 0, 0),
    clock: raw.clock === true,
    showOnAlert: raw.showOnAlert !== false,
    nativeNotify: raw.nativeNotify !== false,
    counter: Math.floor(num(raw.counter, reminders.length + todos.length, 0)),
    todoRewardDate: str(raw.todoRewardDate, "", 10),
    todoRewardCount: Math.floor(num(raw.todoRewardCount, 0, 0)),
  };
}
