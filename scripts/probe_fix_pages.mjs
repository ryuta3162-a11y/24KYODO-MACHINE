import https from "https";
import fs from "fs";

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" }, timeout: 25000 }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          return get(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, buf: Buffer.concat(chunks), ctype: res.headers["content-type"] || "" })
        );
      })
      .on("error", reject);
  });
}

const pages = [
  "https://ecoleco-fitness.com/expert-model/plate-load/elc-series",
  "https://gym80.de/en/product/4337n/",
  "https://gym80.de/en/product/4341/",
  "https://www.roguefitness.com/echo-wall-balls",
  "https://www.roguefitness.com/rogue-farmers-walk-handles",
];

for (const p of pages) {
  try {
    const r = await get(p);
    const html = r.buf.toString("utf8");
    console.log("\n===", p, r.status);
    const imgs = [...html.matchAll(/https?:\/\/[^"'>\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'>\s]*)?/gi)].map(
      (m) => m[0]
    );
    console.log(
      [...new Set(imgs)]
        .filter((u) => !/logo|icon|favicon|sprite|banner|ytimg|facebook/i.test(u))
        .slice(0, 12)
        .join("\n")
    );
  } catch (e) {
    console.log("FAIL", p, e.message);
  }
}
