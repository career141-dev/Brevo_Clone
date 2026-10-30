import { Router } from "express";
import { prisma } from "../prisma.js";
import { getCached, setCache } from "../lib/analytics-cache.js";
import contactsRouter from "./contacts.js";

export const crmRouter = Router();
const router = crmRouter;

// ── Contacts ────────────────────────────────────────────────────────

router.get("/api/contacts", async (req, res) => {
  try {
    const q = (req.query.q as string ?? "").toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    const listIdQuery = req.query.listId ? Number(req.query.listId) : undefined;
    const baseWhere: any = {};
    if (listIdQuery) {
      // Internal ids only: brevoId values collide with other lists' internal ids.
      const targetList = await prisma.list.findFirst({ where: { id: listIdQuery }, select: { id: true } });
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

router.get("/api/contacts/stats", async (req, res) => {
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
      // Internal ids only: brevoId values collide with other lists' internal ids.
      const matchingLists = await prisma.list.findMany({ where: { id: { in: targetIds } }, select: { id: true } });
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

    const cacheKey = `contacts:stats:${listIdsQuery || listIdQuery || 'global'}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const [total, subscribed, unsubscribed, bounced] = await Promise.all([
      prisma.contact.count({ where: baseWhere }),
      prisma.contact.count({ where: { ...baseWhere, status: "subscribed" } }),
      prisma.contact.count({ where: { ...baseWhere, status: "unsubscribed" } }),
      prisma.contact.count({ where: { ...baseWhere, status: "bounced" } }),
    ]);
    const result = { total, subscribed, unsubscribed, bounced };
    setCache(cacheKey, result, 15 * 1000);
    res.json(result);
  } catch (err) {
    console.error("=== Prisma Stats Error ===");
    console.error("Message:", (err as any).message);
    console.error("Stack:", (err as any).stack);
    if ((err as any).cause) console.error("Cause:", (err as any).cause);
    if ((err as any).code) console.error("Code:", (err as any).code);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/api/contacts/:id", async (req, res) => {
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

router.post("/api/contacts", async (req, res) => {
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
    res.status(500).json({ error: "Failed to create contact" });
  }
});

router.delete("/api/contacts/:id", async (req, res, next) => {
  // Non-numeric paths such as /bulk belong to the contacts router mounted below.
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    const id = Number(req.params.id);
    await prisma.contactList.deleteMany({ where: { contactId: id } });
    await prisma.contactAutomation.deleteMany({ where: { contactId: id } });
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

router.use("/api/contacts", contactsRouter);

// ── Lists ──────────────────────────────────────────────────────────

router.get("/api/lists", async (req, res) => {
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

router.post("/api/lists", async (req, res) => {
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
    res.status(500).json({ error: "Failed to create list." });
  }
});

router.put("/api/lists/:id", async (req, res) => {
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
    res.status(500).json({ error: "Failed to update list." });
  }
});

router.delete("/api/lists/:id", async (req, res) => {
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

router.get("/api/folders", async (_req, res) => {
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

router.post("/api/folders", async (req, res) => {
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
    res.status(500).json({ error: "Failed to create folder." });
  }
});

router.get("/api/automations", async (_req, res) => {
  try {
    const automations = await prisma.automation.findMany({ orderBy: { name: "asc" } });
    res.json(automations);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch automations" });
  }
});

router.get("/api/lists/stats", async (_req, res) => {
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

router.get("/api/companies", async (req, res) => {
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

router.get("/api/companies/stats", async (_req, res) => {
  try {
    const total = await prisma.company.count();
    res.json({ total });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch company stats" });
  }
});

// ── Segments ────────────────────────────────────────────────────────

router.get("/api/segments", async (_req, res) => {
  try {
    const segments = await prisma.segment.findMany({
      orderBy: { name: "asc" },
    });
    res.json(segments);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch segments" });
  }
});

router.get("/api/segments/stats", async (_req, res) => {
  try {
    const total = await prisma.segment.count();
    res.json({ total });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch segment stats" });
  }
});

// ── Templates ────────────────────────────────────────────────────────

// GET all templates
router.get("/api/templates", async (req, res) => {
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
router.get("/api/templates/:id", async (req, res) => {
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
router.post("/api/templates", async (req, res) => {
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
router.put("/api/templates/:id", async (req, res) => {
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
router.delete("/api/templates/:id", async (req, res) => {
  try {
    await prisma.template.delete({
      where: { id: Number(req.params.id) },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});
