const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// String columns are varchar(191): one longer value would fail the whole insert.
const MAX_LEN = 191;

/** Clean + de-dupe by lowercase email; bad rows are skipped, not fatal. */
export function cleanCandidates(contacts: any[]) {
  const byEmail = new Map<string, { email: string; fullName: string | null; firstName: string | null; lastName: string | null }>();
  for (const c of contacts) {
    const email = typeof c?.email === "string" ? c.email.trim().toLowerCase() : "";
    if (email.length > MAX_LEN || !EMAIL_RE.test(email) || byEmail.has(email)) continue;
    const fullName = typeof c.name === "string" ? c.name.trim().replace(/\s+/g, " ").slice(0, MAX_LEN).trim() : "";
    const [first, ...rest] = fullName.split(" ");
    byEmail.set(email, {
      email,
      fullName: fullName || null,
      firstName: first || null,
      lastName: rest.join(" ") || null,
    });
  }
  return [...byEmail.values()];
}
