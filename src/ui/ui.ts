// Antarmuka HTML di atas kanvas: HUD, panel bertab, dialog adopsi, dan notifikasi.

import { BALANCE, COATS, COAT_BY_ID, FACILITIES, RARITY_LABEL, TRAITS } from "../core/data";
import {
  catContribution,
  catsAt,
  facilityRate,
  fishToNextStar,
  isHungry,
  offlineCapHours,
  spiritActive,
} from "../core/economy";
import { formatDuration, formatFish, formatPercent, formatRate } from "../core/format";
import type { Game, GameEvent } from "../core/game";
import type { CatState, FacilityId } from "../core/types";
import { FACILITY_IDS } from "../core/types";
import { catImageUrl, objectImageUrl, silhouetteUrl } from "../render/textures";
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

export type TabId = "toko" | "kucing" | "koleksi" | "rumah" | "atur";

const TABS: { id: TabId; label: string }[] = [
  { id: "toko", label: "Toko" },
  { id: "kucing", label: "Kucing" },
  { id: "koleksi", label: "Kucingpedia" },
  { id: "rumah", label: "Rumah" },
  { id: "atur", label: "Atur" },
];

export interface UiDeps {
  sound(id: SoundId): void;
  /** true bila berhasil tersimpan. */
  saveNow(): Promise<boolean>;
  hide(): Promise<void>;
  quit(): Promise<void>;
  resetProgress(): Promise<void>;
  canHide: boolean;
}

export class Ui {
  private hud: HTMLElement;
  private fishEl: HTMLElement;
  private rateEl: HTMLElement;
  private feedBtn: HTMLButtonElement;
  private shopBtn: HTMLButtonElement;
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
    this.feedBtn = h("button", { class: "btn btn-feed", onclick: () => this.feedAll() }, "Beri makan");
    this.shopBtn = h("button", { class: "btn", onclick: () => this.togglePanel("toko") }, "Toko");
    this.hud = h(
      "div",
      { class: "card hud", "data-hit": true },
      h(
        "div",
        { class: "hud-counter", title: "Ikan" },
        h("img", { class: "px hud-icon", src: objectImageUrl("fish", 2), alt: "" }),
        h("div", { class: "hud-numbers" }, this.fishEl, this.rateEl),
      ),
      this.feedBtn,
      this.shopBtn,
      h("button", { class: "btn", onclick: () => this.togglePanel("kucing") }, "Kucing"),
      h("button", { class: "btn btn-icon", title: "Menu lain", onclick: () => this.togglePanel("koleksi") }, "⋯"),
    );
    this.toasts = h("div", { class: "toasts" });
    root.append(this.toasts, this.hud);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.dialog) this.closeDialog();
        else this.closePanel();
      }
    });
    window.addEventListener("pointerdown", () => (this.pointerHeld = true), true);
    for (const type of ["pointerup", "pointercancel", "blur"]) {
      window.addEventListener(type, () => (this.pointerHeld = false), true);
    }
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
    this.rateEl.textContent = spiritActive(s, now) ? `${formatRate(rate)} ✦` : formatRate(rate);
    this.rateEl.title = spiritActive(s, now) ? "Bonus semangat aktif" : "";

    const needs = this.game.needsFood();
    this.feedBtn.style.display = needs ? "" : "none";
    if (needs) {
      const cost = this.game.feedPrice(now);
      this.feedBtn.textContent = `Beri makan · ${formatFish(cost)}`;
      this.feedBtn.disabled = s.fish < cost;
    }
    this.shopBtn.classList.toggle("has-dot", this.anythingAffordable());
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
      default:
        break;
    }
    if (this.panelIdle()) this.renderPanel();
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
      body.append(
        h(
          "div",
          { class: "cat-card" },
          h("img", { class: "px avatar", src: catImageUrl(cat.coat, "sit", 2), alt: "" }),
          h(
            "div",
            { class: "info" },
            this.renderCatName(cat),
            h("div", { class: "desc" }, `${coat.name} · `, h("b", null, trait.name), `: ${trait.description}`),
            h(
              "div",
              { class: "meter-row" },
              h("span", { class: "meter-label" }, isHungry(cat) ? "Lapar" : "Kenyang"),
              h("div", { class: `meter${isHungry(cat) ? " low" : ""}` }, h("i", { style: { width: `${Math.round(cat.hunger * 100)}%` } })),
              h("span", { class: "contrib" }, contribution),
            ),
          ),
          this.renderAssign(cat),
        ),
      );
    }
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

  private renderCollection(body: HTMLElement): void {
    const s = this.game.state;
    const owned = new Set(s.cats.map((c) => c.coat));
    body.append(
      h("p", { class: "lead" }, `${owned.size} dari ${COATS.length} jenis kucing sudah tinggal bersamamu. Fasilitas yang lebih mahal menarik kucing yang lebih langka.`),
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
    body.append(
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
      this.toggle("Efek suara", st.sound, (v) => g.updateSettings({ sound: v })),
      h("h3", null, "Statistik"),
      h(
        "ul",
        { class: "plain stats" },
        h("li", null, `Total ikan: ${formatFish(g.state.totalFishAll)}`),
        h("li", null, `Kucing diadopsi: ${stats.catsAdopted}`),
        h("li", null, `Elusan: ${stats.petted}`),
        h("li", null, `Ikan berkilau ditangkap: ${stats.sparklesCaught}`),
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

  toast(message: string, ms = 4000): void {
    const el = h("div", { class: "card toast" }, message);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      el.classList.add("out");
      window.setTimeout(() => el.remove(), 400);
    }, ms);
  }

  /** Tips yang hanya tampil sekali per sesi. */
  tip(key: string, message: string, ms = 6000): void {
    if (this.seenTips.has(key)) return;
    this.seenTips.add(key);
    this.toast(message, ms);
  }
}
