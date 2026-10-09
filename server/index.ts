import "dotenv/config";
import { Prisma } from "@prisma/client";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { z } from "zod";
import { GetSendQuotaCommand } from "@aws-sdk/client-ses";
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import jwt from "jsonwebtoken";
import { prisma, authStorage } from "./prisma.js";
import { sesClient } from "./lib/ses.js";
import { JWT_SECRET, PIXEL_GIF } from "./lib/tracking.js";
import { uploadsDir } from "./lib/paths.js";
import { verifySnsMessage } from "./lib/sns.js";
import { readUpload, saveUpload, usingObjectStorage } from "./lib/storage.js";
import { dailyQuotaRemaining, enqueueRecipients, isRunning, resolveAudience, resumeSendingCampaigns, runCampaign } from "./lib/campaign-sender.js";
import contactsRouter from "./routes/contacts.js";
import { UAParser } from "ua-parser-js";

const app = express();
const PORT = process.env.PORT ?? 3001;

// Required for Railway / reverse proxy environments — trusts the first proxy hop
// This allows express-rate-limit to correctly read X-Forwarded-For headers
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// With UPLOADS_BUCKET set files live in S3/R2 but keep the same public /uploads/<name> URLs.
app.get("/uploads/:name", async (req, res, next) => {
  if (!usingObjectStorage) return next();
  const data = await readUpload(req.params.name);
  if (!data) return res.status(404).end();
  res.type(path.extname(req.params.name)).set("Cache-Control", "public, max-age=31536000, immutable").send(data);
});
app.use("/uploads", express.static(uploadsDir));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  // Tracking pixels/links, unsubscribe and SNS webhooks come from recipients' (often shared) IPs and AWS —
  // limiting them silently drops opens/clicks/bounces. The progress poll is also exempt.
  skip: (req) => /^\/api\/(track|webhooks|unsubscribe)(\/|\?|$)/.test(req.originalUrl) || /^\/api\/campaigns\/\d+\/progress/.test(req.originalUrl),
  message: "Too many requests from this IP, please try again after 15 minutes"
});

app.use("/api/", apiLimiter);
// Auth: set CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY to require a signed-in Clerk user on every /api route except
// tracking/unsubscribe/webhooks (those are public by design). Optional ALLOWED_USER_IDS=id1,id2 restricts who may use
// the app (otherwise anyone who can sign up on your Clerk instance gets their own empty workspace and can send via SES).
// Without the keys the legacy single hardcoded user is used, exactly as before.
const LEGACY_USER_ID = "user_3Epvu1kcUczQTmQSvidHS9K4Wak";
const CLERK_ENABLED = Boolean(process.env.CLERK_SECRET_KEY);
const PUBLIC_API = /^\/api\/(track|unsubscribe|webhooks)(\/|\?|$)/;
const ALLOWED_USER_IDS = (process.env.ALLOWED_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!CLERK_ENABLED) console.warn("[AUTH] CLERK_SECRET_KEY not set: API is running UNAUTHENTICATED as a single fixed user.");
if (CLERK_ENABLED) app.use("/api/", clerkMiddleware());
app.use("/api/", (req: any, res: any, next: any) => {
  if (!CLERK_ENABLED) return authStorage.run({ userId: LEGACY_USER_ID }, next);
  if (PUBLIC_API.test(req.originalUrl)) return next();
  const userId = getAuth(req).userId;
  if (!userId || (ALLOWED_USER_IDS.length > 0 && !ALLOWED_USER_IDS.includes(userId))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  authStorage.run({ userId }, next);
});

// ■■ Analytics Cache (30s TTL for near-real-time data) ■■■■■■■■■■■
const analyticsCache = new Map<string, { data: any; expiresAt: number }>();
function getCached(key: string) {
  const entry = analyticsCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    analyticsCache.delete(key);
    return null;
  }
  return entry.data;
}
function setCache(key: string, data: any, ttlMs = 30 * 1000) {
  analyticsCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
function invalidateAnalyticsCache(campaignId?: number) {
  analyticsCache.delete('analytics:campaigns');
  if (campaignId) analyticsCache.delete(`analytics:campaign:${campaignId}`);
}

// POST /api/upload - Handle file upload and return public downloadable URL
app.post("/api/upload", async (req, res) => {
  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: "fileName and fileData required" });
    }

    const base64Data = fileData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const ext = path.extname(fileName) || ".bin";
    const safeName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueFileName = `${Date.now()}_${safeName}${ext}`;

    await saveUpload(uniqueFileName, buffer);

    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const fileUrl = `${protocol}://${host}/uploads/${uniqueFileName}`;

    res.json({
      url: fileUrl,
      fileName,
      size: buffer.length,
    });
  } catch (err: any) {
    console.error("File upload error:", err);
    res.status(500).json({ error: "Failed to upload file", details: err.message });
  }
});

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
    const listIdsQuery = req.query.listIds ? String(req.query.listIds) : undefined;
    const listIdQuery = req.query.listId ? Number(req.query.listId) : undefined;
    const baseWhere: any = {};

    let targetIds: number[] = [];
    if (listIdsQuery) {
      targetIds = listIdsQuery.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
    } else if (listIdQuery) {
      targetIds = [listIdQuery];
    }

    if (targetIds.length > 0) {
      const matchingLists = await prisma.list.findMany({
        where: {
          OR: [
            { id: { in: targetIds } },
            { brevoId: { in: targetIds } }
          ]
        },
        select: { id: true }
      });
      const resolvedListIds = matchingLists.map(l => l.id);
      if (resolvedListIds.length > 0) {
        baseWhere.contactLists = {
          some: {
            listId: { in: resolvedListIds },
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
        contentHtml: true,
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
    const {
      name,
      subject,
      previewText,
      fromName,
      fromEmail,
      replyToName,
      replyToEmail,
      replyToListId,
      templateHtml,
      audienceType,
      audienceId,
      audienceListIds,
      excludeListIds,
      individualEmails,
      skipUnengaged,
    } = req.body;

    if (!name || !subject || !fromName || !fromEmail) {
      return res.status(400).json({ error: "name, subject, fromName, fromEmail required" });
    }

    const formattedListIds = Array.isArray(audienceListIds) ? audienceListIds.join(",") : (audienceListIds || null);
    const formattedExcludeIds = Array.isArray(excludeListIds) ? excludeListIds.join(",") : (excludeListIds || null);

    const campaign = await prisma.campaign.create({
      data: {
        name,
        subject,
        previewText: previewText || null,
        fromName,
        fromEmail,
        replyToName: replyToName || null,
        replyToEmail: replyToEmail || null,
        replyToListId: replyToListId ? Number(replyToListId) : null,
        templateHtml: templateHtml || "",
        audienceType: audienceType || "list",
        audienceId: audienceId ? Number(audienceId) : 0,
        audienceListIds: formattedListIds,
        excludeListIds: formattedExcludeIds,
        individualEmails: individualEmails || null,
        skipUnengaged: Boolean(skipUnengaged),
        status: "draft",
      },
    });
    res.status(201).json(campaign);
  } catch (err: any) {
    console.error("Failed to create campaign draft:", err);
    res.status(500).json({ error: "Failed to create campaign draft", details: err.message });
  }
});

// PUT update campaign
app.put("/api/campaigns/:id", async (req, res) => {
  try {
    const {
      name,
      subject,
      previewText,
      fromName,
      fromEmail,
      replyToName,
      replyToEmail,
      replyToListId,
      templateHtml,
      audienceType,
      audienceId,
      audienceListIds,
      excludeListIds,
      individualEmails,
      skipUnengaged,
      status,
    } = req.body;
    
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (subject !== undefined) updateData.subject = subject;
    if (previewText !== undefined) updateData.previewText = previewText;
    if (fromName !== undefined) updateData.fromName = fromName;
    if (fromEmail !== undefined) updateData.fromEmail = fromEmail;
    if (replyToName !== undefined) updateData.replyToName = replyToName;
    if (replyToEmail !== undefined) updateData.replyToEmail = replyToEmail;
    if (replyToListId !== undefined) updateData.replyToListId = replyToListId ? Number(replyToListId) : null;
    if (templateHtml !== undefined) updateData.templateHtml = templateHtml;
    if (audienceType !== undefined) updateData.audienceType = audienceType;
    if (audienceId !== undefined) updateData.audienceId = Number(audienceId) || 0;
    if (audienceListIds !== undefined) {
      updateData.audienceListIds = Array.isArray(audienceListIds) ? audienceListIds.join(",") : audienceListIds;
    }
    if (excludeListIds !== undefined) {
      updateData.excludeListIds = Array.isArray(excludeListIds) ? excludeListIds.join(",") : excludeListIds;
    }
    if (individualEmails !== undefined) updateData.individualEmails = individualEmails;
    if (skipUnengaged !== undefined) updateData.skipUnengaged = Boolean(skipUnengaged);
    if (status !== undefined) updateData.status = status;

    const campaign = await prisma.campaign.update({
      where: { id: Number(req.params.id) },
      data: updateData,
    });
    res.json(campaign);
  } catch (err: any) {
    console.error("Failed to update campaign:", err);
    res.status(500).json({ error: "Failed to update campaign", details: err.message });
  }
});

// DELETE bulk campaigns
app.delete("/api/campaigns/bulk", async (req, res) => {
  try {
    const { campaignIds } = req.body;
    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      return res.status(400).json({ error: "campaignIds array is required" });
    }
    if (campaignIds.length > 100) {
      return res.status(400).json({ error: "Cannot delete more than 100 campaigns at once" });
    }
    
    // First delete associated email events
    await prisma.emailEvent.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.campaignRecipient.deleteMany({ where: { campaignId: { in: campaignIds } } });
    
    // Then delete campaigns
    const result = await prisma.campaign.deleteMany({
      where: { id: { in: campaignIds } },
    });
    
    res.json({ success: true, affected: result.count });
  } catch (err) {
    console.error("Bulk delete campaigns error:", err);
    res.status(500).json({ error: "Failed to delete campaigns" });
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
    // First delete associated email events to clean up
    await prisma.emailEvent.deleteMany({
      where: { campaignId: campaignId },
    });
    await prisma.campaignRecipient.deleteMany({ where: { campaignId } });
    
    // Then delete the campaign
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

// POST /api/campaigns/:id/send — snapshots the audience into campaign_recipients and hands it to the
// background sender (server/lib/campaign-sender.ts). Returns immediately; poll /progress for status.
app.post("/api/campaigns/:id/send", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status === "sent") return res.status(400).json({ error: "Campaign already sent" });
    if (isRunning(campaignId)) return res.status(202).json({ campaignId, status: "sending", alreadyRunning: true });

    if (campaign.audienceType !== "individual" && !campaign.audienceListIds && !campaign.audienceId && !campaign.individualEmails) {
      return res.status(400).json({ error: "No audience selected" });
    }
    if (!campaign.templateHtml) return res.status(400).json({ error: "No template selected" });

    // Snapshot before flipping to "sending" so a failure here can never leave a half-built audience being sent.
    const recipients = await resolveAudience(campaign);
    const total = recipients.length > 0
      ? await enqueueRecipients(campaignId, recipients)
      : await prisma.campaignRecipient.count({ where: { campaignId } });
    if (total === 0) {
      return res.status(400).json({
        error: "No target contacts found",
        details: "No subscribed recipient emails were found in the selected audience list or individual contacts. Please edit the campaign, add recipient emails, and try sending again.",
      });
    }

    // Fail fast instead of half-sending: SES rejects everything past the rolling 24h quota.
    const queued = await prisma.campaignRecipient.count({ where: { campaignId, status: "queued" } });
    const remaining = await dailyQuotaRemaining();
    if (remaining !== null && queued > remaining) {
      return res.status(400).json({
        error: "SES daily sending quota would be exceeded",
        details: `${queued} recipients are queued but only ${remaining} sends remain in your rolling 24-hour SES quota. Request a quota increase in AWS or send to a smaller audience.`,
      });
    }

    const flipped = await prisma.campaign.updateMany({
      where: { id: campaignId, status: { in: ["draft", "scheduled", "paused", "sending"] } },
      data: { status: "sending" },
    });
    if (flipped.count === 0) return res.status(400).json({ error: "Campaign is already sent" });

    void runCampaign(campaignId);
    res.status(202).json({ campaignId, status: "sending", total });
  } catch (err: any) {
    console.error("Send campaign error:", err);
    res.status(500).json({ error: "Failed to send campaign", details: err.message });
  }
});

// GET /api/campaigns/:id/progress — live send progress (cheap COUNT ... GROUP BY on campaign_recipients)
app.get("/api/campaigns/:id/progress", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const [campaign, groups] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } }),
      prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } }),
    ]);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    const counts: Record<string, number> = { queued: 0, sent: 0, failed: 0, skipped: 0 };
    for (const g of groups) counts[g.status] = g._count._all;
    res.json({ status: campaign.status, ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

// ── Analytics ───────────────────────────────────────────────────────

app.get('/api/analytics/campaigns', async (req, res) => {
  try {
    const cached = getCached('analytics:campaigns');
    if (cached) return res.json(cached);

    // Two queries total (was 1 + one full event-history load per campaign), aggregated in SQL.
    const [campaigns, rows] = await Promise.all([
      prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, subject: true, status: true, fromEmail: true, fromName: true, sentAt: true, createdAt: true, totalRecipients: true },
      }),
      prisma.$queryRaw<{ campaignId: number; eventType: string; uniq: bigint; total: bigint }[]>`
        SELECT campaignId, eventType, COUNT(DISTINCT email) AS uniq, COUNT(*) AS total
        FROM email_events WHERE campaignId IS NOT NULL
        GROUP BY campaignId, eventType`,
    ]);

    const byCampaign = new Map<number, Record<string, { uniq: number; total: number }>>();
    for (const r of rows) {
      const m = byCampaign.get(r.campaignId) ?? {};
      m[r.eventType] = { uniq: Number(r.uniq), total: Number(r.total) };
      byCampaign.set(r.campaignId, m);
    }

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 10000) / 100 : 0;

    const result = campaigns.map((campaign) => {
      const c = byCampaign.get(campaign.id) ?? {};
      const u = (type: string) => c[type]?.uniq ?? 0;
      const rawClicks = c['clicked']?.total ?? 0;
      const recipients = campaign.totalRecipients || 0;
      const delivered = u('delivered');
      const opened = u('opened');
      const clicked = u('clicked');
      const bounced = u('bounced');
      const unsub = u('unsubscribed');
      const complained = u('complained');

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
          clicked: rawClicks > 0 ? rawClicks : clicked,
          uniqueClicked: clicked,
          bounced,
          unsubscribed: unsub,
          complained,
          deliveryRate: pct(delivered, recipients),
          openRate: pct(opened, delivered || recipients),
          clickRate: pct(clicked, delivered || recipients),
          bounceRate: pct(bounced, recipients),
          unsubscribeRate: pct(unsub, delivered || recipients),
          complaintRate: pct(complained, delivered || recipients),
          clickToOpenRate: pct(clicked, opened),
        },
      };
    });

    setCache('analytics:campaigns', result, 30 * 1000);
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
      select: { id: true, name: true, subject: true, status: true, fromEmail: true, fromName: true, sentAt: true, createdAt: true, audienceType: true, audienceId: true, totalRecipients: true },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Totals, domains, links and time-to-open/click are aggregated in SQL; only opens/clicks are loaded as rows
    // (device/browser/timeline parsing needs them) instead of the campaign's entire event history.
    const [countRows, domainRows, linkRows, engagementEvents, avgRows, timeline] = await Promise.all([
      prisma.$queryRaw<{ eventType: string; uniq: bigint; total: bigint }[]>`
        SELECT eventType, COUNT(DISTINCT email) AS uniq, COUNT(*) AS total
        FROM email_events WHERE campaignId = ${campaignId} GROUP BY eventType`,
      prisma.$queryRaw<{ domain: string; eventType: string; n: bigint }[]>`
        SELECT LOWER(SUBSTRING_INDEX(email, '@', -1)) AS domain, eventType, COUNT(DISTINCT email) AS n
        FROM email_events
        WHERE campaignId = ${campaignId} AND eventType IN ('sent', 'delivered', 'opened', 'clicked', 'bounced')
        GROUP BY domain, eventType`,
      prisma.$queryRaw<{ url: string; n: bigint }[]>`
        SELECT url, COUNT(*) AS n FROM email_events
        WHERE campaignId = ${campaignId} AND eventType = 'clicked' AND url IS NOT NULL
        GROUP BY url ORDER BY n DESC LIMIT 10`,
      prisma.emailEvent.findMany({
        where: { campaignId, eventType: { in: ['opened', 'clicked'] } },
        select: { eventType: true, email: true, userAgent: true, timestamp: true },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.$queryRaw<{ avgOpen: any; avgClick: any }[]>`
        WITH s AS (SELECT LOWER(email) AS e, MIN(timestamp) AS t FROM email_events WHERE campaignId = ${campaignId} AND eventType = 'sent' GROUP BY LOWER(email)),
             o AS (SELECT LOWER(email) AS e, MIN(timestamp) AS t FROM email_events WHERE campaignId = ${campaignId} AND eventType = 'opened' GROUP BY LOWER(email)),
             c AS (SELECT LOWER(email) AS e, MIN(timestamp) AS t FROM email_events WHERE campaignId = ${campaignId} AND eventType = 'clicked' GROUP BY LOWER(email))
        SELECT
          (SELECT AVG(TIMESTAMPDIFF(MICROSECOND, s.t, o.t)) FROM s JOIN o ON o.e = s.e) AS avgOpen,
          (SELECT AVG(TIMESTAMPDIFF(MICROSECOND, COALESCE(o.t, s.t), c.t)) FROM c LEFT JOIN o ON o.e = c.e LEFT JOIN s ON s.e = c.e WHERE COALESCE(o.t, s.t) IS NOT NULL) AS avgClick`,
      prisma.emailEvent.findMany({
        where: { campaignId },
        orderBy: { timestamp: 'desc' },
        take: 50,
        select: { eventType: true, email: true, timestamp: true },
      }),
    ]);

    const c: Record<string, number> = {};
    for (const r of countRows) c[r.eventType] = Number(r.uniq);
    const rawClicks = Number(countRows.find((r) => r.eventType === 'clicked')?.total ?? 0);

    const domainStats: Record<string, { sent: number; delivered: number; opened: number; clicked: number; bounced: number }> = {};
    for (const r of domainRows) {
      if (!r.domain) continue;
      const d = (domainStats[r.domain] ??= { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 });
      d[r.eventType as 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced'] = Number(r.n);
    }
    const topDomains = Object.entries(domainStats)
      .sort((a, b) => b[1].sent - a[1].sent)
      .slice(0, 5)
      .map(([domain, stats]) => ({ domain, ...stats }));

    const topLinks = linkRows.map((r) => ({ url: r.url, count: Number(r.n) }));

    const parser = new UAParser();
    const devices = { desktop: 0, mobile: 0, tablet: 0, other: 0 };
    const browsers: Record<string, number> = {};
    const engagementTimelineMap: Record<string, { time: string; opens: number; clicks: number }> = {};
    const processedEngagement = new Set<string>();
    const engagementHeatmap = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));

    for (const e of engagementEvents) {
      engagementHeatmap[e.timestamp.getHours()].count++;

      if (e.userAgent) {
        // Deduplicate UA parsing per user action type so repeated clicks don't skew the split
        const uaKey = `${e.eventType}:${e.email}:${e.userAgent}`;
        if (!processedEngagement.has(uaKey)) {
          processedEngagement.add(uaKey);
          parser.setUA(e.userAgent);
          const result = parser.getResult();
          const deviceType = result.device.type || 'desktop';
          if (['mobile', 'tablet'].includes(deviceType)) {
            devices[deviceType as 'mobile' | 'tablet']++;
          } else if (['smarttv', 'console', 'wearable', 'embedded'].includes(deviceType)) {
            devices.other++;
          } else {
            devices.desktop++;
          }
          const browser = result.browser.name || 'Unknown';
          browsers[browser] = (browsers[browser] || 0) + 1;
        }
      }

      // Timeline: one entry per user action type per hour
      const hourString = e.timestamp.toISOString().substring(0, 13) + ':00:00.000Z';
      const tlKey = `${e.eventType}:${e.email}:${hourString}`;
      if (!processedEngagement.has(tlKey)) {
        processedEngagement.add(tlKey);
        if (!engagementTimelineMap[hourString]) {
          const timeLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', hour12: true }).format(new Date(hourString));
          engagementTimelineMap[hourString] = { time: timeLabel, opens: 0, clicks: 0 };
        }
        if (e.eventType === 'opened') engagementTimelineMap[hourString].opens++;
        if (e.eventType === 'clicked') engagementTimelineMap[hourString].clicks++;
      }
    }

    const topBrowsers = Object.entries(browsers)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const engagementTimeline = Object.entries(engagementTimelineMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(entry => entry[1]);

    const avgOpen = avgRows[0]?.avgOpen;
    const avgClick = avgRows[0]?.avgClick;
    const averageTimeToOpen = avgOpen != null ? Math.round(Number(avgOpen) / 1e6) : null;
    const averageTimeToClick = avgClick != null ? Math.round(Number(avgClick) / 1e6) : null;

    const unsub = c['unsubscribed'] || 0;
    const recipients = campaign.totalRecipients || 0;
    const delivered = c['delivered'] || 0;
    const opened = c['opened'] || 0;
    const clicked = c['clicked'] || 0;
    const bounced = c['bounced'] || 0;
    const complained = c['complained'] || 0;
    const rejected = c['rejected'] || 0;
    const renderingFailures = c['rendering_failure'] || 0;
    const delayed = c['delayed'] || 0;

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 10000) / 100 : 0;

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
        clicked: rawClicks > 0 ? rawClicks : clicked,
        uniqueClicked: clicked,
        bounced,
        unsubscribed: unsub,
        complained,
        rejected,
        renderingFailures,
        delayed,
        deliveryRate: pct(delivered, recipients),
        openRate: pct(opened, delivered),
        clickRate: pct(clicked, delivered),
        clickToOpenRate: pct(clicked, opened),
        bounceRate: pct(bounced, recipients),
        unsubscribeRate: pct(unsub, delivered),
        complaintRate: pct(complained, delivered),
        rejectedRate: pct(rejected, recipients),
        delayRate: pct(delayed, recipients),
      },
      timeline,
      advanced: {
        topLinks,
        devices,
        topBrowsers,
        engagementTimeline,
        topDomains,
        averageTimeToOpen,
        averageTimeToClick,
        engagementHeatmap,
      }
    };

    setCache(cacheKey, result, 30 * 1000);
    res.json(result);
  } catch (err: any) {
    console.error("Analytics detail fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/campaigns/:id/contact-events', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const q = (req.query.q as string || "").toLowerCase();

    // Find distinct emails matching the query (paginated)
    let emailCondition = Prisma.empty;
    if (q) {
      emailCondition = Prisma.sql`AND email LIKE ${'%' + q + '%'}`;
    }

    const countResult = await prisma.$queryRaw<any[]>`
      SELECT COUNT(DISTINCT email) as total
      FROM email_events
      WHERE campaignId = ${campaignId}
      ${emailCondition}
    `;
    const total = Number(countResult[0]?.total || 0);

    const distinctEmails = await prisma.$queryRaw<any[]>`
      SELECT email
      FROM email_events
      WHERE campaignId = ${campaignId}
      ${emailCondition}
      GROUP BY email
      ORDER BY MIN(timestamp) DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;

    const emails = distinctEmails.map((row: any) => row.email);

    let data: any[] = [];
    if (emails.length > 0) {
      // Fetch all events for these emails
      const events = await prisma.emailEvent.findMany({
        where: { campaignId, email: { in: emails } },
        orderBy: { timestamp: 'asc' },
        select: { eventType: true, email: true, timestamp: true, url: true, userAgent: true },
      });

      // Group events by email
      data = emails.map((email: string) => ({
        email,
        events: events.filter((e: any) => e.email === email),
      }));
    }

    res.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    console.error("Contact events fetch error:", err);
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

    const escapeCSV = (str: string) => {
      if (!str) return "";
      let escaped = String(str);
      // Formula injection mitigation
      if (/^[=+\-@\t\n\r]/.test(escaped)) {
        escaped = "'" + escaped;
      }
      // Handle commas, quotes, carriage returns and newlines
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
        escaped = `"${escaped.replace(/"/g, '""')}"`;
      }
      return escaped;
    };

    events.forEach(e => {
      res.write(`${escapeCSV(e.email)},${escapeCSV(e.eventType)},${e.timestamp.toISOString()},${escapeCSV(e.url || '')}\n`);
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
    const brevoListMap = new Map<number, number>(lists.filter((l) => l.brevoId !== null).map((l) => [l.brevoId!, l.id]));
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

    res.json({ contactsLinked: linked, listsFound: brevoListMap.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Link lists failed" });
  }
});

// ── SES Webhook (SNS event handler — authenticated by SNS message signature) ──

/** Inserts an event; returns false if an identical one-per-(type,campaign,email) event already exists. */
async function recordEvent(email: string, campaignId: number | null, eventType: string, extra: { url?: string; userAgent?: string | null } = {}, once = true) {
  try {
    await prisma.emailEvent.create({
      data: { email, campaignId, eventType, ...extra, dedupKey: once && campaignId ? `${eventType}:${campaignId}:${email}` : null },
    });
    return true;
  } catch (err: any) {
    if (err?.code === "P2002") return false;
    throw err;
  }
}

const SNS_SIMPLE_EVENTS: Record<string, string> = {
  Delivery: "delivered",
  Reject: "rejected",
  RenderingFailure: "rendering_failure",
  DeliveryDelay: "delayed",
};

app.post(
  "/api/webhooks/ses",
  express.json({ type: "*/*" }),
  async (req, res) => {
    const body = req.body;

    if (!(await verifySnsMessage(body))) {
      return res.status(403).json({ error: "Invalid SNS signature" });
    }

    if (body.Type === "SubscriptionConfirmation") {
      const url = body.SubscribeURL;
      if (typeof url === "string" && /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//.test(url)) {
        await fetch(url);
      }
      return res.status(200).json({ ok: true });
    }

    if (body.Type === "Notification") {
      const msg = JSON.parse(body.Message);
      // AWS SES uses `notificationType` for old format, `eventType` for new format
      const type: string = msg.notificationType || msg.eventType || "";

      const rawEmail =
        type === "Bounce" ? msg.bounce?.bouncedRecipients?.[0]?.emailAddress
        : type === "Complaint" ? msg.complaint?.complainedRecipients?.[0]?.emailAddress
        : type === "Delivery" ? msg.delivery?.recipients?.[0]
        : type === "DeliveryDelay" ? msg.deliveryDelay?.delayedRecipients?.[0]?.emailAddress
        : msg.mail?.destination?.[0];
      const email: string = typeof rawEmail === "string" ? rawEmail.toLowerCase() : "";
      if (!email) return res.status(200).json({ ok: true });

      let campaignId: number | null = msg.mail?.tags?.campaign_id?.[0]
        ? parseInt(msg.mail.tags.campaign_id[0], 10)
        : null;

      // Fallback: find most recent 'sent' event for this email
      if (!campaignId) {
        const recent = await prisma.emailEvent.findFirst({
          where: { email, eventType: "sent" },
          orderBy: { timestamp: "desc" },
        });
        if (recent) campaignId = recent.campaignId;
      }

      if (type === "Bounce" && msg.bounce?.bounceType === "Permanent") {
        await prisma.contact.updateMany({ where: { email }, data: { status: "bounced" } });
        await recordEvent(email, campaignId, "bounced");
      } else if (type === "Complaint") {
        await prisma.contact.updateMany({ where: { email }, data: { status: "unsubscribed" } });
        await recordEvent(email, campaignId, "complained");
      } else if (SNS_SIMPLE_EVENTS[type]) {
        await recordEvent(email, campaignId, SNS_SIMPLE_EVENTS[type]);
      }
      invalidateAnalyticsCache(campaignId ?? undefined);
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

    // Only the first open per contact per campaign is stored (unique dedupKey, race-free)
    if (await recordEvent(email.toLowerCase(), campaignId, "opened")) {
      invalidateAnalyticsCache(campaignId ?? undefined);
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
    await recordEvent(email.toLowerCase(), campaignId, "clicked", { url, userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null }, false);
    // Invalidate cache so analytics update quickly
    invalidateAnalyticsCache(campaignId ?? undefined);

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
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string; campaignId?: number | null };

    await prisma.contact.updateMany({
      where: { email: decoded.email.toLowerCase() },
      data: { status: "unsubscribed" },
    });

    await recordEvent(decoded.email.toLowerCase(), decoded.campaignId ?? null, "unsubscribed");

    // Invalidate analytics cache so stats update immediately
    invalidateAnalyticsCache(decoded.campaignId ?? undefined);

    return res.status(200).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribed - Career141</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: white; border-radius: 16px; padding: 48px 40px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { width: 64px; height: 64px; background: #f0fdf4; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 10px; }
    p { font-size: 15px; color: #6b7280; line-height: 1.6; }
    .email { font-weight: 600; color: #374151; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h1>You've been unsubscribed</h1>
    <p>The email address <span class="email">${decoded.email}</span> has been removed from our mailing list. You will no longer receive marketing emails from Career141.</p>
  </div>
</body>
</html>
`);
  } catch {
    return res.status(400).send("Invalid or expired unsubscribe link.");
  }
});

// ── RFC 8058 One-Click Unsubscribe (POST — used by Gmail/Apple Mail native button) ──
app.post("/api/unsubscribe", express.urlencoded({ extended: false }), async (req, res) => {
  // RFC 8058: email clients POST with List-Unsubscribe=One-Click body
  const token = (req.query.token || req.body?.token) as string;
  if (!token) return res.status(400).send("Missing token.");

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string; campaignId?: number | null };

    await prisma.contact.updateMany({
      where: { email: decoded.email.toLowerCase() },
      data: { status: "unsubscribed" },
    });

    await recordEvent(decoded.email.toLowerCase(), decoded.campaignId ?? null, "unsubscribed");

    invalidateAnalyticsCache(decoded.campaignId ?? undefined);
    // RFC 8058 requires a 200 OK with no redirect for POST
    return res.status(200).send("OK");
  } catch {
    return res.status(400).send("Invalid or expired token.");
  }
});

// ── Test endpoints removed for security ──────────────────────────────

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

app.post("/api/senders/sync", async (_req, res) => {
  try {
    const { ListIdentitiesCommand } = await import("@aws-sdk/client-ses");

    let allEmails: string[] = [];
    let nextToken: string | undefined = undefined;

    do {
      const listRes: any = await sesClient.send(
        new ListIdentitiesCommand({
          IdentityType: "EmailAddress",
          MaxItems: 100,
          NextToken: nextToken,
        })
      );
      allEmails = allEmails.concat(listRes.Identities ?? []);
      nextToken = listRes.NextToken;
    } while (nextToken);

    let synced = 0;
    for (const email of allEmails) {
      const existing = await prisma.sender.findUnique({ where: { email } });
      if (!existing) {
        await prisma.sender.create({
          data: {
            name: email.split("@")[0] || "Unknown",
            email,
          }
        });
        synced++;
      }
    }

    res.json({ synced });
  } catch (err: any) {
    console.error("Sync senders error:", err);
    if (err.name === "AccessDenied" || err.Code === "AccessDenied" || err.message?.includes("AccessDenied") || err.message?.includes("not authorized to perform: ses:ListIdentities")) {
      return res.status(403).json({ error: "AWS IAM Permission Denied", detail: "Missing ses:ListIdentities permission." });
    }
    res.status(500).json({ error: "Failed to sync senders", detail: err.message });
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
    res.status(403).json({ error: "Missing ses:GetSendQuota permission or AWS credentials invalid." });
  }
});

// ── Domains ─────────────────────────────────────────────────────────

// GET /api/domains — lists all domain identities from local DB
app.get("/api/domains", async (_req, res) => {
  try {
    const domains = await prisma.emailDomain.findMany({
      orderBy: { domain: "asc" }
    });
    res.json({ domains });
  } catch (err: any) {
    console.error("List domains error:", err);
    res.status(500).json({ error: "Failed to list domains", detail: err.message });
  }
});

app.post("/api/domains", async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "Domain is required" });

    const { VerifyDomainIdentityCommand, VerifyDomainDkimCommand } = await import("@aws-sdk/client-ses");
    await sesClient.send(new VerifyDomainIdentityCommand({ Domain: domain }));
    await sesClient.send(new VerifyDomainDkimCommand({ Domain: domain }));

    const newDomain = await prisma.emailDomain.upsert({
      where: { domain },
      update: {},
      create: { domain }
    });

    res.status(201).json(newDomain);
  } catch (err: any) {
    console.error("Add domain error:", err);
    res.status(500).json({ error: "Failed to add domain", detail: err.message });
  }
});

app.delete("/api/domains/:domain", async (req, res) => {
  try {
    const domain = req.params.domain;
    await prisma.emailDomain.delete({ where: { domain } });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete domain error:", err);
    res.status(500).json({ error: "Failed to delete domain", detail: err.message });
  }
});

app.post("/api/domains/sync", async (_req, res) => {
  try {
    const {
      ListIdentitiesCommand,
      GetIdentityVerificationAttributesCommand,
      GetIdentityDkimAttributesCommand,
    } = await import("@aws-sdk/client-ses");

    // Paginate through all domain identities in SES
    let allDomains: string[] = [];
    let nextToken: string | undefined = undefined;

    do {
      const listRes: any = await sesClient.send(
        new ListIdentitiesCommand({
          IdentityType: "Domain",
          MaxItems: 100,
          NextToken: nextToken,
        })
      );
      allDomains = allDomains.concat(listRes.Identities ?? []);
      nextToken = listRes.NextToken;
    } while (nextToken);

    if (allDomains.length > 0) {
      const chunkSize = 100;
      const verifyMap: Record<string, any> = {};
      const dkimMap: Record<string, any> = {};

      for (let i = 0; i < allDomains.length; i += chunkSize) {
        const chunk = allDomains.slice(i, i + chunkSize);
        const [vRes, dRes] = await Promise.all([
          sesClient.send(new GetIdentityVerificationAttributesCommand({ Identities: chunk })),
          sesClient.send(new GetIdentityDkimAttributesCommand({ Identities: chunk })),
        ]);
        Object.assign(verifyMap, vRes.VerificationAttributes ?? {});
        Object.assign(dkimMap, dRes.DkimAttributes ?? {});
      }

      for (const domain of allDomains) {
        await prisma.emailDomain.upsert({
          where: { domain },
          update: {
            verificationStatus: verifyMap[domain]?.VerificationStatus ?? "Unverified",
            dkimStatus: dkimMap[domain]?.DkimVerificationStatus ?? "Unverified",
            dkimEnabled: dkimMap[domain]?.DkimEnabled ?? false,
          },
          create: {
            domain,
            verificationStatus: verifyMap[domain]?.VerificationStatus ?? "Unverified",
            dkimStatus: dkimMap[domain]?.DkimVerificationStatus ?? "Unverified",
            dkimEnabled: dkimMap[domain]?.DkimEnabled ?? false,
          }
        });
      }
    }

    res.json({ synced: allDomains.length });
  } catch (err: any) {
    console.error("Sync domains error:", err);
    if (err.name === "AccessDenied" || err.Code === "AccessDenied" || err.message?.includes("AccessDenied")) {
      return res.status(403).json({ error: "AWS IAM Permission Denied", detail: "Missing ses:ListIdentities or ses:GetIdentityVerificationAttributes permissions." });
    }
    res.status(500).json({ error: "Failed to sync domains", detail: err.message });
  }
});

// GET /api/senders/aws-identities — lists all EMAIL identities registered in AWS SES
app.get("/api/senders/aws-identities", async (_req, res) => {
  try {
    const {
      ListIdentitiesCommand,
      GetIdentityVerificationAttributesCommand,
      GetIdentityDkimAttributesCommand,
    } = await import("@aws-sdk/client-ses");

    let allEmails: string[] = [];
    let nextToken: string | undefined = undefined;

    do {
      const listRes: any = await sesClient.send(
        new ListIdentitiesCommand({
          IdentityType: "EmailAddress",
          MaxItems: 100,
          NextToken: nextToken,
        })
      );
      allEmails = allEmails.concat(listRes.Identities ?? []);
      nextToken = listRes.NextToken;
    } while (nextToken);

    if (allEmails.length === 0) {
      return res.json({ identities: [] });
    }

    const chunkSize = 100;
    const verifyMap: Record<string, any> = {};
    const dkimMap: Record<string, any> = {};

    for (let i = 0; i < allEmails.length; i += chunkSize) {
      const chunk = allEmails.slice(i, i + chunkSize);
      const [vRes, dRes] = await Promise.all([
        sesClient.send(new GetIdentityVerificationAttributesCommand({ Identities: chunk })),
        sesClient.send(new GetIdentityDkimAttributesCommand({ Identities: chunk })),
      ]);
      Object.assign(verifyMap, vRes.VerificationAttributes ?? {});
      Object.assign(dkimMap, dRes.DkimAttributes ?? {});
    }

    const identities = allEmails.map((email) => ({
      email,
      verificationStatus: verifyMap[email]?.VerificationStatus ?? "Unverified",
      dkimStatus: dkimMap[email]?.DkimVerificationStatus ?? "Unverified",
      dkimEnabled: dkimMap[email]?.DkimEnabled ?? false,
    }));

    res.json({ identities });
  } catch (err: any) {
    console.error("List SES email identities error:", err);
    res.status(500).json({ error: "Failed to list SES email identities", detail: err.message });
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

    const records: { type: string; name: string; value: string }[] = [];

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

// ── Debug endpoints removed for security ────────────────────────────

// ── Billing & Costs ──────────────────────────────────────────────────

// AWS SES pricing: $0.10 per 1,000 emails
const SES_PRICE_PER_EMAIL_USD = 0.10 / 1000;

// GET /api/billing/exchange-rate — live USD → LKR rate (cached 5 min)
app.get("/api/billing/exchange-rate", async (_req, res) => {
  try {
    const cacheKey = "billing:exchange-rate";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    const data: any = await response.json();
    const lkrRate = data?.rates?.LKR ?? 300;
    const result = {
      usd_to_lkr: lkrRate,
      updated_at: new Date().toISOString(),
      source: "open.er-api.com",
    };
    setCache(cacheKey, result, 5 * 60 * 1000); // cache for 5 minutes
    res.json(result);
  } catch (err: any) {
    console.error("Exchange rate fetch error:", err);
    // Return a fallback rate if API fails
    res.json({ usd_to_lkr: 300, updated_at: new Date().toISOString(), source: "fallback" });
  }
});

// GET /api/billing/aws-costs — real cost data from AWS Cost Explorer
app.get("/api/billing/aws-costs", async (req, res) => {
  try {
    const range = (req.query.range as string) || "current_month";
    const now = new Date();
    
    // AWS Cost Explorer MONTHLY granularity requires Start and End to be exactly the 1st of the month.
    // The End date is exclusive.
    let startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    if (range === "last_30") {
      // For last 30 days, we'll span the previous month and current month
      startMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else if (range === "all_time") {
      // For all time, we go back exactly 12 months (maximum allowed by AWS by default)
      startMonth = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    }

    const formatYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const startDate = formatYMD(startMonth);
    const endDate = formatYMD(endMonth);

    const costClient = new CostExplorerClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const command = new GetCostAndUsageCommand({
      TimePeriod: { Start: startDate, End: endDate },
      Granularity: "MONTHLY",
      Filter: {
        Dimensions: {
          Key: "SERVICE",
          Values: ["Amazon Simple Email Service"],
        },
      },
      Metrics: ["UnblendedCost"],
    });

    const costData = await costClient.send(command);
    let totalCostUsd = 0;
    const monthlyBreakdown: any[] = [];

    for (const result of costData.ResultsByTime ?? []) {
      const amount = parseFloat(result.Total?.UnblendedCost?.Amount ?? "0");
      totalCostUsd += amount;
      monthlyBreakdown.push({
        period: result.TimePeriod?.Start,
        cost_usd: amount,
        unit: result.Total?.UnblendedCost?.Unit ?? "USD",
      });
    }

    res.json({
      total_cost_usd: totalCostUsd,
      range,
      period: { start: startDate, end: endDate },
      monthly_breakdown: monthlyBreakdown,
    });
  } catch (err: any) {
    console.error("AWS Cost Explorer error:", err);
    // If Cost Explorer access is denied or fails, return a graceful error
    if (err.name === "AccessDeniedException" || err.Code === "AccessDeniedException") {
      return res.status(403).json({
        error: "AWS Cost Explorer Access Denied",
        detail: "Please ensure the IAM user has 'ce:GetCostAndUsage' permission.",
      });
    }
    res.status(500).json({ error: "Failed to fetch AWS cost data", detail: err.message });
  }
});

// GET /api/billing/summary — SES-derived cost per campaign + totals
app.get("/api/billing/summary", async (req, res) => {
  try {
    const range = (req.query.range as string) || "current_month";
    const cacheKey = `billing:summary:${range}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    let dateFilter: any = undefined;

    if (range === "current_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { gte: startOfMonth };
    } else if (range === "last_30") {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter = { gte: thirtyDaysAgo };
    }
    // all_time: no filter

    const campaigns = await prisma.campaign.findMany({
      where: {
        ...(dateFilter ? { sentAt: dateFilter } : {}),
      },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        sentAt: true,
        createdAt: true,
        totalRecipients: true,
        fromEmail: true,
      },
    });

    const rows = campaigns.map((c) => {
      const emails = c.totalRecipients || 0;
      const costUsd = emails * SES_PRICE_PER_EMAIL_USD;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        sentAt: c.sentAt,
        createdAt: c.createdAt,
        fromEmail: c.fromEmail,
        emailsSent: emails,
        cost_usd: Math.round(costUsd * 10000) / 10000, // 4 decimal places
      };
    });

    const totalEmailsSent = rows.reduce((sum, r) => sum + r.emailsSent, 0);
    const totalCostUsd = rows.reduce((sum, r) => sum + r.cost_usd, 0);

    const result = {
      range,
      campaigns: rows,
      summary: {
        total_emails_sent: totalEmailsSent,
        total_cost_usd: Math.round(totalCostUsd * 10000) / 10000,
        campaign_count: rows.length,
        sent_campaign_count: rows.filter((r) => r.status === "sent").length,
      },
      pricing_note: "Calculated at $0.10 per 1,000 emails (AWS SES standard rate)",
    };

    setCache(cacheKey, result, 5 * 60 * 1000); // 5 min cache
    res.json(result);
  } catch (err: any) {
    console.error("Billing summary error:", err);
    res.status(500).json({ error: "Failed to fetch billing summary", detail: err.message });
  }
});

// ── Static frontend (production) ────────────────────────────────────

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

// Resume campaigns left in "sending" by a crash/redeploy. Only on deployed instances: a dev machine pointed at the
// production DB must never start sending someone else's campaign. ponytail: assumes ONE API instance; multiple
// instances would each pick up the same campaign (add a row-level claim before scaling out).
if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.ENABLE_SENDER_SWEEP) {
  const sweep = () => resumeSendingCampaigns().catch((e) => console.error("Sender sweep failed:", e));
  void sweep();
  setInterval(sweep, 60_000);
}
