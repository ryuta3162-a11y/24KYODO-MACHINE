/**
 * ダンベルエリア用: IVANKO / ZIVA / 1–10kg の place・preview 生成
 */
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PLACE_DIR = path.join(ROOT, "floorplan/machines/place");
const PREVIEW_DIR = path.join(ROOT, "floorplan/machines/preview");
const RAW_DIR = path.join(ROOT, "floorplan/machines/_raw_dumbbell");
const MAX_SIDE = 900;
const PREVIEW_SIZE = 256;

fs.mkdirSync(PLACE_DIR, { recursive: true });
fs.mkdirSync(PREVIEW_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

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
          const next = new URL(res.headers.location, url).href;
          return fetchBuf(next, redirects + 1).then(resolve, reject);
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

async function makePlace(rawBuf, widthCm, lengthCm, outPlace, outPreview, { labelCrop = 0 } = {}) {
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

  let work = rawBuf;
  if (labelCrop > 0) {
    const meta0 = await sharp(rawBuf).rotate().metadata();
    const cropH = Math.max(40, Math.round((meta0.height || 100) * (1 - labelCrop)));
    work = await sharp(rawBuf)
      .rotate()
      .extract({ left: 0, top: 0, width: meta0.width || 1, height: cropH })
      .toBuffer();
  }

  const photo = await sharp(work)
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

  await sharp(work)
    .rotate()
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, {
      fit: "contain",
      background: { r: 236, g: 238, b: 241, alpha: 1 },
    })
    .png()
    .toFile(outPreview);

  return { W, H };
}

async function loadSource(spec) {
  if (spec.local) {
    const p = path.isAbsolute(spec.local) ? spec.local : path.join(ROOT, spec.local);
    if (!fs.existsSync(p)) throw new Error(`missing local ${p}`);
    return fs.readFileSync(p);
  }
  const r = await fetchBuf(spec.url);
  if (r.status >= 400 || r.buf.length < 3000) throw new Error(`download fail ${r.status} ${r.buf.length}`);
  const rawPath = path.join(RAW_DIR, spec.id + path.extname(new URL(spec.url).pathname).replace(/\?.*/, "") || ".jpg");
  fs.writeFileSync(rawPath, r.buf);
  return r.buf;
}

const USER_AFRAME =
  "C:/Users/ryuta-kusaka/.cursor/projects/c-Users-ryuta-kusaka-Documents-GitHub-24KYODO-MACHINE/assets/c__Users_ryuta-kusaka_AppData_Roaming_Cursor_User_workspaceStorage_1981706a66fa0f0b56953ff92cb5339e_images_image-4b43ae1f-16dc-4015-a635-4e8696fd8560.png";

const jobs = [
  {
    id: "dumbbell_area_12_30",
    width_cm: 240,
    length_cm: 70,
    local: "freeweight_10.jpg", // 既存店内 IVANKO 2段ラック
    labelCrop: 0.14,
  },
  {
    id: "dumbbell_area_32_40",
    width_cm: 220,
    length_cm: 70,
    url: "https://assets01.ziva.com/commercial/Storage/Storage+2024/ZXP-DBST-2331.jpg",
  },
  {
    id: "dumbbell_area_1_10",
    width_cm: 100,
    length_cm: 100,
    local: USER_AFRAME,
  },
];

for (const job of jobs) {
  const buf = await loadSource(job);
  const place = path.join(PLACE_DIR, `${job.id}_place.png`);
  const preview = path.join(PREVIEW_DIR, `${job.id}_preview.png`);
  const size = await makePlace(buf, job.width_cm, job.length_cm, place, preview, {
    labelCrop: job.labelCrop || 0,
  });
  // ローカル原本も repo に残す（1–10 / ZIVA）
  if (job.id === "dumbbell_area_1_10") {
    await sharp(buf).jpeg({ quality: 90 }).toFile(path.join(ROOT, "dumbbell_area_1_10.jpg"));
  }
  if (job.id === "dumbbell_area_32_40") {
    await sharp(buf).jpeg({ quality: 90 }).toFile(path.join(ROOT, "dumbbell_area_32_40.jpg"));
  }
  console.log("ok", job.id, `${job.width_cm}x${job.length_cm}`, "→", `${size.W}x${size.H}`);
}

console.log("done");
