// Data konten game. Ubah angka di sini untuk balancing tanpa menyentuh logika.

import type {
  AccessoryDef,
  CoatDef,
  FacilityDef,
  FacilityId,
  Rarity,
  TraitDef,
  TraitId,
  UpgradeDef,
} from "./types";

export const FACILITIES: Record<FacilityId, FacilityDef> = {
  mangkuk: {
    id: "mangkuk",
    name: "Mangkuk makan",
    baseCost: 15,
    baseRate: 0.1,
    attracts: "biasa",
    description: "Kucing yang kenyang rajin menangkap ikan.",
  },
  benang: {
    id: "benang",
    name: "Bola benang",
    baseCost: 100,
    baseRate: 1,
    attracts: "biasa",
    description: "Main sambil menggulung ikan pulang.",
  },
  kardus: {
    id: "kardus",
    name: "Kotak kardus",
    baseCost: 1_100,
    baseRate: 8,
    attracts: "langka",
    description: "Tak ada kucing yang bisa menolak kardus.",
  },
  tiang: {
    id: "tiang",
    name: "Tiang garukan",
    baseCost: 12_000,
    baseRate: 47,
    attracts: "langka",
    description: "Tempat mengasah kuku dan memantau ikan dari atas.",
  },
  akuarium: {
    id: "akuarium",
    name: "Akuarium",
    baseCost: 130_000,
    baseRate: 260,
    attracts: "epik",
    description: "Ikannya untuk ditonton... katanya.",
  },
  rak: {
    id: "rak",
    name: "Rak jendela",
    baseCost: 1_400_000,
    baseRate: 1_400,
    attracts: "legenda",
    description: "Pemandangan terbaik untuk kucing legendaris.",
  },
};

export const RARITY_LABEL: Record<Rarity, string> = {
  biasa: "Biasa",
  langka: "Langka",
  epik: "Epik",
  legenda: "Legenda",
};

/** Bonus produksi fasilitas dari satu kucing yang ditugaskan, per kelangkaan. */
export const RARITY_BONUS: Record<Rarity, number> = {
  biasa: 0.05,
  langka: 0.1,
  epik: 0.25,
  legenda: 0.5,
};

/** Bobot peluang kelangkaan kucing liar yang mampir (hanya kelangkaan yang sudah terbuka). */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  biasa: 70,
  langka: 22,
  epik: 7,
  legenda: 1,
};

export const TRAITS: Record<TraitId, TraitDef> = {
  pemalas: {
    id: "pemalas",
    name: "Pemalas",
    description: "+50% saat game ditutup, −10% saat game terbuka.",
  },
  aktif: {
    id: "aktif",
    name: "Aktif",
    description: "+15% selama strip sedang tampil.",
  },
  rakus: {
    id: "rakus",
    name: "Rakus",
    description: "+20%, tetapi cepat lapar.",
  },
  penjelajah: {
    id: "penjelajah",
    name: "Penjelajah",
    description: "Kucing liar mampir dua kali lebih sering.",
  },
  manja: {
    id: "manja",
    name: "Manja",
    description: "+30% bila dielus dalam 24 jam terakhir.",
  },
};

export const TRAIT_IDS: readonly TraitId[] = ["pemalas", "aktif", "rakus", "penjelajah", "manja"];

const OUTLINE = "#2a1d1a";

export const COATS: CoatDef[] = [
  // Biasa
  {
    id: "oyen",
    name: "Kampung Oren",
    rarity: "biasa",
    pattern: "tabby",
    palette: { base: "#e8913a", dark: "#b8611c", light: "#f8ddb8", patch: "#e8913a", outline: OUTLINE, eye: "#5b8a2e" },
    blurb: "Si oren legendaris, selalu lapar dan selalu percaya diri.",
  },
  {
    id: "hitam",
    name: "Kampung Hitam",
    rarity: "biasa",
    pattern: "solid",
    palette: { base: "#2f2a33", dark: "#1c181f", light: "#4a4452", patch: "#2f2a33", outline: "#120e12", eye: "#e8c547" },
    blurb: "Hitam legam, matanya seperti dua bulan purnama.",
  },
  {
    id: "putih",
    name: "Kampung Putih",
    rarity: "biasa",
    pattern: "solid",
    palette: { base: "#f4f0e8", dark: "#d9d2c5", light: "#ffffff", patch: "#f4f0e8", outline: "#5a4a44", eye: "#6aa0c8" },
    blurb: "Bersih sekali, sampai dia berguling di tanah.",
  },
  {
    id: "abu",
    name: "Kampung Abu",
    rarity: "biasa",
    pattern: "solid",
    palette: { base: "#8e939b", dark: "#6a6e75", light: "#d3d6da", patch: "#8e939b", outline: OUTLINE, eye: "#c9a227" },
    blurb: "Tenang dan pendiam, ahli tidur siang.",
  },
  {
    id: "belang",
    name: "Belang Cokelat",
    rarity: "biasa",
    pattern: "tabby",
    palette: { base: "#9c7a57", dark: "#5e452f", light: "#e3d3be", patch: "#9c7a57", outline: OUTLINE, eye: "#7a9a3a" },
    blurb: "Loreng klasik, penjelajah gang sejati.",
  },
  {
    id: "abubelang",
    name: "Abu Belang",
    rarity: "biasa",
    pattern: "tabby",
    palette: { base: "#a3a8ae", dark: "#5c6067", light: "#e6e8ea", patch: "#a3a8ae", outline: OUTLINE, eye: "#9bb33c" },
    blurb: "Garis-garisnya rapi seperti baju tahanan kartun.",
  },
  // Langka
  {
    id: "telon",
    name: "Telon",
    rarity: "langka",
    pattern: "calico",
    palette: { base: "#f6f2ea", dark: "#2e2a2e", light: "#ffffff", patch: "#e28a3b", outline: OUTLINE, eye: "#c9a227" },
    blurb: "Tiga warna, dipercaya membawa rezeki.",
  },
  {
    id: "tuksedo",
    name: "Tuksedo",
    rarity: "langka",
    pattern: "tuxedo",
    palette: { base: "#2b272e", dark: "#1a171c", light: "#f7f4ee", patch: "#2b272e", outline: "#120e12", eye: "#a6c94a" },
    blurb: "Selalu berpakaian rapi untuk acara apa pun.",
  },
  {
    id: "siam",
    name: "Siam",
    rarity: "langka",
    pattern: "point",
    palette: { base: "#efe2cc", dark: "#5a4334", light: "#f8f0e2", patch: "#efe2cc", outline: OUTLINE, eye: "#4a90d9" },
    blurb: "Cerewet, mata biru, dan sangat yakin dirinya bangsawan.",
  },
  {
    id: "krem",
    name: "Krem Belang",
    rarity: "langka",
    pattern: "tabby",
    palette: { base: "#ecc995", dark: "#c99a62", light: "#fbf0df", patch: "#ecc995", outline: OUTLINE, eye: "#c07a2a" },
    blurb: "Warna susu kopi, semanis namanya.",
  },
  {
    id: "asap",
    name: "Biru Asap",
    rarity: "langka",
    pattern: "solid",
    palette: { base: "#6f7f92", dark: "#56647a", light: "#9aa8b8", patch: "#6f7f92", outline: "#1f2430", eye: "#59b36b" },
    blurb: "Bulunya keperakan, langkahnya tanpa suara.",
  },
  // Epik
  {
    id: "persia",
    name: "Persia Salju",
    rarity: "epik",
    pattern: "solid",
    palette: { base: "#fbf8f2", dark: "#e7dfd1", light: "#ffffff", patch: "#fbf8f2", outline: "#6b5a52", eye: "#d9822b" },
    blurb: "Mewah, berbulu tebal, menolak terburu-buru.",
  },
  {
    id: "bengal",
    name: "Bengal",
    rarity: "epik",
    pattern: "spotted",
    palette: { base: "#d9a35b", dark: "#6b4423", light: "#f3dfb8", patch: "#d9a35b", outline: OUTLINE, eye: "#7cab3a" },
    blurb: "Totol macan, energi tak terbatas.",
  },
  {
    id: "ragdoll",
    name: "Ragdoll",
    rarity: "epik",
    pattern: "point",
    palette: { base: "#f3ede4", dark: "#8c7b6e", light: "#fbf7f1", patch: "#f3ede4", outline: "#4a3d36", eye: "#3f7fd1" },
    blurb: "Lemas seperti boneka kain saat digendong.",
  },
  {
    id: "telonbiru",
    name: "Telon Pastel",
    rarity: "epik",
    pattern: "calico",
    palette: { base: "#f7f3ee", dark: "#8a93a0", light: "#ffffff", patch: "#e8c49a", outline: "#3a3036", eye: "#c9a227" },
    blurb: "Telon versi lembut, seperti lukisan cat air.",
  },
  // Legenda
  {
    id: "emas",
    name: "Kucing Emas",
    rarity: "legenda",
    pattern: "tabby",
    palette: { base: "#f2c14e", dark: "#c98e1a", light: "#fff2c4", patch: "#f2c14e", outline: "#3b2a10", eye: "#2f8f6a" },
    blurb: "Konon setiap kedipan matanya menghasilkan sekeping koin.",
  },
  {
    id: "malam",
    name: "Kucing Malam",
    rarity: "legenda",
    pattern: "starry",
    palette: { base: "#22305a", dark: "#f5e9a8", light: "#3a4a7e", patch: "#22305a", outline: "#0d1226", eye: "#ffd84d" },
    blurb: "Bulunya menyimpan langit malam lengkap dengan bintangnya.",
  },
  {
    id: "sakura",
    name: "Kucing Sakura",
    rarity: "legenda",
    pattern: "starry",
    palette: { base: "#f2b6c6", dark: "#ffffff", light: "#f9d7e0", patch: "#f2b6c6", outline: "#5a2a3a", eye: "#8a4fb8" },
    blurb: "Muncul hanya saat musim bunga, harum seperti teh.",
  },
];

export const COAT_BY_ID: Record<string, CoatDef> = Object.fromEntries(COATS.map((c) => [c.id, c]));

/** Upgrade fasilitas: tiga tingkat per fasilitas, masing-masing menggandakan produksinya. */
const FACILITY_UPGRADE_NAMES: Record<FacilityId, [string, string, string]> = {
  mangkuk: ["Mangkuk keramik", "Tempat makan otomatis", "Prasmanan ikan"],
  benang: ["Benang wol halus", "Gulungan pelangi", "Bola benang raksasa"],
  kardus: ["Kardus dobel", "Benteng kardus", "Istana kardus"],
  tiang: ["Tali sisal baru", "Tiang tiga tingkat", "Menara kucing"],
  akuarium: ["Pompa gelembung", "Ikan koi", "Akuarium laut"],
  rak: ["Bantal jendela", "Pemandangan burung", "Jendela kaca patri"],
};

const TIERS: { owned: number; costMultiplier: number }[] = [
  { owned: 1, costMultiplier: 10 },
  { owned: 10, costMultiplier: 100 },
  { owned: 25, costMultiplier: 1_000 },
];

function buildUpgrades(): UpgradeDef[] {
  const list: UpgradeDef[] = [];
  for (const def of Object.values(FACILITIES)) {
    TIERS.forEach((tier, i) => {
      list.push({
        id: `${def.id}-${i + 1}`,
        name: FACILITY_UPGRADE_NAMES[def.id][i],
        description: `Produksi ${def.name.toLowerCase()} ×2.`,
        cost: def.baseCost * tier.costMultiplier,
        effect: { kind: "facility", facility: def.id, multiplier: 2 },
        requires: { facility: def.id, owned: tier.owned },
      });
    });
  }
  list.push(
    {
      id: "kasur-1",
      name: "Kasur empuk",
      description: "Progres offline tersimpan sampai 12 jam.",
      cost: 5_000,
      effect: { kind: "offlineCap", hours: 12 },
      requires: { facility: "kardus", owned: 1 },
    },
    {
      id: "kasur-2",
      name: "Rumah hangat",
      description: "Progres offline tersimpan sampai 24 jam.",
      cost: 750_000,
      effect: { kind: "offlineCap", hours: 24 },
      requires: { upgrade: "kasur-1" },
    },
  );
  return list.sort((a, b) => a.cost - b.cost);
}

export const UPGRADES: UpgradeDef[] = buildUpgrades();
export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const ACCESSORIES: AccessoryDef[] = [
  { id: "pita", name: "Pita merah", slot: "head", price: 250, description: "Manis dan selalu cocok." },
  { id: "topi-pesta", name: "Topi pesta", slot: "head", price: 600, description: "Setiap hari adalah ulang tahun." },
  { id: "kalung-lonceng", name: "Kalung lonceng", slot: "neck", price: 1_200, description: "Kling-kling ke mana pun ia pergi." },
  { id: "peci", name: "Peci", slot: "head", price: 3_000, description: "Rapi untuk acara keluarga." },
  { id: "bandana", name: "Bandana merah", slot: "neck", price: 4_500, description: "Gaya koboi gang sebelah." },
  { id: "topi-koki", name: "Topi koki", slot: "head", price: 9_000, description: "Ahli memasak... memakan." },
  { id: "dasi-kupu", name: "Dasi kupu-kupu", slot: "neck", price: 20_000, description: "Siap untuk makan malam mewah." },
  { id: "kacamata", name: "Kacamata hitam", slot: "face", price: 45_000, description: "Terlalu keren untuk peduli." },
  { id: "blangkon", name: "Blangkon", slot: "head", price: 120_000, description: "Penutup kepala khas Jawa yang berwibawa." },
  { id: "topi-penyihir", name: "Topi penyihir", slot: "head", price: 400_000, description: "Ikan muncul dari mana-mana." },
  { id: "bunga", name: "Bunga sepatu", slot: "head", price: null, description: "Hadiah dari kucing yang sayang padamu." },
  { id: "kacamata-bulat", name: "Kacamata bulat", slot: "face", price: null, description: "Hadiah: tampang kutu buku." },
  { id: "syal", name: "Syal rajut", slot: "neck", price: null, description: "Hadiah: hangat dan penuh cinta." },
  { id: "mahkota", name: "Mahkota", slot: "head", price: null, description: "Hadiah langka untuk raja atau ratu strip." },
];

export const ACCESSORY_BY_ID: Record<string, AccessoryDef> = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]));

/** Benda kecil yang kadang dibawa kucing sebagai hadiah. */
export const TRINKETS: readonly string[] = ["Daun kering", "Kaus kaki", "Tutup botol", "Bulu burung", "Karet gelang", "Kancing baju"];

export const CAT_NAMES: readonly string[] = [
  "Mochi", "Kopi", "Gembul", "Kumis", "Bulan", "Nala", "Cimol", "Dodol", "Tahu", "Tempe",
  "Bakwan", "Cilok", "Gula", "Susu", "Kacang", "Koko", "Mimi", "Momo", "Pipi", "Bolu",
  "Cireng", "Donat", "Klepon", "Lontong", "Onde", "Pempek", "Seblak", "Wafer", "Bubu", "Ciko",
  "Leo", "Luna", "Nugget", "Puding", "Siomay", "Timun", "Ubi", "Wortel", "Jahe", "Kenari",
  "Sate", "Kerupuk", "Bakpao", "Pisang", "Combro", "Getuk", "Serabi", "Kue Lumpur", "Teh Tarik", "Kolak",
];

/** Konstanta keseimbangan permainan. */
export const BALANCE = {
  costGrowth: 1.15,
  /** Produksi dasar selalu ada, agar pemain tidak pernah macet. */
  baseIncome: 0.2,
  startingFish: 15,
  slotsPerFacility: 3,
  hungryThreshold: 0.25,
  /** Waktu dari kenyang sampai lapar total, jam. */
  hungerHours: 6,
  /** Rasio produksi saat offline. */
  offlineRate: 0.5,
  offlineCapHours: 8,
  /** Bonus produksi permanen per Bintang. */
  starBonus: 0.02,
  /** Pembagi untuk rumus Bintang: floor(sqrt(totalRun / divisor)). */
  prestigeDivisor: 1_000_000,
  spiritBonus: 0.1,
  spiritMinutes: 10,
  visitMinMinutes: 4,
  visitMaxMinutes: 9,
  visitStayMinutes: 3,
  feedsToAdopt: 3,
  sparkleMinMinutes: 3,
  sparkleMaxMinutes: 6,
  sparkleStaySeconds: 25,
  sparkleRewardSeconds: 60,
  baitBaseCost: 100,
  baitGrowth: 1.8,
  /** Ongkos memberi makan semua kucing = produksi selama sekian detik. */
  feedCostSeconds: 60,
  feedMinCost: 10,

  // --- Ikatan (v2) ---
  bondPerHeart: 20,
  maxBond: 100,
  /** Bonus produksi fasilitas per hati ikatan kucing yang bekerja di sana. */
  heartBonus: 0.02,
  bondPerPet: 1,
  petBondCooldownMs: 3_000,
  bondPerPurr: 5,
  /** Ikatan dari dengkuran dibatasi jeda per kucing. */
  purrCooldownMs: 12_000,
  bondPerTreat: 8,
  bondPerToyCatch: 4,
  toyCatchCooldownMs: 8_000,
  /** Hadiah ikan dari menangkap mainan = produksi selama sekian detik. */
  toyRewardSeconds: 8,

  // --- Camilan (v2) ---
  treatCostSeconds: 30,
  treatMinCost: 5,
  startingTreats: 3,

  // --- Hadiah dari kucing (v2) ---
  giftMinHearts: 3,
  /** Peluang per menit online untuk setiap kucing yang memenuhi syarat. */
  giftChancePerMinute: 1 / 25,
  maxGiftsOnStrip: 3,
  giftFishSeconds: 120,

  // --- Asisten (v3) ---
  /** Hadiah sesi fokus 25 menit = produksi selama sekian detik (berskala dengan lama sesi). */
  focusRewardSeconds: 120,
  bondPerFocus: 3,
  todoRewardSeconds: 30,
  todoRewardsPerDay: 20,
  wellnessRewardSeconds: 20,
  /** Hadiah harian ikan = produksi selama sekian detik × hari berturut-turut (maks 10). */
  dailyFishSeconds: 60,

  // --- Obrolan dan mengetik (v6) ---
  /** Ikatan dari mengobrol, paling sering sekali per jeda untuk setiap kucing. */
  bondPerChat: 2,
  chatBondCooldownMs: 10 * 60_000,
  /** Ikan per ketukan = produksi selama sekian detik (minimal tapMinFish). */
  tapFishSeconds: 0.05,
  tapMinFish: 0.2,
  /** Ketukan per detik yang dihitung paling banyak (sisanya diabaikan). */
  tapMaxPerSecond: 15,
} as const;
