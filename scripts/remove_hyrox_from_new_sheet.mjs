/**
 * 新マシンシートから HYROX 系行を削除して書き戻す
 * （選び直しまでの一時クリア。clasp OAuth を使用）
 */
import fs from "fs";
import https from "https";
import path from "path";

const SHEET_ID = "1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw";
const SHEET_NAME = "新マシン";

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
        cols.push(x);
        x = "";
        continue;
      }
      x += c;
    }
    cols.push(x);
    return cols;
  });
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
            resolve({ status: res.statusCode, json: JSON.parse(d), raw: d });
          } catch {
            resolve({ status: res.statusCode, json: null, raw: d });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function requestJson(method, url, access, bodyObj) {
  const body = bodyObj == null ? null : JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          Authorization: `Bearer ${access}`,
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
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, json, raw: d });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function isHyroxRow(zone, name, note) {
  const z = String(zone || "").trim();
  const n = String(name || "").trim();
  const m = String(note || "").trim();
  if (/^HYROX/i.test(z) || z.includes("HYROX")) return true;
  if (
    /ski\s*erg|rowerg|bikeerg|power\s*max|powermill|climbmill|curve\s*tread|wall\s*ball|kettlebell|tire\s*flip|dog\s*sled|farmer'?s?\s*walk|log\s*bar|y-?2\s*yoke|sandbag/i.test(
      n
    )
  ) {
    return true;
  }
  if (/HYROX/.test(m) && /Integrity\+|Cross Trainer|Treadmill/i.test(n)) return true;
  return false;
}

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

const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
  SHEET_NAME
)}`;
const csvRes = await fetch(csvUrl);
if (!csvRes.ok) {
  console.error("csv fetch failed", csvRes.status);
  process.exit(1);
}
const rows = parseCsv(await csvRes.text());
if (!rows.length) {
  console.error("empty sheet");
  process.exit(1);
}

const header = rows[0];
const idx = {};
header.forEach((h, i) => {
  const key = String(h || "").trim();
  if (key && idx[key] == null) idx[key] = i;
});
const zoneI = idx["ゾーン候補"] ?? idx["ゾーン"] ?? 1;
const nameI = idx["名称"] ?? 9;
const noteI = idx["備考"] ?? 14;

const kept = [header];
const removed = [];
for (const row of rows.slice(1)) {
  const zone = row[zoneI] || "";
  const name = row[nameI] || "";
  const note = row[noteI] || "";
  if (!String(name).trim()) continue;
  if (isHyroxRow(zone, name, note)) {
    removed.push({ zone: String(zone).trim(), name: String(name).trim() });
    continue;
  }
  kept.push(row);
}

fs.writeFileSync(
  path.join("floorplan", "_hyrox_removed.json"),
  JSON.stringify({ at: new Date().toISOString(), removed, kept: kept.length - 1 }, null, 2),
  "utf8"
);

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
  { values: kept }
);
console.log("write", write.status, write.json?.error?.message || write.json?.updatedRange);
console.log(
  "removed",
  removed.length,
  removed.map((r) => r.name).join(" / ")
);
console.log("kept", kept.length - 1);

if (write.status >= 400) process.exit(1);
