/**
 * Find in CAREER141 (9 Nov 2026): the pure half. CAREER141 (the TA System) does all the searching
 * (ta-system docs/CONTACT-DISCOVERY-API.md); Brevo only asks, shows and saves. This file holds what Brevo
 * decides on its own: which ids it will forward, and how a CAREER141 row becomes a Brevo contact.
 */
import { cleanCandidates } from "./candidates.js";

/** The only ids forwarded to CAREER141, so nothing else can be smuggled into its path. */
export const SEARCH_ID = /^[A-Za-z0-9_-]{10,64}$/;

export type Career141Row = {
  email?: string;
  name?: string;
  phone?: string;
  title?: string;
  level?: string;
  employer?: string;
  location?: string;
  linkedinUrl?: string;
  kind?: "current" | "previous" | "meaning";
  matchedBy?: string;
};

// Contact columns are varchar(191): one longer value would fail a whole batch.
const fit = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 191) : null);

/** CAREER141 rows as Brevo contacts. Bad emails are dropped and one email is one contact (cleanCandidates). */
export function career141Contacts(rows: Career141Row[]) {
  const byEmail = new Map<string, Career141Row>();
  for (const r of rows) {
    const email = typeof r?.email === "string" ? r.email.trim().toLowerCase() : "";
    if (email && !byEmail.has(email)) byEmail.set(email, r);
  }
  return cleanCandidates(rows).map((c) => {
    const r = byEmail.get(c.email)!;
    return {
      ...c,
      phone: fit(r.phone),
      company: fit(r.employer),
      designation: fit(r.title),
      city: fit(r.location),
      linkedin: fit(r.linkedinUrl),
      tags: fit(["career141", r.level?.trim()].filter(Boolean).join(",")),
      source: "career141",
    };
  });
}
