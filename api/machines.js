import { displayExisting, displayNew, DUMBBELL_AREA_MACHINES, EXISTING_NAME_OVERRIDE } from "./displayNames.js";
import { CURATED_RESISTANCE_MACHINES, SKIP_NEW_SHEET_NAMES } from "./curatedResistance.js";

const SHEET_ID = "1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw";
const EXISTING_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("既存マシン")}`;
const NEW_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("新マシン")}`;
const CLEARANCE_CM = 80;

const CAT_MAP = {
  有酸素: "cardio",
  ウェイト: "resistance",
  フリーウェイト: "freeweight",
};

/** UIジャンル */
const GENRE = {
  cardio: "有酸素",
  hyrox: "HYROX",
  stack: "スタック",
  plate: "プレート",
  freeweight: "FW",
  pilates: "ピラティス",
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
  used.add(base);
  return base;
}

function filesFor(id, photo) {
  if (id === "cardio_3a" || id === "cardio_3b") {
    return {
      lp_image: "cardio_3.jpg",
      place_file: `${id}_place.png`,
      preview_file: `${id}_preview.png`,
    };
  }
  const key = String(photo || id).replace(/\.jpe?g$/i, "");
  return {
    lp_image: `${key}.jpg`,
    place_file: `${id}_place.png`,
    preview_file: `${id}_preview.png`,
  };
}

function slugId(name, used) {
  const base =
    "new_" +
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
  let id = base || "new_item";
  let n = 2;
  while (used.has(id)) {
    id = `${base}_${n++}`;
  }
  used.add(id);
  return id;
}

function genreExisting(category) {
  if (category === "cardio") return "cardio";
  if (category === "freeweight") return "freeweight";
  // Cybex等セレクタ＝スタック
  return "stack";
}

function genreNew(name, zone) {
  const s = `${name} ${zone}`.toLowerCase();
  if (
    /hyrox|ski|rowerg|bikeerg|sled|wall.?ball|kettle|sandbag|tire|farmer|yoke|log bar|パワーマックス|dog sled/.test(
      s
    )
  ) {
    return "hyrox";
  }
  if (/curve|powermill|climb|stepmill|tread|cross trainer|integrity\+|有酸素/.test(s)) {
    return "cardio";
  }
  if (
    /select |selectorized|insignia|abdominal crunch|assist dip|3d multi-abductor|ウェイトスタック|hammer strength select|hoist|roc-it|cybex ion|matrix.?ultra|prone leg/.test(
      s
    )
  ) {
    return "stack";
  }
  if (
    /rack|bench|ベンチ|バー|プレートツリー|ダンベル|jack|アタッチ|oni|platform|isp|フリー|olympic/.test(s) ||
    zone === "FW"
  ) {
    return "freeweight";
  }
  if (
    /pure kraft|arsenal|hip thrust|deadlift elite|t bar|hack|pendulum|belt squat|elc|lying leg|leg extension|calf|biceps|triceps|lateral raise|seated row|bent over|standing abductor/.test(
      s
    ) ||
    ["Glute", "背中", "脚", "腕", "肩"].includes(zone)
  ) {
    return "plate";
  }
  if (zone === "初心者" || zone === "胸") return "stack";
  if (zone === "HYROX/有酸素") return "hyrox";
  return "plate";
}

async function fetchExisting(used) {
  const res = await fetch(EXISTING_CSV, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`existing sheet ${res.status}`);
  const rows = parseCsv(await res.text());
  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const machines = [];
  for (const r of rows.slice(1)) {
    const name = (r[idx["名称"]] || "").trim();
    if (!name) continue;
    // ダンベルラックはダンベルエリア4パターンに置き換えるため除外
    if (EXISTING_NAME_OVERRIDE[name] === null || name === "ダンベルラック") continue;
    const photo = (r[idx["写真"]] || "").trim();
    if (photo === "freeweight_10") continue;

    const width_cm = mmToCm(r[idx["幅(mm)"]]);
    const length_cm = mmToCm(r[idx["奥行(mm)"]]);
    if (width_cm == null || length_cm == null) continue;
    const qty = Number(r[idx["台数"]]) || 1;
    const category = CAT_MAP[(r[idx["カテゴリ"]] || "").trim()] || "resistance";
    const brand = (r[idx["ブランド"]] || "").trim();
    const model = (r[idx["シリーズ/型番"]] || "").trim();
    const genre = genreExisting(category);
    const linkCol = idx["商品リンク"] ?? idx["リンク"] ?? idx["URL"];
    const link = linkCol != null ? String(r[linkCol] || "").trim() : "";
    const module_width_cm = width_cm + CLEARANCE_CM * 2;
    const module_length_cm = length_cm + CLEARANCE_CM * 2;

    // ヒップアブ/アド両用 → アブダクション／アダクションの2台に分割
    const isHipCombo =
      photo === "resistance_10_11" ||
      /ヒップアブ\s*[\/／]\s*アド/.test(name) ||
      /ヒップアブダクション\s*[\/／]\s*アダクション/.test(name);
    if (isHipCombo) {
      const parts = [
        { id: "resistance_10", label: "ヒップアブダクション", photoKey: "resistance_10" },
        // アダクションはアブと同寸法・同アート（画像はファイル複製）
        { id: "resistance_11", label: "ヒップアダクション", photoKey: "resistance_10" },
      ];
      for (const part of parts) {
        if (used.has(part.id)) continue;
        used.add(part.id);
        machines.push({
          id: part.id,
          name: displayExisting(part.label, brand),
          brand,
          model,
          category,
          genre,
          source: "existing",
          qty: 1,
          width_cm,
          length_cm,
          clearance_cm: CLEARANCE_CM,
          module_width_cm,
          module_length_cm,
          place_px_w: module_width_cm,
          place_px_h: module_length_cm,
          has_art: true,
          ...filesFor(part.id, part.photoKey),
          photo_key: part.photoKey,
          link,
          note: "両用機をアブダクション／アダクションに分割",
        });
      }
      continue;
    }

    // BULLパワーラック1台 + 不足のCYBEXパワーラック1台
    if (photo === "freeweight_1" || (name === "パワーラック" && /bull/i.test(brand))) {
      const racks = [
        { id: "freeweight_1", label: "パワーラック", brand: "BULL", model: model || "パワーラック", photoKey: "freeweight_1" },
        { id: "freeweight_1b", label: "パワーラック", brand: "CYBEX", model: "パワーラック", photoKey: "freeweight_1" },
      ];
      for (const part of racks) {
        if (used.has(part.id)) continue;
        used.add(part.id);
        machines.push({
          id: part.id,
          name: displayExisting(part.label, part.brand),
          brand: part.brand,
          model: part.model,
          category,
          genre,
          source: "existing",
          qty: 1,
          width_cm,
          length_cm,
          clearance_cm: CLEARANCE_CM,
          module_width_cm,
          module_length_cm,
          place_px_w: module_width_cm,
          place_px_h: module_length_cm,
          has_art: true,
          ...filesFor(part.id, part.photoKey),
          photo_key: part.photoKey,
          link,
          note: part.id === "freeweight_1b" ? "シートに無く不足していたCYBEXパワーラックを追加" : "台数を1台に補正",
        });
      }
      continue;
    }

    // スミスマシン3台 → Technogym / Matrix / CYBEX 各1台
    if (photo === "freeweight_6" || name === "スミスマシン") {
      const smiths = [
        { id: "freeweight_6", label: "スミスマシン", brand: "Technogym", model: "Selection系想定", photoKey: "freeweight_6" },
        { id: "freeweight_6b", label: "スミスマシン", brand: "Matrix", model: "スミスマシン", photoKey: "freeweight_6" },
        { id: "freeweight_6c", label: "スミスマシン", brand: "CYBEX", model: "スミスマシン", photoKey: "freeweight_6" },
      ];
      for (const part of smiths) {
        if (used.has(part.id)) continue;
        used.add(part.id);
        machines.push({
          id: part.id,
          name: displayExisting(part.label, part.brand),
          brand: part.brand,
          model: part.model,
          category,
          genre,
          source: "existing",
          qty: 1,
          width_cm,
          length_cm,
          clearance_cm: CLEARANCE_CM,
          module_width_cm,
          module_length_cm,
          place_px_w: module_width_cm,
          place_px_h: module_length_cm,
          has_art: true,
          ...filesFor(part.id, part.photoKey),
          photo_key: part.photoKey,
          link,
          note: "メーカー別に各1台へ分割",
        });
      }
      continue;
    }

    const id = resolveId(photo, used);
    if (!id) continue;
    const files = filesFor(id, photo);
    // 例: CYBEX　ショルダープレス
    const displayName = displayExisting(name, brand);
    machines.push({
      id,
      name: displayName,
      brand,
      model,
      category,
      genre,
      source: "existing",
      qty,
      width_cm,
      length_cm,
      clearance_cm: CLEARANCE_CM,
      module_width_cm,
      module_length_cm,
      place_px_w: module_width_cm,
      place_px_h: module_length_cm,
      has_art: true,
      ...files,
      photo_key: photo,
      link,
    });
  }
  return machines;
}

function buildDumbbellAreas(used) {
  return DUMBBELL_AREA_MACHINES.map((row) => {
    used.add(row.id);
    const width_cm = row.width_cm;
    const length_cm = row.length_cm;
    const module_width_cm = width_cm + CLEARANCE_CM * 2;
    const module_length_cm = length_cm + CLEARANCE_CM * 2;
    return {
      id: row.id,
      name: row.name,
      brand: row.brand || "",
      model: row.model || "",
      category: "freeweight",
      genre: "freeweight",
      source: "existing",
      qty: row.qty || 1,
      width_cm,
      length_cm,
      clearance_cm: CLEARANCE_CM,
      module_width_cm,
      module_length_cm,
      place_px_w: module_width_cm,
      place_px_h: module_length_cm,
      has_art: true,
      lp_image: row.lp_image || `${row.art_id || row.id}.jpg`,
      place_file: `${row.art_id || row.id}_place.png`,
      preview_file: `${row.art_id || row.id}_preview.png`,
      photo_key: row.art_id || row.id,
      note: row.note || "",
    };
  });
}

function buildCuratedResistance(used) {
  return CURATED_RESISTANCE_MACHINES.map((row) => {
    used.add(row.id);
    const width_cm = row.width_cm;
    const length_cm = row.length_cm;
    const module_width_cm = width_cm + CLEARANCE_CM * 2;
    const module_length_cm = length_cm + CLEARANCE_CM * 2;
    const genre = row.genre || "stack";
    return {
      id: row.id,
      name: row.name,
      brand: row.brand || "",
      model: row.model || "",
      category:
        genre === "cardio" || genre === "hyrox"
          ? "cardio"
          : genre === "freeweight" || genre === "pilates"
            ? "freeweight"
            : "resistance",
      genre,
      source: "new",
      qty: row.qty || 1,
      sheet_qty: row.qty || 1,
      width_cm,
      length_cm,
      height_cm: row.height_cm ?? null,
      clearance_cm: CLEARANCE_CM,
      module_width_cm,
      module_length_cm,
      place_px_w: module_width_cm,
      place_px_h: module_length_cm,
      has_art: true,
      place_file: `${row.id}_place.png`,
      preview_file: `${row.id}_preview.png`,
      lp_image: `${row.id}.jpg`,
      link: row.link || "",
      note: row.note || "",
      status: "採用中",
      zone: row.zone || "",
      load_type: row.load_type || "pin",
    };
  });
}

async function fetchNew(used) {
  const res = await fetch(NEW_CSV, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`new sheet ${res.status}`);
  const rows = parseCsv(await res.text());
  const header = rows[0].map((h) => String(h || "").trim());
  const idx = {};
  header.forEach((h, i) => {
    if (h && idx[h] == null) idx[h] = i;
  });

  // 新旧フォーマット両対応
  const nameI = idx["名称"] ?? idx["名称"];
  const wI = idx["幅_mm"] ?? idx["幅(mm)"];
  const dI = idx["奥行_mm"] ?? idx["奥行(mm)"];
  const hI = idx["高さ_mm"] ?? idx["高さ(mm)"];
  const qtyI = idx["台数"];
  const zoneI = idx["ゾーン候補"];
  const linkI = idx["商品リンク"];
  const noteI = idx["備考"];
  const statusI = idx["状態"];

  const machines = [];
  for (const r of rows.slice(1)) {
    const name = String(r[nameI] || "").trim();
    if (!name) continue;
    if (SKIP_NEW_SHEET_NAMES.has(name)) continue;
    const width_cm = mmToCm(r[wI]);
    const length_cm = mmToCm(r[dI]);
    if (width_cm == null || length_cm == null) continue;
    const rawQty = Number(r[qtyI]);
    // 台数0の候補も配置検討できるよう多めに
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 9;
    const zone = zoneI != null ? String(r[zoneI] || "").trim() : "";
    const genre = genreNew(name, zone);
    const id = slugId(name, used);
    const module_width_cm = width_cm + CLEARANCE_CM * 2;
    const module_length_cm = length_cm + CLEARANCE_CM * 2;
    const displayName = displayNew(name);
    machines.push({
      id,
      name: displayName,
      sheet_name: name,
      brand: "",
      model: zone || "",
      category:
        genre === "cardio" || genre === "hyrox"
          ? "cardio"
          : genre === "freeweight"
            ? "freeweight"
            : "resistance",
      genre,
      source: "new",
      qty,
      sheet_qty: Number.isFinite(rawQty) ? rawQty : 0,
      width_cm,
      length_cm,
      height_cm: mmToCm(r[hI]) || null,
      clearance_cm: CLEARANCE_CM,
      module_width_cm,
      module_length_cm,
      place_px_w: module_width_cm,
      place_px_h: module_length_cm,
      has_art: true,
      place_file: `${id}_place.png`,
      preview_file: `${id}_preview.png`,
      lp_image: "",
      link: linkI != null ? String(r[linkI] || "") : "",
      note: noteI != null ? String(r[noteI] || "") : "",
      status: statusI != null ? String(r[statusI] || "") : "",
      zone,
    });
  }
  return machines;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method not allowed" });
  try {
    const used = new Set();
    const existing = await fetchExisting(used);
    const dumbbellAreas = buildDumbbellAreas(used);
    const curated = buildCuratedResistance(used);
    let neu = [];
    try {
      neu = await fetchNew(used);
    } catch (err) {
      console.warn("new machines fetch failed", err);
    }
    const machines = [...existing, ...dumbbellAreas, ...curated, ...neu];
    return res.status(200).json({
      ok: true,
      source: "sheet:既存+新マシン+ダンベルエリア+採用レジスタンス",
      syncedAt: new Date().toISOString(),
      count: machines.length,
      existingCount: existing.length + dumbbellAreas.length,
      newCount: curated.length + neu.length,
      genres: GENRE,
      machines,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err?.message || "fetch failed" });
  }
}
