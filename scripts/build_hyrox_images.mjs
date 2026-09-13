/** HYROX標準構成の図面用画像を公式販売ページの商品画像から生成する。 */
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLACE_DIR = path.join(ROOT, "floorplan/machines/place");
const PREVIEW_DIR = path.join(ROOT, "floorplan/machines/preview");
const RAW_DIR = path.join(ROOT, "floorplan/machines/_raw_new");

const ITEMS = [
  {
    id: "new_スキーエルゴ_pm5_スタンド付",
    width: 61,
    depth: 132,
    image: "https://concept2.ocnk.net/data/concept2/image/ski2-14.jpg",
  },
  {
    id: "new_ローイングマシン_ローエルゴ",
    width: 61,
    depth: 244,
    image: "https://concept2.ocnk.net/data/concept2/image/st2-8.jpg",
  },
  {
    id: "new_centr_スレッド_ソリ",
    width: 60,
    depth: 102,
    image: "https://centrfitness.eu/cdn/shop/files/centr-x-hyrox-competition-power-sled.jpg?v=1768898210&width=1200",
  },
  {
    id: "new_hyroxターフ_人工芝レーン・hturf4",
    width: 200,
    depth: 1620,
    image: "https://cdn.shopify.com/s/files/1/0555/0309/3831/files/official-hyrox-perform-turf-227338_800x800.jpg?v=1760609370",
  },
];

function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
        res.resume();
        return download(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function render(item) {
  const raw = await download(item.image);
  const max = 900;
  const W = item.width >= item.depth ? max : Math.max(40, Math.round(max * item.width / item.depth));
  const H = item.depth >= item.width ? max : Math.max(40, Math.round(max * item.depth / item.width));
  const photo = await sharp(raw).rotate().resize(Math.max(24, Math.round(W * 0.92)), Math.max(24, Math.round(H * 0.92)), {
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  }).png().toBuffer();
  const meta = await sharp(photo).metadata();
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 238, g: 241, b: 244 } } })
    .composite([{ input: photo, left: Math.round((W - meta.width) / 2), top: Math.round((H - meta.height) / 2) }])
    .png().toFile(path.join(PLACE_DIR, `${item.id}_place.png`));
  await sharp(raw).rotate().resize(256, 256, { fit: "contain", background: { r: 238, g: 241, b: 244, alpha: 1 } })
    .png().toFile(path.join(PREVIEW_DIR, `${item.id}_preview.png`));
  fs.writeFileSync(path.join(RAW_DIR, `${item.id}.img`), raw);
  console.log(`${item.id}: ${W}x${H} (${item.width}:${item.depth})`);
}

fs.mkdirSync(PLACE_DIR, { recursive: true });
fs.mkdirSync(PREVIEW_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });
for (const item of ITEMS) await render(item);
