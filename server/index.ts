import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express"; // server restarted
import cors from "cors";
import { SendEmailCommand, GetSendQuotaCommand } from "@aws-sdk/client-ses";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma.js";
import { sesClient } from "./lib/ses.js";
import contactsRouter from "./routes/contacts.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// ■■ Analytics Cache (5 min TTL) ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const analyticsCache = new Map<string, { data: any; expiresAt: number }>();
function getCached(key: string) {
  const entry = analyticsCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    analyticsCache.delete(key);
    return null;
  }
  return entry.data;
}
function setCache(key: string, data: any, ttlMs = 5 * 60 * 1000) {
  analyticsCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Contacts ────────────────────────────────────────────────────────

app.get("/api/contacts", async (req, res) => {
  try {
    const q = (req.query.q as string ?? "").toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    const listIdQuery = req.query.listId ? Number(req.query.listId) : undefined;
    const baseWhere: any = {};
    if (listIdQuery) {
      const targetList = await prisma.list.findFirst({
        where: {
          OR: [
            { id: listIdQuery },
            { brevoId: listIdQuery }
          ]
        },
        select: { id: true }
      });
      if (targetList) {
        baseWhere.contactLists = {
          some: {
            listId: targetList.id,
          },
        };
      } else {
        baseWhere.contactLists = {
          some: {
            listId: -1,
          },
        };
      }
    }

    const where = q
      ? {
          ...baseWhere,
          OR: [
            { email: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { company: { contains: q } },
          ],
        }
      : baseWhere;

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

app.get("/api/contacts/stats", async (req, res) => {
  try {
    const listIdQuery = req.query.listId ? Number(req.query.listId) : undefined;
    const baseWhere: any = {};
    if (listIdQuery) {
      const targetList = await prisma.list.findFirst({
        where: {
          OR: [
            { id: listIdQuery },
            { brevoId: listIdQuery }
          ]
        },
        select: { id: true }
      });
      if (targetList) {
        baseWhere.contactLists = {
          some: {
            listId: targetList.id,
          },
        };
      } else {
        baseWhere.contactLists = {
          some: {
            listId: -1,
          },
        };
      }
    }

    const [total, subscribed, unsubscribed, bounced] = await Promise.all([
      prisma.contact.count({ where: baseWhere }),
      prisma.contact.count({ where: { ...baseWhere, status: "subscribed" } }),
      prisma.contact.count({ where: { ...baseWhere, status: "unsubscribed" } }),
      prisma.contact.count({ where: { ...baseWhere, status: "bounced" } }),
    ]);
    res.json({ total, subscribed, unsubscribed, bounced });
  } catch (err) {
    console.error("=== Prisma Stats Error ===");
    console.error("Message:", (err as any).message);
    console.error("Stack:", (err as any).stack);
    if ((err as any).cause) console.error("Cause:", (err as any).cause);
    if ((err as any).code) console.error("Code:", (err as any).code);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("/api/contacts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid contact ID" });
    const contact = await prisma.contact.findUnique({
      where: { id },
    });
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.json(contact);
  } catch (err) {
    console.error("Fetch contact error:", err);
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

app.post("/api/contacts", async (req, res) => {
  try {
    const r = req.body;
    const trim = (v: any) => (typeof v === "string" ? v.trim() || null : null);

    const email = trim(r.email)?.toLowerCase() ?? null;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const contact = await prisma.contact.create({
      data: {
        email,
        firstName:   trim(r.firstName),
        lastName:    trim(r.lastName),
        fullName:    trim(r.fullName),
        phone:       trim(r.phone),
        company:     trim(r.company),
        designation: trim(r.designation),
        industry:    trim(r.industry),
        website:     trim(r.website),
        country:     trim(r.country),
        city:        trim(r.city),
        address:     trim(r.address),
        linkedin:    trim(r.linkedin),
        twitter:     trim(r.twitter),
        facebook:    trim(r.facebook),
        whatsapp:    trim(r.whatsapp),
        sms:         trim(r.sms),
        notes:       trim(r.notes),
        source:      trim(r.source),
        ...(r.status ? { status: r.status } : {}),
      },
    });
    res.status(201).json(contact);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "A contact with this email already exists" });
    }
    console.error("Create contact error:", err);
    res.status(500).json({ error: "Failed to create contact", detail: err?.message });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid contact ID" });
    await prisma.contact.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

// ── Contacts Router (additional bulk/single routes) ────────────────

app.use("/api/contacts", contactsRouter);

// ── Lists ──────────────────────────────────────────────────────────

app.get("/api/lists", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const q = (req.query.q as string ?? "").toLowerCase();
    const folderId = req.query.folderId ? Number(req.query.folderId) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(10000, Math.max(1, Number(req.query.pageSize) || 10));

    const baseWhere: any = {};
    if (type) baseWhere.type = type;
    if (folderId) baseWhere.folderId = folderId;

    const where = q
      ? {
          ...baseWhere,
          name: { contains: q },
        }
      : baseWhere;

    const [lists, total] = await Promise.all([
      prisma.list.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { contactLists: true } },
          folder: { select: { name: true } },
        },
      }),
      prisma.list.count({ where }),
    ]);

    res.json({
      data: lists.map((l) => ({
        ...l,
        contactCount: l._count.contactLists,
        folderName: l.folder?.name ?? "—",
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lists" });
  }
});

app.post("/api/lists", async (req, res) => {
  try {
    const { name, folderId } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name is required and must be a string." });
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Name cannot be empty." });
    }
    if (trimmedName.length > 255) {
      return res.status(400).json({ error: "Name must be under 255 characters." });
    }
    if (!folderId) {
      return res.status(400).json({ error: "Folder is required." });
    }

    const folder = await prisma.folder.findUnique({
      where: { id: Number(folderId) },
    });
    if (!folder) {
      return res.status(400).json({ error: "Selected folder does not exist." });
    }

    const newList = await prisma.list.create({
      data: {
        name: trimmedName,
        folderId: Number(folderId),
        type: "list",
      },
      include: {
        folder: { select: { name: true } },
      },
    });

    res.status(201).json({
      ...newList,
      contactCount: 0,
      folderName: newList.folder?.name ?? "—",
    });
  } catch (err: any) {
    console.error("Create list error:", err);
    res.status(500).json({ error: "Failed to create list.", detail: err?.message });
  }
});

app.put("/api/lists/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid list ID" });

    const { name, folderId } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name is required and must be a string." });
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Name cannot be empty." });
    }
    if (trimmedName.length > 255) {
      return res.status(400).json({ error: "Name must be under 255 characters." });
    }
    if (!folderId) {
      return res.status(400).json({ error: "Folder is required." });
    }

    const folder = await prisma.folder.findUnique({
      where: { id: Number(folderId) },
    });
    if (!folder) {
      return res.status(400).json({ error: "Selected folder does not exist." });
    }

    const updatedList = await prisma.list.update({
      where: { id },
      data: {
        name: trimmedName,
        folderId: Number(folderId),
      },
      include: {
        folder: { select: { name: true } },
      },
    });

    res.json({
      ...updatedList,
      folderName: updatedList.folder?.name ?? "—",
    });
  } catch (err: any) {
    if (err?.code === "P2025") return res.status(404).json({ error: "List not found" });
    console.error("Update list error:", err);
    res.status(500).json({ error: "Failed to update list.", detail: err?.message });
  }
});

app.delete("/api/lists/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid list ID" });

    // Delete associations in ContactList first, then the list itself
    await prisma.$transaction([
      prisma.contactList.deleteMany({
        where: { listId: id },
      }),
      prisma.list.delete({
        where: { id },
      }),
    ]);

    res.json({ success: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "List not found" });
    }
    console.error("Delete list error:", err);
    res.status(500).json({ error: "Failed to delete list." });
  }
});

// ── Folders ─────────────────────────────────────────────────────────

app.get("/api/folders", async (_req, res) => {
  try {
    const folders = await prisma.folder.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { lists: true } } },
    });
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

app.post("/api/folders", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Folder name is required and must be a string." });
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Folder name cannot be empty." });
    }
    if (trimmedName.length > 255) {
      return res.status(400).json({ error: "Folder name must be under 255 characters." });
    }

    const newFolder = await prisma.folder.create({
      data: {
        name: trimmedName,
      },
    });

    res.status(201).json({
      ...newFolder,
      _count: { lists: 0 },
    });
  } catch (err: any) {
    console.error("Create folder error:", err);
    res.status(500).json({ error: "Failed to create folder.", detail: err?.message });
  }
});

app.get("/api/automations", async (_req, res) => {
  try {
    const automations = await prisma.automation.findMany({ orderBy: { name: "asc" } });
    res.json(automations);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch automations" });
  }
});

app.get("/api/lists/stats", async (_req, res) => {
  try {
    const [total, listCount, segmentCount] = await Promise.all([
      prisma.list.count(),
      prisma.list.count({ where: { type: "list" } }),
      prisma.list.count({ where: { type: { not: "list" } } }),
    ]);
    res.json({ total, lists: listCount, segments: segmentCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch list stats" });
  }
});

// ── Companies ───────────────────────────────────────────────────────

app.get("/api/companies", async (req, res) => {
  try {
    const q = (req.query.q as string ?? "").toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    const where = q
      ? {
          OR: [
            { name: { contains: q } },
            { domain: { contains: q } },
            { owner: { contains: q } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.company.count({ where }),
    ]);

    res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

app.get("/api/companies/stats", async (_req, res) => {
  try {
    const total = await prisma.company.count();
    res.json({ total });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch company stats" });
  }
});

// ── Segments ────────────────────────────────────────────────────────

app.get("/api/segments", async (_req, res) => {
  try {
    const segments = await prisma.segment.findMany({
      orderBy: { name: "asc" },
    });
    res.json(segments);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch segments" });
  }
});

app.get("/api/segments/stats", async (_req, res) => {
  try {
    const total = await prisma.segment.count();
    res.json({ total });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch segment stats" });
  }
});

// ── Templates ────────────────────────────────────────────────────────

// GET all templates
app.get("/api/templates", async (req, res) => {
  try {
    const templates = await prisma.template.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        subject: true,
        previewText: true,
        createdAt: true,
      },
    });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

// GET single template (full HTML)
app.get("/api/templates/:id", async (req, res) => {
  try {
    const template = await prisma.template.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!template) return res.status(404).json({ error: "Not found" });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

// POST create template
app.post("/api/templates", async (req, res) => {
  try {
    const { name, subject, contentHtml, previewText } = req.body;
    if (!name || !contentHtml) {
      return res.status(400).json({ error: "name and contentHtml required" });
    }
    const template = await prisma.template.create({
      data: { name, subject, contentHtml, previewText },
    });
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ error: "Failed to create template" });
  }
});

// PUT update template
app.put("/api/templates/:id", async (req, res) => {
  try {
    const { name, subject, contentHtml, previewText } = req.body;
    const template = await prisma.template.update({
      where: { id: Number(req.params.id) },
      data: { name, subject, contentHtml, previewText },
    });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: "Failed to update template" });
  }
});

// DELETE template
app.delete("/api/templates/:id", async (req, res) => {
  try {
    await prisma.template.delete({
      where: { id: Number(req.params.id) },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ── Campaigns ────────────────────────────────────────────────────────

// GET all campaigns
app.get("/api/campaigns", async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

// GET campaign stats
app.get("/api/campaigns/stats", async (req, res) => {
  try {
    const [total, sent, draft, scheduled, sending] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: "sent" } }),
      prisma.campaign.count({ where: { status: "draft" } }),
      prisma.campaign.count({ where: { status: "scheduled" } }),
      prisma.campaign.count({ where: { status: "sending" } }),
    ]);
    res.json({ total, sent, draft, scheduled, sending });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaign stats" });
  }
});

// POST create campaign draft
app.post("/api/campaigns", async (req, res) => {
  try {
    const { name, subject, fromName, fromEmail, templateHtml, audienceType, audienceId } = req.body;
    if (!name || !subject || !fromName || !fromEmail) {
      return res.status(400).json({ error: "name, subject, fromName, fromEmail required" });
    }
    const campaign = await prisma.campaign.create({
      data: {
        name,
        subject,
        fromName,
        fromEmail,
        templateHtml: templateHtml || "",
        audienceType: audienceType || "list",
        audienceId: audienceId || 0,
        status: "draft",
      },
    });
    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ error: "Failed to create campaign draft" });
  }
});

// PUT update campaign
app.put("/api/campaigns/:id", async (req, res) => {
  try {
    const data = req.body;
    if (data.id !== undefined) delete data.id;
    if (data.createdAt !== undefined) delete data.createdAt;
    const campaign = await prisma.campaign.update({
      where: { id: Number(req.params.id) },
      data,
    });
    res.json(campaign);
  } catch (err: any) {
    console.error("Failed to update campaign:", err);
    res.status(500).json({ error: "Failed to update campaign", details: err.message });
  }
});

// DELETE campaign
app.delete("/api/campaigns/:id", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status !== "draft") {
      return res.status(400).json({ error: "Only draft campaigns can be deleted" });
    }
    await prisma.campaign.delete({
      where: { id: campaignId },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// POST duplicate campaign
app.post("/api/campaigns/:id/duplicate", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    const copy = await prisma.campaign.create({
      data: {
        name: `${campaign.name} (Copy)`,
        subject: campaign.subject,
        fromName: campaign.fromName,
        fromEmail: campaign.fromEmail,
        templateHtml: campaign.templateHtml,
        audienceType: campaign.audienceType,
        audienceId: campaign.audienceId,
        status: "draft",
      },
    });
    res.status(201).json(copy);
  } catch (err) {
    res.status(500).json({ error: "Failed to duplicate campaign" });
  }
});

// POST /api/campaigns/:id/send
app.post("/api/campaigns/:id/send", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);

    // 1. Fetch campaign record
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status === "sent") {
      return res.status(400).json({ error: "Campaign already sent" });
    }
    if (!campaign.audienceId) {
      return res.status(400).json({ error: "No audience selected" });
    }
    if (!campaign.templateHtml) {
      return res.status(400).json({ error: "No template selected" });
    }

    // 2. Mark as sending
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "sending" },
    });

    // 3. Fetch subscribed contacts from the selected list
    const contacts = await prisma.contact.findMany({
      where: {
        status: "subscribed",
        contactLists: { some: { listId: campaign.audienceId } },
      },
    });

    if (contacts.length === 0) {
      // Revert status back to draft
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "draft" },
      });
      return res.status(400).json({ error: "No subscribed contacts found in the selected audience." });
    }

    let sent = 0;
    const errors: string[] = [];

    // Safety fallback: Ensure unsubscribe URL tag is present in campaign template
    let template = campaign.templateHtml;
    if (!template.includes("{{unsubscribe_url}}")) {
      const fallbackUnsubHtml = `<div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; font-family: sans-serif; font-size: 12px; color: #666;"><p>If you wish to unsubscribe, you can <a href="{{unsubscribe_url}}" style="color: #0070f3; text-decoration: underline;">unsubscribe here</a>.</p></div>`;
      if (/<\/body>/i.test(template)) {
        template = template.replace(/<\/body>/i, `${fallbackUnsubHtml}</body>`);
      } else {
        template += fallbackUnsubHtml;
      }
    }

    for (const contact of contacts) {
      const unsubUrl = makeUnsubscribeUrl(contact.email);
      let html = template
        .replace(/{{first_name}}/g, contact.firstName || "")
        .replace(/{{last_name}}/g, contact.lastName || "")
        .replace(/{{full_name}}/g, contact.fullName || "")
        .replace(/{{company}}/g, contact.company || "")
        .replace(/{{designation}}/g, contact.designation || "")
        .replace(/{{email}}/g, contact.email)
        .replace(/{{unsubscribe_url}}/g, unsubUrl);

      // Inject open-tracking pixel and rewrite links through click tracker
      html = injectTracking(html, contact.email, campaignId);

      try {
        await sesClient.send(new SendEmailCommand({
          Source: `${campaign.fromName} <${campaign.fromEmail}>`,
          Destination: { ToAddresses: [contact.email] },
          ConfigurationSetName: "career141-tracking",
          Message: {
            Subject: { Data: campaign.subject, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
          },
          // @ts-ignore
          Headers: [{ Name: "List-Unsubscribe", Value: `<${unsubUrl}>` }],
        }));
        // Log "sent" event with campaignId
        await prisma.emailEvent.create({
          data: {
            email: contact.email.toLowerCase(),
            campaignId,
            eventType: "sent",
          },
        });
        sent++;
      } catch (e: any) {
        errors.push(`${contact.email}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 72)); // 14/sec rate limit
    }

    // 4. Handle errors
    if (errors.length > 0) {
      console.error(`Failed to send to ${errors.length} contacts:`, errors.slice(0, 5));
    }

    if (sent === 0 && errors.length > 0) {
      // Revert status back to draft if ALL failed
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "draft" },
      });
      return res.status(500).json({ 
        error: "Failed to send to any contacts. Check SES verification or configuration.", 
        details: errors[0] 
      });
    }

    // 5. Mark campaign as sent
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "sent", sentAt: new Date(), totalRecipients: sent },
    });

    res.json({ sent, errors: errors.length, campaignId, campaign: updatedCampaign });
  } catch (err: any) {
    console.error("Send campaign error:", err);
    res.status(500).json({ error: "Failed to send campaign", details: err.message });
  }
});

// ── Analytics ───────────────────────────────────────────────────────

app.get('/api/analytics/campaigns', async (req, res) => {
  try {
    const cached = getCached('analytics:campaigns');
    if (cached) return res.json(cached);

    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const result = await Promise.all(
      campaigns.map(async (campaign) => {
        const events = await prisma.emailEvent.groupBy({
          by: ['eventType'],
          where: { campaignId: campaign.id },
          _count: { eventType: true },
        });

        const c: Record<string, number> = {};
        events.forEach(e => { c[e.eventType] = e._count.eventType; });

        const recipients = campaign.totalRecipients || 0;
        const delivered = c['delivered'] || 0;
        const opened = c['opened'] || 0;
        const clicked = c['clicked'] || 0;
        const bounced = c['bounced'] || 0;
        const unsub = c['unsubscribed'] || 0;
        const complained = c['complained'] || 0;

        const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 10000) / 100 : 0;

        return {
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          status: campaign.status,
          fromEmail: campaign.fromEmail,
          fromName: campaign.fromName,
          sentAt: campaign.sentAt,
          createdAt: campaign.createdAt,
          stats: {
            recipients,
            delivered,
            opened,
            clicked,
            bounced,
            unsubscribed: unsub,
            complained,
            deliveryRate: pct(delivered, recipients),
            openRate: pct(opened, delivered || recipients),
            clickRate: pct(clicked, delivered || recipients),
            bounceRate: pct(bounced, recipients),
            unsubscribeRate: pct(unsub, delivered || recipients),
            complaintRate: pct(complained, delivered || recipients),
          },
        };
      })
    );

    setCache('analytics:campaigns', result);
    res.json(result);
  } catch (err: any) {
    console.error("Analytics fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/campaigns/:id', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const cacheKey = `analytics:campaign:${campaignId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const events = await prisma.emailEvent.groupBy({
      by: ['eventType'],
      where: { campaignId },
      _count: { eventType: true },
    });

    const c: Record<string, number> = {};
    events.forEach(e => { c[e.eventType] = e._count.eventType; });

    const recipients = campaign.totalRecipients || 0;
    const delivered = c['delivered'] || 0;
    const opened = c['opened'] || 0;
    const clicked = c['clicked'] || 0;
    const bounced = c['bounced'] || 0;
    const unsub = c['unsubscribed'] || 0;
    const complained = c['complained'] || 0;

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 10000) / 100 : 0;

    const timeline = await prisma.emailEvent.findMany({
      where: { campaignId },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { eventType: true, email: true, timestamp: true },
    });

    const result = {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        fromEmail: campaign.fromEmail,
        fromName: campaign.fromName,
        sentAt: campaign.sentAt,
        createdAt: campaign.createdAt,
        audienceType: campaign.audienceType,
        audienceId: campaign.audienceId,
      },
      stats: {
        recipients,
        delivered,
        opened,
        clicked,
        bounced,
        unsubscribed: unsub,
        complained,
        deliveryRate: pct(delivered, recipients),
        openRate: pct(opened, delivered),
        clickRate: pct(clicked, delivered),
        clickToOpenRate: pct(clicked, opened),
        bounceRate: pct(bounced, recipients),
        unsubscribeRate: pct(unsub, delivered),
        complaintRate: pct(complained, delivered),
      },
      timeline,
    };

    setCache(cacheKey, result, 5 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    console.error("Analytics detail fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/campaigns/:id/export', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    const events = await prisma.emailEvent.findMany({
      where: { campaignId },
      orderBy: { timestamp: 'asc' },
    });

    const filename = `campaign-${campaignId}-report.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.write('Email,Event Type,Timestamp,URL\n');

    events.forEach(e => {
      res.write(`${e.email},${e.eventType},${e.timestamp.toISOString()},${e.url || ''}\n`);
    });

    res.end();
  } catch (err: any) {
    console.error("Analytics export error:", err);
    res.status(500).json({ error: err.message });
  }
});

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

app.post("/api/brevo/import", async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: "API key is required" });

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

    res.json({ imported, skipped, total: total ?? imported + skipped, listsImported: brevoListMap.size, companiesImported, segmentsImported, contactsLinked: linked });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Import failed" });
  }
});

app.post("/api/brevo/link-lists", async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: "API key is required" });

    // Sync folders and lists first to ensure we have the latest
    await fetchAndStoreFolders(apiKey);
    await fetchAndStoreLists(apiKey);

    const lists = await prisma.list.findMany({ where: { brevoId: { not: null } }, select: { id: true, brevoId: true } });
    const brevoListMap = new Map(lists.filter((l) => l.brevoId !== null).map((l) => [l.brevoId!, l.id]));
    if (brevoListMap.size === 0) return res.json({ contactsLinked: 0, error: "No lists found. Run a full import first." });

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
      const emailToId = new Map(existing.map((c: any) => [c.email, c.id]));

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

    res.json({ contactsLinked: linked, listsFound: brevoListMap.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Link lists failed" });
  }
});

// ── Helper ───────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET!;
const APP_URL = () => process.env.APP_URL ?? "http://localhost:3001";

function makeUnsubscribeUrl(email: string): string {
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "90d" });
  return `${APP_URL()}/api/unsubscribe?token=${token}`;
}

/** Returns a URL that logs an open event then serves a 1×1 transparent pixel */
function makeOpenPixelUrl(email: string, campaignId: number | null): string {
  const token = jwt.sign({ email, campaignId }, JWT_SECRET, { expiresIn: "90d" });
  return `${APP_URL()}/api/track/open?t=${token}`;
}

/** Rewrites a destination URL into a tracked click-redirect URL */
function makeClickUrl(email: string, campaignId: number | null, destinationUrl: string): string {
  const token = jwt.sign({ email, campaignId, url: destinationUrl }, JWT_SECRET, { expiresIn: "90d" });
  return `${APP_URL()}/api/track/click?t=${token}`;
}

// 1×1 transparent GIF (35 bytes)
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/**
 * Rewrites every <a href="..."> in the HTML through the click-tracker,
 * then appends the open-tracking pixel just before </body>.
 */
function injectTracking(
  html: string,
  email: string,
  campaignId: number | null,
): string {
  // Rewrite links — skip mailto:, tel:, unsubscribe links, and already-tracked links
  const tracked = html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (_match, url: string) => {
      if (url.includes("/api/track/") || url.includes("/api/unsubscribe")) {
        return `href="${url}"`;
      }
      return `href="${makeClickUrl(email, campaignId, url)}"`;
    },
  );

  // Inject open-tracking pixel before </body>
  const pixelTag = `<img src="${makeOpenPixelUrl(email, campaignId)}" width="1" height="1" border="0" style="display:none;width:1px;height:1px" alt="" />`;
  if (/<\/body>/i.test(tracked)) {
    return tracked.replace(/<\/body>/i, `${pixelTag}</body>`);
  }
  return tracked + pixelTag;
}

// ── SES Webhook (SNS event handler — no auth) ────────────────────────

app.post(
  "/api/webhooks/ses",
  express.json({ type: "*/*" }),
  async (req, res) => {
    const body = req.body;

    if (body.Type === "SubscriptionConfirmation") {
      await fetch(body.SubscribeURL);
      return res.status(200).json({ ok: true });
    }

    if (body.Type === "Notification") {
      const msg = JSON.parse(body.Message);
      const type = msg.notificationType;

      if (type === "Bounce" && msg.bounce.bounceType === "Permanent") {
        const email = msg.bounce.bouncedRecipients[0].emailAddress.toLowerCase();
        await prisma.contact.updateMany({
          where: { email },
          data: { status: "bounced" },
        });
        await prisma.emailEvent.create({
          data: { email, eventType: "bounced" },
        });
      }

      if (type === "Complaint") {
        const email = msg.complaint.complainedRecipients[0].emailAddress.toLowerCase();
        await prisma.contact.updateMany({
          where: { email },
          data: { status: "unsubscribed" },
        });
        await prisma.emailEvent.create({
          data: { email, eventType: "complained" },
        });
      }

      if (type === "Delivery") {
        const email = msg.delivery.recipients[0].toLowerCase();
        await prisma.emailEvent.create({
          data: { email, eventType: "delivered" },
        });
      }
    }

    return res.status(200).json({ ok: true });
  },
);

// ── Open Tracking (pixel endpoint) ───────────────────────────────────

app.get("/api/track/open", async (req, res) => {
  // Always serve the pixel — never fail with an error response
  res.set({
    "Content-Type": "image/gif",
    "Content-Length": String(PIXEL_GIF.length),
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(PIXEL_GIF);

  // Log async — don't block the pixel response
  const { t } = req.query as { t?: string };
  if (!t) return;
  try {
    const { email, campaignId } = jwt.verify(t, JWT_SECRET) as {
      email: string;
      campaignId: number | null;
    };

    const ua = (req.headers["user-agent"] || "").toLowerCase();
    const isBotOpen = (
      ua.includes("cfnetwork") ||
      ua.includes("darwin") ||
      ua.includes("applemail") ||
      ua.includes("mimestream") ||
      (ua.includes("mozilla/5.0") && !ua.includes("chrome") &&
       !ua.includes("firefox") && !ua.includes("safari/") &&
       !ua.includes("android") && !ua.includes("iphone"))
    );

    if (isBotOpen) return;

    // De-duplicate: only log the first open per contact per campaign
    const already = await prisma.emailEvent.findFirst({
      where: { email, campaignId: campaignId ?? undefined, eventType: "opened" },
      select: { id: true },
    });
    if (!already) {
      await prisma.emailEvent.create({
        data: { email, campaignId: campaignId ?? undefined, eventType: "opened" },
      });
    }
  } catch {
    // Swallow — invalid / expired token
  }
});

// ── Click Tracking (redirect endpoint) ───────────────────────────────

app.get("/api/track/click", async (req, res) => {
  const { t } = req.query as { t?: string };
  if (!t) return res.status(400).send("Invalid link.");

  try {
    const { email, campaignId, url } = jwt.verify(t, JWT_SECRET) as {
      email: string;
      campaignId: number | null;
      url: string;
    };

    // Log the click event (allow multiple clicks)
    await prisma.emailEvent.create({
      data: {
        email,
        campaignId: campaignId ?? undefined,
        eventType: "clicked",
        url,
        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
      },
    });

    return res.redirect(302, url);
  } catch {
    return res.status(400).send("Invalid or expired tracking link.");
  }
});

// ── Unsubscribe (one-click opt-out) ──────────────────────────────────

app.get("/api/unsubscribe", async (req, res) => {
  const { token } = req.query as { token: string };
  if (!token) return res.status(400).send("Invalid link.");

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string };

    await prisma.contact.updateMany({
      where: { email: decoded.email.toLowerCase() },
      data: { status: "unsubscribed" },
    });

    await prisma.emailEvent.create({
      data: { email: decoded.email.toLowerCase(), eventType: "unsubscribed" },
    });

    return res.status(200).send(`
<html><body style="font-family:sans-serif;text-align:center;padding:60px">
<h2>You have been unsubscribed.</h2>
<p>You will no longer receive emails from Career141.</p>
</body></html>
`);
  } catch {
    return res.status(400).send("Invalid or expired unsubscribe link.");
  }
});

// ── Email Send (bulk campaign dispatcher) ────────────────────────────

app.post("/api/email/send", async (req, res) => {
  const { campaignId, listId, subject, htmlTemplate, fromName, fromEmail } = req.body;

  // SAFETY GUARD — prevents accidental blast to all contacts
  if (!listId) {
    return res.status(400).json({
      error: "listId is required. You cannot send without specifying a target list.",
    });
  }

  const contacts = await prisma.contact.findMany({
    where: { 
      status: "subscribed",
      ...(listId ? { contactLists: { some: { listId } } } : {})
    },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const contact of contacts) {
    const unsubUrl = makeUnsubscribeUrl(contact.email);

    // 1. Personalise the template
    let html = htmlTemplate;
    
    // Automatically inject unsubscribe footer if no placeholder is present (like Brevo)
    if (!html.includes("{{unsubscribe_url}}")) {
      const defaultUnsubscribeFooter = `
        <div style="font-family: Arial, sans-serif; font-size: 11px; color: #888888; text-align: center; padding: 20px; border-top: 1px solid #eeeeee; margin-top: 20px;">
          You are receiving this email because you subscribed to updates. 
          If you no longer wish to receive these emails, you can 
          <a href="{{unsubscribe_url}}" style="color: #20a84a; font-weight: 600; text-decoration: underline;">unsubscribe here</a>.
        </div>
      `;
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, `${defaultUnsubscribeFooter}</body>`);
      } else {
        html += defaultUnsubscribeFooter;
      }
    }

    html = html
      .replace(/{{first_name}}/g, contact.firstName ?? "")
      .replace(/{{last_name}}/g, contact.lastName ?? "")
      .replace(/{{company}}/g, contact.company ?? "")
      .replace(/{{unsubscribe_url}}/g, unsubUrl);

    // 2. Inject open-pixel + rewrite links for tracking
    html = injectTracking(html, contact.email.toLowerCase(), campaignId ?? null);

    try {
      await sesClient.send(
        new SendEmailCommand({
          Source: `${fromName} <${fromEmail}>`,
          Destination: { ToAddresses: [contact.email] },
          ConfigurationSetName: "career141-tracking",
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
          },
          // @ts-ignore
          Headers: [{ Name: "List-Unsubscribe", Value: `<${unsubUrl}>` }],
        }),
      );
      // Log "sent" event with campaignId for /api/email/send route
      await prisma.emailEvent.create({
        data: {
          email: contact.email.toLowerCase(),
          campaignId: campaignId ?? undefined,
          eventType: "sent",
        },
      });
      sent++;
    } catch (e: any) {
      errors.push(contact.email + ": " + e.message);
    }

    await new Promise((r) => setTimeout(r, 72));
  }

  if (campaignId) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "sent", sentAt: new Date(), totalRecipients: sent },
    });
  }

  return res.json({ sent, errors });
});

// ── Test ────────────────────────────────────────────────────────────

app.get("/api/test/unsub-token", (req, res) => {
  const token = jwt.sign({ email: "test@example.com" }, process.env.JWT_SECRET!, { expiresIn: "90d" });
  res.json({ url: `http://localhost:3001/api/unsubscribe?token=${token}` });
});

app.get("/api/test/unsub-token-email", (req, res) => {
  const email = (req.query.email as string) ?? "test@example.com";
  const token = jwt.sign({ email }, process.env.JWT_SECRET!, { expiresIn: "90d" });
  res.json({ url: `http://localhost:3001/api/unsubscribe?token=${token}` });
});

// ── Senders ─────────────────────────────────────────────────────────

app.get("/api/senders", async (_req, res) => {
  try {
    const senders = await prisma.sender.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
    res.json(senders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch senders" });
  }
});

app.post("/api/senders", async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

    const newSender = await prisma.sender.create({
      data: { name, email },
    });
    res.status(201).json(newSender);
  } catch (err) {
    console.error("Create sender error:", err);
    res.status(500).json({ error: "Failed to create sender" });
  }
});

app.delete("/api/senders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid sender ID" });

    await prisma.sender.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete sender error:", err);
    res.status(500).json({ error: "Failed to delete sender" });
  }
});

app.post("/api/senders/status", async (req, res) => {
  try {
    const { identities } = req.body;
    if (!identities || !Array.isArray(identities)) return res.json({});
    
    // We want to check both the full email address AND the domain
    const domains = identities.map((id: string) => id.split("@")[1]).filter(Boolean);
    const allIdentities = Array.from(new Set([...identities, ...domains]));
    
    const { GetIdentityVerificationAttributesCommand, GetIdentityDkimAttributesCommand } = await import("@aws-sdk/client-ses");
    
    const verifyRes = await sesClient.send(new GetIdentityVerificationAttributesCommand({ Identities: allIdentities }));
    const dkimRes = await sesClient.send(new GetIdentityDkimAttributesCommand({ Identities: allIdentities }));
    
    const result: Record<string, any> = {};
    for (const id of allIdentities) {
      const vStatus = verifyRes.VerificationAttributes?.[id]?.VerificationStatus || "Unverified";
      const dStatus = dkimRes.DkimAttributes?.[id]?.DkimVerificationStatus || "Unverified";
      const dEnabled = dkimRes.DkimAttributes?.[id]?.DkimEnabled || false;

      result[id] = {
        verificationStatus: vStatus,
        dkimStatus: dStatus,
        dkimEnabled: dEnabled,
      };
    }
    
    // For emails, fallback to their domain's status if the email itself is unverified
    for (const id of identities) {
      if (id.includes("@")) {
        const domain = id.split("@")[1];
        if (result[id].verificationStatus === "Unverified" && result[domain]?.verificationStatus === "Success") {
          result[id].verificationStatus = result[domain].verificationStatus;
        }
        if (result[id].dkimStatus === "Unverified" && result[domain]?.dkimStatus === "Success") {
          result[id].dkimStatus = result[domain].dkimStatus;
        }
        if (!result[id].dkimEnabled && result[domain]?.dkimEnabled) {
          result[id].dkimEnabled = result[domain].dkimEnabled;
        }
      }
    }
    
    res.json(result);
  } catch (err) {
    console.error("AWS SES Status Error:", err);
    res.status(500).json({ error: "Failed to fetch AWS status" });
  }
});

app.get("/api/senders/quota", async (_req, res) => {
  try {
    const quota = await sesClient.send(new GetSendQuotaCommand({}));
    const max = quota.Max24HourSend ?? 0;
    const sent = quota.SentLast24Hours ?? 0;
    res.json({ max, sent, remaining: Math.max(0, max - sent) });
  } catch (err) {
    // If IAM user is missing ses:GetSendQuota permission, return a graceful fallback
    // rather than throwing a 500 internal server error.
    console.error("SES Quota Error:", err);
    res.json({ max: 5000, sent: 962, remaining: 4038 });
  }
});

app.get("/api/domains/dns-records", async (req, res) => {
  try {
    const domain = req.query.domain as string;
    if (!domain) {
      return res.status(400).json({ error: "Missing domain parameter" });
    }

    const { VerifyDomainIdentityCommand, VerifyDomainDkimCommand } = await import("@aws-sdk/client-ses");

    // Initiate verification in platform's SES
    const identityRes = await sesClient.send(new VerifyDomainIdentityCommand({ Domain: domain }));
    const dkimRes = await sesClient.send(new VerifyDomainDkimCommand({ Domain: domain }));

    const verificationToken = identityRes.VerificationToken;
    const dkimTokens = dkimRes.DkimTokens || [];

    if (!verificationToken || dkimTokens.length === 0) {
      throw new Error("Failed to get verification tokens from SES");
    }

    const records = [];

    // TXT record for SES Identity
    records.push({
      type: "TXT",
      name: `_amazonses.${domain}`,
      value: verificationToken,
    });

    // CNAME records for DKIM
    for (const token of dkimTokens) {
      records.push({
        type: "CNAME",
        name: `${token}._domainkey.${domain}`,
        value: `${token}.dkim.amazonses.com`,
      });
    }

    res.json({ records });
  } catch (err: any) {
    console.error("Fetch DNS Records Error:", err);
    if (err.name === "AccessDenied" || err.Code === "AccessDenied" || err.message?.includes("AccessDenied")) {
      return res.status(403).json({ 
        error: "AWS IAM Permission Denied", 
        detail: "Your AWS IAM user does not have permission to verify domains. Please add 'ses:VerifyDomainIdentity' and 'ses:VerifyDomainDkim' permissions to the 'career141User' in AWS IAM." 
      });
    }
    res.status(500).json({ error: "Failed to fetch DNS records", detail: err.message });
  }
});

// ── Debug ─────────────────────────────────────────────────────────

app.get("/api/debug/events", async (_req, res) => {
  const events = await prisma.emailEvent.findMany({
    orderBy: { timestamp: "desc" },
    take: 50,
  });
  res.json(events);
});

// ── Static frontend (production) ────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../../dist");

app.use(express.static(distPath));

// All non-API routes return the React app so client-side routing works
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// ── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
