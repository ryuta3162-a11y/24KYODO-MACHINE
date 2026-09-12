import https from "https";
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
  if (r.status >= 400 || r.buf.length < 4000) throw new Error(`${id} ${r.status} ${r.buf.length}`);
  await sharp(r.buf).metadata();
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
  console.log("ok", id);
}

async function scrape(page, prefer) {
  const r = await get(page);
  console.log("page", page, r.status, r.buf.length);
  const html = r.buf.toString("utf8");
  const urls = [...html.matchAll(/https?:\/\/[^"'>\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'>\s]*)?/gi)].map(
    (m) => m[0]
  );
  const filtered = [...new Set(urls)].filter(
    (u) => !/logo|icon|favicon|sprite|banner|ytimg|close3|menu_|placeholder|og\.jpg|thumbnail/i.test(u)
  );
  filtered.sort((a, b) => Number(prefer.test(b)) - Number(prefer.test(a)));
  console.log("cands", filtered.slice(0, 8));
  for (const u of filtered) {
    try {
      const img = await get(u);
      if (img.status < 400 && img.buf.length > 8000 && /image\//i.test(img.ctype)) {
        await sharp(img.buf).metadata();
        return u;
      }
    } catch {}
  }
  throw new Error("none");
}

const targets = [
  {
    id: "new_pure_kraft_low_row_dual",
    w: 183,
    l: 148,
    pages: [
      "https://www.gym80.co.uk/products/pure-kraft-low-row",
      "https://gym80.de/en/product/4348/",
      "https://gym80.de/en/product/4319/",
    ],
    prefer: /low.?row|4348|4319|rudern/i,
  },
  {
    id: "new_pure_kraft_shoulder_lateral_raise_dual",
    w: 88,
    l: 139,
    pages: [
      "https://www.gym80.co.uk/products/pure-kraft-shoulder-lateral-raise-dual",
      "https://gym80.de/en/product/4346/",
    ],
    prefer: /lateral|shoulder|4346/i,
  },
  {
    id: "new_pure_kraft_biceps_curl_dual",
    w: 95,
    l: 153,
    pages: [
      "https://www.gym80.co.uk/products/pure-kraft-biceps-curl-dual",
      "https://gym80.de/en/product/4347/",
    ],
    prefer: /biceps|4347/i,
  },
  {
    id: "new_wall_ball",
    w: 36,
    l: 36,
    pages: ["https://www.roguefitness.com/rogue-medicine-balls", "https://www.roguefitness.com/rogue-echo-slam-balls"],
    prefer: /medicine|wall|slam|ball|XG/i,
  },
  {
    id: "new_tire_flip_strongman_tire",
    w: 120,
    l: 120,
    pages: ["https://www.roguefitness.com/echo-bike-turf-tire-handle-kit", "https://www.roguefitness.com/rogue-echo-flatbed-trailer"],
    prefer: /tire|echo/i,
  },
];

for (const t of targets) {
  let done = false;
  for (const page of t.pages) {
    try {
      const img = await scrape(page, t.prefer);
      await make(t.id, t.w, t.l, img);
      done = true;
      break;
    } catch (e) {
      console.log("skip", t.id, page, e.message);
    }
  }
  if (!done) console.log("FAIL", t.id);
}
