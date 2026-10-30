export type Sheet = { headers: string[]; rows: Record<string, unknown>[] };
export type Candidate = { email: string; name: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function readSheet(file: File): Promise<Sheet> {
  // Loaded on demand: the parser is about 500 kB and most sessions never import a sheet.
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

// Header guess; the user can override both in the UI. Name may be "" (use first+last or nothing).
export function detectColumns(headers: string[]) {
  const find = (re: RegExp) => headers.find((h) => re.test(h.trim())) ?? "";
  return {
    email: find(/e-?mail/i),
    name: find(/^(candidate\s*)?(full\s*)?name$/i) || find(/name/i),
  };
}

export function toCandidates(rows: Record<string, unknown>[], emailCol: string, nameCol: string): Candidate[] {
  // "First Name" picked: also append the "Last Name" column if there is one
  const lastCol = /first/i.test(nameCol) ? Object.keys(rows[0] ?? {}).find((h) => /last\s*name|surname/i.test(h)) : undefined;
  return rows.map((r) => ({
    email: String(r[emailCol] ?? "").trim(),
    name: [r[nameCol], lastCol && r[lastCol]].map((v) => String(v || "").trim()).filter(Boolean).join(" "),
  }));
}

export const isValidEmail = (e: string) => EMAIL_RE.test(e);
