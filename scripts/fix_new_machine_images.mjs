import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import sharp from "sharp";

const ROOT = path.join(process.cwd());
const PLACE = path.join(ROOT, "floorplan/machines/place");
const PREVIEW = path.join(ROOT, "floorplan/machines/preview");
const MAX_SIDE = 900;

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" },
        timeout: 25000,
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects > 8) return reject(new Error("redir"));
          return get(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            buf: Buffer.concat(chunks),
            ctype: res.headers["content-type"] || "",
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

async function make(id, widthCm, lengthCm, imgUrl) {
  const r = await get(imgUrl);
  if (r.status >= 400) throw new Error(id + " " + r.status);
  const w = widthCm;
  const l = lengthCm;
  let W;
  let H;
  if (w >= l) {
    W = MAX_SIDE;
    H = Math.max(40, Math.round((MAX_SIDE * l) / w));
  } else {
    H = MAX_SIDE;
    W = Math.max(40, Math.round((MAX_SIDE * w) / l));
  }
  const photo = await sharp(r.buf)
    .rotate()
    .resize(Math.round(W * 0.92), Math.round(H * 0.92), { fit: "inside", background: "#fff" })
    .png()
    .toBuffer();
  const meta = await sharp(photo).metadata();
  const place = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 236, g: 238, b: 241 } },
  })
    .composite([
      {
        input: photo,
        left: Math.max(0, Math.round((W - meta.width) / 2)),
        top: Math.max(0, Math.round((H - meta.height) / 2)),
      },
    ])
    .png()
    .toFile(path.join(PLACE, `${id}_place.png`));
  await sharp(r.buf)
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .png()
    .toFile(path.join(PREVIEW, `${id}_preview.png`));
  console.log("ok", id, place);
}

async function fromPage(pageUrl, preferRe) {
  const r = await get(pageUrl);
  const html = r.buf.toString("utf8");
  const urls = [
    ...html.matchAll(/https?:\/\/[^"'\\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\s>]*)?/gi),
  ].map((m) => m[0]);
  const filtered = [...new Set(urls)].filter((u) => !/logo|icon|sprite|ogp|favicon|sns\//i.test(u));
  filtered.sort((a, b) => {
    const sa = preferRe && preferRe.test(a) ? 10 : 0;
    const sb = preferRe && preferRe.test(b) ? 10 : 0;
    return sb - sa;
  });
  console.log("candidates", pageUrl, filtered.slice(0, 5));
  return filtered[0];
}

const jobs = [
  {
    id: "new_アジャスタブルインクラインベンチ_evrb_l139",
    w: 140,
    l: 76,
    page: "https://evolgear.com/product/evrb-l139.html",
    prefer: /l139|EVRB-L139|bench/i,
  },
  {
    id: "new_フラットベンチ_evrb_c135",
    w: 135,
    l: 76,
    page: "https://evolgear.com/product/evrb-c135.html",
    prefer: /c135|EVRB-C135/i,
  },
  {
    id: "new_プレートツリー_evrb_c154",
    w: 61,
    l: 58,
    page: "https://evolgear.com/product/evrb-c154.html",
    prefer: /c154|EVRB-C154/i,
  },
  {
    id: "new_ラバーダンベル_eva_d104_42_5kg_60kg追加",
    w: 213,
    l: 62,
    page: "https://evolgear.com/product/eva-d104.html",
    prefer: /d104|EVA-D104|dumbbell|ダンベル/i,
  },
  {
    id: "new_オリンピックバー_eva_5000",
    w: 5,
    l: 220,
    page: "https://evolgear.com/product/eva-5000.html",
    prefer: /5000|bar|バー/i,
  },
];

for (const j of jobs) {
  try {
    const img = await fromPage(j.page, j.prefer);
    if (!img) throw new Error("no img");
    await make(j.id, j.w, j.l, img);
  } catch (e) {
    console.log("fail", j.id, e.message);
  }
}

// remaining fails: use known public product photos
const direct = [
  {
    id: "new_hd_athletic_nx_half_half_combo_rack",
    w: 150,
    l: 300,
    url: "https://cdn.shopify.com/s/files/1/0278/8325/files/Hammer_Strength_HD_Athletic_NX_Half_Half_Combo_Rack.jpg",
  },
  {
    id: "new_rogue_deadlift_jack",
    w: 48,
    l: 107,
    url: "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/product/images/Rogue-Deadlift-Bar-Jack-1.jpg",
  },
];

for (const d of direct) {
  try {
    await make(d.id, d.w, d.l, d.url);
  } catch (e) {
    console.log("direct fail", d.id, e.message);
    // generate text card fallback
    const W = 600;
    const H = Math.max(80, Math.round((600 * d.l) / d.w));
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#eceef1"/>
      <rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="#111" stroke-width="3"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="#111">${d.id.replace(/^new_/, "").slice(0, 28)}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(PLACE, `${d.id}_place.png`));
    await sharp(Buffer.from(svg))
      .resize(256, 256, { fit: "cover" })
      .png()
      .toFile(path.join(PREVIEW, `${d.id}_preview.png`));
    console.log("fallback svg", d.id);
  }
}

// C50 + Standing Abductor fallbacks
for (const d of [
  { id: "new_c50_climbmill", w: 72, l: 135, label: "Matrix C50" },
  { id: "new_standing_abductor", w: 80, l: 160, label: "Standing Abductor" },
]) {
  if (fs.existsSync(path.join(PLACE, `${d.id}_place.png`))) continue;
  const W = d.w >= d.l ? 900 : Math.round((900 * d.w) / d.l);
  const H = d.w >= d.l ? Math.round((900 * d.l) / d.w) : 900;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dbeafe"/><stop offset="1" stop-color="#eff6ff"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#1e3a8a" stroke-width="4"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="28" font-weight="800" fill="#1e3a8a">${d.label}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(PLACE, `${d.id}_place.png`));
  await sharp(Buffer.from(svg))
    .resize(256, 256, { fit: "cover" })
    .png()
    .toFile(path.join(PREVIEW, `${d.id}_preview.png`));
  console.log("label card", d.id);
}

console.log(
  "place new count",
  fs.readdirSync(PLACE).filter((f) => f.startsWith("new_") && f.endsWith("_place.png")).length
);
