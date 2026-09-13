/**
 * 採用レジスタンス＋リフォーマーの place/preview 生成
 */
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { CURATED_RESISTANCE_MACHINES } from "../api/curatedResistance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PLACE_DIR = path.join(ROOT, "floorplan/machines/place");
const PREVIEW_DIR = path.join(ROOT, "floorplan/machines/preview");
const RAW_DIR = path.join(ROOT, "floorplan/machines/_raw_curated");
const MAX_SIDE = 900;
const PREVIEW_SIZE = 256;

fs.mkdirSync(PLACE_DIR, { recursive: true });
fs.mkdirSync(PREVIEW_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

const DIRECT = {
  hoist_rs2700_chin_dip_assist: [
    "https://www.hoistfitness.com/cdn/shop/files/RS-2700.png",
    "https://fitdir.com/wp-content/uploads/2023/03/Hoist-RS-2700-Chin-Dip-Assist.jpg",
  ],
  cybex_ion_biceps_triceps: [
    "https://www.lifefitness.com/resource/blob/2525866/cybex-ion-biceps-triceps-data.jpg",
    "https://shop.lifefitness.com/cdn/shop/files/axiom-biceps-triceps.jpg",
  ],
  matrix_ultra_prone_leg_curl: [
    "https://www.johnsonfitness.com.au/cdn/shop/files/Matrix-Ultra-Prone-Leg-Curl.jpg",
    "https://images.jhtassets.com/5f5a5a5a/MatrixUltraProneLegCurl.jpg",
  ],
  booty_builder_platinum: [
    "https://bootybuilder.com/wp-content/uploads/2024/02/platinum-v4-main.jpg",
    "https://bootybuilder.com/wp-content/uploads/2023/11/Booty-Builder-Platinum-V4-1.jpg",
  ],
  ab_coaster_cs1500: [
    "https://fitnessshop.jp/cdn/shop/products/abcoaster-cs1500.jpg",
    "https://cdn.shopify.com/s/files/1/0558/1234/products/abcoaster.jpg",
  ],
};

const REFORMER_SRC = path.join(ROOT, "pilates_reformer.jpg");

function fetchBuf(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (!url || !/^https?:/i.test(url)) return reject(new Error("bad url"));
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "image/*,*/*",
        },
        timeout: 45000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects > 8) return reject(new Error("redirects"));
          return fetchBuf(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, buf: Buffer.concat(chunks), ctype: res.headers["content-type"] || "" })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

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
  const photo = await sharp(rawBuf)
    .rotate()
    .resize(Math.round(W * 0.92), Math.round(H * 0.92), {
      fit: "inside",
      withoutEnlargement: false,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  const pmeta = await sharp(photo).metadata();
  await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 236, g: 238, b: 241 } },
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
  await sharp(rawBuf)
    .rotate()
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, {
      fit: "contain",
      background: { r: 236, g: 238, b: 241, alpha: 1 },
    })
    .png()
    .toFile(outPreview);
  return { W, H };
}

async function loadImage(job) {
  if (job.id === "pilates_reformer" || job.local_image) {
    if (!fs.existsSync(REFORMER_SRC)) throw new Error("reformer src missing");
    return fs.readFileSync(REFORMER_SRC);
  }
  const urls = [...(DIRECT[job.id] || []), job.image_url].filter(Boolean);
  // scrape og:image from product page
  if (job.link) {
    try {
      const page = await fetchBuf(job.link);
      const html = page.buf.toString("utf8");
      const ogs = [
        ...html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)/gi),
        ...html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image/gi),
      ].map((m) => m[1].replace(/&amp;/g, "&"));
      urls.unshift(...ogs);
      const imgs = [...html.matchAll(/https?:[^"'\\\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s>]*)?/gi)].map(
        (m) => m[0].replace(/&amp;/g, "&")
      );
      urls.push(
        ...imgs.filter((u) => /product|cdn|shop|media|hoist|matrix|booty|abcoaster|lifefitness|cybex/i.test(u)).slice(0, 12)
      );
    } catch (e) {
      console.warn("page scrape fail", job.id, e.message);
    }
  }
  for (const u of [...new Set(urls)]) {
    try {
      const r = await fetchBuf(u);
      if (r.status >= 400 || r.buf.length < 4000) continue;
      if (!/image\//i.test(r.ctype) && !/\.(jpe?g|png|webp)(\?|$)/i.test(u)) continue;
      await sharp(r.buf).metadata();
      fs.writeFileSync(path.join(RAW_DIR, `${job.id}.img`), r.buf);
      console.log("img", job.id, u.slice(0, 100), r.buf.length);
      return r.buf;
    } catch {
      /* next */
    }
  }
  throw new Error(`no image for ${job.id}`);
}

for (const job of CURATED_RESISTANCE_MACHINES) {
  try {
    const buf = await loadImage(job);
    const place = path.join(PLACE_DIR, `${job.id}_place.png`);
    const preview = path.join(PREVIEW_DIR, `${job.id}_preview.png`);
    const size = await makePlace(buf, job.width_cm, job.length_cm, place, preview);
    await sharp(buf).jpeg({ quality: 88 }).toFile(path.join(ROOT, `${job.id}.jpg`));
    console.log("ok", job.id, `${job.width_cm}x${job.length_cm}`, "→", `${size.W}x${size.H}`);
  } catch (e) {
    console.error("FAIL", job.id, e.message);
  }
}
console.log("done");
