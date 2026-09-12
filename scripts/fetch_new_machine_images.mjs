/**
 * 新マシン: 商品ページから「実機写真」を優先取得 → 寸法アスペクトの place/preview 生成
 * 枠の縦横比 = width_cm : length_cm（1px=1cm の見た目比）
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
const RAW_DIR = path.join(ROOT, "floorplan/machines/_raw_new");
const API = "https://24kyodo-machine.vercel.app/api/machines";
const MAX_SIDE = 900;
const PREVIEW_SIZE = 256;

fs.mkdirSync(PLACE_DIR, { recursive: true });
fs.mkdirSync(PREVIEW_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

function absUrl(u, base) {
  try {
    return new URL(u, base).href;
  } catch {
    return null;
  }
}

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
          Accept: "text/html,image/*,*/*",
          "Accept-Language": "en,ja;q=0.8",
        },
        timeout: 30000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects > 8) return reject(new Error("redirects"));
          const next = absUrl(res.headers.location, url);
          return fetchBuf(next, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            buf: Buffer.concat(chunks),
            ctype: res.headers["content-type"] || "",
            url,
          })
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

function normalizeCandidateUrl(u) {
  if (!u) return u;
  return String(u)
    .replace(/&amp;/gi, "&")
    .replace(/%7Bwidth%7D/gi, "1200")
    .replace(/\{width\}/gi, "1200")
    .replace(/\{height\}/gi, "1200");
}

/** 明示的に商品写真URL（人物/ヒーロー写真を避ける） */
const DIRECT_IMAGE = {
  // Evolgear
  "ラバーダンベル EVA-D104 42.5kg〜60kg追加": "https://evolgear.com/img/product/eva-d104.webp",
  "アジャスタブルインクラインベンチ EVRB-L139": "https://evolgear.com/img/product/evrb-l139.webp",
  "フラットベンチ EVRB-C135": "https://evolgear.com/img/product/evrb-c135.webp",
  "オリンピックバー EVA-5000": "https://evolgear.com/img/product/eva-5000.webp",
  "プレートツリー EVRB-C154": "https://evolgear.com/img/product/evrb-c154.webp",
  // Precor GluteBuilder（公式 OG = 単体商品写真）
  "Selectorized 3D Multi-Abductor Pro": "https://www.precor.com/www.precor.com/products/GSL0622/og",
  "Hip Thrust Elite": "https://www.precor.com/www.precor.com/products/GPL0612/og",
  "Deadlift Elite": "https://www.precor.com/www.precor.com/products/GPL0551/og",
  // Life Fitness / Hammer
  "Impact Suppression Platform / Platform床材":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/isp-6x8-impact-suppression-platform.jpg",
  "Hammer Strength Select Leg Extension":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/15-336-hammer-strength-select-leg-extension-image-new.jpg",
  "Hammer Strength Select Leg Curl":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/15-337-hammer-strength-select-seated-leg-curl-image-new.jpg",
  "Abdominal Crunch":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/15-320-hammer-strength-select-abdominal-crunch-image-new.jpg",
  "Assist Dip Chin":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/15-321-hammer-strength-select-assisted-dip-chin-image-new.jpg",
  "Insignia Series Chest Press":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/insignia-series-chest-press.jpg",
  "PowerMill Climber":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/powermill-climber.jpg",
  "Integrity Treadmill":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/integrity-series-treadmill.jpg",
  "Integrity Cross-Trainer":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/integrity-series-cross-trainer.jpg",
  // Concept2
  "SkiErg PM5 スタンド付": "https://cms.concept2.com/sites/default/files/styles/max_2048/public/2023-01/SkiErg-PM5.jpg",
  "RowErg": "https://cms.concept2.com/sites/default/files/styles/max_2048/public/2023-01/RowErg-PM5.jpg",
  "BikeErg": "https://cms.concept2.com/sites/default/files/styles/max_2048/public/2023-01/BikeErg-PM5.jpg",
  // Rogue
  "Rogue Deadlift Jack":
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/product/images/Rogue-Deadlift-Bar-Jack-1.jpg",
  "Dog Sled 1.2":
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strength%20Equipment/Strength%20Training/Sleds/XX2044/XX2044-H_jcdfko.png",
  "Wall Ball":
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Conditioning/Medicine%20Balls/Wall%20Balls/XX1002/XX1002-H_xvvvqn.png",
  "Kettlebell Set":
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Conditioning/Kettlebells/Rogue%20Kettlebells/XX0015/XX0015-H_zqzqzq.png",
  "Farmer's Walk Handles":
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Handles/XX2051/XX2051-H.png",
  "LB-1 Rogue 10 Inch Log Bar":
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Logs/XX2010/XX2010-H.png",
  "Y-2 Yoke":
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Yokes/XX2035/XX2035-H.png",
  "Strongman Sandbag Set":
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Sandbags/XX2060/XX2060-H.png",
  // Arsenal
  "Reloaded T Bar Row":
    "https://www.myarsenalstrength.com/hs-fs/hubfs/Reloaded%20T-Bar%20Row.png",
  // HD Athletic rack
  "HD Athletic NX Half Half Combo Rack":
    "https://www.lifefitness.com/Kentico13CoreBase/media/LFMedia/LifeFitnessImages/MediaSync/hd-athletic-nx-half-half-combo-rack.jpg",
};

const PAGE_URL = {
  "HD Athletic NX Half Half Combo Rack":
    "https://www.lifefitness.com/en-us/catalog/strength-training/racks-rigs-platforms/hd-athletic-nx-half-half-combo-rack",
  "Standing Abductor": "https://www.panattasport.com/en/fit-evo/standing-abductor-machine/",
  "C50 ClimbMill": "https://www.matrixfitness.com/us/eng/commercial/cardio/climbmills/c50",
  "Rogue Deadlift Jack": "https://www.roguefitness.com/bar-jack",
  "Selectorized 3D Multi-Abductor Pro": "https://www.precor.com/en-US/products/GSL0622",
  "Hip Thrust Elite": "https://www.precor.com/en-US/products/GPL0612",
  "Deadlift Elite": "https://www.precor.com/en-US/products/GPL0551",
};

const REJECT_RE =
  /sprite|icon|logo|favicon|1x1|pixel|badge|flag|ogp_image|sns\/evolgear|product-menu-bg|solution-|header|hero|banner|facebook\.com\/tr|ytimg|avatar|portrait|lifestyle|people|athlete|trainer|menu-bg|corporate\.png|country-club|education-hero|hospitality|multi-family|ymca|marketing-tools|precor-education|product-documentation|commercial-header/i;

function scoreUrl(u, ctx = {}) {
  const s = u.toLowerCase();
  let score = 0;
  if (REJECT_RE.test(s)) score -= 100;
  if (/\/img\/product\//i.test(s)) score += 80;
  if (/evrb-|eva-|gsl0|gpl0|pure_kraft|hammer-strength|catalog\/product/i.test(s)) score += 40;
  if (/wp-content\/uploads/i.test(s) && ctx.productCode && s.includes(String(ctx.productCode))) score += 50;
  if (/assets\.roguefitness\.com/i.test(s) && /-h[_./]|catalog\//i.test(s)) score += 30;
  if (/cms\.concept2\.com/i.test(s)) score += 30;
  if (/lifefitness\.com.*mediasync/i.test(s)) score += 35;
  if (/precor\.com\/www\.precor\.com\/products\/.+\/og/i.test(s)) score += 70;
  if (/og:|twitter|sns\//i.test(s)) score -= 20;
  if (/\.svg(\?|$)/i.test(s)) score -= 50;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(s)) score += 5;
  if (ctx.sku && s.includes(ctx.sku.toLowerCase())) score += 60;
  return score;
}

function extractImages(html, pageUrl, ctx = {}) {
  const found = [];
  const push = (u) => {
    let a = absUrl(u, pageUrl);
    if (!a || !/^https?:/i.test(a)) return;
    a = normalizeCandidateUrl(a);
    if (/\.svg(\?|$)/i.test(a)) return;
    if (REJECT_RE.test(a)) return;
    found.push(a);
  };

  // Evolgear: 相対パス ../img/product/xxx.webp を絶対化
  const relProd = [...html.matchAll(/(?:\.\.\/)?img\/product\/[a-z0-9_-]+\.(?:webp|jpg|jpeg|png)/gi)];
  for (const m of relProd) push("https://evolgear.com/" + m[0].replace(/^\.\.\//, ""));

  // Precor product SKU → OG endpoint
  const precorSku = pageUrl.match(/precor\.com\/(?:en-[A-Z]{2}\/)?products\/([A-Z0-9]+)/i);
  if (precorSku) push(`https://www.precor.com/www.precor.com/products/${precorSku[1]}/og`);

  const metas = [
    /property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/gi,
    /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/gi,
  ];
  for (const re of metas) {
    let m;
    while ((m = re.exec(html))) push(m[1]);
  }

  const imgRe = /<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html))) push(m[1]);

  const cdnRe = /https?:\/\/[^"'>\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'>\s]*)?/gi;
  while ((m = cdnRe.exec(html))) {
    if (/product|catalog|media|cdn|wp-content|uploads|images|shop\/files|ctfassets|azurefd|cloudinary|mediasync|roguefitness|concept2|evolgear\/img\/product/i.test(m[0]))
      push(m[0]);
  }

  found.sort((a, b) => scoreUrl(b, ctx) - scoreUrl(a, ctx));
  return [...new Set(found)].slice(0, 40);
}

async function pickBestImage(candidates, ctx = {}) {
  let best = null;
  for (const u of candidates) {
    const urlScore = scoreUrl(u, ctx);
    if (urlScore < -20) continue;
    try {
      const r = await fetchBuf(u);
      if (r.status >= 400) continue;
      if (!/image\//i.test(r.ctype) && !/\.(jpe?g|png|webp)(\?|$)/i.test(u)) continue;
      if (r.buf.length < 5000) continue;
      const meta = await sharp(r.buf).metadata();
      const w = meta.width || 0;
      const h = meta.height || 0;
      if (w < 80 || h < 80) continue;
      const ratio = w / Math.max(h, 1);
      // 極端に横長のジム全景は除外（商品OGの1200x630は許可）
      if (ratio > 3.2 && urlScore < 40) continue;
      if (ratio < 0.25 && urlScore < 40) continue;
      const area = w * h;
      // スコア優先、同点なら適度なサイズ
      const sizeBonus = Math.min(area / 50000, 20);
      const total = urlScore * 10 + sizeBonus;
      if (!best || total > best.total) {
        best = { buf: r.buf, url: r.url, area, w, h, total, urlScore };
      }
      // 高スコア商品パスなら即採用
      if (urlScore >= 70 && area > 20000) break;
    } catch {
      /* next */
    }
  }
  return best;
}

async function makePlace(rawBuf, widthCm, lengthCm, outPlace, outPreview) {
  const w = Math.max(20, Number(widthCm) || 100);
  const l = Math.max(20, Number(lengthCm) || 100);
  let W;
  let H;
  // 枠のアスペクト = 図面の幅:奥行（cm）
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

  await sharp(rawBuf)
    .rotate()
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: "contain", background: { r: 236, g: 238, b: 241, alpha: 1 } })
    .png()
    .toFile(outPreview);
  return { W, H };
}

function evolgearSkuFromLink(link) {
  const m = String(link || "").match(/evolgear\.com\/product\/([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function gym80CodeFromLink(link) {
  const m = String(link || "").match(/gym80\.(?:de|co\.uk)\/(?:en\/)?product(?:s)?\/([0-9a-z-]+)/i);
  return m ? m[1].replace(/n$/i, "").replace(/-/g, "") : null;
}

function normalizeLink(m) {
  if (PAGE_URL[m.name]) return PAGE_URL[m.name];
  const link = String(m.link || "").trim();
  if (/^https?:\/\//i.test(link)) {
    return link
      .replace("precor.com/ja-JP", "precor.com/en-US")
      .replace("world.matrixfitness.com", "www.matrixfitness.com");
  }
  if (/hammer strength|half half|life fitness/i.test(link + m.name)) {
    return PAGE_URL["HD Athletic NX Half Half Combo Rack"];
  }
  return null;
}

function resolveDirect(m) {
  if (DIRECT_IMAGE[m.name]) return DIRECT_IMAGE[m.name];
  const sku = evolgearSkuFromLink(m.link);
  if (sku) return `https://evolgear.com/img/product/${sku}.webp`;
  // Precor SKU in link
  const pre = String(m.link || "").match(/products\/(GSL|GPL|G[A-Z]{2})\d+/i);
  if (pre) return `https://www.precor.com/www.precor.com/products/${pre[0].split("/").pop()}/og`;
  return null;
}

const api = await fetch(API).then((r) => r.json());
const machines = (api.machines || []).filter((m) => m.source === "new");
console.log("new machines", machines.length, "FORCE", process.env.FORCE === "1");

const report = [];

for (const m of machines) {
  const placePath = path.join(PLACE_DIR, `${m.id}_place.png`);
  const previewPath = path.join(PREVIEW_DIR, `${m.id}_preview.png`);
  const rawPath = path.join(RAW_DIR, `${m.id}.img`);

  if (fs.existsSync(placePath) && fs.existsSync(previewPath) && process.env.FORCE !== "1") {
    report.push({ id: m.id, status: "skip-exists" });
    continue;
  }

  const direct = resolveDirect(m);
  const pageUrl = normalizeLink(m);
  const productCode = gym80CodeFromLink(m.link) || evolgearSkuFromLink(m.link);
  const ctx = { productCode, sku: productCode };

  try {
    console.log("fetch", m.name.slice(0, 48));
    let raw = null;
    let used = null;

    if (direct) {
      try {
        const img = await fetchBuf(direct);
        if (img.status < 400 && img.buf.length > 5000) {
          raw = img.buf;
          used = img.url || direct;
          console.log("  direct", used.slice(0, 90));
        }
      } catch {
        /* fall through */
      }
    }

    if (!raw && pageUrl) {
      if (/^https?:\/\/.+\.(jpe?g|png|webp)(\?|$)/i.test(pageUrl)) {
        const img = await fetchBuf(pageUrl);
        if (img.status < 400) {
          raw = img.buf;
          used = pageUrl;
        }
      } else {
        const page = await fetchBuf(pageUrl);
        if (page.status >= 400) throw new Error("page " + page.status);
        const html = page.buf.toString("utf8");
        const candidates = extractImages(html, page.url || pageUrl, ctx);
        // gym80: 商品番号付き画像を先頭に
        if (productCode) {
          const preferred = candidates.filter((u) => u.toLowerCase().includes(productCode.toLowerCase()));
          candidates.unshift(...preferred);
        }
        const best = await pickBestImage([...new Set(candidates)], ctx);
        if (!best) throw new Error("no image");
        raw = best.buf;
        used = best.url;
        console.log("  img", best.w, "x", best.h, "score", best.urlScore, used.slice(0, 90));
      }
    }

    if (!raw) throw new Error(pageUrl ? "no image" : "no-link");

    fs.writeFileSync(rawPath, raw);
    const size = await makePlace(raw, m.width_cm, m.length_cm, placePath, previewPath);
    report.push({ id: m.id, status: "ok", used, ...size, ratio: +(size.W / size.H).toFixed(3), expect: +((m.width_cm || 1) / (m.length_cm || 1)).toFixed(3) });
  } catch (err) {
    console.log("  FAIL", err.message);
    report.push({ id: m.id, status: "fail", error: err.message });
  }
}

fs.writeFileSync(path.join(ROOT, "floorplan/_new_image_report.json"), JSON.stringify(report, null, 2));
const ok = report.filter((r) => r.status === "ok" || r.status === "skip-exists").length;
console.log("done ok/skip", ok, "fail", report.filter((r) => r.status === "fail").length);
for (const f of report.filter((r) => r.status === "fail")) console.log("  fail:", f.id, f.error);
