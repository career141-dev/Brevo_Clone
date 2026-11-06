/**
 * The checks run before any campaign or test send. `problems` block the send (the mail would be broken for everyone);
 * `warnings` go back to the person sending, because each one makes Gmail or Outlook more likely to file it as spam.
 */
export type ContentCheck = { problems: string[]; warnings: string[] };

const GMAIL_CLIP_BYTES = 102 * 1024; // Gmail cuts the mail off here and hides the rest, unsubscribe link included
const MIN_TEXT_CHARS = 200;

export function checkEmailContent(subject: string | null | undefined, html: string | null | undefined): ContentCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const body = html ?? "";
  const subj = (subject ?? "").trim();

  if (!subj) problems.push("The subject line is empty.");
  const text = body.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!text && !/<img\b/i.test(body)) problems.push("The email has no content.");

  if (/src=(["'])data:/i.test(body)) problems.push("An image is pasted into the email instead of uploaded. Upload it with the image button.");

  const broken = new Set<string>();
  let insecure = false;
  let tempFileLink = false;
  for (const m of body.matchAll(/\b(href|src)=(["'])(.*?)\2/gi)) {
    const url = m[3].trim();
    if (!url || url.startsWith("#") || url.startsWith("{{") || /^(mailto|tel|data):/i.test(url)) continue;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url) || !/^https?:\/\//i.test(url)) broken.add(url.slice(0, 80));
    else if (/^http:\/\//i.test(url)) insecure = true;
    if (/\.r2\.dev\//i.test(url)) tempFileLink = true;
  }
  if (broken.size > 0) problems.push(`These links only work inside the app, not in someone's inbox: ${[...broken].slice(0, 3).join(", ")}`);

  if (Buffer.byteLength(body, "utf8") > GMAIL_CLIP_BYTES) warnings.push("The email is over 102 KB. Gmail will cut it off and hide the rest, including the unsubscribe link.");
  if (/<img\b/i.test(body) && text.length < MIN_TEXT_CHARS) warnings.push("The email is mostly pictures with very little text. Spam filters distrust that; add a few sentences.");
  if (insecure) warnings.push("Some links start with http:// instead of https://.");
  if (tempFileLink) warnings.push("A file link uses Cloudflare's temporary r2.dev address, which Cloudflare has flagged as phishing before.");
  const letters = subj.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) warnings.push("The subject is all capital letters, which spam filters penalise.");
  if ((subj.match(/!/g) ?? []).length >= 2) warnings.push("The subject has several exclamation marks, which spam filters penalise.");

  return { problems, warnings };
}
