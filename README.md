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
| `index.html` | Shell SPA: topbar, router antar-halaman, util global (`esc`, `ymd`, `fmtDMY`, `toast`, `loading`, `errH`, `gotoPage`). Menerima param URL `p`, `n`, `nw/nm/sh` (buka Page5). |
| `page1.html` | Daftar pasien hari ini. Klik tombol shift kosong → **buka tab baru** ke Page5 (laporan baru). Klik badge bernomor → buka laporan tsb. |
| `page2.html` | Input/keluar pasien (embed Google Form) |
| `page3.html` | Lihat laporan (tabel, filter, edit inline diagnosis+laporan, tombol Refresh & Cetak PDF) |
| `page4.html` | Operan dinas (kartu per pasien; cari seluruh riwayat; tombol Refresh) |
| `page5.html` | Tulis/lihat/edit laporan (form utama). Pencarian berbasis **tanggal + nama + shift**. |
| `page7.html` | Permintaan dinas (baca spreadsheet eksternal Form responses) |
| `page8.html` | Statistik (diagnosis/alat dari ws1; metrik pasien dari sheet Merge) |
| `page9.html` | **Logbook Perawat Goretty** (baca spreadsheet eksternal, read-only) |

> Tidak ada `page6.html`. Urutan tab: p1, p2, p3, p4, p5, p7, p8, p9.

Setiap halaman di-include ke `index.html` sebagai template dan punya fungsi `initPN(params)` yang dipanggil router (`gotoPage`) saat halaman dibuka.

### Identitas teknis
- **Spreadsheet utama (terikat):** `17PUDkWDfNS_FDvjZVCA9r_mdul-T8uYNSevCWxfYgpk`
- **Spreadsheet eksternal — Permintaan Dinas (Page7):** `1i0lJ8dyeAUXvdEsPIPvMgO5cUfYF5e0LG6h7RLzpwpM`
- **Spreadsheet eksternal — Logbook Perawat Goretty (Page9):** `11pJK2JfLt1Zv1iJN4YFSakGo65Yn4daw2hFm0DXJX1M`

### Sheet di spreadsheet utama
| Variabel / Sheet | gid | Peran |
|---|---|---|
| `ws1` = `getsheetbyid(0)` | 0 | **Laporan** — tabel utama laporan dinas |
| `ws2` = `getsheetbyid(1476005123)` | 1476005123 | **Pasien hari ini** + dokter jaga (sel T2) |
| `ws3` = `getsheetbyid(2028034470)` | 2028034470 | **Lookup** — opsi dropdown (perawat E2:E, pasien I2:I, Bed C2:C) |
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
| 8 | I | AlatMedik | Daftar alat dipisah `;` (mis. `Kateter;Ventilator`) |
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
- `getNomorBaruDanDataPasien()` — preview `nomorBaru = baristerakhir() + 1` (server tetap generate ulang saat simpan).

---

## 5. Anti-Duplikat & Penyimpanan Aman (`simpandisheet`) — KRUSIAL

Mencegah dua laporan dengan kombinasi **pasien + tanggal + shift** yang sama, dan mencegah dua baris bernomor sama.

### `simpandisheet(ui)` — kontrak
1. Ambil **`LockService.getScriptLock()`** lalu `tryLock(20000)`. Jika gagal → `{ok:false, alasan:'sibuk'}`. Lepas lock di `finally`.
2. Tentukan baru vs edit dari **`ui.isBaru`** (boolean dari client; jangan andalkan perbandingan nomor).
3. **Entri baru:**
   a. `cekDuplikatLaporan(pasien, tanggal, shift)` — jika ada → tolak: `{ok:false, alasan:'duplikat', nomor:<existing>}`.
   b. `nomorBaru = baristerakhir() + 1` (server). **Abaikan `ui.nomor`.**
   c. `appendRow` (A–Q) → `{ok:true, nomor:nomorBaru, mode:'baru'}`.
4. **Edit:** cari baris via `_cariRowByNomor_(ui.nomor)`. Tidak ketemu → `{ok:false, alasan:'tidak_ditemukan'}`. Ketemu → `setValues` A–Q → `{ok:true, nomor, mode:'edit'}`.
5. Selalu kembalikan **JSON string**. Bersihkan cache `['p1_data','init_data']`.

Nilai balik yang ditangani client:
`{ok:true,...}` | `{ok:false, alasan:'duplikat', nomor}` | `{ok:false, alasan:'tidak_ditemukan'}` | `{ok:false, alasan:'sibuk'}`.

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
- **Tanggal** (default hari ini)
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

### Field yang dikunci saat membuat laporan BARU (mode baru)
Terkunci (abu-abu, tidak bisa diubah): **Nama, Tanggal, Shift, DPJP, Konsulen Lainnya, Agama, Jaminan, Umur, Hari ke**.
Bisa diisi/diubah: **PJ, PP, Tempat Tidur, Alat Medik, Diagnosis, Isi Laporan**.

### Mode edit laporan existing (tombol "Perbarui Laporan")
Identitas tetap terkunci; yang bisa diubah: Tempat Tidur, Alat Medik, Diagnosis, Isi Laporan.

---

## 7. Tempat Tidur, Diagnosis & Alat Medik dari Shift Sebelumnya

Saat membuat laporan **baru**, sistem otomatis mengisi **tempat tidur, diagnosis, dan alat medik** dari **1 shift dinas sebelumnya** untuk pasien yang sama (kontinuitas; tetap bisa diedit).

Urutan shift harian: **Pagi → Sore → Malam**.
- Buat **Sore** → ambil **Pagi** (hari sama)
- Buat **Malam** → ambil **Sore** (hari sama)
- Buat **Pagi** → ambil **Malam** (hari **sebelumnya**)

`_prevShiftData_(nama, tanggal, shift)` (server) → `{diagnosis, alatmedik, bed}`. Membaca ws1 kolom A–Q (Q=Bed). Dipanggil di dalam `getPaketLaporan`.

Sisi client (page5, `p5SetupBaru`):
- Saat masuk mode baru, form dibersihkan lalu **bed/diagnosis/alat diisi dari shift sebelumnya** (bed dari shift sebelumnya menimpa bed default dari ws2).
- Berlaku di kedua jalur pembuatan baru: dari Page1 (tab baru) dan dari kontrol pencarian Page5.

> `getDiagnosisShiftSebelumnya(nama, tanggal, shift)` masih ada (delegasi ke `_prevShiftData_`, mengembalikan `{diagnosis, alatmedik}`) untuk kompatibilitas.

---

## 8. Update Inline dari Page3 (`updateLaporan`)

Page3 mengedit **diagnosis (kolom G)** dan **isi laporan (kolom H)** secara inline, **keduanya** tersimpan saat klik Simpan. Tinggi textarea diagnosis = isi laporan, mendekati tinggi baris. Ada tombol **Refresh** di kanan tombol "Cetak PDF" (satu baris).

`updateLaporan(nomor, isiLaporan, diagnosis)`:
- Cari baris via `_cariRowByNomor_`; jika tidak ketemu → `{ok:false, alasan:'tidak_ditemukan'}`.
- Tulis kolom 8 (H) = isiLaporan.
- Tulis kolom 7 (G) = diagnosis **hanya bila `diagnosis !== undefined && !== null`**.
- Kembalikan `{ok:true, nomor}`.

> Tanda tangan **3-argumen** wajib dipertahankan (versi lama 2-argumen → diagnosis tidak tersimpan).

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
var ALAT_LIST = [
  'CAPD','Chemoport','Cimino','CPAP','CRRT','CVC',
  'Doublelumen|Double lumen HD','Drain','Facemask','HFNC','ICON','Kateter',
  'Nasalkanul','Nefrostomi','NGT','NIV','PICC',
  'Trakeostomi','Triplelumen|Triple lumen HD','Umbicath','Ventilator','WSD'
];
```
> Pencocokan diagnosis bersifat substring (mis. `rd` bisa cocok dalam `ards`). Bila perlu presisi, ubah ke pencocokan per-kata.

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
- `getDaftarPerawatGoretty()` → `[{npk, nama, pk}]` (urut nama).
- `getTahunTersediaGoretty()` → `number[]` (tahun yang ada datanya).
- `getAgregatTahunGoretty(tahun, force?)` → agregat 1 tahun untuk SEMUA perawat (JSON). Cache server `agg_goretty_<tahun>` **ber-chunk** (TTL 30 menit tahun berjalan / 6 jam tahun lampau).
- `lbGDebugPerawat(npk, tahun)` → rincian per-baris (validasi manual).

### Agregasi (per perawat × bulan)
- `domain[d] = Σ baris Σ_{k=0..4} angka(r[19 + d*5 + k])`; `jumlahTindakan = Σ domain`.
- `nilaiPK[n] = Σ baris angka(r[100+n])` (n=0..4); `totalNilai = Σ nilaiPK`; `nilaiSesuaiPK = nilaiPK[pkNumber-1]`.
- Nilai dikirim sebagai **pecahan**; format `%` di klien (`P9_FACTOR = 100`, 2 desimal koma).

### Frontend (prefiks `p9`)
- **Satu server call per tahun**; ganti bulan/perawat di-handle dari cache klien in-memory (tanpa server).
- Filter Perawat/Bulan/Tahun; default Semua perawat + bulan & tahun berjalan.
- Tampilan 1 perawat: kartu ringkasan + tabel 8 domain + tabel 5 PK.
- Tampilan "Semua perawat": tabel rekap (NPK/Nama sticky, scroll horizontal) + **baris RATA-RATA**.

> **Validasi:** cocokkan dengan rekap Goretty (≥3 perawat × 2 bulan). Konfirmasi faktor `×100` (`P9_FACTOR`); bila rekap menampilkan desimal mentah, set `P9_FACTOR = 1`.

---

## 11. Halaman Lain (ringkas)

- **Page1** — daftar pasien hari ini (`getDataPage1`, cache `p1_data` 60 detik). `sudahAda` memetakan `(nama|shift)`→nomor. Klik shift kosong → `tulisLaporan()` membuka **tab baru** ke `?p=5&nw=1&nm=&sh=` (fallback `gotoPage` mode baru). `invalidateP1Cache()` untuk Refresh.
- **Page3** — `getLaporan(filter)` (default 3 hari terakhir); `getNamaPasienDalamRentang(tm,ta)`; edit inline via `updateLaporan` (§8); Refresh & Cetak PDF.
- **Page4** — `getDataPage4`, `getAllLaporanPasien`, `cariSemuaNamaPasien`; tombol Refresh muat ulang tampilan aktif.
- **Page7** — `getDaftarDinas(tm,ta)` dari spreadsheet eksternal; filter unit kolom I mengandung "G".

### Param URL `doGet`
`p` (halaman), `n` (nomor untuk lihat laporan), `nw=1`+`nm`+`sh` (buka Page5 mode laporan baru, nama/shift diteruskan; nama disuntik aman via `initNamaJson`).

---

## 12. Aturan Apps Script yang WAJIB diikuti

1. **Bulk read/write, bukan loop sel.** Selalu `getValues()` / `setValues()` sekali (loop sel pernah membuat ribuan phantom rows).
2. **Tanggal di server.** Format dengan `Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')`. Browser menerima/mengirim string `yyyy-MM-dd`.
3. **Header & ArrayFormula kolom R tidak boleh dihapus.** Operasi mulai dari baris 2.
4. **Nomor hanya dari `baristerakhir()` (max kolom A).** Tidak pernah dari posisi baris / `getLastRow()-1`.
5. **Penyimpanan via LockService + cek duplikat server + nomor server** (§5).
6. **Operasi per-nomor lewat `_cariRowByNomor_`** (posisi baris ≠ nomor).
7. **Spreadsheet eksternal (Page7, Page9) READ-ONLY.** Tidak ada `setValue`/`appendRow`/`insertSheet` di sana.
8. **Minimalkan server call.** Page5 memakai `getPaketLaporan` (1 call/aksi); Page9 1 call/tahun + cache klien.
