import { put } from "@vercel/blob";
import {
  cors,
  readCustomCatalog,
  writeCustomCatalog,
  buildSized,
  genreToCategory,
  parseDataUrl,
  newExtraId,
  withArtUrls,
  CUSTOM_DIR,
} from "./customMachines.js";

const ALLOWED_GENRES = new Set(["stack", "plate", "freeweight", "cardio", "hyrox", "pilates"]);

function bad(res, code, message) {
  return res.status(code).json({ ok: false, error: message });
}

async function saveImage(id, imageBase64) {
  const parsed = parseDataUrl(imageBase64);
  if (!parsed || !parsed.buffer?.length) {
    throw new Error("invalid image");
  }
  const ext = /png/i.test(parsed.contentType) ? "png" : "jpg";
  const placeFile = `${id}_place.${ext}`;
  const previewFile = `${id}_preview.${ext}`;
  const placePath = `${CUSTOM_DIR}${placeFile}`;
  const previewPath = `${CUSTOM_DIR}${previewFile}`;
  await put(placePath, parsed.buffer, {
    access: "private",
    contentType: parsed.contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  await put(previewPath, parsed.buffer, {
    access: "private",
    contentType: parsed.contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { placeFile, previewFile, placePath, previewPath };
}

function normalizeBody(body) {
  const mode = body.mode === "update" ? "update" : "create";
  const name = String(body.name || "").trim().slice(0, 120);
  const link = String(body.link || "").trim().slice(0, 500);
  const note = String(body.note || "").trim().slice(0, 200);
  const by = String(body.by || "anonymous").trim().slice(0, 40) || "anonymous";
  const source = body.source === "existing" ? "existing" : "new";
  const genreRaw = String(body.genre || "stack");
  const genre = ALLOWED_GENRES.has(genreRaw) ? genreRaw : "stack";
  const width_cm = Number(body.width_cm);
  const length_cm = Number(body.length_cm);
  const qty = Math.max(1, Math.min(99, Math.round(Number(body.qty) || 1)));
  const id = String(body.id || "").trim().slice(0, 80);
  const imageBase64 = body.imageBase64 ? String(body.imageBase64) : "";
  return { mode, name, link, note, by, source, genre, width_cm, length_cm, qty, id, imageBase64 };
}

export default async function handler(req, res) {
  cors(res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return bad(res, 405, "method not allowed");

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const input = normalizeBody(body);
    if (!input.name) return bad(res, 400, "name required");
    if (!Number.isFinite(input.width_cm) || input.width_cm < 10) return bad(res, 400, "width_cm invalid");
    if (!Number.isFinite(input.length_cm) || input.length_cm < 10) return bad(res, 400, "length_cm invalid");
    if (input.mode === "create" && !input.imageBase64) return bad(res, 400, "image required");
    if (input.mode === "update" && !input.id) return bad(res, 400, "id required");

    const catalog = await readCustomCatalog();
    const sized = buildSized(input.width_cm, input.length_cm);
    const now = Date.now();
    let machine;

    if (input.mode === "create") {
      const id = newExtraId(input.name);
      let art = null;
      if (input.imageBase64) art = await saveImage(id, input.imageBase64);
      machine = withArtUrls(
        {
          id,
          name: input.name,
          brand: "",
          model: "",
          category: genreToCategory(input.genre),
          genre: input.genre,
          source: input.source,
          qty: input.qty,
          sheet_qty: input.qty,
          ...sized,
          has_art: true,
          place_file: art?.placeFile || "",
          preview_file: art?.previewFile || "",
          place_path: art?.placePath || "",
          preview_path: art?.previewPath || "",
          lp_image: "",
          link: input.link,
          note: input.note,
          status: "WEB追加",
          zone: "",
          planTarget: "YES",
          by: input.by,
          updatedAt: new Date().toISOString(),
        },
        now
      );
      catalog.extras = [machine, ...catalog.extras.filter((x) => x?.id !== id)];
    } else {
      const id = input.id;
      const extraIdx = catalog.extras.findIndex((x) => x?.id === id);
      const prev =
        extraIdx >= 0
          ? catalog.extras[extraIdx]
          : catalog.overrides[id] && typeof catalog.overrides[id] === "object"
            ? catalog.overrides[id]
            : {};

      let art = null;
      if (input.imageBase64) art = await saveImage(id, input.imageBase64);

      const next = withArtUrls(
        {
          ...prev,
          id,
          name: input.name,
          category: genreToCategory(input.genre),
          genre: input.genre,
          source: input.source,
          qty: input.qty,
          sheet_qty: input.qty,
          ...sized,
          has_art: true,
          place_file: art?.placeFile || prev.place_file || "",
          preview_file: art?.previewFile || prev.preview_file || "",
          place_path: art?.placePath || prev.place_path || "",
          preview_path: art?.previewPath || prev.preview_path || "",
          link: input.link,
          note: input.note,
          status: String(id).startsWith("extra_") ? "WEB追加" : prev.status || "寸法上書き",
          by: input.by,
          updatedAt: new Date().toISOString(),
          overridden: !String(id).startsWith("extra_"),
        },
        now
      );

      if (extraIdx >= 0 || String(id).startsWith("extra_")) {
        if (extraIdx >= 0) catalog.extras[extraIdx] = next;
        else catalog.extras.unshift(next);
        machine = next;
      } else {
        catalog.overrides[id] = next;
        machine = next;
      }
    }

    await writeCustomCatalog(catalog);

    return res.status(200).json({
      ok: true,
      // スプシ同期は未接続。Blob が正。UI は sheetWarning で案内可能
      sheetWarning: true,
      machine,
    });
  } catch (err) {
    console.error(err);
    return bad(res, 500, err?.message || "save failed");
  }
}
