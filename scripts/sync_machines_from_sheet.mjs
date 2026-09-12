/**
 * 既存マシンシート → floorplan catalog 同期
 * Sheet: 経堂アイデアプール / 既存マシン
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw/gviz/tq?tqx=out:csv&sheet=%E6%97%A2%E5%AD%98%E3%83%9E%E3%82%B7%E3%83%B3";
const CLEARANCE_CM = 80;

const CAT_MAP = {
  有酸素: "cardio",
  ウェイト: "resistance",
  フリーウェイト: "freeweight",
};

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

function mmToCm(mm) {
  const n = Number(String(mm).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / 10);
}

function resolveId(photo, used) {
  let base = String(photo || "")
    .trim()
    .replace(/\.jpe?g$/i, "")
    .replace(/\.png$/i, "");
  if (!base) return null;
  if (base === "cardio_3") {
    const id = used.has("cardio_3a") ? "cardio_3b" : "cardio_3a";
    used.add(id);
    return id;
  }
  if (base === "resistance_10_11") {
    used.add("resistance_10_11");
    return "resistance_10_11";
  }
  used.add(base);
  return base;
}

function placeFilesFor(id, photo) {
  const lp = `${String(photo || id).replace(/_10_11$/, "_10").replace(/\.jpe?g$/i, "")}.jpg`;
  // 画像ファイル名の解決
  const candidates = [
    `${id}_place.png`,
    photo === "resistance_10_11" ? "resistance_10_place.png" : null,
    photo === "cardio_3" ? null : null,
  ].filter(Boolean);
  // cardio_3a/b already have files; resistance_10_11 uses resistance_10 art for now
  let place = `${id}_place.png`;
  let preview = `${id}_preview.png`;
  if (id === "resistance_10_11") {
    place = "resistance_10_place.png";
    preview = "resistance_10_preview.png";
  }
  if (id === "cardio_3a" || id === "cardio_3b") {
    place = `${id}_place.png`;
    preview = `${id}_preview.png`;
  }
  return { lp_image: lp.endsWith(".jpg") ? lp : `${lp}.jpg`, place_file: place, preview_file: preview, _candidates: candidates };
}

export async function fetchSheetMachines() {
  const res = await fetch(SHEET_CSV, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`sheet fetch ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("empty sheet");
  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const need = ["カテゴリ", "名称", "台数", "幅(mm)", "奥行(mm)", "写真"];
  for (const n of need) {
    if (idx[n] == null) throw new Error(`missing column ${n}`);
  }

  const used = new Set();
  const machines = [];
  for (const r of rows.slice(1)) {
    const name = (r[idx["名称"]] || "").trim();
    if (!name) continue;
    const photo = (r[idx["写真"]] || "").trim();
    const id = resolveId(photo, used);
    if (!id) continue;
    const width_cm = mmToCm(r[idx["幅(mm)"]]);
    const length_cm = mmToCm(r[idx["奥行(mm)"]]);
    if (width_cm == null || length_cm == null) continue;
    const qty = Number(r[idx["台数"]]) || 1;
    const category = CAT_MAP[(r[idx["カテゴリ"]] || "").trim()] || "resistance";
    const brand = (r[idx["ブランド"]] || "").trim();
    const model = (r[idx["シリーズ/型番"]] || "").trim();
    const height_cm = idx["高さ(mm)"] != null ? mmToCm(r[idx["高さ(mm)"]]) : null;
    const files = placeFilesFor(id, photo);
    let displayName = name;
    // 同名ケーブルマシンを区別
    if (name === "ケーブルマシン" && brand) {
      displayName = `${brand} ケーブルマシン`;
    }
    const module_width_cm = width_cm + CLEARANCE_CM * 2;
    const module_length_cm = length_cm + CLEARANCE_CM * 2;
    machines.push({
      id,
      name: displayName,
      brand,
      model,
      category,
      qty,
      width_cm,
      length_cm,
      height_cm,
      clearance_cm: CLEARANCE_CM,
      module_width_cm,
      module_length_cm,
      place_px_w: module_width_cm,
      place_px_h: module_length_cm,
      lp_image: files.lp_image,
      place_file: files.place_file,
      preview_file: files.preview_file,
      photo_key: photo,
    });
  }
  return machines;
}

function toCsv(machines) {
  const headers = [
    "id",
    "name",
    "category",
    "width_cm",
    "length_cm",
    "clearance_cm",
    "module_width_cm",
    "module_length_cm",
    "place_px_w",
    "place_px_h",
    "qty",
    "lp_image",
    "place_file",
    "preview_file",
    "brand",
    "model",
  ];
  const lines = [headers.join(",")];
  for (const m of machines) {
    lines.push(
      headers
        .map((h) => {
          const v = m[h] ?? "";
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
        })
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

export async function syncToDisk() {
  const machines = await fetchSheetMachines();
  const catalog = machines.map((m) => ({
    id: m.id,
    name: m.name,
    qty: m.qty,
    category: m.category,
    lp_image: m.lp_image,
    width_cm: m.width_cm,
    length_cm: m.length_cm,
    brand: m.brand,
    model: m.model,
  }));
  fs.writeFileSync(path.join(ROOT, "floorplan", "machines_catalog.json"), JSON.stringify(catalog, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(ROOT, "floorplan", "machines.csv"), toCsv(machines), "utf8");
  fs.writeFileSync(
    path.join(ROOT, "floorplan", "machines_from_sheet.json"),
    JSON.stringify({ syncedAt: new Date().toISOString(), source: SHEET_CSV, count: machines.length, machines }, null, 2) + "\n",
    "utf8"
  );
  return machines;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const machines = await syncToDisk();
  console.log(`synced ${machines.length} machines`);
  for (const m of machines) {
    console.log(`${m.id}\t${m.width_cm}x${m.length_cm}\tx${m.qty}\t${m.name}`);
  }
}
