import fs from "fs";
const j = JSON.parse(fs.readFileSync("floorplan/_new_machines_verified.json", "utf8"));
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = j.rows.map((r) => r.map(esc).join(","));
fs.writeFileSync("floorplan/new_machines_verified.csv", lines.join("\n"), "utf8");
console.log("csv rows", j.rows.length, "summary", j.summary);
