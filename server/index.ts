import express from "express";
import cors from "cors";
import { prisma } from "./prisma.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// ── Contacts ────────────────────────────────────────────────────────

app.get("/api/contacts", async (req, res) => {
  try {
    const q = (req.query.q as string ?? "").toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    const where = q
      ? {
          OR: [
            { email: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { company: { contains: q } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

app.get("/api/contacts/stats", async (_req, res) => {
  try {
    const [total, subscribed, unsubscribed, bounced] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { status: "subscribed" } }),
      prisma.contact.count({ where: { status: "unsubscribed" } }),
      prisma.contact.count({ where: { status: "bounced" } }),
    ]);
    res.json({ total, subscribed, unsubscribed, bounced });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("/api/contacts/:id", async (req, res) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
    });
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

app.post("/api/contacts", async (req, res) => {
  try {
    const data = req.body;
    if (!data.email && !data.whatsapp && !data.sms) {
      return res.status(400).json({ error: "At least one of email, WhatsApp, or SMS is required" });
    }
    const contact = await prisma.contact.create({ data });
    res.status(201).json(contact);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Contact with this email already exists" });
    }
    res.status(500).json({ error: "Failed to create contact" });
  }
});

app.put("/api/contacts/:id", async (req, res) => {
  try {
    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(contact);
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.status(500).json({ error: "Failed to update contact" });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

// ── Campaigns ───────────────────────────────────────────────────────

app.get("/api/campaigns", async (_req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({ orderBy: { id: "desc" } });
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

app.get("/api/campaigns/stats", async (_req, res) => {
  try {
    const [total, sent, draft, scheduled] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: "sent" } }),
      prisma.campaign.count({ where: { status: "draft" } }),
      prisma.campaign.count({ where: { status: "scheduled" } }),
    ]);
    res.json({ total, sent, draft, scheduled });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaign stats" });
  }
});

// ── Brevo Import ────────────────────────────────────────────────────

const BREVO_BASE = "https://api.brevo.com/v3/contacts";
const BREVO_LIMIT = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildName(c: any): string {
  const attrs = c.attributes ?? {};
  const fn = attrs.FIRSTNAME ?? attrs.firstname ?? "";
  const ln = attrs.LASTNAME ?? attrs.lastname ?? "";
  const full = attrs.FULL_NAME ?? attrs.full_name ?? "";
  if (full) return full;
  if (fn && ln) return `${fn} ${ln}`;
  return fn || ln || c.email || "Unknown";
}

function mapContact(c: any) {
  const attrs = c.attributes ?? {};
  const email = c.email ?? "";
  return {
    name: buildName(c),
    firstName: attrs.FIRSTNAME ?? attrs.firstname ?? null,
    lastName: attrs.LASTNAME ?? attrs.lastname ?? null,
    fullName: attrs.FULL_NAME ?? attrs.full_name ?? null,
    email,
    sms: attrs.SMS ?? attrs.sms ?? attrs.PHONE ?? attrs.phone ?? null,
    whatsapp: attrs.WHATSAPP ?? attrs.whatsapp ?? null,
    company: attrs.COMPANY ?? attrs.company ?? null,
    designation: attrs.DESIGNATION ?? attrs.designation ?? null,
    jobTitle: attrs.JOB_TITLE ?? attrs.job_title ?? null,
    linkedin: attrs.LINKEDIN ?? attrs.linkedin ?? null,
    location: attrs.LOCATION ?? attrs.location ?? null,
    country: attrs.COUNTRY ?? attrs.country ?? null,
    lists: c.listIds ?? [],
    status: c.emailBlacklisted ? "unsubscribed" : "subscribed",
    source: "brevo",
    createdAt: c.createdAt ?? null,
  };
}

app.post("/api/brevo/import", async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: "API key is required" });

    let imported = 0;
    let skipped = 0;
    let total: number | null = null;
    let offset = 0;
    const batchSize = 500;

    while (true) {
      const url = `${BREVO_BASE}?limit=${BREVO_LIMIT}&offset=${offset}&sort=desc`;
      const response = await fetch(url, {
        headers: { "api-key": apiKey, Accept: "application/json" },
      });
      if (response.status === 429) {
        await sleep(2000);
        continue;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Brevo API error (${response.status}): ${body}`);
      }
      const data = await response.json();
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

      const existingSet = new Set(existingEmails);

      const newContacts = mapped.filter((c: any) => !existingSet.has(c.email));
      skipped += mapped.length - newContacts.length;

      for (let i = 0; i < newContacts.length; i += batchSize) {
        const batch = newContacts.slice(i, i + batchSize);
        await prisma.contact.createMany({ data: batch });
      }
      imported += newContacts.length;

      if (imported + skipped >= total!) break;
      offset += BREVO_LIMIT;
    }

    res.json({ imported, skipped, total: total ?? imported + skipped });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Import failed" });
  }
});

// ── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
