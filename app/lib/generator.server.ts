/* Product photo → transparent try-on PNG.
   TRYON_GENERATOR=local  (default, FREE): cut the ring out of the product photo's plain background.
   TRYON_GENERATOR=openai : OpenAI redraws the ring from above on white, then the same free cut-out makes it transparent. */
import sharp from "sharp";
import type { AssetView } from "@prisma/client";
import { cutOutRing } from "./cutout.server";
import { NonRetryable } from "./errors";
import { openaiTopView, type TopViewKind } from "./openai.server";
import { withWidth } from "./shared";

export const usesAI = (): boolean => (process.env.TRYON_GENERATOR || "local") === "openai";

/** How images made right now will be drawn: AI → top / front view (ring on the finger, bracelet fitted to the wrist). */
export const currentView = (_kind: TopViewKind = "ring"): AssetView => (usesAI() ? "top" : "photo");

/** kind: ring → seen from above as worn on a finger; bracelet → front half as worn on the wrist. */
export async function generateTryOnImage(sourceUrl: string, kind: TopViewKind = "ring"): Promise<Buffer> {
  const src = await fetch(withWidth(sourceUrl, 1200));
  if (!src.ok) throw new NonRetryable(`Could not download product photo (${src.status})`);
  const photo = Buffer.from(await src.arrayBuffer());
  if (!usesAI()) return cutOutRing(photo);
  const ai = await openaiTopView(photo, kind);
  // Already transparent (model background=transparent)? Keep it as made — cutting "white" would also remove white
  // diamonds. Only trim the empty margins. Otherwise (white backdrop) use the cut-out.
  const { channels, hasAlpha } = await sharp(ai).metadata();
  if (hasAlpha && channels === 4) {
    const { data } = await sharp(ai).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    let clear = 0; for (let i = 0; i < data.length; i += 16) if (data[i] < 10) clear++;
    if (clear > data.length / 16 * 0.15) return sharp(ai).trim({ threshold: 2 }).png().toBuffer();
  }
  return cutOutRing(ai, { strictWhite: kind === "bracelet" });   // rings: unchanged cut-out
}

/** Merchant-uploaded PNG: must already be transparent; just trim the empty margins. */
export async function normaliseUpload(buffer: Buffer): Promise<Buffer> {
  const img = sharp(buffer);
  const meta = await img.metadata();
  if (!meta.hasAlpha) throw new NonRetryable("Upload a PNG with a transparent background");
  return img.trim({ threshold: 2 }).png().toBuffer();
}


/** False only when AI mode is on but no OpenAI key is configured. */
export const canGenerate = (): boolean => !usesAI() || !!process.env.OPENAI_API_KEY;
