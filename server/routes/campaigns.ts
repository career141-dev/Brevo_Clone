import { Router } from "express";
import { SendEmailCommand as SendEmailV2Command } from "@aws-sdk/client-sesv2";
import { prisma } from "../prisma.js";
import { sesv2Client } from "../lib/ses.js";
import { injectTracking, makeUnsubscribeUrl } from "../lib/tracking.js";
import { dispatchCampaign, formatEmailWithDisplayName, normalizeEmailHtml, personalize } from "../lib/campaign-sender.js";
import { getCached, setCache, invalidateAnalyticsCache } from "../lib/analytics-cache.js";

export const campaignsRouter = Router();
const router = campaignsRouter;

// ── Campaigns ────────────────────────────────────────────────────────

// GET campaign stats
router.get("/api/campaigns/stats", async (req, res) => {
  try {
    const cacheKey = 'campaigns:stats:global';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const [total, sent, draft, scheduled, sending] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: "sent" } }),
      prisma.campaign.count({ where: { status: "draft" } }),
      prisma.campaign.count({ where: { status: "scheduled" } }),
      prisma.campaign.count({ where: { status: "sending" } }),
    ]);
    const result = { total, sent, draft, scheduled, sending };
    setCache(cacheKey, result, 15 * 1000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaign stats" });
  }
});

// GET all campaigns. Read-only on purpose: the old "self-healing" here flipped live "sending" campaigns to "sent",
// which made the background sender stop mid-send whenever someone opened this page. Stuck sends are resumed by the
// sender sweep (resumeSendingCampaigns) instead.
router.get("/api/campaigns", async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

// GET single campaign by ID
router.get("/api/campaigns/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid campaign ID" });

    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    res.json(campaign);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

// POST create campaign draft
// The Individual Contacts tab sends "individual", but the database only stores list or segment. Individual campaigns are// identified by individualEmails, which the sender checks first.const dbAudienceType = (t?: string) => (!t || t === "individual" ? "list" : t);
// The Individual Contacts tab sends "individual", but the database only stores list or segment. Individual campaigns are
// identified by individualEmails, which the sender checks first.
const dbAudienceType = (t?: string) => (!t || t === "individual" ? "list" : t);

router.post("/api/campaigns", async (req, res) => {
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
        audienceType: dbAudienceType(audienceType),
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
    res.status(500).json({ error: "Failed to create campaign draft" });
  }
});

// PUT update campaign
router.put("/api/campaigns/:id", async (req, res) => {
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
    if (audienceType !== undefined) updateData.audienceType = dbAudienceType(audienceType);
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
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

// DELETE bulk campaigns
router.delete("/api/campaigns/bulk", async (req, res) => {
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
router.delete("/api/campaigns/:id", async (req, res) => {
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
router.post("/api/campaigns/:id/duplicate", async (req, res) => {
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
        replyToEmail: campaign.replyToEmail,
        replyToName: campaign.replyToName,
        replyToListId: campaign.replyToListId,
        previewText: campaign.previewText,
        templateHtml: campaign.templateHtml,
        audienceType: campaign.audienceType,
        audienceId: campaign.audienceId,
        audienceListIds: (campaign as any).audienceListIds,
        excludeListIds: (campaign as any).excludeListIds,
        individualEmails: (campaign as any).individualEmails,
        skipUnengaged: (campaign as any).skipUnengaged,
        status: "draft",
      },
    });
    res.status(201).json(copy);
  } catch (err) {
    res.status(500).json({ error: "Failed to duplicate campaign" });
  }
});

async function extractAttachmentsFromHtml(html: string): Promise<{ filename: string; content: Buffer; contentType: string }[]> {
  // With Cloudflare R2 & Custom Developed Attachment Cards, documents are hosted on CDN
  // and delivered via the interactive viewer card in the email body.
  // We skip raw MIME physical attachments to eliminate 700GB+ data transfer costs and bypass corporate 10MB spam filters.
  return [];
}

function createRawMimeEmail({
  from,
  to,
  replyTo,
  subject,
  html,
  unsubscribeUrl,
  attachments = [],
}: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  unsubscribeUrl?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}): Buffer {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  let raw = "";
  raw += `From: ${from}\r\n`;
  raw += `To: ${to}\r\n`;
  if (replyTo && replyTo.trim()) {
    raw += `Reply-To: ${replyTo.trim()}\r\n`;
  }
  raw += `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\n`;
  raw += `MIME-Version: 1.0\r\n`;
  if (unsubscribeUrl) {
    raw += `List-Unsubscribe: <${unsubscribeUrl}>\r\n`;
    raw += `List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n`;
  }

  if (attachments.length > 0) {
    raw += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    raw += `--${boundary}\r\n`;
    raw += `Content-Type: text/html; charset=UTF-8\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
    raw += Buffer.from(html).toString("base64") + "\r\n\r\n";

    for (const att of attachments) {
      raw += `--${boundary}\r\n`;
      raw += `Content-Type: ${att.contentType}; name="${att.filename}"\r\n`;
      raw += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
      raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
      raw += att.content.toString("base64") + "\r\n\r\n";
    }
    raw += `--${boundary}--\r\n`;
  } else {
    raw += `Content-Type: text/html; charset=UTF-8\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
    raw += Buffer.from(html).toString("base64") + "\r\n";
  }

  return Buffer.from(raw);
}

// POST /api/campaigns/:id/send — snapshots the audience into campaign_recipients and hands it to the background
// sender (server/lib/campaign-sender.ts). Responds immediately; progress is live in /progress and totalRecipients.
router.post("/api/campaigns/:id/send", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    if (isNaN(campaignId)) return res.status(400).json({ error: "Invalid campaign ID" });

    const result = await dispatchCampaign(campaignId, "send");
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error, ...(result.details ? { details: result.details } : {}) });
    }

    // Invalidate caches so UI immediately shows sending status
    invalidateAnalyticsCache(campaignId);

    res.json({
      success: true,
      message: `Campaign dispatch started for ${result.queued} contacts.`,
      campaignId,
      recipientCount: result.queued,
      status: "sending",
    });
  } catch (err: any) {
    console.error("Send campaign error:", err);
    res.status(500).json({ error: "Failed to send campaign", details: err.message });
  }
});

// GET /api/campaigns/:id/progress — live send progress (cheap COUNT ... GROUP BY on campaign_recipients)
router.get("/api/campaigns/:id/progress", async (req, res) => {
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

// POST /api/campaigns/:id/reset — Reset stuck campaign status
router.post("/api/campaigns/:id/reset", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    if (isNaN(campaignId)) return res.status(400).json({ error: "Invalid campaign ID" });

    const sentEventsCount = await prisma.emailEvent.count({
      where: { campaignId, eventType: "sent" },
    });

    const targetStatus = req.body?.targetStatus || (sentEventsCount > 0 ? "sent" : "draft");

    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: targetStatus,
        ...(sentEventsCount > 0 ? { totalRecipients: sentEventsCount } : {}),
      },
    });

    res.json({ success: true, campaign });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset campaign status" });
  }
});

// POST /api/campaigns/:id/resume — send to contacts that have not yet received this campaign (also for campaigns
// already marked "sent": new subscribers, or recipients cut off by the daily SES quota cap).
router.post("/api/campaigns/:id/resume", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    if (isNaN(campaignId)) return res.status(400).json({ error: "Invalid campaign ID" });

    const result = await dispatchCampaign(campaignId, "resume");
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error, ...(result.details ? { details: result.details } : {}) });
    }

    invalidateAnalyticsCache(campaignId);

    res.json({
      success: true,
      message: `Campaign resume started. Sending to ${result.queued} remaining contacts.`,
      campaignId,
      alreadySent: result.alreadySent,
      remainingToSend: result.queued,
      status: "sending",
    });
  } catch (err: any) {
    console.error("Resume campaign error:", err);
    res.status(500).json({ error: "Failed to resume campaign", details: err.message });
  }
});

// POST /api/campaigns/:id/send-test
router.post("/api/campaigns/:id/send-test", async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    const {
      testEmail,
      subject: reqSubject,
      fromName: reqFromName,
      fromEmail: reqFromEmail,
      replyToEmail: reqReplyToEmail,
      replyToListId: reqReplyToListId,
      templateHtml: reqTemplateHtml,
    } = req.body || {};

    if (!testEmail || !testEmail.trim() || !testEmail.includes("@")) {
      return res.status(400).json({ error: "Please provide a valid test email address." });
    }

    const cleanTestEmail = testEmail.trim().toLowerCase();

    // Fetch campaign if campaignId is valid
    let campaign: any = null;
    if (campaignId && campaignId > 0) {
      campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });
    }

    const subject = (reqSubject && String(reqSubject).trim()) || (campaign?.subject && String(campaign.subject).trim()) || "(No subject)";
    let fromName = (reqFromName && String(reqFromName).trim()) || (campaign?.fromName && String(campaign.fromName).trim()) || "";
    let fromEmail = (reqFromEmail && String(reqFromEmail).trim()) || (campaign?.fromEmail && String(campaign.fromEmail).trim()) || "";
    const templateHtml = (reqTemplateHtml && String(reqTemplateHtml).trim()) || (campaign?.templateHtml && String(campaign.templateHtml).trim()) || "";
    const replyToEmail = reqReplyToEmail !== undefined ? reqReplyToEmail : (campaign?.replyToEmail ?? null);
    const replyToListId = reqReplyToListId !== undefined ? reqReplyToListId : (campaign?.replyToListId ?? null);

    // If fromEmail is missing or invalid, lookup configured senders in database
    if (!fromEmail || !fromEmail.includes("@")) {
      const dbSender = await prisma.sender.findFirst();

      if (dbSender && dbSender.email && dbSender.email.includes("@")) {
        fromEmail = dbSender.email.trim();
        if (!fromName) fromName = dbSender.name?.trim() || "Default Sender";
      }
    }

    if (!fromEmail || !fromEmail.includes("@")) fromEmail = process.env.SES_FROM_EMAIL ?? "";
    if (!fromEmail) return res.status(400).json({ error: "No sender address configured." });
    if (!fromName) fromName = process.env.SES_FROM_NAME ?? "Career141";
    if (!templateHtml || !templateHtml.trim()) {
      return res.status(400).json({ error: "No email template selected to test." });
    }

    // Check if testEmail matches a contact in the database
    const dbContact = await prisma.contact.findFirst({
      where: { email: cleanTestEmail },
    });

    // Prepare template HTML with placeholders, normalize relative document/image URLs & fallback unsubscribe URL
    let template = normalizeEmailHtml(templateHtml);
    if (!template.includes("{{unsubscribe_url}}")) {
      const fallbackUnsubHtml = `<div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; font-family: sans-serif; font-size: 12px; color: #666;"><p>This is a test email. <a href="{{unsubscribe_url}}" style="color: #0070f3; text-decoration: underline;">Unsubscribe link test</a></p></div>`;
      if (/<\/body>/i.test(template)) {
        template = template.replace(/<\/body>/i, `${fallbackUnsubHtml}</body>`);
      } else {
        template += fallbackUnsubHtml;
      }
    }

    const unsubUrl = makeUnsubscribeUrl(cleanTestEmail, campaignId || null);

    let html = personalize(
      template,
      { ...dbContact, email: cleanTestEmail, company: dbContact?.company || "Test Company", designation: dbContact?.designation || "Tester" },
      unsubUrl,
    );

    // Inject tracking pixel & link rewrite
    html = injectTracking(html, cleanTestEmail, campaignId || null);

    // Resolve Reply-To addresses
    const replyToEmailsSet = new Set<string>();
    if (replyToEmail) {
      String(replyToEmail)
        .split(",")
        .map((e: string) => e.trim())
        .filter((e: string) => e.includes("@"))
        .forEach((e) => replyToEmailsSet.add(e.toLowerCase()));
    }
    if (replyToListId) {
      try {
        const listContacts = await prisma.contact.findMany({
          where: {
            status: "subscribed",
            contactLists: { some: { listId: Number(replyToListId) } },
          },
          select: { email: true },
        });
        listContacts.forEach((c) => {
          if (c.email && c.email.includes("@")) replyToEmailsSet.add(c.email.trim().toLowerCase());
        });
      } catch (err) {
        console.error("Failed to fetch replyToListId contacts for test email:", err);
      }
    }
    const replyToAddresses = Array.from(replyToEmailsSet);
    const replyToHeader = replyToAddresses.join(", ");
    const fromHeader = formatEmailWithDisplayName(fromName, fromEmail);
    const campaignAttachments = await extractAttachmentsFromHtml(html);

    const testSubject = `[TEST] ${subject}`;

    if (campaignAttachments.length > 0) {
      const rawMimeBuffer = createRawMimeEmail({
        from: fromHeader,
        to: cleanTestEmail,
        replyTo: replyToHeader,
        subject: testSubject,
        html,
        unsubscribeUrl: unsubUrl,
        attachments: campaignAttachments,
      });

      await sesv2Client.send(new SendEmailV2Command({
        FromEmailAddress: fromHeader,
        Destination: { ToAddresses: [cleanTestEmail] },
        ReplyToAddresses: replyToAddresses.length > 0 ? replyToAddresses : undefined,
        Content: { Raw: { Data: rawMimeBuffer } },
        EmailTags: campaignId ? [{ Name: "campaign_id", Value: campaignId.toString() }] : [],
      }));
    } else {
      const sesParams: any = {
        FromEmailAddress: fromHeader,
        Destination: { ToAddresses: [cleanTestEmail] },
        ReplyToAddresses: replyToAddresses.length > 0 ? replyToAddresses : undefined,
        ConfigurationSetName: "career141-tracking",
        Content: {
          Simple: {
            Subject: { Data: testSubject, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
            Headers: [
              { Name: "List-Unsubscribe", Value: `<${unsubUrl}>` },
              { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
            ],
          },
        },
        EmailTags: campaignId ? [{ Name: "campaign_id", Value: campaignId.toString() }] : [],
      };

      await sesv2Client.send(new SendEmailV2Command(sesParams));
    }

    return res.json({
      success: true,
      message: `Test email successfully sent to ${cleanTestEmail}`,
      testEmail: cleanTestEmail,
    });
  } catch (err: any) {
    console.error("Send test campaign error:", err);
    return res.status(500).json({
      error: "Failed to send test email",
      details: err.message || "An unexpected error occurred while sending test email via SES.",
    });
  }
});
