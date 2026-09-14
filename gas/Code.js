/**
 * 経堂アイデアプール「既存マシン」→ JSON API
 * ＋「新マシン」寸法検証・整理
 */
var SHEET_ID = '1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw';
/** 共有キー。Sheets APIキーでは書けないため、GAS書き込みの合言葉として使う */
var WRITE_KEY = '13KF93oRcK7Ru3gQicsIIoU9aJiM-zuB0DZzu2PrpnXhX0AHYzj49RR8I';
var SHEET_NAME = '既存マシン';
var NEW_SHEET_NAME = '新マシン';
var EXTRA_SHEET_NAME = '追加マシン';
var EXTRA_HEADERS = [
  'マシンID',
  '登録日時',
  '登録者',
  '名称',
  '商品URL',
  '幅_cm',
  '奥行_cm',
  '区分',
  'ジャンル',
  '台数',
  '図面対象',
  'place_url',
  'preview_url',
  '備考'
];
var GENRE_JP = {
  stack: 'スタック',
  plate: 'プレート',
  freeweight: 'フリーウェイト',
  cardio: '有酸素',
  hyrox: 'HYROX',
  pilates: 'ピラティス'
};
var CLEARANCE_CM = 80;
var CAT_MAP = {
  '有酸素': 'cardio',
  'ウェイト': 'resistance',
  'フリーウェイト': 'freeweight'
};

function doGet(e) {
  try {
    var op = e && e.parameter && e.parameter.op ? String(e.parameter.op) : '';
    if (op === 'update-new-dims') {
      var msg = updateNewMachinesVerified();
      return json_({ ok: true, op: op, message: msg, at: new Date().toISOString() });
    }
    if (op === 'remove-hyrox') {
      var removedMsg = removeHyroxFromNewMachines();
      return json_({ ok: true, op: op, message: removedMsg, at: new Date().toISOString() });
    }
    if (op === 'upsert-extra-machine') {
      var payload = {};
      try {
        payload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      } catch (parseErr) {
        throw new Error('invalid payload');
      }
      requireWriteKey_(e, payload);
      var upserted = upsertExtraMachine_(payload);
      return json_({
        ok: true,
        op: op,
        action: upserted.action,
        message: upserted.message,
        verified: true,
        at: new Date().toISOString()
      });
    }
    var machines = getExistingMachines_();
    return json_({
      ok: true,
      source: 'gas:既存マシン',
      syncedAt: new Date().toISOString(),
      count: machines.length,
      machines: machines
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function getExistingMachines_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('sheet not found: ' + SHEET_NAME);
  var values = sh.getDataRange().getDisplayValues();
  if (!values.length) return [];
  var header = values[0];
  var idx = {};
  for (var i = 0; i < header.length; i++) idx[String(header[i]).trim()] = i;

  var used = {};
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = String(row[idx['名称']] || '').trim();
    if (!name) continue;
    var photo = String(row[idx['写真']] || '').trim();
    var id = resolveId_(photo, used);
    if (!id) continue;
    var widthCm = mmToCm_(row[idx['幅(mm)']]);
    var lengthCm = mmToCm_(row[idx['奥行(mm)']]);
    if (widthCm == null || lengthCm == null) continue;
    var qty = Number(row[idx['台数']]) || 1;
    var category = CAT_MAP[String(row[idx['カテゴリ']] || '').trim()] || 'resistance';
    var brand = String(row[idx['ブランド']] || '').trim();
    var model = String(row[idx['シリーズ/型番']] || '').trim();
    var displayName = name;
    if (name === 'ケーブルマシン' && brand) displayName = brand + ' ケーブルマシン';
    var files = filesFor_(id, photo);
    var moduleW = widthCm + CLEARANCE_CM * 2;
    var moduleL = lengthCm + CLEARANCE_CM * 2;
    out.push({
      id: id,
      name: displayName,
      brand: brand,
      model: model,
      category: category,
      qty: qty,
      width_cm: widthCm,
      length_cm: lengthCm,
      clearance_cm: CLEARANCE_CM,
      module_width_cm: moduleW,
      module_length_cm: moduleL,
      place_px_w: moduleW,
      place_px_h: moduleL,
      lp_image: files.lp_image,
      place_file: files.place_file,
      preview_file: files.preview_file,
      photo_key: photo
    });
  }
  return out;
}

function resolveId_(photo, used) {
  var base = String(photo || '').replace(/\.jpe?g$/i, '').replace(/\.png$/i, '').trim();
  if (!base) return null;
  if (base === 'cardio_3') {
    var id = used['cardio_3a'] ? 'cardio_3b' : 'cardio_3a';
    used[id] = true;
    return id;
  }
  used[base] = true;
  return base;
}

function filesFor_(id, photo) {
  if (id === 'resistance_10_11') {
    return {
      lp_image: 'resistance_10.jpg',
      place_file: 'resistance_10_place.png',
      preview_file: 'resistance_10_preview.png'
    };
  }
  if (id === 'cardio_3a' || id === 'cardio_3b') {
    return {
      lp_image: 'cardio_3.jpg',
      place_file: id + '_place.png',
      preview_file: id + '_preview.png'
    };
  }
  var key = String(photo || id).replace(/\.jpe?g$/i, '');
  return {
    lp_image: key + '.jpg',
    place_file: id + '_place.png',
    preview_file: id + '_preview.png'
  };
}

function mmToCm_(mm) {
  var n = Number(String(mm).replace(/[^\d.]/g, ''));
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n / 10);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function requireWriteKey_(e, body) {
  var k = '';
  if (e && e.parameter) k = String(e.parameter.k || e.parameter.key || '');
  if (!k && body) k = String(body.k || body.key || '');
  if (k !== WRITE_KEY) throw new Error('forbidden');
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var op = String((body && body.op) || (e && e.parameter && e.parameter.op) || '');
    if (op === 'upsert-extra-machine') {
      requireWriteKey_(e, body);
      var upserted = upsertExtraMachine_(body.machine || body);
      return json_({
        ok: true,
        op: op,
        action: upserted.action,
        message: upserted.message,
        verified: true,
        at: new Date().toISOString()
      });
    }
    return json_({ ok: false, error: 'unknown op' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function ensureExtraSheet_(ss) {
  var sh = ss.getSheetByName(EXTRA_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(EXTRA_SHEET_NAME);
    sh.getRange(1, 1, 1, EXTRA_HEADERS.length).setValues([EXTRA_HEADERS]);
    sh.setFrozenRows(1);
    return sh;
  }
  var first = String(sh.getRange(1, 1).getDisplayValue() || '').trim();
  if (!first) {
    sh.getRange(1, 1, 1, EXTRA_HEADERS.length).setValues([EXTRA_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function extraColIndex_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), EXTRA_HEADERS.length);
  var header = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var idx = {};
  for (var i = 0; i < header.length; i++) {
    var key = String(header[i] || '').trim();
    if (key) idx[key] = i;
  }
  return idx;
}

function upsertExtraMachine_(m) {
  m = m || {};
  var id = String(m.id || '').trim();
  if (!id) throw new Error('id required');
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ensureExtraSheet_(ss);
  var idx = extraColIndex_(sh);
  if (idx['マシンID'] == null) {
    sh.getRange(1, 1, 1, EXTRA_HEADERS.length).setValues([EXTRA_HEADERS]);
    idx = extraColIndex_(sh);
  }
  var idCol = idx['マシンID'];
  var lastRow = sh.getLastRow();
  var found = 0;
  if (lastRow >= 2 && idCol != null) {
    var ids = sh.getRange(2, idCol + 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim() === id) {
        found = i + 2;
        break;
      }
    }
  }
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var registeredAt = now;
  if (found && idx['登録日時'] != null) {
    var prev = String(sh.getRange(found, idx['登録日時'] + 1).getDisplayValue() || '').trim();
    if (prev) registeredAt = prev;
  }
  var genre = String(m.genre || '');
  var genreJp = GENRE_JP[genre] || genre;
  var kubun = m.source === 'existing' ? '既存' : '新規';
  var row = found || Math.max(lastRow, 1) + 1;
  function setCell_(key, val) {
    if (idx[key] == null) return;
    sh.getRange(row, idx[key] + 1).setValue(val);
  }
  setCell_('マシンID', id);
  setCell_('登録日時', registeredAt);
  setCell_('登録者', String(m.by || ''));
  setCell_('名称', String(m.name || ''));
  setCell_('商品URL', String(m.link || ''));
  setCell_('幅_cm', Number(m.width_cm) || '');
  setCell_('奥行_cm', Number(m.length_cm) || '');
  setCell_('区分', kubun);
  setCell_('ジャンル', genreJp);
  setCell_('台数', Number(m.qty) || 1);
  setCell_('図面対象', String(m.planTarget || 'YES'));
  setCell_('place_url', String(m.place_url || ''));
  setCell_('preview_url', String(m.preview_url || ''));
  setCell_('備考', String(m.note || ''));
  SpreadsheetApp.flush();
  var writtenId = String(sh.getRange(row, idx['マシンID'] + 1).getDisplayValue() || '').trim();
  if (writtenId !== id) throw new Error('verify failed: ' + writtenId);
  return {
    action: found ? 'updated' : 'appended',
    message: (found ? 'updated ' : 'appended ') + id,
    row: row
  };
}

/** clasp / 手動確認用 */
function debugMachines() {
  Logger.log(JSON.stringify(getExistingMachines_().slice(0, 3), null, 2));
}

/**
 * 新マシンから HYROX 系を削除（選び直しまでの一時クリア）
 * スプレッドシート紐づきエディタで実行、または ?op=remove-hyrox
 */
function removeHyroxFromNewMachines() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(NEW_SHEET_NAME);
  if (!sh) throw new Error('sheet not found: ' + NEW_SHEET_NAME);
  var values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return 'no data';

  var header = values[0].map(function (h) {
    return String(h || '').trim();
  });
  var idx = {};
  for (var i = 0; i < header.length; i++) {
    if (header[i] && idx[header[i]] == null) idx[header[i]] = i;
  }
  var zoneI = idx['ゾーン候補'] != null ? idx['ゾーン候補'] : 1;
  var nameI = idx['名称'] != null ? idx['名称'] : 9;
  var noteI = idx['備考'] != null ? idx['備考'] : 14;

  function isHyrox(zone, name, note) {
    var z = String(zone || '');
    var n = String(name || '');
    var m = String(note || '');
    if (/HYROX/i.test(z)) return true;
    if (
      /SkiErg|RowErg|BikeErg|POWER MAX|PowerMill|ClimbMill|Curve Treadmill|Wall Ball|Kettlebell|Tire Flip|Dog Sled|Farmer'?s? Walk|Log Bar|Y-2 Yoke|Sandbag/i.test(
        n
      )
    ) {
      return true;
    }
    if (/HYROX/i.test(m) && /Integrity\+|Cross Trainer|Treadmill/i.test(n)) return true;
    return false;
  }

  var kept = [values[0]];
  var removed = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = String(row[nameI] || '').trim();
    if (!name) continue;
    if (isHyrox(row[zoneI], name, row[noteI])) {
      removed.push(name);
      continue;
    }
    kept.push(row);
  }

  sh.clear();
  if (kept.length && kept[0].length) {
    sh.getRange(1, 1, kept.length, kept[0].length).setValues(kept);
  }
  sh.setFrozenRows(1);
  return 'removed ' + removed.length + ': ' + removed.join(' / ') + ' (kept ' + (kept.length - 1) + ')';
}

/**
 * 新マシンシート: 重複寸法列を削除し、公式突合結果で寸法を更新する。
 * clasp run updateNewMachinesVerified
 */
function updateNewMachinesVerified() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(NEW_SHEET_NAME);
  if (!sh) throw new Error('sheet not found: ' + NEW_SHEET_NAME);

  var values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) throw new Error('no data');

  var header = values[0].map(function (h) {
    return String(h || '').trim();
  });
  var idx = {};
  for (var i = 0; i < header.length; i++) {
    if (header[i] && idx[header[i]] == null) idx[header[i]] = i;
  }

  var nameI = idx['名称'];
  var priceI = idx['税抜単価'];
  var qtyI = idx['台数'];
  var subI = idx['税抜小計'];
  var linkI = idx['商品リンク'];
  var noteI = idx['備考'];
  var wI = idx['幅(mm)'];
  var dI = idx['奥行(mm)'];
  var hI = idx['高さ(mm)'];
  var confI = idx['寸法信頼度'];
  var memoI = idx['寸法メモ'];
  if (nameI == null || wI == null) throw new Error('required columns missing');

  var verified = verifiedDimsByName_();
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var out = [
    [
      '幅(mm)',
      '奥行(mm)',
      '高さ(mm)',
      '名称',
      '税抜単価',
      '台数',
      '税抜小計',
      '商品リンク',
      '備考',
      '寸法信頼度',
      '寸法メモ',
      '検証結果',
      '検証日'
    ]
  ];
  var summary = { ok: 0, fixed: 0, estimate: 0, skipped: 0, removed: 0 };

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = String(row[nameI] || '').trim();
    if (!name) continue;

    // 末尾の空Matrix行はHS Assistと重複のため除外
    if (name === 'Assist Dip & Chin') {
      summary.removed++;
      continue;
    }

    var w = num_(row[wI]);
    var d = num_(row[dI]);
    var h = num_(row[hI]);
    var conf = confI != null ? String(row[confI] || '').trim() : '';
    var memo = memoI != null ? String(row[memoI] || '').trim() : '';
    var result = '維持';

    var v = verified[name];
    if (v) {
      var changed =
        (v.w != null && w !== v.w) || (v.d != null && d !== v.d) || (v.h != null && h !== v.h);
      if (v.w != null) w = v.w;
      if (v.d != null) d = v.d;
      if (v.h != null) h = v.h;
      if (v.conf) conf = v.conf;
      if (v.memo) memo = v.memo;
      if (v.link) row[linkI] = v.link;
      result = changed ? '訂正' : v.result || '一致';
      if (changed) summary.fixed++;
      else if (result === '一致') summary.ok++;
      else if (conf === '低' || conf === '中') summary.estimate++;
      else summary.ok++;
    } else if (!w && !d && !h) {
      result = '寸法なし';
      summary.skipped++;
    } else {
      result = '未突合（既存値維持）';
      summary.estimate++;
    }

    out.push([
      w || '',
      d || '',
      h || '',
      name,
      row[priceI] || '',
      row[qtyI] || '',
      row[subI] || '',
      linkI != null ? row[linkI] || '' : '',
      noteI != null ? row[noteI] || '' : '',
      conf,
      memo,
      result,
      today
    ]);
  }

  sh.clearContents();
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.setFrozenRows(1);

  var msg =
    '新マシン更新: rows=' +
    (out.length - 1) +
    ' 一致/確認=' +
    summary.ok +
    ' 訂正=' +
    summary.fixed +
    ' 推定/未突合=' +
    summary.estimate +
    ' 削除=' +
    summary.removed;
  Logger.log(msg);
  return msg;
}

function num_(v) {
  var n = Number(String(v || '').replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** 名称完全一致で上書きする検証データ（幅/奥行/高さ=mm） */
function verifiedDimsByName_() {
  return {
    'HD Athletic NX Half Half Combo Rack': {
      w: 1500,
      d: 3000,
      h: 2310,
      conf: '低',
      memo: '構成可変。LF公式は奥行99〜302cm・高さ218/231cm。配置仮置き1500x3000x2310',
      result: '推定維持'
    },
    'Impact Suppression Platform / Platform床材': {
      w: 2400,
      d: 1920,
      h: 83,
      conf: '高',
      memo: 'ISP-6X8公式 LxWxH 192x240x8.3cm → 床置き幅2400×奥行1920',
      result: '高さ80→83訂正'
    },
    'ラバーダンベル EVA-D104 42.5kg〜60kg追加': {
      conf: '中',
      memo: 'ダンベル本体ではなくEVRB-C177ラック占有想定（要実測）',
      result: '推定維持'
    },
    'アジャスタブルインクラインベンチ EVRB-L139': {
      w: 1400,
      d: 760,
      h: 470,
      conf: '高',
      memo: 'Evolgear公式 W1400×D760×H470',
      result: '一致'
    },
    'Selectorized 3D Multi-Abductor Pro': {
      w: 1780,
      d: 740,
      h: 1450,
      conf: '高',
      memo: 'Precor GSL0622 公式 LxWxH 74x178x145cm',
      result: '一致'
    },
    'Hip Thrust Elite': {
      w: 1700,
      d: 1960,
      h: 1300,
      conf: '高',
      memo: 'Precor GPL0612 公式 LxWxH 196x170x130cm',
      result: '一致'
    },
    'Deadlift Elite': {
      w: 1880,
      d: 1700,
      h: 740,
      conf: '高',
      memo: 'Precor GPL0551 公式 LxWxH 170x188x74cm',
      result: '一致'
    },
    'Reloaded T Bar Row': {
      w: 1415,
      d: 1811,
      h: 638,
      conf: '高',
      memo: 'Arsenal公式 W55.7×H25.1×L71.3in → 1415x1811x638',
      result: '微修正'
    },
    'Pure Kraft High Row Dual': {
      w: 1380,
      d: 1580,
      h: 2030,
      conf: '高',
      memo: 'gym80 4340 公式 HxWxL 2030x1380x1580',
      result: '一致'
    },
    'Pure Kraft Low Row Dual': {
      w: 1825,
      d: 1475,
      h: 2000,
      conf: '高',
      memo: 'gym80 4319 公式 HxWxL 2000x1825x1475',
      result: '一致'
    },
    'Pure Kraft Bent Over Row': {
      w: 1020,
      d: 1760,
      h: 470,
      conf: '高',
      memo: 'gym80 4318 公式 HxWxL 470x1020x1760',
      result: '一致'
    },
    'Seated Row Machine / Dual Row系': {
      w: 1200,
      d: 1300,
      h: 1620,
      conf: '高',
      memo: 'gym80 3040 Seated Row Machine 公式 HxWxL 1620x1200x1300',
      result: '一致'
    },
    'Pure Kraft Shoulder Lateral Raise Dual': {
      w: 880,
      d: 1390,
      h: 1330,
      conf: '高',
      memo: 'gym80 4325 公式 HxWxL 1330x880x1390',
      result: '一致'
    },
    'Pure Kraft Hack Squat': {
      w: 1294,
      d: 2206,
      h: 1361,
      conf: '高',
      memo: 'gym80 4159N 公式 HxWxL 1361x1294x2206',
      result: '一致'
    },
    'Pure Kraft Lying Leg Curl': {
      w: 1269,
      d: 1633,
      h: 841,
      conf: '高',
      memo: 'gym80 4337N 公式 HxWxL 841x1269x1633',
      result: '一致'
    },
    'Pure Kraft Leg Extension': {
      w: 1322,
      d: 1336,
      h: 1037,
      conf: '高',
      memo: 'gym80 4336N 公式 HxWxL 1037x1322x1336',
      result: '一致'
    },
    'Pure Kraft 55 Degrees Standing Calf Raise': {
      w: 1010,
      d: 1330,
      h: 1280,
      conf: '高',
      memo: 'gym80 4345 公式 HxWxL 1280x1010x1330',
      result: '一致'
    },
    'Pure Kraft Belt Squat': {
      w: 1955,
      d: 1585,
      h: 1490,
      conf: '高',
      memo: 'gym80 4360 公式 HxWxL 1490x1955x1585',
      result: '一致'
    },
    'Pure Kraft Pendulum Squat': {
      w: 1068,
      d: 2421,
      h: 1733,
      conf: '高',
      memo: 'gym80 4353N 公式 HxWxL 1733x1068x2421',
      result: '一致'
    },
    'Pure Kraft Biceps Curl Dual': {
      w: 946,
      d: 1530,
      h: 1243,
      conf: '高',
      memo: 'gym80 4355 公式 HxWxL 1243x946x1530',
      result: '一致'
    },
    'Pure Kraft Triceps Extension': {
      w: 1179,
      d: 1279,
      h: 1493,
      conf: '高',
      memo: 'gym80 4339N 公式 HxWxL 1493x1179x1279（リンクは4356表記だったため型番を4339Nに統一）',
      link: 'https://gym80.de/en/product/4339n/',
      result: 'リンク・型番整理'
    },
    'Hammer Strength Select Leg Extension': {
      w: 1040,
      d: 1190,
      h: 1630,
      conf: '高',
      memo: 'HS Select LE 公式 LxWxH 119x104x163cm',
      result: '一致'
    },
    'Hammer Strength Select Leg Curl': {
      w: 860,
      d: 1400,
      h: 1400,
      conf: '高',
      memo: 'HS-SLC Seated Leg Curl 公式 LxWxH 140x86x140cm（旧990x1650x1400は不一致のため訂正）',
      result: '訂正'
    },
    'Abdominal Crunch': {
      w: 890,
      d: 1580,
      h: 1400,
      conf: '高',
      memo: 'HS-ABC 公式 LxWxH 158x89x140cm',
      result: '一致'
    },
    'Assist Dip Chin': {
      w: 1130,
      d: 1180,
      h: 2210,
      conf: '高',
      memo: 'HS-ADC 公式 LxWxH 118x113x221cm',
      result: '一致'
    },
    'SkiErg PM5 スタンド付': {
      w: 600,
      d: 1270,
      h: 2160,
      conf: '高',
      memo: 'Concept2 公式 スタンド付 60x127x216cm',
      result: '一致'
    },
    'RowErg': {
      w: 610,
      d: 2440,
      h: 360,
      conf: '高',
      memo: 'Concept2 公式 61x244x36cm（旧高さ860は誤り。使用エリア推奨274x122cm）',
      result: '高さ訂正'
    },
    'BikeErg': {
      w: 610,
      d: 1220,
      h: 1030,
      conf: '高',
      memo: 'Concept2 公式 幅61×長122、シート高最大約103cm',
      result: '高さ整理'
    },
    'POWER MAX V3 Pro': {
      w: 592,
      d: 1048,
      h: 1082,
      conf: '高',
      memo: '公式 幅59.2×奥行104.8×高108.2cm',
      result: '訂正'
    },
    'PowerMill Climber': {
      w: 840,
      d: 1430,
      h: 2100,
      conf: '高',
      memo: 'Life Fitness 公式 LxWxH 143x84x210cm（天井目安2.7m）',
      result: '一致'
    },
    'Curve Treadmill': {
      w: 840,
      d: 1780,
      h: 1830,
      conf: '高',
      memo: 'WOODWAY Curve 公式 W84×L178×H183cm',
      result: '一致'
    },
    'フラットベンチ EVRB-C135': {
      w: 1350,
      d: 760,
      h: 430,
      conf: '高',
      memo: 'Evolgear公式 W1350×D760×H430',
      result: '一致'
    },
    'プレートツリー EVRB-C154': {
      w: 610,
      d: 580,
      h: 1240,
      conf: '高',
      memo: 'Evolgear公式 W610×D580×H1240',
      result: '一致'
    },
    'オリンピックバー EVA-5000': {
      w: 50,
      d: 2200,
      h: 50,
      conf: '高',
      memo: 'バー長約2200mm（床占有はラック前提）',
      result: '維持'
    }
  };
}

/** PLAN_FORMAT_OVERWRITE */
var PLAN_NEW_SHEET = '新マシン';
var PLAN_RULES_SHEET = '図面規則';
var PLAN_BACKUP_SHEET = '新マシン_バックアップ';

function overwriteNewMachinesPlanFormat() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var src = ss.getSheetByName(PLAN_NEW_SHEET);
  if (src) {
    var old = ss.getSheetByName(PLAN_BACKUP_SHEET);
    if (old) ss.deleteSheet(old);
    src.copyTo(ss).setName(PLAN_BACKUP_SHEET);
  }
  var sh = ss.getSheetByName(PLAN_NEW_SHEET) || ss.insertSheet(PLAN_NEW_SHEET);
  var values = [["層","ゾーン候補","状態","図面対象","幅_mm","奥行_mm","高さ_mm","図面幅_cm","図面奥行_cm","名称","税抜単価","台数","税抜小計","商品リンク","備考","寸法信頼度","寸法メモ","検証結果","旧幅_mm","旧奥行_mm","旧高さ_mm","検証日"],["","FW","採用中","",1500,3000,2310,150,300,"HD Athletic NX Half Half Combo Rack","¥4,000,000","2","¥8,000,000","HD Athletic NX Half Half Combo Rack | Hammer Strength","2台導入で新規4ステーション。","低","構成可変。LF公式は奥行99〜302cm・高さ218/231cm。配置仮置き1500x3000x2310","推定維持",1500,3000,2310,"2026-09-12"],["","FW","採用中","",2400,1920,83,240,192,"Impact Suppression Platform / Platform床材","¥600,000","4","¥2,400,000","https://www.lifefitness.com/en-us/catalog/strength-training/racks-rigs-platforms/impact-suppression-platform","Half Half Combo Rack両面×2台で4面分を想定。正式見積必須","高","ISP-6X8公式 LxWxH 192x240x8.3cm → 床置き幅2400×奥行1920","高さ80→83訂正",2400,1920,80,"2026-09-12"],["","FW","採用中","",2126,620,810,213,62,"ラバーダンベル EVA-D104 42.5kg〜60kg追加","¥471,520","1","¥471,520","https://evolgear.com/product/eva-d104.html","42.5/45/47.5/50/52.5/55/57.5/60kgを各ペア追加想定","中","ダンベル本体ではなくEVRB-C177ラック占有想定（要実測）","推定維持",2126,620,810,"2026-09-12"],["","FW","採用中","",1400,760,470,140,76,"アジャスタブルインクラインベンチ EVRB-L139","¥77,050","3","¥231,150","https://evolgear.com/product/evrb-l139.html","既存3台＋追加3台で合計6台体制","高","Evolgear公式 W1400×D760×H470","一致",1400,760,470,"2026-09-12"],["","Glute","採用中","",1780,740,1450,178,74,"Selectorized 3D Multi-Abductor Pro","¥2,400,000","1","¥2,400,000","https://www.precor.com/ja-JP/strength/glutebuilder/selectorized","初心者女性向けの入口。立位・座位・臥位に対応。国内正式見積必須","高","Precor GSL0622 公式 LxWxH 74x178x145cm","一致",1780,740,1450,"2026-09-12"],["","Glute","採用中","",1700,1960,1300,170,196,"Hip Thrust Elite","¥1,800,000","1","¥1,800,000","https://www.precor.com/ja-JP/strength/glutebuilder/selectorized","グルートゾーンの主役。国内正式見積必須","高","Precor GPL0612 公式 LxWxH 196x170x130cm","一致",1700,1960,1300,"2026-09-12"],["","Glute","採用中","",1880,1700,740,188,170,"Deadlift Elite","¥1,500,000","1","¥1,500,000","https://www.precor.com/en-US/strength/glutebuilder","片側14kgスタート・高重量対応。男性上級者にも刺さる","高","Precor GPL0551 公式 LxWxH 170x188x74cm","一致",1880,1700,740,"2026-09-12"],["","背中","採用中","",1415,1811,638,142,181,"Reloaded T Bar Row","¥1,200,000","1","¥1,200,000","https://www.myarsenalstrength.com/strength-equipment/reloaded/upper-body-reloaded/reloaded-t-bar-row","WARRIORS GYM系。背中の目玉","高","Arsenal公式 W55.7×H25.1×L71.3in → 1415x1811x638","微修正",1410,1810,640,"2026-09-12"],["","背中","採用中","",1380,1580,2030,138,158,"Pure Kraft High Row Dual","¥2,200,000","1","¥2,200,000","https://gym80.de/en/product/4340/","背中の広がり。gym80枠","高","gym80 4340 公式 HxWxL 2030x1380x1580","一致",1380,1580,2030,"2026-09-12"],["","背中","採用中","",1825,1475,2000,183,148,"Pure Kraft Low Row Dual","¥2,200,000","1","¥2,200,000","https://www.gym80.co.uk/products/pure-kraft-low-row","背中の厚み。玄人向け","高","gym80 4319 公式 HxWxL 2000x1825x1475","一致",1825,1475,2000,"2026-09-12"],["","背中","採用中","",1020,1760,470,102,176,"Pure Kraft Bent Over Row","¥1,600,000","1","¥1,600,000","https://gym80.de/en/product/4318/","背中・リア側。見た目も珍しい","高","gym80 4318 公式 HxWxL 470x1020x1760","一致",1020,1760,470,"2026-09-12"],["","背中","採用中","",1200,1300,1620,120,130,"Seated Row Machine / Dual Row系","¥1,800,000","1","¥1,800,000","https://gym80.de/en/product/3040/","レジスタンス寄りの高級ロー。既存との置換候補","高","gym80 3040 Seated Row Machine 公式 HxWxL 1620x1200x1300","一致",1200,1300,1620,"2026-09-12"],["","肩","採用中","",880,1390,1330,88,139,"Pure Kraft Shoulder Lateral Raise Dual","¥2,200,000","1","¥2,200,000","https://www.gym80.co.uk/products/pure-kraft-shoulder-lateral-raise-dual","フィジーク層・ボディメイク層向け","高","gym80 4325 公式 HxWxL 1330x880x1390","一致",880,1390,1330,"2026-09-12"],["","脚","採用中","",1294,2206,1361,129,221,"Pure Kraft Hack Squat","¥2,300,000","1","¥2,300,000","https://gym80.de/en/product/4159n/","脚トレの本命。3段階調整フットプレート","高","gym80 4159N 公式 HxWxL 1361x1294x2206","一致",1294,2206,1361,"2026-09-12"],["","脚","採用中","",1269,1633,841,127,163,"Pure Kraft Lying Leg Curl","¥1,800,000","1","¥1,800,000","https://gym80.de/en/product/4337n/","ハムストリング特化。脚の完成度を上げる","高","gym80 4337N 公式 HxWxL 841x1269x1633","一致",1269,1633,841,"2026-09-12"],["","脚","採用中","",1322,1336,1037,132,134,"Pure Kraft Leg Extension","¥1,800,000","1","¥1,800,000","https://gym80.de/en/product/4336n/","大腿四頭筋。既存更新・高級化候補","高","gym80 4336N 公式 HxWxL 1037x1322x1336","一致",1322,1336,1037,"2026-09-12"],["","脚","採用中","",1010,1330,1280,101,133,"Pure Kraft 55 Degrees Standing Calf Raise","¥1,800,000","1","¥1,800,000","https://gym80.de/en/product/4345/","置いてあるジムが少なく差別化しやすい","高","gym80 4345 公式 HxWxL 1280x1010x1330","一致",1010,1330,1280,"2026-09-12"],["","Glute","候補(台数0)","",1955,1585,1490,196,159,"Pure Kraft Belt Squat","¥2,200,000","0","¥0","https://gym80.de/en/product/4360/","Precor Deadlift Eliteやラック構成と要調整。採用なら台数1","高","gym80 4360 公式 HxWxL 1490x1955x1585","一致",1955,1585,1490,"2026-09-12"],["","脚","候補(台数0)","",1068,2421,1733,107,242,"Pure Kraft Pendulum Squat","¥2,400,000","0","¥0","https://gym80.de/en/product/4353n/","ハックスクワットとの比較候補。採用なら台数1","高","gym80 4353N 公式 HxWxL 1733x1068x2421","一致",1068,2421,1733,"2026-09-12"],["","腕","採用中","",946,1530,1243,95,153,"Pure Kraft Biceps Curl Dual","¥1,600,000","1","¥1,600,000","https://www.gym80.co.uk/products/pure-kraft-biceps-curl-dual","二頭専用。腕を鍛え切れる感を出す","高","gym80 4355 公式 HxWxL 1243x946x1530","一致",946,1530,1243,"2026-09-12"],["","腕","採用中","",1179,1279,1493,118,128,"Pure Kraft Triceps Extension","¥1,600,000","1","¥1,600,000","https://gym80.de/en/product/4339n/","三頭専用。カールとは分けて導入","高","gym80 4339N 公式 HxWxL 1493x1179x1279（リンク4356→4339Nに統一）","リンク・型番整理",1179,1279,1493,"2026-09-12"],["","その他","候補(台数0)","",1567,2084,1605,157,208,"ELC シーテッドロウ","¥294,000","0","¥0","https://ecoleco-fitness.com/expert-model/plate-load/elc-series","Arsenal/gym80が高い場合の代替候補","高","ELC-07","未突合（既存値維持）",1567,2084,1605,"2026-09-12"],["","肩","候補(台数0)","",1567,1156,1603,157,116,"ELC ラテラルレイズ","¥294,000","0","¥0","https://ecoleco-fitness.com/expert-model/plate-load/elc-series","gym80が高い場合の代替候補","高","ELC-04公式","未突合（既存値維持）",1567,1156,1603,"2026-09-12"],["","脚","候補(台数0)","",1040,1190,1630,104,119,"Hammer Strength Select Leg Extension","¥1,300,000","0","¥0","https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select","gym80 Leg Extensionを入れる場合は不要","高","HS Select LE 公式 LxWxH 119x104x163cm","一致",1040,1190,1630,"2026-09-12"],["","脚","候補(台数0)","",860,1400,1400,86,140,"Hammer Strength Select Leg Curl","¥1,300,000","0","¥0","https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select","gym80 Lying Leg Curlを入れる場合は不要","高","HS-SLC Seated Leg Curl 公式 LxWxH 140x86x140cm（旧990x1650x1400を訂正）","訂正",990,1650,1400,"2026-09-12"],["","初心者","採用中","",890,1580,1400,89,158,"Abdominal Crunch","¥1,300,000","1","¥1,300,000","https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select","初心者にも分かりやすい腹筋マシン","高","HS-ABC 公式 LxWxH 158x89x140cm","一致",890,1580,1400,"2026-09-12"],["","初心者","採用中","",1130,1180,2210,113,118,"Assist Dip Chin","¥1,300,000","1","¥1,300,000","https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select","初心者向け懸垂・ディップス","高","HS-ADC 公式 LxWxH 118x113x221cm","一致",1130,1180,2210,"2026-09-12"],["","胸","候補(台数0)","",1400,1100,1480,140,110,"Insignia Series Chest Press","¥1,600,000","0","¥0","https://www.lifefitness.com/en-hk/catalog/strength-training/selectorized/insignia-series-chest-press","胸は既存設備と重複しやすいため優先低め","高","Insignia Chest Press","未突合（既存値維持）",1400,1100,1480,"2026-09-12"],["","Glute","候補(台数0)","",800,1600,1600,80,160,"Standing Abductor","","","","https://www.panattasport.com/it/fit-evo/standing-abductor-machine/","","中","FitEvo Standing Abductor想定","未突合（既存値維持）",800,1600,1600,"2026-09-12"],["","HYROX/有酸素","採用中","",600,1270,2160,60,127,"SkiErg PM5 スタンド付","¥205,000","1","¥205,000","https://www.concept2.com/ergs/skierg","HYROX感・省スペース","高","Concept2 公式 スタンド付 60x127x216cm","一致",600,1270,2160,"2026-09-12"],["","背中","採用中","",610,2440,360,61,244,"RowErg","¥190,000","1","¥190,000","https://www.concept2.com/ergs/rowerg","HYROX補完。面積確認","高","Concept2 公式 61x244x36cm（旧高さ860訂正。使用エリア推奨274x122）","高さ訂正",610,2440,860,"2026-09-12"],["","HYROX/有酸素","候補(台数0)","",610,1220,1030,61,122,"BikeErg","¥180,000","0","¥0","https://www.concept2.com/ergs/bikeerg","採用なら台数1","高","Concept2 公式 幅61×長122、シート高最大約103cm","高さ整理",610,1220,1100,"2026-09-12"],["","HYROX/有酸素","採用中","",592,1048,1082,59,105,"POWER MAX V3 Pro","¥1,200,000","1","¥1,200,000","https://www.konami.com/sportsclub/online/shop/aerobike/power-max-v3/","競技者・無酸素パワー向け","高","公式 幅59.2×奥行104.8×高108.2cm","訂正",600,1030,820,"2026-09-12"],["","HYROX/有酸素","採用中","",840,1430,2100,84,143,"PowerMill Climber","¥2,200,000","1","¥2,200,000","https://www.lifefitness.com/en-us/catalog/cardio/stair-climbers-stepper-machines/powermill-climber","階段系の本命。女性・減量層にも強い","高","Life Fitness 公式 LxWxH 143x84x210cm（天井目安2.7m）","一致",840,1430,2100,"2026-09-12"],["","HYROX/有酸素","候補(台数0)","",720,1350,1910,72,135,"C50 ClimbMill","¥1,800,000","0","¥0","https://world.matrixfitness.com/eng/home/climbmills/c50","PowerMillとの比較候補","高","Matrix C50","未突合（既存値維持）",720,1350,1910,"2026-09-12"],["","その他","候補(台数0)","",860,1600,2060,86,160,"10G StepMill","¥2,700,000","0","¥0","https://www.corehandf.com/collections/stairmaster","天井高確認必須","高","StairMaster 10G","未突合（既存値維持）",860,1600,2060,"2026-09-12"],["","HYROX/有酸素","採用中","",840,1780,1830,84,178,"Curve Treadmill","¥2,000,000","1","¥2,000,000","https://www.woodway.com/treadmills/curve/","海外ジム感・映え・HIIT対応","高","WOODWAY Curve 公式 W84×L178×H183cm","一致",840,1780,1830,"2026-09-12"],["","HYROX/有酸素","候補(台数0)","",920,2090,1420,92,209,"Integrity+ Treadmill","¥1,800,000","0","¥0","https://www.lifefitness.com/en-us/catalog/cardio/treadmills","既存更新用","高","Integrity+ Treadmill","未突合（既存値維持）",920,2090,1420,"2026-09-12"],["","HYROX/有酸素","候補(台数0)","",730,2180,1630,73,218,"Integrity+ Cross Trainer","¥1,500,000","0","¥0","https://www.lifefitness.com/en-us/catalog/cardio/ellipticals","既存更新用","高","Integrity+ Elliptical","未突合（既存値維持）",730,2180,1630,"2026-09-12"],["","FW","採用中","",950,1400,2300,95,140,"ONI 鬼コンボラック IPF公認","¥380,000","1","¥380,000","https://bukiya.net/products/oni373a","既存BULLベンチに加えて1台追加","低","ONI想定","未突合（既存値維持）",950,1400,2300,"2026-09-12"],["","FW","採用中","",1350,760,430,135,76,"フラットベンチ EVRB-C135","¥33,350","1","¥33,350","https://evolgear.com/product/evrb-c135.html","フリーウェイト周辺の備品","高","Evolgear公式 W1350×D760×H430","一致",1350,760,430,"2026-09-12"],["","FW","採用中","",50,2200,50,5,220,"オリンピックバー EVA-5000","¥37,950","2","¥75,900","https://evolgear.com/product/eva-5000.html","ラック増設に伴う備品","高","バー長約2200mm（床占有はラック前提）","維持",50,2200,50,"2026-09-12"],["","FW","採用中","",610,580,1240,61,58,"プレートツリー EVRB-C154","¥47,150","2","¥94,300","https://evolgear.com/product/evrb-c154.html","プレート収納用","高","Evolgear公式 W610×D580×H1240","一致",610,580,1240,"2026-09-12"],["","FW","採用中","",483,1067,864,48,107,"Rogue Deadlift Jack","¥80,000","1","¥80,000","https://www.roguefitness.com/rogue-deadlift-jack","高重量利用者向け","中","Rogue Deadlift Bar Jack","未突合（既存値維持）",483,1067,864,"2026-09-12"],["","HYROX/有酸素","採用中","",356,356,356,36,36,"Wall Ball","¥30,000","6","¥180,000","https://www.roguefitness.com/medicine-balls","HYROX備品","低","Wall Ball直径目安14in","未突合（既存値維持）",356,356,356,"2026-09-12"],["","HYROX/有酸素","採用中","",1000,600,350,100,60,"Kettlebell Set","¥300,000","1","¥300,000","https://www.roguefitness.com/rogue-kettlebells","HYROX・ファンクショナル用","低","KBセット占有目安","未突合（既存値維持）",1000,600,350,"2026-09-12"],["","FW","採用中","",432,457,1219,43,46,"アタッチメントラック","¥100,000","1","¥100,000","https://evolgear.com/","ケーブル周辺整理。MAGグリップ用","低","アタッチメントラック目安","未突合（既存値維持）",432,457,1219,"2026-09-12"],["","HYROX/有酸素","採用中","",1200,1200,430,120,120,"Tire Flip / Strongman Tire","¥500,000","1","¥500,000","https://warriors-gym.com/en/facility/","WARRIORS GYM参考。省スペース・安全性を見て代替器具も検討","低","タイヤ推定","未突合（既存値維持）",1200,1200,430,"2026-09-12"],["","HYROX/有酸素","採用中","",610,1016,1003,61,102,"Dog Sled 1.2","¥250,000","1","¥250,000","https://www.roguefitness.com/dog-sled","HYROX/ストロングマン兼用。人工芝レーンが必要","高","Dog Sled","未突合（既存値維持）",610,1016,1003,"2026-09-12"],["","HYROX/有酸素","採用中","",610,1524,254,61,152,"Farmer's Walk Handles","¥160,000","1","¥160,000","https://www.roguefitness.com/strongman/logs-axles-handles","グリップ・体幹・全身系。場所を取りにくい","低","Farmers目安","未突合（既存値維持）",610,1524,254,"2026-09-12"],["","HYROX/有酸素","採用中","",254,1956,254,25,196,"LB-1 Rogue 10 inch Log Bar","¥200,000","1","¥200,000","https://www.roguefitness.com/log-bar","話題性あり。利用者は限定的","高","Log Bar","未突合（既存値維持）",254,1956,254,"2026-09-12"],["","HYROX/有酸素","候補(台数0)","",1219,1270,2337,122,127,"Y-2 Yoke","¥300,000","0","¥0","https://www.roguefitness.com/rogue-yoke","スペースを取るため候補扱い","高","Rogue Y-2 Yoke","未突合（既存値維持）",1219,1270,2337,"2026-09-12"],["","HYROX/有酸素","採用中","",406,406,394,41,41,"Strongman Sandbag Set","¥250,000","1","¥250,000","https://www.roguefitness.com/rogue-sandbags","HYROX・ストロングマン兼用","低","Sandbag目安","未突合（既存値維持）",406,406,394,"2026-09-12"],["","初心者","重複候補","","","","","","","Assist Dip & Chin","","","","https://jp.matrixfitness.com/jpn/strength/single-station/vs-s601-chin-dip-assist","懸垂/ディップス補助","低","Matrix VS-S601候補。HS Assist Dip Chinと用途重複のため層で見送り検討","重複候補として残置","","","","2026-09-12"]];
  sh.clear();
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  sh.setFrozenRows(1);
  var rh = ss.getSheetByName(PLAN_RULES_SHEET) || ss.insertSheet(PLAN_RULES_SHEET);
  var rules = [["項目","規則"],["目的","既存マシンは残置。本シートは追加候補。層で線引きし、図面対象のみ配置図に落とす。"],["層の書き方","空欄→あなたが記入。値は次のいずれか1つ: コア / 推奨 / 候補 / 代替 / 見送り"],["層の意味:コア","今回必ず入れる。図面対象=YES"],["層の意味:推奨","予算・面積が許せば入れる。図面対象=YES（仮置き可）"],["層の意味:候補","比較検討中。図面対象=NO（別案シート扱い）"],["層の意味:代替","高い本命の下位互換。本命見送り時のみYES"],["層の意味:見送り","今回入れない。図面対象=NO"],["図面対象","層がコアまたは推奨なら YES。それ以外は NO。確定したら手でYES/NOを入れる"],["ゾーン候補","配置ゾーンの仮ラベル。あなたが変更してよい（Glute/背中/脚/腕/肩/FW/HYROX/有酸素/初心者/胸/その他）"],["寸法の単位","幅_mm/奥行_mm/高さ_mm が正。図面幅_cm=幅_mm÷10、図面奥行_cm=奥行_mm÷10（四捨五入済）"],["配置アプリ尺度","1px=1cm。place幅=図面幅_cm、place奥行=図面奥行_cm"],["クリアランス","仕様の80cm区画は残す。横並び有酸素は側面40cm前後で仮置き可。通路・退避は80cm以上"],["切取","配置アプリでダブルクリック切取＝見た目の80cm余白カット。寸法マスタ自体は区画込みでも本体でも可"],["旧幅/旧奥行/旧高さ","整理前の値。監査用。図面には使わない"],["寸法信頼度","高=公式一致、中=推定/要確認、低=構成可変や備品目安"],["状態列","採用中=台数≥1、候補(台数0)=代替・比較、重複候補=同用途の二重行"],["重複の扱い","Assist Dip Chin(HS)とAssist Dip & Chin(Matrix)はどちらか一方。層で線引き"],["HYROX注意","Sled/Wall Ball等は器具寸法だけでなく人工芝レーン長さが本体。ゾーン=HYROXでまとめる"],["ラック注意","Half Half Comboは構成で奥行が変わる。見積確定後に幅_mm/奥行_mmを更新してから図面確定"],["図面起こし手順1","層を全部埋める"],["図面起こし手順2","図面対象=YESだけを抽出"],["図面起こし手順3","ゾーンごとに並べ、図面幅_cm×図面奥行_cmで配置"],["図面起こし手順4","既存マシンシートと重ね、動線（通路）を確認"],["更新日","2026-09-12"]];
  rh.clear();
  rh.getRange(1, 1, rules.length, rules[0].length).setValues(rules);
  rh.setFrozenRows(1);
  return 'OK plan-format overwrite';
}
