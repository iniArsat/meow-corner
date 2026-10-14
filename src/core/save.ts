// Sistem simpan: serialisasi JSON berversi + backend penyimpanan yang bisa ditukar.

import { createInitialState, migrateState } from "./state";
import type { GameState } from "./types";

export interface SaveBackend {
  load(): Promise<string | null>;
  save(data: string): Promise<void>;
  /** Cadangan simpanan sebelumnya, dipakai bila simpanan utama rusak. */
  loadBackup?(): Promise<string | null>;
}

/** Backend untuk mode browser (pengembangan tanpa Tauri). */
export class LocalStorageBackend implements SaveBackend {
  constructor(private key = "meow-corner-save") {}

  async load(): Promise<string | null> {
    try {
      return localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }

  async save(data: string): Promise<void> {
    try {
      localStorage.setItem(this.key, data);
    } catch {
      // Penyimpanan penuh atau diblokir: abaikan, autosave berikutnya mencoba lagi.
    }
  }
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function parseSave(raw: string | null, now: number): GameState | null {
  if (!raw) return null;
  try {
    return migrateState(JSON.parse(raw) as unknown, now);
  } catch {
    return null;
  }
}

/** Muat state dari backend. Bila simpanan utama rusak, coba cadangan; bila tidak ada, mulai baru. */
export async function loadState(backend: SaveBackend, now: number): Promise<{ state: GameState; fresh: boolean }> {
  let main: string | null = null;
  try {
    main = await backend.load();
  } catch (err) {
    console.warn("Gagal membaca simpanan utama.", err);
  }
  const fromMain = parseSave(main, now);
  if (fromMain) return { state: fromMain, fresh: false };

  if (backend.loadBackup) {
    try {
      const fromBackup = parseSave(await backend.loadBackup(), now);
      if (fromBackup) {
        console.warn("Simpanan utama rusak; memakai cadangan.");
        return { state: fromBackup, fresh: false };
      }
    } catch (err) {
      console.warn("Gagal membaca cadangan simpanan.", err);
    }
  }
  return { state: createInitialState(now), fresh: true };
}

export class AutoSaver {
  private timer: number | undefined;
  private saving: Promise<void> | null = null;

  constructor(
    private backend: SaveBackend,
    private getState: () => GameState,
    private intervalMs = 60_000,
  ) {}

  start(): void {
    this.stop();
    this.timer = window.setInterval(() => void this.saveNow(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Simpan sekarang. Tidak pernah melempar error; mengembalikan false bila gagal. */
  async saveNow(): Promise<boolean> {
    // Satu penyimpanan pada satu waktu; panggilan berikutnya menunggu yang berjalan.
    if (this.saving) await this.saving.catch(() => undefined);
    this.saving = this.backend.save(serialize(this.getState())).finally(() => {
      this.saving = null;
    });
    try {
      await this.saving;
      return true;
    } catch (err) {
      console.error("Gagal menyimpan permainan.", err);
      return false;
    }
  }
}
