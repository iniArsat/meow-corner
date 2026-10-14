import { describe, expect, it } from "vitest";
import { SAVE_VERSION, createInitialState, migrateState } from "../src/core/state";

const NOW = new Date(2026, 9, 14, 19, 0).getTime();

describe("pengaturan v4: suara dan panel bawah", () => {
  it("permainan baru: suara menyala, panel lengkap dan pekat", () => {
    const s = createInitialState(NOW).settings;
    expect(s.sound).toBe(true);
    expect(s.volume).toBeCloseTo(0.7);
    expect(s.music).toBe(false);
    expect(s.hudSize).toBe("full");
    expect(s.hudCollapsed).toBe(false);
    expect(s.hudOpacity).toBe(1);
  });

  it("simpanan lama yang suaranya mati dinyalakan sekali", () => {
    const s = migrateState({ version: 3, cats: [{ coat: "oyen" }], settings: { sound: false, scale: 2 } }, NOW)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.settings.sound).toBe(true);
    expect(s.settings.scale).toBe(2);
  });

  it("pilihan pemain di v4 dihormati dan nilai rusak dibatasi", () => {
    const s = migrateState(
      {
        version: 4,
        cats: [{ coat: "oyen" }],
        settings: { sound: false, volume: 7, music: true, hudSize: "compact", hudCollapsed: true, hudOpacity: 0.05 },
      },
      NOW,
    )!;
    expect(s.settings.sound).toBe(false);
    expect(s.settings.volume).toBe(1);
    expect(s.settings.music).toBe(true);
    expect(s.settings.hudSize).toBe("compact");
    expect(s.settings.hudCollapsed).toBe(true);
    expect(s.settings.hudOpacity).toBe(0.3);
    const bad = migrateState({ version: 4, cats: [{ coat: "oyen" }], settings: { hudSize: "raksasa", volume: "keras" } }, NOW)!;
    expect(bad.settings.hudSize).toBe("full");
    expect(bad.settings.volume).toBeCloseTo(0.7);
  });
});
