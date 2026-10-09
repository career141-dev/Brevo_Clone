import path from "node:path";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { GetSendQuotaCommand } from "@aws-sdk/client-ses";
import { prisma } from "../prisma.js";
import { sesClient, sesv2Client } from "./ses.js";
import { injectTracking, makeUnsubscribeUrl } from "./tracking.js";
import { readUpload } from "./storage.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const THROTTLE_ERRORS = ["TooManyRequestsException", "ThrottlingException", "Throttling"];
const ACCOUNT_ERRORS = ["SendingPausedException", "AccountSuspendedException", "MailFromDomainNotVerifiedException"];

// "Unengaged" = got >= UNENGAGED_MIN_SENDS emails in the last UNENGAGED_DAYS days and never opened/clicked.
const UNENGAGED_MIN_SENDS = 3;
const UNENGAGED_DAYS = 90;

type Attachment = { filename: string; base64: string; contentType: string };

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

/** Reads uploaded files referenced in the HTML once and base64-encodes them once for the whole send. */
async function extractAttachmentsFromHtml(html: string): Promise<Attachment[]> {
  const attachments: Attachment[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/\/uploads\/([^"'\s>]+)/g)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    try {
      const data = await readUpload(name);
      if (!data) continue;
      const filename = name.replace(/^\d+_/, "");
      attachments.push({
        filename,
        base64: data.toString("base64"),
        contentType: CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream",
      });
    } catch (err) {
      console.error("Failed to read attachment file:", name, err);
    }
  }
  return attachments;
}

function createRawMimeEmail(p: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  unsubscribeUrl: string;
  attachments: Attachment[];
}): Buffer {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  let raw = `From: ${p.from}\r\nTo: ${p.to}\r\n`;
  if (p.replyTo?.trim()) raw += `Reply-To: ${p.replyTo.trim()}\r\n`;
  raw += `Subject: =?UTF-8?B?${Buffer.from(p.subject).toString("base64")}?=\r\n`;
  raw += `MIME-Version: 1.0\r\n`;
  raw += `List-Unsubscribe: <${p.unsubscribeUrl}>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n`;
  raw += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
  raw += `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
  raw += Buffer.from(p.html).toString("base64") + "\r\n\r\n";
  for (const att of p.attachments) {
    raw += `--${boundary}\r\nContent-Type: ${att.contentType}; name="${att.filename}"\r\n`;
    raw += `Content-Disposition: attachment; filename="${att.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
    raw += att.base64 + "\r\n\r\n";
  }
  raw += `--${boundary}--\r\n`;
  return Buffer.from(raw);
}

function formatEmailWithDisplayName(name: string | null | undefined, email: string): string {
  const cleanEmail = email.trim();
  if (!name?.trim()) return cleanEmail;
  return `"${name.trim().replace(/"/g, "")}" <${cleanEmail}>`;
}

const UNSUB_FALLBACK = `<div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; font-family: sans-serif; font-size: 12px; color: #666;"><p>If you wish to unsubscribe, you can <a href="{{unsubscribe_url}}" style="color: #0070f3; text-decoration: underline;">unsubscribe here</a>.</p></div>`;

type Person = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  company?: string | null;
  designation?: string | null;
};

function personalize(template: string, c: Person, unsubUrl: string): string {
  const rawFirst = (c.firstName || "").trim();
  const rawLast = (c.lastName || "").trim();
  const rawFull = (c.fullName || "").trim();
  const emailPrefix = c.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const vars: Record<string, string> = {
    first_name: rawFirst || (rawFull ? rawFull.split(" ")[0] : emailPrefix),
    last_name: rawLast || (rawFull.includes(" ") ? rawFull.split(" ").slice(1).join(" ") : ""),
    full_name: rawFull || (rawFirst ? `${rawFirst} ${rawLast}`.trim() : emailPrefix),
    company: (c.company || "").trim(),
    designation: (c.designation || "").trim(),
    email: c.email,
    unsubscribe_url: unsubUrl,
  };
  // Single pass with a function replacer: contact values containing "$&" etc. can't be misread as patterns.
  return template.replace(/{{(first_name|last_name|full_name|company|designation|email|unsubscribe_url)}}/g, (_m, k) => vars[k]);
}

/** Subscribed contacts of the selected audience, deduplicated by lowercase email. */
export async function resolveAudience(campaign: any): Promise<{ contactId: number | null; email: string }[]> {
  const ids = (s: string | null) =>
    String(s ?? "").split(",").map((x) => Number(x.trim())).filter((n) => !isNaN(n) && n > 0);
  const targetListIds = campaign.audienceListIds ? ids(campaign.audienceListIds) : campaign.audienceId ? [campaign.audienceId] : [];
  const excludeListIds = ids(campaign.excludeListIds);

  const out = new Map<string, { contactId: number | null; email: string }>();

  if (campaign.audienceType === "individual" || campaign.individualEmails) {
    const wanted = String(campaign.individualEmails || "").split(",").map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
    if (wanted.length > 0) {
      // Look up contacts of ANY status so unsubscribed/bounced addresses stay suppressed instead of being treated as "unknown".
      const known = await prisma.contact.findMany({ where: { email: { in: wanted } }, select: { id: true, email: true, status: true } });
      const byEmail = new Map<string, { id: number; status: string }>(known.map((c: any) => [c.email.toLowerCase(), c]));
      for (const email of wanted) {
        const c = byEmail.get(email);
        if (c && c.status !== "subscribed") continue;
        out.set(email, { contactId: c?.id ?? null, email });
      }
    }
  } else {
    const contacts = await prisma.contact.findMany({
      where: {
        status: "subscribed",
        contactLists: {
          some: { listId: { in: targetListIds } },
          ...(excludeListIds.length > 0 ? { none: { listId: { in: excludeListIds } } } : {}),
        },
      },
      select: { id: true, email: true },
    });
    for (const c of contacts) out.set(c.email.toLowerCase(), { contactId: c.id, email: c.email.toLowerCase() });
  }

  if (campaign.skipUnengaged && out.size > 0) {
    const since = new Date(Date.now() - UNENGAGED_DAYS * 86400_000);
    const rows = await prisma.$queryRaw<{ email: string }[]>`
      SELECT email FROM email_events WHERE timestamp >= ${since}
      GROUP BY email
      HAVING SUM(eventType = 'sent') >= ${UNENGAGED_MIN_SENDS} AND SUM(eventType IN ('opened', 'clicked')) = 0`;
    for (const r of rows) out.delete(r.email.toLowerCase());
  }

  return [...out.values()];
}

/** Snapshots the audience into campaign_recipients (idempotent) and re-queues previously failed rows. */
export async function enqueueRecipients(campaignId: number, recipients: { contactId: number | null; email: string }[]) {
  for (let i = 0; i < recipients.length; i += 1000) {
    await prisma.campaignRecipient.createMany({
      data: recipients.slice(i, i + 1000).map((r) => ({ campaignId, contactId: r.contactId, email: r.email })),
      skipDuplicates: true,
    });
  }
  await prisma.campaignRecipient.updateMany({ where: { campaignId, status: "failed" }, data: { status: "queued", error: null } });
  return prisma.campaignRecipient.count({ where: { campaignId } });
}

async function sendRate(): Promise<number> {
  try {
    const q = await sesClient.send(new GetSendQuotaCommand({}));
    return Math.max(1, Math.min(100, Math.floor((q.MaxSendRate ?? 14) * 0.9)));
  } catch {
    return 10;
  }
}

/** Remaining SES rolling-24h quota, or null if unlimited/unreadable (e.g. missing ses:GetSendQuota permission). */
export async function dailyQuotaRemaining(): Promise<number | null> {
  try {
    const q = await sesClient.send(new GetSendQuotaCommand({}));
    if (q.Max24HourSend === undefined || q.Max24HourSend < 0) return null;
    return Math.max(0, q.Max24HourSend - (q.SentLast24Hours ?? 0));
  } catch {
    return null;
  }
}

const running = new Set<number>();
export const isRunning = (campaignId: number) => running.has(campaignId);

export async function runCampaign(campaignId: number) {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  try {
    await processCampaign(campaignId);
  } catch (err) {
    // Campaign stays "sending"; the periodic sweep in resumeSendingCampaigns() picks it up again.
    console.error(`[SEND][Campaign ${campaignId}] worker error:`, err);
  } finally {
    running.delete(campaignId);
  }
}

export async function resumeSendingCampaigns() {
  const stuck = await prisma.campaign.findMany({ where: { status: "sending" }, select: { id: true } });
  for (const c of stuck) void runCampaign(c.id);
}

async function processCampaign(campaignId: number) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== "sending") return;

  let template: string = campaign.templateHtml;
  if (!template.includes("{{unsubscribe_url}}")) {
    template = /<\/body>/i.test(template) ? template.replace(/<\/body>/i, `${UNSUB_FALLBACK}</body>`) : template + UNSUB_FALLBACK;
  }
  const attachments = await extractAttachmentsFromHtml(template);

  const replyTo = new Set<string>();
  String(campaign.replyToEmail ?? "").split(",").map((e) => e.trim()).filter((e) => e.includes("@")).forEach((e) => replyTo.add(e.toLowerCase()));
  if (campaign.replyToListId) {
    const rows = await prisma.contact.findMany({
      where: { status: "subscribed", contactLists: { some: { listId: Number(campaign.replyToListId) } } },
      select: { email: true },
    });
    rows.forEach((c: any) => c.email?.includes("@") && replyTo.add(c.email.trim().toLowerCase()));
  }
  const replyToAddresses = [...replyTo];
  const fromHeader = formatEmailWithDisplayName(campaign.fromName, campaign.fromEmail);

  const rate = await sendRate();
  console.log(`[SEND][Campaign ${campaignId}] starting, ${rate} emails/sec, reply-to: ${replyToAddresses.join(", ") || "none"}`);

  let sentTotal = 0;
  let backoff = 0;

  while (true) {
    const current = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (current?.status !== "sending") return; // paused or deleted

    const batch = await prisma.campaignRecipient.findMany({
      where: { campaignId, status: "queued" },
      orderBy: { id: "asc" },
      take: rate,
    });
    if (batch.length === 0) break;

    const started = Date.now();
    const contactIds = batch.map((r: any) => r.contactId).filter(Boolean);
    const contacts = contactIds.length
      ? await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, fullName: true, company: true, designation: true, status: true },
        })
      : [];
    const contactById = new Map<number, any>(contacts.map((c: any) => [c.id, c]));

    const results = await Promise.all(
      batch.map(async (r: any) => {
        const contact = r.contactId ? contactById.get(r.contactId) : null;
        // Suppression is re-checked at send time: the contact may have unsubscribed/bounced since the snapshot.
        if (contact && contact.status !== "subscribed") return { r, outcome: "skipped" as const, error: `contact is ${contact.status}` };

        const unsubUrl = makeUnsubscribeUrl(r.email, campaignId);
        const html = injectTracking(personalize(template, { ...contact, email: r.email }, unsubUrl), r.email, campaignId);
        try {
          await sesv2Client.send(
            new SendEmailCommand({
              FromEmailAddress: fromHeader,
              Destination: { ToAddresses: [r.email] },
              ReplyToAddresses: replyToAddresses.length > 0 ? replyToAddresses : undefined,
              ConfigurationSetName: "career141-tracking",
              Content:
                attachments.length > 0
                  ? { Raw: { Data: createRawMimeEmail({ from: fromHeader, to: r.email, replyTo: replyToAddresses.join(", "), subject: campaign.subject, html, unsubscribeUrl: unsubUrl, attachments }) } }
                  : {
                      Simple: {
                        Subject: { Data: campaign.subject, Charset: "UTF-8" },
                        Body: { Html: { Data: html, Charset: "UTF-8" } },
                        Headers: [
                          { Name: "List-Unsubscribe", Value: `<${unsubUrl}>` },
                          { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
                        ],
                      },
                    },
              EmailTags: [{ Name: "campaign_id", Value: String(campaignId) }],
            }),
          );
          return { r, outcome: "sent" as const };
        } catch (e: any) {
          const name = e?.name ?? "";
          if (THROTTLE_ERRORS.includes(name)) return { r, outcome: "throttled" as const, error: e.message };
          if (ACCOUNT_ERRORS.includes(name)) return { r, outcome: "account" as const, error: `${name}: ${e.message}` };
          return { r, outcome: "failed" as const, error: String(e?.message ?? e).slice(0, 500) };
        }
      }),
    );

    const sent = results.filter((x) => x.outcome === "sent");
    const failed = results.filter((x) => x.outcome === "failed");
    const skipped = results.filter((x) => x.outcome === "skipped");
    const throttled = results.some((x) => x.outcome === "throttled");
    const accountError = results.find((x) => x.outcome === "account");

    // One write per outcome per chunk instead of one per email.
    // At-least-once: a crash between the SES call and this write re-sends at most one chunk on resume.
    if (sent.length > 0) {
      await prisma.campaignRecipient.updateMany({ where: { id: { in: sent.map((x) => x.r.id) } }, data: { status: "sent", sentAt: new Date() } });
      await prisma.emailEvent.createMany({
        data: sent.map((x) => ({ email: x.r.email, campaignId, eventType: "sent", dedupKey: `sent:${campaignId}:${x.r.email}` })),
        skipDuplicates: true,
      });
      sentTotal += sent.length;
    }
    const byReason = new Map<string, { status: "failed" | "skipped"; error: string; ids: number[] }>();
    for (const x of [...failed, ...skipped]) {
      const key = `${x.outcome}|${x.error}`;
      const g = byReason.get(key) ?? { status: x.outcome as "failed" | "skipped", error: x.error!, ids: [] as number[] };
      g.ids.push(x.r.id);
      byReason.set(key, g);
    }
    for (const g of byReason.values()) {
      await prisma.campaignRecipient.updateMany({ where: { id: { in: g.ids } }, data: { status: g.status, error: g.error } });
    }

    if (accountError) {
      console.error(`[SEND][Campaign ${campaignId}] SES account-level error, pausing campaign: ${accountError.error}`);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "paused" } });
      return;
    }

    // Every recipient of the first chunk failed => configuration problem (unverified sender etc.); don't burn the whole list.
    if (sentTotal === 0 && failed.length === batch.length && batch.length >= Math.min(rate, 5)) {
      console.error(`[SEND][Campaign ${campaignId}] first chunk failed entirely, aborting: ${failed[0].error}`);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "draft" } });
      return;
    }

    if (throttled) {
      // Throttled rows stay "queued"; the SDK already retried with adaptive backoff, so slow the whole loop down.
      backoff = Math.min(60_000, (backoff || 2_000) * 2);
      console.warn(`[SEND][Campaign ${campaignId}] SES throttling, backing off ${backoff}ms`);
      await sleep(backoff);
      continue;
    }
    backoff = 0;

    // ponytail: fixed-window limiter (chunk size == rate, one chunk per second); a token bucket would smooth bursts.
    const elapsed = Date.now() - started;
    if (elapsed < 1000) await sleep(1000 - elapsed);
  }

  const sent = await prisma.campaignRecipient.count({ where: { campaignId, status: "sent" } });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: sent > 0 ? { status: "sent", sentAt: new Date(), totalRecipients: sent } : { status: "draft" },
  });
  console.log(`[SEND][Campaign ${campaignId}] finished, ${sent} sent`);
}
