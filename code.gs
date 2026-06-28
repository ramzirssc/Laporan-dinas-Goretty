// ═══════════════════════════════════════════════════════
//  code.gs  —  Laporan Dinas Goretty
// ═══════════════════════════════════════════════════════

// getSheets() dienumerasi SEKALI per eksekusi (kode top-level jalan di tiap server call).
// Dulu getsheetbyid memanggil getSheets() 3×; sekarang 1× lalu di-find dari array sama.
const _allSheets_ = SpreadsheetApp.getActiveSpreadsheet().getSheets();
const ws1 = getsheetbyid(0);           // Laporan
const ws2 = getsheetbyid(1476005123);  // Pasien hari ini

function getsheetbyid(gid) {
  return _allSheets_.find(s => s.getSheetId() == gid);
}

function opsi(range) {
  var key = 'opsi_'+range.replace(/[^a-z0-9]/gi,'_');
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if(hit) return JSON.parse(hit);
  var hasil = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Lookup").getRange(range).getValues()
    .filter(function(o){return o[0]!='';});
  cache.put(key, JSON.stringify(hasil), 300);
  return hasil;
}

// Opsi <option>/checkbox dipanggil LAZY (hanya saat template page3/page5 dirender di
// doGet via `<?!= opsiperawat() ?>`), bukan precompute top-level — agar server call data
// (Page1/Page8/…) tak ikut membaca sheet Lookup tiap kali. Output identik dgn sebelumnya.
function opsiperawat(){ return opsi("E2:E").map(d=>`<option>${d}</option>`).join(""); }
function opsipasien(){  return opsi("I2:I").map(d=>`<option>${d}</option>`).join(""); }
function opsitempat(){  return opsi("C2:C").map(d=>`<option>${d[0]}</option>`).join(""); }

function htmlCheckbox(){ return [
  'CAPD','Chemoport','Cimino','CPAP','CRRT','CVC',
  'Doublelumen|Double lumen HD','Drain','Facemask','HFNC','ICON','Kateter',
  'Nasalkanul','Nefrostomi','NGT','NIV','PICC',
  'Trakeostomi','Triplelumen|Triple lumen HD','Umbicath','Ventilator','WSD'
].map(function(item){
  var p = item.split("|");
  return `<label class="check-item" for="${p[0]}"><input type="checkbox" id="${p[0]}" class="multi" value="${p[0]}" disabled>${p[1]||p[0]}</label>`;
}).join("\n"); }

function doGet(e) {
  var tmpl = HtmlService.createTemplateFromFile("index");
  tmpl.initPage  = (e&&e.parameter&&e.parameter.p) ? String(e.parameter.p) : '1';
  tmpl.initNomor = (e&&e.parameter&&e.parameter.n) ? String(e.parameter.n) : '0';
  tmpl.initNew       = (e&&e.parameter&&e.parameter.nw) ? '1' : '0';
  tmpl.initNamaJson  = JSON.stringify((e&&e.parameter&&e.parameter.nm) ? String(e.parameter.nm) : '');
  tmpl.initShiftJson = JSON.stringify((e&&e.parameter&&e.parameter.sh) ? String(e.parameter.sh) : '');
  tmpl.initTglJson   = JSON.stringify((e&&e.parameter&&e.parameter.tg) ? String(e.parameter.tg) : '');
  tmpl.initOpsTglJson = JSON.stringify(tanggalOperasional_(Session.getScriptTimeZone())); // tgl operasional (hari berganti 07:00)
  return tmpl.evaluate()
    .setTitle("Laporan Dinas Goretty")
    .addMetaTag("viewport","width=device-width,initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getWebAppUrl() {
  try { return ScriptApp.getService().getUrl(); } catch(e) { return ''; }
}

function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

// ═══════════════════════════════════════════════════════
//  PAGE 1 — DAFTAR PASIEN HARI INI
// ═══════════════════════════════════════════════════════
// Tanggal operasional Page1: hari berganti pada pukul 07:00 (zona waktu skrip).
// Sebelum jam 7 → masih dihitung HARI SEBELUMNYA, sehingga badge nomor laporan
// tetap tampil sampai jam 7 pagi. Mulai 07:00 → pindah ke tanggal kalender hari ini.
function tanggalOperasional_(tz) {
  var now = new Date();
  var jam = parseInt(Utilities.formatDate(now, tz, 'H'), 10);
  var ms  = now.getTime();
  if(jam < 7) ms -= 24 * 60 * 60 * 1000;
  return Utilities.formatDate(new Date(ms), tz, 'yyyy-MM-dd');
}

function getDataPage1() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('p1_data');
  if(cached) return cached;
  try {
    var tz = Session.getScriptTimeZone();
    if(!ws2) return JSON.stringify({colDefs:[],pasien:[],sudahAda:{},hariIni:'',dokterJaga:'',
      _err:'Sheet ws2 tidak ditemukan'});
    var dokterJaga = '';
    try{dokterJaga = String(ws2.getRange('T2').getValue()||'');}catch(e){}
    var lastRow = ws2.getLastRow();
    if(lastRow<2) return JSON.stringify({colDefs:[],pasien:[],sudahAda:{},hariIni:'',dokterJaga:dokterJaga});
    var rawAll  = ws2.getRange(1,1,lastRow,16).getValues();
    var rawHdrs = rawAll[0].map(function(h){return String(h).trim();});
    var allData = rawAll.slice(1);
    function fCol(kws){
      for(var i=0;i<rawHdrs.length;i++){
        var h=rawHdrs[i].toLowerCase();
        for(var k=0;k<kws.length;k++) if(h.indexOf(kws[k])>=0) return i;
      }
      return -1;
    }
    var iNama     = 1;
    var iNRM      = fCol(['nrm','rekam medis','no rm','nomor rm']); if(iNRM<0) iNRM=2;
    var iJK       = fCol(['jenis kelamin','jk','gender']);
    var iTglLahir = fCol(['tanggal lahir','tgl lahir','lahir']);
    var iUmur     = fCol(['umur','usia','age']);
    var iAgama    = fCol(['agama','religion']);
    var iAsal     = fCol(['asal unit','asal','unit asal']);
    var iJaminan  = fCol(['jaminan','asuransi','bpjs','penjamin']);
    var iTglRSSC  = fCol(['rssc','masuk rs','masuk rumah sakit']);
    var iTglDami  = fCol(['goretty','masuk icu','masuk ipi','dami','icu','ipi']);
    var iHariKe   = fCol(['hari ke','lama rawat','hari rawat']);
    var iTempat   = fCol(['tempat','bed','kamar']);
    var iDPJP     = fCol(['dpjp','dokter penanggung']);
    var iKonsulen = fCol(['konsulen','konsultan']);
    var iWA       = fCol(['whatsapp','no wa','no hp','no. hp','telp','telepon','handphone','nomor hp']);
    var COLS = [
      {lbl:'No.',         idx:0,         w:42},
      {lbl:'Nama Pasien', idx:iNama,     w:155},
      {lbl:'NRM',         idx:iNRM,      w:65},
      {lbl:'JK',          idx:iJK,       w:70},
      {lbl:'Tgl Lahir',   idx:iTglLahir, w:96},
      {lbl:'Umur',        idx:iUmur,     w:78},
      {lbl:'Agama',       idx:iAgama,    w:60},
      {lbl:'Asal Unit',   idx:iAsal,     w:75},
      {lbl:'Jaminan',     idx:iJaminan,  w:75},
      {lbl:'Tgl Masuk',   idx:iTglDami,  w:96},
      {lbl:'Hari ke-',    idx:iHariKe,   w:50},
      {lbl:'Tempat',      idx:iTempat,   w:75},
      {lbl:'DPJP',        idx:iDPJP,     w:120},
      {lbl:'Konsulen',    idx:iKonsulen, w:120},
      {lbl:'No.WA',       idx:iWA,       w:120}
    ].filter(function(c){
      if(c.idx<0) return false;
      if(iTglRSSC>=0 && c.idx===iTglRSSC) return false;
      return true;
    });
    var hariIni = tanggalOperasional_(tz); // hari berganti pukul 07:00
    var sudahAda = {};
    try {
      if(ws1 && ws1.getLastRow()>1){
        ws1.getRange(2,1,ws1.getLastRow()-1,5).getValues().forEach(function(r){
          if(!r[0]||!r[1]) return;
          var tgl='';
          try{tgl=Utilities.formatDate(new Date(r[1]),tz,'yyyy-MM-dd');}catch(e2){}
          if(tgl===hariIni) sudahAda[(String(r[4])+'|'+String(r[2])).toLowerCase()] = r[0];
        });
      }
    } catch(e3) {}
    var pasienList = allData
      .filter(function(r){return r[1]&&String(r[1]).trim()!=='';})
      .map(function(r){
        var vals = COLS.map(function(c){
          var v = r[c.idx];
          if(v instanceof Date){try{return Utilities.formatDate(v,tz,'dd/MM/yyyy');}catch(e){return String(v);}}
          return (v===null||v===undefined)?'':String(v);
        });
        return {nama:String(r[iNama]||''), vals:vals};
      });
    var colDefs = COLS.map(function(c){return {lbl:c.lbl,w:c.w};});
    var hasil = JSON.stringify({colDefs:colDefs, pasien:pasienList, sudahAda:sudahAda,
      hariIni:hariIni, dokterJaga:dokterJaga});
    cache.put('p1_data', hasil, 60);
    return hasil;
  } catch(errFatal) {
    return JSON.stringify({colDefs:[],pasien:[],sudahAda:{},hariIni:'',dokterJaga:'',
      _err:'Server error: '+(errFatal.message||String(errFatal))});
  }
}

function invalidateP1Cache() {
  CacheService.getScriptCache().remove('p1_data');
}

// ═══════════════════════════════════════════════════════
//  PAGE 3 — LIHAT LAPORAN
// ═══════════════════════════════════════════════════════
function getLaporan(filter) {
  var ws1Last = ws1.getLastRow(); if(ws1Last<2) return JSON.stringify([]);
  var tz = Session.getScriptTimeZone();
  var maxRows = filter.noDateFilter ? Math.min(ws1Last-1,5000) : Math.min(ws1Last-1,500);
  var startRow = ws1Last - maxRows + 1; if(startRow<2) startRow=2;
  var data = ws1.getRange(startRow,1,ws1Last-startRow+1,17).getValues();
  function toYMD(v){if(!v)return'';try{return Utilities.formatDate(new Date(v),tz,'yyyy-MM-dd');}catch(e){return String(v).substring(0,10);}}
  var today = Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  var tm = filter.tglMulai&&filter.tglMulai!==''?filter.tglMulai:'';
  var ta = filter.tglAkhir&&filter.tglAkhir!==''?filter.tglAkhir:'';
  if(!tm&&!ta&&!filter.noDateFilter){
    var tiga=new Date(); tiga.setDate(tiga.getDate()-2);
    tm=Utilities.formatDate(tiga,tz,'yyyy-MM-dd'); ta=today;
  }
  data = data.filter(function(r){
    if(!r[0]) return false; var d=toYMD(r[1]),ok=true;
    if(tm) ok=ok&&d>=tm; if(ta) ok=ok&&d<=ta;
    if(filter.nama  &&filter.nama  !=='') ok=ok&&String(r[4]).toLowerCase().includes(filter.nama.toLowerCase());
    if(filter.pj    &&filter.pj    !=='') ok=ok&&String(r[3])===filter.pj;
    if(filter.pp    &&filter.pp    !=='') ok=ok&&String(r[5])===filter.pp;
    if(filter.shift &&filter.shift !=='') ok=ok&&String(r[2]).toLowerCase()===filter.shift.toLowerCase();
    return ok;
  });
  var sOrd = {malam:0,sore:1,pagi:2};
  data.sort(function(a,b){
    var tA=toYMD(a[1]),tB=toYMD(b[1]); if(tB!==tA) return tB>tA?1:-1;
    var sA=sOrd[String(a[2]).toLowerCase()], sB=sOrd[String(b[2]).toLowerCase()];
    if(sA===undefined) sA=9; if(sB===undefined) sB=9; return sA-sB;
  });
  return JSON.stringify(data.map(function(r){
    var tgl='',tglR='';
    try{tgl=Utilities.formatDate(new Date(r[1]),tz,'dd/MM/yyyy');tglR=toYMD(r[1]);}catch(e){}
    return{nomor:r[0],tglRaw:tglR,tanggal:tgl,shift:r[2],pj:r[3],pasien:r[4],pp:r[5],
      diagnosis:r[6],laporan:r[7],alatmedik:r[8],agama:r[10],jaminan:r[11],
      dpjp:r[12],dpjplain:r[13],umur:r[14],harike:r[15],bed:r[16]};
  }));
}

// §6 — update inline dari Page3. Tanda tangan WAJIB 3-argumen.
// Kolom 8 (H)=isiLaporan selalu; kolom 7 (G)=diagnosis HANYA bila diberi
// (agar pemanggil yang tidak mengubah diagnosis tidak menimpa).
function updateLaporan(nomor, isiLaporan, diagnosis) {
  var baris = _cariRowByNomor_(nomor);
  if(baris < 0) return JSON.stringify({ok:false, alasan:'tidak_ditemukan'});
  ws1.getRange(baris, 8).setValue(isiLaporan);
  if(diagnosis !== undefined && diagnosis !== null){
    ws1.getRange(baris, 7).setValue(diagnosis);
  }
  CacheService.getScriptCache().removeAll(['p1_data','init_data']);
  return JSON.stringify({ok:true, nomor:Number(nomor)});
}

function getNamaPasienDalamRentang(tm, ta) {
  var ws1Last = ws1.getLastRow(); if(ws1Last<2) return JSON.stringify([]);
  var tz = Session.getScriptTimeZone();
  var data = ws1.getRange(2,1,Math.min(ws1Last-1,500),5).getValues();
  var set = {};
  data.forEach(function(r){
    if(!r[4]) return; var tgl='';
    try{tgl=Utilities.formatDate(new Date(r[1]),tz,'yyyy-MM-dd');}catch(e){}
    if((!tm||tgl>=tm)&&(!ta||tgl<=ta)) set[String(r[4])]=true;
  });
  return JSON.stringify(Object.keys(set).sort());
}

// ═══════════════════════════════════════════════════════
//  PAGE 4 — OPERAN DINAS
// ═══════════════════════════════════════════════════════
function getDataPage4(namaPasien, tglMulai, tglAkhir, showAll) {
  var tz = Session.getScriptTimeZone();
  var pasienHariIni = [];
  try {
    var lr2 = ws2.getLastRow();
    if(lr2>=2) {
      ws2.getRange(2,2,lr2-1,1).getValues().forEach(function(r){
        var n = String(r[0]||'').trim();
        if(n) pasienHariIni.push(n);
      });
    }
  } catch(e) {}
  var lr1 = ws1.getLastRow();
  if(lr1<2) return JSON.stringify({pasienHariIni:pasienHariIni, laporan:{}});
  var maxRows = showAll ? Math.min(lr1-1,3000) : Math.min(lr1-1,500);
  var startRow = lr1 - maxRows + 1; if(startRow<2) startRow=2;
  var allData = ws1.getRange(startRow,1,lr1-startRow+1,17).getValues();
  function toYMD(v){if(!v)return'';try{return Utilities.formatDate(new Date(v),tz,'yyyy-MM-dd');}catch(e){return'';}}
  function fmtTgl(v){if(!v)return'';try{return Utilities.formatDate(new Date(v),tz,'dd/MM/yyyy');}catch(e){return'';}}
  var targets = namaPasien ? [namaPasien] : pasienHariIni;
  var grouped = {};
  targets.forEach(function(n){ grouped[n] = []; });
  allData.forEach(function(r){
    if(!r[0]) return;
    var n = String(r[4]||'');
    if(!grouped.hasOwnProperty(n)) return;
    if(!showAll) {
      var d = toYMD(r[1]);
      if(tglMulai && d && d<tglMulai) return;
      if(tglAkhir && d && d>tglAkhir) return;
    }
    grouped[n].push(r);
  });
  var sOrd = {pagi:0, sore:1, malam:2};
  var limit = showAll ? 99999 : 6;
  var laporan = {};
  targets.forEach(function(n){
    var arr = grouped[n] || [];
    arr.sort(function(a,b){
      var dA=toYMD(a[1]), dB=toYMD(b[1]);
      if(dB!==dA) return dB>dA?1:-1;
      var sA=sOrd[String(a[2]).toLowerCase()]; if(sA===undefined) sA=1;
      var sB=sOrd[String(b[2]).toLowerCase()]; if(sB===undefined) sB=1;
      return sB-sA;
    });
    laporan[n] = arr.slice(0,limit).map(function(r){
      return {nomor:r[0], tanggal:fmtTgl(r[1]), tglRaw:toYMD(r[1]),
        shift:r[2], pj:r[3], pasien:r[4], pp:r[5],
        diagnosis:r[6], laporan:r[7], alatmedik:r[8],
        agama:r[10], jaminan:r[11], dpjp:r[12], dpjplain:r[13],
        umur:r[14], harike:r[15], bed:r[16]};
    });
  });
  return JSON.stringify({pasienHariIni:pasienHariIni, laporan:laporan});
}

function getAllLaporanPasien(nama) {
  var lr1 = ws1.getLastRow();
  if(lr1<2) return JSON.stringify([]);
  var tz = Session.getScriptTimeZone();
  var data = ws1.getRange(2,1,lr1-1,17).getValues();
  function toYMD(v){if(!v)return'';try{return Utilities.formatDate(new Date(v),tz,'yyyy-MM-dd');}catch(e){return'';}}
  function fmtTgl(v){if(!v)return'';try{return Utilities.formatDate(new Date(v),tz,'dd/MM/yyyy');}catch(e){return'';}}
  var nama_lc = String(nama||'').toLowerCase().trim();
  var hasil = [];
  data.forEach(function(r){
    if(!r[0]) return;
    if(String(r[4]||'').toLowerCase().trim() !== nama_lc) return;
    hasil.push({nomor:r[0], tanggal:fmtTgl(r[1]), tglRaw:toYMD(r[1]),
      shift:r[2], pj:r[3], pasien:r[4], pp:r[5],
      diagnosis:r[6], laporan:r[7], alatmedik:r[8],
      agama:r[10], jaminan:r[11], dpjp:r[12], dpjplain:r[13],
      umur:r[14], harike:r[15], bed:r[16]});
  });
  var sOrd = {pagi:0, sore:1, malam:2};
  hasil.sort(function(a,b){
    if(b.tglRaw !== a.tglRaw) return b.tglRaw > a.tglRaw ? 1 : -1;
    var sA=sOrd[String(a.shift||'').toLowerCase()]; if(sA===undefined) sA=1;
    var sB=sOrd[String(b.shift||'').toLowerCase()]; if(sB===undefined) sB=1;
    return sB-sA;
  });
  return JSON.stringify(hasil);
}

function cariSemuaNamaPasien(query) {
  var lr1 = ws1.getLastRow();
  if(lr1<2) return JSON.stringify([]);
  var tz = Session.getScriptTimeZone();
  var q = String(query||'').toLowerCase().trim();
  if(q.length<2) return JSON.stringify([]);
  var data = ws1.getRange(2,1,lr1-1,5).getValues();
  var map = {};
  data.forEach(function(r){
    if(!r[0]) return;
    var n = String(r[4]||'').trim();
    if(!n) return;
    if(n.toLowerCase().indexOf(q)<0) return;
    if(!map[n]){ map[n] = {jumlah:0, tglTerakhir:''}; }
    map[n].jumlah++;
    var tgl='';
    try{tgl=Utilities.formatDate(new Date(r[1]),tz,'dd/MM/yyyy');}catch(e){}
    if(tgl > map[n].tglTerakhir) map[n].tglTerakhir = tgl;
  });
  var result = Object.keys(map).map(function(n){
    return {nama:n, jumlah:map[n].jumlah, tglTerakhir:map[n].tglTerakhir};
  });
  result.sort(function(a,b){return a.nama.localeCompare(b.nama);});
  return JSON.stringify(result);
}

// ═══════════════════════════════════════════════════════
//  PAGE 5 — TULIS LAPORAN
// ═══════════════════════════════════════════════════════
// getFormOptions: bed dari Lookup kolom C (dinamis)
function getFormOptions() {
  var beds = opsi("C2:C").map(function(d){return String(d[0]||'').trim();}).filter(Boolean);
  return JSON.stringify({
    opsiperawat: opsi("E2:E").map(function(d){return String(d[0]||'');}),
    opsipasien:  opsi("I2:I").map(function(d){return String(d[0]||'');}),
    opsibed: beds,
    htmlCheckbox:[
      'CAPD','Chemoport','Cimino','CPAP','CRRT','CVC',
      'Doublelumen|Double lumen HD','Drain','Facemask','HFNC','ICON','Kateter',
      'Nasalkanul','Nefrostomi','NGT','NIV','PICC',
      'Trakeostomi','Triplelumen|Triple lumen HD','Umbicath','Ventilator','WSD'
    ].map(function(item){
      var p=item.split('|');
      return {id:p[0],label:p[1]||p[0]};
    })
  });
}

function getInitialData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('init_data');
  if(cached) return cached;
  var total = baristerakhir();                 // §4 — max kolom A, BUKAN getLastRow()-1
  if(total<1) return JSON.stringify({total:0, baris:[[]]});
  var baris = _cariRowByNomor_(total);         // baris dengan nomor terbesar (posisi ≠ nomor)
  var data = (baris>0) ? ws1.getRange(baris,1,1,17).getValues() : [[]];
  var hasil = JSON.stringify({total:total, baris:data});
  try{cache.put('init_data', hasil, 45);}catch(e){}
  return hasil;
}

function caridata(record) {
  if(!record||record==='') return '';
  var baris = _cariRowByNomor_(record);        // §5 — cari via nomor, bukan posisi baris
  if(baris<0) return '';
  return JSON.stringify(ws1.getRange(baris,1,1,17).getValues());
}

// §4 — Sumber kebenaran nomor = nomor TERBESAR di kolom A.
// Tahan terhadap ArrayFormula kolom R yang menggembungkan getLastRow()
// dan terhadap baris kosong tersisa di bawah.
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

// §5 — kembalikan nomor baris aktual (1-based) untuk sebuah NOMOR laporan, atau -1.
// Dipakai semua operasi edit/baca-per-nomor (posisi ≠ nomor setelah arsip/edit).
function _cariRowByNomor_(nomor) {
  var lr = ws1.getLastRow();
  if(lr < 2) return -1;
  var col = ws1.getRange(2, 1, lr - 1, 1).getValues();
  var target = Number(nomor);
  for(var i = 0; i < col.length; i++) {
    if(Number(col[i][0]) === target) return i + 2; // +2: offset header + 0-based
  }
  return -1;
}

// §5 — cek apakah kombinasi pasien+tanggal+shift sudah ada.
// Kembalikan {count, nomor(existing pertama)}.
function cekDuplikatLaporan(pasien, tanggal, shift) {
  var lr = ws1.getLastRow();
  if(lr < 2) return {count:0, nomor:0};
  var tz = Session.getScriptTimeZone();
  var data = ws1.getRange(2, 1, lr - 1, 5).getValues(); // A..E: nomor,tgl,shift,pj,pasien
  var pTgt  = String(pasien||'').toLowerCase().trim();
  var tgTgt = String(tanggal||'').substring(0,10);
  var sTgt  = String(shift||'').toLowerCase().trim();
  var count = 0, nomor = 0;
  for(var i = 0; i < data.length; i++) {
    var r = data[i];
    if(!r[0]) continue;
    if(String(r[4]||'').toLowerCase().trim() !== pTgt) continue;
    var d = '';
    try{ d = Utilities.formatDate(new Date(r[1]), tz, 'yyyy-MM-dd'); }
    catch(e){ d = String(r[1]).substring(0,10); }
    if(d !== tgTgt) continue;
    if(String(r[2]||'').toLowerCase().trim() !== sTgt) continue;
    count++;
    if(!nomor) nomor = r[0];
  }
  return {count:count, nomor:nomor};
}

// Daftar nama pasien hari ini (dari ws2 kolom B) — untuk dropdown Page5.
function getPasienHariIniNames() {
  var out = [];
  try {
    var lr = ws2.getLastRow();
    if(lr >= 2) {
      ws2.getRange(2,2,lr-1,1).getValues().forEach(function(r){
        var n = String(r[0]||'').trim();
        if(n && out.indexOf(n) < 0) out.push(n);
      });
    }
  } catch(e) {}
  return JSON.stringify(out);
}

// Cari laporan berdasarkan kombinasi tanggal+nama+shift. Kembalikan baris (JSON array) atau ''.
function getLaporanByTNS(nama, tanggal, shift) {
  var dup = cekDuplikatLaporan(nama, tanggal, shift);
  if(dup.count < 1) return '';
  var baris = _cariRowByNomor_(dup.nomor);
  if(baris < 0) return '';
  return JSON.stringify(ws1.getRange(baris,1,1,17).getValues());
}

// §5 — Penyimpanan aman. WAJIB: LockService + cek duplikat server + nomor server.
// Selalu kembalikan JSON string. Bersihkan cache p1_data/init_data.
function simpandisheet(ui) {
  var lock = LockService.getScriptLock();
  try {
    if(!lock.tryLock(20000)) return JSON.stringify({ok:false, alasan:'sibuk'});
  } catch(e) {
    return JSON.stringify({ok:false, alasan:'sibuk'});
  }
  try {
    var isBaru = (ui.isBaru === true || ui.isBaru === 'true'); // 2 — dari client, jangan tebak dari nomor

    if(isBaru) {
      // 3a-pra — tolak laporan baru bertanggal melebihi hari operasional
      // (hari berganti pukul 07:00; sebelum jam 7, tanggal hari ini belum boleh dipakai).
      var opsTgl = tanggalOperasional_(Session.getScriptTimeZone());
      if(String(ui.tanggal||'').substring(0,10) > opsTgl)
        return JSON.stringify({ok:false, alasan:'belum_waktunya', opsTgl:opsTgl});
      // 3a — tolak jika kombinasi pasien+tanggal+shift sudah ada
      var dup = cekDuplikatLaporan(ui.pasien, ui.tanggal, ui.dinas);
      if(dup.count > 0) return JSON.stringify({ok:false, alasan:'duplikat', nomor:dup.nomor});
      // 3b — nomor digenerate di SERVER, abaikan ui.nomor
      var nomorBaru = baristerakhir() + 1;
      var row = [nomorBaru,ui.tanggal,ui.dinas,ui.pj,ui.pasien,ui.pp,
                 ui.diagnosis,ui.laporan,ui.alatmedik,new Date(),
                 ui.agama,ui.jaminan,ui.dpjp,ui.dpjplain,ui.umur,ui.harike,ui.bed];
      ws1.appendRow(row); // 3c — tulis A–Q (17 kolom); kolom R diisi ArrayFormula otomatis
      CacheService.getScriptCache().removeAll(['p1_data','init_data']);
      return JSON.stringify({ok:true, nomor:nomorBaru, mode:'baru'});
    } else {
      // 4 — edit: cari baris via nomor; jangan buat baris baru bila tak ketemu
      var baris = _cariRowByNomor_(ui.nomor);
      if(baris < 0) return JSON.stringify({ok:false, alasan:'tidak_ditemukan'});
      var rowE = [ui.nomor,ui.tanggal,ui.dinas,ui.pj,ui.pasien,ui.pp,
                  ui.diagnosis,ui.laporan,ui.alatmedik,new Date(),
                  ui.agama,ui.jaminan,ui.dpjp,ui.dpjplain,ui.umur,ui.harike,ui.bed];
      ws1.getRange(baris,1,1,17).setValues([rowE]);
      CacheService.getScriptCache().removeAll(['p1_data','init_data']);
      return JSON.stringify({ok:true, nomor:ui.nomor, mode:'edit'});
    }
  } finally {
    lock.releaseLock(); // 1 — selalu lepas lock
  }
}

// §7 — Diagnosis & alat medik dari 1 shift dinas SEBELUMNYA untuk pasien sama.
// Urutan harian: Pagi → Sore → Malam.
//   Sore  → ambil Pagi  (hari sama)
//   Malam → ambil Sore  (hari sama)
//   Pagi  → ambil Malam (hari SEBELUMNYA)
// _prevShiftData_ kembalikan {diagnosis, alatmedik, bed} dari 1 shift sebelumnya.
function _prevShiftData_(nama, tanggal, shift) {
  var kosong = {diagnosis:'', alatmedik:'', bed:''};
  var lr = ws1.getLastRow();
  if(lr < 2) return kosong;
  var tz = Session.getScriptTimeZone();
  var sh = String(shift||'').toLowerCase().trim();
  var tgtTgl = String(tanggal||'').substring(0,10);
  var prevShift = '', prevTgl = '';
  if(sh === 'sore')       { prevShift = 'pagi';  prevTgl = tgtTgl; }
  else if(sh === 'malam') { prevShift = 'sore';  prevTgl = tgtTgl; }
  else if(sh === 'pagi')  {
    prevShift = 'malam';
    var d = new Date(tgtTgl); d.setDate(d.getDate() - 1);
    prevTgl = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  } else {
    return kosong;
  }
  var data = ws1.getRange(2, 1, lr - 1, 17).getValues(); // A..Q (Q=Bed idx16)
  var namaLc = String(nama||'').toLowerCase().trim();
  var found = null;
  for(var i = 0; i < data.length; i++) {
    var r = data[i];
    if(!r[0]) continue;
    if(String(r[4]||'').toLowerCase().trim() !== namaLc) continue;
    var d2 = '';
    try{ d2 = Utilities.formatDate(new Date(r[1]), tz, 'yyyy-MM-dd'); }
    catch(e){ d2 = String(r[1]).substring(0,10); }
    if(d2 !== prevTgl) continue;
    if(String(r[2]||'').toLowerCase().trim() !== prevShift) continue;
    found = r; // ambil kemunculan terakhir di sheet
  }
  if(!found) return kosong;
  return {diagnosis:String(found[6]||''), alatmedik:String(found[8]||''), bed:String(found[16]||'')};
}

// SATU panggilan server untuk Page5: daftar nama + data pasien + data shift
// sebelumnya (diagnosis/alat/bed) + laporan existing (cek duplikat).
// Tujuan: hindari beberapa server call beruntun (nama → data → cek duplikat).
function getPaketLaporan(nama, tanggal, shift) {
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var out = { namaList:[], dataPasien:null, sebelumnya:{diagnosis:'',alatmedik:'',bed:''}, existing:null };

  // 1) daftar nama: hari ini → ws2; tanggal lain → pasien dgn laporan tgl tsb
  if(!tanggal || tanggal === today) out.namaList = JSON.parse(getPasienHariIniNames());
  else                              out.namaList = JSON.parse(getNamaPasienDalamRentang(tanggal, tanggal));

  if(!nama) return JSON.stringify(out);

  // 2) data pasien dari ws2
  var rows = ws2.getRange(2,1,Math.max(ws2.getLastRow()-1,1),16).getValues();
  var b = rows.find(function(r){return r[1]==nama;});
  out.dataPasien = b || null;

  // 3) laporan existing (nama+tanggal+shift)
  var dup = cekDuplikatLaporan(nama, tanggal, shift);
  if(dup.count > 0) {
    var baris = _cariRowByNomor_(dup.nomor);
    if(baris > 0) out.existing = ws1.getRange(baris,1,1,17).getValues()[0];
  }

  // 4) data shift sebelumnya (diagnosis/alat/bed)
  out.sebelumnya = _prevShiftData_(nama, tanggal, shift);
  return JSON.stringify(out);
}

// ═══════════════════════════════════════════════════════
//  PAGE 7 — PERMINTAAN DINAS
//  Sumber: spreadsheet Daftar Dinas IPI (sama dengan Damianus)
//  Filter: kolom I (idx 8) mengandung huruf "G" (= Goretty)
// ═══════════════════════════════════════════════════════
function getDaftarDinas(tglMulai, tglAkhir) {
  var key = 'dinas_g_'+(tglMulai||'')+'-'+(tglAkhir||'');
  var cache = CacheService.getScriptCache();
  var cached = cache.get(key);
  if(cached) return cached;

  var ssExt, wsExt;
  try {
    ssExt = SpreadsheetApp.openById('1i0lJ8dyeAUXvdEsPIPvMgO5cUfYF5e0LG6h7RLzpwpM');
    wsExt = ssExt.getSheets().find(function(s){return s.getSheetId()==1378939414;});
    if(!wsExt) wsExt = ssExt.getSheetByName('Form responses 1');
  } catch(e){ return JSON.stringify({error:'Gagal: '+e.message, rows:[]}); }
  if(!wsExt) return JSON.stringify({error:'Sheet tidak ditemukan', rows:[]});

  var lastRow = wsExt.getLastRow();
  if(lastRow<2) return JSON.stringify({error:'', rows:[]});

  var tz   = Session.getScriptTimeZone();
  var hdrs = wsExt.getRange(1,1,1,wsExt.getLastColumn()).getValues()[0].map(String);
  var data = wsExt.getRange(2,1,lastRow-1,wsExt.getLastColumn()).getValues();

  function fIdx(kws){
    for(var i=0;i<hdrs.length;i++){
      var h=hdrs[i].toLowerCase();
      for(var k=0;k<kws.length;k++) if(h.includes(kws[k])) return i;
    }
    return -1;
  }
  var iTs    = fIdx(['timestamp','waktu']);                      if(iTs  <0) iTs  =0;
  var iNama  = fIdx(['nama staf','nama','name']);                 if(iNama<0) iNama=1;
  var iTm    = fIdx(['tanggal mulai','tgl mulai','mulai']);       if(iTm  <0) iTm  =3;
  var iTa    = fIdx(['tanggal selesai','tgl selesai','selesai']); if(iTa  <0) iTa  =4;
  var iJenis = fIdx(['jenis permintaan','jenis','type']);         if(iJenis<0) iJenis=2;
  var iJwb   = fIdx(['jawaban','approve','status response']);     if(iJwb <0) iJwb =6;
  var iAlsn  = fIdx(['alasan ditolak','alasan penolakan']);       if(iAlsn<0) iAlsn=7;
  var iUnit  = 8;  // kolom I (idx 8) = unit, filter yang mengandung "G"

  function toYMD(v){if(!v)return'';if(v instanceof Date){try{return Utilities.formatDate(v,tz,'yyyy-MM-dd');}catch(e){return'';}}return String(v).substring(0,10);}
  function fmtTs(v){if(!v)return'';if(v instanceof Date){try{return Utilities.formatDate(v,tz,'dd/MM/yyyy HH:mm');}catch(e){return'';}}return String(v);}
  function fmtTgl(v){if(!v)return'';if(v instanceof Date){try{return Utilities.formatDate(v,tz,'dd/MM/yyyy');}catch(e){return'';}}return String(v).substring(0,10);}

  var today = Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  var tm = tglMulai&&tglMulai!==''?tglMulai:today;
  var sixM = new Date(); sixM.setMonth(sixM.getMonth()+6);
  var ta = tglAkhir&&tglAkhir!==''?tglAkhir:Utilities.formatDate(sixM,tz,'yyyy-MM-dd');

  var filtered = data.filter(function(r){
    // Filter unit Goretty: kolom I mengandung huruf "G"
    var unit = String(r[iUnit]||'');
    if(unit.toUpperCase().indexOf('G') < 0) return false;
    var d = toYMD(r[iTm]);
    return d && d>=tm && d<=ta;
  });

  filtered.sort(function(a,b){
    var dA=toYMD(a[iTm]),dB=toYMD(b[iTm]); if(dA!==dB) return dA>dB?1:-1;
    var tsA=a[iTs] instanceof Date?a[iTs].getTime():0;
    var tsB=b[iTs] instanceof Date?b[iTs].getTime():0;
    if(tsA!==tsB) return tsA>tsB?1:-1;
    return String(a[iNama]||'').localeCompare(String(b[iNama]||''));
  });

  var hasil = JSON.stringify({error:'', rows:filtered.map(function(r,i){
    return{nomor:i+1, timestamp:fmtTs(r[iTs]), nama:String(r[iNama]||''),
      tglMulai:fmtTgl(r[iTm]), tglMulaiRaw:toYMD(r[iTm]), tglSelesai:fmtTgl(r[iTa]),
      jenis:String(r[iJenis]||''), jawaban:String(r[iJwb]||''), alasan:String(r[iAlsn]||'')};
  })});
  try{cache.put(key, hasil, 180);}catch(e){}
  return hasil;
}

// ═══════════════════════════════════════════════════════
//  PAGE 8 — STATISTIK
//  Merge ada di workbook yang sama — tidak perlu openById
// ═══════════════════════════════════════════════════════
function getStatistikPage8(tahun, tglMulai, tglAkhir) {
  var cacheKey = 'stat8v2_'+tahun+'_'+(tglMulai||'')+'_'+(tglAkhir||'');
  var cache = CacheService.getScriptCache();
  var hit = cache.get(cacheKey);
  if(hit) return hit;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Merge');
  if(!ws) return JSON.stringify({error:'Sheet "Merge" tidak ditemukan'});
  var lastRow = ws.getLastRow();
  if(lastRow<2) return JSON.stringify({error:'Data Merge kosong'});

  var tz = Session.getScriptTimeZone();
  var data = ws.getRange(2,1,lastRow-1,20).getValues();

  function toYMD(v) {
    if(!v) return '';
    if(v instanceof Date){try{return Utilities.formatDate(v,tz,'yyyy-MM-dd');}catch(e){return'';}}
    return '';
  }

  var tahunStr = String(tahun);
  var monthCounts = [0,0,0,0,0,0,0,0,0,0,0,0];
  var jaminanYear = {}, jaminanYearTotal = 0;
  var dpjpMap = {}, kondisiMap = {}, jaminanRangeMap = {};
  var umurList = [], lamaList = [];
  var rangeTotal = 0;

  data.forEach(function(r) {
    var tglMasukR = r[10];
    var tglMasukY = toYMD(tglMasukR);
    if(!tglMasukY) return;
    if(tglMasukY.substring(0,4) === tahunStr) {
      var mo = parseInt(tglMasukY.substring(5,7),10)-1;
      if(mo>=0&&mo<12) monthCounts[mo]++;
      var jam = String(r[8]||'').trim();
      if(jam){ jaminanYear[jam]=(jaminanYear[jam]||0)+1; jaminanYearTotal++; }
    }
    if(tglMulai && tglMasukY < tglMulai) return;
    if(tglAkhir && tglMasukY > tglAkhir) return;
    rangeTotal++;
    var dpjp = String(r[12]||'').trim(); if(dpjp) dpjpMap[dpjp]=(dpjpMap[dpjp]||0)+1;
    var kondisi = String(r[19]||'').trim(); if(kondisi) kondisiMap[kondisi]=(kondisiMap[kondisi]||0)+1;
    var jamR = String(r[8]||'').trim(); if(jamR) jaminanRangeMap[jamR]=(jaminanRangeMap[jamR]||0)+1;
    var tglLahir = r[4];
    if(tglLahir instanceof Date && tglMasukR instanceof Date && tglMasukR>tglLahir){
      var age=(tglMasukR-tglLahir)/(86400000*365.25);
      if(age>0&&age<130) umurList.push(Math.round(age*10)/10);
    }
    var lama=r[15];
    var lamaNum=(typeof lama==='number')?lama:parseFloat(String(lama||''));
    if(!isNaN(lamaNum)&&lamaNum>0) lamaList.push(lamaNum);
  });

  // §8 — Diagnosis & Alat Medik dihitung LANGSUNG dari ws1 (Laporan) dengan
  // semantik "1 pasien 1 hitungan": ambil 1 baris per pasien (kemunculan paling
  // awal berdasarkan tanggal kolom B). Tanggal pakai kolom B → filter date-precise
  // (tahun & rentang). Tidak bergantung pada sheet Pivot.
  function toYMDflex(v){
    if(!v) return '';
    if(v instanceof Date){ try{return Utilities.formatDate(v,tz,'yyyy-MM-dd');}catch(e){return'';} }
    var s = String(v);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0,10);
    try{ var d=new Date(s); if(!isNaN(d.getTime())) return Utilities.formatDate(d,tz,'yyyy-MM-dd'); }catch(e){}
    return '';
  }
  var diagYearMap={}, diagRangeMap={}, alatYearMap={}, alatRangeMap={};
  (function(){
    var lr = ws1.getLastRow();
    if(lr < 2) return;
    var raw = ws1.getRange(2,1,lr-1,17).getValues(); // A..Q (B=tgl,E=nama,G=diag,I=alat)
    // 1 baris per pasien = kemunculan paling awal (tanggal terkecil; ties → baris pertama)
    var firstByPasien = {};
    raw.forEach(function(r){
      if(!r[0]) return;
      var nama = String(r[4]||'').toLowerCase().trim();
      if(!nama) return;
      var tgl = toYMDflex(r[1]);
      if(!tgl) return;
      var prev = firstByPasien[nama];
      if(!prev || tgl < prev.tgl){
        firstByPasien[nama] = {tgl:tgl, diag:String(r[6]||''), alat:String(r[8]||'')};
      }
    });
    Object.keys(firstByPasien).forEach(function(nm){
      var o = firstByPasien[nm];
      var inYear  = (o.tgl.substring(0,4) === tahunStr);
      var inRange = (!tglMulai || o.tgl >= tglMulai) && (!tglAkhir || o.tgl <= tglAkhir);
      if(!inYear && !inRange) return;
      // diagnosis: bersihkan seperti kolom R (lowercase, sisakan huruf/angka/; /spasi)
      var diagText = o.diag.toLowerCase().replace(/[^a-z0-9; ]/g,' ');
      DIAGNOSIS_LIST.forEach(function(d){
        if(diagText.indexOf(d) >= 0){
          if(inYear)  diagYearMap[d]  = (diagYearMap[d]||0)  + 1;
          if(inRange) diagRangeMap[d] = (diagRangeMap[d]||0) + 1;
        }
      });
      // alat medik: kolom I dipisah ; atau ,
      var alatArr = String(o.alat).split(/[;,]/).map(function(a){return a.trim().toLowerCase();});
      ALAT_LIST.forEach(function(a){
        var disp    = (a.indexOf('|')>=0) ? a.split('|')[1] : a;
        var aliases = a.toLowerCase().split('|');
        for(var k=0;k<aliases.length;k++){
          if(alatArr.indexOf(aliases[k]) >= 0){
            if(inYear)  alatYearMap[disp]  = (alatYearMap[disp]||0)  + 1;
            if(inRange) alatRangeMap[disp] = (alatRangeMap[disp]||0) + 1;
            break;
          }
        }
      });
    });
  })();

  function stats(arr){
    if(!arr.length) return{avg:0,max:0,min:0,n:0};
    var sum=arr.reduce(function(a,b){return a+b;},0);
    return{n:arr.length,avg:Math.round(sum/arr.length*10)/10,
      max:Math.max.apply(null,arr),min:Math.min.apply(null,arr)};
  }
  function toList(map,total){
    return Object.keys(map).map(function(k){
      return{nama:k,jumlah:map[k],persen:total>0?Math.round(map[k]/total*1000)/10:0};
    }).sort(function(a,b){return b.jumlah-a.jumlah;});
  }

  var diagYearTotal=Object.values(diagYearMap).reduce(function(a,b){return a+b;},0);
  var diagRangeTotal=Object.values(diagRangeMap).reduce(function(a,b){return a+b;},0);
  var alatYearTotal=Object.values(alatYearMap).reduce(function(a,b){return a+b;},0);
  var alatRangeTotal=Object.values(alatRangeMap).reduce(function(a,b){return a+b;},0);

  var hasil = JSON.stringify({
    tahun:tahun, tglMulai:tglMulai||'', tglAkhir:tglAkhir||'',
    timeSeries:monthCounts,
    jaminan:toList(jaminanYear,jaminanYearTotal), jaminanTotal:jaminanYearTotal,
    diagYear:toList(diagYearMap,diagYearTotal).slice(0,15),   diagYearTotal:diagYearTotal,
    alatYear:toList(alatYearMap,alatYearTotal),               alatYearTotal:alatYearTotal,
    dpjp:toList(dpjpMap,rangeTotal).slice(0,15),
    kondisi:toList(kondisiMap,rangeTotal),
    jaminanRange:toList(jaminanRangeMap,rangeTotal),
    diagRange:toList(diagRangeMap,diagRangeTotal).slice(0,15), diagRangeTotal:diagRangeTotal,
    alatRange:toList(alatRangeMap,alatRangeTotal),             alatRangeTotal:alatRangeTotal,
    umur:stats(umurList), lama:stats(lamaList),
    rangeTotal:rangeTotal
  });

  try{cache.put(cacheKey,hasil,600);}catch(e){}
  return hasil;
}

// ═══════════════════════════════════════════════════════
//  PAGE 8 — PIVOT INDIKATOR BULANAN (1 call / tahun)
//  Baris = penjabaran indikator; kolom = bulan dalam tahun.
//  Penyebut % per sel = jumlah pasien baru bulan itu (pasienBulan[mo]).
//  Sumber: Merge (pasien baru, jaminan, DPJP, cara keluar, umur, LOS);
//          ws1 (diagnosis & alat, 1 pasien 1 hitungan = kemunculan paling awal).
// ═══════════════════════════════════════════════════════
function getPivotBulananPage8(tahun) {
  var cacheKey = 'pivot8_' + tahun;
  var cache = CacheService.getScriptCache();
  var hit = cache.get(cacheKey);
  if(hit) return hit;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Merge');
  if(!ws) return JSON.stringify({error:'Sheet "Merge" tidak ditemukan'});
  var lastRow = ws.getLastRow();
  if(lastRow < 2) return JSON.stringify({error:'Data Merge kosong'});

  var tz = Session.getScriptTimeZone();
  var tahunStr = String(tahun);
  var data = ws.getRange(2, 1, lastRow - 1, 20).getValues();

  function toYMD(v){
    if(!v) return '';
    if(v instanceof Date){ try{return Utilities.formatDate(v,tz,'yyyy-MM-dd');}catch(e){return'';} }
    return '';
  }
  function newRow(){ return [0,0,0,0,0,0,0,0,0,0,0,0]; }
  function bump(map,key,mo){ if(!map[key]) map[key]=newRow(); map[key][mo]++; }
  function sum(arr){ var s=0; for(var i=0;i<arr.length;i++) s+=arr[i]; return s; }

  // ── Bucket umur (neonatal–anak) & LOS ──
  var UMUR_LABELS = ['<28 hari','28 hari–<1 th','1–<5 th','5–<12 th','12–<18 th','≥18 th'];
  function umurLabel(days){
    if(days < 28) return UMUR_LABELS[0];
    var yr = days/365.25;
    if(yr < 1)  return UMUR_LABELS[1];
    if(yr < 5)  return UMUR_LABELS[2];
    if(yr < 12) return UMUR_LABELS[3];
    if(yr < 18) return UMUR_LABELS[4];
    return UMUR_LABELS[5];
  }
  var LOS_LABELS = ['1–3 hari','4–7 hari','8–14 hari','>14 hari'];
  function losLabel(d){
    if(d <= 3)  return LOS_LABELS[0];
    if(d <= 7)  return LOS_LABELS[1];
    if(d <= 14) return LOS_LABELS[2];
    return LOS_LABELS[3];
  }

  var pasienBulan = newRow();
  var jaminanMap = {}, dpjpMap = {}, caraMap = {}, umurMap = {}, losMap = {};

  data.forEach(function(r){
    var tglMasukR = r[10];
    var ymd = toYMD(tglMasukR);
    if(!ymd || ymd.substring(0,4) !== tahunStr) return;
    var mo = parseInt(ymd.substring(5,7),10) - 1;
    if(mo < 0 || mo > 11) return;
    pasienBulan[mo]++;
    var jam = String(r[8]||'').trim();  if(jam) bump(jaminanMap,jam,mo);
    var dp  = String(r[12]||'').trim(); if(dp)  bump(dpjpMap,dp,mo);
    var ck  = String(r[19]||'').trim(); if(ck)  bump(caraMap,ck,mo);
    var tglLahir = r[4];
    if(tglLahir instanceof Date && tglMasukR instanceof Date && tglMasukR > tglLahir){
      var days = (tglMasukR - tglLahir)/86400000;
      if(days >= 0 && days/365.25 < 130) bump(umurMap, umurLabel(days), mo);
    }
    var lama = r[15];
    var lamaNum = (typeof lama==='number') ? lama : parseFloat(String(lama||''));
    if(!isNaN(lamaNum) && lamaNum > 0) bump(losMap, losLabel(lamaNum), mo);
  });

  // ── Diagnosis & Alat dari ws1 (1 pasien 1 hitungan, kemunculan paling awal) ──
  var diagMap = {}, alatMap = {};
  (function(){
    var lr = ws1.getLastRow();
    if(lr < 2) return;
    var raw = ws1.getRange(2,1,lr-1,17).getValues();
    function toYMDflex(v){
      if(!v) return '';
      if(v instanceof Date){ try{return Utilities.formatDate(v,tz,'yyyy-MM-dd');}catch(e){return'';} }
      var s = String(v);
      if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0,10);
      try{ var d=new Date(s); if(!isNaN(d.getTime())) return Utilities.formatDate(d,tz,'yyyy-MM-dd'); }catch(e){}
      return '';
    }
    var firstByPasien = {};
    raw.forEach(function(r){
      if(!r[0]) return;
      var nama = String(r[4]||'').toLowerCase().trim();
      if(!nama) return;
      var tgl = toYMDflex(r[1]);
      if(!tgl) return;
      var prev = firstByPasien[nama];
      if(!prev || tgl < prev.tgl) firstByPasien[nama] = {tgl:tgl, diag:String(r[6]||''), alat:String(r[8]||'')};
    });
    Object.keys(firstByPasien).forEach(function(nm){
      var o = firstByPasien[nm];
      if(o.tgl.substring(0,4) !== tahunStr) return;
      var mo = parseInt(o.tgl.substring(5,7),10) - 1;
      if(mo < 0 || mo > 11) return;
      var diagText = o.diag.toLowerCase().replace(/[^a-z0-9; ]/g,' ');
      DIAGNOSIS_LIST.forEach(function(d){ if(diagText.indexOf(d) >= 0) bump(diagMap,d,mo); });
      var alatArr = String(o.alat).split(/[;,]/).map(function(a){return a.trim().toLowerCase();});
      ALAT_LIST.forEach(function(a){
        var disp = (a.indexOf('|')>=0) ? a.split('|')[1] : a;
        var aliases = a.toLowerCase().split('|');
        for(var k=0;k<aliases.length;k++){ if(alatArr.indexOf(aliases[k]) >= 0){ bump(alatMap,disp,mo); break; } }
      });
    });
  })();

  // map → rows (urut total desc; atau fixedOrder untuk bucket; limit opsional)
  function mapToRows(map, limit, fixedOrder){
    var keys;
    if(fixedOrder){ keys = fixedOrder.filter(function(k){ return map[k]; }); }
    else { keys = Object.keys(map).sort(function(a,b){ return sum(map[b]) - sum(map[a]); }); }
    var rows = keys.map(function(k){ return {nama:k, bulan:map[k], total:sum(map[k])}; });
    if(limit && rows.length > limit) rows = rows.slice(0, limit);
    return rows;
  }

  var pasienTotal = sum(pasienBulan);
  var seksi = [
    {judul:'Pasien Baru', persen:false, rows:[{nama:'Jumlah pasien baru', bulan:pasienBulan, total:pasienTotal}]},
    {judul:'Diagnosis Terbanyak', persen:true, rows:mapToRows(diagMap,15)},
    {judul:'Alat Medik Terbanyak', persen:true, rows:mapToRows(alatMap,15)},
    {judul:'DPJP', persen:true, rows:mapToRows(dpjpMap,15)},
    {judul:'Jaminan', persen:true, rows:mapToRows(jaminanMap)},
    {judul:'Cara Keluar', persen:true, rows:mapToRows(caraMap)},
    {judul:'Distribusi Umur', persen:true, rows:mapToRows(umurMap,0,UMUR_LABELS)},
    {judul:'Distribusi Length of Stay (ICU)', persen:true, rows:mapToRows(losMap,0,LOS_LABELS)}
  ];

  var hasil = JSON.stringify({
    tahun:tahun, pasienBulan:pasienBulan, pasienTotal:pasienTotal, seksi:seksi
  });
  try{cache.put(cacheKey,hasil,600);}catch(e){}
  return hasil;
}

// ═══════════════════════════════════════════════════════
//  REFRESH PIVOT (§8) — agregasi bulanan dari ws1.
//  CATATAN: sistem ini TIDAK memakai arsip (data Goretty relatif kecil),
//  jadi pivot dihitung 100% dari sheet Laporan (ws1).
//  Diagnosis & alat dihitung HANYA dari baris yang kolom R (DiagnosisEdited)
//  terisi → otomatis 1 pasien 1 hitungan.
// ═══════════════════════════════════════════════════════
// Daftar diagnosis sudah dirapikan & di-dedupe dari README (urutan kemunculan pertama).
const DIAGNOSIS_LIST = [
  'ards','pneumonia','influenza','hiponatremia','peritonitis','post op','ispa',
  'viral infection','hmd','prematur','hiperbilirubin','dhf','ensefalopati',
  'low intake','dss','dehidrasi','hipoglikemia','sepsis','rd','ttn','hipokalemia',
  'ivh','ich','kejang demam','bronchopneumonia','bp','syok','hiperglikemia','demam',
  'hiperpireksia','nkb','hyaline membrane disease','isk','hipoglikemi','gea','dengue',
  'snad','ileus','tutup','respiratory distress','ependimoma','astma','sifilis',
  'pertusis','bronkiolitis','anemia'
];

const ALAT_LIST = [
  'CAPD','Chemoport','Cimino','CPAP','CRRT','CVC',
  'Doublelumen|Double lumen HD','Drain','Facemask','HFNC','ICON','Kateter',
  'Nasalkanul','Nefrostomi','NGT','NIV','PICC',
  'Trakeostomi','Triplelumen|Triple lumen HD','Umbicath','Ventilator','WSD'
];

function refreshPivot() {
  var tz = Session.getScriptTimeZone();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Kumpulkan semua baris dari ws1 (anti-dobel via nomor) ──
  var semua = [];
  var nomorTerpakai = {};
  var lr1 = ws1.getLastRow();
  if(lr1 >= 2) {
    var raw1 = ws1.getRange(2, 1, lr1 - 1, 18).getValues(); // A..R
    raw1.forEach(function(r) {
      if(!r[0]) return;
      var nomor = Number(r[0]);
      if(nomorTerpakai[nomor]) return;
      nomorTerpakai[nomor] = true;
      semua.push({ nomor:nomor, tgl:r[1], diagEdited:String(r[17]||''), alat:String(r[8]||'') });
    });
  }

  // ── Agregasi per bulan (yyyy-MM) ──
  var bulanMap = {};
  semua.forEach(function(o) {
    if(!o.tgl) return;
    var tglStr = (o.tgl instanceof Date)
      ? Utilities.formatDate(o.tgl, tz, 'yyyy-MM')
      : String(o.tgl).substring(0, 7);
    if(!tglStr || tglStr.length < 7) return;

    var diagTeks = String(o.diagEdited || '').toLowerCase().trim();
    if(!diagTeks) return; // kolom R kosong → bukan baris pertama pasien → lewati

    if(!bulanMap[tglStr]) {
      var diagObj = {}, alatObj = {};
      DIAGNOSIS_LIST.forEach(function(d) { diagObj[d] = 0; });
      ALAT_LIST.forEach(function(a)      { alatObj[a] = 0; });
      bulanMap[tglStr] = { diag: diagObj, alat: alatObj };
    }
    var bln = bulanMap[tglStr];

    DIAGNOSIS_LIST.forEach(function(d) {
      if(diagTeks.indexOf(d) >= 0) bln.diag[d]++;
    });
    var alatTeks = String(o.alat || '').trim();
    if(alatTeks) {
      var alatArr = alatTeks.split(/[;,]/).map(function(a) { return a.trim().toLowerCase(); });
      ALAT_LIST.forEach(function(a) {
        // dukung alias "id|label"
        var aliases = a.toLowerCase().split('|');
        for(var k = 0; k < aliases.length; k++) {
          if(alatArr.indexOf(aliases[k]) >= 0) { bln.alat[a]++; break; }
        }
      });
    }
  });

  var bulanList = Object.keys(bulanMap).sort(); // ASCENDING (lama → baru)

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
    var row = [new Date(bln + '-01')];
    DIAGNOSIS_LIST.forEach(function(d) { row.push(bulanMap[bln].diag[d]); });
    return row;
  });
  var alatData = bulanList.map(function(bln) {
    var row = [new Date(bln + '-01')];
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

// Sekali-jalan untuk MEMULIHKAN pivot dari ws1.
function pulihkanPivot() {
  refreshPivot();
  Logger.log('Pivot dipulihkan dari ws1. Cek sheet Pivot Diagnosis & Pivot Alat Medik.');
}

function _tulisSheet_(ss, namaSheet, header, dataRows) {
  var sh = ss.getSheetByName(namaSheet);
  if(!sh) { sh = ss.insertSheet(namaSheet); }
  else    { sh.clearContents(); }
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if(dataRows.length > 0) {
    sh.getRange(2, 1, dataRows.length, header.length).setValues(dataRows);
  }
  var nDataBaris = dataRows.length - 1; // baris terakhir = TOTAL (teks), jangan diformat tanggal
  if(nDataBaris > 0) {
    sh.getRange(2, 1, nDataBaris, 1).setNumberFormat('yyyy-MM');
  }
  sh.setFrozenRows(1);
}

function getPivotStatistik() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function bacaSheet(namaSheet) {
    var sh = ss.getSheetByName(namaSheet);
    if(!sh || sh.getLastRow() < 2) return { header: [], rows: [] };
    var all    = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var header = all[0].map(function(h) { return String(h); });
    var rows   = all.slice(1).map(function(r) {
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

// Pasang trigger harian refreshPivot jam 01:00 (jalankan sekali secara manual).
function pasangTriggerMalam() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if(t.getHandlerFunction() === 'refreshPivot') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshPivot').timeBased().atHour(1).everyDays(1).create();
}

// ═══════════════════════════════════════════════════════
//  PAGE 9 — LOGBOOK PERAWAT GORETTY (READ-ONLY)
//  Sumber: spreadsheet eksternal; HANYA membaca (tidak menulis apa pun).
//  Semua posisi kolom terverifikasi (lihat techspec). 8 domain.
// ═══════════════════════════════════════════════════════
var LBG_SS_ID  = '11pJK2JfLt1Zv1iJN4YFSakGo65Yn4daw2hFm0DXJX1M';
var LBG_SHEET  = 'Proses form';
var LBG_LOOKUP = 'LookUp';

var LBG_DOMAINS    = ["Oksigen","Obat","Cairan","TTV","Dokumen","Kebutuhan","Asuhan","Alat"];
var LBG_TARGET_MAP = { "I":80, "II":80, "III":75, "IV":80, "V":43 };
var LBG_PK_NUMBER  = { "I":1, "II":2, "III":3, "IV":4, "V":5 };

// Indeks 0-based saat baca A:DC (kolom 1..107)
var LBG_IDX_TGL    = 16;                       // Q  = Tanggal
var LBG_IDX_NPK    = 17;                       // R  = NPK
var LBG_FLAG_START = 19;                       // T  = flag domain pertama (0-based)
var LBG_NDOMAIN    = 8;
var LBG_IDX_NILAI  = [100,101,102,103,104];    // CW..DA = Jumlah PK 1..5 (0-based)
var LBG_READ_NCOLS = 107;                      // baca A:DC

// Konversi aman ke number (dukung "0,1125" bergaya Indonesia bila tersimpan teks).
function lbGNum_(x) {
  if(x === null || x === undefined || x === '') return 0;
  if(typeof x === 'number') return isNaN(x) ? 0 : x;
  var s = String(x).trim().replace(/\s/g,'');
  if(!s) return 0;
  if(s.indexOf(',') >= 0) s = s.replace(/\./g,'').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Tanggal baris: kolom Q; fallback ke A (Timestamp).
function lbGRowDate_(r) {
  var q = r[LBG_IDX_TGL];
  if(q instanceof Date) return q;
  var a = r[0];
  if(a instanceof Date) return a;
  return null;
}

function lbGNow_(tz) {
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

// Master perawat: NPK(A)→{nama(B), pk(D)}
function lbGLookup_() {
  var map = {};
  try {
    var sh = SpreadsheetApp.openById(LBG_SS_ID).getSheetByName(LBG_LOOKUP);
    if(!sh) return map;
    var lr = sh.getLastRow();
    if(lr < 2) return map;
    var vals = sh.getRange(2, 1, lr - 1, 4).getValues(); // A:D
    vals.forEach(function(r) {
      var npk = String(r[0] == null ? '' : r[0]).trim();
      if(!npk) return;
      var nama = String(r[1] == null ? '' : r[1]).trim();
      var pk   = String(r[3] == null ? '' : r[3]).trim().toUpperCase();
      map[npk] = { nama: nama || npk, pk: pk || '?' };
    });
  } catch(e) {}
  return map;
}

function getDaftarPerawatGoretty() {
  var map = lbGLookup_();
  var arr = Object.keys(map).map(function(npk) {
    return { npk: npk, nama: map[npk].nama, pk: map[npk].pk };
  });
  arr.sort(function(a, b) { return String(a.nama).localeCompare(String(b.nama)); });
  return JSON.stringify(arr);
}

function getTahunTersediaGoretty() {
  var tz = Session.getScriptTimeZone();
  var sh = SpreadsheetApp.openById(LBG_SS_ID).getSheetByName(LBG_SHEET);
  if(!sh) return JSON.stringify([]);
  var lr = sh.getLastRow();
  if(lr < 2) return JSON.stringify([]);
  var data = sh.getRange(2, 1, lr - 1, 17).getValues(); // A:Q (cukup untuk tanggal)
  var set = {};
  data.forEach(function(r) {
    var d = lbGRowDate_(r);
    if(d instanceof Date) {
      var y = parseInt(Utilities.formatDate(d, tz, 'yyyy'), 10);
      if(y) set[y] = true;
    }
  });
  var years = Object.keys(set).map(Number).sort(function(a, b) { return b - a; });
  return JSON.stringify(years);
}

function getAgregatTahunGoretty(tahun, force) {
  tahun = parseInt(tahun, 10);
  var cache = CacheService.getScriptCache();
  var baseKey = 'agg_goretty_' + tahun;
  if(!force) {
    var got = lbGCacheGet_(cache, baseKey);
    if(got) return got;
  }
  var hasil = lbGComputeTahun_(tahun);
  lbGCachePut_(cache, baseKey, hasil, tahun);
  return hasil;
}

function lbGComputeTahun_(tahun) {
  var tz = Session.getScriptTimeZone();
  var lookup = lbGLookup_();
  var sh = SpreadsheetApp.openById(LBG_SS_ID).getSheetByName(LBG_SHEET);
  if(!sh) return JSON.stringify({ tahun: tahun, generatedAt: lbGNow_(tz), bulanTersedia: [], rows: [] });
  var lr = sh.getLastRow();
  if(lr < 2) return JSON.stringify({ tahun: tahun, generatedAt: lbGNow_(tz), bulanTersedia: [], rows: [] });

  var data = sh.getRange(2, 1, lr - 1, LBG_READ_NCOLS).getValues(); // A:DC
  var agg = {};         // npk -> bulan -> {domain[8], nilaiPK[5], jumlahTindakan}
  var bulanSet = {};

  data.forEach(function(r) {
    var d = lbGRowDate_(r);
    if(!(d instanceof Date)) return;
    if(parseInt(Utilities.formatDate(d, tz, 'yyyy'), 10) !== tahun) return;
    var bulan = parseInt(Utilities.formatDate(d, tz, 'M'), 10); // 1..12
    var npk = String(r[LBG_IDX_NPK] == null ? '' : r[LBG_IDX_NPK]).trim();
    if(!npk) return; // edge: NPK kosong → tidak bisa diatribusikan

    if(!agg[npk]) agg[npk] = {};
    if(!agg[npk][bulan]) {
      agg[npk][bulan] = { domain: [0,0,0,0,0,0,0,0], nilaiPK: [0,0,0,0,0], jumlahTindakan: 0 };
    }
    var slot = agg[npk][bulan];
    for(var dm = 0; dm < LBG_NDOMAIN; dm++) {
      var base = LBG_FLAG_START + dm * 5;
      var dc = 0;
      for(var k = 0; k < 5; k++) dc += lbGNum_(r[base + k]);
      slot.domain[dm] += dc;
      slot.jumlahTindakan += dc;
    }
    for(var n = 0; n < 5; n++) slot.nilaiPK[n] += lbGNum_(r[LBG_IDX_NILAI[n]]);
    bulanSet[bulan] = true;
  });

  var rows = [];
  Object.keys(agg).forEach(function(npk) {
    var info = lookup[npk] || { nama: npk, pk: '?' };
    var pkNumber = LBG_PK_NUMBER[info.pk] || null;
    var target = (LBG_TARGET_MAP[info.pk] !== undefined) ? LBG_TARGET_MAP[info.pk] : '';
    Object.keys(agg[npk]).forEach(function(bln) {
      var s = agg[npk][bln];
      var domObj = {};
      for(var i = 0; i < LBG_NDOMAIN; i++) domObj[LBG_DOMAINS[i]] = s.domain[i];
      var totalNilai = s.nilaiPK.reduce(function(a, b) { return a + b; }, 0);
      rows.push({
        npk: npk, nama: info.nama, pk: info.pk, pkNumber: pkNumber, target: target,
        bulan: parseInt(bln, 10),
        jumlahTindakan: s.jumlahTindakan,
        domain: domObj,
        nilaiPK: s.nilaiPK,
        totalNilai: totalNilai,
        nilaiSesuaiPK: pkNumber ? s.nilaiPK[pkNumber - 1] : 0
      });
    });
  });
  rows.sort(function(a, b) {
    var c = String(a.nama).localeCompare(String(b.nama));
    return c !== 0 ? c : a.bulan - b.bulan;
  });
  var bulanTersedia = Object.keys(bulanSet).map(Number).sort(function(a, b) { return a - b; });
  return JSON.stringify({ tahun: tahun, generatedAt: lbGNow_(tz), bulanTersedia: bulanTersedia, rows: rows });
}

// ── Cache ber-chunk (payload bisa > 100KB/key) ──
function lbGCachePut_(cache, baseKey, str, tahun) {
  var tz = Session.getScriptTimeZone();
  var curYear = parseInt(Utilities.formatDate(new Date(), tz, 'yyyy'), 10);
  var ttl = (tahun === curYear) ? 1800 : 21600; // 30 menit / 6 jam
  var CHUNK = 90000;
  var n = Math.ceil(str.length / CHUNK) || 1;
  var obj = {};
  obj[baseKey + '_n'] = String(n);
  for(var i = 0; i < n; i++) obj[baseKey + '_' + i] = str.substring(i * CHUNK, (i + 1) * CHUNK);
  try { cache.putAll(obj, ttl); } catch(e) {}
}
function lbGCacheGet_(cache, baseKey) {
  var nStr = cache.get(baseKey + '_n');
  if(!nStr) return null;
  var n = parseInt(nStr, 10);
  if(!n) return null;
  var keys = [];
  for(var i = 0; i < n; i++) keys.push(baseKey + '_' + i);
  var got = cache.getAll(keys);
  var parts = [];
  for(var j = 0; j < n; j++) {
    var p = got[baseKey + '_' + j];
    if(p == null) return null; // ada chunk hilang → anggap miss
    parts.push(p);
  }
  return parts.join('');
}

// Helper validasi manual (read-only): rincian baris 1 perawat dalam setahun.
function lbGDebugPerawat(npk, tahun) {
  tahun = parseInt(tahun, 10);
  var tz = Session.getScriptTimeZone();
  var sh = SpreadsheetApp.openById(LBG_SS_ID).getSheetByName(LBG_SHEET);
  if(!sh) return JSON.stringify([]);
  var lr = sh.getLastRow();
  if(lr < 2) return JSON.stringify([]);
  var data = sh.getRange(2, 1, lr - 1, LBG_READ_NCOLS).getValues();
  var out = [];
  var tgt = String(npk).trim();
  data.forEach(function(r, idx) {
    if(String(r[LBG_IDX_NPK] == null ? '' : r[LBG_IDX_NPK]).trim() !== tgt) return;
    var d = lbGRowDate_(r);
    if(!(d instanceof Date)) return;
    if(parseInt(Utilities.formatDate(d, tz, 'yyyy'), 10) !== tahun) return;
    var dom = [];
    for(var dm = 0; dm < LBG_NDOMAIN; dm++) {
      var base = LBG_FLAG_START + dm * 5, c = 0;
      for(var k = 0; k < 5; k++) c += lbGNum_(r[base + k]);
      dom.push(c);
    }
    out.push({
      row: idx + 2, bulan: parseInt(Utilities.formatDate(d, tz, 'M'), 10),
      domain: dom,
      nilaiPK: LBG_IDX_NILAI.map(function(i) { return lbGNum_(r[i]); }),
      jumlahTindakanCV: lbGNum_(r[99]),   // CV
      nilaiSesuaiPKdb: lbGNum_(r[105])    // DB
    });
  });
  return JSON.stringify(out);
}
