import fs from "fs";
import https from "https";
import path from "path";

const j = JSON.parse(
  fs.readFileSync("floorplan/_new_machines_plan_format.json", "utf8")
);

function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

const csv = "\uFEFF" + toCsv(j.rows);
const rulesCsv = "\uFEFF" + toCsv(j.rules);
fs.writeFileSync("floorplan/new_machines_plan_format.csv", csv);
fs.writeFileSync("floorplan/new_machines_rules.csv", rulesCsv);

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
        res.on("end", () => resolve(JSON.parse(d)));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function multipart(token, meta, content) {
  const b = "----b" + Date.now();
  const body =
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${b}\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n` +
    `${content}\r\n--${b}--\r\n`;
  const buf = Buffer.from(body, "utf8");
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "www.googleapis.com",
        path: "/upload/drive/v3/files?uploadType=multipart",
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${b}`,
          "Content-Length": buf.length,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(JSON.parse(d)));
      }
    );
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

function perm(token, id, role = "writer") {
  const body = JSON.stringify({ role, type: "anyone" });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "www.googleapis.com",
        path: `/drive/v3/files/${id}/permissions`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
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
const access = refreshed.access_token;
const today = new Date().toISOString().slice(0, 10);
const up = await multipart(
  access,
  {
    name: `経堂_新マシン_図面用_${today}_v2`,
    mimeType: "application/vnd.google-apps.spreadsheet",
  },
  csv
);
console.log("PLAN", up.id, `https://docs.google.com/spreadsheets/d/${up.id}/edit`);
await perm(access, up.id, "writer");
const up2 = await multipart(
  access,
  {
    name: `経堂_図面規則_${today}_v2`,
    mimeType: "application/vnd.google-apps.spreadsheet",
  },
  rulesCsv
);
console.log("RULES", up2.id, `https://docs.google.com/spreadsheets/d/${up2.id}/edit`);
await perm(access, up2.id, "writer");
fs.writeFileSync(
  "floorplan/_plan_sheet_urls.json",
  JSON.stringify({ planId: up.id, rulesId: up2.id, at: today }, null, 2)
);
