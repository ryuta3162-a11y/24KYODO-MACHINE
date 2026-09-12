import https from "https";
import http from "http";
import { URL } from "url";
import fs from "fs";

function fetch(u, redirects = 0) {
  return new Promise((res, rej) => {
    const lib = u.startsWith("https") ? https : http;
    const req = lib.get(
      u,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          "Accept-Language": "en,ja;q=0.8",
        },
        timeout: 25000,
      },
      (r) => {
        if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
          if (redirects > 8) return rej(new Error("too many redirects"));
          let n = r.headers.location;
          if (n.startsWith("/")) n = new URL(u).origin + n;
          return fetch(n, redirects + 1).then(res, rej);
        }
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res({ status: r.statusCode, body: d, url: u }));
      }
    );
    req.on("error", rej);
    req.on("timeout", () => {
      req.destroy();
      rej(new Error("timeout"));
    });
  });
}

function plain(body) {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&times;/gi, "x")
    .replace(/\s+/g, " ");
}

function extract(body) {
  const text = plain(body);
  let m = text.match(
    /Dimensions?\s*\[H\s*x\s*W\s*x\s*L\]\s*:\s*([\d.,]+)\s*x\s*([\d.,]+)\s*x\s*([\d.,]+)\s*mm/i
  );
  if (m) {
    return {
      fmt: "HxWxL_mm",
      H: +m[1].replace(",", "."),
      W: +m[2].replace(",", "."),
      L: +m[3].replace(",", "."),
    };
  }
  m = text.match(
    /Dimensions?\s*\(L\s*[x×]\s*W\s*[x×]\s*H\)\s*[:：]?\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*(cm|mm)/i
  );
  if (m) {
    const u = m[4].toLowerCase();
    const f = u === "cm" ? 10 : 1;
    return {
      fmt: "LxWxH_" + u,
      L: +m[1].replace(",", ".") * f,
      W: +m[2].replace(",", ".") * f,
      H: +m[3].replace(",", ".") * f,
    };
  }
  // Japanese: 幅×奥行×高さ
  m = text.match(
    /幅[^0-9]{0,12}([\d.,]+)\s*(?:mm|㎜)?[^0-9]{0,8}奥行[^0-9]{0,12}([\d.,]+)\s*(?:mm|㎜)?[^0-9]{0,8}高(?:さ)?[^0-9]{0,12}([\d.,]+)\s*(?:mm|㎜)?/i
  );
  if (m) {
    return {
      fmt: "JP_WDL",
      W: +m[1].replace(",", "."),
      L: +m[2].replace(",", "."),
      H: +m[3].replace(",", "."),
    };
  }
  const triples = [];
  const re = /(\d{3,4})\s*[x×]\s*(\d{3,4})\s*[x×]\s*(\d{3,4})\s*(mm|cm)?/gi;
  let x;
  while ((x = re.exec(text))) {
    triples.push({
      a: +x[1],
      b: +x[2],
      c: +x[3],
      unit: (x[4] || "").toLowerCase(),
      snip: text.slice(Math.max(0, x.index - 40), x.index + x[0].length + 40),
    });
  }
  return { triples: triples.slice(0, 8), textLen: text.length };
}

const urls = [
  ["hack", "https://gym80.de/en/product/4159n/"],
  ["highrow", "https://gym80.de/en/product/4340/"],
  ["lowrow_uk", "https://www.gym80.co.uk/products/pure-kraft-low-row"],
  ["lowrow_de", "https://gym80.de/en/product/4319/"],
  ["bent", "https://gym80.de/en/product/4318/"],
  ["seated3040", "https://gym80.de/en/product/3040/"],
  ["latraise_uk", "https://www.gym80.co.uk/products/pure-kraft-shoulder-lateral-raise-dual"],
  ["latraise_de", "https://gym80.de/en/product/4325/"],
  ["lyingcurl", "https://gym80.de/en/product/4337n/"],
  ["legext", "https://gym80.de/en/product/4336n/"],
  ["calf", "https://gym80.de/en/product/4345/"],
  ["belt", "https://gym80.de/en/product/4360/"],
  ["pendulum", "https://gym80.de/en/product/4353n/"],
  ["biceps_uk", "https://www.gym80.co.uk/products/pure-kraft-biceps-curl-dual"],
  ["biceps_de", "https://gym80.de/en/product/4355/"],
  ["triceps", "https://gym80.de/en/product/4356/"],
  ["triceps4339", "https://gym80.de/en/product/4339n/"],
  ["tbar", "https://www.myarsenalstrength.com/strength-equipment/reloaded/upper-body-reloaded/reloaded-t-bar-row"],
  ["isp", "https://www.lifefitness.com/en-us/catalog/strength-training/racks-rigs-platforms/impact-suppression-platform"],
  ["l139", "https://evolgear.com/product/evrb-l139.html"],
  ["d104", "https://evolgear.com/product/eva-d104.html"],
  ["c135", "https://evolgear.com/product/evrb-c135.html"],
  ["c154", "https://evolgear.com/product/evrb-c154.html"],
  ["eva5000", "https://evolgear.com/product/eva-5000.html"],
  ["skierg", "https://www.concept2.com/ergs/skierg"],
  ["rowerg", "https://www.concept2.com/ergs/rowerg"],
  ["bikeerg", "https://www.concept2.com/ergs/bikeerg"],
  ["powermill", "https://www.lifefitness.com/en-us/catalog/cardio/stair-climbers-stepper-machines/powermill-climber"],
  ["curve", "https://www.woodway.com/treadmills/curve/"],
  ["elc", "https://ecoleco-fitness.com/expert-model/plate-load/elc-series"],
  ["matrix-s601", "https://jp.matrixfitness.com/jpn/strength/single-station/vs-s601-chin-dip-assist"],
  ["powermax", "https://www.konami.com/sportsclub/online/shop/aerobike/power-max-v3/"],
  ["c50", "https://world.matrixfitness.com/eng/home/climbmills/c50"],
  ["panatta-abd", "https://www.panattasport.com/it/fit-evo/standing-abductor-machine/"],
  ["precor-glute", "https://www.precor.com/en-us/strength/glutebuilder"],
  ["hs-abc", "https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select-abdominal-crunch"],
  ["hs-adc", "https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select-assist-dip-chin"],
  ["hs-le", "https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select-leg-extension"],
  ["hs-lc", "https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select-seated-leg-curl"],
  ["dog-sled", "https://www.roguefitness.com/dog-sled"],
  ["farmers", "https://www.roguefitness.com/strongman/logs-axles-handles"],
  ["log", "https://www.roguefitness.com/log-bar"],
  ["yoke", "https://www.roguefitness.com/rogue-yoke"],
  ["deadlift-jack", "https://www.roguefitness.com/rogue-deadlift-jack"],
];

const out = [];
for (const [name, u] of urls) {
  try {
    const r = await fetch(u);
    const ex = extract(r.body);
    out.push({ name, status: r.status, url: u, ...ex });
    console.log("OK", name, r.status, JSON.stringify(ex).slice(0, 180));
  } catch (e) {
    out.push({ name, url: u, error: e.message });
    console.log("ERR", name, e.message);
  }
}

fs.writeFileSync(
  "floorplan/_dim_verify_raw.json",
  JSON.stringify(out, null, 2),
  "utf8"
);
console.log("wrote floorplan/_dim_verify_raw.json", out.length);
