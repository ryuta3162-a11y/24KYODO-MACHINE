import https from "https";
import http from "http";

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,*/*",
        },
        timeout: 25000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects > 8) return reject(new Error("redir"));
          return get(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), url }));
      }
    );
    req.on("error", reject);
  });
}

const pages = [
  "https://www.precor.com/en-US/products/GSL0622",
  "https://www.precor.com/en-US/products/GPL0612",
  "https://www.precor.com/en-US/products/GPL0551",
  "https://gym80.de/en/product/4340/",
  "https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select",
  "https://www.concept2.com/ergs/skierg",
  "https://www.roguefitness.com/dog-sled",
];

for (const p of pages) {
  try {
    const r = await get(p);
    const html = r.buf.toString("utf8");
    console.log("\n===", p, r.status);
    const ogs = [
      ...html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi),
      ...html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image["']/gi),
    ].map((m) => m[1]);
    console.log("og", ogs.slice(0, 3));
    const imgs = [...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)].map((m) => m[1]);
    const productish = imgs.filter((u) =>
      /product|catalog|media|cdn|shopify|ctfassets|dam|asset|image/i.test(u)
    );
    console.log("imgs", productish.slice(0, 12));
  } catch (e) {
    console.log("FAIL", p, e.message);
  }
}
