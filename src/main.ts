// Titik masuk: menyambungkan inti game, tampilan PixiJS, UI HTML, dan jembatan desktop.

import "@fontsource/tiny5/latin-400.css";
import "./ui/style.css";
import { Game } from "./core/game";
import { AutoSaver, loadState } from "./core/save";
import { createInitialState } from "./core/state";
import { ClickThroughController, htmlHitTest } from "./platform/clickThrough";
import {
  createSaveBackend,
  dockWindow,
  hideWindow,
  isTauri,
  onInputTaps,
  onQuitRequested,
  onScheduleDue,
  onVisibilityChanged,
  openPhotoFolder,
  quitApp,
  savePhoto,
  setSchedule,
  setTypingHook,
  showStrip,
} from "./platform/desktop";
import { chatContext } from "./core/chatContext";
import { ChatUi } from "./ui/chatUi";
import { pad2 } from "./core/assistant";
import { Stage } from "./render/stage";
import {
  configureSound,
  playSound,
  setMusic,
  setMusicPaused,
  setRainPaused,
  setRainSound,
  unlockAudio,
  type SoundId,
} from "./ui/sound";
import type { WeatherPlace } from "./core/types";
import { currentWeather, isWet, needsRefresh, precipitation } from "./core/weather";
import { detectPlace, fetchForecast, searchPlaces, weatherError } from "./platform/weatherService";
import { Ui } from "./ui/ui";

async function main(): Promise<void> {
  const backend = createSaveBackend();
  const { state, fresh } = await loadState(backend, Date.now());
  const game = new Game(state);
  const saver = new AutoSaver(backend, () => game.state);
  const sound = (id: SoundId) => playSound(id);
  const applySound = () => {
    const st = game.state.settings;
    configureSound(st.sound, st.volume);
    setMusic(st.music);
  };
  applySound();
  // Browser biasa baru mengizinkan suara setelah interaksi pertama.
  window.addEventListener("pointerdown", () => unlockAudio(), { capture: true, once: true });

  // Mode browser: beri tanda agar CSS bisa menampilkan latar contoh.
  if (!isTauri) document.body.classList.add("browser");

  let ui: Ui;
  let chatUi: ChatUi;
  const stage = await Stage.create(document.getElementById("stage")!, game, {
    pet(catId) {
      if (!game.petCat(catId, Date.now())) return;
      sound("pet");
      ui.tip("pet", "Elusan memberi bonus semangat +10% selama 10 menit.");
    },
    purr: (catId) => game.purr(catId, Date.now()),
    treat: (catId) => game.giveTreat(catId, Date.now()),
    toyCatch: (catId) => game.toyCatch(catId, Date.now()),
    assign: (catId, facility) => game.assignCat(catId, facility),
    feedVisitor() {
      const fed = game.feedVisitor(Date.now());
      sound("feed");
      if (fed >= 3) ui.showAdoptDialog();
      return fed;
    },
    catchSparkle: () => game.catchSparkle(Date.now()),
    collectGift: (giftId) => game.collectGift(giftId, Date.now()),
    openFacility: (id) => ui.openPanel("toko", id),
    sound,
    tip: (key, text) => ui.tip(key, text),
    modesChanged: () => ui.refreshModes(),
    alertCatClicked: (catId) => ui.assistant.dismissForCat(catId),
    chat: (catId) => {
      if (chatUi && !chatUi.open(catId)) sound("denied");
    },
    visitorTalk: () => chatUi?.visitorTalk(),
  });

  /** Foto strip berbingkai, disimpan ke folder Gambar/Meow Corner. */
  async function takePhoto(): Promise<string | null> {
    const d = new Date();
    const date = d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const canvas = stage.photo(`${date} · ${game.state.cats.length} kucing`);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("gambar tidak bisa dibuat");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    return savePhoto(`meow-${stamp}`, bytes);
  }

  ui = new Ui(document.getElementById("ui")!, game, {
    sound,
    previewVolume: (v) => configureSound(game.state.settings.sound, v),
    interactions: {
      toyMode: () => stage.toyMode,
      setToyMode: (on) => stage.setToyMode(on),
      treatMode: () => stage.treatMode,
      setTreatMode: (on) => stage.setTreatMode(on),
      callCat: (catId) => stage.callCat(catId),
    },
    saveNow: () => saver.saveNow(),
    hide: () => hideWindow(),
    quit: async () => {
      await saver.saveNow();
      await quitApp();
    },
    resetProgress: async () => {
      // Pengingat, daftar tugas, nama panggilan, dan pilihan privasi bukan progres game; tetap disimpan.
      const { assistant, chat, typing } = game.state;
      game.state = createInitialState(Date.now());
      game.state.assistant = assistant;
      game.state.chat.playerName = chat.playerName;
      game.state.chat.askedName = chat.askedName;
      game.state.chat.chatter = chat.chatter;
      game.state.typing.enabled = typing.enabled;
      game.state.typing.asked = typing.asked;
      await saver.saveNow();
      window.location.reload();
    },
    canHide: isTauri,
    catPosition: (catId) => stage.catPosition(catId),
    alertDone: (catId, key) => stage.releaseAlert(catId, key),
    takePhoto,
    openPhotoFolder,
    canOpenFolder: isTauri,
    weather: {
      refresh: () => refreshWeather(true),
      search: (name) => searchPlaces(name),
      detect: () => detectPlace(),
      icon: () => stage.weatherIcon(),
    },
    chat: (catId) => {
      if (chatUi && !chatUi.open(catId)) ui.toast("Kucing itu sedang sibuk. Coba lagi sebentar lagi.");
    },
    typingSystemWide: () => typingWide,
  });

  // Kucing ikut mengetik: jumlah ketukan dari Rust (seluruh Windows), atau dari
  // jendela ini sendiri bila penghitung sistem tidak tersedia.
  const tapLog: { t: number; n: number }[] = [];
  let typingWide = false;
  /** Banyak mengetik dalam 15 menit terakhir: kucing menyarankan istirahat. */
  const typingBusy = () => {
    const cutoff = Date.now() - 15 * 60_000;
    while (tapLog.length > 0 && tapLog[0].t < cutoff) tapLog.shift();
    return tapLog.reduce((sum, x) => sum + x.n, 0) >= 1200;
  };
  const handleTaps = (count: number) => {
    const now = Date.now();
    const [n, fish] = game.addTaps(count, now);
    if (n <= 0) return;
    stage.onTaps(n, fish);
    const last = tapLog[tapLog.length - 1];
    if (last && now - last.t < 10_000) last.n += n;
    else tapLog.push({ t: now, n });
  };
  // Pengait hanya terpasang saat fitur menyala DAN strip tampil (tidak saat ada game
  // layar penuh), agar tidak mengganggu game dan anti-cheat.
  const applyTyping = async () => {
    typingWide = await setTypingHook(game.state.typing.enabled && game.visible);
  };
  window.addEventListener(
    "keydown",
    (e) => {
      if (!typingWide && !e.repeat) handleTaps(1);
    },
    { capture: true },
  );
  window.addEventListener(
    "pointerdown",
    () => {
      if (!typingWide) handleTaps(1);
    },
    { capture: true },
  );
  chatUi = new ChatUi(document.getElementById("ui")!, game, {
    catPosition: (id) => stage.catPosition(id),
    startChat: (id) => stage.startChat(id),
    isChatting: (id) => stage.isChatting(id),
    talk: (id, on) => stage.chatTalk(id, on),
    anim: (id, anim) => stage.chatAnim(id, anim),
    hearts: (id) => stage.chatHearts(id),
    endChat: (id, final) => stage.endChat(id, final),
    treat: (id) => stage.treatCat(id),
    forgive: (id) => stage.forgive(id),
    feedAll: () => ui.feedAll(),
    startFocus: () => {
      game.startFocus(Date.now());
      ui.toast(`Fokus ${game.state.assistant.focus.focusMinutes} menit dimulai. Kucing-kucing ikut tenang.`);
    },
    toy: () => {
      stage.setToyMode(true);
      ui.refreshModes();
    },
    openAssistant: (sub) => {
      ui.assistant.openSub(sub);
      ui.openPanel("asisten");
    },
    context: (id, mood) => chatContext(game, id, Date.now(), { mood, typingBusy: typingBusy() }),
    sound,
    pickChatterCat: () => stage.pickChatterCat(),
    inviteChat: (id) => stage.inviteChat(id),
    chatterTalk: (id) => stage.chatterTalk(id),
  });
  await onInputTaps(handleTaps);
  void applyTyping();

  // Cuaca sungguhan: diambil saat mulai, lalu dicek tiap menit (diperbarui tiap 20 menit).
  let weatherFetch: { place: WeatherPlace; promise: Promise<string | null> } | null = null;
  async function refreshWeather(force = false): Promise<string | null> {
    const place = game.state.weather.place;
    if (!place) return "Pilih kota dulu.";
    if (weatherFetch) {
      // Pengambilan untuk kota yang sama sedang berjalan: tunggu hasilnya saja.
      if (weatherFetch.place === place) return weatherFetch.promise;
      // Kota sudah diganti: tunggu yang lama selesai, lalu ambil untuk kota baru.
      await weatherFetch.promise;
      return refreshWeather(force);
    }
    if (!force && !needsRefresh(game.state.weather, Date.now())) return null;
    const promise = (async () => {
      try {
        const snap = await fetchForecast(place);
        // Kota bisa saja diganti selama menunggu jawaban.
        if (game.state.weather.place === place) game.setWeatherSnapshot(snap, Date.now());
        return null;
      } catch (err) {
        return weatherError(err);
      } finally {
        weatherFetch = null;
      }
    })();
    weatherFetch = { place, promise };
    return promise;
  }
  const applyRain = () => {
    const w = game.state.weather;
    const cw = currentWeather(w, Date.now());
    setRainSound(w.enabled && w.rainSound && isWet(cw.kind) ? precipitation(cw.kind, cw.code) : 0);
  };

  // Jadwal asisten dikirim ke sisi Rust setiap kali berubah (dan berkala, untuk bunyi jam).
  let scheduleTimer = 0;
  const pushSchedule = () => {
    window.clearTimeout(scheduleTimer);
    scheduleTimer = window.setTimeout(() => void setSchedule(game.schedule(Date.now())).catch(() => undefined), 50);
  };
  const applyQuiet = () =>
    stage.setFocusMode(game.state.settings.focusMode || game.state.assistant.focus.phase === "focus");

  game.on((e) => {
    if (e.type === "adopted") stage.adoptVisitorAt(e.cat.id);
    else if (e.type === "released") stage.farewell(e.cat.id);
    else if (e.type === "settings") {
      stage.setPixelScale(game.state.settings.scale);
      applyQuiet();
      applySound();
    } else stage.sync();
    stage.onGameEvent(e);
    ui.onGameEvent(e);
    if (e.type === "weather") applyRain();
    else if (e.type === "weatherChanged") stage.onWeatherChanged(e.to, e.reason !== "other");
    else if (e.type === "greeting") {
      // Sapaan diucapkan seekor kucing lewat gelembung kata.
      const catId = stage.greet();
      const text = ui.greetingText(e.phase);
      if (!catId || !chatUi.say(catId, text, 9000)) ui.toast(text, 8000);
    } else if (e.type === "typing") void applyTyping();
    if (e.type === "assistant") {
      pushSchedule();
      applyQuiet();
      ui.refreshHud(Date.now());
    } else if (e.type === "alert") {
      // Pesan penting lebih dulu: obrolan dan celoteh ditutup (bunyi jam tidak punya kartu).
      if (e.alert.kind !== "chime") {
        chatUi.close();
        chatUi.hideBubble();
      }
      const catId = stage.summonForAlert(e.alert);
      ui.showAlert(e.alert, catId);
      const important = e.alert.kind === "reminder" || e.alert.kind === "focusDone" || e.alert.kind === "breakDone";
      if (important && !game.visible && game.state.assistant.showOnAlert) void showStrip();
    } else if (e.type === "todoDone") stage.cheer();
  });

  // Tick pertama menghitung progres selama game ditutup (event "offline").
  game.tick(Date.now());
  stage.sync();
  // Dengarkan jadwal dari Rust sebelum jadwal pertama dikirim, agar tidak ada yang hilang.
  await onScheduleDue((key) => game.handleDue(key, Date.now()));
  // Pengingat yang terlewat selama aplikasi tertutup.
  const missed = game.catchUp(Date.now());
  window.setTimeout(() => {
    for (const m of missed.slice(-3)) ui.toast(`Terlewat: “${m.title}” (${m.body.replace("Terlewat pukul ", "")})`, 9000);
  }, 1500);
  applyQuiet();
  pushSchedule();
  window.setInterval(pushSchedule, 60_000);
  applyRain();
  void refreshWeather();
  window.setInterval(() => {
    void refreshWeather();
    // Data yang menjadi usang juga mematikan suara hujan.
    applyRain();
  }, 60_000);
  // Sapaan pagi/siang/sore/malam, setelah strip tenang dulu sebentar.
  window.setTimeout(() => {
    const greet = () => {
      if (game.visible) game.checkGreeting(Date.now());
    };
    greet();
    window.setInterval(greet, 15_000);
  }, 6000);
  // Celoteh kucing: sesekali satu kalimat pendek, kadang ajakan ngobrol.
  let nextChatterAt = Date.now() + (3 + Math.random() * 3) * 60_000;
  window.setInterval(() => {
    const now = Date.now();
    if (now < nextChatterAt) return;
    const s = game.state;
    const quiet = s.settings.focusMode || s.assistant.focus.phase === "focus";
    if (!game.visible || !s.chat.chatter || quiet || ui.assistant.hasAlert() || chatUi.isOpen()) return;
    if (chatUi.chatter(Math.random() < 0.35)) nextChatterAt = now + (8 + Math.random() * 14) * 60_000;
  }, 20_000);

  // Tamu yang sudah siap diadopsi sebelum game ditutup masih menunggu jawaban.
  if (game.state.visitor && game.state.visitor.fed >= 3) ui.showAdoptDialog();

  window.setInterval(() => {
    const now = Date.now();
    game.tick(now);
    // Di browser tidak ada pengecek jadwal Rust; periksa di sini. Di Tauri, jaring
    // pengaman untuk event yang hilang (Rust biasanya berbunyi dalam 1 detik).
    game.pollDue(now, isTauri ? 4000 : 0);
    ui.refreshHud(now);
    stage.reservedRight = ui.hudReservedWidth();
  }, 250);
  ui.refreshHud(Date.now());
  saver.start();

  if (fresh) {
    window.setTimeout(() => ui.toast("Halo! Ini Oyen. Buka Toko dan beli Mangkuk makan pertamamu.", 8000), 800);
  }
  // Perkenalan interaksi v2, hanya untuk yang belum pernah mencobanya.
  const stats = game.state.stats;
  window.setTimeout(() => {
    if (stats.purrs === 0) ui.tip("intro-rub", "Coba usap-usap kucing: gerakkan kursor bolak-balik di atasnya tanpa klik sampai ia mendengkur.", 9000);
  }, fresh ? 25_000 : 6_000);
  window.setTimeout(() => {
    if (stats.toyCatches === 0) ui.tip("intro-toy", "Tekan tombol bulu di panel bawah, lalu goyangkan kursor di dekat lantai. Kucing akan mengejarnya!", 9000);
  }, fresh ? 70_000 : 40_000);
  window.setTimeout(() => {
    ui.tip("intro-drag", "Kucing bisa diangkat: seret dengan mouse, lalu jatuhkan di atas fasilitas untuk menugaskannya.", 9000);
  }, fresh ? 120_000 : 90_000);
  window.setTimeout(() => {
    ui.tip(
      "intro-assistant",
      "Baru: tombol lonceng di panel bawah. Atur pengingat (misalnya meeting jam 5), timer fokus, dan daftar tugas. Kucing yang akan mengingatkanmu!",
      10_000,
    );
  }, fresh ? 160_000 : 12_000);

  window.setTimeout(() => {
    ui.tip(
      "intro-chat",
      "Baru: klik kanan seekor kucing untuk mengobrol! Dia menjawab sesuai sifat, suasana hati, cuaca, dan jadwalmu.",
      10_000,
    );
  }, fresh ? 200_000 : 20_000);
  // Kucing ikut mengetik butuh izin: tanyakan sekali (setelah strip tenang).
  const askTyping = () => {
    if (game.state.typing.asked) return;
    // Dialog lain (adopsi) didahulukan; tanyakan lagi nanti bila belum dijawab.
    if (game.visible) ui.showTypingConsent();
    window.setTimeout(askTyping, 60_000);
  };
  window.setTimeout(askTyping, fresh ? 240_000 : 8_000);

  const clickThrough = new ClickThroughController(
    (x, y) => htmlHitTest(x, y) || stage.hitTest(x, y),
    (x, y) => stage.setHover(x, y),
    () => stage.isCapturing(),
  );
  clickThrough.start();

  await onVisibilityChanged((visible) => {
    game.visible = visible;
    void applyTyping();
    if (visible) clickThrough.reset();
    else stage.cancelPress();
    stage.setPaused(!visible);
    setMusicPaused(!visible);
    setRainPaused(!visible);
    if (!visible) void saver.saveNow();
  });
  await onQuitRequested(async () => {
    await saver.saveNow();
    await quitApp();
  });
  window.addEventListener("beforeunload", () => void saver.saveNow());
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // Hanya saat pengembangan: akses dari konsol DevTools, misalnya
  // meow.game.state.fish = 1e6 untuk mencoba toko.
  if (import.meta.env.DEV) Object.assign(window, { meow: { game, stage, ui, chatUi } });

  await dockWindow();
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `Meow Corner gagal dimulai: ${String(err)}`;
});
