// Antarmuka HTML di atas kanvas: HUD, panel bertab, dialog adopsi, dan notifikasi.

import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, describeReward } from "../core/achievements";
import { formatClock, type Alert } from "../core/assistant";
import { ACCESSORIES, ACCESSORY_BY_ID, BALANCE, COATS, COAT_BY_ID, FACILITIES, RARITY_LABEL, TRAITS } from "../core/data";
import {
  catContribution,
  catsAt,
  facilityRate,
  fishToNextStar,
  hearts,
  isHungry,
  offlineCapHours,
  spiritActive,
} from "../core/economy";
import { formatDuration, formatFish, formatPercent, formatRate } from "../core/format";
import type { Game, GameEvent } from "../core/game";
import type { CatState, FacilityId } from "../core/types";
import { FACILITY_IDS } from "../core/types";
import type { ObjectId } from "../render/pixelart";
import { catImageUrl, objectImageUrl, silhouetteUrl } from "../render/textures";
import { AssistantUi, type WeatherHost } from "./assistantUi";
import { PHASE_LABEL, WEATHER_LABEL, currentWeather, isWet } from "../core/weather";
import { clear, h } from "./dom";
import type { SoundId } from "./sound";

/** Nama pendek fasilitas untuk pilihan tugas yang sempit. */
const SHORT_NAME: Record<FacilityId, string> = {
  mangkuk: "Mangkuk",
  benang: "Benang",
  kardus: "Kardus",
  tiang: "Tiang",
  akuarium: "Akuarium",
  rak: "Rak jendela",
};

const TIPS_KEY = "meow-corner.tips";

export type TabId = "toko" | "kucing" | "asisten" | "koleksi" | "rumah" | "atur";

const TABS: { id: TabId; label: string }[] = [
  { id: "toko", label: "Toko" },
  { id: "kucing", label: "Kucing" },
  { id: "asisten", label: "Asisten" },
  { id: "koleksi", label: "Koleksi" },
  { id: "rumah", label: "Rumah" },
  { id: "atur", label: "Atur" },
];

/** Mode interaksi strip yang dikendalikan dari HUD. */
export interface Interactions {
  toyMode(): boolean;
  setToyMode(on: boolean): void;
  treatMode(): boolean;
  setTreatMode(on: boolean): void;
  callCat(catId: string): void;
}

export interface UiDeps {
  sound(id: SoundId): void;
  /** Dengar volume baru sambil menggeser (belum disimpan). */
  previewVolume(volume: number): void;
  interactions: Interactions;
  /** true bila berhasil tersimpan. */
  saveNow(): Promise<boolean>;
  hide(): Promise<void>;
  quit(): Promise<void>;
  resetProgress(): Promise<void>;
  canHide: boolean;
  /** Posisi kepala kucing di layar (untuk kartu pesan). */
  catPosition(catId: string): { x: number; y: number } | null;
  /** Pesan asisten sudah dibaca: lepaskan kucing pembawa pesan. */
  alertDone(catId: string | null, key: string): void;
  /** Ambil foto strip; mengembalikan path file (null di browser). */
  takePhoto(): Promise<string | null>;
  openPhotoFolder(): Promise<void>;
  canOpenFolder: boolean;
  weather: WeatherHost;
}

export class Ui {
  private hud: HTMLElement;
  private fishEl: HTMLElement;
  private rateEl: HTMLElement;
  private feedBtn: HTMLButtonElement;
  private feedLabel: HTMLElement;
  private shopBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private soundIcon: HTMLImageElement;
  private toyBtn: HTMLButtonElement;
  private treatBtn: HTMLButtonElement;
  private treatCount: HTMLElement;
  private focusChip: HTMLButtonElement;
  private weatherChip: HTMLButtonElement;
  private weatherIcon: HTMLImageElement;
  private weatherTemp: HTMLElement;
  private focusText: HTMLElement;
  readonly assistant: AssistantUi;
  private panel: HTMLElement | null = null;
  private panelBody: HTMLElement | null = null;
  private tab: TabId = "toko";
  private toasts: HTMLElement;
  private dialog: HTMLElement | null = null;
  private highlight: FacilityId | null = null;
  private renamingCat: string | null = null;
  private confirmUntil = new Map<string, number>();
  /** true selama tombol mouse ditekan, agar klik tidak hilang karena panel dibangun ulang. */
  private pointerHeld = false;
  private seenTips = new Set<string>();

  constructor(
    private root: HTMLElement,
    private game: Game,
    private deps: UiDeps,
  ) {
    this.fishEl = h("span", { class: "hud-fish" }, "0");
    this.rateEl = h("span", { class: "hud-rate" }, "0/dtk");
    /** Tombol dengan ikon (mode ringkas) dan tulisan (mode lengkap). */
    const iconLabel = (icon: ObjectId, label: string) => [
      h("img", { class: "px ico", src: objectImageUrl(icon, 2), alt: "" }),
      h("span", { class: "lbl" }, label),
    ];
    this.feedLabel = h("span", { class: "lbl" }, "Beri makan");
    this.feedBtn = h(
      "button",
      { class: "btn btn-feed", onclick: () => this.feedAll() },
      h("img", { class: "px ico", src: objectImageUrl("mangkuk", 2), alt: "" }),
      this.feedLabel,
    );
    this.shopBtn = h("button", { class: "btn btn-text", title: "Toko", onclick: () => this.togglePanel("toko") }, ...iconLabel("bag", "Toko"));
    this.soundIcon = h("img", { class: "px", src: objectImageUrl("speaker", 2), alt: "Suara" });
    this.soundBtn = h(
      "button",
      {
        class: "btn btn-icon btn-mode",
        title: "Suara",
        onclick: () => {
          const on = !this.game.state.settings.sound;
          this.game.updateSettings({ sound: on });
          if (on) this.deps.sound("meow");
        },
      },
      this.soundIcon,
    );
    this.toyBtn = h(
      "button",
      { class: "btn btn-icon btn-mode", title: "Mainan bulu: kucing mengejar kursormu", onclick: () => this.toggleToy() },
      h("img", { class: "px", src: objectImageUrl("feather", 2), alt: "Mainan" }),
    );
    this.treatCount = h("span", { class: "mode-count" }, "0");
    this.treatBtn = h(
      "button",
      { class: "btn btn-icon btn-mode", title: "Camilan: klik kucing untuk memberinya", onclick: () => this.toggleTreat() },
      h("img", { class: "px", src: objectImageUrl("treat", 2), alt: "Camilan" }),
      this.treatCount,
    );
    this.focusText = h("span", { class: "mode-count" }, "");
    this.focusChip = h(
      "button",
      { class: "btn btn-mode focus-chip", title: "Timer fokus", onclick: () => this.openPanel("asisten") },
      h("img", { class: "px", src: objectImageUrl("tomato", 2), alt: "" }),
      this.focusText,
    );
    this.focusChip.style.display = "none";
    this.weatherIcon = h("img", { class: "px", src: objectImageUrl("sun", 2), alt: "" });
    this.weatherTemp = h("span", { class: "mode-count" }, "");
    this.weatherChip = h(
      "button",
      {
        class: "btn btn-mode weather-chip",
        title: "Cuaca dan waktu",
        onclick: () => {
          const switched = this.assistant.openSub("cuaca");
          if (this.panel && this.tab === "asisten" && !switched) this.closePanel();
          else this.openPanel("asisten");
        },
      },
      this.weatherIcon,
      this.weatherTemp,
    );
    this.hud = h(
      "div",
      { class: "card hud", "data-hit": true },
      h(
        "div",
        {
          class: "hud-counter",
          title: "Ikan",
          // Saat diciutkan, pil ikan ini membuka panel bawah lagi.
          onclick: () => {
            if (this.game.state.settings.hudCollapsed) this.setCollapsed(false);
          },
        },
        h("img", { class: "px hud-icon", src: objectImageUrl("fish", 2), alt: "" }),
        h("div", { class: "hud-numbers" }, this.fishEl, this.rateEl),
      ),
      this.feedBtn,
      this.focusChip,
      this.weatherChip,
      this.toyBtn,
      this.treatBtn,
      h(
        "button",
        { class: "btn btn-icon btn-mode", title: "Asisten: pengingat, fokus, tugas", onclick: () => this.togglePanel("asisten") },
        h("img", { class: "px", src: objectImageUrl("bell", 2), alt: "Asisten" }),
      ),
      this.soundBtn,
      this.shopBtn,
      h("button", { class: "btn btn-text", title: "Kucing", onclick: () => this.togglePanel("kucing") }, ...iconLabel("paw", "Kucing")),
      h("button", { class: "btn btn-icon", title: "Menu lain", onclick: () => this.togglePanel("koleksi") }, "⋯"),
      h("button", { class: "btn btn-icon hud-collapse", title: "Kecilkan panel", onclick: () => this.setCollapsed(true) }, "‹"),
      h("button", { class: "btn btn-icon hud-expand", title: "Besarkan panel", onclick: () => this.setCollapsed(false) }, "›"),
    );
    this.applyHudSettings();
    this.toasts = h("div", { class: "toasts" });
    root.append(this.toasts, this.hud);
    this.assistant = new AssistantUi(root, game, {
      toast: (m, ms) => this.toast(m, ms),
      sound: (id) => deps.sound(id),
      rerender: () => this.renderPanel(),
      rerenderIfIdle: () => this.refreshPanelIfIdle(),
      catPosition: (id) => deps.catPosition(id),
      alertDone: (id, key) => deps.alertDone(id, key),
      weather: deps.weather,
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.dialog) this.closeDialog();
        else this.closePanel();
        this.refreshModes();
      }
    });
    window.addEventListener("pointerdown", () => (this.pointerHeld = true), true);
    for (const type of ["pointerup", "pointercancel", "blur"]) {
      window.addEventListener(type, () => (this.pointerHeld = false), true);
    }
    // pointerup yang terjadi di luar jendela tidak pernah sampai; pulihkan dari gerakan berikutnya.
    window.addEventListener("pointermove", (e) => {
      if (e.buttons === 0) this.pointerHeld = false;
    }, true);
    window.setInterval(() => this.refreshPanelIfIdle(), 1000);
  }

  // -------------------------------------------------------------------------
  // HUD

  /** Lebar area kanan layar yang tertutup HUD (untuk membatasi jalan kucing). */
  hudReservedWidth(): number {
    const rect = this.hud.getBoundingClientRect();
    return window.innerWidth - rect.left + 24;
  }

  refreshHud(now: number): void {
    const s = this.game.state;
    this.fishEl.textContent = formatFish(s.fish);
    const rate = this.game.rate(now);
    const clock = s.assistant.clock ? ` · ${formatClock(now)}` : "";
    this.rateEl.textContent = `${formatRate(rate)}${spiritActive(s, now) ? " ✦" : ""}${clock}`;
    const chip = this.assistant.focusChip(now);
    this.focusChip.style.display = chip ? "" : "none";
    if (chip) {
      this.focusText.textContent = chip.text;
      this.focusChip.classList.toggle("break", chip.phase === "break");
      this.focusChip.title = chip.phase === "focus" ? "Sedang fokus" : "Istirahat";
    }
    this.rateEl.title = spiritActive(s, now) ? "Bonus semangat aktif" : "";

    const needs = this.game.needsFood();
    this.feedBtn.style.display = needs ? "" : "none";
    if (needs) {
      const cost = this.game.feedPrice(now);
      this.feedLabel.textContent = `Beri makan · ${formatFish(cost)}`;
      this.feedBtn.title = `Beri makan semua kucing · ${formatFish(cost)} ikan`;
      this.feedBtn.disabled = s.fish < cost;
    }
    // Saat diciutkan, titik merah menandakan kucing lapar.
    this.hud.classList.toggle("needs-food", needs);
    // Cip cuaca: ikon langit sekarang dan suhu.
    const w = s.weather;
    const cw = currentWeather(w, now);
    const icon = objectImageUrl(this.deps.weather.icon(), 2);
    if (this.weatherIcon.src !== icon) this.weatherIcon.src = icon;
    const temp = cw.source === "live" && cw.temp !== null ? `${Math.round(cw.temp)}°` : "";
    if (this.weatherTemp.textContent !== temp) this.weatherTemp.textContent = temp;
    this.weatherChip.title = w.place
      ? `${w.place.name}: ${!w.enabled ? "efek cuaca mati" : cw.source === "none" ? "menunggu data" : WEATHER_LABEL[cw.kind].toLowerCase()} · ${PHASE_LABEL[this.game.phase(now)].toLowerCase()}`
      : `${PHASE_LABEL[this.game.phase(now)]} · klik untuk memilih kota dan melihat cuaca`;
    const soundOn = s.settings.sound;
    const soundIcon = objectImageUrl(soundOn ? "speaker" : "speakerOff", 2);
    if (this.soundIcon.src !== soundIcon) {
      this.soundIcon.src = soundIcon;
      this.soundBtn.title = soundOn ? "Suara menyala (klik untuk bisukan)" : "Suara mati (klik untuk nyalakan)";
    }
    this.shopBtn.classList.toggle("has-dot", this.anythingAffordable());
    this.refreshModes();
  }

  /** Terapkan ukuran, keadaan ciut, dan kepekatan panel bawah dari pengaturan. */
  applyHudSettings(): void {
    const st = this.game.state.settings;
    this.hud.classList.toggle("size-compact", st.hudSize === "compact");
    this.hud.classList.toggle("size-full", st.hudSize !== "compact");
    this.hud.classList.toggle("collapsed", st.hudCollapsed);
    this.hud.style.setProperty("--hud-opacity", String(st.hudOpacity));
  }

  private setCollapsed(collapsed: boolean): void {
    if (collapsed) this.closePanel();
    this.game.updateSettings({ hudCollapsed: collapsed });
    this.deps.sound("pop");
  }

  /** Perbarui tombol mainan/camilan di HUD. */
  refreshModes(): void {
    const it = this.deps.interactions;
    this.toyBtn.classList.toggle("active", it.toyMode());
    this.treatBtn.classList.toggle("active", it.treatMode());
    this.treatCount.textContent = String(this.game.state.inventory.treats);
  }

  private toggleToy(): void {
    const it = this.deps.interactions;
    it.setToyMode(!it.toyMode());
    this.deps.sound(it.toyMode() ? "chirp" : "pop");
    this.refreshModes();
  }

  private toggleTreat(): void {
    const it = this.deps.interactions;
    if (!it.treatMode() && this.game.state.inventory.treats <= 0) {
      this.deps.sound("denied");
      this.toast("Camilan habis. Beli lagi di Toko.");
      this.openPanel("toko");
      this.panel?.querySelector("[data-section=camilan]")?.scrollIntoView({ block: "start" });
      return;
    }
    it.setTreatMode(!it.treatMode());
    this.deps.sound("pop");
    this.refreshModes();
  }

  private anythingAffordable(): boolean {
    const s = this.game.state;
    for (const id of FACILITY_IDS) {
      if (this.game.isFacilityVisible(id) && this.game.facilityPrice(id) <= s.fish) return true;
    }
    return this.game.availableUpgrades().some((u) => u.cost <= s.fish);
  }

  // -------------------------------------------------------------------------
  // Panel

  get panelOpen(): boolean {
    return this.panel !== null;
  }

  togglePanel(tab: TabId): void {
    if (this.panel && this.tab === tab) this.closePanel();
    else this.openPanel(tab);
  }

  openPanel(tab: TabId, highlight: FacilityId | null = null): void {
    this.tab = tab;
    this.highlight = highlight;
    if (!this.panel) {
      this.panelBody = h("div", { class: "panel-body" });
      this.panel = h("div", { class: "card panel", "data-hit": true }, h("div", { class: "tabs" }), this.panelBody);
      this.root.append(this.panel);
      this.root.classList.add("panel-open");
    }
    this.renderPanel();
    if (highlight) {
      const row = this.panel?.querySelector(`[data-facility="${highlight}"]`);
      row?.scrollIntoView({ block: "nearest" });
    }
  }

  closePanel(): void {
    this.panel?.remove();
    this.panel = null;
    this.panelBody = null;
    this.renamingCat = null;
    this.root.classList.remove("panel-open");
  }

  /** Panel aman dibangun ulang: tidak ada klik yang sedang berlangsung, dropdown atau input aktif. */
  private panelIdle(): boolean {
    if (!this.panel || this.pointerHeld || this.renamingCat) return false;
    const active = document.activeElement;
    return !(active && this.panel.contains(active) && (active.tagName === "INPUT" || active.tagName === "SELECT"));
  }

  private refreshPanelIfIdle(): void {
    // Panel yang sibuk diperbarui pada putaran berikutnya.
    if (this.panelIdle()) this.renderPanel();
  }

  onGameEvent(e: GameEvent): void {
    switch (e.type) {
      case "offline":
        this.toast(
          `Selamat datang kembali! Selama ${formatDuration(e.seconds)} kucing-kucing mengumpulkan ${formatFish(e.fish)} ikan.`,
          9000,
        );
        break;
      case "visitorArrived":
        this.deps.sound("meow");
        this.tip("visitor", "Ada kucing liar mampir! Klik dia 3 kali untuk memberi makan.");
        break;
      case "visitorReady":
        this.showAdoptDialog();
        break;
      case "visitorLeft":
        if (this.dialog) this.closeDialog();
        break;
      case "adopted":
        this.toast(`${e.cat.name} resmi bergabung!`);
        break;
      case "prestiged":
        this.toast(`Pindah rumah berhasil! +${e.gained} Bintang.`, 6000);
        break;
      case "bond":
        if (e.levelUp) {
          const cat = this.game.cat(e.catId);
          if (cat) {
            this.deps.sound("levelup");
            const extra =
              e.hearts === BALANCE.giftMinHearts
                ? " Sekarang dia kadang membawakanmu hadiah!"
                : e.hearts === 5
                  ? " Ikatan maksimal!"
                  : "";
            this.toast(`${cat.name} makin sayang padamu ${"♥".repeat(e.hearts)} (+${Math.round(e.hearts * BALANCE.heartBonus * 100)}% produksi).${extra}`, 6000);
          }
        }
        break;
      case "giftCollected":
        this.toast(`${e.title} ${e.detail}`, 6000);
        break;
      case "inventory":
        this.refreshModes();
        break;
      case "settings":
        this.applyHudSettings();
        this.refreshHud(Date.now());
        break;
      case "greeting":
        this.toast(this.greetingText(e.phase), 8000);
        break;
      case "weatherChanged": {
        const w = this.game.state.weather;
        if (e.reason !== "live") break;
        const where = w.place ? ` di ${w.place.name}` : "";
        if (isWet(e.to) && !isWet(e.from)) {
          this.toast(`${e.to === "storm" ? "Badai petir" : e.to === "drizzle" ? "Gerimis" : "Hujan"} mulai turun${where}. Kucing-kucing berteduh.`, 7000);
        } else if (isWet(e.from) && !isWet(e.to)) {
          this.toast(`Hujan sudah reda${where}. Kucing-kucing keluar lagi.`, 6000);
        }
        break;
      }
      case "released":
        this.toast(`${e.cat.name} pamit dan pergi menjelajah dunia. Selamat jalan, ${e.cat.name}!`, 6000);
        break;
      case "achievement": {
        this.deps.sound("achievement");
        if (e.ids.length === 1) {
          const def = ACHIEVEMENT_BY_ID[e.ids[0]];
          this.toast(`🏆 Prestasi baru: “${def.name}”. Hadiah: ${describeReward(def.reward)}.`, 6000);
        } else {
          this.toast(`🏆 ${e.ids.length} prestasi baru terbuka! Lihat di tab Koleksi.`, 6000);
        }
        break;
      }
      case "daily": {
        const cat = this.game.cat(e.catId);
        const who = cat?.name ?? "Kucingmu";
        this.toast(
          e.streak > 1
            ? `Hari ke-${e.streak} berturut-turut! ${who} membawakan hadiah harian. Klik kadonya.`
            : `${who} membawakan hadiah harian. Klik kadonya di lantai!`,
          7000,
        );
        break;
      }
      default:
        break;
    }
    if (this.panelIdle()) this.renderPanel();
  }

  private greetingText(phase: "pagi" | "siang" | "sore" | "malam" | string): string {
    const now = Date.now();
    const w = this.game.state.weather;
    const cw = currentWeather(w, now);
    const hello = `Selamat ${phase}!`;
    let info = "";
    if (cw.source !== "none") {
      info = `${w.place && cw.source === "live" ? `${w.place.name} ` : "Hari ini "}${WEATHER_LABEL[cw.kind].toLowerCase()}${cw.temp !== null && cw.source === "live" ? `, ${Math.round(cw.temp)}°` : ""}.`;
    }
    let tip = "";
    if (isWet(cw.kind)) tip = "Sedia payung sebelum hujan, ya.";
    else if (cw.temp !== null && cw.temp >= 31) tip = "Panas sekali, jangan lupa minum air.";
    else if (phase === "pagi") tip = "Semangat untuk hari ini!";
    else if (phase === "siang") tip = "Jangan lupa makan siang.";
    else if (phase === "sore") tip = "Sebentar lagi senja, kucing-kucing mulai aktif.";
    else if (phase === "malam") tip = "Jangan begadang terlalu malam.";
    return [hello, info, tip].filter(Boolean).join(" ");
  }

  /** Pesan asisten tiba: tampilkan kartu di atas kucing pembawa pesan. */
  showAlert(alert: Alert, catId: string | null): void {
    this.assistant.showAlert(alert, catId);
  }

  private renderPanel(): void {
    if (!this.panel || !this.panelBody) return;
    const tabs = this.panel.querySelector(".tabs") as HTMLElement;
    clear(tabs);
    for (const t of TABS) {
      tabs.append(
        h("button", { class: `tab${t.id === this.tab ? " active" : ""}`, onclick: () => this.openPanel(t.id) }, t.label),
      );
    }
    tabs.append(h("button", { class: "tab close", title: "Tutup", onclick: () => this.closePanel() }, "✕"));

    const scroll = this.panelBody.scrollTop;
    clear(this.panelBody);
    const now = Date.now();
    switch (this.tab) {
      case "toko":
        this.renderShop(this.panelBody, now);
        break;
      case "kucing":
        this.renderCats(this.panelBody, now);
        break;
      case "asisten":
        this.assistant.renderTab(this.panelBody, now);
        break;
      case "koleksi":
        this.renderCollection(this.panelBody);
        break;
      case "rumah":
        this.renderHome(this.panelBody, now);
        break;
      case "atur":
        this.renderSettings(this.panelBody);
        break;
    }
    this.panelBody.scrollTop = scroll;
  }

  // -------------------------------------------------------------------------
  // Tab Toko

  private renderShop(body: HTMLElement, now: number): void {
    const g = this.game;
    const s = g.state;
    body.append(h("h3", null, "Fasilitas"));
    let lockedShown = false;
    for (const id of FACILITY_IDS) {
      const def = FACILITIES[id];
      if (!g.isFacilityVisible(id)) {
        if (!lockedShown) {
          lockedShown = true;
          body.append(
            h(
              "div",
              { class: "row locked" },
              h("div", { class: "thumb mystery" }, "?"),
              h("div", { class: "info" }, h("div", { class: "name" }, "???"), h("div", { class: "desc" }, "Kumpulkan lebih banyak ikan untuk membuka.")),
            ),
          );
        }
        continue;
      }
      const owned = s.facilities[id];
      const price1 = g.facilityPrice(id, 1);
      const price10 = g.facilityPrice(id, 10);
      const rate = facilityRate(s, id, { online: true, now, visible: g.visible });
      const cats = catsAt(s, id).length;
      body.append(
        h(
          "div",
          { class: `row${this.highlight === id ? " highlight" : ""}`, "data-facility": id },
          h("img", { class: "px thumb", src: objectImageUrl(id, 2), alt: "" }),
          h(
            "div",
            { class: "info" },
            h("div", { class: "name" }, def.name, owned > 0 ? h("span", { class: "owned" }, ` ×${owned}`) : null),
            h(
              "div",
              { class: "desc" },
              owned > 0
                ? `${formatRate(rate)} · kucing ${cats}/${BALANCE.slotsPerFacility}`
                : `+${formatRate(def.baseRate)} per unit · menarik kucing ${RARITY_LABEL[def.attracts]}`,
            ),
          ),
          h(
            "div",
            { class: "buy" },
            h(
              "button",
              { class: "btn btn-buy", disabled: s.fish < price1, onclick: () => this.buy(id, 1) },
              h("span", null, "Beli"),
              h("small", null, formatFish(price1)),
            ),
            h(
              "button",
              { class: "btn btn-buy small", disabled: s.fish < price10, onclick: () => this.buy(id, 10) },
              h("span", null, "×10"),
              h("small", null, formatFish(price10)),
            ),
          ),
        ),
      );
    }

    const upgrades = g.availableUpgrades().slice(0, 6);
    if (upgrades.length > 0) {
      body.append(h("h3", null, "Upgrade"));
      for (const u of upgrades) {
        body.append(
          h(
            "div",
            { class: "row" },
            h("div", { class: "thumb glyph" }, "★"),
            h("div", { class: "info" }, h("div", { class: "name" }, u.name), h("div", { class: "desc" }, u.description)),
            h(
              "div",
              { class: "buy" },
              h(
                "button",
                { class: "btn btn-buy", disabled: s.fish < u.cost, onclick: () => this.buyUpgrade(u.id) },
                h("span", null, "Beli"),
                h("small", null, formatFish(u.cost)),
              ),
            ),
          ),
        );
      }
    }

    this.renderGoodies(body, now);

    body.append(h("h3", null, "Kucing liar"));
    const bait = g.baitPrice();
    body.append(
      h(
        "div",
        { class: "row" },
        h("img", { class: "px thumb", src: objectImageUrl("fish", 2), alt: "" }),
        h(
          "div",
          { class: "info" },
          h("div", { class: "name" }, "Umpan ikan asin"),
          h("div", { class: "desc" }, s.visitor ? "Sudah ada tamu di strip." : "Panggil seekor kucing liar sekarang."),
        ),
        h(
          "div",
          { class: "buy" },
          h(
            "button",
            {
              class: "btn btn-buy",
              disabled: !!s.visitor || s.fish < bait,
              onclick: () => {
                if (g.callVisitor(Date.now())) this.deps.sound("buy");
              },
            },
            h("span", null, "Panggil"),
            h("small", null, formatFish(bait)),
          ),
        ),
      ),
    );
  }

  private renderGoodies(body: HTMLElement, now: number): void {
    const g = this.game;
    const s = g.state;
    const price = g.treatPrice(now);
    body.append(
      h("h3", { "data-section": "camilan" }, "Camilan"),
      h(
        "div",
        { class: "row" },
        h("img", { class: "px thumb", src: objectImageUrl("treat", 3), alt: "" }),
        h(
          "div",
          { class: "info" },
          h("div", { class: "name" }, "Camilan ikan", h("span", { class: "owned" }, ` · punya ${s.inventory.treats}`)),
          h("div", { class: "desc" }, `Tekan tombol camilan di bawah, lalu klik kucing. +${BALANCE.bondPerTreat} ikatan dan bikin kenyang.`),
        ),
        h(
          "div",
          { class: "buy" },
          h(
            "button",
            { class: "btn btn-buy", disabled: s.fish < price, onclick: () => this.buyTreats(1) },
            h("span", null, "Beli"),
            h("small", null, formatFish(price)),
          ),
          h(
            "button",
            { class: "btn btn-buy small", disabled: s.fish < price * 5, onclick: () => this.buyTreats(5) },
            h("span", null, "×5"),
            h("small", null, formatFish(price * 5)),
          ),
        ),
      ),
    );

    body.append(h("h3", null, "Aksesori"));
    const ownedCount = s.inventory.accessories.length;
    if (ownedCount > 0) body.append(h("p", { class: "desc" }, `Kamu punya ${ownedCount} aksesori. Pakaikan lewat tab Kucing.`));
    const model = [...s.cats].sort((a, b) => a.adoptedAt - b.adoptedAt)[0];
    // Tampilkan beberapa yang termurah dulu agar daftar tidak terlalu panjang.
    const forSale = ACCESSORIES.filter((a) => a.price !== null && !s.inventory.accessories.includes(a.id)).slice(0, 4);
    for (const acc of forSale) {
      const cost = acc.price!;
      body.append(
        h(
          "div",
          { class: "row" },
          h("img", { class: "px thumb cat-thumb", src: catImageUrl(model?.coat ?? "oyen", "sit", 2, acc.id), alt: "" }),
          h("div", { class: "info" }, h("div", { class: "name" }, acc.name), h("div", { class: "desc" }, acc.description)),
          h(
            "div",
            { class: "buy" },
            h(
              "button",
              { class: "btn btn-buy", disabled: s.fish < cost, onclick: () => this.buyAccessory(acc.id) },
              h("span", null, "Beli"),
              h("small", null, formatFish(cost)),
            ),
          ),
        ),
      );
    }
    if (forSale.length === 0) {
      body.append(h("p", { class: "desc" }, "Semua aksesori toko sudah kamu miliki. Aksesori langka hanya datang sebagai hadiah dari kucing."));
    }
  }

  private buyTreats(amount: number): void {
    if (this.game.buyTreats(amount, Date.now())) {
      this.deps.sound("buy");
      this.refreshModes();
    } else this.deps.sound("denied");
  }

  private buyAccessory(id: string): void {
    if (this.game.buyAccessory(id)) {
      this.deps.sound("buy");
      this.toast(`${ACCESSORY_BY_ID[id].name} dibeli! Pakaikan ke kucing lewat tab Kucing.`);
    } else this.deps.sound("denied");
  }

  private buy(id: FacilityId, amount: number): void {
    if (this.game.buyFacility(id, amount)) {
      this.deps.sound("buy");
      if (this.game.state.facilities[id] === amount) {
        const attracts = FACILITIES[id].attracts;
        if (attracts !== "biasa") this.toast(`${FACILITIES[id].name} menarik kucing ${RARITY_LABEL[attracts]} untuk mampir.`);
      }
    } else this.deps.sound("denied");
  }

  private buyUpgrade(id: string): void {
    if (this.game.buyUpgrade(id)) this.deps.sound("buy");
    else this.deps.sound("denied");
  }

  // -------------------------------------------------------------------------
  // Tab Kucing

  private feedAll(): void {
    const now = Date.now();
    if (this.game.feedAll(now)) {
      this.deps.sound("feed");
      this.toast("Semua kucing kenyang.");
    } else this.deps.sound("denied");
    this.refreshHud(now);
  }

  private renderCats(body: HTMLElement, now: number): void {
    const g = this.game;
    const s = g.state;
    const feedCost = g.feedPrice(now);
    const anyHungry = s.cats.some((c) => c.hunger < 0.999);
    const spirit = spiritActive(s, now)
      ? `Semangat aktif ${formatDuration((s.spiritUntil - now) / 1000)} lagi (+${Math.round(BALANCE.spiritBonus * 100)}%).`
      : "Elus kucing di strip untuk bonus semangat +10% selama 10 menit.";
    body.append(
      h(
        "div",
        { class: "row header-row" },
        h("div", { class: "info" }, h("div", { class: "name" }, `${s.cats.length} kucing`), h("div", { class: "desc" }, spirit)),
        h(
          "div",
          { class: "buy" },
          h(
            "button",
            { class: "btn btn-buy", disabled: !anyHungry || s.fish < feedCost, onclick: () => this.feedAll() },
            h("span", null, "Beri makan"),
            h("small", null, formatFish(feedCost)),
          ),
        ),
      ),
    );

    const ctx = { online: true, now, visible: g.visible };
    const sorted = [...s.cats].sort((a, b) => a.adoptedAt - b.adoptedAt);
    for (const cat of sorted) {
      const coat = COAT_BY_ID[cat.coat];
      const trait = TRAITS[cat.trait];
      const working = cat.facility !== null && s.facilities[cat.facility] > 0 && catsAt(s, cat.facility).includes(cat);
      const contribution = working ? formatPercent(catContribution(cat, ctx)) : "bersantai";
      const hs = hearts(cat);
      const toNext = hs >= 5 ? "maksimal" : `${Math.floor(cat.bond - hs * BALANCE.bondPerHeart)}/${BALANCE.bondPerHeart} ke hati berikutnya`;
      body.append(
        h(
          "div",
          { class: "cat-card" },
          h("img", { class: "px avatar", src: catImageUrl(cat.coat, "sit", 2, cat.accessory), alt: "" }),
          h(
            "div",
            { class: "info" },
            this.renderCatName(cat),
            h("div", { class: "desc" }, `${coat.name} · `, h("b", null, trait.name), `: ${trait.description}`),
            h(
              "div",
              { class: "hearts", title: `Ikatan: ${toNext}. Setiap hati +${Math.round(BALANCE.heartBonus * 100)}% produksi.` },
              h("span", { class: "on" }, "♥".repeat(hs)),
              h("span", { class: "off" }, "♥".repeat(5 - hs)),
              h("span", { class: "bond-next" }, hs >= 5 ? "maks" : toNext.split(" ")[0]),
            ),
            h(
              "div",
              { class: "meter-row" },
              h("span", { class: "meter-label" }, isHungry(cat) ? "Lapar" : "Kenyang"),
              h("div", { class: `meter${isHungry(cat) ? " low" : ""}` }, h("i", { style: { width: `${Math.round(cat.hunger * 100)}%` } })),
              h("span", { class: "contrib" }, contribution),
            ),
          ),
          h(
            "div",
            { class: "cat-actions" },
            this.renderAssign(cat),
            this.renderAccessory(cat),
            h(
              "button",
              {
                class: "btn small",
                title: "Panggil kucing ini ke dekat kursor",
                onclick: () => {
                  this.deps.interactions.callCat(cat.id);
                  this.deps.sound("meow");
                },
              },
              "Panggil",
            ),
            this.renderRelease(cat),
          ),
        ),
      );
    }
    body.append(
      h(
        "p",
        { class: "desc help" },
        "Klik = elus · gerakkan kursor bolak-balik di atas kucing = usap sampai mendengkur · seret = angkat (jatuhkan di fasilitas untuk menugaskan). Jangan diklik terus-terusan, nanti ngambek!",
      ),
    );
  }

  /** Tombol lepaskan dengan konfirmasi dua klik; kucing terakhir tidak bisa dilepas. */
  private renderRelease(cat: CatState): HTMLElement {
    const key = `release:${cat.id}`;
    const confirm = this.confirming(key);
    const last = this.game.state.cats.length <= 1;
    return h(
      "button",
      {
        class: `btn small subtle-btn${confirm ? " btn-danger" : ""}`,
        disabled: last,
        title: last ? "Kucing terakhir tidak bisa dilepas" : "Lepaskan kucing ini ke dunia luar",
        onclick: () => {
          if (!this.confirming(key)) {
            this.confirmUntil.set(key, Date.now() + 4000);
            this.renderPanel();
            return;
          }
          this.confirmUntil.delete(key);
          if (this.game.releaseCat(cat.id)) this.deps.sound("meow");
        },
      },
      confirm ? "Yakin lepas?" : "Lepaskan",
    );
  }

  private renderAccessory(cat: CatState): HTMLElement {
    const s = this.game.state;
    const select = h("select", {
      class: "assign",
      title: "Aksesori",
      disabled: s.inventory.accessories.length === 0,
      onchange: (e: Event) => {
        const value = (e.target as HTMLSelectElement).value;
        if (this.game.equipAccessory(cat.id, value === "" ? null : value)) this.deps.sound("pop");
        (e.target as HTMLSelectElement).blur();
        this.renderPanel();
      },
    });
    select.append(h("option", { value: "", selected: cat.accessory === null }, s.inventory.accessories.length === 0 ? "Belum ada aksesori" : "Tanpa aksesori"));
    for (const id of s.inventory.accessories) {
      const acc = ACCESSORY_BY_ID[id];
      if (!acc) continue;
      const wearer = s.cats.find((c) => c.accessory === id && c.id !== cat.id);
      select.append(h("option", { value: id, selected: cat.accessory === id }, wearer ? `${acc.name} (${wearer.name})` : acc.name));
    }
    return select;
  }

  private renderCatName(cat: CatState): HTMLElement {
    const rarity = COAT_BY_ID[cat.coat].rarity;
    if (this.renamingCat === cat.id) {
      let cancelled = false;
      const input = h("input", {
        class: "rename",
        value: cat.name,
        maxLength: 16,
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === "Escape") cancelled = true;
          if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        },
        onblur: (e: FocusEvent) => {
          if (this.renamingCat !== cat.id) return;
          if (!cancelled) this.game.renameCat(cat.id, (e.target as HTMLInputElement).value);
          this.renamingCat = null;
          // Dibangun ulang setelah event blur selesai, bukan di dalamnya.
          queueMicrotask(() => this.renderPanel());
        },
      });
      queueMicrotask(() => {
        input.focus();
        input.select();
      });
      return h("div", { class: "name" }, input);
    }
    return h(
      "div",
      { class: "name" },
      cat.name,
      h(
        "button",
        {
          class: "link",
          title: "Ganti nama",
          onclick: () => {
            this.renamingCat = cat.id;
            this.renderPanel();
          },
        },
        "✎",
      ),
      h("span", { class: `badge r-${rarity}` }, RARITY_LABEL[rarity]),
    );
  }

  private renderAssign(cat: CatState): HTMLElement {
    const s = this.game.state;
    const select = h("select", {
      class: "assign",
      title: "Tugaskan ke fasilitas",
      onchange: (e: Event) => {
        const value = (e.target as HTMLSelectElement).value;
        const ok = this.game.assignCat(cat.id, value === "" ? null : (value as FacilityId));
        if (!ok) {
          this.deps.sound("denied");
          this.toast("Slot fasilitas itu sudah penuh.");
        }
        (e.target as HTMLSelectElement).blur();
        this.renderPanel();
      },
    });
    select.append(h("option", { value: "", selected: cat.facility === null }, "Bersantai"));
    for (const id of FACILITY_IDS) {
      if (s.facilities[id] <= 0) continue;
      const used = this.game.slotsUsed(id, cat.id);
      const full = used >= BALANCE.slotsPerFacility;
      select.append(
        h(
          "option",
          { value: id, selected: cat.facility === id, disabled: full && cat.facility !== id },
          `${SHORT_NAME[id]} (${used + (cat.facility === id ? 1 : 0)}/${BALANCE.slotsPerFacility})`,
        ),
      );
    }
    return select;
  }

  // -------------------------------------------------------------------------
  // Tab Kucingpedia

  private photoBusy = false;

  private async takePhoto(): Promise<void> {
    if (this.photoBusy) return;
    this.photoBusy = true;
    try {
      this.deps.sound("shutter");
      const path = await this.deps.takePhoto();
      this.game.recordPhoto();
      if (path) {
        this.toast(
          `Foto tersimpan di folder Gambar › Meow Corner.`,
          7000,
          false,
          this.deps.canOpenFolder ? { label: "Buka folder", run: () => void this.deps.openPhotoFolder() } : undefined,
        );
      } else this.toast("Foto diunduh.");
    } catch (err) {
      this.toast(`Foto gagal disimpan: ${String(err)}`);
    } finally {
      this.photoBusy = false;
    }
  }

  private renderCollection(body: HTMLElement): void {
    const s = this.game.state;
    const owned = new Set(s.cats.map((c) => c.coat));
    body.append(
      h(
        "div",
        { class: "photo-row" },
        h(
          "div",
          { class: "info" },
          h("div", { class: "name" }, "Foto kucing-kucingmu"),
          h("div", { class: "desc" }, `Simpan pemandangan strip sekarang sebagai gambar PNG berbingkai. ${s.stats.photos} foto sejauh ini.`),
        ),
        h("button", { class: "btn btn-primary", onclick: () => void this.takePhoto() }, "Ambil foto"),
      ),
    );
    this.renderAchievements(body);
    body.append(
      h("h3", null, `Kucingpedia · ${owned.size} dari ${COATS.length}`),
      h("p", { class: "lead" }, "Fasilitas yang lebih mahal menarik kucing yang lebih langka untuk mampir."),
    );
    const grid = h("div", { class: "dex" });
    for (const coat of COATS) {
      const has = owned.has(coat.id);
      const seen = s.discovered.includes(coat.id);
      grid.append(
        h(
          "div",
          { class: `dex-cell${has ? "" : seen ? " seen" : " unknown"}`, title: has || seen ? `${coat.name}: ${coat.blurb}` : "Belum ditemukan" },
          h("img", { class: "px", src: has || seen ? catImageUrl(coat.id, "sit", 2) : silhouetteUrl(2), alt: "" }),
          h("div", { class: "dex-name" }, has || seen ? coat.name : "???"),
          h("span", { class: `badge r-${coat.rarity}` }, RARITY_LABEL[coat.rarity]),
        ),
      );
    }
    body.append(grid);

    const owns = new Set(s.inventory.accessories);
    const model = [...s.cats].sort((a, b) => a.adoptedAt - b.adoptedAt)[0];
    body.append(h("h3", null, `Aksesori · ${owns.size} dari ${ACCESSORIES.length}`));
    const accGrid = h("div", { class: "dex" });
    for (const acc of ACCESSORIES) {
      const has = owns.has(acc.id);
      const giftOnly = acc.price === null;
      accGrid.append(
        h(
          "div",
          {
            class: `dex-cell${has ? "" : giftOnly ? " unknown" : " seen"}`,
            title: has ? `${acc.name}: ${acc.description}` : giftOnly ? "Hanya bisa didapat sebagai hadiah dari kucing yang sayang padamu." : `Dijual di Toko seharga ${formatFish(acc.price!)} ikan.`,
          },
          h("img", { class: "px", src: has || !giftOnly ? catImageUrl(model?.coat ?? "oyen", "sit", 2, acc.id) : silhouetteUrl(2), alt: "" }),
          h("div", { class: "dex-name" }, has || !giftOnly ? acc.name : "???"),
          giftOnly ? h("span", { class: "badge r-epik" }, "Hadiah") : null,
        ),
      );
    }
    body.append(accGrid);
  }

  private renderAchievements(body: HTMLElement): void {
    const s = this.game.state;
    const done = new Set(s.achievements);
    body.append(h("h3", null, `Prestasi · ${done.size} dari ${ACHIEVEMENTS.length}`));
    const list = h("div", { class: "achievements" });
    // Yang hampir tercapai ditampilkan lebih dulu; yang sudah selesai di akhir.
    const items = ACHIEVEMENTS.filter((a) => !a.secret || done.has(a.id))
      .map((a) => {
        const [v, t] = a.progress(s);
        return { a, v, t, unlocked: done.has(a.id) };
      })
      .sort((p, q) => Number(p.unlocked) - Number(q.unlocked) || q.v / q.t - p.v / p.t);
    for (const { a, v, t, unlocked } of items) {
      list.append(
        h(
          "div",
          { class: `ach${unlocked ? " unlocked" : ""}` },
          h("img", { class: "px ach-icon", src: objectImageUrl(unlocked ? "trophy" : "star", 2), alt: "" }),
          h(
            "div",
            { class: "info" },
            h("div", { class: "name" }, a.name),
            h("div", { class: "desc" }, `${a.description} Hadiah: ${describeReward(a.reward)}.`),
            unlocked
              ? null
              : h(
                  "div",
                  { class: "meter-row" },
                  h("div", { class: "meter thin" }, h("i", { style: { width: `${Math.round((v / t) * 100)}%` } })),
                  h("span", { class: "ach-count" }, t >= 1000 ? `${Math.round((v / t) * 100)}%` : `${Math.floor(v)}/${t}`),
                ),
          ),
          unlocked ? h("span", { class: "ach-check" }, "✓") : null,
        ),
      );
    }
    body.append(list);
  }

  // -------------------------------------------------------------------------
  // Tab Rumah (prestige)

  private confirming(key: string): boolean {
    return (this.confirmUntil.get(key) ?? 0) > Date.now();
  }

  private renderHome(body: HTMLElement, _now: number): void {
    const g = this.game;
    const s = g.state;
    const gain = g.prestigePreview();
    const toNext = fishToNextStar(s.totalFishRun);
    body.append(
      h(
        "div",
        { class: "stars" },
        h("div", { class: "stars-count" }, `★ ${s.stars}`),
        h("div", { class: "desc" }, `Bintang memberi bonus produksi permanen ${formatPercent(s.stars * BALANCE.starBonus)}.`),
      ),
      h(
        "p",
        null,
        gain > 0
          ? h("span", null, "Pindah Rumah sekarang memberi ", h("b", null, `+${gain} Bintang`), ".")
          : `Kumpulkan ${formatFish(toNext)} ikan lagi untuk Bintang pertamamu.`,
      ),
      h("p", { class: "desc" }, gain > 0 ? `Bintang berikutnya setelah ${formatFish(toNext)} ikan lagi.` : ""),
      h(
        "ul",
        { class: "plain" },
        h("li", null, "Hilang: ikan, fasilitas, dan upgrade fasilitas."),
        h("li", null, "Tetap: semua kucing, Kucingpedia, upgrade kasur, dan Bintang."),
      ),
    );
    const confirm = this.confirming("prestige");
    body.append(
      h(
        "button",
        {
          class: `btn ${confirm ? "btn-danger" : "btn-primary"} wide`,
          disabled: gain < 1,
          onclick: () => {
            if (!this.confirming("prestige")) {
              this.confirmUntil.set("prestige", Date.now() + 4000);
              this.renderPanel();
              return;
            }
            this.confirmUntil.delete("prestige");
            g.prestige(Date.now());
          },
        },
        confirm ? "Yakin? Klik sekali lagi untuk pindah" : "Pindah Rumah",
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Tab Atur

  private renderSettings(body: HTMLElement): void {
    const g = this.game;
    const st = g.state.settings;
    const stats = g.state.stats;
    const slider = (value: number, min: number, max: number, onInput: (v: number) => void, onChange: (v: number) => void) =>
      h("input", {
        type: "range",
        class: "slider",
        min,
        max,
        step: 5,
        value: Math.round(value * 100),
        oninput: (e: Event) => onInput(Number((e.target as HTMLInputElement).value) / 100),
        onchange: (e: Event) => {
          onChange(Number((e.target as HTMLInputElement).value) / 100);
          (e.target as HTMLInputElement).blur();
        },
      });
    body.append(
      h("h3", null, "Suara"),
      this.toggle("Efek suara (eongan, dengkur, bunyi pengingat)", st.sound, (v) => {
        g.updateSettings({ sound: v });
        if (v) this.deps.sound("meow");
      }),
      h(
        "div",
        { class: "setting" },
        h("span", null, `Volume`),
        h(
          "div",
          { class: "form-row tight" },
          slider(st.volume, 0, 100, (v) => this.deps.previewVolume(v), (v) => {
            g.updateSettings({ volume: v });
            this.deps.sound("meow");
          }),
          h("button", { class: "btn small", title: "Coba suara", onclick: () => this.deps.sound("meow") }, "Coba"),
        ),
      ),
      this.toggle("Musik latar santai (kotak musik)", st.music, (v) => g.updateSettings({ music: v })),
      h("h3", null, "Panel bawah"),
      h(
        "div",
        { class: "setting" },
        h("span", null, "Ukuran"),
        h(
          "div",
          { class: "segmented" },
          ...(
            [
              ["full", "Lengkap"],
              ["compact", "Ringkas"],
            ] as const
          ).map(([size, label]) =>
            h(
              "button",
              { class: `btn small${st.hudSize === size ? " active" : ""}`, onclick: () => g.updateSettings({ hudSize: size, hudCollapsed: false }) },
              label,
            ),
          ),
          h("button", { class: "btn small", title: "Ciutkan jadi pil kecil (klik pil untuk membuka lagi)", onclick: () => this.setCollapsed(true) }, "Mini"),
        ),
      ),
      h(
        "div",
        { class: "setting" },
        h("span", null, "Kepekatan saat tidak disorot"),
        slider(
          st.hudOpacity,
          30,
          100,
          (v) => this.hud.style.setProperty("--hud-opacity", String(v)),
          (v) => g.updateSettings({ hudOpacity: v }),
        ),
      ),
      h("p", { class: "desc" }, "Panel kembali pekat saat kursor berada di atasnya."),
      h("h3", null, "Cara berinteraksi"),
      h(
        "ul",
        { class: "plain" },
        h("li", null, h("b", null, "Klik"), " kucing untuk mengelus (bonus semangat +10%)."),
        h("li", null, h("b", null, "Usap"), ": gerakkan kursor bolak-balik di atas kucing tanpa klik sampai ia mendengkur. Memberi ikatan."),
        h("li", null, h("b", null, "Seret"), " kucing untuk mengangkatnya. Jatuhkan di atas fasilitas untuk menugaskannya, atau ke dalam kardus."),
        h("li", null, h("b", null, "Mainan bulu"), " (tombol bulu): kucing mengejar dan menerkam. Tangkapan memberi ikan dan ikatan."),
        h("li", null, h("b", null, "Camilan"), ": tombol camilan, lalu klik kucing. Ampuh untuk membujuk kucing yang ngambek."),
        h("li", null, "Setiap hati ikatan +2% produksi. Mulai 3 hati, kucing kadang membawakan hadiah."),
      ),
      h("h3", null, "Tampilan"),
      h(
        "div",
        { class: "setting" },
        h("span", null, "Ukuran kucing"),
        h(
          "div",
          { class: "segmented" },
          ...([2, 3] as const).map((sc) =>
            h("button", { class: `btn small${st.scale === sc ? " active" : ""}`, onclick: () => g.updateSettings({ scale: sc }) }, `${sc}×`),
          ),
        ),
      ),
      this.toggle("Mode Fokus (animasi tenang, hemat daya)", st.focusMode, (v) => g.updateSettings({ focusMode: v })),
      h("h3", null, "Statistik"),
      h(
        "ul",
        { class: "plain stats" },
        h("li", null, `Total ikan: ${formatFish(g.state.totalFishAll)}`),
        h("li", null, `Kucing diadopsi: ${stats.catsAdopted}`),
        h("li", null, `Elusan: ${stats.petted}`),
        h("li", null, `Ikan berkilau ditangkap: ${stats.sparklesCaught}`),
        h("li", null, `Dengkuran: ${stats.purrs} · Camilan diberikan: ${stats.treatsGiven}`),
        h("li", null, `Bulu ditangkap: ${stats.toyCatches} · Hadiah diterima: ${stats.giftsReceived}`),
        h("li", null, `Sesi fokus: ${stats.focusSessions} · Tugas selesai: ${stats.todosDone} · Pengingat: ${stats.remindersFired}`),
        h("li", null, `Hadiah harian: ${g.state.daily.streak} hari berturut-turut (rekor ${g.state.daily.best})`),
        h("li", null, `Batas progres offline: ${offlineCapHours(g.state)} jam`),
      ),
      h("h3", null, "Aplikasi"),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          {
            class: "btn",
            onclick: async () => {
              const ok = await this.deps.saveNow();
              this.toast(ok ? "Tersimpan." : "Gagal menyimpan. Coba lagi sebentar lagi.");
            },
          },
          "Simpan sekarang",
        ),
        this.deps.canHide ? h("button", { class: "btn", onclick: () => void this.deps.hide() }, "Sembunyikan") : null,
        h("button", { class: "btn", onclick: () => void this.deps.quit() }, "Keluar"),
      ),
    );
    const confirm = this.confirming("reset");
    body.append(
      h(
        "button",
        {
          class: `btn ${confirm ? "btn-danger" : ""} wide subtle`,
          onclick: () => {
            if (!this.confirming("reset")) {
              this.confirmUntil.set("reset", Date.now() + 4000);
              this.renderPanel();
              return;
            }
            this.confirmUntil.delete("reset");
            void this.deps.resetProgress();
          },
        },
        confirm ? "Semua progres akan hilang. Klik lagi untuk menghapus." : "Hapus semua progres",
      ),
    );
  }

  private toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    return h(
      "label",
      { class: "setting toggle" },
      h("span", null, label),
      h("input", {
        type: "checkbox",
        checked: value,
        onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Dialog adopsi

  showAdoptDialog(): void {
    const v = this.game.state.visitor;
    if (!v) return;
    this.closeDialog();
    const coat = COAT_BY_ID[v.coat];
    const trait = TRAITS[v.trait];
    const input = h("input", { class: "rename", value: v.name, maxLength: 16 });
    const adopt = () => {
      const cat = this.game.adoptVisitor(input.value, Date.now());
      if (cat) this.deps.sound("pet");
      this.closeDialog();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") adopt();
      e.stopPropagation();
    });
    this.dialog = h(
      "div",
      { class: "card dialog", "data-hit": true },
      h("div", { class: "dialog-title" }, "Kucing ini mau tinggal bersamamu!"),
      h(
        "div",
        { class: "dialog-cat" },
        h("img", { class: "px", src: catImageUrl(v.coat, "sit", 3), alt: "" }),
        h(
          "div",
          null,
          h("div", null, h("b", null, coat.name), " ", h("span", { class: `badge r-${coat.rarity}` }, RARITY_LABEL[coat.rarity])),
          h("div", { class: "desc" }, h("b", null, trait.name), `: ${trait.description}`),
          h("div", { class: "desc italic" }, coat.blurb),
        ),
      ),
      h("label", { class: "field" }, h("span", null, "Beri nama"), input),
      h(
        "div",
        { class: "button-row" },
        h("button", { class: "btn btn-primary", onclick: adopt }, "Adopsi"),
        h(
          "button",
          {
            class: "btn",
            onclick: () => {
              this.game.releaseVisitor(Date.now());
              this.closeDialog();
            },
          },
          "Lepaskan",
        ),
      ),
    );
    this.root.append(this.dialog);
    queueMicrotask(() => input.focus());
  }

  closeDialog(): void {
    this.dialog?.remove();
    this.dialog = null;
  }

  // -------------------------------------------------------------------------
  // Notifikasi

  toast(message: string, ms = 4000, isTip = false, action?: { label: string; run: () => void }): void {
    const el = h(
      "div",
      { class: `card toast${isTip ? " tip" : ""}`, "data-hit": action ? true : undefined },
      message,
      action
        ? h(
            "button",
            {
              class: "btn small toast-action",
              onclick: () => {
                action.run();
                el.remove();
              },
            },
            action.label,
          )
        : null,
    );
    this.toasts.append(el);
    // Tips hanya tampil sekali, jadi notifikasi biasa yang dibuang lebih dulu bila penuh.
    while (this.toasts.children.length > 3) {
      const victim = [...this.toasts.children].find((c) => c !== el && !c.classList.contains("tip")) ?? this.toasts.firstElementChild;
      victim?.remove();
    }
    window.setTimeout(() => {
      el.classList.add("out");
      window.setTimeout(() => el.remove(), 400);
    }, ms);
  }

  /** Tips yang hanya tampil sekali (diingat antar-sesi bila penyimpanan browser tersedia). */
  tip(key: string, message: string, ms = 6000): void {
    if (this.seenTips.size === 0) {
      try {
        for (const k of JSON.parse(localStorage.getItem(TIPS_KEY) ?? "[]") as string[]) this.seenTips.add(k);
      } catch {
        // Penyimpanan tidak tersedia: tips cukup diingat selama sesi ini.
      }
      this.seenTips.add("");
    }
    if (this.seenTips.has(key)) return;
    this.seenTips.add(key);
    try {
      localStorage.setItem(TIPS_KEY, JSON.stringify([...this.seenTips].filter(Boolean)));
    } catch {
      // Abaikan.
    }
    this.toast(message, ms, true);
  }
}
