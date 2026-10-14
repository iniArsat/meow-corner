// Jembatan ke sisi Rust (Tauri). Di browser biasa semua fungsi menjadi no-op,
// jadi game tetap bisa dikembangkan dan diuji dengan `npm run dev`.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LocalStorageBackend, type SaveBackend } from "../core/save";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface CursorInfo {
  x: number;
  y: number;
  inside: boolean;
}

/** Tinggi jendela strip (piksel logis). Ruang di atas strip dipakai panel. */
export const WINDOW_HEIGHT = 440;

export async function dockWindow(height = WINDOW_HEIGHT): Promise<void> {
  if (!isTauri) return;
  await invoke("dock_window", { height });
}

export async function setClickThrough(ignore: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke("set_click_through", { ignore });
}

export async function cursorInWindow(): Promise<CursorInfo | null> {
  if (!isTauri) return null;
  return invoke<CursorInfo>("cursor_in_window");
}

export async function hideWindow(): Promise<void> {
  if (!isTauri) return;
  await invoke("hide_window");
}

export async function quitApp(): Promise<void> {
  if (!isTauri) {
    window.close();
    return;
  }
  await invoke("quit_app");
}

/** Tray meminta keluar: simpan dulu, lalu panggil quitApp(). */
export async function onQuitRequested(cb: () => void): Promise<void> {
  if (!isTauri) return;
  await listen("request-quit", () => cb());
}

/** Jendela disembunyikan/ditampilkan (tray atau game layar penuh). */
export async function onVisibilityChanged(cb: (visible: boolean) => void): Promise<void> {
  if (!isTauri) {
    document.addEventListener("visibilitychange", () => cb(document.visibilityState === "visible"));
    return;
  }
  await listen<boolean>("visibility-changed", (e) => cb(e.payload));
  // Event bisa terkirim sebelum pendengar siap; tanyakan keadaan sekarang sekali.
  cb(await invoke<boolean>("window_visible"));
}

/** Munculkan strip yang disembunyikan pengguna (tidak berlaku saat ada aplikasi layar penuh). */
export async function showStrip(): Promise<void> {
  if (!isTauri) return;
  await invoke("show_strip");
}

export interface ScheduleItem {
  key: string;
  at: number;
  title: string;
  body: string;
  notify: boolean;
}

/** Serahkan jadwal ke sisi Rust, yang membunyikannya tepat waktu walau jendela tersembunyi. */
export async function setSchedule(items: ScheduleItem[]): Promise<void> {
  if (!isTauri) return;
  await invoke("set_schedule", { items });
}

export async function onScheduleDue(cb: (key: string) => void): Promise<void> {
  if (!isTauri) return;
  await listen<string>("schedule-due", (e) => cb(e.payload));
}

/** Simpan PNG ke folder Gambar/Meow Corner; mengembalikan path, atau null di browser. */
export async function savePhoto(name: string, png: Uint8Array): Promise<string | null> {
  if (!isTauri) {
    const url = URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    return null;
  }
  return invoke<string>("save_photo", { name, data: Array.from(png) });
}

export async function openPhotoFolder(): Promise<void> {
  if (!isTauri) return;
  await invoke("open_photo_folder");
}

class TauriSaveBackend implements SaveBackend {
  load(): Promise<string | null> {
    return invoke<string | null>("load_save");
  }

  save(data: string): Promise<void> {
    return invoke("write_save", { data });
  }

  loadBackup(): Promise<string | null> {
    return invoke<string | null>("load_backup");
  }
}

export function createSaveBackend(): SaveBackend {
  return isTauri ? new TauriSaveBackend() : new LocalStorageBackend();
}
