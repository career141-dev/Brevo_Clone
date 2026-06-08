import { Router, Request, Response } from "express";
import { prisma } from "../prisma.js";

const router = Router();

// PUT /api/contacts/:id — update single contact
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid contact ID" });

    const r = req.body;
    const trim = (v: any) => (typeof v === "string" ? v.trim() || null : undefined);

    const data: Record<string, any> = {};
    const fields = [
      "email", "firstName", "lastName", "fullName", "phone", "company",
      "designation", "industry", "website", "country", "city", "address",
      "linkedin", "twitter", "facebook", "whatsapp", "sms", "notes",
      "source", "status", "tags", "ownerId",
    ];
    for (const f of fields) {
      if (f in r) {
        data[f] = f === "status" ? r[f] : trim(r[f]);
      }
    }
    if ("blocked" in r) data.blocked = Boolean(r.blocked);

    // Normalize email to lowercase for consistent webhook matching
    if (data.email && typeof data.email === "string") {
      data.email = data.email.toLowerCase().trim();
    }

    const contact = await prisma.contact.update({ where: { id }, data });
    res.json(contact);
  } catch (err: any) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Contact not found" });
    console.error("Update contact error:", err);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// PATCH /api/contacts/bulk/blocklist — set blocked=true for contactIds[]
router.patch("/bulk/blocklist", async (req: Request, res: Response) => {
  try {
    const { contactIds, blocked } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds array is required" });
    }
    const result = await prisma.contact.updateMany({
      where: { id: { in: contactIds.map(Number) } },
      data: { blocked: Boolean(blocked) },
    });
    res.json({ success: true, affected: result.count });
  } catch (err) {
    console.error("Blocklist error:", err);
    res.status(500).json({ error: "Failed to update blocklist status" });
  }
});

// POST /api/contacts/bulk/lists — add contacts to lists
router.post("/bulk/lists", async (req: Request, res: Response) => {
  try {
    const { contactIds, listIds } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds array is required" });
    }
    if (!Array.isArray(listIds) || listIds.length === 0) {
      return res.status(400).json({ error: "listIds array is required" });
    }

    const data = contactIds.flatMap((cid: number) =>
      listIds.map((lid: number) => ({ contactId: Number(cid), listId: Number(lid) }))
    );

    const result = await prisma.contactList.createMany({ data, skipDuplicates: true });
    res.json({ success: true, affected: result.count });
  } catch (err) {
    console.error("Add to lists error:", err);
    res.status(500).json({ error: "Failed to add contacts to lists" });
  }
});

// POST /api/contacts/bulk/assign — assign owner
router.post("/bulk/assign", async (req: Request, res: Response) => {
  try {
    const { contactIds, ownerId } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds array is required" });
    }
    if (!ownerId || typeof ownerId !== "string") {
      return res.status(400).json({ error: "ownerId string is required" });
    }

    const result = await prisma.contact.updateMany({
      where: { id: { in: contactIds.map(Number) } },
      data: { ownerId },
    });
    res.json({ success: true, affected: result.count });
  } catch (err) {
    console.error("Assign error:", err);
    res.status(500).json({ error: "Failed to assign contacts" });
  }
});

// POST /api/contacts/export — stream CSV or JSON file
router.post("/export", async (req: Request, res: Response) => {
  try {
    const { contactIds, format } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds array is required" });
    }
    if (!["csv", "json"].includes(format)) {
      return res.status(400).json({ error: "format must be 'csv' or 'json'" });
    }

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds.map(Number) } },
      orderBy: { id: "asc" },
    });

    res.setHeader("Content-Disposition", `attachment; filename="contacts.${format}"`);

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.json(contacts);
    } else {
      res.setHeader("Content-Type", "text/csv");
      const headers = [
        "id", "email", "firstName", "lastName", "fullName", "phone",
        "company", "designation", "status", "blocked", "tags",
        "ownerId", "createdAt",
      ];
      const escape = (v: any) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const rows = [
        headers.map((h) => escape(h)).join(","),
        ...contacts.map((c: any) =>
          headers.map((h) => escape(c[h])).join(",")
        ),
      ];
      res.send(rows.join("\n"));
    }
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Failed to export contacts" });
  }
});

// POST /api/contacts/bulk/automation — enroll contacts in workflow
router.post("/bulk/automation", async (req: Request, res: Response) => {
  try {
    const { contactIds, workflowId } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds array is required" });
    }
    if (!workflowId) {
      return res.status(400).json({ error: "workflowId is required" });
    }

    const data = contactIds.map((cid: number) => ({
      contactId: Number(cid),
      automationId: Number(workflowId),
    }));

    const result = await prisma.contactAutomation.createMany({ data, skipDuplicates: true });
    res.json({ success: true, affected: result.count });
  } catch (err) {
    console.error("Automation enrollment error:", err);
    res.status(500).json({ error: "Failed to enroll contacts in automation" });
  }
});

// DELETE /api/contacts/bulk — hard delete contacts
router.delete("/bulk", async (req: Request, res: Response) => {
  try {
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds array is required" });
    }

    const result = await prisma.contact.deleteMany({
      where: { id: { in: contactIds.map(Number) } },
    });
    res.json({ success: true, affected: result.count });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ error: "Failed to delete contacts" });
  }
});

export default router;
