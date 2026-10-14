// UI asisten: tab Asisten (pengingat, fokus, tugas, sehat, cuaca) dan kartu
// pesan yang dibawa kucing saat pengingat berbunyi.

import {
  BREAK_CHOICES,
  FOCUS_CHOICES,
  WELLNESS_CHOICES,
  WELLNESS_KINDS,
  WELLNESS_TEXT,
  dateKey,
  defaultDateFor,
  describeRepeat,
  formatClock,
  formatCountdown,
  formatDay,
  formatIn,
  nextReminderAt,
  pad2,
  reminderDone,
  type Alert,
  type AlertKind,
} from "../core/assistant";
import { formatFish } from "../core/format";
import type { Game } from "../core/game";
import type { Repeat, WeatherKind, WeatherPlace, WellnessKind } from "../core/types";
import { PHASE_LABEL, WEATHER_KINDS, WEATHER_LABEL, cityClock, currentWeather, placeLabel, sunFor } from "../core/weather";
import type { ObjectId } from "../render/pixelart";
import { objectImageUrl } from "../render/textures";
import { h } from "./dom";
import { segmented } from "./widgets";
import type { SoundId } from "./sound";

export interface AssistantHost {
  toast(message: string, ms?: number): void;
  sound(id: SoundId): void;
  /** Bangun ulang panel (bila sedang terbuka). */
  rerender(): void;
  /** Bangun ulang panel hanya bila pemain tidak sedang mengetik/menekan. */
  rerenderIfIdle(): void;
  /** Posisi kepala kucing di layar, atau null. */
  catPosition(catId: string): { x: number; y: number } | null;
  /** Pesan selesai: kucing pembawa pesan boleh kembali beraktivitas. */
  alertDone(catId: string | null, key: string): void;
  weather: WeatherHost;
}

/** Layanan cuaca dari main (jaringan) dan Stage (ikon). */
export interface WeatherHost {
  /** Ambil data terbaru; mengembalikan pesan galat atau null bila berhasil. */
  refresh(): Promise<string | null>;
  search(name: string): Promise<WeatherPlace[]>;
  detect(): Promise<WeatherPlace | null>;
  icon(): ObjectId;
}

export type SubTab = "pengingat" | "fokus" | "tugas" | "sehat" | "cuaca";

const SUBTABS: { id: SubTab; label: string; icon: ObjectId }[] = [
  { id: "pengingat", label: "Pengingat", icon: "bell" },
  { id: "fokus", label: "Fokus", icon: "tomato" },
  { id: "tugas", label: "Tugas", icon: "star" },
  { id: "sehat", label: "Sehat", icon: "water" },
  { id: "cuaca", label: "Cuaca", icon: "partlyIcon" },
];

const ALERT_ICON: Record<AlertKind, ObjectId> = {
  reminder: "bell",
  focusDone: "tomato",
  breakDone: "tomato",
  water: "water",
  stretch: "heart",
  eyes: "eye",
  chime: "clock",
  bedtime: "moon",
};

const WELLNESS_LABEL: Record<WellnessKind, string> = {
  water: "Minum air",
  stretch: "Peregangan",
  eyes: "Istirahat mata (20 detik)",
};

const REPEAT_LABEL: Record<Repeat, string> = {
  once: "Sekali",
  daily: "Setiap hari",
  weekdays: "Senin–Jumat",
};

/** Pesan sehat yang tidak dijawab ditutup sendiri setelah sekian lama. */
const WELLNESS_TIMEOUT_MS = 3 * 60_000;

interface ShownAlert {
  alert: Alert;
  catId: string | null;
  el: HTMLElement;
  tail: HTMLElement;
  shownAt: number;
}

function nextFullHour(now: number): string {
  const d = new Date(now + 60 * 60_000);
  return `${pad2(d.getHours())}:00`;
}

export class AssistantUi {
  private sub: SubTab = "pengingat";
  private draft = { text: "", time: "", repeat: "once" as Repeat, date: "", dateTouched: false };
  private todoDraft = "";
  private current: ShownAlert | null = null;
  private queue: { alert: Alert; catId: string | null }[] = [];
  private raf = 0;
  private timeout = 0;

  constructor(
    private root: HTMLElement,
    private game: Game,
    private host: AssistantHost,
  ) {}

  // -------------------------------------------------------------------------
  // Kartu pesan

  showAlert(alert: Alert, catId: string | null): void {
    if (alert.kind === "chime") return;
    // Pesan sehat yang sama sudah tampil/antre: cukup satu.
    const isWellness = alert.kind in WELLNESS_TEXT;
    if (isWellness && (this.current?.alert.kind === alert.kind || this.queue.some((q) => q.alert.kind === alert.kind))) {
      this.host.alertDone(catId, alert.key);
      return;
    }
    if (this.current) {
      this.queue.push({ alert, catId });
      this.updateQueueBadge();
      return;
    }
    this.present(alert, catId);
  }

  /** Ada kartu pesan yang sedang tampil. */
  hasAlert(): boolean {
    return this.current !== null;
  }

  /** Kucing pembawa pesan diklik: sama dengan menekan tombol utama. */
  dismissForCat(catId: string): void {
    if (this.current?.catId === catId) this.finish("ok");
  }

  private present(alert: Alert, catId: string | null): void {
    const icon = ALERT_ICON[alert.kind];
    const buttons = this.buttonsFor(alert);
    const tail = h("div", { class: "alert-tail" });
    const sub = alert.kind === "reminder" ? alert.body : alert.missed ? `Terlambat · ${formatClock(alert.at)}` : formatClock(Date.now());
    const el = h(
      "div",
      { class: `card alert-card kind-${alert.kind}`, "data-hit": true, role: "alertdialog" },
      h(
        "div",
        { class: "alert-head" },
        h("img", { class: "px alert-icon", src: objectImageUrl(icon, 3), alt: "" }),
        h("div", { class: "alert-titles" }, h("div", { class: "alert-title" }, alert.title), h("div", { class: "alert-sub" }, sub)),
      ),
      alert.kind !== "reminder" && alert.body ? h("div", { class: "alert-body" }, alert.body) : null,
      alert.reward > 0 ? h("div", { class: "alert-reward" }, `+${formatFish(alert.reward)} ikan · semua kucing makin sayang`) : null,
      h("div", { class: "button-row" }, ...buttons),
      h("div", { class: "alert-queue" }),
      tail,
    );
    this.root.append(el);
    this.current = { alert, catId, el, tail, shownAt: Date.now() };
    this.updateQueueBadge();
    this.place();
    cancelAnimationFrame(this.raf);
    const loop = () => {
      if (!this.current) return;
      this.place();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    // Pesan sehat ditutup sendiri bila tidak dijawab (pakai timer, karena animasi
    // berhenti saat strip tersembunyi).
    window.clearTimeout(this.timeout);
    if (alert.kind in WELLNESS_TEXT) {
      const key = alert.key;
      this.timeout = window.setTimeout(() => {
        if (this.current?.alert.key === key) this.finish("later");
      }, WELLNESS_TIMEOUT_MS);
    }
  }

  private buttonsFor(alert: Alert): HTMLElement[] {
    const btn = (label: string, action: string, primary = false) =>
      h("button", { class: `btn${primary ? " btn-primary" : ""}`, onclick: () => this.finish(action) }, label);
    switch (alert.kind) {
      case "reminder":
        return [btn("Oke", "ok", true), btn("+5 menit", "snooze5"), btn("+15 menit", "snooze15")];
      case "focusDone":
        return [btn("Istirahat", "ok", true), btn("Lanjut fokus", "focusAgain")];
      case "breakDone":
        return [btn("Fokus lagi", "focusAgain", true), btn("Nanti", "ok")];
      case "water":
      case "stretch":
      case "eyes":
        return [btn(WELLNESS_TEXT[alert.kind].done, "ack", true), btn("Nanti", "later")];
      case "bedtime":
        return [btn("Selamat malam", "ok", true)];
      default:
        return [btn("Oke", "ok", true)];
    }
  }

  private finish(action: string): void {
    const cur = this.current;
    if (!cur) return;
    const now = Date.now();
    const { alert } = cur;
    switch (action) {
      case "snooze5":
      case "snooze15":
        if (alert.refId) {
          const minutes = action === "snooze5" ? 5 : 15;
          if (this.game.snoozeReminder(alert.refId, minutes, now)) {
            this.host.toast(`Oke, diingatkan lagi pukul ${formatClock(now + minutes * 60_000)}.`);
          } else this.host.toast("Pengingat itu sudah dihapus.");
        }
        break;
      case "focusAgain":
        this.game.startFocus(now);
        this.host.toast(`Fokus ${this.game.state.assistant.focus.focusMinutes} menit dimulai. Kucing-kucing ikut tenang.`);
        break;
      case "ack":
        if (alert.kind === "water" || alert.kind === "stretch" || alert.kind === "eyes") {
          const reward = this.game.ackWellness(alert.kind, now);
          this.host.toast(`Bagus! +${formatFish(reward)} ikan, kucing-kucing makin sayang.`);
        }
        break;
      default:
        break;
    }
    this.host.sound(action === "ok" || action === "ack" ? "pop" : "buy");
    cur.el.remove();
    this.current = null;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.timeout);
    this.host.alertDone(cur.catId, alert.key);
    this.host.rerenderIfIdle();
    // Pesan sehat yang sudah terlalu lama mengantre dilewati saja.
    let next = this.queue.shift();
    while (next && next.alert.kind in WELLNESS_TEXT && Date.now() - next.alert.at > WELLNESS_TIMEOUT_MS) {
      this.host.alertDone(next.catId, next.alert.key);
      next = this.queue.shift();
    }
    if (next) this.present(next.alert, next.catId);
  }

  private updateQueueBadge(): void {
    const badge = this.current?.el.querySelector(".alert-queue");
    if (badge) badge.textContent = this.queue.length > 0 ? `+${this.queue.length} pesan lagi` : "";
  }

  /** Kartu menempel di atas kepala kucing pembawa pesan (atau di atas panel bawah). */
  private place(): void {
    const cur = this.current;
    if (!cur) return;
    const el = cur.el;
    const w = el.offsetWidth || 290;
    const hgt = el.offsetHeight || 120;
    const pos = cur.catId ? this.host.catPosition(cur.catId) : null;
    if (!pos) {
      el.style.left = "";
      el.style.right = "12px";
      el.style.bottom = "62px";
      cur.tail.style.display = "none";
      return;
    }
    const left = Math.min(Math.max(8, pos.x - w / 2), window.innerWidth - w - 8);
    const bottom = Math.min(window.innerHeight - pos.y + 12, window.innerHeight - hgt - 4);
    el.style.right = "";
    el.style.left = `${Math.round(left)}px`;
    el.style.bottom = `${Math.round(bottom)}px`;
    cur.tail.style.display = "";
    cur.tail.style.left = `${Math.round(Math.min(w - 18, Math.max(10, pos.x - left - 7)))}px`;
  }

  // -------------------------------------------------------------------------
  // HUD

  /** Teks cip timer fokus, atau null bila tidak ada sesi. */
  focusChip(now: number): { text: string; phase: "focus" | "break" } | null {
    const f = this.game.state.assistant.focus;
    if (f.phase === "idle") return null;
    return { text: formatCountdown(f.endsAt - now), phase: f.phase };
  }

  // -------------------------------------------------------------------------
  // Tab Asisten

  renderTab(body: HTMLElement, now: number): void {
    body.append(
      h(
        "div",
        { class: "sticky" },
        segmented(SUBTABS, this.sub, (id) => {
          this.sub = id;
          this.host.rerender();
        }),
      ),
    );
    switch (this.sub) {
      case "pengingat":
        this.renderReminders(body, now);
        break;
      case "fokus":
        this.renderFocus(body, now);
        break;
      case "tugas":
        this.renderTodos(body);
        break;
      case "sehat":
        this.renderWellness(body);
        break;
      case "cuaca":
        this.renderWeather(body, now);
        break;
    }
  }

  /** Satu kalimat ringkas untuk judul panel: sesi fokus, pengingat terdekat, atau tugas. */
  headline(now: number): string {
    const a = this.game.state.assistant;
    if (a.focus.phase === "focus") return `Fokus, ${formatCountdown(a.focus.endsAt - now)} lagi`;
    if (a.focus.phase === "break") return `Istirahat, ${formatCountdown(a.focus.endsAt - now)} lagi`;
    let soonest: { at: number; text: string } | null = null;
    for (const r of a.reminders) {
      const at = nextReminderAt(r);
      if (at !== null && at > now && (!soonest || at < soonest.at)) soonest = { at, text: r.text };
    }
    if (soonest) return `Berikutnya: ${soonest.text}, ${formatDay(soonest.at, now)} ${formatClock(soonest.at)}`;
    const open = a.todos.filter((t) => !t.done).length;
    return open > 0 ? `${open} tugas belum selesai` : "";
  }

  /** Pindah ke sub-tab; true bila sebelumnya berada di sub-tab lain. */
  openSub(sub: SubTab): boolean {
    const changed = this.sub !== sub;
    this.sub = sub;
    return changed;
  }

  // -------------------------------------------------------------------------
  // Cuaca

  private weatherQuery = "";
  private weatherResults: WeatherPlace[] | null = null;
  private weatherStatus = "";
  /** Jumlah tugas cuaca yang sedang berjalan, dan nomor tugas terakhir (pemilik baris status). */
  private weatherRunning = 0;
  private weatherSeq = 0;

  private get weatherBusy(): boolean {
    return this.weatherRunning > 0;
  }

  /**
   * Jalankan tugas jaringan dengan baris status. Tugas `exclusive` diabaikan bila ada
   * tugas lain yang berjalan (mencegah klik ganda); mengambil cuaca untuk kota yang
   * baru dipilih selalu dijalankan.
   */
  private async weatherTask(label: string, task: () => Promise<string | null>, exclusive = true): Promise<void> {
    if (exclusive && this.weatherBusy) return;
    const seq = ++this.weatherSeq;
    this.weatherRunning++;
    this.weatherStatus = label;
    this.host.rerender();
    let status = "";
    try {
      status = (await task()) ?? "";
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    } finally {
      this.weatherRunning--;
      // Hanya tugas terakhir yang menentukan isi baris status.
      if (seq === this.weatherSeq) this.weatherStatus = status;
      this.host.rerender();
    }
  }

  private choosePlace(place: WeatherPlace): void {
    this.game.setWeatherPlace(place, Date.now());
    this.weatherResults = null;
    this.weatherQuery = "";
    this.host.sound("pop");
    void this.weatherTask("Mengambil cuaca…", () => this.host.weather.refresh(), false);
  }

  private renderWeather(body: HTMLElement, now: number): void {
    const w = this.game.state.weather;
    const cw = currentWeather(w, now);
    const phase = this.game.phase(now);
    const sun = sunFor(now, w.last);
    const live = cw.source === "live" && w.last;

    let title: string;
    if (!w.enabled) title = "Efek cuaca mati";
    else if (cw.source === "manual") title = `${WEATHER_LABEL[cw.kind]} (pilihanmu)`;
    else if (live) title = WEATHER_LABEL[cw.kind];
    else title = w.place ? "Menunggu data cuaca…" : "Pilih kotamu";
    const temp = live && w.last ? `${Math.round(w.last.temp)}°` : "";

    const card = h(
      "div",
      { class: `weather-card phase-${phase}` },
      h("img", { class: "px weather-icon", src: objectImageUrl(this.host.weather.icon(), 4), alt: "" }),
      h(
        "div",
        { class: "info" },
        h("div", { class: "weather-title" }, title, temp ? h("span", { class: "weather-temp" }, temp) : null),
        h(
          "div",
          { class: "desc" },
          `${w.place ? `${w.place.name} · ` : ""}${PHASE_LABEL[phase]} · terbit ${cityClock(sun.sunrise, sun.utcOffset)} · terbenam ${cityClock(sun.sunset, sun.utcOffset)}`,
        ),
        live && w.last
          ? h(
              "div",
              { class: "desc" },
              `Terasa ${Math.round(w.last.feels)}° · lembap ${Math.round(w.last.humidity)}% · angin ${Math.round(w.last.wind)} km/j · diperbarui ${Math.max(0, Math.round((now - w.last.fetchedAt) / 60_000))} menit lalu`,
            )
          : null,
      ),
    );
    body.append(card);
    if (this.weatherStatus) body.append(h("p", { class: "desc status" }, this.weatherStatus));

    // Lokasi
    const search = () => {
      const q = this.weatherQuery.trim();
      if (q.length < 2) return;
      void this.weatherTask("Mencari…", async () => {
        const results = await this.host.weather.search(q);
        this.weatherResults = results;
        return results.length === 0 ? `Kota “${q}” tidak ditemukan.` : null;
      });
    };
    body.append(
      h("h3", null, "Lokasi"),
      h("p", { class: "desc" }, w.place ? `Sekarang: ${placeLabel(w.place)}` : "Belum ada kota. Cari kotamu atau deteksi otomatis."),
      h(
        "div",
        { class: "form-card" },
        h(
          "div",
          { class: "form-row" },
          h("input", {
            class: "field-input grow",
            placeholder: "Nama kota, misalnya Bandung",
            value: this.weatherQuery,
            oninput: (e: Event) => (this.weatherQuery = (e.target as HTMLInputElement).value),
            onkeydown: (e: KeyboardEvent) => {
              e.stopPropagation();
              if (e.key === "Enter") search();
            },
          }),
          h("button", { class: "btn btn-primary", disabled: this.weatherBusy, onclick: search }, "Cari"),
        ),
        h(
          "div",
          { class: "form-row" },
          h(
            "button",
            {
              class: "btn small",
              disabled: this.weatherBusy,
              title: "Perkiraan lokasi dari alamat internet (GeoJS)",
              onclick: () =>
                void this.weatherTask("Mendeteksi lokasi…", async () => {
                  const place = await this.host.weather.detect();
                  if (!place) return "Lokasi tidak bisa dideteksi. Cari kotamu secara manual.";
                  this.choosePlace(place);
                  return null;
                }),
            },
            "Deteksi otomatis",
          ),
          w.place
            ? h(
                "button",
                {
                  class: "btn small",
                  disabled: this.weatherBusy,
                  onclick: () => void this.weatherTask("Mengambil cuaca…", () => this.host.weather.refresh()),
                },
                "Perbarui cuaca",
              )
            : null,
        ),
      ),
    );
    if (this.weatherResults && this.weatherResults.length > 0) {
      const list = h("div", { class: "place-list" });
      for (const p of this.weatherResults) {
        list.append(h("button", { class: "place", onclick: () => this.choosePlace(p) }, h("b", null, p.name), h("span", null, [p.region, p.country].filter(Boolean).join(", "))));
      }
      body.append(list);
    }

    // Mode dan pilihan
    const mode = h("select", {
      class: "field-input",
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        this.game.updateWeather({ mode: v === "auto" ? "auto" : (v as WeatherKind) }, Date.now());
        (e.target as HTMLSelectElement).blur();
        this.host.rerender();
      },
    });
    mode.append(h("option", { value: "auto", selected: w.mode === "auto" }, "Ikuti cuaca sungguhan"));
    for (const k of WEATHER_KINDS) mode.append(h("option", { value: k, selected: w.mode === k }, `Selalu ${WEATHER_LABEL[k].toLowerCase()}`));
    const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) =>
      h(
        "label",
        { class: "setting toggle" },
        h("span", null, label),
        h("input", { type: "checkbox", checked: value, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }),
      );
    body.append(
      h("h3", null, "Tampilan"),
      h("div", { class: "setting" }, h("span", null, "Cuaca di strip"), mode),
      toggle("Efek cuaca (hujan, awan, kabut, petir)", w.enabled, (v) => this.game.updateWeather({ enabled: v }, Date.now())),
      toggle("Warna cahaya siang–malam pada kucing", w.tint, (v) => this.game.updateWeather({ tint: v }, Date.now())),
      toggle("Suara hujan dan guruh", w.rainSound, (v) => this.game.updateWeather({ rainSound: v }, Date.now())),
      toggle("Kucing menyapa pagi, siang, sore, malam", w.greet, (v) => this.game.updateWeather({ greet: v }, Date.now())),
      h("p", { class: "desc help" }, "Data cuaca dari Open-Meteo.com (gratis, tanpa akun), diperbarui tiap 20 menit. Deteksi otomatis memakai GeoJS dan hanya berjalan saat tombolnya ditekan."),
    );
  }

  private renderReminders(body: HTMLElement, now: number): void {
    const a = this.game.state.assistant;
    const d = this.draft;
    if (!d.time) d.time = nextFullHour(now);
    if (!d.date) d.date = defaultDateFor(d.time, now);

    const add = () => {
      const r = this.game.addReminder({ text: d.text, time: d.time, repeat: d.repeat, date: d.date }, Date.now());
      if (!r) {
        this.host.sound("denied");
        this.host.toast(d.text.trim() ? "Waktunya sudah lewat. Pilih jam atau tanggal lain." : "Tulis dulu pesannya, misalnya “Meeting tim”.");
        return;
      }
      this.host.sound("buy");
      const next = nextReminderAt(r);
      this.host.toast(next ? `Siap! Kucing akan mengingatkan ${formatDay(next, Date.now())} pukul ${formatClock(next)}.` : "Pengingat disimpan.");
      this.draft = { text: "", time: "", repeat: d.repeat, date: "", dateTouched: false };
      this.host.rerender();
    };

    const text = h("input", {
      class: "field-input grow",
      placeholder: "Contoh: Meeting tim",
      maxLength: 80,
      value: d.text,
      oninput: (e: Event) => (d.text = (e.target as HTMLInputElement).value),
      onkeydown: (e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === "Enter") add();
      },
    });
    const time = h("input", {
      class: "field-input",
      type: "time",
      value: d.time,
      oninput: (e: Event) => {
        d.time = (e.target as HTMLInputElement).value;
        // Tanggal diisi otomatis hanya bila pemain belum memilihnya sendiri.
        if (d.repeat === "once" && !d.dateTouched) {
          d.date = defaultDateFor(d.time, Date.now());
          if (date) date.value = d.date;
        }
      },
      onkeydown: (e: KeyboardEvent) => e.stopPropagation(),
    });
    const repeat = h("select", {
      class: "field-input",
      onchange: (e: Event) => {
        d.repeat = (e.target as HTMLSelectElement).value as Repeat;
        (e.target as HTMLSelectElement).blur();
        this.host.rerender();
      },
    });
    for (const id of ["once", "daily", "weekdays"] as Repeat[]) repeat.append(h("option", { value: id, selected: d.repeat === id }, REPEAT_LABEL[id]));
    const date =
      d.repeat === "once"
        ? h("input", {
            class: "field-input",
            type: "date",
            value: d.date,
            min: dateKey(now),
            oninput: (e: Event) => {
              d.date = (e.target as HTMLInputElement).value;
              d.dateTouched = true;
            },
            onkeydown: (e: KeyboardEvent) => e.stopPropagation(),
          })
        : null;

    body.append(
      h(
        "div",
        { class: "form-card" },
        h("div", { class: "form-row" }, text),
        h("div", { class: "form-row" }, time, repeat, date, h("button", { class: "btn btn-primary", onclick: add }, "Tambah")),
      ),
    );

    const list = [...a.reminders].sort((p, q) => {
      const np = nextReminderAt(p) ?? Infinity;
      const nq = nextReminderAt(q) ?? Infinity;
      return np - nq || p.time.localeCompare(q.time);
    });
    if (list.length === 0) {
      body.append(
        h(
          "p",
          { class: "empty" },
          "Belum ada pengingat. Saat waktunya tiba, seekor kucing berlari ke tengah layar membawa pesanmu dan mengeong sampai kamu membacanya.",
        ),
      );
    }
    for (const r of list) {
      const next = nextReminderAt(r);
      const done = reminderDone(r);
      let status: string;
      if (!r.enabled) status = "Mati";
      else if (done) status = "Sudah berbunyi";
      else if (r.snoozeUntil) status = `Ditunda sampai ${formatClock(r.snoozeUntil)}`;
      else status = next ? `berbunyi ${formatIn(next - now)}` : "";
      body.append(
        h(
          "div",
          { class: `rem-row${!r.enabled || done ? " off" : ""}` },
          h("div", { class: "rem-time" }, r.time.replace(":", ".")),
          h(
            "div",
            { class: "info" },
            h("div", { class: "name" }, r.text),
            h("div", { class: "desc" }, `${describeRepeat(r, now)} · ${status}`),
          ),
          done
            ? null
            : h("input", {
                type: "checkbox",
                class: "switch",
                title: r.enabled ? "Matikan" : "Nyalakan",
                checked: r.enabled,
                onchange: (e: Event) => {
                  const on = (e.target as HTMLInputElement).checked;
                  if (!this.game.setReminderEnabled(r.id, on, Date.now())) {
                    this.host.sound("denied");
                    this.host.toast("Waktunya sudah lewat. Buat pengingat baru, ya.");
                  }
                  this.host.rerender();
                },
              }),
          h(
            "button",
            {
              class: "link",
              title: "Hapus",
              onclick: () => {
                this.game.deleteReminder(r.id);
                this.host.rerender();
              },
            },
            "✕",
          ),
        ),
      );
    }
    body.append(
      h(
        "p",
        { class: "desc help" },
        a.nativeNotify
          ? "Pengingat juga muncul sebagai notifikasi Windows, jadi tetap terdengar saat strip disembunyikan atau kamu sedang presentasi layar penuh."
          : "Notifikasi Windows dimatikan (bisa dinyalakan di tab Sehat → Lainnya).",
      ),
    );
  }

  private renderFocus(body: HTMLElement, now: number): void {
    const a = this.game.state.assistant;
    const f = a.focus;
    const active = f.phase !== "idle";
    const total = (f.endsAt - f.startedAt) || 1;
    const progress = active ? Math.min(1, Math.max(0, (now - f.startedAt) / total)) : 0;
    const today = f.todayDate === dateKey(now) ? f.todayCount : 0;

    const box = h(
      "div",
      { class: `focus-box${f.phase === "break" ? " break" : ""}` },
      h("div", { class: "focus-phase" }, f.phase === "focus" ? "Sedang fokus" : f.phase === "break" ? "Istirahat" : "Siap fokus?"),
      h("div", { class: "focus-time" }, active ? formatCountdown(f.endsAt - now) : formatCountdown(f.focusMinutes * 60_000)),
      h("div", { class: "meter" }, h("i", { style: { width: `${Math.round(progress * 100)}%` } })),
      h(
        "div",
        { class: "button-row center" },
        active
          ? h(
              "button",
              {
                class: "btn",
                onclick: () => {
                  this.game.stopFocus();
                  this.host.sound("pop");
                  this.host.rerender();
                },
              },
              f.phase === "focus" ? "Hentikan" : "Lewati istirahat",
            )
          : h(
              "button",
              {
                class: "btn btn-primary",
                onclick: () => {
                  this.game.startFocus(Date.now());
                  this.host.sound("chirp");
                  this.host.toast(`Fokus ${f.focusMinutes} menit dimulai. Kucing-kucing ikut tenang.`);
                  this.host.rerender();
                },
              },
              "Mulai fokus",
            ),
      ),
    );
    body.append(box);

    const seg = (values: readonly number[], current: number, onPick: (v: number) => void) =>
      h(
        "div",
        { class: "segmented" },
        ...values.map((v) =>
          h(
            "button",
            {
              class: `btn small${current === v ? " active" : ""}`,
              disabled: active,
              onclick: () => {
                onPick(v);
                this.host.rerender();
              },
            },
            `${v}`,
          ),
        ),
      );
    body.append(
      h("div", { class: "setting" }, h("span", null, "Lama fokus (menit)"), seg(FOCUS_CHOICES, f.focusMinutes, (v) => this.game.setFocusDurations(v, f.breakMinutes))),
      h("div", { class: "setting" }, h("span", null, "Lama istirahat (menit)"), seg(BREAK_CHOICES, f.breakMinutes, (v) => this.game.setFocusDurations(f.focusMinutes, v))),
    );
    const tomatoes = h("div", { class: "tomatoes" });
    for (let i = 0; i < Math.min(today, 12); i++) tomatoes.append(h("img", { class: "px", src: objectImageUrl("tomato", 2), alt: "" }));
    if (today > 12) tomatoes.append(h("span", null, ` +${today - 12}`));
    body.append(
      h("h3", null, "Hari ini"),
      today > 0 ? tomatoes : h("p", { class: "desc" }, "Belum ada sesi fokus hari ini."),
      h(
        "p",
        { class: "desc" },
        `Total ${this.game.state.stats.focusSessions} sesi (${this.game.state.stats.focusMinutes} menit). Setiap sesi selesai memberi ikan dan ikatan untuk semua kucing. Selama fokus, kucing ikut tenang.`,
      ),
    );
  }

  private renderTodos(body: HTMLElement): void {
    const a = this.game.state.assistant;
    const add = () => {
      const t = this.game.addTodo(this.todoDraft, Date.now());
      if (!t) {
        this.host.sound("denied");
        return;
      }
      this.todoDraft = "";
      this.host.sound("buy");
      this.host.rerender();
    };
    body.append(
      h(
        "div",
        { class: "form-card" },
        h(
          "div",
          { class: "form-row" },
          h("input", {
            class: "field-input grow",
            placeholder: "Tugas baru, misalnya: kirim laporan",
            maxLength: 100,
            value: this.todoDraft,
            oninput: (e: Event) => (this.todoDraft = (e.target as HTMLInputElement).value),
            onkeydown: (e: KeyboardEvent) => {
              e.stopPropagation();
              if (e.key === "Enter") add();
            },
          }),
          h("button", { class: "btn btn-primary", onclick: add }, "Tambah"),
        ),
      ),
    );
    const todos = [...a.todos].sort((p, q) => Number(p.done) - Number(q.done) || p.createdAt - q.createdAt);
    if (todos.length === 0) body.append(h("p", { class: "empty" }, "Daftar tugas kosong. Setiap tugas yang kamu centang dihadiahi ikan oleh kucing-kucing."));
    for (const t of todos) {
      body.append(
        h(
          "div",
          { class: `todo-row${t.done ? " done" : ""}` },
          h("input", {
            type: "checkbox",
            checked: t.done,
            onchange: () => {
              const reward = this.game.toggleTodo(t.id, Date.now());
              if (reward > 0) {
                this.host.sound("coin");
                this.host.toast(`Tugas selesai! +${formatFish(reward)} ikan`);
              } else if (!t.done) this.host.sound("pop");
              this.host.rerender();
            },
          }),
          h("span", { class: "todo-text" }, t.text),
          h(
            "button",
            {
              class: "link",
              title: "Hapus",
              onclick: () => {
                this.game.deleteTodo(t.id);
                this.host.rerender();
              },
            },
            "✕",
          ),
        ),
      );
    }
    const done = a.todos.filter((t) => t.done).length;
    if (a.todos.length > 0) {
      body.append(
        h(
          "div",
          { class: "setting" },
          h("span", { class: "desc" }, `${done} dari ${a.todos.length} selesai`),
          h(
            "button",
            {
              class: "btn small",
              disabled: done === 0,
              onclick: () => {
                this.game.clearDoneTodos();
                this.host.rerender();
              },
            },
            "Hapus yang selesai",
          ),
        ),
      );
    }
  }

  private renderWellness(body: HTMLElement): void {
    const a = this.game.state.assistant;
    const w = a.wellness;
    body.append(h("p", { class: "desc" }, "Kucing datang mengingatkan dengan lembut. Ikuti sarannya untuk hadiah ikan kecil."));
    for (const kind of WELLNESS_KINDS) {
      const select = h("select", {
        class: "field-input",
        onchange: (e: Event) => {
          this.game.setWellnessInterval(kind, Number((e.target as HTMLSelectElement).value), Date.now());
          (e.target as HTMLSelectElement).blur();
          this.host.rerender();
        },
      });
      for (const m of WELLNESS_CHOICES[kind]) select.append(h("option", { value: String(m), selected: w.intervals[kind] === m }, m === 0 ? "Mati" : `Tiap ${m} menit`));
      body.append(h("div", { class: "setting" }, h("span", null, WELLNESS_LABEL[kind]), select));
    }
    const timeInput = (value: string, onChange: (v: string) => void) =>
      h("input", {
        class: "field-input",
        type: "time",
        value,
        onchange: (e: Event) => onChange((e.target as HTMLInputElement).value),
        onkeydown: (e: KeyboardEvent) => e.stopPropagation(),
      });
    body.append(
      h(
        "div",
        { class: "setting" },
        h("span", null, "Jam aktif"),
        h(
          "div",
          { class: "form-row tight" },
          timeInput(w.from, (v) => this.game.setActiveHours(v, w.to)),
          h("span", null, "–"),
          timeInput(w.to, (v) => this.game.setActiveHours(w.from, v)),
        ),
      ),
    );

    body.append(h("h3", null, "Lainnya"));
    const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) =>
      h(
        "label",
        { class: "setting toggle" },
        h("span", null, label),
        h("input", { type: "checkbox", checked: value, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }),
      );
    body.append(
      toggle("Kucing mengeong setiap jam (08.00–22.00)", a.chime, (v) => this.game.updateAssistant({ chime: v })),
      h(
        "div",
        { class: "setting" },
        h(
          "label",
          { class: "inline-toggle" },
          h("input", {
            type: "checkbox",
            checked: a.bedtime !== null,
            onchange: (e: Event) => {
              this.game.updateAssistant({ bedtime: (e.target as HTMLInputElement).checked ? "23:00" : null });
              this.host.rerender();
            },
          }),
          h("span", null, "Pengingat jam tidur"),
        ),
        a.bedtime ? timeInput(a.bedtime, (v) => this.game.updateAssistant({ bedtime: v })) : null,
      ),
      toggle("Tampilkan jam di panel bawah", a.clock, (v) => this.game.updateAssistant({ clock: v })),
      toggle("Munculkan strip yang disembunyikan saat pengingat berbunyi", a.showOnAlert, (v) => this.game.updateAssistant({ showOnAlert: v })),
      toggle("Notifikasi Windows untuk pengingat dan timer fokus", a.nativeNotify, (v) => this.game.updateAssistant({ nativeNotify: v })),
    );
  }
}
