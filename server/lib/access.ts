/**
 * Who may use the app: anyone signed in whose email at a company domain is verified (career141.com by default,
 * ALLOWED_EMAIL_DOMAINS=a.com,b.com to change). ALLOWED_USER_IDS still lets in named exceptions.
 * This replaces a hard-coded list of user ids, which turned away every new colleague (6 Nov 2026: a signed-in
 * sanjeev@career141.com saw an empty app because every call answered 401).
 */
export type EmailRecord = { emailAddress: string; verification?: { status?: string | null } | null };

const clean = (v?: string) => (v ?? "").replace(/["']/g, "").trim();
export const ALLOWED_EMAIL_DOMAINS = (clean(process.env.ALLOWED_EMAIL_DOMAINS) || "career141.com")
  .split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);

/** True when one of the addresses is verified and at an allowed domain. An unverified address proves nothing. */
export function hasCompanyEmail(emails: EmailRecord[], domains = ALLOWED_EMAIL_DOMAINS): boolean {
  return emails.some((e) => {
    if (e.verification?.status !== "verified") return false;
    const domain = e.emailAddress.toLowerCase().split("@").pop() ?? "";
    return domains.includes(domain);
  });
}

// One Clerk lookup per person every few minutes, not one per API call.
// ponytail: in-memory per container, so a removed colleague keeps access until the entry expires (10 min).
const cache = new Map<string, { allowed: boolean; until: number }>();
const ALLOW_TTL_MS = 10 * 60_000;
const DENY_TTL_MS = 60_000; // short, so someone who has just verified their email gets in quickly

export async function isAllowedUser(
  userId: string,
  explicitIds: string[],
  loadEmails: (userId: string) => Promise<EmailRecord[]>,
): Promise<boolean> {
  if (explicitIds.includes(userId)) return true;
  const hit = cache.get(userId);
  if (hit && hit.until > Date.now()) return hit.allowed;
  const allowed = hasCompanyEmail(await loadEmails(userId));
  cache.set(userId, { allowed, until: Date.now() + (allowed ? ALLOW_TTL_MS : DENY_TTL_MS) });
  return allowed;
}
