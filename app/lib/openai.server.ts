/* OpenAI Images API (edits): redraw the product as it looks WORN, seen from above, on a white background —
   a ring on a finger, or a bracelet on the wrist. Server-only — the key never reaches the browser. */
import sharp from "sharp";
import { NonRetryable } from "./errors";

const RING_PROMPT = `Redraw EXACTLY this ring for a virtual try-on app.
Keep the same metal colour, stone shape, stone count, stone colour, prongs and setting details. Do not redesign it.
View: from directly above, as the ring looks when worn on a finger and seen from the back of the hand —
the band runs horizontally from the left edge to the right edge, the centre stone faces the camera in the middle.
Only the ring. No hand, no finger, no box, no text, no reflection, no shadow.
Plain pure white background (#FFFFFF). The ring is centred and fills about 90% of the image width. Photorealistic jewellery lighting.`;

// Bracelets are often photographed lying flat in a circle or coiled; the viewer needs the FRONT half as worn,
// running left → right across the wrist, seen from the front at eye level (the viewer draws it flat, as made).
const BRACELET_PROMPT = `Redraw EXACTLY this bracelet / bangle / kada for a virtual try-on app.
Keep the same metal colour, texture, pattern, chain or link style, stones, charms, centre motif and every detail. Do not redesign it, do not add or remove elements.
View: as the bracelet looks when WORN on a wrist, photographed from the FRONT with the camera EXACTLY LEVEL with the bracelet (eye level, 0° tilt, no view from above or below).
Only the OUTER FRONT FACE of the FRONT HALF is visible: a band running horizontally from the left edge to the right edge of the image, its two ends curving away from the camera at the sides.
The top edge and the bottom edge of the band are straight, parallel horizontal lines (very slightly curved at most).
The inside of the bracelet, the top rim, the opening, the back half and the inner surface must NOT be visible at all — no ellipse, no oval, no hole, no inner wall.
The main decorative element (centre motif, charm, stone or station) faces the camera in the middle. The clasp is hidden at the back, not visible.
A chain bracelet lies smoothly along the band, not coiled, not twisted, not hanging. A rigid bangle or kada keeps its real thickness and profile.
Only the bracelet. No wrist, no hand, no arm, no stand, no box, no text, no reflection, no shadow.
Plain pure white background (#FFFFFF). The bracelet is centred vertically and spans about 95% of the image width. Soft, even, natural light from the front-left (like daylight on skin), no harsh studio highlights.`;

export type TopViewKind = "ring" | "bracelet";

interface ImagesResponse {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

export async function openaiTopView(photo: Buffer, kind: TopViewKind = "ring"): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new NonRetryable("OPENAI_API_KEY is not set on the server");

  const input = await sharp(photo)
    .resize(1024, 1024, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
  form.append("image", new Blob([new Uint8Array(input)], { type: "image/png" }), `${kind}.png`);
  form.append("prompt", kind === "bracelet" ? BRACELET_PROMPT : RING_PROMPT);
  form.append("size", "1024x1024");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const body = (await res.json().catch(() => ({}))) as ImagesResponse;
  if (!res.ok) {
    const msg = "OpenAI: " + (body.error?.message || res.statusText);
    // 4xx = request / account problem → retrying would just cost money (429 = rate limit, worth retrying)
    throw res.status >= 400 && res.status < 500 && res.status !== 429 ? new NonRetryable(msg) : new Error(msg);
  }
  const d = body.data?.[0];
  if (d?.b64_json) return Buffer.from(d.b64_json, "base64");
  if (d?.url) return Buffer.from(await (await fetch(d.url)).arrayBuffer());
  throw new Error("OpenAI returned no image");
}
