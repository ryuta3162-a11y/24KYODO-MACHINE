/**
 * 新マシンシートを検証済み寸法で書き換え（重複列削除）
 * clasp の OAuth で Sheets API を叩く
 */
import fs from "fs";
import https from "https";
import path from "path";

const SHEET_ID = "1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw";
const SHEET_NAME = "新マシン";
const TODAY = new Date().toISOString().slice(0, 10);

function postForm(url, data) {
  const body = new URLSearchParams(data).toString();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(d), raw: d });
          } catch {
            resolve({ status: res.statusCode, raw: d });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function requestJson(method, url, token, payload) {
  const body = payload ? JSON.stringify(payload) : null;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(d);
          } catch {}
          resolve({ status: res.statusCode, json, raw: d });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseCsv(text) {
  const rows = [];
  let cur = "";
  let inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inq = !inq;
      cur += c;
      continue;
    }
    if ((c === "\n" || c === "\r") && !inq) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (cur.trim()) rows.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) rows.push(cur);
  return rows.map((line) => {
    const cols = [];
    let x = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        q = !q;
        continue;
      }
      if (c === "," && !q) {
        cols.push(x.trim());
        x = "";
        continue;
      }
      x += c;
    }
    cols.push(x.trim());
    return cols;
  });
}

function num(v) {
  const n = Number(String(v || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : "";
}

const verified = {
  "HD Athletic NX Half Half Combo Rack": {
    w: 1500,
    d: 3000,
    h: 2310,
    conf: "低",
    memo: "構成可変。LF公式は奥行99〜302cm・高さ218/231cm。配置仮置き1500x3000x2310",
    result: "推定維持",
  },
  "Impact Suppression Platform / Platform床材": {
    w: 2400,
    d: 1920,
    h: 83,
    conf: "高",
    memo: "ISP-6X8公式 LxWxH 192x240x8.3cm → 床置き幅2400×奥行1920",
    result: "高さ80→83訂正",
  },
  "ラバーダンベル EVA-D104 42.5kg〜60kg追加": {
    conf: "中",
    memo: "ダンベル本体ではなくEVRB-C177ラック占有想定（要実測）",
    result: "推定維持",
  },
  "アジャスタブルインクラインベンチ EVRB-L139": {
    w: 1400,
    d: 760,
    h: 470,
    conf: "高",
    memo: "Evolgear公式 W1400×D760×H470",
    result: "一致",
  },
  "Selectorized 3D Multi-Abductor Pro": {
    w: 1780,
    d: 740,
    h: 1450,
    conf: "高",
    memo: "Precor GSL0622 公式 LxWxH 74x178x145cm",
    result: "一致",
  },
  "Hip Thrust Elite": {
    w: 1700,
    d: 1960,
    h: 1300,
    conf: "高",
    memo: "Precor GPL0612 公式 LxWxH 196x170x130cm",
    result: "一致",
  },
  "Deadlift Elite": {
    w: 1880,
    d: 1700,
    h: 740,
    conf: "高",
    memo: "Precor GPL0551 公式 LxWxH 170x188x74cm",
    result: "一致",
  },
  "Reloaded T Bar Row": {
    w: 1415,
    d: 1811,
    h: 638,
    conf: "高",
    memo: "Arsenal公式 W55.7×H25.1×L71.3in → 1415x1811x638",
    result: "微修正",
  },
  "Pure Kraft High Row Dual": {
    w: 1380,
    d: 1580,
    h: 2030,
    conf: "高",
    memo: "gym80 4340 公式 HxWxL 2030x1380x1580",
    result: "一致",
  },
  "Pure Kraft Low Row Dual": {
    w: 1825,
    d: 1475,
    h: 2000,
    conf: "高",
    memo: "gym80 4319 公式 HxWxL 2000x1825x1475",
    result: "一致",
  },
  "Pure Kraft Bent Over Row": {
    w: 1020,
    d: 1760,
    h: 470,
    conf: "高",
    memo: "gym80 4318 公式 HxWxL 470x1020x1760",
    result: "一致",
  },
  "Seated Row Machine / Dual Row系": {
    w: 1200,
    d: 1300,
    h: 1620,
    conf: "高",
    memo: "gym80 3040 Seated Row Machine 公式 HxWxL 1620x1200x1300",
    result: "一致",
  },
  "Pure Kraft Shoulder Lateral Raise Dual": {
    w: 880,
    d: 1390,
    h: 1330,
    conf: "高",
    memo: "gym80 4325 公式 HxWxL 1330x880x1390",
    result: "一致",
  },
  "Pure Kraft Hack Squat": {
    w: 1294,
    d: 2206,
    h: 1361,
    conf: "高",
    memo: "gym80 4159N 公式 HxWxL 1361x1294x2206",
    result: "一致",
  },
  "Pure Kraft Lying Leg Curl": {
    w: 1269,
    d: 1633,
    h: 841,
    conf: "高",
    memo: "gym80 4337N 公式 HxWxL 841x1269x1633",
    result: "一致",
  },
  "Pure Kraft Leg Extension": {
    w: 1322,
    d: 1336,
    h: 1037,
    conf: "高",
    memo: "gym80 4336N 公式 HxWxL 1037x1322x1336",
    result: "一致",
  },
  "Pure Kraft 55 Degrees Standing Calf Raise": {
    w: 1010,
    d: 1330,
    h: 1280,
    conf: "高",
    memo: "gym80 4345 公式 HxWxL 1280x1010x1330",
    result: "一致",
  },
  "Pure Kraft Belt Squat": {
    w: 1955,
    d: 1585,
    h: 1490,
    conf: "高",
    memo: "gym80 4360 公式 HxWxL 1490x1955x1585",
    result: "一致",
  },
  "Pure Kraft Pendulum Squat": {
    w: 1068,
    d: 2421,
    h: 1733,
    conf: "高",
    memo: "gym80 4353N 公式 HxWxL 1733x1068x2421",
    result: "一致",
  },
  "Pure Kraft Biceps Curl Dual": {
    w: 946,
    d: 1530,
    h: 1243,
    conf: "高",
    memo: "gym80 4355 公式 HxWxL 1243x946x1530",
    result: "一致",
  },
  "Pure Kraft Triceps Extension": {
    w: 1179,
    d: 1279,
    h: 1493,
    conf: "高",
    memo: "gym80 4339N 公式 HxWxL 1493x1179x1279（リンク4356→4339Nに統一）",
    link: "https://gym80.de/en/product/4339n/",
    result: "リンク・型番整理",
  },
  "Hammer Strength Select Leg Extension": {
    w: 1040,
    d: 1190,
    h: 1630,
    conf: "高",
    memo: "HS Select LE 公式 LxWxH 119x104x163cm",
    result: "一致",
  },
  "Hammer Strength Select Leg Curl": {
    w: 860,
    d: 1400,
    h: 1400,
    conf: "高",
    memo: "HS-SLC Seated Leg Curl 公式 LxWxH 140x86x140cm（旧990x1650x1400を訂正）",
    result: "訂正",
  },
  "Abdominal Crunch": {
    w: 890,
    d: 1580,
    h: 1400,
    conf: "高",
    memo: "HS-ABC 公式 LxWxH 158x89x140cm",
    result: "一致",
  },
  "Assist Dip Chin": {
    w: 1130,
    d: 1180,
    h: 2210,
    conf: "高",
    memo: "HS-ADC 公式 LxWxH 118x113x221cm",
    result: "一致",
  },
  "SkiErg PM5 スタンド付": {
    w: 600,
    d: 1270,
    h: 2160,
    conf: "高",
    memo: "Concept2 公式 スタンド付 60x127x216cm",
    result: "一致",
  },
  "RowErg": {
    w: 610,
    d: 2440,
    h: 360,
    conf: "高",
    memo: "Concept2 公式 61x244x36cm（旧高さ860訂正。使用エリア推奨274x122）",
    result: "高さ訂正",
  },
  "BikeErg": {
    w: 610,
    d: 1220,
    h: 1030,
    conf: "高",
    memo: "Concept2 公式 幅61×長122、シート高最大約103cm",
    result: "高さ整理",
  },
  "POWER MAX V3 Pro": {
    w: 592,
    d: 1048,
    h: 1082,
    conf: "高",
    memo: "公式 幅59.2×奥行104.8×高108.2cm",
    result: "訂正",
  },
  "PowerMill Climber": {
    w: 840,
    d: 1430,
    h: 2100,
    conf: "高",
    memo: "Life Fitness 公式 LxWxH 143x84x210cm（天井目安2.7m）",
    result: "一致",
  },
  "Curve Treadmill": {
    w: 840,
    d: 1780,
    h: 1830,
    conf: "高",
    memo: "WOODWAY Curve 公式 W84×L178×H183cm",
    result: "一致",
  },
  "フラットベンチ EVRB-C135": {
    w: 1350,
    d: 760,
    h: 430,
    conf: "高",
    memo: "Evolgear公式 W1350×D760×H430",
    result: "一致",
  },
  "プレートツリー EVRB-C154": {
    w: 610,
    d: 580,
    h: 1240,
    conf: "高",
    memo: "Evolgear公式 W610×D580×H1240",
    result: "一致",
  },
  "オリンピックバー EVA-5000": {
    w: 50,
    d: 2200,
    h: 50,
    conf: "高",
    memo: "バー長約2200mm（床占有はラック前提）",
    result: "維持",
  },
};

const clasprc = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".clasprc.json"), "utf8")
);
const tok = clasprc.tokens.default;
const refreshed = await postForm("https://oauth2.googleapis.com/token", {
  client_id: tok.client_id,
  client_secret: tok.client_secret,
  refresh_token: tok.refresh_token,
  grant_type: "refresh_token",
});
if (!refreshed.json?.access_token) {
  console.error("token refresh failed", refreshed.status, refreshed.raw?.slice(0, 300));
  process.exit(1);
}
const access = refreshed.json.access_token;
console.log("token ok, scope=", refreshed.json.scope || "(none in response)");

const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
  SHEET_NAME
)}`;
const csvRes = await fetch(csvUrl);
const csvText = await csvRes.text();
const rows = parseCsv(csvText);
const header = rows[0].map((h) => h.trim());
const idx = {};
header.forEach((h, i) => {
  if (h && idx[h] == null) idx[h] = i;
});

const out = [
  [
    "幅(mm)",
    "奥行(mm)",
    "高さ(mm)",
    "名称",
    "税抜単価",
    "台数",
    "税抜小計",
    "商品リンク",
    "備考",
    "寸法信頼度",
    "寸法メモ",
    "検証結果",
    "検証日",
  ],
];
const summary = { ok: 0, fixed: 0, estimate: 0, removed: 0 };

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  const name = String(row[idx["名称"]] || "").trim();
  if (!name) continue;
  if (name === "Assist Dip & Chin") {
    summary.removed++;
    continue;
  }

  let w = num(row[idx["幅(mm)"]]);
  let d = num(row[idx["奥行(mm)"]]);
  let h = num(row[idx["高さ(mm)"]]);
  let conf = idx["寸法信頼度"] != null ? String(row[idx["寸法信頼度"]] || "").trim() : "";
  let memo = idx["寸法メモ"] != null ? String(row[idx["寸法メモ"]] || "").trim() : "";
  let link = idx["商品リンク"] != null ? row[idx["商品リンク"]] || "" : "";
  let result = "維持";

  const v = verified[name];
  if (v) {
    const changed =
      (v.w != null && w !== v.w) || (v.d != null && d !== v.d) || (v.h != null && h !== v.h);
    if (v.w != null) w = v.w;
    if (v.d != null) d = v.d;
    if (v.h != null) h = v.h;
    if (v.conf) conf = v.conf;
    if (v.memo) memo = v.memo;
    if (v.link) link = v.link;
    result = changed ? v.result || "訂正" : v.result || "一致";
    if (changed || /訂正|修正|整理/.test(result)) summary.fixed++;
    else if (conf === "低" || conf === "中" || result.includes("推定") || result.includes("未突合"))
      summary.estimate++;
    else summary.ok++;
  } else {
    result = "未突合（既存値維持）";
    summary.estimate++;
  }

  out.push([
    w,
    d,
    h,
    name,
    row[idx["税抜単価"]] || "",
    row[idx["台数"]] || "",
    row[idx["税抜小計"]] || "",
    link,
    row[idx["備考"]] || "",
    conf,
    memo,
    result,
    TODAY,
  ]);
}

fs.writeFileSync(
  "floorplan/_new_machines_verified.json",
  JSON.stringify({ summary, rows: out }, null, 2),
  "utf8"
);

// clear + write via Sheets API
const clear = await requestJson(
  "POST",
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
    SHEET_NAME
  )}:clear`,
  access,
  {}
);
console.log("clear", clear.status, clear.json?.error?.message || "ok");

const write = await requestJson(
  "PUT",
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
    SHEET_NAME + "!A1"
  )}?valueInputOption=RAW`,
  access,
  { values: out }
);
console.log("write", write.status, write.json?.error?.message || write.json?.updatedRange);
console.log("summary", summary, "rows", out.length - 1);

if (write.status >= 400) process.exit(1);
