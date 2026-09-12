/**
 * 既存レジスタンス: リポジトリ内 resistance_*.jpg → 寸法アスペクトの place/preview
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PLACE_DIR = path.join(ROOT, "floorplan/machines/place");
const PREVIEW_DIR = path.join(ROOT, "floorplan/machines/preview");
const API = "https://24kyodo-machine.vercel.app/api/machines";
const MAX_SIDE = 900;
const PREVIEW_SIZE = 256;
/** Canvaラベル帯を下から切る割合 */
const LABEL_CROP = 0.12;

async function makePlace(rawBuf, widthCm, lengthCm, outPlace, outPreview) {
  const w = Math.max(20, Number(widthCm) || 100);
  const l = Math.max(20, Number(lengthCm) || 100);
  let W;
  let H;
  if (w >= l) {
    W = MAX_SIDE;
    H = Math.max(40, Math.round((MAX_SIDE * l) / w));
  } else {
    H = MAX_SIDE;
    W = Math.max(40, Math.round((MAX_SIDE * w) / l));
  }

  // 下ラベルを軽くトリム
  const meta0 = await sharp(rawBuf).metadata();
  const cropH = Math.max(40, Math.round((meta0.height || 100) * (1 - LABEL_CROP)));
  const cropped = await sharp(rawBuf)
    .rotate()
    .extract({ left: 0, top: 0, width: meta0.width || 1, height: cropH })
    .toBuffer();

  const photo = await sharp(cropped)
    .resize(Math.round(W * 0.92), Math.round(H * 0.92), {
      fit: "inside",
      withoutEnlargement: false,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  const pmeta = await sharp(photo).metadata();

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 236, g: 238, b: 241 },
    },
  })
    .composite([
      {
        input: photo,
        left: Math.max(0, Math.round((W - (pmeta.width || 0)) / 2)),
        top: Math.max(0, Math.round((H - (pmeta.height || 0)) / 2)),
      },
    ])
    .png()
    .toFile(outPlace);

  await sharp(cropped)
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, {
      fit: "contain",
      background: { r: 236, g: 238, b: 241, alpha: 1 },
    })
    .png()
    .toFile(outPreview);

  return { W, H };
}

function resolveSource(m) {
  const keys = [
    m.lp_image,
    m.photo_key ? `${String(m.photo_key).replace(/\.jpe?g$/i, "")}.jpg` : null,
    `${m.id}.jpg`,
    m.id === "resistance_10_11" ? "resistance_10.jpg" : null,
  ].filter(Boolean);

  for (const k of keys) {
    const p = path.join(ROOT, k);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const api = await fetch(API).then((r) => r.json());
const machines = (api.machines || []).filter(
  (m) => m.source === "existing" && (m.category === "resistance" || /^resistance_/.test(m.id))
);
console.log("resistance machines", machines.length);

const report = [];
for (const m of machines) {
  const src = resolveSource(m);
  const placePath = path.join(PLACE_DIR, m.place_file || `${m.id}_place.png`);
  const previewPath = path.join(PREVIEW_DIR, m.preview_file || `${m.id}_preview.png`);
  if (!src) {
    console.log("NO SRC", m.id, m.name);
    report.push({ id: m.id, status: "no-src" });
    continue;
  }
  try {
    const buf = fs.readFileSync(src);
    const size = await makePlace(buf, m.width_cm, m.length_cm, placePath, previewPath);
    console.log(
      "ok",
      m.name,
      path.basename(src),
      `${m.width_cm}x${m.length_cm}`,
      "→",
      `${size.W}x${size.H}`
    );
    report.push({ id: m.id, status: "ok", src: path.basename(src), ...size });
  } catch (e) {
    console.log("FAIL", m.id, e.message);
    report.push({ id: m.id, status: "fail", error: e.message });
  }
}

fs.writeFileSync(
  path.join(ROOT, "floorplan/_rebuild_resistance_report.json"),
  JSON.stringify(report, null, 2)
);
console.log(
  "done",
  report.filter((r) => r.status === "ok").length,
  "/",
  machines.length
);
