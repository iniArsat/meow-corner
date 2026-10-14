// Mesin obrolan kucing: pemain memilih kalimat, kucing menjawab sesuai sifat,
// keakraban, rasa lapar, waktu, cuaca, dan isi asisten (tugas, pengingat, fokus).
// Murni tanpa tampilan; UI menampilkan ChatStep dan menjalankan aksinya.

import {
  ASK_NAME,
  BORED,
  BYE,
  BYE_MORNING,
  BYE_NIGHT,
  BYE_SULK,
  CAPEK,
  CHATTER,
  CHATTER_FRIEND,
  CHATTER_HUNGRY,
  CHATTER_MORNING,
  CHATTER_NIGHT,
  CHATTER_RAIN,
  CHATTER_TYPING,
  CUACA_COLD,
  CUACA_HOT,
  CUACA_KIND,
  CUACA_NONE,
  CUACA_OFF,
  CUACA_TEMP,
  CURHAT,
  ELUS,
  FACTS,
  FACT_INTRO,
  FEED_ALL,
  FEED_POOR,
  FOKUS_BREAK,
  FOKUS_LATER,
  FOKUS_OFFER,
  FOKUS_RUNNING,
  FOKUS_START,
  INVITE,
  JADWAL_NONE,
  JADWAL_SOME,
  KABAR_FREE,
  KABAR_HUNGRY,
  KABAR_WORK,
  KETIK_BUSY,
  KETIK_NONE,
  KETIK_SOME,
  LAPAR_NO,
  LAPAR_WAIT,
  LAPAR_YES,
  MAAF_NO,
  MAAF_OK,
  MAAF_TREAT,
  MAIN,
  MAIN_RUN,
  MAIN_TOY,
  MAKASIH,
  NAME_OK,
  NAME_SKIP,
  OPEN,
  OPEN_HUNGRY,
  OPEN_LATE,
  OPEN_SLEEPY,
  OPEN_SULK,
  PUJI,
  PUJI_ACC,
  RAHASIA,
  RAHASIA_NO,
  SAYANG,
  SEMANGAT,
  SENDIRI,
  STORIES,
  STORY_INTRO,
  TEMAN,
  TEMANI,
  TIDUR,
  TIDUR_GO,
  TIDUR_LATE,
  TIDUR_NIGHT,
  TIDUR_STAY,
  TREAT_GIVE,
  TREAT_NONE,
  TUGAS_NONE,
  TUGAS_SOME,
  VISITOR,
  WAKTU,
  type Line,
  type Pool,
} from "./dialogueLines";
import { cleanPlayerName } from "./state";
import type { FacilityId, FocusPhase, TraitId, WeatherKind } from "./types";
import { PHASE_LABEL, type DayPhase } from "./weather";

export type ChatAnim =
  | "talk"
  | "happy"
  | "purr"
  | "proud"
  | "stretch"
  | "yawn"
  | "sleep"
  | "zoomies"
  | "play"
  | "groom"
  | "startled";

export type ChatAction =
  /** Hati melayang dari kucing. */
  | "hearts"
  | "treat"
  | "feedAll"
  | "focus"
  | "toy"
  | "openTodos"
  | "openReminders"
  | "openWeather"
  | "forgive";

/** Keadaan dunia yang dilihat kucing saat mengobrol. */
export interface ChatContext {
  name: string;
  trait: TraitId;
  /** Hati ikatan, 0..5. */
  hearts: number;
  hungry: boolean;
  /** Keadaan kucing saat diajak ngobrol. */
  mood: "normal" | "sleepy" | "sulk";
  /** Fasilitas tempat ia bertugas (bila sedang bekerja). */
  facility: FacilityId | null;
  /** Nama aksesori yang dipakai. */
  accessory: string | null;
  coatName: string;
  /** Nama panggilan pemain, "" bila belum tahu. */
  player: string;
  askedName: boolean;
  phase: DayPhase;
  /** Jam sekarang "HH.MM" dan jam desimalnya. */
  clock: string;
  hour: number;
  weather: {
    enabled: boolean;
    kind: WeatherKind;
    temp: number | null;
    source: "live" | "manual" | "none";
    place: string | null;
    night: boolean;
  };
  /** Nama kucing lain di rumah. */
  others: string[];
  focus: { phase: FocusPhase; minutesLeft: number; focusMinutes: number };
  todos: { open: number; top: string | null };
  reminder: { text: string; clock: string; day: string } | null;
  typing: { enabled: boolean; today: number; busy: boolean };
  treats: number;
  /** Ada kucing lapar dan ikannya cukup untuk "Beri makan". */
  canFeed: boolean;
  rand: () => number;
}

export interface ChatChoice {
  id: string;
  label: string;
  /** "bye" ditampilkan lebih kecil di bawah. */
  kind?: "bye";
}

export interface ChatStep {
  /** Kalimat kucing, ditampilkan berurutan. */
  lines: string[];
  choices: ChatChoice[];
  anim?: ChatAnim;
  actions?: ChatAction[];
  /** Kolom isian (untuk nama panggilan). */
  input?: { placeholder: string; submit: string; skipId: string; skipLabel: string };
  /** Obrolan selesai setelah kalimat terakhir. */
  end?: boolean;
}

/** Penghubung ke Game untuk hal yang perlu disimpan. */
export interface ChatHooks {
  nextStory(count: number): number;
  /** Simpan nama panggilan (sudah dibersihkan, tidak kosong). */
  setName(name: string): string;
  /** Pemain tidak mau memberi tahu nama: jangan tanya lagi, nama lama tetap. */
  skipName(): void;
}

/** Alasan kucing yang mengajak ngobrol duluan. */
export type ChatInvite = "hungry" | "typing" | "rain" | "night" | "morning" | "story" | null;

// ---------------------------------------------------------------------------
// Pemilihan dan pengisian kalimat

function choose<T>(list: readonly T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

function asLines(line: Line): string[] {
  return typeof line === "string" ? [line] : [...line];
}

/** Pilih varian: kucing pemalu/akrab dan sifatnya lebih diutamakan bila ada. */
export function pickLines(c: ChatContext, pool: Pool): string[] {
  const r = c.rand;
  if (c.hearts <= 1 && pool.shy?.length && r() < 0.6) return asLines(choose(pool.shy, r));
  if (c.hearts >= 4 && pool.close?.length && r() < 0.5) return asLines(choose(pool.close, r));
  const own = pool[c.trait];
  if (own?.length && r() < 0.6) return asLines(choose(own, r));
  const any = pool.any?.length ? pool.any : own?.length ? own : (pool.close ?? pool.shy ?? []);
  return any.length ? asLines(choose(any, r)) : [];
}

function pickFrom(c: ChatContext, list: readonly Line[]): string[] {
  return list.length ? asLines(choose(list, c.rand)) : [];
}

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function formatCount(n: number): string {
  return Math.floor(n).toLocaleString("id-ID");
}

/** Ganti penanda {…} dengan isi sesungguhnya. */
export function fill(text: string, c: ChatContext, friend: string | null = null): string {
  const you = c.player || "kamu";
  const temp = c.weather.temp === null ? "" : `${Math.round(c.weather.temp)}°`;
  const values: Record<string, string> = {
    you,
    You: capital(you),
    nama: c.name,
    teman: friend ?? c.others[0] ?? "temanku",
    bulu: c.coatName,
    jam: c.clock,
    fase: PHASE_LABEL[c.phase].toLowerCase(),
    tempat: c.weather.place ?? "luar",
    suhu: temp,
    tugas: c.todos.top ?? "",
    nTugas: String(c.todos.open),
    pengingat: c.reminder?.text ?? "",
    jamPengingat: c.reminder?.clock ?? "",
    hariPengingat: c.reminder?.day ?? "",
    HariPengingat: capital(c.reminder?.day ?? ""),
    ketuk: formatCount(c.typing.today),
    fokusSisa: `${Math.max(1, Math.ceil(c.focus.minutesLeft))} menit`,
    fokusMenit: String(c.focus.focusMinutes),
    aksesori: c.accessory ?? "",
    fasilitas: c.facility ?? "",
  };
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? values[key] : m));
}

// ---------------------------------------------------------------------------
// Topik di menu

interface Topic {
  id: string;
  labels(c: ChatContext): readonly string[];
  /** Bobot kemunculan di menu (0 = tidak muncul). */
  weight(c: ChatContext): number;
}

const late = (c: ChatContext) => c.phase === "dini" || (c.phase === "malam" && c.hour >= 22);
const wet = (c: ChatContext) => c.weather.enabled && ["rain", "drizzle", "storm"].includes(c.weather.kind);

const TOPICS: Topic[] = [
  { id: "kabar", labels: () => ["Lagi apa?", "Gimana kabarmu?", "Lagi ngapain?"], weight: () => 1.2 },
  { id: "lapar", labels: () => ["Kamu lapar?", "Sudah makan?"], weight: (c) => (c.hungry ? 6 : 0.7) },
  {
    id: "cuaca",
    labels: () => ["Cuaca di luar gimana?", "Hari ini cuacanya apa?"],
    weight: (c) => (wet(c) || c.weather.kind === "storm" ? 2.5 : 0.9),
  },
  { id: "capek", labels: () => ["Aku capek…", "Hari ini berat banget."], weight: (c) => (c.typing.busy ? 2.5 : 1) },
  { id: "semangat", labels: () => ["Semangatin aku dong", "Kasih aku semangat!"], weight: () => 1 },
  {
    id: "fokus",
    labels: (c) => (c.focus.phase === "focus" ? ["Masih berapa lama fokusnya?"] : c.focus.phase === "break" ? ["Kita lagi istirahat, ya?"] : ["Temani aku kerja", "Ayo fokus bareng"]),
    weight: (c) => (c.focus.phase !== "idle" ? 3 : 0.8),
  },
  { id: "tugas", labels: () => ["Tugasku apa aja, ya?", "Ada yang belum kukerjakan?"], weight: (c) => (c.todos.open > 0 ? 1.2 : 0.5) },
  { id: "jadwal", labels: () => ["Ada jadwal apa nanti?", "Aku ada janji nggak?"], weight: (c) => (c.reminder ? 1.2 : 0.5) },
  { id: "main", labels: () => ["Main yuk!", "Mau main?"], weight: (c) => (c.trait === "aktif" ? 1.6 : 1) },
  {
    id: "tidur",
    labels: (c) => (late(c) ? ["Kok belum tidur?"] : ["Ngantuk nggak?"]),
    weight: (c) => (late(c) ? 3 : c.trait === "pemalas" ? 1.2 : 0.7),
  },
  { id: "cerita", labels: () => ["Ceritain sesuatu dong", "Punya cerita seru?"], weight: () => 1.3 },
  { id: "fakta", labels: () => ["Kasih tahu fakta kucing", "Tahu fakta unik?"], weight: () => 1 },
  { id: "teman", labels: () => ["Gimana teman-temanmu?"], weight: () => 0.9 },
  { id: "sayang", labels: () => ["Kamu sayang aku nggak?"], weight: () => 0.9 },
  { id: "puji", labels: (c) => (c.accessory ? ["Aksesorimu keren!", "Kamu lucu banget"] : ["Kamu lucu banget", "Bulumu bagus, deh"]), weight: () => 0.9 },
  { id: "ketik", labels: () => ["Kita sudah ngetik berapa?"], weight: (c) => (!c.typing.enabled ? 0 : c.typing.busy ? 2 : 0.6) },
  { id: "waktu", labels: () => ["Jam berapa sekarang?"], weight: () => 0.6 },
  { id: "rahasia", labels: () => ["Punya rahasia?"], weight: (c) => (c.hearts >= 3 ? 0.8 : 0.4) },
  { id: "nama", labels: () => ["Panggil aku dengan nama lain"], weight: (c) => (c.askedName ? 0.3 : 0) },
];

const TOPIC_BY_ID: Record<string, Topic> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

/** Jumlah giliran sebelum kucing bosan. */
function patience(c: ChatContext): number {
  const base = c.trait === "pemalas" ? 4 : c.trait === "manja" ? 7 : 6;
  return base + (c.hearts >= 4 ? 2 : 0);
}

// ---------------------------------------------------------------------------
// Percakapan

export class Conversation {
  private turns = 0;
  private discussed = new Set<string>();
  private friend: string | null = null;
  private lastTopic = "";

  constructor(
    private context: () => ChatContext,
    private hooks: ChatHooks,
  ) {}

  /** Langkah pertama: sapaan sesuai keadaan kucing, atau ajakan dari kucing. */
  open(invite: ChatInvite = null): ChatStep {
    const c = this.context();
    this.friend = c.others.length ? choose(c.others, c.rand) : null;
    if (c.mood === "sulk") {
      return { lines: this.say(c, OPEN_SULK), choices: this.sulkChoices(c), anim: undefined };
    }
    let lines: string[];
    let anim: ChatAnim | undefined = "talk";
    if (invite === "hungry") return this.topic("lapar", c);
    if (invite === "typing") return this.topic("ketik", c);
    if (invite === "rain") return this.topic("cuaca", c);
    if (invite === "story") return this.topic("cerita", c);
    if (invite === "night") return this.topic("tidur", c);
    if (c.mood === "sleepy") {
      lines = this.say(c, OPEN_SLEEPY);
      anim = "yawn";
    } else if (c.hungry && c.rand() < 0.7) lines = this.say(c, OPEN_HUNGRY);
    else if (late(c) && c.rand() < 0.7) lines = this.say(c, OPEN_LATE);
    else lines = this.say(c, OPEN);
    // Kenalan dulu: kucing yang cukup akrab menanyakan nama pemain sekali.
    if (!c.askedName && c.hearts >= 1 && c.mood !== "sleepy") {
      return { lines: [...lines, ...this.fillAll(c, pickFrom(c, ASK_NAME))], choices: [], anim, input: this.nameInput() };
    }
    return { lines, choices: this.menu(c), anim };
  }

  /** Pemain memilih salah satu kalimat. */
  choose(id: string): ChatStep {
    const c = this.context();
    this.turns += 1;
    if (TOPIC_BY_ID[id]) {
      this.discussed.add(id);
      this.lastTopic = id;
      return this.topic(id, c);
    }
    return this.reply(id, c);
  }

  /** Pemain mengisi nama panggilan. */
  submitName(text: string): ChatStep {
    this.discussed.add("nama");
    const clean = cleanPlayerName(text);
    if (!clean) {
      this.hooks.skipName();
      const c = this.context();
      return this.withMenu(c, { lines: this.fillAll(c, pickFrom(c, NAME_SKIP)), choices: [], anim: "talk" });
    }
    this.hooks.setName(clean);
    const c = this.context();
    return this.withMenu(c, { lines: this.fillAll(c, pickFrom(c, NAME_OK)), choices: [], anim: "happy", actions: ["hearts"] });
  }

  // -------------------------------------------------------------------------

  private say(c: ChatContext, pool: Pool): string[] {
    return this.fillAll(c, pickLines(c, pool));
  }

  private fillAll(c: ChatContext, lines: string[]): string[] {
    return lines.map((l) => fill(l, c, this.friend));
  }

  private nameInput(): ChatStep["input"] {
    return { placeholder: "Nama panggilanmu", submit: "Panggil aku ini", skipId: "nama.skip", skipLabel: "Rahasia, dong" };
  }

  /** Pilihan topik: yang paling relevan lebih sering muncul. */
  private menu(c: ChatContext): ChatChoice[] {
    const pool = TOPICS.filter((t) => t.id !== this.lastTopic && t.weight(c) > 0);
    const fresh = pool.filter((t) => !this.discussed.has(t.id));
    const candidates = (fresh.length >= 3 ? fresh : pool).map((t) => ({ t, w: t.weight(c) * (this.discussed.has(t.id) ? 0.3 : 1) }));
    const picked: Topic[] = [];
    // Topik yang sangat relevan (lapar, sudah larut, fokus berjalan) selalu ditawarkan.
    const urgent = candidates.filter((x) => !this.discussed.has(x.t.id) && x.t.weight(c) >= 2.5).sort((p, q) => q.w - p.w)[0];
    if (urgent) {
      picked.push(urgent.t);
      candidates.splice(candidates.indexOf(urgent), 1);
    }
    while (picked.length < 3 && candidates.length > 0) {
      const total = candidates.reduce((sum, x) => sum + x.w, 0);
      let roll = c.rand() * total;
      let index = candidates.findIndex((x) => (roll -= x.w) <= 0);
      if (index < 0) index = candidates.length - 1;
      picked.push(candidates[index].t);
      candidates.splice(index, 1);
    }
    const choices: ChatChoice[] = picked.map((t) => ({ id: t.id, label: choose(t.labels(c), c.rand) }));
    choices.push({ id: "bye", label: "Dah dulu, ya", kind: "bye" });
    return choices;
  }

  /** Tambahkan menu, atau akhiri dengan sopan bila kucing sudah bosan. */
  private withMenu(c: ChatContext, step: ChatStep): ChatStep {
    if (step.end || step.choices.length > 0 || step.input) return step;
    if (this.turns >= patience(c)) {
      return { ...step, lines: [...step.lines, ...this.say(c, BORED)], end: true };
    }
    return { ...step, choices: this.menu(c) };
  }

  private sulkChoices(c: ChatContext): ChatChoice[] {
    const list: ChatChoice[] = [{ id: "maaf", label: "Maaf, ya…" }];
    if (c.treats > 0) list.push({ id: "maaf.camilan", label: "Nih, camilan buat baikan" });
    list.push({ id: "bye", label: "Ya sudah, nanti lagi", kind: "bye" });
    return list;
  }

  /** Jawaban untuk sebuah topik dari menu. */
  private topic(id: string, c: ChatContext): ChatStep {
    const say = (pool: Pool) => this.say(c, pool);
    const from = (list: readonly Line[]) => this.fillAll(c, pickFrom(c, list));
    const step = (lines: string[], extra: Partial<ChatStep> = {}): ChatStep =>
      this.withMenu(c, { lines, choices: [], anim: "talk", ...extra });

    switch (id) {
      case "kabar": {
        const lines = c.facility && KABAR_WORK[c.facility] && c.rand() < 0.7 ? from(KABAR_WORK[c.facility]) : say(KABAR_FREE);
        if (c.hungry) lines.push(...from(KABAR_HUNGRY));
        return {
          lines,
          anim: "talk",
          choices: [
            { id: "elus", label: "Mau dielus?" },
            ...(c.hungry ? [{ id: "lapar", label: "Kamu lapar, ya?" }] : []),
            { id: "lanjut", label: "Oke, semangat!" },
          ],
        };
      }
      case "lapar": {
        if (!c.hungry) {
          const choices: ChatChoice[] = c.treats > 0 ? [{ id: "camilan", label: "Mau camilan?" }, { id: "lanjut", label: "Oke deh" }] : [];
          return step(say(LAPAR_NO), { choices });
        }
        const choices: ChatChoice[] = [];
        if (c.treats > 0) choices.push({ id: "camilan", label: "Nih, camilan" });
        if (c.canFeed) choices.push({ id: "makan", label: "Ayo makan, semuanya!" });
        choices.push({ id: "tunggu", label: "Tahan sebentar, ya" });
        return { lines: say(LAPAR_YES), choices, anim: "talk" };
      }
      case "cuaca":
        return step(this.weatherLines(c), {
          choices:
            c.weather.enabled && c.weather.source === "none" && !c.weather.place
              ? [{ id: "bukaCuaca", label: "Buka pengaturan cuaca" }, { id: "lanjut", label: "Nanti saja" }]
              : [],
        });
      case "capek":
        return {
          lines: say(CAPEK),
          anim: c.trait === "aktif" ? "stretch" : "talk",
          choices: [
            { id: "temani", label: "Temani aku istirahat" },
            ...(c.focus.phase === "idle" ? [{ id: "fokus.mulai", label: "Ayo fokus lagi" }] : []),
            { id: "curhat", label: "Cuma pengin cerita" },
          ],
        };
      case "semangat":
        return step(say(SEMANGAT), { anim: c.trait === "aktif" ? "zoomies" : "proud", actions: ["hearts"], end: c.trait === "aktif" });
      case "fokus":
        if (c.focus.phase === "focus") return step(from(FOKUS_RUNNING));
        if (c.focus.phase === "break") return step(from(FOKUS_BREAK));
        return {
          lines: from(FOKUS_OFFER),
          anim: "talk",
          choices: [
            { id: "fokus.mulai", label: "Mulai!" },
            { id: "fokus.nanti", label: "Nanti dulu" },
          ],
        };
      case "tugas":
        if (c.todos.open > 0 && c.todos.top) {
          return step(from(TUGAS_SOME), { choices: [{ id: "bukaTugas", label: "Buka daftar tugas" }, { id: "lanjut", label: "Oke, makasih" }] });
        }
        return step(from(TUGAS_NONE), { choices: [{ id: "bukaTugas", label: "Tambah tugas" }, { id: "lanjut", label: "Hehe" }] });
      case "jadwal":
        if (c.reminder) return step(from(JADWAL_SOME));
        return step(from(JADWAL_NONE), { choices: [{ id: "bukaPengingat", label: "Buat pengingat" }, { id: "lanjut", label: "Nanti saja" }] });
      case "main":
        return {
          lines: say(MAIN),
          anim: "play",
          choices: [
            { id: "main.bulu", label: "Ambil mainan bulu" },
            { id: "main.kejar", label: "Kejar-kejaran aja" },
          ],
        };
      case "tidur": {
        const lines = late(c) ? [...say(TIDUR_LATE), ...from(TIDUR_NIGHT)] : say(TIDUR);
        return {
          lines,
          anim: "yawn",
          choices: [
            { id: "tidur.ya", label: "Tidur sana" },
            { id: "tidur.temani", label: "Temani aku sebentar lagi" },
          ],
        };
      }
      case "cerita": {
        const story = STORIES[this.hooks.nextStory(STORIES.length)];
        return step([...from(STORY_INTRO), ...this.fillAll(c, [...story])]);
      }
      case "fakta":
        return step([...from(FACT_INTRO), choose(FACTS, c.rand)]);
      case "teman":
        if (!c.others.length) return step(from(SENDIRI));
        return step(say(TEMAN));
      case "sayang": {
        const tier = SAYANG[Math.max(0, Math.min(5, c.hearts))];
        return step(from(tier), { anim: c.hearts >= 3 ? "purr" : "talk", actions: c.hearts >= 2 ? ["hearts"] : [] });
      }
      case "puji":
        return step(c.accessory && c.rand() < 0.5 ? from(PUJI_ACC) : say(PUJI), { anim: "proud", actions: ["hearts"] });
      case "ketik":
        if (c.typing.busy && c.rand() < 0.6) return step(from(KETIK_BUSY));
        return step(from(c.typing.today > 0 ? KETIK_SOME : KETIK_NONE));
      case "waktu":
        return step([`Sekarang pukul ${c.clock}.`, ...from(WAKTU[c.phase] ?? WAKTU.siang)]);
      case "rahasia":
        if (c.hearts < 3) return step(from(RAHASIA_NO));
        return step(["Psst... jangan bilang siapa-siapa.", choose(RAHASIA, c.rand)], { anim: "happy" });
      case "nama":
        return { lines: ["Oh? Mau dipanggil apa sekarang?"], choices: [], anim: "talk", input: this.nameInput() };
      default:
        return this.reply(id, c);
    }
  }

  /** Jawaban untuk pilihan lanjutan (bukan topik menu). */
  private reply(id: string, c: ChatContext): ChatStep {
    const say = (pool: Pool) => this.say(c, pool);
    const from = (list: readonly Line[]) => this.fillAll(c, pickFrom(c, list));
    const step = (lines: string[], extra: Partial<ChatStep> = {}): ChatStep =>
      this.withMenu(c, { lines, choices: [], anim: "talk", ...extra });

    switch (id) {
      case "bye": {
        if (c.mood === "sulk") return { lines: from(BYE_SULK), choices: [], end: true };
        const lines = late(c) || c.phase === "malam" ? from(BYE_NIGHT) : c.phase === "pagi" || c.phase === "fajar" ? from(BYE_MORNING) : say(BYE);
        return { lines, choices: [], anim: "happy", end: true };
      }
      case "lanjut":
        return step([]);
      case "elus":
        return step(say(ELUS), { anim: "purr", actions: ["hearts"] });
      case "camilan":
        if (c.treats <= 0) return step(from(TREAT_NONE));
        return step(say(TREAT_GIVE), { anim: undefined, actions: ["treat"] });
      case "makan":
        if (!c.canFeed) return step(from(FEED_POOR));
        return { lines: from(FEED_ALL), choices: [], anim: "happy", actions: ["feedAll"], end: true };
      case "tunggu":
        return step(say(LAPAR_WAIT));
      case "bukaCuaca":
        return { lines: ["Oke! Pilih kotamu di situ, ya."], choices: [], anim: "happy", actions: ["openWeather"], end: true };
      case "bukaTugas":
        return { lines: ["Ini daftarnya. Semangat!"], choices: [], anim: "happy", actions: ["openTodos"], end: true };
      case "bukaPengingat":
        return { lines: ["Tulis pesannya dan jamnya. Nanti aku yang ngingetin."], choices: [], anim: "happy", actions: ["openReminders"], end: true };
      case "temani":
        return step(say(TEMANI), { anim: "purr", actions: ["hearts"] });
      case "curhat":
        return { lines: from(CURHAT), anim: "talk", choices: [{ id: "makasih", label: "Makasih, ya" }] };
      case "makasih":
        return step(say(MAKASIH), { anim: "happy", actions: ["hearts"] });
      case "fokus.mulai":
        if (c.focus.phase !== "idle") return step(from(FOKUS_RUNNING));
        return { lines: from(FOKUS_START), choices: [], anim: "happy", actions: ["focus"], end: true };
      case "fokus.nanti":
        return step(from(FOKUS_LATER));
      case "main.bulu":
        return { lines: from(MAIN_TOY), choices: [], anim: "play", actions: ["toy"], end: true };
      case "main.kejar":
        return { lines: from(MAIN_RUN), choices: [], anim: "zoomies", end: true };
      case "tidur.ya":
        return { lines: from(TIDUR_GO), choices: [], anim: "sleep", end: true };
      case "tidur.temani":
        return step(from(TIDUR_STAY), { anim: "purr" });
      case "maaf": {
        const forgive = c.hearts >= 2 ? c.rand() < 0.75 : c.rand() < 0.4;
        if (forgive) return step(from(MAAF_OK), { anim: "happy", actions: ["forgive"] });
        return { lines: from(MAAF_NO), choices: this.sulkChoices(c).filter((x) => x.id !== "maaf"), anim: undefined };
      }
      case "maaf.camilan":
        if (c.treats <= 0) return { lines: from(TREAT_NONE), choices: [{ id: "bye", label: "Ya sudah, nanti lagi", kind: "bye" } as ChatChoice] };
        return step(from(MAAF_TREAT), { anim: undefined, actions: ["treat", "forgive"] });
      case "nama.skip":
        this.hooks.skipName();
        this.discussed.add("nama");
        return step(from(NAME_SKIP));
      default:
        return step([]);
    }
  }

  private weatherLines(c: ChatContext): string[] {
    const w = c.weather;
    const from = (list: readonly Line[]) => this.fillAll(c, pickFrom(c, list));
    if (!w.enabled) return from(CUACA_OFF);
    if (w.source === "none") return from(CUACA_NONE);
    const key = w.kind === "clear" ? (w.night ? "clearNight" : "clearDay") : w.kind;
    const lines = this.say(c, CUACA_KIND[key] ?? CUACA_KIND.clearDay);
    if (w.temp !== null && w.source === "live") {
      if (w.temp >= 32) lines.push(...from(CUACA_HOT));
      else if (w.temp <= 18) lines.push(...from(CUACA_COLD));
      else if (w.place) lines.unshift(...from(CUACA_TEMP));
    }
    return lines;
  }
}

// ---------------------------------------------------------------------------
// Celoteh: satu kalimat pendek tanpa pilihan, atau ajakan ngobrol

export interface Chatter {
  line: string;
  /** Bila ada, kucing mengajak ngobrol dengan alasan ini. */
  invite: ChatInvite;
}

export function chatterLine(c: ChatContext, invite: boolean): Chatter {
  const friend = c.others.length ? choose(c.others, c.rand) : null;
  const f = (list: readonly Line[]) => pickFrom(c, list).map((l) => fill(l, c, friend))[0] ?? "Meong.";
  if (invite) {
    const reason: ChatInvite = c.hungry
      ? "hungry"
      : c.typing.busy
        ? "typing"
        : wet(c)
          ? "rain"
          : late(c)
            ? "night"
            : c.phase === "pagi"
              ? "morning"
              : "story";
    return { line: f(INVITE[reason]), invite: reason };
  }
  const options: (readonly Line[])[] = [];
  if (c.hungry) options.push(CHATTER_HUNGRY, CHATTER_HUNGRY);
  if (c.typing.busy) options.push(CHATTER_TYPING, CHATTER_TYPING);
  if (wet(c)) options.push(CHATTER_RAIN);
  if (late(c) || c.phase === "malam") options.push(CHATTER_NIGHT);
  if (c.phase === "pagi" || c.phase === "fajar") options.push(CHATTER_MORNING);
  if (friend) options.push(CHATTER_FRIEND);
  if (options.length && c.rand() < 0.6) return { line: f(choose(options, c.rand)), invite: null };
  return { line: pickLines(c, CHATTER).map((l) => fill(l, c, friend))[0] ?? "Meong.", invite: null };
}

export function visitorLine(rand: () => number): string {
  return choose(VISITOR, rand) as string;
}
