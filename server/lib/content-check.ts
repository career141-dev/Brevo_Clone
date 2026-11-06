/**
 * The checks run before any campaign or test send. `problems` block the send (the mail would be broken for everyone);
 * `warnings` go back to the person sending, because each one makes Gmail or Outlook more likely to file it as spam.
 */
export type ContentCheck = { problems: string[]; warnings: string[] };

const GMAIL_CLIP_BYTES = 102 * 1024; // Gmail cuts the mail off here and hides the rest, unsubscribe link included
const MIN_TEXT_CHARS = 200;
// Far past anything sendable. Checked first, because this runs synchronously on the server's one thread.
const MAX_HTML_CHARS = 2_000_000;

// Linear on purpose: /<style[\s\S]*?<\/style>/ and /<[^>]+>/ took quadratic time on HTML that never closes a tag
// (6 Nov 2026 review: 40 KB of "<" took 0.75 s, so a few hundred KB would freeze every request and the sender).
function stripStyleBlocks(html: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let at = 0;
  for (;;) {
    const open = lower.indexOf("<style", at);
    const close = open < 0 ? -1 : lower.indexOf("</style>", open);
    if (close < 0) return out + html.slice(at);
    out += html.slice(at, open) + " ";
    at = close + "</style>".length;
  }
}

export function checkEmailContent(subject: string | null | undefined, html: string | null | undefined): ContentCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const body = html ?? "";
  const subj = (subject ?? "").trim();

  if (body.length > MAX_HTML_CHARS) return { problems: ["The email is far too large to send. Remove pasted images or long copied content."], warnings };
  if (!subj) problems.push("The subject line is empty.");
  const text = stripStyleBlocks(body).replace(/<[^<>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!text && !/<img\b/i.test(body)) problems.push("The email has no content.");

  if (/src=(["'])data:/i.test(body)) problems.push("An image is pasted into the email instead of uploaded. Upload it with the image button.");

  const broken = new Set<string>();
  let insecure = false;
  let tempFileLink = false;
  // Not after "-" or a letter: data-src / data-href (lazy-loading attributes) are not links the reader follows.
  for (const m of body.matchAll(/(?<![\w-])(?:href|src)=(?:"([^"]*)"|'([^']*)')/gi)) {
    const url = (m[1] ?? m[2] ?? "").trim();
    if (!url || url.startsWith("#") || url.startsWith("{{") || /^(mailto|tel|data):/i.test(url)) continue;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url) || !/^https?:\/\//i.test(url)) broken.add(url.slice(0, 80));
    else if (/^http:\/\//i.test(url)) insecure = true;
    if (/\.r2\.dev\//i.test(url)) tempFileLink = true;
  }
  if (broken.size > 0) problems.push(`These links only work inside the app, not in someone's inbox: ${[...broken].slice(0, 3).join(", ")}`);

  // Measured as sent: tracking turns every link into a ~300-character click URL and adds an open pixel.
  // ponytail: estimated overhead per link, not the exact injected length.
  const links = (body.match(/(?<![\w-])href=/gi) ?? []).length;
  if (Buffer.byteLength(body, "utf8") + links * 300 + 400 > GMAIL_CLIP_BYTES) warnings.push("The email is over 102 KB. Gmail will cut it off and hide the rest, including the unsubscribe link.");
  if (/<img\b/i.test(body) && text.length < MIN_TEXT_CHARS) warnings.push("The email is mostly pictures with very little text. Spam filters distrust that; add a few sentences.");
  if (insecure) warnings.push("Some links start with http:// instead of https://.");
  if (tempFileLink) warnings.push("A file link uses Cloudflare's temporary r2.dev address, which Cloudflare has flagged as phishing before.");
  const letters = subj.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) warnings.push("The subject is all capital letters, which spam filters penalise.");
  if ((subj.match(/!/g) ?? []).length >= 2) warnings.push("The subject has several exclamation marks, which spam filters penalise.");

  return { problems, warnings };
}
