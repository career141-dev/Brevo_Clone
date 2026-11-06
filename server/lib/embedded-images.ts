import { createHash } from "node:crypto";
import { isR2Configured, uploadToR2 } from "./r2.js";

const DATA_IMG = /src=(["'])data:(image\/(png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)\1/gi;

type Upload = (buffer: Buffer, fileName: string, contentType: string, exactKey?: string) => Promise<{ url: string }>;

// A real email with a few pasted photos is a few MB; past this it is not a template, and the regex below would crawl.
const MAX_HTML_CHARS = 15_000_000;

/**
 * Gmail hides inline base64 images, and they push a mail past Gmail's 102 KB clip, which reads as spam.
 * Older templates still carry them, so every one is uploaded once and replaced by its hosted link.
 * The same picture twice is uploaded once.
 */
export async function hostEmbeddedImages(html: string, upload: Upload | null = isR2Configured ? uploadToR2 : null): Promise<string> {
  if (!upload || !html || !html.includes("data:image/")) return html;
  if (html.length > MAX_HTML_CHARS) throw new Error("The email is too large to prepare (over 15 MB).");
  const urls = new Map<string, string>();
  for (const m of html.matchAll(DATA_IMG)) {
    const data = m[4].replace(/\s/g, "");
    if (urls.has(data)) continue;
    const ext = m[3].toLowerCase() === "jpeg" ? "jpg" : m[3].toLowerCase();
    // Keyed by content: every test send and re-schedule of the same picture overwrites one object (6 Nov 2026 review:
    // a time-stamped key added a new copy each time, so repeated test sends could fill the public bucket).
    const name = `img-${createHash("sha256").update(data).digest("hex").slice(0, 32)}.${ext}`;
    const { url } = await upload(Buffer.from(data, "base64"), name, m[2].toLowerCase(), `inline/${name}`);
    urls.set(data, url);
  }
  return html.replace(DATA_IMG, (_all, q: string, _mime, _ext, data: string) => `src=${q}${urls.get(data.replace(/\s/g, ""))}${q}`);
}
