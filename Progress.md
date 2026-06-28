# Progress.md — Catatan Perubahan (Changelog)

Filelog perkembangan webapp **Laporan Dinas Goretty** dari versi awal sampai versi final.
Detail spesifikasi ada di `README.md`; aturan kerja ada di `CLAUDE.md`.
Urutan: lama → baru (atas ke bawah). Hash = commit di `main`.

---

## Versi awal (baseline)

Repo awal: `code.gs` + `index.html` + `page1..page8.html` (tanpa page6), README versi lama.
- Commit pembentuk: `c472d43`/`5bbb3ae`/`a62fb92`/`e69e5c9`/`3593d8f`/`9f2d562`/`716d762` (Create page1..page8), `6b3b9e2` (README awal).
- Masalah yang diketahui pada baseline: penomoran rawan dobel (nomor dari browser + `getLastRow()`), `updateLaporan` 2-argumen (diagnosis tak tersimpan), Page8 belum konsisten, belum ada logbook.

---

## 1. Selaraskan `code.gs` dengan spec integritas data — `a9f710f`

Fokus: **integritas penomoran & penyimpanan** (README §3–§7).
- `baristerakhir()` → **max kolom A** (bukan `getLastRow()-1`). Memperbaiki akar bug "nomor 4000-an" akibat ArrayFormula kolom R menggembungkan `getLastRow()`.
- Tambah `_cariRowByNomor_()` dan `cekDuplikatLaporan()`.
- `simpandisheet()` ditulis ulang: `LockService` + cek duplikat server + `ui.isBaru` + nomor digenerate server + selalu kembalikan **JSON** `{ok:...}`.
- `updateLaporan()` → **3-argumen** `(nomor, isiLaporan, diagnosis)` via `_cariRowByNomor_`.
- `caridata` / `getInitialData` / `getNomorBaruDanDataPasien` → berbasis nomor & `baristerakhir()`, bukan posisi baris.
- Tambah `getDiagnosisShiftSebelumnya()` (ambil diagnosis & alat dari 1 shift sebelumnya).
- Tambah backend Pivot additive (`DIAGNOSIS_LIST` rapi/dedupe, `ALAT_LIST`, `refreshPivot`, `pulihkanPivot`, `getPivotStatistik`, `pasangTriggerMalam`) — **tanpa arsip**.
- Client: `page5` kirim `isBaru` + anti klik-ganda + pakai nomor final server; `page3` edit inline diagnosis+laporan + tombol Refresh.

Keputusan kunci dari user: **tanpa arsip**, **DIAGNOSIS_LIST dirapikan otomatis**.

## 2. Page8 baca sheet Pivot — `099f4e8` (kemudian diubah)

Page8 sempat dimigrasikan untuk membaca sheet `Pivot Diagnosis`/`Pivot Alat Medik`. Ternyata data tidak muncul → diganti di iterasi berikutnya.

## 3. Perbaikan Page1/4/5/8 sesuai umpan balik — `c659cfb`

- **Page8**: hitung diagnosis & alat medik **langsung dari `ws1`** (1 pasien 1 hitungan = baris pertama per pasien, **date-precise**), tidak lagi bergantung sheet Pivot. Cache key dinaikkan ke `stat8v2_`. Metrik pasien tetap dari sheet `Merge`.
- **Page5**: navigasi nomor diganti **pencarian tanggal + nama + shift** (default hari ini / pasien hari ini / Pagi). Mode "Laporan Baru" mengunci identitas; duplikat saat simpan → buka laporan existing (mode lihat).
- **Page4**: tombol **Refresh** di kanan Cetak PDF.
- Tambah `getPasienHariIniNames`, `getLaporanByTNS`.

## 4. Page1: perbaiki klik tombol shift — `98d8bc1`

- Bug: `onclick` memakai `JSON.stringify` (kutip ganda merusak atribut) → klik tak berfungsi. Diperbaiki via `p1JsArg` (literal JS aman).
- Klik shift kosong → **buka tab baru** ke Page5 (mode laporan baru, nama/tanggal/shift terisi). `doGet` menerima param `nw/nm/sh`; `index.html` merutekan.

## 5. Tambah Page9: Logbook Perawat Goretty — `2cb9b2f`

- Halaman statistik logbook perawat, **read-only** dari spreadsheet eksternal `11pJK2…`.
- Backend `code.gs`: `getDaftarPerawatGoretty`, `getTahunTersediaGoretty`, `getAgregatTahunGoretty` (cache `agg_goretty_` ber-chunk), `lbGDebugPerawat` + konstanta `LBG_*` (8 domain, join NPK→LookUp A/B/D, nilai PK kolom CW–DA, baca A:DC).
- Frontend `page9.html` (prefiks `p9`): filter Perawat/Bulan/Tahun, 1 call/tahun + cache klien, tabel rekap + baris RATA-RATA. Integrasi tab di `index.html`.
- Catatan validasi: faktor `×100` (`P9_FACTOR`) harus dicek user terhadap rekap nyata.

## 6. Page5: satu server call per aksi + bed ikut shift sebelumnya — `bf2ccf8`

- Tambah `getPaketLaporan(nama, tanggal, shift)`: **SATU** panggilan mengembalikan daftar nama + data pasien + data shift sebelumnya (diagnosis/alat/**bed**) + laporan existing. Mengganti rentetan beberapa call.
- `_prevShiftData_` kini juga mengembalikan **bed** (kolom Q).
- Setiap nama terisi → tempat tidur, diagnosis, alat medik otomatis ikut shift sebelumnya.

## 7. Perbarui tech spec README — `7388126`

README diselaraskan dengan implementasi: tanpa arsip, Page5 berbasis pencarian, Page8 langsung dari ws1, Page9 logbook, `getPaketLaporan`, bed shift sebelumnya, aturan Apps Script.

## 8. Page1: hari operasional berganti pukul 07:00 — `d3c6fd6`

- `tanggalOperasional_(tz)`: badge nomor laporan Page1 mengacu **hari operasional**; sebelum pukul 07:00 = hari sebelumnya, mulai 07:00 = hari ini. Contoh: 3 Juni 02:00 masih menampilkan badge 2 Juni; 3 Juni 07:00 badge kosong.
- Tanggal operasional diteruskan ke Page5 (param URL `tg`); label tanggal Page1 mengikuti.

## 9. Dokumentasi final: lengkapi README + tambah `CLAUDE.md` — `3c2701d`

- README §11: dokumentasi hari operasional 07:00 + param `doGet` `tg` + injeksi string aman via JSON.
- **`CLAUDE.md` baru**: panduan kerja (bentuk proyek Apps Script, cara cek sintaks, invariant wajib, konvensi, jejak bug, alur git) — pelengkap README agar repo bisa dibangun ulang.

## 10. Page8: Pivot Indikator Bulanan

- Backend baru `getPivotBulananPage8(tahun)` (**1 call/tahun**, cache `pivot8_<tahun>` ±10 menit): merangkum 8 indikator per bulan dalam tahun terpilih.
- Frame baru di Page8 di bawah pita filter tahun: **satu pivot tabel** — baris = penjabaran indikator (seksi berbadge: Pasien Baru, Diagnosis, Alat Medik, DPJP, Jaminan, Cara Keluar, Distribusi Umur, Distribusi LOS); kolom = bulan (Jan…bulan berjalan / Jan–Des untuk tahun lampau) + kolom Total kanan.
- Tiap sel `jumlah (persen%)`; **penyebut % = jumlah pasien baru bulan itu**, Total memakai total setahun.
- Sumber: diagnosis & alat dari `ws1` (1 pasien 1 hitungan); pasien baru/jaminan/DPJP/cara keluar/umur/LOS dari `Merge`.
- Keputusan user: bucket umur neonatal–anak (`<28 hari … ≥18 th`), bucket LOS (`1–3/4–7/8–14/>14 hari`), penyebut % = pasien baru bulan itu.
- Catatan repo: `Code.js` (duplikat `code.gs`) dihapus agar `clasp push` tak bentrok; `code.gs` = sumber tunggal.

## 11. Page5: batas tanggal laporan baru ikut hari operasional (07:00)

- **Default** input Tanggal Page5 = **tanggal operasional** (`tanggalOperasional_`, hari berganti pukul 07:00), bukan tanggal kalender browser.
- **Batas atas**: laporan baru tak boleh bertanggal melebihi tanggal operasional. Contoh: 22 Juni pukul 06:00 → maksimal tanggal 21 Juni; setelah 07:00 → 22 Juni boleh.
- Server (`doGet`) menyuntik tanggal operasional via `initOpsTglJson` → global `OPS_TGL`/`opsTgl()` (index.html). Page5 memasang atribut `max` (`p5ApplyMaxTgl`) dan memblokir mode baru + **warning** (toast) bila tanggal > operasional (`p5Open`).
- Benteng server: `simpandisheet` menolak entri baru bertanggal melebihi operasional → `{ok:false, alasan:'belum_waktunya', opsTgl}` (anti halaman basi melewati 07:00 / bypass).
- Tanggal lampau tetap boleh untuk lihat/buat.

## 12. Page1/Page5: tab baru instan + sinkron tanpa polling

- Guard re-init Page5 di `index.html`: `gotoPage('p5', params)` hanya memanggil `initP5` bila ada `params` atau belum pernah dimuat — klik tab "Tulis Laporan" kosong tak lagi memicu server call berulang.
- Sinkron antar-tab tanpa polling: `p5Simpan()` menulis `localStorage.setItem('ldd_dataChanged', ...)` setelah simpan sukses; `index.html` mendengarkan event `storage` dan mereset `loaded.p1/p3/p4` agar tab Page1/3/4 fetch ulang sekali saat dibuka kembali.
- Klik badge instan: `initP1()` memanggil `p1PrefetchWebAppUrl()` sekali (cache di `P1_WEBAPP_URL`); helper `p1OpenP5Tab()` dipakai oleh `lihatLaporanTab`/`tulisLaporan` agar `window.open` terjadi sinkron dengan klik (bukan menunggu `getWebAppUrl()` setiap kali), dengan fallback satu kali tunggu bila prefetch belum selesai.

## 13. Optimasi load & efisiensi (tanpa ubah logika)

Penghematan murni performa; perilaku & output identik.
- **`code.gs` top-level**: `getsheetbyid` kini memakai hasil `getSheets()` **1×** per eksekusi (dulu 3×). `opsiperawat/opsipasien/opsitempat/htmlCheckbox` diubah dari `const` precompute menjadi **fungsi lazy** — sheet Lookup tak lagi dibaca pada server call data (Page1/Page8/dll), hanya saat render template page3/page5 di `doGet`.
- **Template**: `<?!=opsiperawat?>` → `<?!= opsiperawat() ?>` (juga `opsipasien/opsitempat/htmlCheckbox`) di `page3.html` & `page5.html`.
- **Chart.js** (`page8.html`) jadi `<script defer>` → tak lagi memblokir parsing load awal bagi pengguna yang tak membuka Statistik.
- **`index.html`**: tambah `preconnect` ke `fonts.gstatic.com` (host file font).
- **Hapus kode/file mati**: var `ws3` + fungsi `umuragamajaminan`, `getNomorBaruDanDataPasien`, `getDiagnosisShiftSebelumnya` (sudah digantikan `getPaketLaporan`); file `laporan.html` & `page9.html.html` (tak di-`include` di mana pun). `clasp push` kini 11 file.

---

## Ringkasan keputusan penting (sticky)

- **Tanpa arsip** — semua data di `ws1`.
- **Nomor laporan** = `baristerakhir()` (max kolom A) + LockService + cek duplikat server.
- **Page5** = pencarian tanggal+nama+shift, `getPaketLaporan` (1 call/aksi), identitas terkunci saat baru, bed/diagnosis/alat ikut shift sebelumnya.
- **Page8** = diagnosis/alat langsung dari `ws1` (date-precise), metrik pasien dari `Merge`; sheet Pivot opsional. **Pivot indikator bulanan** via `getPivotBulananPage8` (1 call/tahun).
- **Page9** = logbook perawat, read-only dari spreadsheet eksternal.
- **Hari operasional** berganti pukul **07:00** (Page1 badge **dan** batas/Default tanggal laporan baru Page5).
- **Spreadsheet eksternal (Page7, Page9) READ-ONLY.**
