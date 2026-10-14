// Titik masuk: menyambungkan inti game, tampilan PixiJS, UI HTML, dan jembatan desktop.

import "./ui/style.css";
import { Game } from "./core/game";
import { AutoSaver, loadState } from "./core/save";
import { createInitialState } from "./core/state";
import { formatFish } from "./core/format";
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
    onCatClick(catId) {
      const now = Date.now();
      if (!game.petCat(catId, now)) return;
      stage.petCat(catId);
      sound("pet");
      ui.tip("pet", "Elusan memberi bonus semangat +10% selama 10 menit.");
    },
    onVisitorClick() {
      const fed = game.feedVisitor(Date.now());
      const pos = stage.catPosition("visitor");
      if (pos) {
        stage.emitHearts(pos.x, pos.y, 2);
        stage.floatText(pos.x, pos.y - 8, `${Math.min(fed, 3)}/3`, 0xffc2cf);
      }
      sound("feed");
      if (fed >= 3) ui.showAdoptDialog();
    },
    onSparkleClick() {
      const pos = stage.sparklePosition();
      const reward = game.catchSparkle(Date.now());
      if (reward > 0 && pos) {
        stage.emitStars(pos.x, pos.y, 8);
        stage.floatText(pos.x, pos.y - 10, `+${formatFish(reward)} ikan`);
        sound("coin");
      }
    },
    onFacilityClick(id) {
      ui.openPanel("toko", id);
    },
  });

  ui = new Ui(document.getElementById("ui")!, game, {
    sound,
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

  const clickThrough = new ClickThroughController(
    (x, y) => htmlHitTest(x, y) || stage.hitTest(x, y),
    (x, y) => stage.setHover(x, y),
  );
  clickThrough.start();

  await onVisibilityChanged((visible) => {
    game.visible = visible;
    if (visible) clickThrough.reset();
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
