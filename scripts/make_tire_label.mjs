import sharp from "sharp";

const W = 900;
const H = 900;
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#eceef1"/>
  <circle cx="450" cy="450" r="320" fill="#1f2937"/>
  <circle cx="450" cy="450" r="240" fill="#374151"/>
  <text x="50%" y="48%" text-anchor="middle" font-family="sans-serif" font-size="42" font-weight="800" fill="#f9fafb">TIRE</text>
  <text x="50%" y="58%" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#d1d5db">Strongman Flip</text>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile("floorplan/machines/place/new_tire_flip_strongman_tire_place.png");
await sharp(Buffer.from(svg)).resize(256, 256).png().toFile("floorplan/machines/preview/new_tire_flip_strongman_tire_preview.png");
console.log("tire ok");
