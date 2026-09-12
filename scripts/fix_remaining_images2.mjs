import https from "https";
import fs from "fs";
import path from "path";
import sharp from "sharp";

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            Accept: "*/*",
          },
          timeout: 30000,
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
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
      )
      .on("error", reject);
  });
}

async function make(id, w, l, url) {
  const r = await get(url);
  if (r.status >= 400 || r.buf.length < 4000) throw new Error(`${r.status} ${r.buf.length}`);
  const MAX = 900;
  let W, H;
  if (w >= l) {
    W = MAX;
    H = Math.max(40, Math.round((MAX * l) / w));
  } else {
    H = MAX;
    W = Math.max(40, Math.round((MAX * w) / l));
  }
  const photo = await sharp(r.buf)
    .rotate()
    .resize(Math.round(W * 0.92), Math.round(H * 0.92), { fit: "inside", background: "#fff" })
    .png()
    .toBuffer();
  const meta = await sharp(photo).metadata();
  await sharp({
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
    .toFile(path.join("floorplan/machines/place", `${id}_place.png`));
  await sharp(r.buf)
    .rotate()
    .resize(256, 256, { fit: "contain", background: { r: 236, g: 238, b: 241, alpha: 1 } })
    .png()
    .toFile(path.join("floorplan/machines/preview", `${id}_preview.png`));
  console.log("ok", id, url.slice(0, 100));
}

async function firstImgFromPage(page, preferRe) {
  const r = await get(page);
  if (r.status >= 400) throw new Error("page " + r.status);
  const html = r.buf.toString("utf8");
  const urls = [...html.matchAll(/https?:\/\/[^"'>\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'>\s]*)?/gi)].map(
    (m) => m[0]
  );
  const filtered = [...new Set(urls)].filter(
    (u) => !/logo|icon|favicon|sprite|banner|ytimg|close3|menu_|placeholder|og\.jpg/i.test(u)
  );
  filtered.sort((a, b) => Number(preferRe?.test(b) || 0) - Number(preferRe?.test(a) || 0));
  for (const u of filtered.slice(0, 15)) {
    try {
      const img = await get(u);
      if (img.status < 400 && img.buf.length > 8000 && /image\//i.test(img.ctype)) {
        await sharp(img.buf).metadata();
        return u;
      }
    } catch {}
  }
  throw new Error("no usable img on " + page);
}

// Discover gym80 product codes
for (const q of ["lying+leg+curl", "low+row", "shoulder+lateral+raise", "biceps+curl+dual"]) {
  const r = await get("https://gym80.de/?s=" + q);
  const html = r.buf.toString("utf8");
  const links = [...html.matchAll(/href="(https?:\/\/gym80\.de\/en\/product\/[^"]+)"/gi)].map((m) => m[1]);
  console.log(q, [...new Set(links)].slice(0, 6));
}

const jobs = [
  {
    id: "new_pure_kraft_lying_leg_curl",
    w: 127,
    l: 163,
    url: "https://gym80.de/wp-content/uploads/2026/03/1773224307644-u0trzpjps5p.webp",
  },
  {
    id: "new_farmer_s_walk_handles",
    w: 61,
    l: 152,
    url: "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Logs%20Axles%20and%20Handles/Farmers%20Walk/XX1117/XX1117-H_uwgedm.png",
  },
  {
    id: "new_elc_シーテッドロウ",
    w: 157,
    l: 208,
    url: "https://ecoleco-fitness.com/cache/medium/product/8342/MfT3Mw0MRHMHoLdiU6rorJtLrZ7JByL5iZCj3Dq9.jpg",
  },
  {
    id: "new_elc_ラテラルレイズ",
    w: 157,
    l: 116,
    url: "https://ecoleco-fitness.com/cache/medium/product/8355/9B75lk8Dy3XAnX5N4vbJ2IQAC0DsN4ZPvJow5Uj5.jpg",
  },
];

for (const j of jobs) {
  try {
    await make(j.id, j.w, j.l, j.url);
  } catch (e) {
    console.log("fail", j.id, e.message);
  }
}

// Wall ball / medicine ball / tire / C50 / standing abductor via pages
const pageJobs = [
  { id: "new_wall_ball", w: 36, l: 36, page: "https://www.roguefitness.com/medicine-balls", prefer: /wall|medicine|XG|ball/i },
  { id: "new_rogue_deadlift_jack", w: 48, l: 107, page: "https://www.roguefitness.com/bar-jack", prefer: /jack|XX2049|bar.?jack/i },
  {
    id: "new_tire_flip_strongman_tire",
    w: 120,
    l: 120,
    page: "https://www.roguefitness.com/echo-flatbed-trailer-tire",
    prefer: /tire|echo/i,
  },
  {
    id: "new_power_max_v3_pro",
    w: 59,
    l: 105,
    page: "https://www.konami.com/sportsclub/online/shop/aerobike/power-max-v3/",
    prefer: /product|power.?max|aerobike/i,
  },
];

for (const j of pageJobs) {
  try {
    const img = await firstImgFromPage(j.page, j.prefer);
    await make(j.id, j.w, j.l, img);
  } catch (e) {
    console.log("pagefail", j.id, e.message);
  }
}

// Generate label cards for stubborn 403/404
async function labelCard(id, w, l, label) {
  const MAX = 900;
  let W, H;
  if (w >= l) {
    W = MAX;
    H = Math.max(40, Math.round((MAX * l) / w));
  } else {
    H = MAX;
    W = Math.max(40, Math.round((MAX * w) / l));
  }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#eceef1"/>
    <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#1e3a8a" stroke-width="4"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="28" font-weight="800" fill="#1e3a8a">${label}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join("floorplan/machines/place", `${id}_place.png`));
  await sharp(Buffer.from(svg))
    .resize(256, 256, { fit: "cover" })
    .png()
    .toFile(path.join("floorplan/machines/preview", `${id}_preview.png`));
  console.log("label", id);
}

// Check if standing abductor / c50 still need cards
for (const d of [
  { id: "new_standing_abductor", w: 80, l: 160, label: "Standing Abductor", tryUrl: "https://www.panattasport.com/wp-content/uploads/2020/11/1FW090.jpg" },
  { id: "new_c50_climbmill", w: 72, l: 135, label: "Matrix C50", tryUrl: "https://www.matrixfitness.com/getmedia/c50-climbmill.png" },
]) {
  let ok = false;
  if (d.tryUrl) {
    try {
      await make(d.id, d.w, d.l, d.tryUrl);
      ok = true;
    } catch (e) {
      console.log("tryfail", d.id, e.message);
    }
  }
  if (!ok) await labelCard(d.id, d.w, d.l, d.label);
}

console.log("done2");
