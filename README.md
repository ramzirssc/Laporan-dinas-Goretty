# Laporan-Dinas-Goretty
Buku untuk membuat laporan dinas Goretty sekaligus statistik
# Technical Specification — Laporan Dinas Goretty

Webapp pencatatan laporan dinas & operan pasien untuk unit ICU "Goretty", RS St. Carolus.
Backend: Google Apps Script. Penyimpanan: Google Sheets. Frontend: HTML/CSS/JS via `HtmlService`.

Dokumen ini untuk pengembang/Claude Code yang akan memelihara atau mengembangkan sistem.
Tujuan utama sistem: pencatatan untuk **audit, surveilans, penelitian, dan statistik** (harian/bulanan/tahunan). Karena itu **integritas data adalah prioritas tertinggi**, khususnya keunikan nomor laporan.

---

## 1. Arsitektur & Berkas

| Berkas | Peran |
|---|---|
| `code.gs` | Seluruh logika server (Apps Script) |
| `index.html` | Shell SPA: topbar, router antar-halaman, util global (`esc`, `ymd`, `fmtDMY`, `toast`, `loading`, `errH`, `gotoPage`) |
| `page1.html` | Daftar pasien hari ini; klik shift → buat laporan baru, jika shift sudah ada nomor laporan jika diklik --> buka laporan tersebut |
| `page2.html` | Input/keluar pasien |
| `page3.html` | Lihat laporan (tabel, filter, edit inline diagnosis+laporan, cetak) |
| `page4.html` | Operan dinas (kartu per pasien; cari seluruh riwayat termasuk arsip) |
| `page5.html` | Tulis/edit laporan (form utama) |
Tidak ada page6.html
| `page7.html` | Permintaan dinas (baca spreadsheet eksternal Form responses) |
| `page8.html` | Statistik (baca sheet Pivot) |

Halaman dimuat sebagai template lalu di-include ke `index.html`. Setiap halaman punya fungsi `initPN(params)` yang dipanggil router saat halaman dibuka.

### Identitas teknis
- **Spreadsheet utama (terikat):** `17PUDkWDfNS_FDvjZVCA9r_mdul-T8uYNSevCWxfYgpk`
- **Spreadsheet eksternal (Permintaan Dinas):** `1i0lJ8dyeAUXvdEsPIPvMgO5cUfYF5e0LG6h7RLzpwpM`
- **Email notifikasi arsip:** `ramzi.rssc@gmail.com`

### Sheet di spreadsheet utama
| Sheet | gid | Peran |
|---|---|---|

const ws1 = getsheetbyid(0);           // Laporan | Tabel utama laporan dinas |
const ws2 = getsheetbyid(1476005123);  // Pasien hari ini Pasien hari ini + dokter jaga (sel T2) |
const ws3 = getsheetbyid(2028034470);  // Lookup Opsi dropdown (perawat E2:E, pasien I2:I, Bed di Goretty C2:C) |
const Merge = getsheetbyid(463136828); // Indeks pasien permanen (master). **TIDAK pernah diarsip/dihapus.** Sumber statistik Page8. |
cost Pivot Diagnosis =getsheetbyid(311832308); // Agregasi bulanan diagnosis (dihasilkan `refreshPivot`) |
const Pivot Alat Medik =getsheetbyid(263609631); // Agregasi bulanan alat medik (dihasilkan `refreshPivot`) |


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


Operasi tulis data laporan menyentuh **17 kolom (A–Q)**. Kolom R diisi formula otomatis; 

---

## 3. Kolom R (DiagnosisEdited) — ArrayFormula. JANGAN DIHAPUS.

Kolom R diisi **satu ArrayFormula tunggal yang diletakkan di header (baris 1 area kolom R)**. Formula ini:
- Mengisi DiagnosisEdited **hanya pada baris PERTAMA tiap pasien** (kemunculan paling awal berdasarkan tanggal kolom B, lalu urutan baris). Baris ke-2 dst dari pasien yang sama → **dikosongkan**.
- Hasilnya: **1 pasien = tepat 1 baris ber-DiagnosisEdited**, walau pasien punya puluhan laporan.

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

**Konsekuensi penting (dan dua jebakan yang sudah menyebabkan bug):**

1. **Statistik "1 pasien 1 hitungan":** Menghitung baris ber-DiagnosisEdited = otomatis menghitung per pasien unik. Tidak perlu de-duplikasi tambahan. Statistik diagnosis **dan** alat medik keduanya dihitung hanya dari baris yang kolom R-nya terisi.

2. **JEBAKAN — `getLastRow()` menggembung:** ArrayFormula memperluas "tinggi terisi" sheet melampaui jumlah baris data nyata di kolom A. Akibatnya `getLastRow()` lebih besar dari jumlah data; baris terakhir bisa punya kolom A kosong tapi kolom R terisi formula. **Inilah akar bug "nomor 4000an".** → Lihat §5.


> **ATURAN:** Header ws1 (yang memuat ArrayFormula) tidak boleh dihapus oleh fungsi apa pun. Semua operasi tulis dimulai dari baris 2.

---

## 4. Penomoran Laporan — INTEGRITAS KRUSIAL

Nomor laporan (kolom A) harus **unik dan tahan terhadap penghapusan arsip**. Setelah arsip menghapus baris, posisi baris ≠ nomor, jadi nomor TIDAK BOLEH diturunkan dari posisi baris.

### Aturan wajib
- **Sumber kebenaran nomor = nomor terbesar di kolom A**, dihitung oleh `baristerakhir()`.
- **DILARANG** memakai `getLastRow() - 1` sebagai sumber nomor (lihat jebakan §3.2). `getLastRow()-1` hanya boleh untuk menentukan tinggi range saat **membaca/menulis** (`getRange(2,1,lr-1,...)`).
- **Nomor entri baru dihasilkan di SERVER**, bukan di browser. Browser hanya menampilkan preview; server menentukan nomor final saat menyimpan.

### `baristerakhir()` — implementasi yang benar
```javascript
function baristerakhir() {
  var lr = ws1.getLastRow();
  if(lr < 2) return 0;
  var col = ws1.getRange(2, 1, lr - 1, 1).getValues(); // baca kolom A sekaligus
  var maxN = 0;
  for(var i = 0; i < col.length; i++) {
    var v = Number(col[i][0]);
    if(v > maxN) maxN = v;
  }
  return maxN;
}
```
Fungsi ini tahan terhadap (a) ArrayFormula yang menggembungkan `getLastRow()`, dan (b) baris kosong tersisa di bawah.

### Fungsi lain yang menyentuh nomor — semua HARUS lewat `baristerakhir()`
- `getInitialData()` — `total = baristerakhir()` (BUKAN `getLastRow()-1`).
- `getNomorBaruDanDataPasien()` — preview `nomorBaru = baristerakhir() + 1` (hanya untuk tampilan; server tetap generate ulang saat simpan).

---

## 5. Anti-Duplikat & Penyimpanan Aman (`simpandisheet`) — KRUSIAL
Metode pencarian dengan metode tanggal (by default tanggal hari ini), nama pasien, dan shift (by default pagi), sekali servercall saat load webapp, selama tanggal tidak diubah, maka sambil se mua laporan pada tanggal tersebut)
Mencegah dua laporan dengan kombinasi **pasien + tanggal + shift** yang sama (dan mencegah dua baris bernomor sama). Ini penting untuk de-duplikasi arsip dan keandalan statistik.

### Penyebab bug "laporan dobel" (sudah diperbaiki)
Nomor dulu dibuat di browser dan dipercaya server tanpa penguncian/cek. Klik ganda atau dua window bersamaan → dua `appendRow` dengan nomor sama.

### `simpandisheet(ui)` — kontrak yang WAJIB dipertahankan
1. Ambil **`LockService.getScriptLock()`** dan `waitLock(20000)` — serialize semua penyimpanan. Lepas lock di `finally`.
2. Tentukan baru vs edit dari **`ui.isBaru`** (boolean dari client; jangan andalkan perbandingan nomor).
3. **Entri baru:**
   a. `cekDuplikatLaporan(pasien, tanggal, shift)` — kalau >0 → tolak, kembalikan `{ok:false, alasan:'duplikat', nomor:<existing>}`.
   b. Generate `nomorBaru = baristerakhir() + 1` (server). **Abaikan `ui.nomor`.**
   c. `appendRow` (A–Q), kembalikan `{ok:true, nomor:nomorBaru, mode:'baru'}`.
4. **Edit:** cari baris via `_cariRowByNomor_(ui.nomor)`. Jika tidak ketemu → `{ok:false, alasan:'tidak_ditemukan'}` (jangan buat baris baru). Jika ketemu → `setValues` A–Q, kembalikan `{ok:true, nomor, mode:'edit'}`.
5. Selalu kembalikan **JSON string**. Bersihkan cache `['p1_data','init_data']`.

Nilai balik yang harus ditangani client:
`{ok:true,...}` | `{ok:false, alasan:'duplikat', nomor}` | `{ok:false, alasan:'tidak_ditemukan'}` | `{ok:false, alasan:'sibuk'}`.

### Sisi client (page5)
- Kirim `ui.isBaru = (p5Mode==='baru')`.
- Nonaktifkan tombol Simpan selama request (anti klik-ganda), aktifkan kembali di success/failure.
- Setelah sukses, pakai **nomor final dari server** (`res.nomor`) untuk update tampilan — jangan pakai nomor preview.

### `_cariRowByNomor_(nomor)`
Membaca kolom A sekaligus, mengembalikan nomor baris aktual (1-based) untuk nomor tsb, atau -1. Dipakai semua operasi edit/baca-per-nomor (karena posisi ≠ nomor setelah arsip).

---

## 6. Update Inline dari Page3 (`updateLaporan`)

ada tombol refresh terletak sebelah kanan tombol "Cetak PDF", tetap satu baris. 
Kolomg Diagnosis dan kolom isi laporan bisa diedit, jika user klik tombol edit, dan keduanya harus bisa disave, jika user klik simpan, bukan hanya salah satu yang disimpan. Ukuran textbox nya hampir setinggi baris pasien tersebut, dan tinggi kolom diagnosis dan isi laporan adalah sama. 

Page3 mengedit **diagnosis (kolom G)** dan **isi laporan (kolom H)** secara inline.

`updateLaporan(nomor, isiLaporan, diagnosis)`:
- Cari baris via `_cariRowByNomor_`.
- Tulis kolom 8 (H) = isiLaporan.
- Tulis kolom 7 (G) = diagnosis **hanya bila `diagnosis !== undefined && !== null`** (agar pemanggil yang tidak mengubah diagnosis tidak menimpa).

> Bug historis: versi lama hanya menerima 2 argumen → diagnosis tidak tersimpan. Pertahankan tanda tangan 3-argumen.

---

## 7. Diagnosis & Alat Medik dari Shift Sebelumnya

Saat membuat laporan **baru**, sistem otomatis mengambil diagnosis & alat medik dari **1 shift dinas sebelumnya** untuk pasien yang sama (membantu kontinuitas; tetap bisa diedit).

Urutan shift harian: **Pagi → Sore → Malam**.
- Buat **Sore** → ambil **Pagi** (hari sama)
- Buat **Malam** → ambil **Sore** (hari sama)
- Buat **Pagi** → ambil **Malam** (hari **sebelumnya**)

`getDiagnosisShiftSebelumnya(nama, tanggal, shift)` → JSON `{diagnosis, alatmedik}` (string; `alatmedik` dipisah `;`). Baca ws1 kolom A–I.

Sisi client (page5, `p5AmbilDiagnosisSebelumnya`):
- Isi textarea diagnosis **hanya jika kosong** (jangan timpa ketikan user).
- Centang checkbox alat medik **hanya jika belum ada yang tercentang**, dan hanya checkbox yang tidak `disabled`.
- Dipanggil di kedua jalur pembuatan baru: dari Page1 (params) dan dari tombol "+ Laporan Baru" di Page5 (setelah identitas terkunci).

---

## 8. Statistik (Page8) & Pivot

Page8 membaca **sheet Pivot Diagnosis & Pivot Alat Medik** (bukan menghitung langsung dari Laporan), plus sheet **Merge** untuk metrik pasien (jaminan, DPJP, umur, lama rawat, dll).

### `refreshPivot()` — prinsip
- Membaca **ws1 **
- Agregasi **per bulan** (`yyyy-MM`).
- Hitung diagnosis & alat medik **hanya dari baris yang kolom R (DiagnosisEdited) terisi** → otomatis 1 pasien 1 hitungan.
- Daftar diagnosis & alat yang dihitung: konstanta `DIAGNOSIS_LIST` dan `ALAT_LIST` di `code.gs`.
- Output via `_tulisSheet_` (clearContents lalu tulis ulang header + data + baris TOTAL; format kolom bulan `yyyy-MM`; freeze baris 1).
- Trigger harian `refreshPivot` jam 01:00 (`pasangTriggerMalam`).
- Buatkan juga fungsi sekaligus yang membuat tabel pivotnya untuk diagnosis dan alat medik. 
- `pulihkanPivot()` — fungsi sekali-jalan untuk menghitung ulang pivot dari ws1+arsip (pemulihan).

> Desain "akumulatif dari arsip" ini wajib dipertahankan: pivot tidak boleh ter-reset hanya karena data dipindah ke arsip.
// ═══════════════════════════════════════════════════════
//  REFRESH PIVOT — urutan ASCENDING (lama ke baru)
// ═══════════════════════════════════════════════════════
const DIAGNOSIS_LIST = [
  ards	pneumonia	influenza	hiponatremia	peritonitis	post op	ispa	viral infection	hmd	prematur	hiperbilirubin	dhf	ensefalopati	low intake	dss	dehidrasi	hipoglikemia	sepsis	rd	ttn	hipokalemia	ivh	ich	kejang demam	bronchopneumonia	bp	syok	hiperglikemia	demam	hiperpireksia	nkb	hyaline membrane disease	ispa	isk	hipoglikemi	gea	dehidrasi	dengue	snad	ileus	sepsis	hiponatremia	hipokalemia	tutup	respiratory distress	ependimoma	astma	sifilis	pertusis	bronkiolitis	anemia
];

const ALAT_LIST = [
  'CAPD','Chemoport','Cimino','CPAP','CRRT','CVC',
  'Doublelumen|Double lumen HD','Drain','Facemask','HFNC','ICON','Kateter',
  'Nasalkanul','Nefrostomi','NGT','NIV','PICC',
  'Trakeostomi','Triplelumen|Triple lumen HD','Umbicath','Ventilator','WSD'
];

function refreshPivot() {
  var tz  = Session.getScriptTimeZone();
  var ss  = SpreadsheetApp.getActiveSpreadsheet();

  // ── Kumpulkan SEMUA baris dari ws1 + arsip (anti-dobel via nomor) ──
  var semua = [];           // {nomor, tgl(Date|str), diagEdited, alat}
  var nomorTerpakai = {};

  // (1) ws1
  var lr1 = ws1.getLastRow();
  if (lr1 >= 2) {
    var raw1 = ws1.getRange(2, 1, lr1 - 1, 18).getValues();
    raw1.forEach(function(r) {
      if (!r[0]) return;
      var nomor = Number(r[0]);
      if (nomorTerpakai[nomor]) return;
      nomorTerpakai[nomor] = true;
      semua.push({ nomor:nomor, tgl:r[1], diagEdited:String(r[17]||''), alat:String(r[8]||'') });
    });
  }

  // (2) arsip — nilai permanen (rumus tidak ikut, hanya hasil)
  try {
    if (ARSIP_FILE_ID) {
      var ssArsip = SpreadsheetApp.openById(ARSIP_FILE_ID);
      var wsArsip = ssArsip.getSheetByName('Laporan');
      if (wsArsip && wsArsip.getLastRow() > 1) {
        var rawA = wsArsip.getRange(2, 1, wsArsip.getLastRow() - 1, 18).getValues();
        rawA.forEach(function(r) {
          if (!r[0]) return;
          var nomor = Number(r[0]);
          if (nomorTerpakai[nomor]) return; // sudah ada di ws1 → skip (anti-dobel)
          nomorTerpakai[nomor] = true;
          semua.push({ nomor:nomor, tgl:r[1], diagEdited:String(r[17]||''), alat:String(r[8]||'') });
        });
      }
    }
  } catch (eArsip) {}

  // ── Agregasi per bulan ──
  // Diagnosis & alat dihitung HANYA dari baris yang DiagnosisEdited (kolom R) terisi.
  // Karena ArrayFormula mengisi R hanya di baris PERTAMA tiap pasien,
  // ini otomatis = 1 pasien 1 hitungan.
  var bulanMap = {};
  semua.forEach(function(o) {
    if (!o.tgl) return;
    var tglStr = (o.tgl instanceof Date)
      ? Utilities.formatDate(o.tgl, tz, 'yyyy-MM')
      : String(o.tgl).substring(0, 7);
    if (!tglStr || tglStr.length < 7) return;

    var diagTeks = String(o.diagEdited || '').toLowerCase().trim();
    if (!diagTeks) return; // kolom R kosong → bukan baris pertama pasien → lewati

    if (!bulanMap[tglStr]) {
      var diagObj = {}, alatObj = {};
      DIAGNOSIS_LIST.forEach(function(d) { diagObj[d] = 0; });
      ALAT_LIST.forEach(function(a)      { alatObj[a] = 0; });
      bulanMap[tglStr] = { diag: diagObj, alat: alatObj };
    }
    var bln = bulanMap[tglStr];

    DIAGNOSIS_LIST.forEach(function(d) {
      if (diagTeks.indexOf(d) >= 0) bln.diag[d]++;
    });
    var alatTeks = String(o.alat || '').trim();
    if (alatTeks) {
      var alatArr = alatTeks.split(/[;,]/).map(function(a) { return a.trim().toLowerCase(); });
      ALAT_LIST.forEach(function(a) {
        if (alatArr.indexOf(a.toLowerCase()) >= 0) bln.alat[a]++;
      });
    }
  });

  var bulanList = Object.keys(bulanMap).sort(); // ASCENDING

  var totalDiag = {}, totalAlat = {};
  DIAGNOSIS_LIST.forEach(function(d) { totalDiag[d] = 0; });
  ALAT_LIST.forEach(function(a)      { totalAlat[a] = 0; });
  bulanList.forEach(function(bln) {
    DIAGNOSIS_LIST.forEach(function(d) { totalDiag[d] += bulanMap[bln].diag[d]; });
    ALAT_LIST.forEach(function(a)      { totalAlat[a] += bulanMap[bln].alat[a]; });
  });
  var diagHeader = ['Bulan'].concat(DIAGNOSIS_LIST);
  var alatHeader = ['Bulan'].concat(ALAT_LIST);
  var diagData = bulanList.map(function(bln) {
    var tgl1 = new Date(bln + '-01');
    var row  = [tgl1];
    DIAGNOSIS_LIST.forEach(function(d) { row.push(bulanMap[bln].diag[d]); });
    return row;
  });
  var alatData = bulanList.map(function(bln) {
    var tgl1 = new Date(bln + '-01');
    var row  = [tgl1];
    ALAT_LIST.forEach(function(a) { row.push(bulanMap[bln].alat[a]); });
    return row;
  });
  var diagTotalRow = ['TOTAL'];
  DIAGNOSIS_LIST.forEach(function(d) { diagTotalRow.push(totalDiag[d]); });
  var alatTotalRow = ['TOTAL'];
  ALAT_LIST.forEach(function(a) { alatTotalRow.push(totalAlat[a]); });
  diagData.push(diagTotalRow);
  alatData.push(alatTotalRow);
  _tulisSheet_(ss, 'Pivot Diagnosis', diagHeader, diagData);
  _tulisSheet_(ss, 'Pivot Alat Medik', alatHeader, alatData);
  CacheService.getScriptCache().remove('stat8_pivot');
}

// Fungsi sekali-jalan untuk MEMULIHKAN pivot yang sudah nol.
// Cukup panggil ini sekali (Run) → pivot dihitung ulang dari ws1 + arsip.
function pulihkanPivot() {
  refreshPivot();
  Logger.log('Pivot dipulihkan dari ws1 + arsip. Cek sheet Pivot Diagnosis & Pivot Alat Medik.');
}

function _tulisSheet_(ss, namaSheet, header, dataRows) {
  var sh = ss.getSheetByName(namaSheet);
  if (!sh) {
    sh = ss.insertSheet(namaSheet);
  } else {
    sh.clearContents();
  }
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (dataRows.length > 0) {
    sh.getRange(2, 1, dataRows.length, header.length).setValues(dataRows);
  }
  var nDataBaris = dataRows.length - 1;
  if (nDataBaris > 0) {
    sh.getRange(2, 1, nDataBaris, 1).setNumberFormat('yyyy-MM');
  }
  sh.setFrozenRows(1);
}

function getPivotStatistik() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function bacaSheet(namaSheet) {
    var sh = ss.getSheetByName(namaSheet);
    if (!sh || sh.getLastRow() < 2) return { header: [], rows: [] };
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var all     = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var header  = all[0].map(function(h) { return String(h); });
    var rows    = all.slice(1).map(function(r) {
      var obj = {};
      header.forEach(function(h, i) { obj[h] = r[i]; });
      return obj;
    });
    return { header: header, rows: rows };
  }
  return JSON.stringify({
    diagnosis: bacaSheet('Pivot Diagnosis'),
    alatMedik: bacaSheet('Pivot Alat Medik')
  });
}

---



---

## 10. Aturan Apps Script yang WAJIB diikuti

1. **Bulk read/write, bukan loop sel.** Jangan `setValue`/`getValue` dalam loop atas data besar — itu menyebabkan timeout, korupsi, dan phantom rows (sudah pernah membuat ~8.000 & ~12.800 baris rusak). Selalu `getValues()` / `setValues()` sekali.
2. **Tanggal di server.** Format dengan `Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')` sebelum dikirim ke browser. Jangan andalkan `new Date()` di browser (timezone shift). Browser menerima string `yyyy-MM-dd`.
3. **Header & ArrayFormula kolom R tidak boleh dihapus.** Operasi mulai dari baris 2.
4. **Nomor hanya dari `baristerakhir()` (max kolom A).** Tidak pernah dari posisi baris / `getLastRow()-1`.
5. **Penyimpanan via LockService + cek duplikat server + nomor server.**
6. **Anti-dobel arsip via nomor unik** saat menggabung ws1 + arsip (mis. di `refreshPivot`, `getAllLaporanPasien`).
7. **Sheet Merge tidak pernah diarsip/dihapus.**

---


