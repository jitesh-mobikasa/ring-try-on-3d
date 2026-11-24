/* OpenAI Images API (edits): redraw the product's ring seen from above, on a white background.
   Server-only — the key never reaches the browser. */
import sharp from "sharp";
import { NonRetryable } from "./errors";

const PROMPT = `Redraw EXACTLY this ring for a virtual try-on app.
Keep the same metal colour, stone shape, stone count, stone colour, prongs and setting details. Do not redesign it.
View: from directly above, as the ring looks when worn on a finger and seen from the back of the hand —
the band runs horizontally from the left edge to the right edge, the centre stone faces the camera in the middle.
Only the ring. No hand, no finger, no box, no text, no reflection, no shadow.
Plain pure white background (#FFFFFF). The ring is centred and fills about 90% of the image width. Photorealistic jewellery lighting.`;

interface ImagesResponse {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

export async function openaiTopView(photo: Buffer): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new NonRetryable("OPENAI_API_KEY is not set on the server");

  const input = await sharp(photo)
    .resize(1024, 1024, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
  form.append("image", new Blob([new Uint8Array(input)], { type: "image/png" }), "ring.png");
  form.append("prompt", PROMPT);
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
