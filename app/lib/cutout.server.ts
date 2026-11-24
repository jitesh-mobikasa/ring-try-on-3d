/* Free background removal for product photos on a plain light (white / light grey) background.
   Flood-fills from the image border, so only background CONNECTED to the edges is removed —
   white diamonds inside the ring stay, because the metal surrounds them. No AI, no API cost. */
import sharp from "sharp";
import { NonRetryable } from "./errors";

export async function cutOutRing(input: Buffer, { tolerance = 28 }: { tolerance?: number } = {}): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;

  // Background colour = median of the border pixels (works for white, cream and light grey studios)
  const border: number[] = [];
  for (let x = 0; x < W; x += 2) border.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y += 2) border.push(y * W, y * W + W - 1);
  const med = (c: number) => border.map((i) => data[i * 4 + c]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [med(0), med(1), med(2)];
  if (Math.min(...bg) < 170) throw new NonRetryable("Photo background is not plain/light — upload your own PNG or use AI mode");

  const dist = (i: number) => Math.max(Math.abs(data[i * 4] - bg[0]), Math.abs(data[i * 4 + 1] - bg[1]), Math.abs(data[i * 4 + 2] - bg[2]));
  const isBg = new Uint8Array(N), stack: number[] = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (isBg[i] || dist(i) > tolerance) continue;
    isBg[i] = 1;
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < N - W) stack.push(i + W);
  }

  // Background seen THROUGH the ring (inside the band) isn't connected to the border. Remove enclosed
  // background-coloured areas that are large; diamond facets are broken up by dark lines into small pieces.
  const minHole = Math.max(400, N * 0.004), comp: number[] = [];
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (isBg[s] || seen[s] || dist(s) > tolerance) continue;
    comp.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!; comp.push(i);
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j] || isBg[j] || dist(j) > tolerance) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    if (comp.length < minHole) continue;
    // A hole inside the band is bordered by metal (coloured); a bright diamond facet by grey facets.
    let edge = 0, metal = 0;
    for (const i of comp) {
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j] || isBg[j]) continue;
        edge++;
        const r = data[j * 4], g = data[j * 4 + 1], b = data[j * 4 + 2], mx = Math.max(r, g, b);
        if (mx && (mx - Math.min(r, g, b)) / mx > 0.12) metal++;
      }
    }
    if (edge && metal / edge > 0.45) for (const i of comp) isBg[i] = 1;
  }

  // Alpha: background = 0; pixels next to the background fade by how close they are to its colour (soft edge)
  let kept = 0;
  for (let i = 0; i < N; i++) {
    if (isBg[i]) { data[i * 4 + 3] = 0; continue; }
    kept++;
    const x = i % W;
    const edge = (x > 0 && isBg[i - 1]) || (x < W - 1 && isBg[i + 1]) || (i >= W && isBg[i - W]) || (i < N - W && isBg[i + W]);
    if (edge) data[i * 4 + 3] = Math.min(255, Math.round((dist(i) / (tolerance * 2.5)) * 255));
  }
  if (kept < N * 0.02) throw new NonRetryable("Could not find the ring in the photo");

  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 2 }).png().toBuffer();
}
