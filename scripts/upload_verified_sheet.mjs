import fs from "fs";
import https from "https";
import path from "path";

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
            resolve({ status: res.statusCode, json: JSON.parse(d), raw: d });
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
const csv = fs.readFileSync("floorplan/new_machines_verified.csv", "utf8");
const meta = {
  name: `新マシン_寸法検証済_${new Date().toISOString().slice(0, 10)}`,
  mimeType: "application/vnd.google-apps.spreadsheet",
};
const up = await multipartUpload(access, meta, csv);
console.log(JSON.stringify(up, null, 2).slice(0, 1000));
if (up.json?.id) {
  console.log("URL https://docs.google.com/spreadsheets/d/" + up.json.id + "/edit");
}
