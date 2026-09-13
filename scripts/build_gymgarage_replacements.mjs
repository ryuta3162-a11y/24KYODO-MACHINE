/** 添付されたGYM GARAGE商品画像を、実寸比の配置／一覧素材へ変換する。 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "floorplan/machines/_raw_new");
const PLACE = path.join(ROOT, "floorplan/machines/place");
const PREVIEW = path.join(ROOT, "floorplan/machines/preview");
const MAX_SIDE = 900;
const BG = { r: 236, g: 238, b: 241 };

const jobs = [
  { id: "new_standing_abductor", file: "gymgarage_hip_thrust.png", widthCm: 127.8, lengthCm: 172.5 },
  { id: "new_seated_row_machine_dual_row系", file: "gymgarage_pulldown_row.png", widthCm: 121.3, lengthCm: 180.8 },
];

async function build(job) {
  const input = path.join(RAW, job.file);
  const raw = await sharp(input).rotate().trim({ background: "#ffffff", threshold: 10 }).png().toBuffer();
  let width;
  let height;
  if (job.widthCm >= job.lengthCm) {
    width = MAX_SIDE;
    height = Math.max(40, Math.round((MAX_SIDE * job.lengthCm) / job.widthCm));
  } else {
    height = MAX_SIDE;
    width = Math.max(40, Math.round((MAX_SIDE * job.widthCm) / job.lengthCm));
  }
  const photo = await sharp(raw)
    .resize(Math.round(width * 0.92), Math.round(height * 0.92), { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const meta = await sharp(photo).metadata();
  await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite([{ input: photo, left: Math.round((width - meta.width) / 2), top: Math.round((height - meta.height) / 2) }])
    .png()
    .toFile(path.join(PLACE, `${job.id}_place.png`));
  await sharp(raw)
    .resize(256, 256, { fit: "contain", background: { ...BG, alpha: 1 } })
    .png()
    .toFile(path.join(PREVIEW, `${job.id}_preview.png`));
  console.log(`${job.id}: ${width}x${height}`);
}

fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(PLACE, { recursive: true });
fs.mkdirSync(PREVIEW, { recursive: true });
for (const job of jobs) await build(job);
