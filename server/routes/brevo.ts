import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../prisma.js";

export const brevoRouter = Router();
const router = brevoRouter;

// ── Brevo Import ────────────────────────────────────────────────────

const BREVO_BASE = "https://api.brevo.com/v3/contacts";
const BREVO_LIMIT = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function brevoFetch(url: string, apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: { "api-key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAndStoreFolders(apiKey: string): Promise<void> {
  let offset = 0;
  const limit = 50;

  while (true) {
    const url = `https://api.brevo.com/v3/contacts/folders?limit=${limit}&offset=${offset}&sort=desc`;
    const res = await brevoFetch(url, apiKey);
    if (res.status === 429) { await sleep(2000); continue; }
    if (!res.ok) throw new Error(`Brevo folders API error (${res.status}): ${await res.text()}`);
    
    const data = (await res.json()) as any;
    const folders: any[] = data.folders ?? [];
    if (folders.length === 0) break;

    for (const folder of folders) {
      const payload = { brevoId: folder.id, name: folder.name };
      const existing = await prisma.folder.findFirst({ where: { brevoId: folder.id } });
      if (existing) {
        await prisma.folder.update({ where: { id: existing.id }, data: payload });
      } else {
        await prisma.folder.create({ data: payload });
      }
    }

    if (folders.length < limit) break;
    offset += limit;
  }
}

async function fetchAndStoreLists(apiKey: string): Promise<Map<number, number>> {
  const brevoToLocal = new Map<number, number>();
  let offset = 0;
  const limit = 50;
  const seen = new Set<number>();

  while (true) {
    const res = await brevoFetch(`${BREVO_BASE}/lists?limit=${limit}&offset=${offset}&sort=desc`, apiKey);
    if (res.status === 429) { await sleep(2000); continue; }
    if (!res.ok) throw new Error(`Brevo lists API error (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as any;
    const lists: any[] = data.lists ?? [];
    if (lists.length === 0) break;

    let newItems = 0;
    for (const list of lists) {
      if (seen.has(list.id)) continue;
      seen.add(list.id);
      newItems++;

      let localFolderId: number | null = null;
      if (list.folderId) {
        const folder = await prisma.folder.findFirst({ where: { brevoId: list.folderId } });
        if (folder) localFolderId = folder.id;
      }

      const existing = await prisma.list.findFirst({ where: { brevoId: list.id } });
      if (existing) {
        await prisma.list.update({ where: { id: existing.id }, data: { name: list.name, type: list.type ?? "list", folderId: localFolderId } });
        brevoToLocal.set(list.id, existing.id);
      } else {
        const created = await prisma.list.create({
          data: { brevoId: list.id, name: list.name, type: list.type ?? "list", folderId: localFolderId },
        });
        brevoToLocal.set(list.id, created.id);
      }
    }

    if (newItems === 0) break;
    if (lists.length < limit) break;
    offset += limit;
  }

  return brevoToLocal;
}

async function fetchAndStoreCompanies(apiKey: string): Promise<number> {
  let imported = 0;
  let offset = 0;
  const limit = 50;
  const seen = new Set<string>();

  while (true) {
    const url = `https://api.brevo.com/v3/companies?limit=${limit}&offset=${offset}&sort=desc`;
    const res = await brevoFetch(url, apiKey);
    if (res.status === 429) { await sleep(2000); continue; }
    if (!res.ok) throw new Error(`Brevo companies API error (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as any;
    const companies: any[] = data.items ?? [];
    if (companies.length === 0) break;

    let newItems = 0;
    for (const company of companies) {
      if (seen.has(company.id)) continue;
      seen.add(company.id);
      newItems++;

      const attrs = company.attributes ?? {};
      const payload = {
        brevoId: company.id,
        name: attrs.name ?? "Unknown",
        domain: attrs.domain ?? null,
        owner: attrs.owner ?? null,
        phoneNumber: attrs.phone_number ? String(attrs.phone_number) : null,
        revenue: attrs.revenue ? Number(attrs.revenue) : null,
        industry: attrs.industry ?? null,
        numberOfEmployees: attrs.number_of_employees ?? null,
        numberOfContacts: attrs.number_of_contacts ?? 0,
        linkedContactsIds: company.linkedContactsIds ?? [],
        linkedDealsIds: company.linkedDealsIds ?? [],
      };

      const existing = await prisma.company.findUnique({ where: { brevoId: company.id } });
      if (existing) {
        await prisma.company.update({ where: { id: existing.id }, data: payload });
      } else {
        await prisma.company.create({ data: payload });
      }
      imported++;
    }

    if (newItems === 0) break;
    if (companies.length < limit) break;
    offset += limit;
  }
  return imported;
}

async function fetchAndStoreSegments(apiKey: string): Promise<number> {
  let imported = 0;
  let offset = 0;
  const limit = 50;
  const seen = new Set<number>();

  while (true) {
    const url = `https://api.brevo.com/v3/contacts/segments?limit=${limit}&offset=${offset}`;
    const res = await brevoFetch(url, apiKey);
    if (res.status === 429) { await sleep(2000); continue; }
    if (!res.ok) throw new Error(`Brevo segments API error (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as any;
    const segments: any[] = data.segments ?? [];
    if (segments.length === 0) break;

    let newItems = 0;
    for (const segment of segments) {
      if (seen.has(segment.id)) continue;
      seen.add(segment.id);
      newItems++;

      const payload = {
        brevoId: segment.id,
        name: segment.segmentName ?? "Unknown",
        segmentType: segment.categoryName ?? null,
        contactCount: segment.numberOfContacts ?? 0,
      };

      const existing = await prisma.segment.findUnique({ where: { brevoId: segment.id } });
      if (existing) {
        await prisma.segment.update({ where: { id: existing.id }, data: payload });
      } else {
        await prisma.segment.create({ data: payload });
      }
      imported++;
    }

    if (newItems === 0) break;
    if (segments.length < limit) break;
    offset += limit;
  }
  return imported;
}

function mapContact(c: any) {
  const attrs = c.attributes ?? {};
  const email = c.email ?? "";
  const fn = attrs.FIRSTNAME ?? attrs.firstname ?? null;
  const ln = attrs.LASTNAME ?? attrs.lastname ?? null;
  const full = attrs.FULL_NAME ?? attrs.full_name ?? null;
  return {
    firstName: fn,
    lastName: ln,
    fullName: full ?? (fn && ln ? `${fn} ${ln}` : fn ?? ln ?? null),
    email,
    sms: attrs.SMS ?? attrs.sms ?? attrs.PHONE ?? attrs.phone ?? null,
    whatsapp: attrs.WHATSAPP ?? attrs.whatsapp ?? null,
    company: attrs.COMPANY ?? attrs.company ?? null,
    designation: attrs.DESIGNATION ?? attrs.designation ?? attrs.JOB_TITLE ?? attrs.job_title ?? null,
    linkedin: attrs.LINKEDIN ?? attrs.linkedin ?? null,
    country: attrs.COUNTRY ?? attrs.country ?? null,
    city: attrs.CITY ?? attrs.city ?? attrs.LOCATION ?? attrs.location ?? null,
    status: c.emailBlacklisted ? "unsubscribed" : "subscribed",
    source: "brevo",
    createdAt: c.createdAt ?? undefined,
    _listIds: (c.listIds as number[]) ?? [],
  };
}

// A full import takes far longer than an HTTP request should, so it runs in the background and the page polls for it.
// ponytail: jobs live in memory, so a redeploy loses one (polling then gets 404 and the import can simply be re-run,
// it skips what already exists). Only one runs at a time.
type BrevoJob = { id: string; status: "running" | "done" | "failed"; result?: unknown; error?: string };
const brevoJobs = new Map<string, BrevoJob>();

function startBrevoJob(work: () => Promise<unknown>): BrevoJob {
  const active = [...brevoJobs.values()].find((j) => j.status === "running");
  if (active) return active;
  const job: BrevoJob = { id: randomUUID(), status: "running" };
  brevoJobs.set(job.id, job);
  work().then(
    (result) => { job.status = "done"; job.result = result; },
    (err) => { console.error("Brevo job failed:", err); job.status = "failed"; job.error = err?.message ?? "Import failed"; },
  );
  return job;
}

router.get("/api/brevo/jobs/:id", (req, res) => {
  const job = brevoJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Import job not found. The server may have restarted: please run it again." });
  res.json(job);
});

router.post("/api/brevo/import", (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: "API key is required" });
  res.status(202).json({ jobId: startBrevoJob(() => runBrevoImport(apiKey)).id });
});

router.post("/api/brevo/link-lists", (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: "API key is required" });
  res.status(202).json({ jobId: startBrevoJob(() => runBrevoLinkLists(apiKey)).id });
});

async function runBrevoImport(apiKey: string) {
  await fetchAndStoreFolders(apiKey);
  const brevoListMap = await fetchAndStoreLists(apiKey);
  const companiesImported = await fetchAndStoreCompanies(apiKey).catch(e => { console.error("Companies import failed", e); return 0; });
  const segmentsImported = await fetchAndStoreSegments(apiKey).catch(e => { console.error("Segments import failed", e); return 0; });

  let imported = 0;
  let skipped = 0;
  let total: number | null = null;
  let offset = 0;
  const batchSize = 500;
  const MAX_IMPORT = 100000;
  const seenEmails = new Set<string>();

  while (true) {
    if (imported >= MAX_IMPORT) break;

    const url = `${BREVO_BASE}?limit=${BREVO_LIMIT}&offset=${offset}&sort=desc`;
    const response = await brevoFetch(url, apiKey);
    if (response.status === 429) {
      await sleep(2000);
      continue;
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo API error (${response.status}): ${body}`);
    }
    const data = (await response.json()) as any;
    if (total === null) total = data.count;
    const contacts = data.contacts ?? [];
    if (contacts.length === 0) break;

    const mapped = contacts.map(mapContact).filter((c: any) => c.email);

    const existingEmails = (
      await prisma.contact.findMany({
        where: { email: { in: mapped.map((c: any) => c.email) } },
        select: { email: true },
      })
    ).map((e) => e.email);

    const existingSet = new Set([...existingEmails, ...seenEmails]);

    const newContacts = mapped.filter((c: any) => !existingSet.has(c.email));
    for (const c of newContacts) seenEmails.add(c.email);
    skipped += mapped.length - newContacts.length;

    for (let i = 0; i < newContacts.length; i += batchSize) {
      const remaining = MAX_IMPORT - imported;
      if (remaining <= 0) break;
      const batch = newContacts.slice(i, i + Math.min(batchSize, remaining));
      const { count } = await prisma.contact.createMany({ data: batch, skipDuplicates: true });
      imported += count;
    }

    if (imported + skipped >= total!) break;
    offset += BREVO_LIMIT;
  }

  let linked = 0;
  for (const [brevoId, localId] of brevoListMap) {
    let lOffset = 0;
    while (true) {
      const listLimit = 500;
      const url = `${BREVO_BASE}/lists/${brevoId}/contacts?limit=${listLimit}&offset=${lOffset}&sort=desc`;
      const res = await brevoFetch(url, apiKey);
      if (res.status === 429) { await sleep(2000); continue; }
      if (!res.ok) {
        console.error(`Failed to fetch contacts for list ${brevoId} (${res.status}):`, await res.text());
        break;
      }

      const data = (await res.json()) as any;
      const members: any[] = data.contacts ?? [];
      if (members.length === 0) break;

      const emails = members.map((m: any) => m.email).filter(Boolean);
      const existing = await prisma.contact.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });

      const links = existing.map((c) => ({ contactId: c.id, listId: localId }));
      if (links.length > 0) {
        const { count } = await prisma.contactList.createMany({ data: links, skipDuplicates: true });
        linked += count;
      }

      if (members.length < listLimit) break;
      lOffset += listLimit;
    }
  }

  return { imported, skipped, total: total ?? imported + skipped, listsImported: brevoListMap.size, companiesImported, segmentsImported, contactsLinked: linked };
}

async function runBrevoLinkLists(apiKey: string) {
  // Sync folders and lists first to ensure we have the latest
  await fetchAndStoreFolders(apiKey);
  await fetchAndStoreLists(apiKey);

  const lists = await prisma.list.findMany({ where: { brevoId: { not: null } }, select: { id: true, brevoId: true } });
  const brevoListMap = new Map<number, number>(lists.filter((l) => l.brevoId !== null).map((l) => [l.brevoId!, l.id]));
  if (brevoListMap.size === 0) return { contactsLinked: 0, error: "No lists found. Run a full import first." };

  let linked = 0;
  let offset = 0;

  while (true) {
    const url = `${BREVO_BASE}?limit=${BREVO_LIMIT}&offset=${offset}&sort=desc`;
    const response = await brevoFetch(url, apiKey);
    if (response.status === 429) { await sleep(2000); continue; }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo API error (${response.status}): ${body}`);
    }

    const data = (await response.json()) as any;
    if (data.contacts?.length === 0) break;

    const contacts: any[] = data.contacts ?? [];
    if (contacts.length === 0) break;

    const emails = contacts.filter((c: any) => c.email).map((c: any) => c.email);
    const existing = await prisma.contact.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const emailToId = new Map<string, number>(existing.map((c: any) => [c.email, c.id]));

    const links: { contactId: number; listId: number }[] = [];
    for (const c of contacts) {
      const contactId = emailToId.get(c.email);
      if (contactId && c.listIds?.length) {
        for (const brevoId of c.listIds) {
          const localId = brevoListMap.get(brevoId);
          if (localId) links.push({ contactId, listId: localId });
        }
      }
    }

    if (links.length > 0) {
      const { count } = await prisma.contactList.createMany({ data: links, skipDuplicates: true });
      linked += count;
    }

    offset += BREVO_LIMIT;
  }

  return { contactsLinked: linked, listsFound: brevoListMap.size };
}
