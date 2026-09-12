import https from "https";
import fs from "fs";
import sharp from "sharp";

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
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
            url,
          })
        );
      }
    );
    req.on("error", reject);
  });
}

const skus = ["GSL0622", "GPL0612", "GPL0551"];
fs.mkdirSync("floorplan/machines/_probe", { recursive: true });

for (const sku of skus) {
  const url = `https://www.precor.com/www.precor.com/products/${sku}/og`;
  const r = await get(url);
  const out = `floorplan/machines/_probe/precor_${sku}_og.png`;
  fs.writeFileSync(out, r.buf);
  const meta = await sharp(r.buf).metadata();
  console.log(sku, r.status, r.ctype, meta.width, meta.height, r.buf.length);
}

// Parse __NEXT_DATA__ for product images
const html = (await get("https://www.precor.com/en-US/products/GSL0622")).buf.toString("utf8");
const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
if (m) {
  const j = JSON.parse(m[1]);
  const s = JSON.stringify(j);
  fs.writeFileSync("floorplan/machines/_probe/precor_next.json", s.slice(0, 500000));
  const urls = [...s.matchAll(/https:\\\/\\\/[^"\\]+?\.(?:jpg|jpeg|png|webp)/gi)].map((x) =>
    x[0].replace(/\\\//g, "/")
  );
  console.log("next urls", [...new Set(urls)].slice(0, 50));
  // also look for image fields
  const imgFields = [...s.matchAll(/"(?:url|src|image|heroImage|primaryImage|thumbnail)":"([^"]+)"/gi)].map(
    (x) => x[1].replace(/\\\//g, "/")
  );
  console.log("fields", [...new Set(imgFields)].slice(0, 40));
} else {
  console.log("no next data");
}

// gym80 product page
const g = await get("https://gym80.de/en/product/4340/");
console.log("gym80 status", g.status, g.buf.length);
const ghtml = g.buf.toString("utf8");
const gogs = [...ghtml.matchAll(/og:image[^>]+content=["']([^"']+)/gi)].map((x) => x[1]);
const gimgs = [...ghtml.matchAll(/src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi)].map((x) => x[1]);
console.log("gym80 og", gogs.slice(0, 5));
console.log("gym80 img", gimgs.slice(0, 20));
