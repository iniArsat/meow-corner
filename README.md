# Meow Corner

Game idle kucing yang tinggal di strip bawah layar desktop. Kucing-kucing berjalan, tidur, makan, bermain, dan mengumpulkan ikan selagi Anda bekerja, dan Anda bisa mengelus, mengusap, mengangkat, dan bermain dengan mereka langsung dari kursor. Dibuat dengan **Tauri 2 + TypeScript + PixiJS**, tanpa game engine.

![Tampilan strip](docs/screenshot.png)

## Unduh dan main

Buka halaman **[Releases](https://github.com/iniArsat/meow-corner/releases/latest)**, unduh file yang berakhiran `-setup.exe`, lalu klik dua kali untuk memasang. Installer dibuat otomatis oleh GitHub Actions setiap ada perubahan di branch `main`.

## Baru di versi 0.3: Asisten Kucing

**Pengingat yang diantar kucing.** Atur pesan dan jamnya, misalnya "Meeting tim" pukul 17.00, untuk sekali, setiap hari, atau Senin–Jumat. Saat waktunya tiba, kucing yang paling sayang padamu berlari ke tengah layar membawa papan pesan, melompat-lompat, dan mengeong sampai kamu menekan **Oke** (atau mengeklik kucingnya). Bisa ditunda 5 atau 15 menit.
- Pengingat juga muncul sebagai **notifikasi Windows**, jadi tetap terdengar saat strip disembunyikan atau saat presentasi layar penuh. Jadwalnya dijaga oleh sisi Rust, bukan timer halaman web, sehingga tetap tepat waktu.
- Pengingat yang terlewat saat komputer tidur atau aplikasi tertutup dilaporkan sekali, tidak bertubi-tubi.

**Fitur asisten lainnya** (tombol lonceng di panel bawah):
- **Timer fokus (pomodoro)** 15/25/45/60 menit. Hitung mundur tampil di panel, kucing ikut tenang, lalu merayakan dengan konfeti dan mengingatkan istirahat. Setiap sesi memberi ikan dan ikatan.
- **Daftar tugas.** Setiap tugas yang dicentang dihadiahi ikan (maksimal 20 per hari).
- **Pengingat sehat:** minum air, peregangan (kucing-kucing ikut meregangkan badan), dan istirahat mata, hanya di jam aktif.
- **Pengingat jam tidur** (kucing menguap), **kucing mengeong setiap jam**, dan **jam** di panel bawah.

**Lebih seru:**
- **Lepaskan kucing** yang sudah diadopsi (panel Kucing → Lepaskan). Dia pamit dengan hati, lalu berjalan keluar layar.
- **24 prestasi** dengan hadiah camilan atau ikan.
- **Hadiah harian** yang dibawa kucing. Hari berturut-turut memberi hadiah lebih besar, dan hari ke-7 memberi aksesori langka.
- **Mode foto:** simpan pemandangan strip sebagai PNG berbingkai ke folder Gambar › Meow Corner.
- Pengingat dan daftar tugas tidak ikut terhapus saat "Hapus semua progres".

## Baru di versi 0.2: kucing yang bisa diajak berinteraksi

**Interaksi langsung dengan kursor**
- **Usap**: gerakkan kursor bolak-balik di atas kucing (tanpa klik) sampai ia mendengkur. Muncul not musik dan hati.
- **Angkat dan lempar**: seret kucing dengan mouse; ia menggantung dan berayun. Jatuhkan di atas fasilitas untuk menugaskannya, atau ke dalam kardus untuk bersembunyi. Dilempar terlalu keras dua kali? Dia kesal.
- **Mainan bulu**: tombol bulu di HUD memasang bulu di ujung tali pada kursor. Kucing mengejar, merunduk sambil menggoyang pantat, lalu menerkam. Tangkapan memberi ikan.
- **Camilan**: tombol camilan, lalu klik kucing. Kucing di dekat kursor datang dan mengemis.
- **Jangan diklik terus-terusan**: kucing mendesis, kabur, lalu ngambek membelakangi Anda. Usap pelan atau beri camilan untuk berbaikan.
- Kucing menoleh ke arah kursor, tampak penasaran saat kursor mendekat, dan bisa **dipanggil** dari panel Kucing.

**Ikatan, aksesori, hadiah**
- Setiap kucing punya **ikatan** 0–5 hati. Setiap hati menambah produksi 2%.
- **14 aksesori**: pita, topi pesta, peci, blangkon, topi penyihir, kacamata, dan lain-lain. 10 dijual di Toko, 4 hanya bisa didapat sebagai hadiah.
- Kucing dengan 3 hati ke atas kadang **membawakan hadiah**: kado yang dibawa di mulut lalu diletakkan di lantai. Klik kadonya.

**Kehidupan di strip**
- Kucing memakai fasilitasnya: makan di mangkuk, bermain benang, bersembunyi di kardus (matanya mengintip), bertengger di tiang garuk, duduk di atas akuarium, dan berjemur di rak jendela.
- **Antar-kucing**: saling sundul hidung, saling menjilati, bergulat main-main, dan tidur berpelukan.
- **Zoomies** (lari kencang tiba-tiba), gelembung pikiran, kupu-kupu di siang hari yang dikejar kucing, dan kunang-kunang di malam hari.
- Saat tombol **Beri makan** ditekan, semua kucing berlari ke mangkuk.
- Simpanan v0.1 otomatis dipindahkan ke format baru; progres tidak hilang.

## Isi versi 0.1 (MVP)

- **Strip transparan** selebar layar, menempel di atas taskbar, selalu di atas jendela lain.
- **Klik tembus per area**: klik di ruang kosong diteruskan ke aplikasi di belakang; hanya kucing, fasilitas, dan UI yang bisa diklik.
- **6 fasilitas** (Mangkuk makan sampai Rak jendela) dengan harga naik 15% per pembelian, plus 18 upgrade.
- **18 jenis kucing** dalam 4 kelangkaan, semuanya pixel art yang digambar oleh kode (tanpa file gambar).
- **5 sifat kucing** yang memengaruhi produksi: Pemalas, Aktif, Rakus, Penjelajah, Manja.
- **Kucing liar**: mampir sesekali, beri makan 3 kali, lalu adopsi dan beri nama.
- **Rasa lapar** tanpa hukuman berat (kucing lapar hanya kurang produktif), **elusan** memberi bonus semangat.
- **Ikan berkilau** yang muncul acak untuk bonus kecil.
- **Progres offline** 50% sampai 8 jam (bisa ditingkatkan sampai 24 jam).
- **Pindah Rumah** (prestige): reset fasilitas, dapat Bintang untuk bonus permanen.
- **Kucingpedia**, Mode Fokus (animasi tenang, hemat daya), efek suara opsional.
- **Ikon tray** (Tampilkan/Sembunyikan, Keluar), strip otomatis bersembunyi saat ada game atau aplikasi layar penuh (Windows).
- **Simpan otomatis** tiap 60 detik dan saat keluar, dengan file cadangan.

## Cara termudah di Windows: klik dua kali

1. Ekstrak `meow-corner.zip` (klik kanan → **Extract All**).
2. Buka folder hasil ekstrak, lalu klik dua kali **`PASANG-WINDOWS.bat`**.
   - Bila muncul "Windows protected your PC", klik **More info** → **Run anyway**.
   - Bila muncul jendela izin (UAC), klik **Yes**.
3. Biarkan jendela hitam bekerja. Ia memasang Node.js, Visual Studio Build Tools (C++), dan Rust lewat winget bila belum ada, lalu menyiapkan proyek. Pertama kali bisa 30–60 menit, tergantung internet.
4. Saat ditanya, ketik **1** lalu Enter untuk membuat installer. Installer Meow Corner akan terbuka sendiri; ikuti langkahnya, dan game muncul di Start Menu.

Bila ada langkah yang gagal, pesan errornya tampil di jendela itu. Langkah manual di bawah bisa dipakai sebagai cadangan.

## Menjalankan di Windows (manual)

### 1. Pasang prasyarat (sekali saja)

1. **Node.js 20 atau lebih baru**: unduh versi LTS dari <https://nodejs.org>.
2. **Rust**: unduh dan jalankan `rustup-init.exe` dari <https://rustup.rs>, pilih instalasi bawaan.
3. **Microsoft C++ Build Tools**: dari <https://visualstudio.microsoft.com/visual-cpp-build-tools/>, centang **"Desktop development with C++"**.
4. **WebView2** sudah terpasang di Windows 10 (versi terbaru) dan Windows 11.

Panduan resmi lengkap: <https://v2.tauri.app/start/prerequisites/>.

### 2. Jalankan mode pengembangan

Buka terminal (PowerShell) di folder proyek ini:

```powershell
npm install
npm run tauri dev
```

Build pertama Rust memakan beberapa menit; berikutnya jauh lebih cepat. Strip akan muncul di bawah layar. Untuk keluar, klik kanan ikon kucing di tray lalu pilih **Keluar**, atau buka menu **⋯ → Atur → Keluar**.

### 3. Buat installer

```powershell
npm run tauri build
```

Installer ada di `src-tauri/target/release/bundle/nsis/` (`.exe`) dan `src-tauri/target/release/bundle/msi/` (`.msi`).

## Mengembangkan di browser saja

Untuk mengerjakan tampilan dan gameplay tanpa menunggu build Rust:

```powershell
npm run dev
```

Lalu buka <http://localhost:1420>. Klik tembus dan tray tidak aktif di mode ini, tetapi semua gameplay jalan. Di konsol DevTools tersedia objek `meow` untuk menguji cepat, misalnya:

```js
meow.game.state.fish = 1e6;          // banyak ikan untuk mencoba toko
meow.game.callVisitor(Date.now());   // panggil kucing liar
meow.game.dropGift(meow.game.state.cats[0], Date.now()); // hadiah dari kucing
```

## Perintah lain

| Perintah | Fungsi |
| --- | --- |
| `npm test` | Menjalankan tes unit (ekonomi, alur game, simpanan, ikatan/hadiah, sprite) |
| `npm run typecheck` | Pemeriksaan tipe TypeScript |
| `npm run build` | Build frontend ke `dist/` |

## Struktur kode

```
src/
  core/        Logika murni, tanpa tampilan (mudah diuji)
    data.ts      Semua angka balancing, daftar kucing, fasilitas, upgrade
    economy.ts   Rumus harga, produksi, offline, prestige
    game.ts      Simulasi dan aksi pemain, mengirim event
    assistant.ts Jadwal pengingat, timer fokus, pengingat sehat (waktu lokal)
    achievements.ts Daftar prestasi dan hadiahnya
    state.ts     State awal dan migrasi simpanan
    save.ts      Simpan/muat dengan cadangan
  render/      Tampilan PixiJS
    pixelart.ts  Generator pixel art (pose kucing, pola bulu, aksesori, fasilitas)
    catActor.ts  Satu kucing: animasi, gerak, lompat, jatuh, diangkat, emosi
    stage.ts     Strip, input mouse, keputusan kucing, mainan, camilan, hadiah, sosial
    effects.ts   Partikel (hati, bintang, not musik, debu, remah)
    ambient.ts   Kupu-kupu dan kunang-kunang
  ui/          HUD, panel, dialog (HTML + CSS); assistantUi.ts = tab Asisten dan kartu pesan
  platform/    Jembatan ke Tauri dan klik tembus
src-tauri/
  src/lib.rs   Jendela, klik tembus, tray, deteksi layar penuh, file simpanan,
               penjadwal pengingat + notifikasi Windows, penyimpanan foto
tests/         Tes unit Vitest
```

### Mengubah keseimbangan

Semua angka ada di `src/core/data.ts`: harga dan produksi fasilitas, bonus kelangkaan, bobot peluang kucing liar, lama lapar, batas offline, dan konstanta lain di objek `BALANCE`.

### Menambah jenis kucing

Tambahkan entri ke `COATS` di `src/core/data.ts`: pilih kelangkaan, pola (`solid`, `tabby`, `tuxedo`, `calico`, `point`, `spotted`, `starry`), dan palet warna. Sprite dibuat otomatis untuk semua pose. Pratinjau semua sprite ke PNG:

```powershell
$env:PREVIEW="C:\folder\tujuan"; npx vitest run tests/sprites.test.ts
```

## Lokasi file simpanan

- Windows: `%APPDATA%\id.meowcorner.app\save.json` (cadangan: `save.json.bak`)
- macOS: `~/Library/Application Support/id.meowcorner.app/`
- Linux: `~/.local/share/id.meowcorner.app/`

## Batasan yang diketahui

- Deteksi aplikasi layar penuh baru diimplementasikan untuk Windows.
- Belum diuji di macOS. Di Linux, jendela transparan butuh compositor.
- Integrasi Steam (achievement, Steam Cloud) belum ada; rencananya lewat crate `steamworks` di sisi Rust.
- Reaksi terhadap ketikan/klik di aplikasi lain belum ada (butuh hook input global).
- Musik belum ada; efek suara masih sintetis.
