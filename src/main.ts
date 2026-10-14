// Titik masuk: menyambungkan inti game, tampilan PixiJS, UI HTML, dan jembatan desktop.

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
  onQuitRequested,
  onVisibilityChanged,
  quitApp,
} from "./platform/desktop";
import { Stage } from "./render/stage";
import { playSound, type SoundId } from "./ui/sound";
import { Ui } from "./ui/ui";

async function main(): Promise<void> {
  const backend = createSaveBackend();
  const { state, fresh } = await loadState(backend, Date.now());
  const game = new Game(state);
  const saver = new AutoSaver(backend, () => game.state);
  const sound = (id: SoundId) => playSound(id, game.state.settings.sound);

  // Mode browser: beri tanda agar CSS bisa menampilkan latar contoh.
  if (!isTauri) document.body.classList.add("browser");

  let ui: Ui;
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
  });

  ui = new Ui(document.getElementById("ui")!, game, {
    sound,
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
      game.state = createInitialState(Date.now());
      await saver.saveNow();
      window.location.reload();
    },
    canHide: isTauri,
  });

  game.on((e) => {
    if (e.type === "adopted") stage.adoptVisitorAt(e.cat.id);
    else if (e.type === "settings") {
      stage.setPixelScale(game.state.settings.scale);
      stage.setFocusMode(game.state.settings.focusMode);
    } else stage.sync();
    stage.onGameEvent(e);
    ui.onGameEvent(e);
  });

  // Tick pertama menghitung progres selama game ditutup (event "offline").
  game.tick(Date.now());
  stage.sync();
  // Tamu yang sudah siap diadopsi sebelum game ditutup masih menunggu jawaban.
  if (game.state.visitor && game.state.visitor.fed >= 3) ui.showAdoptDialog();

  window.setInterval(() => {
    const now = Date.now();
    game.tick(now);
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

  const clickThrough = new ClickThroughController(
    (x, y) => htmlHitTest(x, y) || stage.hitTest(x, y),
    (x, y) => stage.setHover(x, y),
    () => stage.isCapturing(),
  );
  clickThrough.start();

  await onVisibilityChanged((visible) => {
    game.visible = visible;
    if (visible) clickThrough.reset();
    else stage.cancelPress();
    stage.setPaused(!visible);
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
  if (import.meta.env.DEV) Object.assign(window, { meow: { game, stage, ui } });

  await dockWindow();
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `Meow Corner gagal dimulai: ${String(err)}`;
});
