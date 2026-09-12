/**
 * 新マシンを「図面用フォーマット」に再構成して上書きするデータ生成
 * - 検証済み寸法を本体に
 * - 旧寸法・旧メモは残す
 * - 層は空欄（ユーザーが線引き）
 * - ゾーン候補のみ事前提案
 */
import fs from "fs";
import https from "https";
import path from "path";

const IDEA_SHEET_ID = "1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw";
const NEW_SHEET_NAME = "新マシン";
const RULES_SHEET_NAME = "図面規則";
const TODAY = new Date().toISOString().slice(0, 10);

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

function mmToCm(mm) {
  if (mm === "" || mm == null) return "";
  return Math.round(Number(mm) / 10);
}

function postForm(url, data) {
  const body = new URLSearchParams(data).toString();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
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
            resolve(JSON.parse(d));
          } catch {
            resolve({ raw: d });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function requestJson(method, urlPath, token, payload) {
  const body = payload == null ? null : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "sheets.googleapis.com",
        path: urlPath,
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

function driveJson(method, urlPath, token, payload) {
  const body = payload == null ? null : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "www.googleapis.com",
        path: urlPath,
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

function multipartUpload(token, meta, csv) {
  const boundary = "----cursor" + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/csv\r\n\r\n` +
    `${csv}\r\n` +
    `--${boundary}--\r\n`;
  const buf = Buffer.from(body, "utf8");
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "www.googleapis.com",
        path: "/upload/drive/v3/files?uploadType=multipart",
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": buf.length,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(d) });
          } catch {
            resolve({ status: res.statusCode, raw: d });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

/** 検証済み寸法（名称キー） */
const verified = JSON.parse(
  fs.readFileSync("floorplan/_new_machines_verified.json", "utf8")
);
const verifiedByName = {};
for (const r of verified.rows.slice(1)) {
  verifiedByName[r[3]] = {
    w: r[0],
    d: r[1],
    h: r[2],
    conf: r[9],
    memo: r[10],
    result: r[11],
    link: r[7],
  };
}

function suggestZone(name, note) {
  const s = `${name} ${note}`.toLowerCase();
  if (/hip thrust|abductor|deadlift elite|glute|グルート/.test(s)) return "Glute";
  if (/hack|pendulum|belt squat|leg curl|leg extension|calf|レッグ|脚/.test(s)) return "脚";
  if (/row|t bar|背中|lat /.test(s) || /high row|low row|bent over|seated row/.test(s))
    return "背中";
  if (/bicep|tricep|curl dual|腕/.test(s)) return "腕";
  if (/shoulder|lateral raise|ラテラル/.test(s)) return "肩";
  if (/rack|platform|ベンチ|バー|プレート|ダンベル|jack|アタッチ|oni/.test(s)) return "FW";
  if (/ski|rowerg|bikeerg|powermill|climb|curve|tread|cross|power max|hyrox|sled|wall ball|kettle|sand|tire|farmer|yoke|log/.test(s))
    return "HYROX/有酸素";
  if (/assist|abdominal|dip chin|懸垂|腹筋/.test(s)) return "初心者";
  if (/chest|チェスト|insignia/.test(s)) return "胸";
  return "その他";
}

function suggestStatus(qty, name) {
  const q = Number(qty || 0);
  if (name === "Assist Dip & Chin") return "重複候補";
  if (!q) return "候補(台数0)";
  return "採用中";
}

const raw = parseCsv(fs.readFileSync("floorplan/_new_machines_raw.csv", "utf8"));
const header = raw[0].map((h) => h.trim());
const idx = {};
header.forEach((h, i) => {
  if (h && idx[h] == null) idx[h] = i;
});

const HEADER = [
  "層",
  "ゾーン候補",
  "状態",
  "図面対象",
  "幅_mm",
  "奥行_mm",
  "高さ_mm",
  "図面幅_cm",
  "図面奥行_cm",
  "名称",
  "税抜単価",
  "台数",
  "税抜小計",
  "商品リンク",
  "備考",
  "寸法信頼度",
  "寸法メモ",
  "検証結果",
  "旧幅_mm",
  "旧奥行_mm",
  "旧高さ_mm",
  "検証日",
];

const out = [HEADER];
for (let r = 1; r < raw.length; r++) {
  const row = raw[r];
  const name = String(row[idx["名称"]] || "").trim();
  if (!name) continue;

  const oldW = num(row[idx["幅(mm)"]]);
  const oldD = num(row[idx["奥行(mm)"]]);
  const oldH = num(row[idx["高さ(mm)"]]);
  // 右側の旧検証列があれば参照（元シートの二重列）
  const rightW = num(row[9]);
  const rightD = num(row[10]);
  const rightH = num(row[11]);
  const oldConf = String(row[idx["寸法信頼度"]] || "").trim();
  const oldMemo = String(row[idx["寸法メモ"]] || "").trim();
  const qty = row[idx["台数"]] || "";
  const note = row[idx["備考"]] || "";
  let link = row[idx["商品リンク"]] || "";

  const v = verifiedByName[name];
  let w = oldW || rightW;
  let d = oldD || rightD;
  let h = oldH || rightH;
  let conf = oldConf;
  let memo = oldMemo;
  let result = "未突合（既存値維持）";

  if (v) {
    w = v.w || w;
    d = v.d || d;
    h = v.h || h;
    conf = v.conf || conf;
    memo = v.memo || memo;
    result = v.result || "確認済";
    if (v.link) link = v.link;
  } else if (name === "Assist Dip & Chin") {
    conf = conf || "低";
    memo = memo || "Matrix VS-S601候補。HS Assist Dip Chinと用途重複のため層で見送り検討";
    result = "重複候補として残置";
  }

  const zone = suggestZone(name, note);
  const status = suggestStatus(qty, name);

  out.push([
    "", // 層: ユーザーが記入
    zone,
    status,
    "", // 図面対象: 層確定後に YES/NO
    w,
    d,
    h,
    mmToCm(w),
    mmToCm(d),
    name,
    row[idx["税抜単価"]] || "",
    qty,
    row[idx["税抜小計"]] || "",
    link,
    note,
    conf,
    memo,
    result,
    oldW,
    oldD,
    oldH,
    TODAY,
  ]);
}

const RULES = [
  ["項目", "規則"],
  ["目的", "既存マシンは残置。本シートは追加候補。層で線引きし、図面対象のみ配置図に落とす。"],
  ["層の書き方", "空欄→あなたが記入。値は次のいずれか1つ: コア / 推奨 / 候補 / 代替 / 見送り"],
  ["層の意味:コア", "今回必ず入れる。図面対象=YES"],
  ["層の意味:推奨", "予算・面積が許せば入れる。図面対象=YES（仮置き可）"],
  ["層の意味:候補", "比較検討中。図面対象=NO（別案シート扱い）"],
  ["層の意味:代替", "高い本命の下位互換。本命見送り時のみYES"],
  ["層の意味:見送り", "今回入れない。図面対象=NO"],
  ["図面対象", "層がコアまたは推奨なら YES。それ以外は NO。確定したら手でYES/NOを入れる"],
  ["ゾーン候補", "配置ゾーンの仮ラベル。あなたが変更してよい（Glute/背中/脚/腕/肩/FW/HYROX/有酸素/初心者/胸/その他）"],
  ["寸法の単位", "幅_mm/奥行_mm/高さ_mm が正。図面幅_cm=幅_mm÷10、図面奥行_cm=奥行_mm÷10（四捨五入済）"],
  ["配置アプリ尺度", "1px=1cm。place幅=図面幅_cm、place奥行=図面奥行_cm"],
  ["クリアランス", "仕様の80cm区画は残す。横並び有酸素は側面40cm前後で仮置き可。通路・退避は80cm以上"],
  ["切取", "配置アプリでダブルクリック切取＝見た目の80cm余白カット。寸法マスタ自体は区画込みでも本体でも可"],
  ["旧幅/旧奥行/旧高さ", "整理前の値。監査用。図面には使わない"],
  ["寸法信頼度", "高=公式一致、中=推定/要確認、低=構成可変や備品目安"],
  ["状態列", "採用中=台数≥1、候補(台数0)=代替・比較、重複候補=同用途の二重行"],
  ["重複の扱い", "Assist Dip Chin(HS)とAssist Dip & Chin(Matrix)はどちらか一方。層で線引き"],
  ["HYROX注意", "Sled/Wall Ball等は器具寸法だけでなく人工芝レーン長さが本体。ゾーン=HYROXでまとめる"],
  ["ラック注意", "Half Half Comboは構成で奥行が変わる。見積確定後に幅_mm/奥行_mmを更新してから図面確定"],
  ["図面起こし手順1", "層を全部埋める"],
  ["図面起こし手順2", "図面対象=YESだけを抽出"],
  ["図面起こし手順3", "ゾーンごとに並べ、図面幅_cm×図面奥行_cmで配置"],
  ["図面起こし手順4", "既存マシンシートと重ね、動線（通路）を確認"],
  ["更新日", TODAY],
];

fs.writeFileSync(
  "floorplan/_new_machines_plan_format.json",
  JSON.stringify({ header: HEADER, rows: out, rules: RULES }, null, 2),
  "utf8"
);

function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

fs.writeFileSync("floorplan/new_machines_plan_format.csv", toCsv(out), "utf8");
fs.writeFileSync("floorplan/new_machines_rules.csv", toCsv(RULES), "utf8");
console.log("built rows", out.length - 1);

// OAuth
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
const access = refreshed.access_token;

// 1) Driveに統合ブックを新規作成（新マシン相当CSV）→ 後でタブ追加はSheets APIが必要
const up = await multipartUpload(
  access,
  {
    name: `経堂_新マシン_図面用_${TODAY}`,
    mimeType: "application/vnd.google-apps.spreadsheet",
  },
  toCsv(out)
);
console.log("drive create", up.status, up.json?.id);
let newId = up.json?.id;

if (newId) {
  await driveJson("POST", `/drive/v3/files/${newId}/permissions`, access, {
    role: "writer",
    type: "anyone",
  });
  // 図面規則を2枚目CSVとして別ファイルも作成
  const up2 = await multipartUpload(
    access,
    {
      name: `経堂_図面規則_${TODAY}`,
      mimeType: "application/vnd.google-apps.spreadsheet",
    },
    toCsv(RULES)
  );
  console.log("rules create", up2.status, up2.json?.id);
  if (up2.json?.id) {
    await driveJson("POST", `/drive/v3/files/${up2.json.id}/permissions`, access, {
      role: "reader",
      type: "anyone",
    });
    console.log("RULES_URL https://docs.google.com/spreadsheets/d/" + up2.json.id + "/edit");
  }
  console.log("PLAN_URL https://docs.google.com/spreadsheets/d/" + newId + "/edit");
}

// 2) アイデアプール本体へ書き込み試行
const clear = await requestJson(
  "POST",
  `/v4/spreadsheets/${IDEA_SHEET_ID}/values/${encodeURIComponent(NEW_SHEET_NAME)}:clear`,
  access,
  {}
);
console.log("idea clear", clear.status, clear.json?.error?.message || "ok");

if (clear.status < 300) {
  const write = await requestJson(
    "PUT",
    `/v4/spreadsheets/${IDEA_SHEET_ID}/values/${encodeURIComponent(
      NEW_SHEET_NAME + "!A1"
    )}?valueInputOption=RAW`,
    access,
    { values: out }
  );
  console.log("idea write", write.status, write.json?.error?.message || write.json?.updatedRange);

  // 図面規則シート
  const meta = await requestJson("GET", `/v4/spreadsheets/${IDEA_SHEET_ID}`, access);
  const sheets = meta.json?.sheets || [];
  let hasRules = sheets.some((s) => s.properties?.title === RULES_SHEET_NAME);
  if (!hasRules) {
    const add = await requestJson("POST", `/v4/spreadsheets/${IDEA_SHEET_ID}:batchUpdate`, access, {
      requests: [{ addSheet: { properties: { title: RULES_SHEET_NAME } } }],
    });
    console.log("add rules sheet", add.status, add.json?.error?.message || "ok");
  }
  const clearR = await requestJson(
    "POST",
    `/v4/spreadsheets/${IDEA_SHEET_ID}/values/${encodeURIComponent(RULES_SHEET_NAME)}:clear`,
    access,
    {}
  );
  const writeR = await requestJson(
    "PUT",
    `/v4/spreadsheets/${IDEA_SHEET_ID}/values/${encodeURIComponent(
      RULES_SHEET_NAME + "!A1"
    )}?valueInputOption=RAW`,
    access,
    { values: RULES }
  );
  console.log("rules write", writeR.status, writeR.json?.error?.message || writeR.json?.updatedRange);
} else {
  console.log("IDEA_POOL_WRITE_BLOCKED");
}

// GAS埋め込み用にJSリテラルも出力
fs.writeFileSync(
  "gas/_plan_payload.json",
  JSON.stringify({ machines: out, rules: RULES }),
  "utf8"
);
console.log("payload bytes", fs.statSync("gas/_plan_payload.json").size);
