// Tipe data inti Meow Corner. Semua logika game bekerja di atas GameState
// yang bisa disimpan sebagai JSON.

export type Rarity = "biasa" | "langka" | "epik" | "legenda";
export type TraitId = "pemalas" | "aktif" | "rakus" | "penjelajah" | "manja";
export type FacilityId = "mangkuk" | "benang" | "kardus" | "tiang" | "akuarium" | "rak";

export const FACILITY_IDS: readonly FacilityId[] = [
  "mangkuk",
  "benang",
  "kardus",
  "tiang",
  "akuarium",
  "rak",
];

export const RARITIES: readonly Rarity[] = ["biasa", "langka", "epik", "legenda"];

export interface FacilityDef {
  id: FacilityId;
  name: string;
  /** Harga pembelian pertama, dalam ikan. */
  baseCost: number;
  /** Produksi dasar per unit, ikan per detik. */
  baseRate: number;
  /** Kelangkaan kucing liar yang mulai tertarik datang setelah fasilitas ini dimiliki. */
  attracts: Rarity;
  description: string;
}

/** Pola bulu yang diterapkan pada sprite dasar. */
export type PatternId =
  | "solid"
  | "tabby"
  | "tuxedo"
  | "calico"
  | "point"
  | "spotted"
  | "starry";

export interface CoatPalette {
  /** Warna bulu utama. */
  base: string;
  /** Warna gelap: belang, totol, atau ujung tubuh (point). */
  dark: string;
  /** Warna terang: moncong, dada, kaki putih. */
  light: string;
  /** Warna tambalan ketiga (khusus telon). */
  patch: string;
  outline: string;
  eye: string;
}

export interface CoatDef {
  id: string;
  name: string;
  rarity: Rarity;
  pattern: PatternId;
  palette: CoatPalette;
  blurb: string;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
}

export type UpgradeEffect =
  | { kind: "facility"; facility: FacilityId; multiplier: number }
  | { kind: "offlineCap"; hours: number };

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  effect: UpgradeEffect;
  /** Syarat muncul di toko. */
  requires: { facility?: FacilityId; owned?: number; upgrade?: string };
}

export interface CatState {
  id: string;
  name: string;
  coat: string;
  trait: TraitId;
  /** Fasilitas tempat kucing ditugaskan, atau null bila sedang bersantai. */
  facility: FacilityId | null;
  /** 1 = kenyang, 0 = sangat lapar. */
  hunger: number;
  /** Waktu terakhir dielus (ms epoch), 0 bila belum pernah. */
  lastPetAt: number;
  adoptedAt: number;
  /** Ikatan dengan pemain, 0..100. Setiap 20 poin = satu hati. */
  bond: number;
  /** Aksesori yang dipakai, atau null. */
  accessory: string | null;
}

export type AccessorySlot = "head" | "face" | "neck";

export interface AccessoryDef {
  id: string;
  name: string;
  slot: AccessorySlot;
  /** Harga di toko; null = hanya bisa didapat sebagai hadiah dari kucing. */
  price: number | null;
  description: string;
}

export type GiftItem =
  | { kind: "fish"; seconds: number }
  | { kind: "treats"; amount: number }
  | { kind: "accessory"; id: string }
  | { kind: "trinket"; name: string };

/** Hadiah yang dibawa kucing dan diletakkan di strip, menunggu diambil. */
export interface GiftState {
  id: string;
  catId: string;
  item: GiftItem;
  /** Posisi horizontal relatif 0..1 sepanjang strip. */
  x: number;
  createdAt: number;
}

export interface Inventory {
  treats: number;
  /** Aksesori yang dimiliki (bisa dipakai satu kucing pada satu waktu). */
  accessories: string[];
}

export interface VisitorState {
  coat: string;
  trait: TraitId;
  name: string;
  /** Berapa kali sudah diberi makan (adopsi setelah 3). */
  fed: number;
  arrivedAt: number;
  leavesAt: number;
}

export interface SparkleState {
  /** Posisi horizontal relatif 0..1 sepanjang strip. */
  x: number;
  appearedAt: number;
  expiresAt: number;
}

export interface Settings {
  scale: 2 | 3;
  sound: boolean;
  focusMode: boolean;
}

export interface Stats {
  petted: number;
  prestiges: number;
  sparklesCaught: number;
  catsAdopted: number;
  startedAt: number;
  treatsGiven: number;
  toyCatches: number;
  giftsReceived: number;
  purrs: number;
}

export interface GameState {
  version: number;
  fish: number;
  /** Ikan yang didapat sejak Pindah Rumah terakhir (dasar perhitungan Bintang). */
  totalFishRun: number;
  totalFishAll: number;
  stars: number;
  facilities: Record<FacilityId, number>;
  upgrades: string[];
  cats: CatState[];
  /** Id bulu yang pernah dilihat, untuk Kucingpedia. */
  discovered: string[];
  /** Waktu simulasi terakhir (ms epoch). */
  lastTick: number;
  /** Bonus semangat dari mengelus kucing aktif sampai waktu ini. */
  spiritUntil: number;
  nextVisitAt: number;
  visitor: VisitorState | null;
  nextSparkleAt: number;
  sparkle: SparkleState | null;
  catCounter: number;
  inventory: Inventory;
  gifts: GiftState[];
  giftCounter: number;
  settings: Settings;
  stats: Stats;
}

/** Konteks yang memengaruhi perhitungan produksi. */
export interface ProductionContext {
  /** true saat game berjalan dan strip tampil; false untuk perhitungan offline. */
  online: boolean;
  now: number;
  /** false saat strip disembunyikan (misalnya ada game layar penuh). Bawaan: true. */
  visible?: boolean;
}
