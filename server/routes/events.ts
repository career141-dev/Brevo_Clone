import { Router } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { JWT_SECRET, PIXEL_GIF } from "../lib/tracking.js";
import { verifySnsMessage } from "../lib/sns.js";

export const eventsRouter = Router();
const router = eventsRouter;

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

router.post(
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
        await prisma.contact.updateMany({ where: { email }, data: { status: "complained" } });
        await recordEvent(email, campaignId, "complained");
      } else if (SNS_SIMPLE_EVENTS[type]) {
        await recordEvent(email, campaignId, SNS_SIMPLE_EVENTS[type]);
      }
    }

    return res.status(200).json({ ok: true });
  },
);

// ── Open Tracking (pixel endpoint) ───────────────────────────────────

router.get("/api/track/open", async (req, res) => {
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
    await recordEvent(email.toLowerCase(), campaignId, "opened");
  } catch {
    // Swallow — invalid / expired token
  }
});

// ── Click Tracking (redirect endpoint) ───────────────────────────────

router.get("/api/track/click", async (req, res) => {
  const { t } = req.query as { t?: string };
  if (!t) return res.status(400).send("Invalid link.");

  try {
    const { email, campaignId, url } = jwt.verify(t, JWT_SECRET) as {
      email: string;
      campaignId: number | null;
      url: string;
    };
    // Tracked links are always http(s); refuse javascript:, data: and the like even from a valid token.
    if (!/^https?:\/\//i.test(url)) return res.status(400).send("Invalid link.");

    // Log the click event (allow multiple clicks)
    await recordEvent(email.toLowerCase(), campaignId, "clicked", { url, userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null }, false);
    return res.redirect(302, url);
  } catch {
    return res.status(400).send("Invalid or expired tracking link.");
  }
});

// ── Unsubscribe (one-click opt-out) ──────────────────────────────────

// Unsubscribe: GET only shows a confirm button. Corporate link scanners (Safe Links, Mimecast) open every link in an
// email, so unsubscribing on GET silently removed people who never clicked. The change happens on POST only.
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const unsubscribePage = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>${title} - Career141</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: white; border-radius: 16px; padding: 48px 40px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 10px; }
    p { font-size: 15px; color: #6b7280; line-height: 1.6; }
    .email { font-weight: 600; color: #374151; }
    button { margin-top: 24px; background: #111827; color: white; border: 0; border-radius: 10px; padding: 12px 24px; font-size: 15px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body><div class="card"><h1>${title}</h1>${body}</div></body>
</html>`;

async function unsubscribe(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET) as { email: string; campaignId?: number | null };
  const email = decoded.email.toLowerCase();
  await prisma.contact.updateMany({ where: { email }, data: { status: "unsubscribed" } });
  await recordEvent(email, decoded.campaignId ?? null, "unsubscribed");
  return email;
}

router.get("/api/unsubscribe", async (req, res) => {
  const token = String(req.query.token ?? "");
  if (!token) return res.status(400).send("Invalid link.");
  try {
    const { email } = jwt.verify(token, JWT_SECRET) as { email: string };
    return res.status(200).send(unsubscribePage("Unsubscribe?", `
      <p>Stop sending marketing emails from Career141 to <span class="email">${escapeHtml(email)}</span>?</p>
      <form method="POST" action="/api/unsubscribe?token=${encodeURIComponent(token)}">
        <input type="hidden" name="confirm" value="1" />
        <button type="submit">Unsubscribe</button>
      </form>`));
  } catch {
    return res.status(400).send("Invalid or expired unsubscribe link.");
  }
});

// POST: the confirm button above (confirm=1, gets a page) and RFC 8058 one-click from Gmail/Apple Mail (gets "OK").
router.post("/api/unsubscribe", express.urlencoded({ extended: false }), async (req, res) => {
  const token = String(req.query.token || req.body?.token || "");
  if (!token) return res.status(400).send("Missing token.");
  try {
    const email = await unsubscribe(token);
    if (req.body?.confirm !== "1") return res.status(200).send("OK"); // RFC 8058: 200, no redirect
    return res.status(200).send(unsubscribePage("You've been unsubscribed", `
      <p>The email address <span class="email">${escapeHtml(email)}</span> has been removed from our mailing list. You will no longer receive marketing emails from Career141.</p>`));
  } catch {
    return res.status(400).send("Invalid or expired token.");
  }
});
