// ═══════════════════════════════════════════════════════
//  code.gs  —  Laporan Dinas Goretty
// ═══════════════════════════════════════════════════════

const ws1 = getsheetbyid(0);           // Laporan
const ws2 = getsheetbyid(1476005123);  // Pasien hari ini
const ws3 = getsheetbyid(2028034470);  // Lookup

function getsheetbyid(gid) {
  return SpreadsheetApp.getActiveSpreadsheet()
    .getSheets().find(s => s.getSheetId() == gid);
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

const opsiperawat = opsi("E2:E").map(d=>`<option>${d}</option>`).join("");
const opsipasien  = opsi("I2:I").map(d=>`<option>${d}</option>`).join("");
const opsitempat  = opsi("C2:C").map(d=>`<option>${d[0]}</option>`).join("");

const htmlCheckbox = [
  'CAPD','Chemoport','Cimino','CPAP','CRRT','CVC',
  'Doublelumen|Double lumen HD','Drain','Facemask','HFNC','ICON','Kateter',
  'Nasalkanul','Nefrostomi','NGT','NIV','PICC',
  'Trakeostomi','Triplelumen|Triple lumen HD','Umbicath','Ventilator','WSD'
].map(function(item){
  var p = item.split("|");
  return `<label class="check-item" for="${p[0]}"><input type="checkbox" id="${p[0]}" class="multi" value="${p[0]}" disabled>${p[1]||p[0]}</label>`;
}).join("\n");

function doGet(e) {
  var tmpl = HtmlService.createTemplateFromFile("index");
  tmpl.initPage  = (e&&e.parameter&&e.parameter.p) ? String(e.parameter.p) : '1';
  tmpl.initNomor = (e&&e.parameter&&e.parameter.n) ? String(e.parameter.n) : '0';
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
    var hariIni = Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
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

function updateLaporan(nomor, isiLaporan) {
  ws1.getRange(Number(nomor)+1, 8).setValue(isiLaporan);
  CacheService.getScriptCache().removeAll(['p1_data','init_data']);
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
  var total = ws1.getLastRow()-1;
  if(total<1) return JSON.stringify({total:0, baris:[[]]});
  var hasil = JSON.stringify({total:total, baris:ws1.getRange(ws1.getLastRow(),1,1,17).getValues()});
  try{cache.put('init_data', hasil, 45);}catch(e){}
  return hasil;
}

function caridata(record) {
  if(!record||record==='') return '';
  return JSON.stringify(ws1.getRange(Number(record)+1,1,1,17).getValues());
}

function baristerakhir() { return ws1.getLastRow()-1; }

function umuragamajaminan(sourcepasien) {
  var rows = ws2.getRange(2,1,Math.max(ws2.getLastRow()-1,1),16).getValues();
  var b = rows.find(function(r){return r[1]==sourcepasien;});
  return JSON.stringify(b||null);
}

function getNomorBaruDanDataPasien(namaPasien, shift) {
  var n = ws1.getLastRow();
  var rows = ws2.getRange(2,1,Math.max(ws2.getLastRow()-1,1),16).getValues();
  var b = rows.find(function(r){return r[1]==namaPasien;});
  return JSON.stringify({nomorBaru:n, dataPasien:b||null, shift:shift});
}

function simpandisheet(ui) {
  var total = baristerakhir(), baris = Number(ui.nomor)+1;
  var row = [ui.nomor,ui.tanggal,ui.dinas,ui.pj,ui.pasien,ui.pp,
             ui.diagnosis,ui.laporan,ui.alatmedik,new Date(),
             ui.agama,ui.jaminan,ui.dpjp,ui.dpjplain,ui.umur,ui.harike,ui.bed];
  if(ui.nomor>total){ ws1.appendRow(row); }
  else{ ws1.getRange(baris,1,1,17).setValues([row]); }
  CacheService.getScriptCache().removeAll(['p1_data','init_data']);
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
  var cacheKey = 'stat8_'+tahun+'_'+(tglMulai||'')+'_'+(tglAkhir||'');
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

  // Diagnosis (A=tanggal, B=diagnosis)
  var diagYearMap={}, diagRangeMap={};
  try {
    var wsDiag = ss.getSheetByName('Diagnosis');
    if(wsDiag && wsDiag.getLastRow()>1){
      wsDiag.getRange(2,1,wsDiag.getLastRow()-1,2).getValues().forEach(function(r){
        var tgl=toYMD(r[0]); var diag=String(r[1]||'').trim();
        if(!tgl||!diag) return;
        if(tgl.substring(0,4)===tahunStr) diagYearMap[diag]=(diagYearMap[diag]||0)+1;
        if((!tglMulai||tgl>=tglMulai)&&(!tglAkhir||tgl<=tglAkhir)) diagRangeMap[diag]=(diagRangeMap[diag]||0)+1;
      });
    }
  } catch(e) {}

  // Alat Medik (A=tanggal, C=alat)
  var alatYearMap={}, alatRangeMap={};
  try {
    var wsAlat = ss.getSheetByName('Alat Medik');
    if(wsAlat && wsAlat.getLastRow()>1){
      wsAlat.getRange(2,1,wsAlat.getLastRow()-1,3).getValues().forEach(function(r){
        var tgl=toYMD(r[0]); var alat=String(r[2]||'').trim();
        if(!tgl||!alat) return;
        if(tgl.substring(0,4)===tahunStr) alatYearMap[alat]=(alatYearMap[alat]||0)+1;
        if((!tglMulai||tgl>=tglMulai)&&(!tglAkhir||tgl<=tglAkhir)) alatRangeMap[alat]=(alatRangeMap[alat]||0)+1;
      });
    }
  } catch(e) {}

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
