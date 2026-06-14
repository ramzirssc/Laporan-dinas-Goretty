# CLAUDE.md — Panduan Kerja Repo "Laporan Dinas Goretty"

Panduan operasional untuk AI/pengembang yang mengubah repo ini.
**Baca `README.md` lebih dulu** untuk spesifikasi domain (struktur kolom, aturan bisnis, identitas spreadsheet). File ini berisi *cara bekerja dengan aman di sini*.

---

## 1. Bentuk proyek (PENTING)

- Ini **Google Apps Script web app** (HtmlService), bukan Node/web biasa.
- `code.gs` = backend Apps Script (server). `index.html` = shell SPA; `pageN.html` = template halaman yang di-`include` ke `index.html`. Tidak ada bundler, tidak ada `package.json`.
- **Tidak bisa dijalankan/di-deploy dari lingkungan ini.** Deploy dilakukan user di editor Apps Script (atau clasp). Jangan klaim "sudah dijalankan/diuji di server".
- `code.gs` mengeksekusi kode **top-level** saat load (mis. `const ws1 = getsheetbyid(0)`, `opsi("E2:E")` yang membaca sheet). Jadi `code.gs` **tidak bisa di-`node`-jalankan**, hanya bisa dicek sintaks.

## 2. Cara verifikasi perubahan (WAJIB sebelum commit)

Tidak ada test otomatis. Minimal lakukan cek sintaks:

```bash
# code.gs (Apps Script = JS) — cek sintaks saja
cp code.gs /tmp/c.js && node --check /tmp/c.js && echo OK

# Blok <script> di file HTML (di luar script ada template tag <?!= ?> / <?= ?>,
# jadi cek HANYA isi <script> terakhir):
node -e "const s=require('fs').readFileSync('page5.html','utf8');\
const m=s.lastIndexOf('<script>'),e=s.lastIndexOf('</script>');\
require('vm').compileFunction(s.slice(m+8,e));console.log('ok')"
```

Validasi angka (Page8/Page9) hanya bisa dilakukan user terhadap data nyata — sampaikan apa yang perlu mereka cek, jangan mengaku sudah memvalidasi.

## 3. Invariant yang TIDAK BOLEH dilanggar

(Detail & alasan ada di `README.md` §3–§5, §12. Ini versi ringkas wajib-ingat.)

1. **Nomor laporan hanya dari `baristerakhir()`** (= max kolom A). **JANGAN** `getLastRow()-1` sebagai nomor — ArrayFormula kolom R menggembungkan `getLastRow()` (akar bug "nomor 4000-an"). `getLastRow()-1` hanya untuk tinggi range saat baca/tulis.
2. **Operasi per-nomor lewat `_cariRowByNomor_(nomor)`** — posisi baris ≠ nomor laporan.
3. **Header & ArrayFormula kolom R (idx 17) jangan dihapus/ditimpa.** Semua tulis mulai baris 2. Tulis data laporan = **17 kolom A–Q** saja.
4. **Simpan via `simpandisheet`**: `LockService` + `cekDuplikatLaporan` + nomor digenerate server + `ui.isBaru`. Selalu kembalikan **JSON string** `{ok:...}`. Lihat README §5.
5. **Bulk IO**: selalu `getValues()`/`setValues()` sekali; **jangan** `getValue`/`setValue` dalam loop (pernah membuat ribuan phantom rows).
6. **Tanggal diformat di server** via `Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd')`. Browser kirim/terima string `yyyy-MM-dd`. Jangan andalkan `new Date()` di browser untuk logika tanggal.
7. **Spreadsheet eksternal (Page7 `getDaftarDinas`, Page9 `*Goretty`) READ-ONLY.** Tidak ada `setValue`/`appendRow`/`insertSheet` di sana.
8. **Tanpa arsip.** Tidak ada `ARSIP_FILE_ID`, tidak ada fungsi pengarsipan. Semua data di `ws1`.

## 4. Konvensi kode

- **Fungsi server yang dipanggil client mengembalikan JSON string** (`JSON.stringify(...)`), lalu `JSON.parse` di client. Tangani error → `{ok:false, alasan:'...'}` atau field `_err`.
- **Minimalkan server call.** Page5 memakai `getPaketLaporan` (1 call/aksi: daftar nama + data pasien + shift sebelumnya + cek existing). Page9 = 1 call/tahun + cache klien in-memory. Jangan tambah rentetan `google.script.run` untuk satu interaksi.
- **Cache**: server `CacheService` (`p1_data` 60s, `stat8v2_*` ~10m, `agg_goretty_*` 30m/6j ber-chunk). Setelah menulis ws1, bersihkan `['p1_data','init_data']`. Bump nama key (mis. `stat8v2_`) bila format payload berubah agar cache lama tak menyesatkan.
- **Menyuntik string user ke JS** (template `doGet`): pakai `JSON.stringify` di server + `<?!= initXxxJson ?>` di HTML (bukan `<?= ?>` yang hanya escape HTML). Lihat `initNamaJson`/`initShiftJson`/`initTglJson`.
- **String ke dalam atribut `onclick="..."`**: jangan `JSON.stringify` (kutip ganda merusak atribut). Pakai pola `p1JsArg()` di `page1.html` (literal JS berkutip tunggal + escape HTML).
- **Gaya**: ikuti gaya berkas sekitar (var ES5, fungsi pendek, prefiks per-halaman: CSS `pN-`, JS `pN…`). Halaman baru: salin pola halaman sejenis lalu ganti seluruh prefiks + daftarkan di `index.html` (tab button, `<div id="pN">`, `loaded`, `PAGE_IDS`, `gotoPage`).

## 5. Jejak bug yang JANGAN diulang

- **Nomor dobel / 4000-an** → karena nomor dari browser & dari `getLastRow()`. Sudah diperbaiki: nomor dari `baristerakhir()` + LockService + cek duplikat server.
- **Phantom rows ribuan** → loop `setValue` per sel. Gunakan bulk IO.
- **Diagnosis tak tersimpan dari Page3** → `updateLaporan` dulu 2-argumen. Pertahankan **3-argumen** `(nomor, isiLaporan, diagnosis)`; tulis diagnosis hanya bila `!== undefined && !== null`.
- **Tombol shift Page1 tak berfungsi** → `JSON.stringify` di dalam `onclick`. Pakai `p1JsArg`.
- **Page8 kosong** → dulu baca sheet Pivot. Sekarang hitung langsung dari `ws1` (1 pasien 1 hitungan via baris pertama per pasien, date-precise).

## 6. Hal khas yang mudah terlewat

- **Hari operasional Page1 berganti pukul 07:00** (`tanggalOperasional_`): sebelum jam 7 = hari sebelumnya. Tanggal ini diteruskan ke Page5 lewat param URL `tg`. Lihat README §11.
- **Shift sebelumnya** (Pagi←Malam-kemarin, Sore←Pagi, Malam←Sore) mengisi **bed + diagnosis + alat** saat laporan baru (`_prevShiftData_`).
- **Page5 berbasis pencarian tanggal+nama+shift**, bukan navigasi nomor. Identitas dikunci saat mode baru; duplikat saat simpan → buka laporan existing (mode lihat).
- **`htmlCheckbox` / `opsi*`** dirender server-side sebagai string HTML lalu disisipkan via `<?!= … ?>`. ID checkbox alat = bagian sebelum `|` pada `ALAT_LIST` (mis. `Doublelumen`).

## 7. Alur kerja git

- Kerjakan di branch fitur; jangan push ke `main` tanpa diminta eksplisit.
- Commit kecil & deskriptif (Bahasa Indonesia, konsisten dengan riwayat).
- **Jangan** menaruh ID model / rahasia di commit, kode, atau dokumen.
- Setelah mengubah `code.gs`/HTML, jalankan cek sintaks (§2) sebelum commit.
