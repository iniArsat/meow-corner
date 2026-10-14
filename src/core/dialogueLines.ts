// Isi obrolan kucing. Setiap kumpulan kalimat bisa punya varian per sifat
// kucing (pemalas, aktif, rakus, penjelajah, manja), untuk kucing yang belum
// akrab (shy, 0–1 hati), dan untuk kucing yang sangat akrab (close, 4–5 hati).
// Satu varian bisa berupa satu kalimat atau beberapa kalimat berurutan.
//
// Penanda yang diganti saat ditampilkan:
//   {you}/{You}  nama panggilan pemain (atau "kamu")
//   {nama} nama kucing · {teman} kucing lain · {bulu} jenis bulu
//   {jam} jam sekarang · {fase} fase hari · {tempat} kota · {suhu} suhu
//   {tugas} tugas teratas · {nTugas} jumlah tugas
//   {pengingat} isi pengingat · {jamPengingat} jamnya · {hariPengingat} harinya
//   {ketuk} ketukan hari ini · {fokusSisa} sisa fokus · {fokusMenit} lama fokus
//   {aksesori} aksesori yang dipakai · {fasilitas} fasilitas tempat bertugas

import type { TraitId } from "./types";

export type Line = string | readonly string[];

export type Pool = Partial<Record<TraitId | "any" | "shy" | "close", readonly Line[]>>;

// ---------------------------------------------------------------------------
// Pembuka

export const OPEN: Pool = {
  any: [
    "Meong? Ada apa, {you}?",
    "Hm? Kamu manggil aku?",
    "Mrrp! Hai, {you}.",
    "Iya, iya, aku dengar. Ada apa?",
    "Oh, hai. Mau ngobrol?",
    "Meong. (artinya: halo)",
  ],
  shy: [
    "...(dia menatapmu dari jauh)",
    "Mau apa? Kita belum terlalu kenal.",
    "...meong?",
    "(telinganya bergerak ke arahmu, tapi badannya tetap di tempat)",
  ],
  close: [
    "{You}! Akhirnya ngajak ngobrol juga. Aku kangen.",
    "Mrrrp~ Dari tadi aku nunggu kamu nyapa.",
    "Hai, manusia kesayanganku.",
    "Eh, {you}! Sini, sini. Aku punya banyak cerita.",
  ],
  pemalas: ["Hnn... aku baru mau tidur. Ada apa?", "Ngobrol boleh, asal sambil rebahan.", "Hoaam. Iya? Aku dengar kok. Setengah."],
  aktif: ["Hai hai hai! Mau main? Mau ngobrol? Dua-duanya?", "Aku siap! Ada apa, {you}?", "Yes! Akhirnya ada kegiatan!"],
  rakus: ["Kamu bawa makanan? ...Oh, cuma mau ngobrol. Oke deh.", "Hai! Ngomong-ngomong, aku lapar. Eh, ada apa?"],
  penjelajah: ["Aku baru selesai patroli ujung strip. Ada kabar apa?", "Hai! Tadi aku nemu sudut baru di dekat panel bawah."],
  manja: ["Akhirnya kamu nyapa aku! Elus dulu dong.", "Mrrrp~ {you}, sini, sini.", "Kamu ke mana aja? Aku nungguin."],
};

export const OPEN_SLEEPY: Pool = {
  any: ["Hoaam... siapa yang bangunin aku?", "Zzz... hm? Oh, kamu. Ada apa?", "(mengucek mata dengan kaki) ...meong?"],
  pemalas: ["Aku lagi mimpi indah, lho. Ini harus penting.", "Lima menit lagi... oke, oke. Ada apa?"],
  manja: ["Mrrp... kamu bangunin aku buat ngelus, kan?"],
};

export const OPEN_HUNGRY: Pool = {
  any: ["{You}... perutku bunyi. Kamu dengar nggak?", "Sebelum ngobrol... ada makanan?"],
  rakus: ["LAPAR. Maaf. Halo. Tapi LAPAR.", "Akhirnya! Kamu datang bawa makan, kan? Kan?"],
};

export const OPEN_LATE: Pool = {
  any: ["Kok kamu masih bangun? Sudah jam {jam}, lho.", "Jam {jam}... manusia biasanya sudah tidur jam segini."],
  pemalas: ["Jam segini kamu masih melek? Aku saja sudah tidur tiga kali."],
};

export const OPEN_SULK: Pool = {
  any: ["Hmph.", "...(dia membelakangimu)", "Aku lagi nggak mau ngomong sama kamu.", "(ekornya mengibas-ngibas kesal)"],
};

// ---------------------------------------------------------------------------
// Kenalan

export const ASK_NAME: readonly Line[] = [
  ["Eh, tunggu.", "Kita sudah bareng-bareng, tapi aku belum tahu namamu. Kamu mau dipanggil apa?"],
  ["Ngomong-ngomong...", "Aku belum tahu namamu! Masa aku panggil kamu \"manusia\" terus?"],
];

export const NAME_OK: readonly Line[] = [
  "{You}... {You}. Nama yang bagus! Aku ingat, ya.",
  "Oke, {you}! Mulai sekarang aku panggil begitu.",
  "{You}. Kedengarannya kayak nama orang yang suka ngasih camilan.",
];

export const NAME_SKIP: readonly Line[] = [
  "Rahasia? Misterius. Aku suka. Kupanggil \"kamu\" saja, ya.",
  "Hmm, oke. Nanti kalau berubah pikiran, bilang aku.",
];

// ---------------------------------------------------------------------------
// Kabar

export const KABAR_WORK: Record<string, readonly Line[]> = {
  mangkuk: ["Lagi jaga mangkuk. Siapa tahu ada yang jatuh.", "Bertugas di mangkuk. Tugas paling mulia di rumah ini."],
  benang: ["Lagi berantem sama benang. Aku menang, tentu.", "Main benang. Eh, kerja. Kerja main benang."],
  kardus: ["Lagi di kardus. Kardus ini rumahku, strip ini cuma kantor.", "Jaga kardus. Kalau aku nggak di sini, nanti kardusnya kesepian."],
  tiang: ["Lagi asah kuku di tiang. Biar tajam kalau ada cicak.", "Bertengger di tiang. Dari atas sini semuanya kelihatan kecil."],
  akuarium: ["Lagi ngawasin ikan-ikan. Cuma ngawasin. Sumpah.", "Jaga akuarium. Ikannya aman. ...Untuk sekarang."],
  rak: ["Lagi lihat jendela. Burung di luar sok banget.", "Berjemur di rak. Ini pekerjaan, lho, bukan santai."],
};

export const KABAR_FREE: Pool = {
  any: [
    "Nggak ngapa-ngapain. Itu keahlianku.",
    "Lagi mikir. Tentang ikan, kebanyakan.",
    "Lagi nungguin kamu ngajak ngobrol, sebenarnya.",
    "Barusan ngejar debu. Debunya menang.",
  ],
  pemalas: ["Rebahan. Terus rebahan lagi.", "Tadi tidur, terus capek, jadi tidur lagi."],
  aktif: ["Barusan lari dari ujung ke ujung. Dua kali!", "Lagi cari sesuatu buat dikejar. Kamu mau dikejar?"],
  rakus: ["Lagi mikirin makan siang. Dan makan malam. Dan camilan di antaranya."],
  penjelajah: ["Lagi patroli. Ujung kiri aman, ujung kanan ada panel aneh.", "Lagi bikin peta strip ini. Sudah setengah jadi."],
  manja: ["Lagi nunggu dielus. Sudah lama banget.", "Lagi kangen kamu. Kegiatan penuh waktu."],
};

export const KABAR_HUNGRY: readonly Line[] = ["Tapi jujur... aku agak lapar.", "Oh iya, dan perutku keroncongan."];

export const ELUS: Pool = {
  any: ["Mrrrrp~ Iya, situ... di belakang telinga.", "Prrrr... jangan berhenti dulu.", "Hmm. Boleh juga. Lanjut."],
  shy: ["...boleh. Sebentar saja.", "(dia diam saja, tapi matanya menyipit senang)"],
  close: ["Prrrrrr... tanganmu paling enak sedunia.", "Ini yang aku tunggu-tunggu dari tadi. Prrr..."],
  pemalas: ["Elus sambil aku merem, ya. Prrr...", "Enak... aku jadi ngantuk. Lebih ngantuk."],
  manja: ["Lagi! Lagi! Prrrrr~", "Akhirnya! Dagu juga, ya. Dagu."],
};

// ---------------------------------------------------------------------------
// Makan

export const LAPAR_YES: Pool = {
  any: ["Lapar banget. Perutku sudah konser dari tadi.", "Lapar... rasanya bisa makan ikan sebesar kamu.", "Iya. Mangkukku sudah kosong, aku cek tiga kali."],
  rakus: ["LAPAR. Selalu. Tapi sekarang beneran lapar.", "Kalau lapar itu lomba, aku juara satu."],
  pemalas: ["Lapar... tapi malas jalan ke mangkuk. Bawain, dong?"],
  manja: ["Lapar... suapin, ya?"],
};

export const LAPAR_NO: Pool = {
  any: ["Masih kenyang kok. Tapi camilan selalu ada tempatnya.", "Kenyang. Terima kasih sudah tanya."],
  rakus: ["Kenyang? Kata itu tidak ada di kamusku.", "Baru makan, tapi aku bisa makan lagi. Itu bakat."],
  pemalas: ["Kenyang. Habis makan enaknya tidur."],
  aktif: ["Kenyang dan siap lari! Mau lihat?"],
};

export const TREAT_GIVE: Pool = {
  any: ["Nyam! Ini yang terbaik.", "Camilan dari kamu rasanya lebih enak.", "Nyam nyam nyam... (dia tidak mendengarkan apa pun sekarang)"],
  rakus: ["NYAM. Ada lagi? Nggak? Oke. NYAM."],
  manja: ["Kamu memang yang paling baik. Nyam~"],
};

export const TREAT_NONE: readonly Line[] = ["Camilannya habis... beli lagi di Toko, ya?", "Toples camilannya kosong. Aku sudah cek. Dua kali."];

export const FEED_ALL: readonly Line[] = ["Makan bareng! Ayo semuanya ke mangkuk!", "Waktunya makan! Aku duluan!"];
export const FEED_POOR: readonly Line[] = ["Ikannya belum cukup buat beli makanan... nggak apa-apa, aku tunggu."];
export const LAPAR_WAIT: Pool = {
  any: ["Hmph. Sebentar itu berapa menit?", "Oke... aku tunggu. Sambil menatapmu."],
  rakus: ["SEBENTAR?! ...Baiklah. Tapi aku hitung."],
};

// ---------------------------------------------------------------------------
// Cuaca

export const CUACA_NONE: readonly Line[] = [
  ["Aku nggak bisa lihat cuaca di luar dari sini.", "Kasih tahu kotamu di menu Cuaca, nanti aku laporin tiap hari."],
];
export const CUACA_OFF: readonly Line[] = ["Efek cuaca lagi dimatikan, jadi aku cuma lihat langit buatan."];

export const CUACA_KIND: Record<string, Pool> = {
  clearDay: {
    any: ["Cerah! Cocok buat berjemur di rak jendela.", "Matahari lagi semangat. Aku juga. Sedikit."],
    pemalas: ["Cerah. Cuaca resmi buat tidur di bawah sinar matahari."],
    penjelajah: ["Cerah! Hari yang bagus buat menjelajah."],
  },
  clearNight: {
    any: ["Langitnya cerah. Bulannya bagus, sayang aku nggak bisa nangkep.", "Malam yang cerah. Bintangnya kayak remah ikan berkilau."],
  },
  partly: {
    any: ["Cerah berawan. Ada awan bentuk ikan, aku yakin.", "Setengah cerah, setengah awan. Kayak moodku."],
  },
  cloudy: {
    any: ["Mendung. Enaknya tidur siang.", "Langitnya kelabu. Mungkin sebentar lagi hujan."],
    aktif: ["Mendung... tapi aku tetap mau lari-lari!"],
  },
  fog: {
    any: ["Berkabut. Aku nggak bisa lihat burung di luar, jadi burungnya juga nggak bisa lihat aku."],
  },
  drizzle: {
    any: ["Gerimis. Belum hujan beneran, tapi aku sudah siap payung.", "Rintik-rintik. Bunyinya enak buat tidur."],
  },
  rain: {
    any: ["Hujan. Aku nggak suka basah. Sama sekali.", "Hujan... semua kucing berteduh dulu."],
    pemalas: ["Hujan. Cuaca resmi buat tidur."],
    aktif: ["Hujan... jadi nggak bisa lari-lari di luar. Huh."],
    manja: ["Hujan-hujan begini enaknya dipeluk."],
  },
  storm: {
    any: ["Ada petir! Kalau aku tiba-tiba hilang, cari di kardus.", "Badai! Aku... aku nggak takut. Cuma waspada."],
  },
  snow: {
    any: ["Salju?! Di sini?! ...Dingin. Peluk aku."],
  },
};

export const CUACA_HOT: readonly Line[] = ["Panas banget, {suhu}. Aku mau rebahan di lantai yang dingin.", "{suhu}! Buluku kepanasan."];
export const CUACA_COLD: readonly Line[] = ["Dingin, {suhu}. Mending kita berpelukan.", "Brr, {suhu}. Selimut mana selimut?"];
export const CUACA_TEMP: readonly Line[] = ["Suhunya {suhu} di {tempat}.", "Di {tempat} sekarang {suhu}."];

// ---------------------------------------------------------------------------
// Curhat dan semangat

export const CAPEK: Pool = {
  any: [
    "Sini, duduk sebentar. Kucing juga butuh rebahan, apalagi manusia.",
    "Capek itu tanda kamu sudah berusaha. Istirahat sebentar, ya?",
    "Kamu sudah kerja keras hari ini. Aku lihat, kok.",
  ],
  pemalas: ["Akhirnya ada yang ngerti. Ayo rebahan bareng.", "Capek? Solusinya cuma satu: tidur siang."],
  aktif: ["Capek? Coba peregangan sebentar. Aku juga, lihat!"],
  manja: ["Mau aku temenin? Aku hangat, lho."],
  close: ["Hei. Kamu nggak sendirian. Ada aku di bawah sini."],
};

export const TEMANI: Pool = {
  any: ["Oke. Tarik napas... buang... Aku dengkur biar kamu tenang.", "Aku di sini. Prrr... prrr..."],
  manja: ["Sini, aku temenin. Prrrrr~"],
};

export const CURHAT: readonly Line[] = [
  "Cerita aja. Aku nggak akan bilang siapa-siapa. Aku kan kucing.",
  "Aku dengerin. Kucing pendengar yang baik, asal nggak ada cicak lewat.",
  "Aku memang nggak bisa kasih saran, tapi telingaku dua-duanya buat kamu.",
];

export const MAKASIH: Pool = {
  any: ["Sama-sama. Nanti elus aku, itu bayarannya.", "Kapan aja. Aku selalu ada di bawah layar."],
  close: ["Buat kamu, apa sih yang nggak. Prrr..."],
  rakus: ["Sama-sama. Bayarannya camilan, ya."],
};

export const SEMANGAT: Pool = {
  any: [
    "Kamu pasti bisa! Aku saja bisa lompat ke rak setinggi itu.",
    "Satu-satu saja. Kayak makan ikan: dari kepala, pelan-pelan.",
    "Kalau gagal, coba lagi. Aku sudah gagal nangkep kupu-kupu seratus kali, tetap semangat.",
    "Kamu hebat. Aku nggak bilang ini ke sembarang manusia.",
    "Kerjain yang paling kecil dulu. Habis itu, elus aku sebagai hadiah.",
    "Pelan-pelan nggak apa-apa. Yang penting jalan. Kayak aku waktu ngintai cicak.",
  ],
  aktif: ["AYO! KAMU BISA! (lari keliling) ...maaf, kebawa suasana."],
  pemalas: ["Semangat... tapi jangan lupa istirahat. Itu juga bagian dari semangat."],
  manja: ["Aku percaya sama kamu. Sekarang kerja dulu, nanti main sama aku."],
  rakus: ["Selesaikan tugasmu, terus kita rayakan dengan camilan. Setuju?"],
  penjelajah: ["Setiap tugas itu kayak sudut baru yang belum dijelajahi. Seru, kan?"],
};

// ---------------------------------------------------------------------------
// Asisten: fokus, tugas, pengingat

export const FOKUS_OFFER: readonly Line[] = [
  ["Siap! Aku jaga biar nggak ada yang ganggu.", "Mulai fokus {fokusMenit} menit?"],
  ["Kerja bareng? Aku jago diam, lho.", "Mau fokus {fokusMenit} menit sekarang?"],
];
export const FOKUS_START: readonly Line[] = ["Oke! Aku diam. ...Sungguh, aku diam.", "Mulai! Semangat, {you}. Aku jaga di sini."];
export const FOKUS_LATER: readonly Line[] = ["Oke. Aku siaga kalau kamu butuh.", "Nanti juga boleh. Aku nggak ke mana-mana."];
export const FOKUS_RUNNING: readonly Line[] = [
  "Sisa {fokusSisa} lagi. Ayo, sedikit lagi!",
  "Fokus... aku juga lagi fokus. Fokus jaga kamu. Sisa {fokusSisa}.",
  "Psst, kita lagi fokus, kan? {fokusSisa} lagi, terus istirahat.",
];
export const FOKUS_BREAK: readonly Line[] = ["Kita lagi istirahat. Minum air dulu, gih.", "Waktunya istirahat! Lihat yang jauh-jauh sebentar."];

export const TUGAS_SOME: readonly Line[] = [
  ["Masih ada {nTugas} tugas.", "Yang paling atas: “{tugas}”. Semangat!"],
  ["Coba kulihat... ada {nTugas} yang belum.", "Mulai dari “{tugas}”, gimana?"],
];
export const TUGAS_NONE: readonly Line[] = [
  "Daftar tugasmu kosong! Berarti waktunya... main sama aku?",
  "Nggak ada tugas yang tersisa. Kamu luar biasa. Atau belum menulis apa-apa.",
];

export const JADWAL_SOME: readonly Line[] = [
  ["{HariPengingat} pukul {jamPengingat} ada “{pengingat}”.", "Tenang, nanti aku lari ke tengah layar buat ngingetin."],
  ["Yang terdekat: “{pengingat}”, {hariPengingat} pukul {jamPengingat}.", "Aku sudah catat di kepalaku. Kepala kucing, tapi tetap catat."],
];
export const JADWAL_NONE: readonly Line[] = ["Belum ada pengingat. Mau bikin? Aku jago ngingetin, lho.", "Kosong. Hari yang bebas! Atau kamu lupa bikin pengingat?"];

// ---------------------------------------------------------------------------
// Main dan tidur

export const MAIN: Pool = {
  any: ["Main! Ayo kejar aku!", "Mau! Mau main apa?"],
  aktif: ["MAU! Ayo kejar aku!", "Main? Aku SELALU mau main!"],
  pemalas: ["Main... boleh. Main tidur-tiduran?", "Main yang nggak pakai lari, ya."],
  rakus: ["Main lempar-tangkap camilan? Aku jago bagian tangkap."],
  manja: ["Mau! Tapi kamu yang pegang mainannya."],
  penjelajah: ["Ayo main petak umpet. Aku sembunyi, kamu cari!"],
  shy: ["...main? Boleh. Tapi jangan dekat-dekat dulu."],
};

export const MAIN_TOY: readonly Line[] = ["Bulu! BULU! Gerakkan kursornya!", "Bulunya! Aku siap menerkam!"];
export const MAIN_RUN: readonly Line[] = ["Kejar aku kalau bisa!", "Siap... mulai!"];

export const TIDUR: Pool = {
  any: ["Kucing tidur 12 sampai 16 jam sehari. Aku masih kurang beberapa jam.", "Sedikit... (dia menguap lebar)"],
  pemalas: ["Aku selalu ngantuk. Itu bakat.", "Ngantuk? Aku lahir ngantuk."],
  aktif: ["Ngantuk? Nggak! ...Mungkin sedikit."],
};
export const TIDUR_LATE: Pool = {
  any: ["Aku nunggu kamu tidur duluan.", "Aku jaga malam. Kamu yang harusnya tidur!", "Kucing memang suka begadang. Manusia jangan ikut-ikutan."],
  pemalas: ["Aku sudah tidur dari tadi. Ini aku ngigau."],
  manja: ["Nggak bisa tidur kalau kamu belum tidur."],
};
export const TIDUR_NIGHT: readonly Line[] = ["Kamu juga tidur, ya. Jangan begadang.", "Sudah malam. Mata manusia juga butuh istirahat."];
export const TIDUR_GO: readonly Line[] = ["Selamat tidur... zzz", "Oke... aku tidur dulu. Bangunin kalau ada ikan."];
export const TIDUR_STAY: readonly Line[] = ["Oke... tapi aku merem, ya.", "Sebentar lagi. Lima menit. Mungkin sepuluh."];

// ---------------------------------------------------------------------------
// Cerita, fakta, dan rahasia

export const STORIES: readonly (readonly string[])[] = [
  ["Kemarin aku lihat cicak di dinding.", "Kami saling tatap lima menit.", "Dia kabur. Aku menang secara teknis."],
  ["Aku pernah mimpi ikan sebesar lemari.", "Aku makan ekornya duluan.", "Terus aku bangun. Itu bagian paling sedih."],
  ["Waktu kecil aku tidur di dalam sepatu.", "Sepatunya bau. Tapi hangat.", "Sampai sekarang aku kangen sepatu itu."],
  ["Ada burung yang tiap pagi lewat jendela rak.", "Aku namai dia Pak Kicau.", "Kami belum pernah ngobrol. Dia sombong."],
  ["Pernah ada kardus baru datang.", "Isinya barang. Tapi yang penting kardusnya.", "Aku tinggal di situ tiga hari."],
  ["Aku pernah kejar titik merah di dinding.", "Sampai sekarang aku belum tahu dia ke mana.", "Kalau kamu lihat dia, kabari aku."],
  ["Tadi malam aku dengar suara aneh.", "Aku siaga satu jam penuh.", "Ternyata cuma kulkas."],
  ["Aku pernah nyenggol gelas dari meja.", "Bukan sengaja. Aku cuma penasaran.", "...Oke, sedikit sengaja."],
  ["Ada kucing tetangga yang suka lewat.", "Bulunya mengembang kayak awan.", "Aku pura-pura nggak lihat. Strategi."],
  ["Aku pernah ketiduran di atas keyboard.", "Ada yang mengetik \"jjjjjjjjjjjjjj\" di layar.", "Itu karya terbaikku."],
  ["Waktu hujan pertama aku di sini, aku kira langit bocor.", "Aku sembunyi di kardus sampai reda.", "Sekarang aku sudah berani. Agak."],
  ["Aku pernah coba tangkap ekorku sendiri.", "Tiga putaran, nggak dapat.", "Ekornya licik."],
  ["Ada lalat masuk kemarin.", "Aku lompat setinggi rak.", "Lalatnya selamat. Harga diriku tidak."],
  ["Aku punya tempat rahasia buat nyimpan barang.", "Isinya: tutup botol, karet gelang, dan satu kaus kaki.", "Jangan dibongkar, ya."],
  ["Pagi tadi sinar matahari jatuh pas di lantai.", "Aku pindah tiga kali ngikutin sinarnya.", "Matahari itu nggak bisa diam, ya."],
  ["Aku pernah ketemu tikus.", "Kami ngobrol sebentar soal keju.", "Lalu dia pergi. Kami berpisah baik-baik."],
  ["Pernah ada kupu-kupu hinggap di hidungku.", "Aku nggak bergerak sama sekali.", "Itu tiga detik paling damai dalam hidupku."],
  ["Aku pernah masuk ke laci, terus lacinya ditutup.", "Gelap. Nyaman. Ada kaus kaki.", "Sejak itu laci jadi tempat favoritku nomor dua."],
  ["Dulu aku kira cermin itu kucing lain.", "Aku desis, dia desis.", "Kami sepakat untuk tidak saling ganggu."],
  ["Aku pernah lihat kembang api dari jendela.", "Langitnya meledak warna-warni.", "Aku sembunyi di bawah selimut. Tapi sambil ngintip."],
];

export const STORY_INTRO: readonly Line[] = ["Oke, dengar ya.", "Hmm... aku punya satu.", "Ini cerita beneran. Kebanyakan."];

/** Fakta kucing sungguhan. */
export const FACTS: readonly string[] = [
  "Kucing tidur sekitar 12 sampai 16 jam sehari. Jadi kalau aku tidur terus, itu normal.",
  "Kedipan pelan dari kucing artinya dia percaya padamu. Coba balas kedip pelan ke aku.",
  "Kucing dewasa jarang mengeong ke sesama kucing. Eongan itu kebanyakan buat manusia, lho.",
  "Kucing tidak bisa merasakan rasa manis. Jadi kue itu buat kamu saja.",
  "Setiap telinga kucing punya sekitar 32 otot. Makanya telingaku bisa berputar ke mana-mana.",
  "Cetakan hidung kucing itu unik, mirip sidik jari manusia.",
  "Kucing berkeringat lewat telapak kakinya. Kadang ada jejak basah kalau kami gugup.",
  "Kucing menghabiskan sepertiga sampai separuh waktunya untuk menjilati bulu. Bersih itu penting.",
  "Ekor yang tegak lurus ke atas itu salam ramah dari kucing.",
  "Kumis kucing membantu merasakan sekitar, termasuk mengira-ngira apakah badan kami muat lewat celah.",
  "Kucing punya kelopak mata ketiga, namanya membran niktitans.",
  "Dengkuran kucing bergetar di sekitar 25 sampai 150 Hz. Kata orang, bunyinya menenangkan.",
  "Kucing paling aktif saat fajar dan senja. Makanya aku suka zoomies sore-sore.",
  "Banyak kucing dewasa tidak cocok minum susu sapi karena sulit mencerna laktosa.",
  "Penciuman kucing jauh lebih tajam dari manusia. Aku tahu kamu habis makan apa.",
  "Kucing sudah hidup berdampingan dengan manusia lebih dari 9.000 tahun.",
  "Sebagian besar kucing oranye itu jantan. Kucing oyen memang terkenal.",
  "Kucing calico (telon) hampir selalu betina.",
  "Kucing memakai ekornya untuk menjaga keseimbangan saat berjalan di tempat sempit.",
  "Anak kucing lahir dengan mata tertutup. Biasanya mata mereka mulai terbuka sekitar satu sampai dua minggu kemudian.",
];

export const FACT_INTRO: readonly Line[] = ["Tahu nggak?", "Fakta kucing hari ini:", "Ini beneran, lho."];

export const RAHASIA: readonly string[] = [
  "Hadiah yang kubawakan? Aku nemu di balik panel bawah. Jangan tanya lagi.",
  "Aku sebenarnya bisa baca jam. Cuma pura-pura nggak bisa, biar dimaafkan kalau telat.",
  "Kalau kamu nggak lihat, aku menari. Sedikit.",
  "Ikan berkilau itu... kadang aku yang naruh. Biar kamu senang.",
  "Aku tahu kursormu suka mampir ke sini waktu kamu bosan kerja.",
  "Aku pernah nyolong camilan dari toples. Cuma satu. Dua. Oke, tiga.",
];
export const RAHASIA_NO: readonly Line[] = ["Rahasia? Kita belum seakrab itu.", "Rahasia cuma buat yang sudah tiga hati ke atas. Aturan kucing."];

// ---------------------------------------------------------------------------
// Teman, sayang, pujian

export const TEMAN: Pool = {
  any: [
    "{teman}? Dia baik. Kadang nyolong tempatku di rak, tapi baik.",
    "{teman} itu teman tidurku yang paling hangat.",
    "Jujur ya, {teman} itu agak aneh. Tapi aku juga aneh, jadi cocok.",
    "{teman} ngorok kenceng banget kalau tidur. Jangan bilang aku yang bilang.",
  ],
  aktif: ["{teman} lambat! Tapi kalau gulat, dia lumayan."],
  pemalas: ["{teman}? Dia terlalu berisik. Tapi bantal yang bagus."],
  rakus: ["{teman} suka lirik-lirik mangkukku. Aku awasi dia."],
  manja: ["Aku sayang {teman}. Tapi aku lebih sayang kamu. Jangan bilang dia."],
  penjelajah: ["{teman} belum pernah ke ujung strip. Nanti aku ajak."],
};

export const SENDIRI: readonly Line[] = [
  "Kadang. Tapi ada kamu.",
  "Kalau ada kucing liar mampir, kasih makan, ya. Siapa tahu jadi temanku.",
];

export const SAYANG: readonly (readonly Line[])[] = [
  ["Kita baru kenal... elus aku lebih sering, nanti kita lihat.", "Sayang? Hmm. Tergantung camilan."],
  ["Mulai suka. Sedikit. Sedikit saja.", "Kamu lumayan. Untuk ukuran manusia."],
  ["Lumayan sayang. Jangan bilang-bilang.", "Iya. Tapi jangan geer."],
  ["Sayang. Makanya aku kadang bawain hadiah.", "Sayang, dong. Masa nggak."],
  ["Sayang banget. Kamu manusia favoritku.", "Kamu orang pertama yang kucari kalau bangun tidur."],
  ["Kamu itu rumahku. Bukan kardus, bukan rak. Kamu.", "Sayang. Selamanya. Bahkan waktu kamu telat kasih makan."],
];

export const PUJI: Pool = {
  any: ["Aku tahu. Tapi makasih.", "Hehe. (ekornya bergoyang-goyang)", "Kamu juga lucu. Untuk ukuran manusia."],
  manja: ["Aku tahu. Tapi bilang lagi.", "Lagi dong pujinya~"],
  aktif: ["Lucu DAN cepat!"],
  pemalas: ["Makasih... (pura-pura cuek, tapi ekornya bergoyang)"],
  rakus: ["Lucu itu butuh banyak makan, lho."],
  penjelajah: ["Bulu ini sudah ke ujung kiri dan kanan strip."],
  shy: ["...(dia memalingkan muka, tapi telinganya memerah)"],
};
export const PUJI_ACC: readonly Line[] = ["Ini {aksesori}-ku. Keren, kan?", "Kamu lihat {aksesori}-ku? Cocok, kan?"];

// ---------------------------------------------------------------------------
// Mengetik, waktu, dan pamit

export const KETIK_SOME: readonly Line[] = [
  "Hari ini kita sudah {ketuk} ketukan! Kakiku pegel.",
  "{ketuk} ketukan hari ini. Kita tim yang hebat.",
];
export const KETIK_BUSY: readonly Line[] = ["Kamu ngetik terus dari tadi. Istirahat matamu sebentar, ya.", "Jarimu nggak capek? Aku capek lihatnya."];
export const KETIK_NONE: readonly Line[] = ["Hari ini belum ngetik bareng. Ayo! Aku siap menepuk keyboard."];

export const WAKTU: Record<string, readonly Line[]> = {
  dini: ["Ini jam tidur! Kucing pun lagi tidur... kecuali aku."],
  fajar: ["Matahari baru bangun. Kamu juga?"],
  pagi: ["Masih pagi. Sudah sarapan?", "Pagi! Jangan lupa minum air."],
  siang: ["Waktunya makan siang!", "Siang-siang begini enaknya tidur. Eh, kerja."],
  sore: ["Sudah sore. Hari ini kamu hebat.", "Sore. Sebentar lagi senja, waktunya aku zoomies."],
  senja: ["Langitnya oranye. Oyen banget.", "Senja! Aku jadi pengin lari-lari."],
  malam: ["Sudah malam. Jangan lupa istirahat.", "Malam. Waktunya kunang-kunang keluar."],
};

export const BYE: Pool = {
  any: ["Oke! Panggil aku lagi kalau butuh.", "Dadah! Aku lanjut kerja... maksudku tidur.", "Meong! (artinya: sampai nanti)"],
  manja: ["Yah... ya sudah. Tapi cepat balik, ya."],
  aktif: ["Oke! Aku lari dulu!"],
  pemalas: ["Akhirnya... eh, maksudku, sampai nanti."],
};
export const BYE_NIGHT: readonly Line[] = ["Selamat malam, {you}. Mimpi ikan, ya.", "Tidur yang nyenyak. Aku jaga strip ini."];
export const BYE_SULK: readonly Line[] = ["Hmph. Sana.", "...(dia tetap membelakangimu)", "Hmph. Nanti saja minta maafnya."];
export const BYE_MORNING: readonly Line[] = ["Oke! Semangat pagi ini.", "Semangat ya hari ini, {you}!"];

export const BORED: Pool = {
  any: ["Hoaam... aku mau lanjut santai dulu. Ngobrol lagi nanti, ya.", "Mulutku capek ngomong. Kucing biasanya cuma bilang meong."],
  pemalas: ["Sudah ya... energiku buat ngobrol habis. Isi ulangnya pakai tidur."],
  aktif: ["Aku mau lari-lari dulu! Nanti cerita lagi!"],
  manja: ["Aku mau tidur di dekat kamu aja sekarang. Prrr..."],
};

// ---------------------------------------------------------------------------
// Ngambek

export const MAAF_OK: readonly Line[] = ["...ya sudah. Tapi jangan diulang.", "Hmph. Dimaafkan. Kali ini."];
export const MAAF_NO: readonly Line[] = ["Masih kesal. Coba lagi nanti... atau pakai camilan.", "Belum. Aku butuh waktu. Dan mungkin camilan."];
export const MAAF_TREAT: readonly Line[] = ["...camilan diterima. Permintaan maaf juga.", "Nyam. Oke, kita baikan."];

// ---------------------------------------------------------------------------
// Celoteh (kalimat pendek tanpa pilihan)

export const CHATTER: Pool = {
  any: [
    "Meong.",
    "Hmm... ikan.",
    "Strip ini makin nyaman, ya.",
    "Barusan aku lihat cicak. Atau debu. Pokoknya sesuatu.",
    "Prrr...",
    "(menjilati kaki dengan serius)",
    "Kayaknya ada sesuatu di ujung strip...",
    "Aku ganteng hari ini. Atau cantik. Pokoknya keren.",
  ],
  pemalas: ["Hoaam...", "Lima menit lagi..."],
  aktif: ["Ada yang mau lomba lari?", "Hup! Hup!"],
  rakus: ["Kapan makan lagi, ya?", "Ada yang cium bau ikan?"],
  penjelajah: ["Ujung kanan sana belum kujelajahi...", "Aku penasaran apa di balik panel itu."],
  manja: ["Elus aku dong...", "{You}~ lihat sini~"],
};
export const CHATTER_HUNGRY: readonly Line[] = ["Lapar...", "Ada yang dengar perutku bunyi?", "Mangkuknya kosong, lho..."];
export const CHATTER_TYPING: readonly Line[] = ["Tik tik tik tik... kamu sibuk banget, ya.", "Jarimu nggak capek? Istirahat sebentar, yuk.", "Ngetik terus... aku ikut pegel."];
export const CHATTER_RAIN: readonly Line[] = ["Hujan... enaknya tidur.", "Aku nggak mau keluar. Basah.", "Dengar bunyi hujannya? Tenang, ya."];
export const CHATTER_NIGHT: readonly Line[] = ["Sudah malam, lho...", "Hoaam... kamu belum tidur?", "Kunang-kunangnya keluar."];
export const CHATTER_MORNING: readonly Line[] = ["Pagi! Sudah minum air?", "Selamat pagi! Hari ini kita semangat, ya."];
export const CHATTER_FRIEND: readonly Line[] = ["{teman} ngorok kenceng banget tadi.", "Tadi {teman} nyenggol aku. Aku maafkan. Kali ini.", "Aku dan {teman} mau balapan nanti."];
export const INVITE: Record<"hungry" | "typing" | "rain" | "night" | "morning" | "story", readonly Line[]> = {
  hungry: ["{You}... sini sebentar. Perutku bunyi.", "Psst, {you}. Ada yang mau aku omongin. Soal makanan."],
  typing: ["Psst, {you}. Kamu sudah lama ngetik, lho.", "{You}, istirahat sebentar, yuk? Ngobrol sama aku."],
  rain: ["{You}, lihat! Di luar hujan.", "Psst... dengar bunyi hujannya?"],
  night: ["{You}... sudah malam, lho.", "Psst, {you}. Kok belum tidur?"],
  morning: ["Pagi, {you}! Sini sebentar.", "{You}! Selamat pagi. Ngobrol dulu, yuk?"],
  story: ["{You}! Aku mau cerita.", "Psst... {you}. Sini sebentar.", "Eh, {you}, ngobrol yuk?"],
};
export const VISITOR: readonly Line[] = [
  "Aku cuma mampir... tapi kalau ada makanan, aku nggak nolak.",
  "Halo, manusia asing. Rumahmu nyaman juga.",
  "Kasih makan aku tiga kali, nanti aku pikir-pikir buat tinggal.",
  "Meong? (dia mengendus-endus, belum yakin padamu)",
];
