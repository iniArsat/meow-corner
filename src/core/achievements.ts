// Prestasi: target kecil yang memberi camilan atau ikan saat tercapai.

import { COAT_BY_ID } from "./data";
import { hearts } from "./economy";
import type { GameState } from "./types";
import { FACILITY_IDS } from "./types";

export interface AchievementReward {
  treats?: number;
  /** Ikan senilai produksi selama sekian detik. */
  fishSeconds?: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Nilai sekarang dan target, untuk bilah kemajuan. */
  progress(s: GameState): [number, number];
  reward: AchievementReward;
  /** Disembunyikan sampai terbuka. */
  secret?: boolean;
}

function stat(target: number, get: (s: GameState) => number): AchievementDef["progress"] {
  return (s) => [Math.min(target, get(s)), target];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "elus-1", name: "Elusan pertama", description: "Elus kucing sekali.", progress: stat(1, (s) => s.stats.petted), reward: { treats: 1 } },
  { id: "elus-100", name: "Tukang elus", description: "Elus kucing 100 kali.", progress: stat(100, (s) => s.stats.petted), reward: { treats: 3 } },
  { id: "dengkur-1", name: "Prrr...", description: "Buat kucing mendengkur dengan usapan.", progress: stat(1, (s) => s.stats.purrs), reward: { treats: 2 } },
  { id: "dengkur-50", name: "Pembisik kucing", description: "Buat kucing mendengkur 50 kali.", progress: stat(50, (s) => s.stats.purrs), reward: { treats: 5 } },
  { id: "kucing-3", name: "Rumah ramai", description: "Tinggal bersama 3 kucing.", progress: stat(3, (s) => s.cats.length), reward: { fishSeconds: 300 } },
  { id: "kucing-6", name: "Kos-kosan kucing", description: "Tinggal bersama 6 kucing.", progress: stat(6, (s) => s.cats.length), reward: { fishSeconds: 900 } },
  {
    id: "koleksi-8",
    name: "Kolektor bulu",
    description: "Temukan 8 jenis kucing di Kucingpedia.",
    progress: stat(8, (s) => s.discovered.filter((d) => COAT_BY_ID[d]).length),
    reward: { fishSeconds: 600 },
  },
  { id: "sahabat", name: "Sahabat sejati", description: "Capai 5 hati dengan seekor kucing.", progress: stat(1, (s) => (s.cats.some((c) => hearts(c) >= 5) ? 1 : 0)), reward: { treats: 5 } },
  { id: "kado-1", name: "Kado pertama", description: "Terima hadiah dari kucing.", progress: stat(1, (s) => s.stats.giftsReceived), reward: { treats: 2 } },
  { id: "bulu-10", name: "Penggoda bulu", description: "Kucing menangkap mainan bulu 10 kali.", progress: stat(10, (s) => s.stats.toyCatches), reward: { fishSeconds: 300 } },
  { id: "camilan-20", name: "Dimanja camilan", description: "Berikan 20 camilan.", progress: stat(20, (s) => s.stats.treatsGiven), reward: { fishSeconds: 300 } },
  { id: "aksesori-5", name: "Fashionista", description: "Miliki 5 aksesori.", progress: stat(5, (s) => s.inventory.accessories.length), reward: { treats: 3 } },
  { id: "fasilitas-6", name: "Rumah lengkap", description: "Miliki keenam jenis fasilitas.", progress: stat(6, (s) => FACILITY_IDS.filter((id) => s.facilities[id] > 0).length), reward: { fishSeconds: 600 } },
  { id: "ikan-1jt", name: "Juragan ikan", description: "Kumpulkan total 1 juta ikan.", progress: stat(1e6, (s) => s.totalFishAll), reward: { treats: 5 } },
  { id: "ikan-1m", name: "Konglomerat kucing", description: "Kumpulkan total 1 miliar ikan.", progress: stat(1e9, (s) => s.totalFishAll), reward: { treats: 10 } },
  { id: "pindah-1", name: "Pindahan", description: "Pindah Rumah untuk pertama kali.", progress: stat(1, (s) => s.stats.prestiges), reward: { treats: 5 } },
  { id: "pengingat-1", name: "Tepat waktu", description: "Dibangunkan kucing oleh pengingat.", progress: stat(1, (s) => s.stats.remindersFired), reward: { treats: 2 } },
  { id: "fokus-1", name: "Fokus!", description: "Selesaikan satu sesi fokus.", progress: stat(1, (s) => s.stats.focusSessions), reward: { treats: 3 } },
  { id: "fokus-20", name: "Mesin produktif", description: "Selesaikan 20 sesi fokus.", progress: stat(20, (s) => s.stats.focusSessions), reward: { treats: 10 } },
  { id: "tugas-10", name: "Tuntas", description: "Selesaikan 10 tugas di daftar.", progress: stat(10, (s) => s.stats.todosDone), reward: { treats: 5 } },
  { id: "sehat-10", name: "Hidup sehat", description: "Ikuti pengingat sehat 10 kali.", progress: stat(10, (s) => s.stats.wellnessDone), reward: { treats: 3 } },
  { id: "harian-7", name: "Setia", description: "Buka Meow Corner 7 hari berturut-turut.", progress: stat(7, (s) => s.daily.best), reward: { treats: 10 } },
  { id: "foto-1", name: "Fotografer", description: "Ambil foto kucing-kucingmu.", progress: stat(1, (s) => s.stats.photos), reward: { treats: 2 } },
  { id: "ngobrol-1", name: "Halo, meong", description: "Ngobrol dengan kucing (klik kanan kucingnya).", progress: stat(1, (s) => s.stats.chats), reward: { treats: 1 } },
  { id: "ngobrol-30", name: "Teman curhat", description: "Ngobrol dengan kucing 30 kali.", progress: stat(30, (s) => s.stats.chats), reward: { treats: 5 } },
  { id: "kenalan", name: "Kenalan", description: "Beri tahu kucing namamu.", progress: stat(1, (s) => (s.chat.playerName ? 1 : 0)), reward: { treats: 2 }, secret: true },
  { id: "ketik-1rb", name: "Rekan kerja", description: "Mengetik 1.000 ketukan bersama kucing.", progress: stat(1000, (s) => s.stats.taps), reward: { treats: 3 } },
  { id: "ketik-10rb", name: "Jari besi", description: "Mengetik 10.000 ketukan bersama kucing.", progress: stat(10_000, (s) => s.stats.taps), reward: { fishSeconds: 900 } },
  { id: "ketik-100rb", name: "Pianis keyboard", description: "Mengetik 100.000 ketukan bersama kucing.", progress: stat(100_000, (s) => s.stats.taps), reward: { treats: 10 } },
  { id: "pamit", name: "Selamat jalan", description: "Lepaskan seekor kucing ke dunia luar.", progress: stat(1, (s) => s.stats.catsReleased), reward: { treats: 1 }, secret: true },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function describeReward(r: AchievementReward): string {
  const parts: string[] = [];
  if (r.treats) parts.push(`${r.treats} camilan`);
  if (r.fishSeconds) parts.push(`ikan ${Math.round(r.fishSeconds / 60)} menit produksi`);
  return parts.join(" + ");
}
