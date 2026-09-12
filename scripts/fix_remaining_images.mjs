/**
 * 残り失敗・取り違え分の直接差し替え
 */
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import sharp from "sharp";

const ROOT = process.cwd();
const PLACE = path.join(ROOT, "floorplan/machines/place");
const PREVIEW = path.join(ROOT, "floorplan/machines/preview");
const MAX_SIDE = 900;

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
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
          resolve({ status: res.statusCode, buf: Buffer.concat(chunks), ctype: res.headers["content-type"] || "" })
        );
      }
    );
    req.on("error", reject);
  });
}

async function make(id, widthCm, lengthCm, imgUrl) {
  const r = await get(imgUrl);
  if (r.status >= 400 || r.buf.length < 3000) throw new Error(`${id} ${r.status} ${r.buf.length}`);
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
    .toFile(path.join(PLACE, `${id}_place.png`));
  await sharp(r.buf)
    .rotate()
    .resize(256, 256, { fit: "contain", background: { r: 236, g: 238, b: 241, alpha: 1 } })
    .png()
    .toFile(path.join(PREVIEW, `${id}_preview.png`));
  console.log("ok", id, W, "x", H);
}

const jobs = [
  // gym80 取り違え修正
  {
    id: "new_pure_kraft_lying_leg_curl",
    w: 127,
    l: 163,
    url: "https://gym80.de/wp-content/uploads/2025/07/4337n_pure_kraft_liegende_beincurlmaschine_NC.webp",
  },
  {
    id: "new_pure_kraft_low_row_dual",
    w: 183,
    l: 148,
    url: "https://gym80.de/wp-content/uploads/2025/07/4341_pure_kraft_low_row_dual_NC.webp",
  },
  {
    id: "new_pure_kraft_shoulder_lateral_raise_dual",
    w: 88,
    l: 139,
    url: "https://gym80.de/wp-content/uploads/2025/07/4342_pure_kraft_shoulder_lateral_raise_dual_NC.webp",
  },
  {
    id: "new_pure_kraft_biceps_curl_dual",
    w: 95,
    l: 153,
    url: "https://gym80.de/wp-content/uploads/2025/07/4343_pure_kraft_biceps_curl_dual_NC.webp",
  },
  // Rogue 失敗分
  {
    id: "new_wall_ball",
    w: 36,
    l: 36,
    url: "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Conditioning/Medicine%20Balls/Wallballs/XG2067/XG2067-H_vqlqvq.png",
  },
  {
    id: "new_farmer_s_walk_handles",
    w: 61,
    l: 152,
    url: "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Farmers%20Walk/XX2055/XX2055-H_farmers.png",
  },
  {
    id: "new_rogue_deadlift_jack",
    w: 48,
    l: 107,
    url: "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strength%20Equipment/Strength%20Training/Jacks/XX2049/XX2049-H.png",
  },
  // Matrix C50
  {
    id: "new_c50_climbmill",
    w: 72,
    l: 135,
    url: "https://www.matrixfitness.com/-/media/images/matrix/products/cardio/climbmills/c50/c50-climbmill-hero.png",
  },
  // Panatta
  {
    id: "new_standing_abductor",
    w: 80,
    l: 160,
    url: "https://www.panattasport.com/wp-content/uploads/2021/03/1FW090-Standing-Abductor-Machine.png",
  },
  // Tire - use Rogue tire if available
  {
    id: "new_tire_flip_strongman_tire",
    w: 120,
    l: 120,
    url: "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Tires/XX2070/XX2070-H.png",
  },
  // POWER MAX product shot
  {
    id: "new_power_max_v3_pro",
    w: 59,
    l: 105,
    url: "https://img.konami.com/sportsclub/online/shop/aerobike/power-max-v3/img/product_01.jpg",
  },
];

for (const j of jobs) {
  try {
    await make(j.id, j.w, j.l, j.url);
  } catch (e) {
    console.log("fail", j.id, e.message);
  }
}

// Probe alternate URLs if fails
const alts = {
  new_pure_kraft_lying_leg_curl: [
    "https://gym80.de/wp-content/uploads/2026/03/gym80_4337n_pure_kraft_lying_leg_curl_NC_overview.webp",
    "https://gym80.de/wp-content/uploads/2025/07/4337n_pure_kraft_liegende_beincurl_NC.webp",
  ],
  new_pure_kraft_low_row_dual: [
    "https://gym80.de/en/product/4341/",
    "https://www.gym80.co.uk/cdn/shop/files/pure-kraft-low-row.jpg",
  ],
  new_wall_ball: [
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1200,b_rgb:ffffff/catalog/Conditioning/Medicine%20Balls/Medicine%20Balls/XG2067/XG2067-h.png",
    "https://www.roguefitness.com/media/catalog/product/cache/1/image/1800x/040ec09b1e35df139433887a97daa66f/r/o/rogue-echo-wall-ball.jpg",
  ],
  new_farmer_s_walk_handles: [
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Farmers%20Walk%20Handles/XX2055/XX2055-H.png",
    "https://www.roguefitness.com/media/catalog/product/r/o/rogue-farmers-walk-handles.jpg",
  ],
  new_c50_climbmill: [
    "https://world.matrixfitness.com/-/media/images/matrix/products/cardio/climbmills/c50/matrix-c50-climbmill.png",
    "https://cdn.shopify.com/s/files/1/0558/2045/9380/files/Matrix_C50_ClimbMill.png",
  ],
  new_standing_abductor: [
    "https://www.panattasport.com/wp-content/uploads/fit-evo/1FW090.png",
    "https://www.panattasport.com/en/wp-content/uploads/sites/2/2021/03/1FW090.png",
  ],
  new_tire_flip_strongman_tire: [
    "https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600,b_rgb:ffffff/v1/catalog/Strongman/Echo%20Tire/XX2071/XX2071-H.png",
  ],
  new_power_max_v3_pro: [
    "https://img.konami.com/sportsclub/online/shop/aerobike/power-max-v3/img/main_visual.jpg",
  ],
};

async function fromPageFirstProductImg(pageUrl, prefer) {
  const r = await get(pageUrl);
  if (r.status >= 400) throw new Error("page " + r.status);
  const html = r.buf.toString("utf8");
  const urls = [...html.matchAll(/https?:\/\/[^"'>\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'>\s]*)?/gi)].map(
    (m) => m[0]
  );
  const filtered = [...new Set(urls)].filter(
    (u) => !/logo|icon|sprite|ogp|favicon|banner|map_|hero|youtube|ytimg/i.test(u)
  );
  filtered.sort((a, b) => {
    const sa = prefer && prefer.test(a) ? 10 : 0;
    const sb = prefer && prefer.test(b) ? 10 : 0;
    return sb - sa;
  });
  return filtered[0];
}

// Retry fails by probing gym80 product pages for correct codes
const pageJobs = [
  { id: "new_pure_kraft_lying_leg_curl", w: 127, l: 163, page: "https://gym80.de/en/product/4337n/", prefer: /4337/i },
  { id: "new_pure_kraft_low_row_dual", w: 183, l: 148, page: "https://gym80.de/en/product/4341/", prefer: /4341|low.?row/i },
  {
    id: "new_pure_kraft_shoulder_lateral_raise_dual",
    w: 88,
    l: 139,
    page: "https://gym80.de/en/product/4342/",
    prefer: /4342|lateral/i,
  },
  {
    id: "new_pure_kraft_biceps_curl_dual",
    w: 95,
    l: 153,
    page: "https://gym80.de/en/product/4343/",
    prefer: /4343|biceps/i,
  },
  { id: "new_wall_ball", w: 36, l: 36, page: "https://www.roguefitness.com/echo-wall-balls", prefer: /wall.?ball|XG2067|medicine/i },
  {
    id: "new_farmer_s_walk_handles",
    w: 61,
    l: 152,
    page: "https://www.roguefitness.com/rogue-farmers-walk-handles",
    prefer: /farmer|XX2055|handles/i,
  },
  {
    id: "new_c50_climbmill",
    w: 72,
    l: 135,
    page: "https://www.matrixfitness.com/us/eng/commercial/cardio/climbmills/c50-xur",
    prefer: /climb|c50/i,
  },
  {
    id: "new_standing_abductor",
    w: 80,
    l: 160,
    page: "https://www.panattasport.com/en/fit-evo/standing-abductor-machine/",
    prefer: /abductor|1FW090|standing/i,
  },
];

for (const j of pageJobs) {
  const place = path.join(PLACE, `${j.id}_place.png`);
  // always rewrite these known-bad ones
  try {
    let img = null;
    for (const a of alts[j.id] || []) {
      try {
        const r = await get(a);
        if (r.status < 400 && r.buf.length > 5000 && /image\//i.test(r.ctype)) {
          img = a;
          break;
        }
      } catch {}
    }
    if (!img) img = await fromPageFirstProductImg(j.page, j.prefer);
    if (!img) throw new Error("no img");
    await make(j.id, j.w, j.l, img);
  } catch (e) {
    console.log("pagefail", j.id, e.message);
  }
}

console.log("done");
