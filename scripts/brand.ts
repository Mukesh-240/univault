/**
 * BRAND IMAGES — makes every logo file the app uses from the owner's own artwork. Nothing is redrawn or recoloured.
 *   Run:  npx tsx scripts/brand.ts
 *   In:   public/brand/source/univault-logo.jpeg   (the original; never changed)
 *   Out:  public/brand/logo-{512,192,64,32}.png, src/app/icon.png, src/app/apple-icon.png, public/brand/og.png
 *
 * How the white background is removed (plain English):
 *   1. Start at the picture's edges and "flood" inwards through near-white pixels. Only white that touches the edge
 *      is background; the white papers and the white padlock are surrounded by blue or a grey outline, so they stay.
 *   2. The pixels on the border of that flooded area are part-white (smoothed edges). Each one gets a partial
 *      transparency, and the white mixed into its colour is taken back out, so there is no white halo on dark headers.
 *   3. Crop to the artwork with a small margin, then shrink to each size.
 */
import sharp from "sharp";

const SRC = "public/brand/source/univault-logo.jpeg";
const WHITE = 242; // a pixel with every channel at or above this counts as background white
const MARGIN = 0.04; // margin kept around the artwork after cropping, as a share of its size

async function cutOut() {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const rgba = Buffer.alloc(n * 4);
  const bg = new Uint8Array(n); // 1 = background
  const isWhite = (i: number) => data[i * 3] >= WHITE && data[i * 3 + 1] >= WHITE && data[i * 3 + 2] >= WHITE;

  // 1. Flood from the edges through near-white pixels.
  const stack = new Int32Array(n);
  let top = 0;
  const push = (i: number) => { if (!bg[i] && isWhite(i)) { bg[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (top) {
    const i = stack[--top]; const x = i % w;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < n - w) push(i + w);
  }

  // 2. Opaque artwork, clear background, and a soft edge on artwork pixels that touch the background.
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if (bg[i]) { rgba.writeUInt32BE(0, i * 4); continue; }
    const x = i % w, y = (i / w) | 0;
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
    let a = 1;
    if (edge) a = Math.max(0.05, Math.min(1, (255 - Math.min(r, g, b)) / (255 - 30))); // 30 = darkest channel of the logo blue
    const un = (c: number) => Math.max(0, Math.min(255, Math.round((c - (1 - a) * 255) / a)));
    rgba[i * 4] = edge ? un(r) : r; rgba[i * 4 + 1] = edge ? un(g) : g; rgba[i * 4 + 2] = edge ? un(b) : b;
    rgba[i * 4 + 3] = Math.round(a * 255);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  // 3. Crop to a square around the artwork with a small margin.
  const side = Math.round(Math.max(maxX - minX, maxY - minY) * (1 + 2 * MARGIN));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const left = Math.max(0, Math.round(cx - side / 2)), topY = Math.max(0, Math.round(cy - side / 2));
  const full = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const s = Math.min(side, w - left, h - topY);
  return sharp(full).extract({ left, top: topY, width: s, height: s });
}

async function main() {
  const art = await (await cutOut()).png().toBuffer();
  const size = (px: number, out: string) => sharp(art).resize(px, px, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(out);
  for (const px of [512, 192, 64, 32]) await size(px, `public/brand/logo-${px}.png`);
  await size(64, "src/app/icon.png");
  // The Apple icon has no transparency on iPhones, so it sits on white.
  await sharp(art).resize(150, 150).extend({ top: 15, bottom: 15, left: 15, right: 15, background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toFile("src/app/apple-icon.png");

  // Social card: logo + wordmark + the promise, on the light brand background.
  const logo = await sharp(art).resize(300, 300).png().toBuffer();
  const text = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#F4F7FC"/>
    <text x="440" y="290" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="88" font-weight="700" letter-spacing="3.5" fill="#0B3A8C">UNIVAULT</text>
    <text x="440" y="370" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="34" fill="#1F2A44">Don't ask for the document.</text>
    <text x="440" y="418" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="34" fill="#1F2A44">Ask for the answer.</text>
  </svg>`);
  await sharp(text).composite([{ input: logo, left: 100, top: 165 }]).png().toFile("public/brand/og.png");
  console.log("brand images written");
}

main().catch((e) => { console.error(e); process.exit(1); });
