# Laporan-Dinas-Goretty

Webapp pencatatan laporan dinas & operan pasien untuk unit ICU "Goretty", RS St. Carolus, sekaligus statistik dan logbook perawat.

# Technical Specification — Laporan Dinas Goretty

Backend: Google Apps Script. Penyimpanan: Google Sheets. Frontend: HTML/CSS/JS via `HtmlService`.

Dokumen ini untuk pengembang/Claude Code yang memelihara sistem.
Tujuan utama: pencatatan untuk **audit, surveilans, penelitian, dan statistik** (harian/bulanan/tahunan). Karena itu **integritas data adalah prioritas tertinggi**, khususnya keunikan nomor laporan.

> **Catatan penting:** Sistem **TIDAK menggunakan arsip**. Jumlah laporan Goretty relatif kecil, jadi semua data tetap di sheet `Laporan` (ws1). Tidak ada spreadsheet arsip, tidak ada fungsi pengarsipan/penghapusan baris.

---

## 1. Arsitektur & Berkas

| Berkas | Peran |
|---|---|
| `code.gs` | Seluruh logika server (Apps Script) |
| `index.html` | Shell SPA: topbar (logo RS St. Carolus di kiri + teks), router antar-halaman, util global (`esc`, `ymd`, `fmtDMY`, `toast`, `loading`, `errH`, `gotoPage`). Menerima param URL `p`, `n`, `nw/nm/sh` (buka Page5). |
| `assets/logo_carolus_base64.txt` | Sumber logo RS St. Carolus (data URI WebP base64). File repo saja — **tidak** di-`push` clasp (ekstensi tak dikenal). Isinya di-*inline* ke `src` `<img class="topbar-logo">` di `index.html`. Diambil dari proyek Endoskopi. |
| `page1.html` | Daftar pasien hari ini. Klik tombol shift kosong → **buka tab baru** ke Page5 (laporan baru). Klik badge bernomor → buka laporan tsb. |
| `page2.html` | Input/keluar pasien (embed Google Form) |
| `page3.html` | Lihat laporan (tabel, filter, **edit inline gabungan** diagnosis+laporan+alat medik+PPI+antibiotik+DPJP visit lewat satu tombol Edit/Simpan per baris — lihat §8, tombol Refresh & Cetak PDF) |
| `page4.html` | Operan dinas (kartu per pasien; cari seluruh riwayat; tombol Refresh) |
| `page5.html` | Tulis/lihat/edit laporan (form utama): Waktu&Petugas, Data Pasien, Alat Medik, DPJP Visit, PPI, Antibiotik, Diagnosis, Isi Laporan (lihat §6, §2.1). Pencarian berbasis **tanggal + nama + shift**, atau **mode berurutan** (wizard) dari Page1 — lihat §6.1. |
| `page7.html` | Permintaan dinas: form **Ajukan + Batalkan** (native) + tabel jawaban read-only; **baca & tulis** spreadsheet eksternal Form responses |
| `page8.html` | Statistik (diagnosis/alat dari ws1; metrik pasien dari sheet Merge) |
| `page9.html` | **Logbook Perawat Goretty** (baca spreadsheet eksternal, read-only) |
| `page10.html` | **Jadwal Dinas** — bukan tabel internal, melainkan *embed* (iframe) ke web app Apps Script eksternal "Daftar Dinas IPI" (sama dengan proyek Damianus), read-only. |
| `page11.html` | **Jadwal Jaga Anestesi** — *embed* (iframe) ke web app Apps Script eksternal "Jadwal Jaga Anestesi", read-only. |

> Tidak ada `page6.html`. Urutan tab: p1, p2, p3, p4, p5, p7, p8, p9 (label tab p9 = "📒 Logbook"), p10 ("📅 Jadwal Dinas"), p11 ("🗓️ Jadwal jaga Anestesi").

> **Dulu (≤ Jul 2026) "📅 Jadwal Dinas" & "🗓️ Jadwal jaga Anestesi" adalah tombol `window.open(...)` yang membuka web app eksternal di tab browser baru.** Sekarang keduanya jadi halaman SPA biasa (p10, p11) agar tak membuka tab baru — terdaftar penuh di `PAGE_IDS`/`loaded`/`gotoPage` seperti halaman lain, dan **wajib diletakkan sebagai dua tombol terakhir** karena `gotoPage` memetakan tombol→halaman lewat indeks (`PAGE_IDS[i]`). Kini ada **10 tombol tab = 10 entri `PAGE_IDS`** (indeks harus sinkron).

> **Dua tombol topbar tambahan di luar `PAGE_IDS`: "🩺 SISMADAK" & "🧴 PPI"** — sengaja **bukan** halaman SPA (`gotoPage`), melainkan tetap `window.open(...)`/tab baru ke sistem eksternal, diletakkan setelah tombol p11. Karena `gotoPage` memetakan tombol→halaman lewat indeks array (`PAGE_IDS[i]===id`), keduanya aman ditambah di akhir tanpa entri `PAGE_IDS` (index-nya melebihi panjang array, jadi tak pernah cocok/`active`) — tapi **kalau menambah tombol topbar lagi, taruh juga di akhir**, jangan disisipkan di antara tombol p1–p11.

Setiap halaman di-include ke `index.html` sebagai template dan punya fungsi `initPN(params)` yang dipanggil router (`gotoPage`) saat halaman dibuka.

> **Logo topbar.** Logo RS St. Carolus tampil di ujung kiri topbar (`height:53px`), sebelum blok teks "RS St. Carolus / IPI — Goretty" (`<img class="topbar-logo">`). Sumbernya data URI WebP base64 yang di-*inline* langsung ke atribut `src` (bukan file yang diserve terpisah — HtmlService tak melayani gambar statis lewat URL). Master datanya di `assets/logo_carolus_base64.txt`; bila logo diganti, perbarui file itu lalu inline ulang ke `src`. Base64 aman di atribut `src` berkutip ganda (tak ada karakter kutip di dalamnya). Ukuran & warna topbar (§ tema di bawah) disamakan dengan proyek Damianus.

> **Tema warna topbar & header tabel.** `--thead-grad:linear-gradient(135deg,#1e3a8a,#2563eb)` di `:root` (`index.html`) dipakai untuk `.topbar` **dan** semua header tabel (`<th>`) di tiap halaman (page1/3/7/9 dst) — satu gradasi biru menyatu, bukan warna solid `#1e3f62` lama. **Header tabel** dirender lewat fungsi global `applyRowGradient(row)` (`index.html`) yang dipanggil **setelah** tabel `display:block/table` (bukan saat masih `display:none`, atau `offsetWidth` semua sel = 0 dan gradasinya diam-diam tak berefek) — triknya: `background-size` = lebar total baris, `background-position` = -offset kumulatif tiap sel, supaya gradasinya tersambung mulus lintas kolom (termasuk kolom frozen/sticky), bukan pita berulang per kolom.

> **Nav bar membungkus (responsif) + sinkron tinggi topbar.** Ada 10 tombol tab, terlalu banyak untuk satu baris di banyak lebar layar. **Perangkat mouse/trackpad (`@media(pointer:fine)`, bukan lagi berdasar lebar layar):** `.tabs` memakai `flex-wrap:wrap` sehingga tab **membungkus jadi 2 baris** dan semua tab selalu terlihat tanpa perlu geser — penting karena scrollbar horizontal disembunyikan (`scrollbar-width:none`), jadi di desktop bermouse tab yang tersembunyi tak terjangkau. **Sentuh (mobile/tablet):** tetap **satu baris** dengan `overflow-x:auto` (base `.tabs`) — geser sentuh sudah nyaman dan menghemat tinggi vertikal. Karena topbar bisa tumbuh >1 baris, sebuah IIFE di akhir `<script>` `index.html` memasang `ResizeObserver` pada `.topbar` yang menyinkronkan custom property `--topbar-h` dengan tinggi topbar **sebenarnya** (`tb.offsetHeight`) — tanpa ini, `calc(100vh - var(--topbar-h) - …)` di tiap halaman (Page1/2/3/4/5/7) meleset dan area konten terpotong/scroll ganda saat topbar 2 baris. Jangan hapus `overflow-x:auto` pada base `.tabs` (dipakai mobile), dan jangan hapus IIFE ResizeObserver itu bila menambah lebih banyak tombol topbar.

> **Topbar-info (kanan atas).** Selain tanggal (`#tbar-tgl`) & dokter jaga (`#tbar-dok`), sekarang juga menampung jumlah pasien hari ini (`#tbar-n`, diisi `page1.html`), status mode berurutan (`#tbar-wiz-info`, lihat §6.1), serta tombol **Refresh** (`refreshP1()`) dan **"Mulai Laporan Shift Ini"** (`mulaiWizard()`) — semua fungsi ini didefinisikan di `page1.html` meski elemennya di `index.html`, karena hanya relevan saat Page1 aktif. Dulu kontrol-kontrol ini ada di header biru lokal Page1 (`.p1h`, sudah dihapus); sekarang disatukan ke topbar global, sama seperti proyek Damianus.

### Identitas teknis
- **Spreadsheet utama (terikat):** `17PUDkWDfNS_FDvjZVCA9r_mdul-T8uYNSevCWxfYgpk`
- **Spreadsheet eksternal — Permintaan Dinas (Page7):** `1i0lJ8dyeAUXvdEsPIPvMgO5cUfYF5e0LG6h7RLzpwpM` (konstanta `PD_SS_ID`)
- **Spreadsheet eksternal — Logbook Perawat Goretty (Page9):** `11pJK2JfLt1Zv1iJN4YFSakGo65Yn4daw2hFm0DXJX1M`
- **Web app eksternal — Jadwal Dinas (Page10, iframe):** `https://script.google.com/macros/s/AKfycbyia5srJF2bU_ilLuGuoVgLOG1a4cew6BR_54El4ehZ0Pmly-kImnrUkxK72B-WmQrGfQ/exec` (app "Daftar Dinas IPI", sama dengan yang di-embed di proyek Damianus)
- **Web app eksternal — Jadwal Jaga Anestesi (Page11, iframe):** `https://script.google.com/macros/s/AKfycbzrD9WiIfvZKscjfK0MeP0NiKJiD0y1emIbcCoNYm6i3zDCPsCGg1u4pD1hJJnRu0EX0Q/exec`
- **Web app eksternal — SISMADAK (tombol topbar, buka tab baru):** `https://script.google.com/macros/s/AKfycbx_webHu3ZVG50tVZMKmjkVgMysKFYnN7GqtrLJYehFTUYN2P9wwoutHbux850UUpWU/exec`
- **Spreadsheet eksternal — PPI (tombol topbar, buka tab baru):** `1_EVmA8QSxdNCbV_ylwy_sbGdB8s8jjM2i3yMDpVyi3E` (konstanta `PPI_SS_ID`), **READ-ONLY**. Tombol "🧴 PPI" di topbar (`index.html`) memanggil `bukaPPI()` → `google.script.run` server `getPPISheetUrl()`, yang mencari sheet bernama **`{BULAN} {TAHUN}` kapital semua** (mis. `AGUSTUS 2026`, sesuai tanggal kalender server saat tombol diklik) via `getSheetByName`, ambil `gid`-nya, lalu buka `.../edit?gid=<gid>#gid=<gid>` di tab baru. Nama sheet bulan Indonesia di `PPI_BULAN` (server); kalau sheet bulan itu belum dibuat, fallback ke `PPI_FALLBACK_GID`. Karena butuh lookup server (bukan link statis), polanya beda dari SISMADAK: klik → buka tab kosong dulu (sinkron, hindari popup blocker) → `window.location` tab itu diarahkan setelah server balas.

### Sheet di spreadsheet utama
| Variabel / Sheet | gid | Peran |
|---|---|---|
| `ws1` = `getsheetbyid(0)` | 0 | **Laporan** — tabel utama laporan dinas |
| `ws2` = `getsheetbyid(1476005123)` | 1476005123 | **Pasien hari ini** + dokter jaga (sel T2) |
| **Lookup** (by name) | 2028034470 | Opsi dropdown (perawat E2:E, pasien I2:I, Bed C2:C). Dibaca via `opsi()` (cache 300s) — tak ada lagi const `ws3`. |
| `Merge` (by name) | 463136828 | Indeks pasien permanen (master). Sumber **metrik pasien** Page8 (jaminan, DPJP, umur, lama rawat, kondisi). |
| `Pivot Diagnosis` / `Pivot Alat Medik` (opsional) | 311832308 / 263609631 | Agregasi bulanan opsional dari `refreshPivot()`. **Page8 TIDAK bergantung pada sheet ini** (lihat §9). |

---

## 2. Struktur Kolom Sheet "Laporan" (ws1) — KRUSIAL

Indeks 0-based (sesuai hasil `getValues()`):

| Idx | Kolom | Nama | Catatan |
|---|---|---|---|
| 0 | A | Nomor | **Nomor laporan unik. Tidak boleh dobel. Tidak boleh salah.** |
| 1 | B | Tanggal | Date |
| 2 | C | Dinas/Shift | "Pagi" / "Sore" / "Malam" |
| 3 | D | PJ | Perawat penanggung jawab |
| 4 | E | Pasien | Nama pasien |
| 5 | F | PP | Perawat pelaksana |
| 6 | G | Diagnosis | Teks diagnosis (diisi user) |
| 7 | H | Laporan | Isi laporan |
| 8 | I | AlatMedik | Token dipisah `;`: alat medik + PPI + DPJP visit (token telanjang) dicampur dengan isian PPI singkat & antibiotik (`Key=Value`). **Lihat §2.1 untuk format lengkap** — bukan cuma daftar alat lagi sejak fitur PPI/Antibiotik/DPJP visit ditambahkan. |
| 9 | J | Timestamp | `new Date()` saat simpan |
| 10 | K | Agama | |
| 11 | L | Jaminan | |
| 12 | M | DPJP | |
| 13 | N | DPJPLain | Konsulen lain |
| 14 | O | Umur | |
| 15 | P | HariKe | Hari rawat ke- |
| 16 | Q | Bed | Tempat tidur |
| 17 | R | DiagnosisEdited | **Diisi ArrayFormula di header. Lihat §3.** |

Operasi tulis data laporan menyentuh **17 kolom (A–Q)**. Kolom R diisi formula otomatis dan **tidak pernah** ditulis oleh kode.

### 2.1 Format kolom I (AlatMedik) — token campuran, `;`-separated

Kolom I dipakai bersama oleh 4 konsep, semua digabung jadi **satu string**, dipisah `;`. Setiap token adalah salah satu dari dua bentuk:

**a) Token telanjang** (checkbox) — `id` checkbox **selalu sama persis** dengan `value`-nya (`id===value`). Ini bukan kebetulan: restore checkbox dari token tersimpan mencari elemen lewat `document.getElementById(token)` — kalau `id≠value`, restore gagal total secara diam-diam (tidak error, checkbox cuma kelihatan kosong padahal data benar). **Jangan pernah membuat checkbox baru dengan `id≠value`.**
- **Alat medik** — id dari `ALAT_LIST` (`code.gs`), kelas CSS `.multi`. Contoh: `Ventilator`, `Doublelumen`, `ArterialLine` (Arterial line), `IVLine` (IV line).
- **PPI** (Pencegahan & Pengendalian Infeksi) — id dari `PPI_LIST` (`code.gs`), kelas CSS `.ppi` (terpisah dari `.multi` supaya kode bisa membedakan kelompok lewat kelas elemen). 10 item: `VAP, IADP, Plebitis, ISK, IDO, HAP, HAIs, RuamPopokICU (Ruam Popok di ICU), RuamPopokRanap (Ruam Popok di Ruang Rawat), RuamPopokLuarRSSC (Ruam Popok di Luar RSSC)`.
- **DPJP visit** — token tunggal `DpjpVisit14`, kelas CSS `.dpjp14`. Fakta **harian**: boleh terbawa dari shift ke shift dalam **tanggal yang sama** (Pagi→Sore→Malam, cukup dicentang di shift manapun), tapi **wajib reset lintas hari** — lihat §7.1.

**b) Token `Key=Value`** — isian bebas, **selalu ditulis** walau kosong/default (supaya parsing baliknya konsisten — tak perlu menebak apakah field itu "belum diisi" vs "sengaja kosong"). Nilai bebas **wajib disanitasi** sebelum digabung: ganti `;`→`,` (`p5PpiEsc`/`p3AbEsc`, keduanya `String(s||'').replace(/;/g,',')`) — karena `;` adalah pemisah token utama, membiarkannya lolos akan merusak seluruh string kolom I.
- **PPI singkat**: `TindakanOperasi=...` (teks bebas, default kosong), `HasilKultur=...` (teks bebas, default `'0'`), `Suhu=...` (angka, default `'36'`).
- **Antibiotik** — 5 slot, `Antibiotik{1-5}Nama=...` / `Antibiotik{1-5}Freq=...` / `Antibiotik{1-5}Berat=...`. **Nama** = dropdown dari `Lookup!K2:K` (`opsiantibiotik()`, lazy, cache lewat `opsi()`). **Freq** dibakukan **hanya angka 1–10** (`<select>`, bukan teks bebas — tak bisa diisi teks lain). **Berat** (dosis) **teks bebas** (mis. `100 mg`, `200 mg`, `1 gram`) — dosis anak-anak sulit dibakukan ke daftar tetap, jadi cuma jenis antibiotiknya yang dipilih dari daftar baku, dosis & frekuensi bebas/dibatasi manual. **Slot yang Nama-nya kosong TIDAK ditulis sama sekali** (`Antibiotik3Nama=` kosong tidak ditulis ke sheet) — supaya string kolom I tak membengkak percuma & parsing baliknya bersih. Freq/Berat hanya bermakna kalau Nama terisi; parsing balik memprosesnya **atomik per slot** (nama+freq+berat sekaligus dari token slot yang sama) supaya tidak nyasar tertukar antar slot.

**Sumber checklist bersama (1 sumber untuk Page3 & Page5):** `checklistDefsJson()` (`code.gs`) mengembalikan `{alat:[{id,label}], ppi:[{id,label}], antibiotikNama:[...], triggerOverrides:{...}}` dari `ALAT_LIST`/`PPI_LIST`/`Lookup!K`/`ALAT_TRIGGER_OVERRIDES` — dipakai Page3 (`P3_DEFS`, disuntik sekali via `<?!= checklistDefsJson() ?>` saat load, bukan `google.script.run` per klik Edit) dan Page5 (`P5_DEFS`) supaya menambah 1 alat medik/PPI baru cukup ubah `ALAT_LIST`/`PPI_LIST` di satu tempat. `triggerOverrides` dipakai fitur auto-cek dari narasi — lihat §13.

---

## 3. Kolom R (DiagnosisEdited) — ArrayFormula. JANGAN DIHAPUS.

Kolom R diisi **satu ArrayFormula tunggal di header (baris 1 area kolom R)**:
- Mengisi DiagnosisEdited **hanya pada baris PERTAMA tiap pasien** (kemunculan paling awal berdasarkan tanggal kolom B, lalu urutan baris). Baris ke-2 dst dari pasien yang sama → **dikosongkan**.
- Hasil: **1 pasien = tepat 1 baris ber-DiagnosisEdited**.

Formula aktual (disimpan di header kolom R):
```
={"Diagnosis edited";ARRAYFORMULA(
IF(E2:E="","",
IF(
(COUNTIFS(E$2:E,E2:E,B$2:B,"<"&B2:B)
+ COUNTIFS(E$2:E,E2:E,B$2:B,B2:B,ROW(B$2:B),"<"&ROW(B2:B))
)=0,
TRIM(REGEXREPLACE(LOWER(SUBSTITUTE(G2:G,CHAR(10),"; ")),"[^a-z0-9; ]","")),
""
)))}
```

**Dua jebakan penting:**

1. **JEBAKAN — `getLastRow()` menggembung:** ArrayFormula memperluas "tinggi terisi" sheet melampaui jumlah baris data nyata di kolom A. Akibatnya `getLastRow()` lebih besar dari jumlah data; baris terakhir bisa punya kolom A kosong tapi kolom R terisi formula. **Inilah akar bug "nomor 4000-an".** → Lihat §4.

2. **Kolom R adalah kontinuitas "1 pasien 1 hitungan"** untuk statistik. Page8 saat ini **tidak** wajib membaca kolom R (lihat §9), tetapi `refreshPivot()` (opsional) memakainya.

> **ATURAN:** Header ws1 (yang memuat ArrayFormula) tidak boleh dihapus oleh fungsi apa pun. Semua operasi tulis dimulai dari baris 2.

---

## 4. Penomoran Laporan — INTEGRITAS KRUSIAL

Nomor laporan (kolom A) harus **unik**. Karena `getLastRow()` tidak andal (lihat §3), nomor TIDAK BOLEH diturunkan dari posisi baris.

### Aturan wajib
- **Sumber kebenaran nomor = nomor terbesar di kolom A**, dihitung oleh `baristerakhir()`.
- **DILARANG** memakai `getLastRow() - 1` sebagai sumber nomor. `getLastRow()-1` hanya boleh untuk menentukan tinggi range saat membaca/menulis (`getRange(2,1,lr-1,...)`).
- **Nomor entri baru dihasilkan di SERVER**, bukan di browser.

### `baristerakhir()` — max kolom A
```javascript
function baristerakhir() {
  var lr = ws1.getLastRow();
  if(lr < 2) return 0;
  var col = ws1.getRange(2, 1, lr - 1, 1).getValues();
  var maxN = 0;
  for(var i = 0; i < col.length; i++) {
    var v = Number(col[i][0]);
    if(v > maxN) maxN = v;
  }
  return maxN;
}
```

### `_cariRowByNomor_(nomor)`
Membaca kolom A sekaligus, mengembalikan **nomor baris aktual (1-based)** untuk sebuah NOMOR laporan, atau `-1`. Dipakai semua operasi edit/baca-per-nomor (karena posisi baris ≠ nomor laporan).

### Fungsi yang menyentuh nomor — semua lewat `baristerakhir()`
- `getInitialData()` — `total = baristerakhir()`; baris ditemukan via `_cariRowByNomor_(total)`.
- `simpandisheet()` — `nomorBaru = baristerakhir() + 1` (digenerate server saat simpan).

---

## 5. Anti-Duplikat & Penyimpanan Aman (`simpandisheet`) — KRUSIAL

Mencegah dua laporan dengan kombinasi **pasien + tanggal + shift** yang sama, dan mencegah dua baris bernomor sama.

### `simpandisheet(ui)` — kontrak
1. Ambil **`LockService.getScriptLock()`** lalu `tryLock(20000)`. Jika gagal → `{ok:false, alasan:'sibuk'}`. Lepas lock di `finally`.
2. Tentukan baru vs edit dari **`ui.isBaru`** (boolean dari client; jangan andalkan perbandingan nomor).
3. **Entri baru:**
   a. **Batas jam dinas** — jika `ui.tanggal` melebihi `_hariEfektifShift_(ui.dinas)` (jam mulai shift: Pagi 07:00 · Sore 14:00 · Malam 20:00; lihat §11) → tolak: `{ok:false, alasan:'shift_belum', shift:<shift>, hariEfektif:<tgl>}`. Menyubsumsi guard hari operasional lama (tanggal masa depan otomatis tertolak). Benteng server terhadap halaman basi/bypass client.
   b. `cekDuplikatLaporan(pasien, tanggal, shift)` — jika ada → tolak: `{ok:false, alasan:'duplikat', nomor:<existing>}`.
   c. `nomorBaru = baristerakhir() + 1` (server). **Abaikan `ui.nomor`.**
   d. `appendRow` (A–Q) → `{ok:true, nomor:nomorBaru, mode:'baru'}`.
4. **Edit:** cari baris via `_cariRowByNomor_(ui.nomor)`. Tidak ketemu → `{ok:false, alasan:'tidak_ditemukan'}`. Ketemu → `setValues` A–Q → `{ok:true, nomor, mode:'edit'}`.
5. Selalu kembalikan **JSON string**. Bersihkan cache `['p1_data','init_data']`.

Nilai balik yang ditangani client:
`{ok:true,...}` | `{ok:false, alasan:'duplikat', nomor}` | `{ok:false, alasan:'shift_belum', shift, hariEfektif}` | `{ok:false, alasan:'tidak_ditemukan'}` | `{ok:false, alasan:'sibuk'}`.

### `cekDuplikatLaporan(pasien, tanggal, shift)`
Membaca ws1 kolom A–E, mengembalikan `{count, nomor}` (nomor = laporan existing pertama yang cocok).

### Sisi client (page5)
- Kirim `ui.isBaru = (p5Mode==='baru')`.
- Nonaktifkan tombol Simpan selama request (anti klik-ganda).
- Setelah sukses, pakai **nomor final dari server** (`res.nomor`).
- Saat balasan `duplikat` → buka laporan existing (`res.nomor`) dalam **mode lihat**.

---

## 6. Page5 — Tulis/Lihat/Edit Laporan (berbasis pencarian)

Page5 **tidak lagi** memakai navigasi nomor (prev/next/cari nomor). Sebagai gantinya, satu baris pencarian di header "Laporan Dinas / Ruang Goretty":
- **Tanggal** (default = **tanggal operasional**, hari berganti pukul 07:00; `max` = tanggal operasional sehingga laporan baru tak bisa bertanggal melebihinya — lihat §11)
- **Nama Pasien** (dropdown; default berisi pasien hari ini)
- **Shift** (default Pagi)
- Tombol **Buka** dan **+ Laporan Baru**

### Alur
- Memilih/mengubah **nama, shift, atau tanggal** → **satu** panggilan server `getPaketLaporan(nama, tanggal, shift)`.
  - Jika **ada** laporan untuk kombinasi itu → tampilkan dalam **mode lihat**.
  - Jika **belum ada** → masuk **mode input baru** dengan identitas terkunci & prefilled (lihat §7).
- Field tersembunyi `p5nomor` menyimpan nomor laporan yang sedang dibuka (untuk mode edit).

### `getPaketLaporan(nama, tanggal, shift)` — SATU server call
Mengembalikan JSON:
```jsonc
{
  "namaList":   [...],                    // pasien hari ini (ws2) / pasien dgn laporan tgl tsb
  "dataPasien": [...] | null,             // baris ws2 pasien tsb (umur/agama/jaminan/dpjp/bed/...)
  "sebelumnya": { "diagnosis":"", "alatmedik":"", "bed":"" },  // dari 1 shift sebelumnya
  "existing":   [...] | null              // baris laporan existing (nama+tgl+shift) bila ada
}
```
> Tujuan: hindari rentetan server call (dulu: daftar nama → data pasien → cek duplikat → shift sebelumnya). Sekarang **1 call per aksi**.
>
> **Efisiensi IO:** di dalam call itu, `ws2` dibaca **sekali** (A–P → daftar nama hari ini + data pasien) dan `ws1` dibaca **sekali** (A–Q → cek-duplikat + baris existing + shift sebelumnya, via helper murni `_cekDuplikatFrom_`/`_prevShiftDataFrom_`). Dulu 6 pembacaan sheet per call, kini 2. Output identik.

### Field yang dikunci saat membuat laporan BARU (mode baru)
Terkunci (abu-abu, tidak bisa diubah): **Nama, Tanggal, Shift, DPJP, Konsulen Lainnya, Agama, Jaminan, Umur, Hari ke**.
Bisa diisi/diubah: **PJ, PP, Tempat Tidur, Alat Medik, DPJP Visit, PPI (+suhu/hasil kultur/tindakan operasi), Antibiotik, Diagnosis, Isi Laporan**. Semua checkbox/field ini digabung `p5Kumpul()` jadi satu string `ui.alatmedik` (kolom I) — lihat §2.1 untuk format tokennya.

### Mode edit laporan existing (tombol "Perbarui Laporan")
Identitas tetap terkunci; yang bisa diubah: Tempat Tidur, Alat Medik, DPJP Visit, PPI, Antibiotik, Diagnosis, Isi Laporan (`P5_EDIT_EXTRA` di `page5.html`).

### 6.1 Mode berurutan (wizard) — "Mulai Laporan Shift Ini"

Diporting dari proyek Damianus, dipicu dari tombol topbar (§1). Tujuan: bantu petugas membuat laporan baru untuk **semua pasien yang belum dilaporkan** di shift yang sedang buka, satu per satu, berurutan, tanpa harus kembali ke Page1 tiap pasien.

- **`page1.html`** (`p1UpdateWizard`, dipanggil tiap `renderP1`): tentukan shift target = shift **pertama yang buka** (urutan Pagi→Sore→Malam, dari `shiftBuka` yang sama dipakai badge shift kosong, lihat §11) yang **masih ada pasien pending** (belum ada di `sudahAda`). Bisa lebih dari 1 shift buka sekaligus (mis. jam 15:00 Pagi & Sore dua-duanya buka) — makanya diambil yang **masih ada pending**, bukan sekadar shift pertama yang buka. Tombol topbar menampilkan progres (`N/M laporan <shift> selesai`) dan disable bila tak ada target.
- **`mulaiWizard()`**: set `window.WIZ = {active, shift, hariIni, all:[nama,...], pos:0}` lalu `gotoPage('p5', {isNew:true, namaPasien:all[0], shift, hariIni, wizard:true})`. `all` = daftar tetap urutan pasien (tak berkurang saat lewat/simpan, supaya bisa navigasi maju-mundur); `pos` = indeks pasien yang sedang dibuka.
- **`page5.html`** (`p5WizUpdateBadge`/`p5WizGoto`/`p5WizPrev`/`p5WizSkip`/`p5WizAdvance`): badge biru (`.p5wiz`) tampil tiap `initP5` bila `window.WIZ.active`, menonaktifkan bilah pencarian/`+ Laporan Baru` (mencegah user pindah konteks di tengah alur) dan menampilkan progres + tombol Sebelumnya/Lewati/Keluar. Setelah `p5Simpan` sukses (laporan baru) atau server balas `duplikat` (pasien ternyata sudah dilaporkan, mis. oleh staf lain) selagi wizard aktif → otomatis lanjut ke pasien berikutnya (`p5WizAdvance`); di pasien terakhir → wizard selesai, `gotoPage('p1')`.
- **Goretty TIDAK perlu peta `savedNomor` terpisah** (beda dari Damianus): `p5WizGoto(pos)` cukup memanggil `p5Open(nama, hariIni, shift)` biasa — fungsi itu **selalu** cek ulang ke server (`getPaketLaporan`) tiap pindah pasien, jadi laporan yang sudah tersimpan (baik oleh sesi wizard ini atau staf lain) otomatis kebuka di mode lihat, bukan bikin entri baru dobel. Ini penyederhanaan yang dimungkinkan oleh desain `getPaketLaporan` Goretty yang sudah menyatukan cek-existing ke 1 call.
- **Aman-diinterupsi**: queue (`P1_WIZ_TARGET`/`window.WIZ.all`) dihitung ulang dari data server tiap `renderP1`/`mulaiWizard`, bukan disimpan sebagai state persisten — menutup tab/refresh di tengah wizard tidak merusak data, tinggal klik "Mulai Laporan Shift Ini" lagi.

---

## 7. Tempat Tidur, Diagnosis & Alat Medik dari Shift Sebelumnya

Saat membuat laporan **baru**, sistem otomatis mengisi **tempat tidur, diagnosis, dan alat medik** dari **1 shift dinas sebelumnya** untuk pasien yang sama (kontinuitas; tetap bisa diedit).

Urutan shift harian: **Pagi → Sore → Malam**.
- Buat **Sore** → ambil **Pagi** (hari sama)
- Buat **Malam** → ambil **Sore** (hari sama)
- Buat **Pagi** → ambil **Malam** (hari **sebelumnya**)

`_prevShiftDataFrom_(data, nama, tanggal, shift, tz)` (server, versi murni dari data ws1 A–Q yang sudah dibaca) → `{diagnosis, alatmedik, bed}`. Dipanggil di dalam `getPaketLaporan` (field `sebelumnya`), memakai satu pembacaan ws1 yang sama dengan cek-duplikat (`_cekDuplikatFrom_`) — bukan pembacaan sheet terpisah.

Sisi client (page5, `p5SetupBaru`):
- Saat masuk mode baru, form dibersihkan lalu **bed/diagnosis/alat (+PPI/antibiotik/DPJP visit, lihat §7.1) diisi dari shift sebelumnya** (bed dari shift sebelumnya menimpa bed default dari ws2).
- Berlaku di kedua jalur pembuatan baru: dari Page1 (tab baru) dan dari kontrol pencarian Page5.
- **Pengecualian: token `AGD` sengaja dibuang** dari `sb.alatmedik` sebelum checkbox di-restore — lihat §13.

> Wrapper lama `getDiagnosisShiftSebelumnya` sudah dihapus (tak dipakai).

### 7.1 DPJP visit — ikut terbawa seperti alat medik, KECUALI lintas hari

Kolom I (`alatmedik`, §2.1) dibawa **verbatim** dari shift sebelumnya oleh `_prevShiftDataFrom_` — alat medik, PPI, isian singkat, dan antibiotik semuanya otomatis ikut terbawa tanpa logika khusus, sama seperti diagnosis/bed. **DPJP visit (`DpjpVisit14`) adalah satu-satunya pengecualian**, karena ia fakta **harian** (kepatuhan visit DPJP hari itu), bukan sesuatu yang menetap seperti pemakaian alat:

- **Sore←Pagi** dan **Malam←Sore** (shift sebelumnya di **tanggal yang sama**, `prevTgl === tgtTgl`) → token `DpjpVisit14` **ikut terbawa apa adanya** (tidak ada logika khusus, sama seperti alat medik lainnya) — cukup dicentang di shift manapun hari itu, otomatis terbawa ke shift berikutnya hari yang sama.
- **Pagi←Malam kemarin** (shift sebelumnya **tanggal lain**, `prevTgl !== tgtTgl`) → `_prevShiftDataFrom_` **membuang token `DpjpVisit14`** dari string `alatmedik` yang dikembalikan sebelum diteruskan ke client (`alatmedikKeluar.split(';').filter(t => t.trim()!=='DpjpVisit14')`) — laporan Pagi baru selalu mulai dengan DPJP visit **belum tercentang**, walau shift Malam kemarin sudah dicentang.

Ini murni logika **carry-over saat membuat laporan baru** (Page5). Editor inline Page3 (§8) tidak menyentuh logika ini — di sana DPJP visit tiap baris murni dibaca/ditulis apa adanya dari kolom I baris tersebut.

---

## 8. Edit Inline Gabungan dari Page3 — SATU tombol per baris

Page3 punya **satu** pasang tombol Edit/Simpan/Batal per baris laporan (kolom Nomor) yang mengedit **sekaligus**: Diagnosis (G), Isi Laporan (H), **dan** Alat Medik/PPI/Antibiotik/DPJP visit (I, format §2.1). Klik Edit membuka **langsung** ketiga area (kolom Pasien → editor alat/PPI/antibiotik, kolom Diagnosis & Laporan → textarea, kolom DPJP & Konsulen → checkbox DPJP visit) tanpa sub-tombol Edit lain di dalamnya.

**Penempatan DPJP visit disengaja terpisah dari editor Alat Medik/PPI/Antibiotik** — statusnya (badge merah "Belum" / abu-abu "Sudah", **selalu tampil** walau tak sedang diedit) ditampilkan di kolom **DPJP & Konsulen**, bukan digabung ke kolom Pasien, karena secara konsep DPJP visit adalah kepatuhan harian DPJP, bukan bagian dari perangkat/infeksi pasien. Token `DpjpVisit14`-nya tetap tersimpan di string kolom I yang sama (lihat §2.1) — pemisahan ini murni tampilan, checkbox-nya (`p3DpjpEditHtml`) dan checkbox alat/PPI (`p3BuildEditorHtml`) sengaja pakai **id yang sama** (`p3ed-<nomor>-dpjp14`) supaya `p3GatherAlatMedik` bisa mengumpulkannya jadi satu string tanpa peduli di kolom mana elemennya dirender.

### Alur klien (`page3.html`)
- `p3ParseAlat(raw)` — urai string kolom I mentah jadi data terstruktur (`{alatIds, ppiIds, dpjp14, tindakan, kultur, suhu, antibiotik:{1:{Nama,Freq,Berat},...}, extra}`). Token yang tak dikenal (mis. alat lama yang sudah dihapus dari `ALAT_LIST`) disimpan di `extra` dan **selalu ditulis balik** saat Simpan (`p3GatherAlatMedik`) — supaya kolom I yang di-replace-penuh tidak diam-diam kehilangan data lama yang tak lagi dikenali daftar checklist saat ini.
- `p3StartEditRow(nomor)` — bangun editor (`p3BuildEditorHtml`, Alat Medik + PPI + Antibiotik) di kolom Pasien, checkbox DPJP (`p3DpjpEditHtml`) di kolom DPJP & Konsulen, textarea di kolom Diagnosis/Laporan. Tinggi awal textarea = 3× tinggi baris (dikurangi padding), minimal 360px (`.lap-edit-ta` CSS) — sengaja dibuat lebih tinggi dari tinggi baris tampilan karena baris ikut memanjang saat editor Alat Medik/PPI/Antibiotik terbuka; `resize:vertical` tetap aktif untuk penyesuaian manual.
- `p3GatherAlatMedik(nomor)` — kumpulkan SEMUA (checkbox alat medik + DPJP + PPI + isian singkat + antibiotik) jadi **satu string kolom I**, termasuk token `extra` yang dijaga tetap utuh.
- `p3SaveRow(nomor)` — kirim **2 panggilan server** dari **satu** klik Simpan: `updateLaporan(nomor, laporan, diagnosis)` (kolom G/H) dan `updateAlatMedik(nomor, alatMedikBaru)` (kolom I, **replace penuh**, bukan splice sebagian). Aman dari race condition karena keduanya menyentuh kolom **berbeda** (G/H vs I) dan berasal dari klik yang sama — bukan dua aksi user independen yang bisa saling menimpa (itulah yang justru dihindari dengan menggabung SEMUA isi kolom I jadi satu string sebelum dikirim, alih-alih menulisnya lewat 2 panggilan terpisah yang sama-sama menyentuh kolom I). Klien menunggu **kedua** panggilan selesai (`pending` counter) baru merender ulang tampilan & menampilkan toast.
- `p3CancelEditRow(nomor)` — batalkan tanpa menyimpan, kembali ke tampilan ringkas dari data `p3c` (tanpa fetch ulang server).
- `p3AlatViewHtml(rawAlat)` — tampilan ringkas (baca-saja, kolom Pasien) saat baris **tidak** sedang diedit: chip **Alat Medik** (biru) + chip **PPI** (amber, `.chip-ppi`, label lewat `p3LabelFor`+`P3_DEFS`) + baris teks **Suhu / Kultur / Tindakan (jenis operasi) / Antibiotik**. Suhu/Kultur/Tindakan disembunyikan (bukan ditampilkan sebagai default `36`/`0`/kosong) bila token-nya **belum pernah ada** di kolom I mentah (`d.kv.Suhu`/`d.kv.HasilKultur`/`d.kv.TindakanOperasi === undefined`, dari `p3ParseAlat`) — membedakan laporan lama sebelum fitur ini ada dari laporan yang memang sengaja dikosongkan. **Fungsi ini sebelumnya membuang semua token `Key=Value`**, jadi Suhu/Kultur/Tindakan/Antibiotik hanya bisa dilihat lewat editor (klik Edit), tak pernah muncul di tampilan baca-saja Lihat Laporan **maupun** Operan Dinas (Page4, `p4dBuildSeksi`/`p4PpiRowsHtml`, memakai ulang `p3ParseAlat`/`p3LabelFor`/`P3_DEFS` yang sama karena `page3.html` dimuat lebih dulu di `index.html`) — sudah diperbaiki.

### Server
- `updateLaporan(nomor, isiLaporan, diagnosis)` — cari baris via `_cariRowByNomor_`; tulis kolom 8 (H) = isiLaporan; kolom 7 (G) = diagnosis **hanya bila `diagnosis !== undefined && !== null`**. Tanda tangan **3-argumen** wajib dipertahankan (versi lama 2-argumen → diagnosis tidak tersimpan).
- `updateAlatMedik(nomor, alatMedikBaru)` — cari baris via `_cariRowByNomor_`; tulis kolom 9 (I) = `String(alatMedikBaru||'')` (replace penuh). Keduanya membersihkan cache `['p1_data','init_data']` dan selalu mengembalikan JSON string `{ok:true/false, ...}`.
- **1 sumber checklist untuk Page3 & Page5**: `checklistDefsJson()` — lihat §2.1.

---

## 9. Statistik (Page8)

Page8 menghitung **diagnosis & alat medik langsung dari ws1 (Laporan)**, dan metrik pasien dari sheet **Merge**.

### Sumber data
- **Diagnosis & Alat Medik** → langsung dari `ws1` di `getStatistikPage8`:
  - **1 pasien 1 hitungan**: ambil 1 baris per pasien = kemunculan paling awal (tanggal kolom B terkecil).
  - **Date-precise**: filter tahun & rentang berdasarkan tanggal kolom B (bukan agregat bulanan).
  - Diagnosis dicocokkan (substring) terhadap konstanta `DIAGNOSIS_LIST`; alat terhadap `ALAT_LIST` (dukung alias `id|label`).
- **Metrik pasien** (jaminan, DPJP, kondisi pindah, umur, lama rawat, time series pasien baru) → dari sheet **Merge**.
- Cache server per kombinasi `stat8v2_<tahun>_<tm>_<ta>` (±10 menit).

> **Page8 TIDAK bergantung pada sheet Pivot.** Tanpa arsip, perhitungan langsung dari ws1 = lebih andal & presisi tanggal.

### Pivot Indikator Bulanan — `getPivotBulananPage8(tahun)`

Frame di bawah pita filter tahun: **satu pivot tabel** yang merangkum semua indikator dalam satu tampilan.

- **1 server call per tahun** (cache `pivot8_<tahun>` ±10 menit). Hanya bergantung pada **tahun** (bukan filter rentang tanggal di bawahnya).
- **Baris** = penjabaran indikator, dikelompokkan per **seksi berbadge**:
  Pasien Baru · Diagnosis Terbanyak · Alat Medik Terbanyak · DPJP · Jaminan · Cara Keluar · Distribusi Umur · Distribusi Length of Stay (ICU).
- **Kolom** = bulan dalam tahun terpilih (Jan…bulan berjalan untuk tahun ini; Jan–Des untuk tahun lampau). Kolom paling kanan = **Total**.
- **Tiap sel** = `jumlah (persen%)`. **Penyebut persentase = jumlah pasien baru bulan itu** (`pasienBulan[mo]`); kolom Total memakai total pasien setahun. Seksi *Pasien Baru* tampil angka saja (dialah penyebutnya).
- **Sumber data**: diagnosis & alat dari `ws1` (1 pasien 1 hitungan = kemunculan paling awal, sama seperti `getStatistikPage8`); pasien baru, jaminan, DPJP, cara keluar (kolom T `Merge`, idx 19), umur, dan LOS dari sheet **Merge**.
- **Bucket umur** (neonatal–anak): `<28 hari`, `28 hari–<1 th`, `1–<5 th`, `5–<12 th`, `12–<18 th`, `≥18 th` (umur dihitung dari `tgl lahir`→`tgl masuk`).
- **Bucket LOS**: `1–3`, `4–7`, `8–14`, `>14 hari` (dari lama rawat, kolom P `Merge`, idx 15).
- Diagnosis/DPJP/Alat dibatasi 15 baris teratas (urut total menurun); bucket Umur/LOS memakai urutan tetap.
- Frontend (prefiks `p8`): `getPivotBulananPage8` dipanggil di `initP8` & saat ganti tahun (`p8OnYearChange`). Header & kolom "Indikator" sticky.

### Fungsi Pivot (opsional, tidak dipakai Page8)
Masih tersedia di `code.gs` bila ingin sheet Pivot bulanan: `refreshPivot()`, `pulihkanPivot()`, `_tulisSheet_()`, `getPivotStatistik()`, `pasangTriggerMalam()`. Membaca **hanya ws1** (tanpa arsip), menghitung dari baris ber-kolom-R. Konstanta `DIAGNOSIS_LIST` & `ALAT_LIST` dipakai bersama Page8.

`DIAGNOSIS_LIST` (sudah dirapikan & dedupe):
```javascript
var DIAGNOSIS_LIST = [
  'ards','pneumonia','influenza','hiponatremia','peritonitis','post op','ispa',
  'viral infection','hmd','prematur','hiperbilirubin','dhf','ensefalopati',
  'low intake','dss','dehidrasi','hipoglikemia','sepsis','rd','ttn','hipokalemia',
  'ivh','ich','kejang demam','bronchopneumonia','bp','syok','hiperglikemia','demam',
  'hiperpireksia','nkb','hyaline membrane disease','isk','hipoglikemi','gea','dengue',
  'snad','ileus','tutup','respiratory distress','ependimoma','astma','sifilis',
  'pertusis','bronkiolitis','anemia'
];
const ALAT_LIST = [
  'AGD',
  'ArterialLine|Arterial line','BodyWarmer|Body warmer','CAPD','Chemoport','Cimino',
  'CPAP','CRRT','CVC','Defibrilator',
  'Doublelumen|Double lumen HD','Drain','EKG','Facemask','Fototerapi','HFNC','ICON',
  'InfusePump|Infuse pump','IVLine|IV line','KasurDekubitus|Kasur dekubitus','Kateter',
  'Nasalkanul','Nefrostomi','NGT','NIV','Penopang','PICC','SyringePump|Syringe pump',
  'Trakeostomi','TpmPpm|TPM/PPM','Triplelumen|Triple lumen HD','Umbicath','Ventilator','WSD'
];
```
> Pencocokan diagnosis bersifat substring (mis. `rd` bisa cocok dalam `ards`). Bila perlu presisi, ubah ke pencocokan per-kata.
>
> `ALAT_LIST` (dekat `ALAT_TRIGGER_OVERRIDES`, akhir `code.gs`) adalah **1 sumber tunggal** dipakai bersama oleh statistik Page8 **dan** checklist Alat Medik Page3/Page5 (`checklistDefsJson`, `htmlCheckbox()` — `htmlCheckbox()` cuma me-render, tidak menyimpan daftar sendiri) — menambah 1 alat medik baru cukup ubah `ALAT_LIST` di satu tempat itu. `PPI_LIST` (10 item, §2.1) hanya dipakai checklist PPI, **tidak** ikut statistik Page8.

---

## 10. Page9 — Logbook Perawat Goretty (READ-ONLY)

Halaman statistik logbook perawat. **HANYA MEMBACA** spreadsheet eksternal via `SpreadsheetApp.openById` — tidak pernah menulis.

### Sumber data
- Spreadsheet `11pJK2JfLt1Zv1iJN4YFSakGo65Yn4daw2hFm0DXJX1M`.
- Sheet data **`Proses form`**; sheet master **`LookUp`**.
- 8 domain: `["Oksigen","Obat","Cairan","TTV","Dokumen","Kebutuhan","Asuhan","Alat"]`.

### Pemetaan kolom (0-based saat baca A:DC = 107 kolom)
| Konstanta | Idx | Kolom | Isi |
|---|---|---|---|
| `LBG_IDX_TGL` | 16 | Q | Tanggal (sumber bulan/tahun; fallback A) |
| `LBG_IDX_NPK` | 17 | R | NPK (kunci join) |
| `LBG_FLAG_START` | 19 | T | flag domain pertama (8 domain × 5 flag berurutan: `19 + d*5`) |
| `LBG_IDX_NILAI` | 100..104 | CW..DA | Jumlah PK 1..5 (nilai ternormalisasi) |
| (crosscheck) | 99 / 105 | CV / DB | Jumlah Tindakan / Nilai sesuai PK |

`LookUp` dibaca `A2:D` → **NPK=A(1), Nama=B(2), PK=D(4)**.
Target hardcode: `{ I:80, II:80, III:75, IV:80, V:43 }`. PK number: `{ I:1..V:5 }`.

### Fungsi backend (read-only)
- `getInitGoretty()` → `{perawat:[{npk,nama,pk}], tahun:number[]}` — **init 1 round-trip** (gabungan `getDaftarPerawatGoretty` + `getTahunTersediaGoretty`; output identik). Dipakai `initP9`.
- `getDaftarPerawatGoretty()` → `[{npk, nama, pk}]` (urut nama).
- `getTahunTersediaGoretty()` → `number[]` (tahun yang ada datanya).
- `getAgregatTahunGoretty(tahun, force?)` → agregat 1 tahun untuk SEMUA perawat (JSON). Cache server `agg_goretty_<tahun>` **ber-chunk** (TTL 30 menit tahun berjalan / 6 jam tahun lampau).
- `lbGDebugPerawat(npk, tahun)` → rincian per-baris (validasi manual).

### Agregasi (per perawat × bulan)
- `domain[d] = Σ baris Σ_{k=0..4} angka(r[19 + d*5 + k])`; `jumlahTindakan = Σ domain`.
- `nilaiPK[n] = Σ baris angka(r[100+n])` (n=0..4); `totalNilai = Σ nilaiPK`; `nilaiSesuaiPK = nilaiPK[pkNumber-1]`.
- Nilai dikirim sebagai **pecahan**; format `%` di klien (`P9_FACTOR = 100`, 2 desimal koma).

### Frontend (prefiks `p9`)
- **Init 1 server call** (`getInitGoretty` → perawat + tahun) lalu **1 call per tahun** (`getAgregatTahunGoretty`); ganti bulan/perawat di-handle dari cache klien in-memory (tanpa server).
- Filter Perawat/Bulan/Tahun; default Semua perawat + bulan & tahun berjalan.
- Tampilan 1 perawat: kartu ringkasan + tabel 8 domain + tabel 5 PK.
- Tampilan "Semua perawat": tabel rekap (NPK/Nama sticky, scroll horizontal) + **baris RATA-RATA**.

> **Validasi:** cocokkan dengan rekap Goretty (≥3 perawat × 2 bulan). Konfirmasi faktor `×100` (`P9_FACTOR`); bila rekap menampilkan desimal mentah, set `P9_FACTOR = 1`.

---

## 11. Halaman Lain (ringkas)

- **Page1** — daftar pasien hari ini (`getDataPage1`, cache `p1_data` 60 detik). `sudahAda` memetakan `(nama|shift)`→nomor laporan untuk **hari operasional** (lihat di bawah). `shiftBuka` menandai shift yang jam dinasnya belum dimulai → tombol shift kosong dirender **nonaktif** (`.bs-off`); badge bernomor tetap bisa diklik. Klik shift kosong (aktif) → `tulisLaporan()` membuka **tab baru** ke `?p=5&nw=1&nm=&sh=&tg=` (fallback `gotoPage` mode baru). `invalidateP1Cache()`/`refreshP1()` untuk Refresh (tombolnya kini di topbar, §1). `shiftBuka`+`sudahAda`+daftar pasien yang sama juga dipakai `p1UpdateWizard` untuk mode berurutan (§6.1).
- **Page3** — `getLaporan(filter)` (default 3 hari terakhir); `getNamaPasienDalamRentang(tm,ta)`; edit inline via `updateLaporan` (§8); Refresh & Cetak PDF.
  > `getNamaPasienDalamRentang` membaca **500 baris terakhir** ws1 (`startRow = ws1Last - maxRows + 1`), sama seperti `getLaporan` — **bukan** dari baris 2. Versi lama membaca 500 baris dari baris 2 (data tertua), sehingga untuk sheet besar dropdown "Nama Pasien" tak pernah mencapai tanggal terkini → dropdown selalu kosong (hanya "— Semua —").
- **Page4** — `getDataPage4`, `getAllLaporanPasien`, `cariSemuaNamaPasien`; tombol Refresh muat ulang tampilan aktif. Payload "pasien hari ini" (semua pasien, 6 laporan/pasien) di-**cache klien** (`p4dHariData`): ganti pilihan nama di dropdown me-render dari cache **tanpa server call**. Jalur keluar-mode-search & Refresh tetap fetch. Tiap kartu laporan menampilkan chip Alat Medik/PPI + Suhu/Kultur/Tindakan Operasi/Antibiotik (`p4PpiRowsHtml`, lihat §8) — sama seperti kolom Pasien di Page3.
- **Page7** — tabel: `getDaftarDinas(tm,ta)` dari spreadsheet eksternal (filter unit kolom I mengandung "G"); form: `getStafPermintaan()` (dropdown nama, dari LookUp), `submitPermintaan(data)` (append A:G), `listPermintaanByName(nama)` + `cancelPermintaan(row,nama)` (batalkan → G=BATAL). Helper: `_pdFormSheet_`, `_pdParseDate_`, `_pdNameKey_`, `_pdBustCache_`.
- **Page10 (Jadwal Dinas, embed)** — bukan port; hanya **iframe** ke web app Apps Script eksternal "Daftar Dinas IPI" (URL di §Identitas, sama dengan yang di-embed di proyek Damianus). **Tanpa backend.** Frontend prefiks `p10`: `initP10()` men-set `src` iframe **lazy** (hanya saat tab pertama dibuka) + tombol "buka di tab baru ↗" sebagai cadangan bila iframe gagal. **Sengaja embed, bukan port native** (versi sebelumnya matriks native prefiks `jd`/`p10` sudah dibuang) agar kebal terhadap perubahan logika/format sheet di app sumber.
- **Page11 (Jadwal Jaga Anestesi, embed)** — bukan port; hanya **iframe** ke web app Apps Script eksternal (URL di §Identitas). **Tanpa backend.** Frontend prefiks `p11`: `initP11()` men-set `src` iframe **lazy** (hanya saat tab pertama dibuka) + hitung tinggi (`p11Resize`, fit viewport, dipanggil tiap tab dibuka & saat resize) + tombol "↗ Buka di tab baru" sebagai cadangan bila iframe gagal (auth/sandbox). **Sengaja embed, bukan port**, karena mesin proyeksi Rule app anestesi kompleks & mungkin berubah — port akan cepat usang; iframe kebal terhadap perubahan logika di app sumber.

### Hari operasional (pergantian pukul 07:00) — Page1 **dan** Page5

`tanggalOperasional_(tz)`: hari operasional mengacu pada **hari operasional**, bukan tanggal kalender. Hari berganti **pukul 07:00** (zona waktu skrip): sebelum jam 7 → masih dihitung **hari sebelumnya**; mulai 07:00 → tanggal hari ini.
- Contoh: 3 Juni 02:00 → badge Page1 masih milik 2 Juni (laporan kemarin tetap tampil, mis. `#10000 pagi`). 3 Juni 07:00 → badge kosong (siap laporan baru).
- Tanggal operasional ini diteruskan ke Page5 (param URL `tg`) saat membuat laporan baru, dan dipakai untuk label tanggal Page1, agar konsisten dengan cek-duplikat & shift-sebelumnya.
- Implementasi Page1: `getDataPage1()` memakai `tanggalOperasional_(tz)` sebagai `hariIni`; `page1.html` meneruskan `&tg=` ke tab baru (param URL Page5) dan memakainya untuk queue wizard (§6.1) — tidak ada lagi label tanggal operasional terpisah di UI Page1 (dulu `#p1-tgl`, dihapus bersamaan dengan header lokal `.p1h`, lihat §1); tanggal kalender di topbar (`#tbar-tgl`) cukup untuk konteks visual sehari-hari.

**Batas jam dinas laporan baru (Page1 & Page5).** Laporan baru `(tanggal D, shift S)` hanya boleh dibuat **setelah jam mulai S pada hari D**: Pagi **07:00** · Sore **14:00** · Malam **20:00** (`SHIFT_MULAI_JAM`; kelonggaran menit via `SHIFT_TOLERANSI_MENIT`, default 0). Ini batas **bawah** saja — menulis setelah shift lewat tetap boleh (mis. dinas Sore menulis pukul 20:00 diizinkan); **edit laporan lama tidak terpengaruh**. Menyubsumsi batas hari operasional lama: tanggal melebihi hari operasional otomatis tertolak karena jam mulai shift-nya belum tiba.
- **Mekanisme** — `_hariEfektifShift_(shift)`: geser waktu sekarang **mundur sebanyak jam mulai shift** lalu format `yyyy-MM-dd` (tz skrip); laporan boleh bila `D <= hasil`. Tanggal hasil geseran baru "mencapai" D tepat saat shift D dimulai — tz-safe, dan shift Malam yang menembus tengah malam otomatis benar (pola sama dengan `tanggalOperasional_`).
- **Benteng server** — `simpandisheet` menolak entri baru bila `ui.tanggal > _hariEfektifShift_(ui.dinas)` → `{ok:false, alasan:'shift_belum', shift, hariEfektif}` (anti halaman basi/bypass client). Lihat §5.
- **Page1** — `getDataPage1` mengirim `shiftBuka` (`{Pagi,Sore,Malam}` → bool untuk hari operasional). Tombol shift kosong yang `false` dirender nonaktif abu-abu (`.bs-off`, `disabled`, `title="Belum waktunya dinas …"`, tanpa `onclick`); badge bernomor tetap bisa diklik. Ikut cache `p1_data` 60 detik → status bisa telat maks 1 menit tepat di batas jam shift (tombol Refresh menyegarkan).
- **Page5 (mirror UX)** — `P5_SHIFT_MULAI_JAM` + `p5HariEfektifShift(shift)` (samakan dengan server): `p5Open()` memblokir masuk mode baru + **warning** (toast + pesan area) bila tanggal > hari efektif shift; `p5Simpan` menangani alasan `'shift_belum'`.
- **Default & `max` tanggal** tetap dari tanggal operasional: input Tanggal terisi tanggal operasional saat halaman dibuka (bukan `new Date()` browser); `doGet` menyuntik via `initOpsTglJson` → global `OPS_TGL`/`opsTgl()` (index.html, fallback tanggal kalender browser); `p5ApplyMaxTgl()` memasang atribut `max`.
- Tanggal **lampau** tetap boleh (lihat/buat). Halaman lain (Page3/4) memakai tanggal kalender. Jam topbar = jam dinding asli (sengaja tidak diubah).

### Param URL `doGet`
`p` (halaman), `n` (nomor untuk lihat laporan), `nw=1`+`nm`+`sh`+`tg` (buka Page5 mode laporan baru: nama/shift/tanggal-operasional diteruskan). String pengguna disuntik ke JS secara aman lewat JSON (`initNamaJson`, `initShiftJson`, `initTglJson`, `initOpsTglJson`).

### Badge Page1 → Page5 di tab baru (klik instan, tanpa server call berulang)

- **Konsisten buka tab baru.** Baik badge bernomor (`lihatLaporanTab`) maupun badge kosong (`tulisLaporan`) membuka Page5 via `window.open(url+'?p=5&...', '_blank')`, fallback ke `gotoPage` SPA bila URL gagal didapat.
- **Klik instan**: `initP1()` memanggil `p1PrefetchWebAppUrl()` sekali saat Page1 dimuat, menyimpan hasil `getWebAppUrl()` di `P1_WEBAPP_URL`. Helper `p1OpenP5Tab(qs, fallback)` memakai nilai cache itu agar `window.open` terjadi sinkron dengan klik (hindari popup-blocker); bila prefetch belum selesai, fallback satu kali tunggu server.
- **Tidak fetch ulang tanpa alasan**: `gotoPage('p5', params)` di `index.html` hanya memanggil `initP5` bila ada `params` (deep link baru/lihat) **atau** belum pernah dimuat — klik tab "Tulis Laporan" yang kosong tidak memicu server call lagi.
- **Sinkron antar-tab tanpa polling**: setelah simpan sukses di Page5 (`p5Simpan`), klien menulis `localStorage.setItem('ldd_dataChanged', Date.now())`. Tab asal (Page1/3/4) mendengarkan `window.addEventListener('storage', ...)` di `index.html` dan mereset `loaded.p1/p3/p4 = false`, sehingga sekali balik ke tab itu data di-fetch ulang otomatis.

---

## 12. Aturan Apps Script yang WAJIB diikuti

1. **Bulk read/write, bukan loop sel.** Selalu `getValues()` / `setValues()` sekali (loop sel pernah membuat ribuan phantom rows).
2. **Tanggal di server.** Format dengan `Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')`. Browser menerima/mengirim string `yyyy-MM-dd`.
3. **Header & ArrayFormula kolom R tidak boleh dihapus.** Operasi mulai dari baris 2.
4. **Nomor hanya dari `baristerakhir()` (max kolom A).** Tidak pernah dari posisi baris / `getLastRow()-1`.
5. **Penyimpanan via LockService + cek duplikat server + nomor server** (§5).
6. **Operasi per-nomor lewat `_cariRowByNomor_`** (posisi baris ≠ nomor).
7. **Page9 READ-ONLY penuh.** Page7 kini **menulis** ke `Form responses 1` Daftar Dinas: `submitPermintaan` (append baris A:G, staf mengajukan) & `cancelPermintaan` (set G=BATAL, staf membatalkan) — tetap tanpa `insertSheet`/hapus baris. Kolom I (unit) terisi otomatis oleh formula sheet. Page9 tetap read-only penuh.
8. **Minimalkan server call.** Page5 memakai `getPaketLaporan` (1 call/aksi); Page9 1 call/tahun + cache klien.
9. **Kolom I (AlatMedik, §2.1) selalu di-replace PENUH, tidak pernah di-splice sebagian**, dan checkbox-nya **selalu `id===value`**. Menulis kolom I lewat 2 panggilan server independen yang masing-masing hanya tahu sebagian isinya (mis. alat medik lewat 1 call, DPJP lewat call lain) berisiko race condition (baca-ubah-tulis tanpa lock, salah satu menimpa yang lain) — gabungkan semua dulu di klien (`p3GatherAlatMedik`/`p5Kumpul`) jadi satu string sebelum kirim.
10. **Hemat kode top-level.** Statement top-level `code.gs` jalan di **setiap** server call, jadi: `getSheets()` dienumerasi sekali (`_allSheets_`), dan opsi dropdown adalah **fungsi lazy** (`opsiperawat()/opsipasien()/opsitempat()/htmlCheckbox()`) yang hanya dieksekusi saat template `doGet` membutuhkannya (`<?!= opsiperawat() ?>`), bukan precompute `const`.

---

## 13. Auto-cek Alat Medik dari Narasi Laporan (Page5 & Page3)

Staf tidak perlu mencentang checkbox alat medik manual — cukup sebutkan alatnya di teks **Isi Laporan**, checkbox terkait otomatis tercentang saat mengetik.

- **Sumber tunggal pemicu**: `ALAT_LIST` (`code.gs`) — kata pemicu **default** = label checkbox itu sendiri. `ALAT_TRIGGER_OVERRIDES` (`code.gs`, dekat `ALAT_LIST`) — 3 item dengan kata pemicu **beda** dari nama checkbox: `TpmPpm` (kata "TPM"/"PPM"), `Defibrilator` ("Kardioversi"/"DC Syok"/"DC Shock"/"Defib"), `Penopang` ("n-epi"/"amiodaron"/"cordaron"/"dobutamin"/"dopamin" — status pakai obat vasopressor/inotropik). Keduanya dikirim ke client lewat `checklistDefsJson()` (field `triggerOverrides`, §2.1).
- **Regex default dibangun di client** (`p5BuildDefaultAlatRegex`/`p3BuildDefaultAlatRegex`, logika identik di kedua halaman): escape karakter regex, ganti spasi/strip antar kata jadi `[\s-]?` (opsional), bungkus `\bLabel\b`, flag `/i` — jadi "iv line"/"iv-line"/"ivline" semua kena. Menambah 1 alat baru ke `ALAT_LIST` otomatis dapat auto-cek tanpa ubah kode client (kecuali kalau kata pemicunya perlu beda dari labelnya — tambahkan ke `ALAT_TRIGGER_OVERRIDES`).
- **Edge-triggered, sekali per sesi** (`p5AlatFired` di Page5; `p3AlatFired[nomor]` per baris di Page3): begitu kata pemicu **pertama kali muncul** saat mengetik, checkbox dicentang lalu ditandai "sudah terpicu" untuk item itu. Setelah itu:
  - Di-uncheck manual → **tidak dipaksa tercentang lagi** meski kata masih ada di teks.
  - Checkbox yang sudah tercentang → **tidak pernah auto-uncheck** walau kata pemicunya dihapus dari narasi.
  - Flag direset ke **baseline teks** setiap laporan/form dibuka (`p5Render` & `p5Bersih` di Page5; `p3StartEditRow` di Page3) — kata yang **sudah ada sejak awal** dianggap sudah terpicu juga, supaya mengetik teks lain yang tak terkait tidak memicu auto-cek "baru".
- Listener terpasang di event `input` textarea Isi Laporan — realtime saat mengetik, bukan hanya saat Simpan: `#p5laporan` (Page5) dan `#p3-ta-lap-<nomor>` per baris (editor inline Page3, §8).
- **Pengecualian pewarisan shift: hanya AGD.** Alat medik lain (termasuk 3 item override) diwariskan normal ke laporan shift berikutnya (§7) — `p5SetupBaru` sengaja membuang token `AGD` dari `sb.alatmedik` sebelum checkbox di-restore. AGD adalah tes darah sesaat, harus diketik ulang kata "AGD" tiap shift kalau masih relevan; karena Isi Laporan sendiri selalu mulai kosong tiap laporan baru, flag terpicunya otomatis ikut ke baseline kosong juga.
