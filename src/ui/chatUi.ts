// Gelembung obrolan di atas kepala kucing: kucing "berbicara" huruf demi huruf,
// lalu pemain memilih jawaban. Juga celoteh singkat yang muncul sesekali.

import type { ChatContext } from "../core/dialogue";
import { Conversation, chatterLine, visitorLine, type ChatAction, type ChatAnim, type ChatInvite, type ChatStep } from "../core/dialogue";
import { hearts } from "../core/economy";
import type { Game } from "../core/game";
import type { SubTab } from "./assistantUi";
import { h } from "./dom";
import type { SoundId } from "./sound";

export interface ChatHost {
  catPosition(catId: string): { x: number; y: number } | null;
  /** Kucing berhenti untuk mengobrol; null bila tidak bisa sekarang. */
  startChat(catId: string): { mood: ChatContext["mood"] } | null;
  isChatting(catId: string): boolean;
  talk(catId: string, talking: boolean): void;
  anim(catId: string, anim: ChatAnim): void;
  hearts(catId: string): void;
  endChat(catId: string, final?: ChatAnim): void;
  treat(catId: string): boolean;
  forgive(catId: string): void;
  feedAll(): void;
  startFocus(): void;
  toy(): void;
  openAssistant(sub: SubTab): void;
  context(catId: string, mood: ChatContext["mood"]): ChatContext | null;
  sound(id: SoundId): void;
  pickChatterCat(): string | null;
  inviteChat(catId: string): void;
  chatterTalk(catId: string): void;
}

/** Huruf per detik saat kucing "berbicara". */
const CHARS_PER_SECOND = 38;
/** Obrolan yang dibiarkan tanpa jawaban ditutup sendiri. */
const IDLE_CLOSE_MS = 60_000;

interface OpenChat {
  catId: string;
  conv: Conversation;
  mood: ChatContext["mood"];
  el: HTMLElement;
  tail: HTMLElement;
  lineEl: HTMLElement;
  moreEl: HTMLElement;
  choicesEl: HTMLElement;
  step: ChatStep;
  queue: string[];
  /** Teks yang sedang diketik dan berapa huruf yang sudah tampil. */
  text: string;
  shown: number;
  typer: number;
  advance: number;
  lastInput: number;
  bonded: boolean;
  /** Aksi yang dijalankan saat obrolan ditutup (membuka panel, mainan). */
  closing: ChatAction[];
}

interface Bubble {
  catId: string;
  el: HTMLElement;
  tail: HTMLElement;
  timer: number;
}

export class ChatUi {
  private chat: OpenChat | null = null;
  private bubble: Bubble | null = null;
  private raf = 0;

  constructor(
    private root: HTMLElement,
    private game: Game,
    private host: ChatHost,
  ) {
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.chat) this.close();
    });
  }

  get activeCat(): string | null {
    return this.chat?.catId ?? null;
  }

  isOpen(): boolean {
    return this.chat !== null;
  }

  // -------------------------------------------------------------------------
  // Obrolan

  /** Buka obrolan dengan seekor kucing (klik kanan, panel Kucing, atau ajakan). */
  open(catId: string, invite: ChatInvite = null): boolean {
    if (this.chat?.catId === catId) return true;
    this.close();
    this.hideBubble();
    const started = this.host.startChat(catId);
    if (!started) return false;
    const mood = started.mood;
    const conv = new Conversation(
      () => this.host.context(catId, this.chat?.mood ?? mood) ?? this.fallbackContext(catId, mood),
      {
        nextStory: (count) => this.game.nextStory(catId, count),
        setName: (name) => this.game.setPlayerName(name),
        skipName: () => this.game.updateChat({ askedName: true }),
      },
    );
    const cat = this.game.cat(catId);
    const tail = h("div", { class: "alert-tail chat-tail" });
    const lineEl = h("div", { class: "chat-line", "aria-live": "polite" });
    const moreEl = h("span", { class: "chat-more" }, "▾");
    const choicesEl = h("div", { class: "chat-choices" });
    const hs = cat ? hearts(cat) : 0;
    const el = h(
      "div",
      { class: "card chat-bubble", "data-hit": true, role: "dialog", "aria-label": `Ngobrol dengan ${cat?.name ?? "kucing"}` },
      h(
        "div",
        { class: "chat-head" },
        h("span", { class: "chat-name" }, cat?.name ?? "Kucing"),
        h("span", { class: "chat-hearts", title: `${hs} hati` }, "♥".repeat(hs), h("span", { class: "off" }, "♥".repeat(5 - hs))),
        h("button", { class: "chat-close", title: "Tutup (Esc)", "aria-label": "Tutup", onclick: () => this.close() }, "✕"),
      ),
      h("div", { class: "chat-text", onclick: () => this.skip() }, lineEl, moreEl),
      choicesEl,
      tail,
    );
    this.root.append(el);
    this.chat = {
      catId,
      conv,
      mood,
      el,
      tail,
      lineEl,
      moreEl,
      choicesEl,
      step: { lines: [], choices: [] },
      queue: [],
      text: "",
      shown: 0,
      typer: 0,
      advance: 0,
      lastInput: Date.now(),
      bonded: false,
      closing: [],
    };
    this.game.chatStarted();
    this.play(conv.open(invite));
    this.startLoop();
    return true;
  }

  /** Tutup obrolan; kucing kembali beraktivitas. */
  close(): void {
    const c = this.chat;
    if (!c) return;
    this.chat = null;
    window.clearInterval(c.typer);
    window.clearTimeout(c.advance);
    c.el.remove();
    const final = c.step.end ? c.step.anim : undefined;
    this.host.endChat(c.catId, final === "sleep" || final === "zoomies" ? final : undefined);
    for (const action of c.closing) this.runAction(c.catId, action);
  }

  private fallbackContext(catId: string, mood: ChatContext["mood"]): ChatContext {
    // Kucing sudah tidak ada (misalnya dilepas saat obrolan terbuka): konteks minimal.
    const cat = this.game.cat(catId);
    return {
      name: cat?.name ?? "Kucing",
      trait: cat?.trait ?? "aktif",
      hearts: 0,
      hungry: false,
      mood,
      facility: null,
      accessory: null,
      coatName: "kucing",
      player: this.game.state.chat.playerName,
      askedName: true,
      phase: "siang",
      clock: "",
      hour: 12,
      weather: { enabled: false, kind: "clear", temp: null, source: "none", place: null, night: false },
      others: [],
      focus: { phase: "idle", minutesLeft: 0, focusMinutes: 25 },
      todos: { open: 0, top: null },
      reminder: null,
      typing: { enabled: false, today: 0, busy: false },
      treats: 0,
      canFeed: false,
      rand: Math.random,
    };
  }

  /** Tampilkan satu langkah obrolan: kalimat-kalimat kucing, lalu pilihan. */
  private play(step: ChatStep): void {
    const c = this.chat;
    if (!c) return;
    c.step = step;
    c.queue = [...step.lines];
    c.choicesEl.replaceChildren();
    c.el.classList.remove("has-choices");
    // Aksi langsung (camilan, makan) berjalan bersamaan dengan kalimatnya.
    for (const action of step.actions ?? []) {
      // Membuka panel, mainan, dan memberi makan semua kucing menunggu obrolan selesai
      // (memberi makan memanggil semua kucing ke mangkuk, termasuk yang sedang bicara).
      if (action === "openTodos" || action === "openReminders" || action === "openWeather" || action === "toy" || action === "feedAll") {
        c.closing.push(action);
      } else this.runAction(c.catId, action);
    }
    if (c.queue.length === 0) this.finishLines();
    else this.nextLine();
  }

  private nextLine(): void {
    const c = this.chat;
    if (!c) return;
    const text = c.queue.shift();
    if (text === undefined) {
      this.finishLines();
      return;
    }
    c.text = text;
    c.shown = 0;
    c.lineEl.textContent = "";
    c.moreEl.style.visibility = "hidden";
    // Kalimat dalam kurung adalah gerak-gerik, bukan ucapan.
    const spoken = !/^\(.*\)$/.test(text.trim());
    if (spoken) {
      this.host.talk(c.catId, true);
      this.host.sound("talk");
    }
    window.clearInterval(c.typer);
    c.typer = window.setInterval(() => {
      if (!this.chat || this.chat !== c) return;
      c.shown = Math.min(c.text.length, c.shown + 2);
      c.lineEl.textContent = c.text.slice(0, c.shown);
      if (c.shown >= c.text.length) this.lineDone();
    }, 2000 / CHARS_PER_SECOND);
  }

  private lineDone(): void {
    const c = this.chat;
    if (!c) return;
    window.clearInterval(c.typer);
    c.typer = 0;
    c.lineEl.textContent = c.text;
    this.host.talk(c.catId, false);
    if (c.queue.length > 0) {
      c.moreEl.style.visibility = "visible";
      window.clearTimeout(c.advance);
      c.advance = window.setTimeout(() => this.nextLine(), Math.min(2200, 700 + c.text.length * 22));
    } else this.finishLines();
  }

  /** Klik pada teks: tampilkan langsung, atau lanjut ke kalimat berikutnya. */
  private skip(): void {
    const c = this.chat;
    if (!c) return;
    c.lastInput = Date.now();
    if (c.typer) {
      c.shown = c.text.length;
      this.lineDone();
    } else if (c.queue.length > 0) {
      window.clearTimeout(c.advance);
      this.nextLine();
    }
  }

  private finishLines(): void {
    const c = this.chat;
    if (!c) return;
    c.moreEl.style.visibility = "hidden";
    const step = c.step;
    if (step.anim && step.anim !== "talk" && step.anim !== "sleep" && step.anim !== "zoomies") this.host.anim(c.catId, step.anim);
    if (step.end) {
      window.clearTimeout(c.advance);
      c.advance = window.setTimeout(() => {
        if (this.chat === c) this.close();
      }, 1600);
      return;
    }
    this.renderChoices(step);
  }

  private renderChoices(step: ChatStep): void {
    const c = this.chat;
    if (!c) return;
    const list = c.choicesEl;
    list.replaceChildren();
    if (step.input) {
      const input = step.input;
      const field = h("input", {
        class: "field-input",
        maxLength: 20,
        placeholder: input.placeholder,
        value: this.game.state.chat.playerName,
        onkeydown: (e: KeyboardEvent) => {
          e.stopPropagation();
          if (e.key === "Enter") submit();
          if (e.key === "Escape") this.close();
        },
      });
      const submit = () => {
        const value = field.value.trim();
        if (!value) {
          field.focus();
          return;
        }
        this.answered();
        this.play(c.conv.submitName(value));
      };
      list.append(
        h("div", { class: "chat-input" }, field, h("button", { class: "btn btn-primary small", onclick: submit }, "Oke")),
        h(
          "button",
          {
            class: "chat-choice bye",
            onclick: () => {
              this.answered();
              this.play(c.conv.choose(input.skipId));
            },
          },
          input.skipLabel,
        ),
      );
      c.el.classList.add("has-choices");
      window.setTimeout(() => field.focus(), 30);
      return;
    }
    for (const choice of step.choices) {
      list.append(
        h(
          "button",
          {
            class: `chat-choice${choice.kind === "bye" ? " bye" : ""}`,
            onclick: () => {
              if (this.chat !== c) return;
              this.answered();
              this.host.sound("pop");
              this.play(c.conv.choose(choice.id));
            },
          },
          choice.label,
        ),
      );
    }
    c.el.classList.add("has-choices");
  }

  /** Pemain menjawab: ikatan bertambah sekali per obrolan (dengan jeda per kucing di Game). */
  private answered(): void {
    const c = this.chat;
    if (!c) return;
    c.lastInput = Date.now();
    // Kucing yang masih ngambek belum mau menambah ikatan sampai dimaafkan.
    if (!c.bonded && c.mood !== "sulk") {
      c.bonded = true;
      if (this.game.chatBond(c.catId, Date.now())) this.host.hearts(c.catId);
    }
  }

  private runAction(catId: string, action: ChatAction): void {
    switch (action) {
      case "hearts":
        this.host.hearts(catId);
        break;
      case "treat":
        this.host.treat(catId);
        break;
      case "feedAll":
        this.host.feedAll();
        break;
      case "focus":
        this.host.startFocus();
        break;
      case "toy":
        this.host.toy();
        break;
      case "openTodos":
        this.host.openAssistant("tugas");
        break;
      case "openReminders":
        this.host.openAssistant("pengingat");
        break;
      case "openWeather":
        this.host.openAssistant("cuaca");
        break;
      case "forgive":
        this.host.forgive(catId);
        if (this.chat?.catId === catId) this.chat.mood = "normal";
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Celoteh

  /**
   * Seekor kucing berceloteh sebentar, atau (bila `invite`) mengajak ngobrol.
   * Mengembalikan true bila ada yang tampil.
   */
  chatter(invite: boolean): boolean {
    if (this.chat || this.bubble) return false;
    const catId = this.host.pickChatterCat();
    if (!catId) return false;
    const ctx = this.host.context(catId, "normal");
    if (!ctx) return false;
    const { line, invite: reason } = chatterLine(ctx, invite);
    const button = reason
      ? h(
          "button",
          {
            class: "btn small btn-primary",
            onclick: () => {
              this.hideBubble();
              this.open(catId, reason);
            },
          },
          "Ada apa?",
        )
      : null;
    if (reason) this.host.inviteChat(catId);
    else this.host.chatterTalk(catId);
    this.host.sound(reason ? "chirp" : "talk");
    this.showBubble(catId, line, button, reason ? 12_000 : 6_500);
    return true;
  }

  /** Seekor kucing mengucapkan satu kalimat (misalnya sapaan pagi). false bila tidak bisa. */
  say(catId: string, text: string, ms = 8000): boolean {
    if (this.chat || this.bubble || !this.host.catPosition(catId)) return false;
    this.host.sound("talk");
    this.showBubble(catId, text, null, ms);
    return true;
  }

  /** Kucing liar yang mampir menjawab klik kanan. */
  visitorTalk(): void {
    if (this.chat) this.close();
    this.hideBubble();
    this.host.sound("talk");
    this.showBubble("visitor", visitorLine(Math.random), null, 5_500);
  }

  private showBubble(catId: string, text: string, button: HTMLElement | null, ms: number): void {
    const tail = h("div", { class: "alert-tail chat-tail" });
    const el = h(
      "div",
      { class: "card chat-bubble chatter", "data-hit": true, onclick: (e: MouseEvent) => e.target === el && this.hideBubble() },
      h("div", { class: "chat-line" }, text),
      button ? h("div", { class: "chat-choices" }, button) : null,
      tail,
    );
    this.root.append(el);
    const timer = window.setTimeout(() => this.hideBubble(), ms);
    this.bubble = { catId, el, tail, timer };
    this.startLoop();
  }

  hideBubble(): void {
    const b = this.bubble;
    if (!b) return;
    this.bubble = null;
    window.clearTimeout(b.timer);
    b.el.remove();
  }

  // -------------------------------------------------------------------------
  // Posisi gelembung mengikuti kepala kucing

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      if (!this.chat && !this.bubble) return;
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.tick();
    this.raf = requestAnimationFrame(loop);
  }

  private tick(): void {
    const c = this.chat;
    if (c) {
      // Kucing diangkat, dipanggil, atau dilepas: obrolan berakhir.
      if (!this.host.isChatting(c.catId)) {
        this.close();
      } else if (!c.typer && c.queue.length === 0 && Date.now() - c.lastInput > IDLE_CLOSE_MS) {
        this.close();
      } else this.place(c.el, c.tail, c.catId);
    }
    const b = this.bubble;
    if (b && !this.place(b.el, b.tail, b.catId)) this.hideBubble();
  }

  /** Letakkan gelembung di atas kepala kucing; false bila kucingnya tidak terlihat. */
  private place(el: HTMLElement, tail: HTMLElement, catId: string): boolean {
    const pos = this.host.catPosition(catId);
    if (!pos) return false;
    const w = el.offsetWidth || 260;
    const hgt = el.offsetHeight || 80;
    const left = Math.min(Math.max(8, pos.x - w / 2), window.innerWidth - w - 8);
    const bottom = Math.min(window.innerHeight - pos.y + 14, window.innerHeight - hgt - 4);
    el.style.left = `${Math.round(left)}px`;
    el.style.bottom = `${Math.round(bottom)}px`;
    tail.style.left = `${Math.round(Math.min(w - 18, Math.max(10, pos.x - left - 7)))}px`;
    return true;
  }
}
