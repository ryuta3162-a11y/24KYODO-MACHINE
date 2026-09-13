import fs from "fs";

const text = fs.readFileSync("floorplan/new_machines_plan_format.csv", "utf8");

function parseCsv(t) {
  const rows = [];
  let cur = "";
  let inq = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') {
      inq = !inq;
      cur += c;
      continue;
    }
    if ((c === "\n" || c === "\r") && !inq) {
      if (c === "\r" && t[i + 1] === "\n") i++;
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

function isHyrox(zone, name) {
  if (/HYROX/i.test(zone || "")) return true;
  return /SkiErg|RowErg|BikeErg|POWER MAX|PowerMill|ClimbMill|Curve Treadmill|Wall Ball|Kettlebell|Tire Flip|Dog Sled|Farmer|Log Bar|Y-2 Yoke|Sandbag/i.test(
    name || ""
  );
}

function esc(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = parseCsv(text);
const header = rows[0];
const zi = header.indexOf("ゾーン候補");
const ni = header.indexOf("名称");
const kept = [header];
const rem = [];
for (const r of rows.slice(1)) {
  const n = (r[ni] || "").trim();
  if (!n) continue;
  if (isHyrox(r[zi], n)) {
    rem.push(n);
    continue;
  }
  kept.push(r);
}

fs.writeFileSync(
  "floorplan/new_machines_plan_format.csv",
  kept.map((r) => r.map(esc).join(",")).join("\n") + "\n"
);
fs.writeFileSync(
  "floorplan/_hyrox_removed.json",
  JSON.stringify({ removed: rem, kept: kept.length - 1 }, null, 2)
);
console.log("removed", rem.length);
console.log(rem.join(" / "));
console.log("kept", kept.length - 1);
