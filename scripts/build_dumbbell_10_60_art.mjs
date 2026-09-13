/** 10〜60kgダンベルラック3台を横一列にした図面用素材。 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const placeDir = path.join(ROOT, "floorplan/machines/place");
const previewDir = path.join(ROOT, "floorplan/machines/preview");
fs.mkdirSync(placeDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

const W = 900;
const H = 88; // 720:70 の実寸比
const weights = Array.from({ length: 21 }, (_, i) => 10 + i * 2.5);
const rackW = W / 3;
const circles = weights.map((kg, i) => {
  const x = 22 + i * ((W - 44) / (weights.length - 1));
  const label = i % 4 === 0 || i === weights.length - 1
    ? `<text x="${x}" y="79" text-anchor="middle" font-size="8" font-weight="700" fill="#111827">${kg}</text>`
    : "";
  return `<circle cx="${x}" cy="39" r="11" fill="#20252b" stroke="#050607" stroke-width="2"/><rect x="${x - 3}" y="25" width="6" height="28" rx="3" fill="#535b65"/>${label}`;
}).join("");
const separators = [1, 2].map(i => `<line x1="${i * rackW}" y1="17" x2="${i * rackW}" y2="62" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 4"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#eef1f4"/>
  <rect x="5" y="8" width="890" height="58" rx="7" fill="#d7dce2" stroke="#111827" stroke-width="3"/>
  <rect x="13" y="55" width="874" height="7" rx="3" fill="#111827"/>
  ${separators}${circles}
  <rect x="359" y="7" width="182" height="13" rx="6" fill="#eef1f4"/>
  <text x="450" y="17" text-anchor="middle" font-size="10" font-weight="800" fill="#111827">DUMBBELL 10–60kg / 21 PAIRS</text>
</svg>`;

const place = path.join(placeDir, "dumbbell_area_10_60_place.png");
const preview = path.join(previewDir, "dumbbell_area_10_60_preview.png");
const source = path.join(ROOT, "dumbbell_area_10_60.png");
await sharp(Buffer.from(svg)).png().toFile(place);
await sharp(Buffer.from(svg)).resize(256, 256, { fit: "contain", background: { r: 238, g: 241, b: 244, alpha: 1 } }).png().toFile(preview);
fs.copyFileSync(place, source);
console.log(`dumbbell_area_10_60: ${W}x${H} = 720x70cm`);
