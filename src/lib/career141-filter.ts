/**
 * Find in CAREER141 (9 Nov 2026): narrowing a finished search to the people you want, and the file for exactly them.
 * Pure, so the page and the tests share it.
 */
import type { Career141Row } from "./api.ts";

export type RowFilter = {
  text: string; // every word must appear in the name, email, title or employer
  level: string; // "" = any
  kind: "" | Career141Row["kind"];
  hasPhone: boolean;
};

export const NO_FILTER: RowFilter = { text: "", level: "", kind: "", hasPhone: false };

export const isFiltered = (f: RowFilter) => Boolean(f.text.trim() || f.level || f.kind || f.hasPhone);

export function filterRows(rows: Career141Row[], f: RowFilter): Career141Row[] {
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (f.level && r.level !== f.level) return false;
    if (f.kind && r.kind !== f.kind) return false;
    if (f.hasPhone && !r.phone?.trim()) return false;
    if (!words.length) return true;
    const hay = [r.name, r.email, r.title, r.employer].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The levels present, with counts, in CAREER141's ladder order where known. */
export function levelCounts(rows: Career141Row[], ladder: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.level) counts.set(r.level, (counts.get(r.level) ?? 0) + 1);
  const rank = (l: string) => (ladder.includes(l) ? ladder.indexOf(l) : ladder.length);
  return [...counts].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

const FOUND_AS: Record<Career141Row["kind"], string> = { current: "Current role", previous: "Previous role", meaning: "Found by meaning" };

/** One cell: quoted, and never something Excel would run as a formula. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** The people shown, as a file Excel opens as it is (UTF-8 with a byte-order mark). */
export function rowsToCsv(rows: Career141Row[]): string {
  const head = ["Name", "Email", "Phone", "Title", "Level", "Employer", "Location", "LinkedIn", "Found as", "Why"];
  const lines = rows.map((r) =>
    [r.name, r.email, r.phone, r.title, r.level, r.employer, r.location, r.linkedinUrl, FOUND_AS[r.kind] ?? r.kind, r.matchedBy]
      .map(csvCell).join(","));
  return "﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
