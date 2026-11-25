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
  return cutOutRing(usesAI() ? await openaiTopView(photo, kind) : photo);
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
