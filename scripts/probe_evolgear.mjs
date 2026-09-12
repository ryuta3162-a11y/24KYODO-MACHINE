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
          "Accept-Language": "ja,en;q=0.8",
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
        res.on("end", () =>
          resolve({ status: res.statusCode, buf: Buffer.concat(chunks), url })
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

const pages = [
  "https://evolgear.com/product/evrb-l139.html",
  "https://evolgear.com/product/eva-d104.html",
  "https://evolgear.com/product/evrb-c135.html",
  "https://evolgear.com/product/eva-5000.html",
  "https://evolgear.com/product/evrb-c154.html",
  "https://evolgear.com/",
];

for (const p of pages) {
  const r = await get(p);
  const html = r.buf.toString("utf8");
  console.log("\n===", p, r.status, "len", html.length);
  const ogs = [...html.matchAll(/property=["']og:image["'][^>]*content=["']([^"']+)["']/gi)].map(
    (m) => m[1]
  );
  const ogs2 = [...html.matchAll(/content=["']([^"']+)["'][^>]*property=["']og:image["']/gi)].map(
    (m) => m[1]
  );
  const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const dataSrc = [...html.matchAll(/data-(?:src|lazy-src|original)=["']([^"']+)["']/gi)].map(
    (m) => m[1]
  );
  const all = [...html.matchAll(/https?:\/\/[^"'>\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'>\s]*)?/gi)].map(
    (m) => m[0]
  );
  console.log("og", [...ogs, ...ogs2].slice(0, 5));
  console.log("img sample", imgs.slice(0, 20));
  console.log("data-src", dataSrc.slice(0, 15));
  console.log(
    "product-ish",
    [...new Set(all)].filter((u) => /product|goods|item|upload|evrb|eva-|shop/i.test(u)).slice(0, 20)
  );
  // Look for EC-CUBE / shop style paths
  const paths = [...html.matchAll(/\/(?:html\/)?upload\/[^"'>\s]+/gi)].map((m) => m[0]);
  console.log("upload paths", [...new Set(paths)].slice(0, 20));
}
