import { put, head, BlobNotFoundError } from "@vercel/blob";

export const CUSTOM_CATALOG_PATH = "machines/custom/catalog.json";
export const CUSTOM_DIR = "machines/custom/";
export const CLEARANCE_CM = 80;

export function cors(res, methods = "GET,POST,OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function emptyCatalog() {
  return { extras: [], overrides: {}, updatedAt: null };
}

export async function readCustomCatalog() {
  try {
    const meta = await head(CUSTOM_CATALOG_PATH);
    const res = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return emptyCatalog();
    const data = await res.json();
    return {
      extras: Array.isArray(data?.extras) ? data.extras : [],
      overrides: data?.overrides && typeof data.overrides === "object" ? data.overrides : {},
      updatedAt: data?.updatedAt || null,
    };
  } catch (err) {
    if (err instanceof BlobNotFoundError || err?.name === "BlobNotFoundError") {
      return emptyCatalog();
    }
    console.error("readCustomCatalog failed", err);
    return emptyCatalog();
  }
}

export async function writeCustomCatalog(catalog) {
  const next = {
    extras: Array.isArray(catalog.extras) ? catalog.extras : [],
    overrides: catalog.overrides && typeof catalog.overrides === "object" ? catalog.overrides : {},
    updatedAt: new Date().toISOString(),
  };
  await put(CUSTOM_CATALOG_PATH, JSON.stringify(next), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return next;
}

export function genreToCategory(genre) {
  if (genre === "cardio" || genre === "hyrox") return "cardio";
  if (genre === "freeweight") return "freeweight";
  return "resistance";
}

export function buildSized(width_cm, length_cm) {
  const w = Math.round(Number(width_cm));
  const l = Math.round(Number(length_cm));
  const module_width_cm = w + CLEARANCE_CM * 2;
  const module_length_cm = l + CLEARANCE_CM * 2;
  return {
    width_cm: w,
    length_cm: l,
    clearance_cm: CLEARANCE_CM,
    module_width_cm,
    module_length_cm,
    place_px_w: module_width_cm,
    place_px_h: module_length_cm,
  };
}

export function imgApiUrl(path, ver) {
  const q = ver ? `&v=${encodeURIComponent(String(ver))}` : "";
  return `/api/machine-img?path=${encodeURIComponent(path)}${q}`;
}

export function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;
  return {
    contentType: m[1] || "image/jpeg",
    buffer: Buffer.from(m[2], "base64"),
  };
}

export function safeCustomPath(raw) {
  const path = String(raw || "").replace(/^\/+/, "");
  if (!path.startsWith(CUSTOM_DIR)) return null;
  if (path.includes("..") || path.includes("\\")) return null;
  return path;
}

export function slugPart(name) {
  return (
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 28) || "machine"
  );
}

export function newExtraId(name) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `extra_${slugPart(name)}_${rand}`;
}

export function withArtUrls(machine, ver = Date.now()) {
  const placePath = machine.place_path || (machine.place_file ? `${CUSTOM_DIR}${machine.place_file}` : "");
  const previewPath =
    machine.preview_path || (machine.preview_file ? `${CUSTOM_DIR}${machine.preview_file}` : "");
  return {
    ...machine,
    has_art: !!(placePath || previewPath || machine.has_art),
    place_url: placePath ? imgApiUrl(placePath, ver) : machine.place_url || "",
    preview_url: previewPath ? imgApiUrl(previewPath, ver) : machine.preview_url || "",
  };
}
