import { randomUUID } from "node:crypto";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { GetSendQuotaCommand } from "@aws-sdk/client-ses";
import { prisma } from "../prisma.js";
import { sesClient, sesv2Client } from "./ses.js";
import { injectTracking, makeUnsubscribeUrl } from "./tracking.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const THROTTLE_ERRORS = ["TooManyRequestsException", "ThrottlingException", "Throttling"];
const ACCOUNT_ERRORS = ["SendingPausedException", "AccountSuspendedException", "MailFromDomainNotVerifiedException"];
const QUOTA_WAIT_MS = Number(process.env.SEND_QUOTA_WAIT_MS) || 10 * 60_000;
const PAGE_SECONDS = 10; // how much sending one recipient read covers; also how quickly a pause is noticed
// SES v2 reports the rolling-24h cap as LimitExceededException ("Daily message quota exceeded"); v1 used Throttling.
const isQuotaError = (e: any) => e?.name === "LimitExceededException" || /daily message quota|quota exceeded/i.test(String(e?.message ?? ""));

// "Unengaged" = got >= UNENGAGED_MIN_SENDS emails in the last UNENGAGED_DAYS days and never opened/clicked.
const UNENGAGED_MIN_SENDS = 3;
const UNENGAGED_DAYS = 90;

const getAppBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return "https://email.career141.com";
};

export function normalizeEmailHtml(html: string): string {
  if (!html) return "";
  const baseUrl = getAppBaseUrl();

  // Rewrite relative /uploads/ links and src attributes to absolute public URLs
  let normalized = html.replace(/(src|href)=(["'])\/uploads\/([^"'\s>?#]+)\2/g, (_match, p1, p2, p3) => {
    return `${p1}=${p2}${baseUrl}/uploads/${p3}${p2}`;
  });

  // Rewrite any localhost / 127.0.0.1 upload URLs to production domain
  normalized = normalized.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/uploads\//g, `${baseUrl}/uploads/`);

  // Rewrite relative or localhost /api/download URLs to production domain
  normalized = normalized.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/download/g, `${baseUrl}/api/download`);
  normalized = normalized.replace(/href=(["'])\/api\/download/g, `href=$1${baseUrl}/api/download`);

  return normalized;
}

export function formatEmailWithDisplayName(name: string | null | undefined, email: string): string {
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

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function personalize(template: string, c: Person, unsubUrl: string): string {
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
  // Contact fields come from imports, so they're escaped: a row can't inject links or markup into mail from our domain.
  return template.replace(/{{(first_name|last_name|full_name|company|designation|email|unsubscribe_url)}}/g, (_m, k) =>
    k === "unsubscribe_url" ? vars[k] : escapeHtml(vars[k]),
  );
}

const parseIds = (s: string | null | undefined) =>
  String(s ?? "").split(",").map((x) => Number(x.trim())).filter((n) => !isNaN(n) && n > 0);


/** Subscribed contacts of the selected audience, deduplicated by lowercase email. */
async function resolveAudience(campaign: any): Promise<{ contactId: number | null; email: string }[]> {
  const out = new Map<string, { contactId: number | null; email: string }>();

  if (campaign.audienceType === "individual" || campaign.individualEmails) {
    const wanted = String(campaign.individualEmails || "").split(",").map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
    if (wanted.length > 0) {
      // Look up contacts of ANY status so unsubscribed/bounced addresses stay suppressed instead of being treated as "unknown".
      const known = await prisma.contact.findMany({ where: { email: { in: wanted } }, select: { id: true, email: true, status: true, blocked: true } });
      const byEmail = new Map<string, { id: number; status: string; blocked: boolean }>(known.map((c: any) => [c.email.toLowerCase(), c]));
      // Addresses with no contact row have no status, so past bounces/complaints are the only way to keep them suppressed.
      const suppressedRows = await prisma.emailEvent.findMany({
        where: { email: { in: wanted }, eventType: { in: ["bounced", "complained", "unsubscribed"] } },
        select: { email: true },
      });
      const suppressed = new Set(suppressedRows.map((e: any) => e.email.toLowerCase()));
      for (const email of wanted) {
        const c = byEmail.get(email);
        if ((c && (c.status !== "subscribed" || c.blocked)) || suppressed.has(email)) continue;
        out.set(email, { contactId: c?.id ?? null, email });
      }
    }
  } else {
    // Internal list ids only. Also matching brevoId pulled in unrelated lists: 120 lists have a brevoId equal to
    // another list's internal id (e.g. one past campaign would have gained 17 extra lists / 11k contacts).
    const targetIds = campaign.audienceListIds ? parseIds(campaign.audienceListIds) : campaign.audienceId ? [campaign.audienceId] : [];
    const excludeIds = parseIds(campaign.excludeListIds);
    const contacts = await prisma.contact.findMany({
      where: {
        status: "subscribed",
        blocked: false,
        contactLists: {
          some: { listId: { in: targetIds } },
          ...(excludeIds.length > 0 ? { none: { listId: { in: excludeIds } } } : {}),
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

/** Remaining SES rolling-24h quota, or null if unlimited/unreadable (e.g. missing ses:GetSendQuota permission). */
async function dailyQuotaRemaining(): Promise<number | null> {
  try {
    const q = await sesClient.send(new GetSendQuotaCommand({}));
    if (q.Max24HourSend === undefined || q.Max24HourSend < 0) return null;
    return Math.max(0, q.Max24HourSend - (q.SentLast24Hours ?? 0));
  } catch {
    return null;
  }
}

async function sendRate(): Promise<number> {
  try {
    const q = await sesClient.send(new GetSendQuotaCommand({}));
    return Math.max(1, Math.min(100, Math.floor((q.MaxSendRate ?? 14) * 0.9)));
  } catch {
    return 10;
  }
}

export type DispatchResult =
  | { ok: true; total: number; queued: number; alreadySent: number; alreadyRunning?: boolean }
  | { ok: false; status: number; error: string; details?: string };

/**
 * Snapshots the audience into campaign_recipients (skipping anyone who already got this campaign), caps it to the
 * remaining SES daily quota, flips the campaign to "sending" and starts the background worker.
 * mode "resume" additionally allows campaigns already marked "sent" (sends to contacts added/capped since).
 */
export async function dispatchCampaign(campaignId: number, mode: "send" | "resume"): Promise<DispatchResult> {
  const fail = (status: number, error: string, details?: string): DispatchResult => ({ ok: false, status, error, details });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return fail(404, "Campaign not found");
  if (mode === "send" && campaign.status === "sent") return fail(400, "Campaign already sent");
  if (running.has(campaignId)) {
    return mode === "resume"
      ? fail(400, "Campaign is already actively sending")
      : { ok: true, total: 0, queued: 0, alreadySent: 0, alreadyRunning: true };
  }

  const hasListAudience = parseIds(campaign.audienceListIds).length > 0 || Boolean(campaign.audienceId);
  if (campaign.audienceType !== "individual" && !hasListAudience && !campaign.individualEmails) return fail(400, "No audience selected");
  if (!campaign.templateHtml) return fail(400, "No template selected");

  const sentRows = await prisma.emailEvent.findMany({ where: { campaignId, eventType: "sent" }, select: { email: true } });
  const alreadySentSet = new Set<string>(sentRows.map((e: any) => e.email.toLowerCase()));

  // Everyone is queued. The worker paces itself to the SES daily quota and waits for it to refill on its own, instead
  // of capping here and leaving the rest stranded until someone presses /resume.
  const recipients = (await resolveAudience(campaign)).filter((r) => !alreadySentSet.has(r.email));

  // Snapshot first (idempotent) so a failure here can never leave a half-built audience being sent.
  // 5000-row chunks, 4 at a time, instead of ~90 sequential round trips for a 90k audience.
  const chunks: (typeof recipients)[] = [];
  for (let i = 0; i < recipients.length; i += 5000) chunks.push(recipients.slice(i, i + 5000));
  for (let i = 0; i < chunks.length; i += 4) {
    await Promise.all(
      chunks.slice(i, i + 4).map((chunk) =>
        prisma.campaignRecipient.createMany({
          data: chunk.map((r) => ({ campaignId, contactId: r.contactId, email: r.email })),
          skipDuplicates: true,
        }),
      ),
    );
  }
  await prisma.campaignRecipient.updateMany({ where: { campaignId, status: "failed" }, data: { status: "queued", error: null } });

  const queued = await prisma.campaignRecipient.count({ where: { campaignId, status: "queued" } });
  if (queued === 0) {
    return alreadySentSet.size > 0
      ? fail(400, "No remaining contacts to send to — all contacts in the audience have already received this campaign.")
      : fail(
          400,
          "No target contacts found",
          "No subscribed recipient emails were found in the selected audience list or individual contacts. Please edit the campaign, add recipient emails, and try sending again.",
        );
  }

  const flipped = await prisma.campaign.updateMany({
    where: { id: campaignId, status: { in: mode === "resume" ? ["draft", "scheduled", "paused", "sending", "sent"] : ["draft", "scheduled", "paused", "sending"] } },
    data: { status: "sending" },
  });
  if (flipped.count === 0) return fail(400, "Campaign is already sending or sent");

  void runCampaign(campaignId);
  const total = await prisma.campaignRecipient.count({ where: { campaignId } });
  return { ok: true, total, queued, alreadySent: alreadySentSet.size };
}

const running = new Set<number>();
let stopping = false;

// During a Railway deploy two containers overlap, and the in-memory `running` set can't see across them. A short lease
// on the campaign row lets only one process send it; if that process dies, the lease expires and the sweep takes over.
const WORKER_ID = randomUUID();
const LEASE_MS = 60_000;

/** Takes or renews the lease. False when the campaign isn't "sending" (paused/deleted) or another process holds it. */
async function claimLease(campaignId: number): Promise<boolean> {
  const now = new Date();
  const { count } = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "sending", OR: [{ leaseOwner: null }, { leaseOwner: WORKER_ID }, { leaseUntil: { lt: now } }] },
    data: { leaseOwner: WORKER_ID, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  return count === 1;
}

/** Graceful shutdown: workers finish their current chunk and saves, so a redeploy cannot lose or re-send it. */
export async function stopSending(maxWaitMs = 8000) {
  stopping = true;
  const deadline = Date.now() + maxWaitMs;
  while (running.size > 0 && Date.now() < deadline) await sleep(100);
}

export async function runCampaign(campaignId: number) {
  if (stopping || running.has(campaignId)) return;
  running.add(campaignId);
  try {
    await processCampaign(campaignId);
  } catch (err) {
    // Campaign stays "sending"; the periodic sweep in resumeSendingCampaigns() picks it up again.
    console.error(`[SEND][Campaign ${campaignId}] worker error:`, err);
  } finally {
    await prisma.campaign.updateMany({ where: { id: campaignId, leaseOwner: WORKER_ID }, data: { leaseOwner: null, leaseUntil: null } }).catch(() => {});
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
  if (!(await claimLease(campaignId))) return;

  let template: string = normalizeEmailHtml(campaign.templateHtml);
  if (!template.includes("{{unsubscribe_url}}")) {
    template = /<\/body>/i.test(template) ? template.replace(/<\/body>/i, `${UNSUB_FALLBACK}</body>`) : template + UNSUB_FALLBACK;
  }

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
  const baseSent = await prisma.emailEvent.count({ where: { campaignId, eventType: "sent" } });
  const endStatus = () => (baseSent > 0 ? "sent" : "draft");
  console.log(`[SEND][Campaign ${campaignId}] starting, ${rate} emails/sec, reply-to: ${replyToAddresses.join(", ") || "none"}`);

  let sentTotal = 0;
  let backoff = 0;
  // Emails left in the SES rolling-24h quota; null = unlimited/unreadable (then SES errors are the only signal).
  let budget = await dailyQuotaRemaining();
  // The latest background write. It must finish before recipients are re-read, otherwise rows already sent would still
  // look "queued" and go out twice. Only one runs at a time, so a slow DB slows sending instead of building a backlog.
  let writes: Promise<void> = Promise.resolve();
  let writeError: unknown = null;
  const settleWrites = async () => {
    await writes;
    if (writeError) throw writeError; // campaign stays "sending"; the sweep restarts it from the database state
  };

  while (!stopping) {
    await settleWrites();
    if (!(await claimLease(campaignId))) return; // paused, reset, deleted, or another process took over

    if (budget !== null && budget <= 0) {
      budget = await dailyQuotaRemaining();
      if (budget !== null && budget <= 0) {
        // ponytail: fixed re-check interval; a pause/delete is noticed only after the wait ends.
        console.warn(`[SEND][Campaign ${campaignId}] SES daily quota used up, re-checking in ${QUOTA_WAIT_MS / 60_000} min`);
        await sleep(QUOTA_WAIT_MS);
        continue;
      }
    }

    // Read several seconds of recipients at once: the DB is ~200ms away, so reading per chunk would set the send speed.
    const pageSize = rate * PAGE_SECONDS;
    const page = await prisma.campaignRecipient.findMany({
      where: { campaignId, status: "queued" },
      orderBy: { id: "asc" },
      take: budget === null ? pageSize : Math.min(pageSize, budget),
    });
    if (page.length === 0) break;

    const contactIds = page.map((r: any) => r.contactId).filter(Boolean);
    const contacts = contactIds.length
      ? await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, fullName: true, company: true, designation: true, status: true, blocked: true },
        })
      : [];
    const contactById = new Map<number, any>(contacts.map((c: any) => [c.id, c]));

    for (let i = 0; i < page.length && !stopping; i += rate) {
      const batch = page.slice(i, i + rate);
      const sends = batch.map(async (r: any) => {
        const contact = r.contactId ? contactById.get(r.contactId) : null;
        // Suppression is re-checked close to send time (at most PAGE_SECONDS old): the contact may have unsubscribed or been blocked since the snapshot.
        if (contact?.blocked) return { r, outcome: "skipped" as const, error: "contact is blocked" };
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
              Content: {
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
          if (isQuotaError(e)) return { r, outcome: "quota" as const, error: e.message };
          if (THROTTLE_ERRORS.includes(name)) return { r, outcome: "throttled" as const, error: e.message };
          if (ACCOUNT_ERRORS.includes(name)) return { r, outcome: "account" as const, error: `${name}: ${e.message}` };
          return { r, outcome: "failed" as const, error: String(e?.message ?? e).slice(0, 500) };
        }
      });
      // Every send has fired by here. The 1s window starts now (not at the first send, or before the DB lookups), so two
      // chunks can never land inside one second and exceed the SES rate.
      const lastSendAt = Date.now();
      const results = await Promise.all(sends);

      const sent = results.filter((x) => x.outcome === "sent");
      const failed = results.filter((x) => x.outcome === "failed");
      const skipped = results.filter((x) => x.outcome === "skipped");
      const throttled = results.some((x) => x.outcome === "throttled");
      const quotaHit = results.some((x) => x.outcome === "quota");
      const accountError = results.find((x) => x.outcome === "account");
      if (budget !== null) budget -= sent.length;
      sentTotal += sent.length;
      const liveTotal = baseSent + sentTotal;

      const byReason = new Map<string, { status: "failed" | "skipped"; error: string; ids: number[] }>();
      for (const x of [...failed, ...skipped]) {
        const key = `${x.outcome}|${x.error}`;
        const g = byReason.get(key) ?? { status: x.outcome as "failed" | "skipped", error: x.error!, ids: [] as number[] };
        g.ids.push(x.r.id);
        byReason.set(key, g);
      }

      // Results are saved in the background while the next chunk goes out, so DB latency doesn't eat the 1s window.
      // At-least-once: a crash before this write re-sends at most this chunk on resume.
      await settleWrites();
      writes = Promise.all([
        ...(sent.length > 0
          ? [
              prisma.campaignRecipient.updateMany({ where: { id: { in: sent.map((x) => x.r.id) } }, data: { status: "sent", sentAt: new Date() } }),
              prisma.emailEvent.createMany({
                data: sent.map((x) => ({ email: x.r.email, campaignId, eventType: "sent", dedupKey: `sent:${campaignId}:${x.r.email}` })),
                skipDuplicates: true,
              }),
              // Live counter the campaigns UI reads while a send is in progress.
              prisma.campaign.update({ where: { id: campaignId }, data: { totalRecipients: liveTotal } }).catch(() => {}),
            ]
          : []),
        ...[...byReason.values()].map((g) => prisma.campaignRecipient.updateMany({ where: { id: { in: g.ids } }, data: { status: g.status, error: g.error } })),
      ]).then(
        () => {},
        (e) => { writeError = e; },
      );

      if (accountError) {
        await settleWrites();
        console.error(`[SEND][Campaign ${campaignId}] SES account-level error, pausing campaign: ${accountError.error}`);
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: "paused" } });
        return;
      }

      // Every recipient of the first chunk failed => configuration problem (unverified sender etc.); don't burn the whole list.
      if (sentTotal === 0 && failed.length === batch.length && batch.length >= Math.min(rate, 5)) {
        await settleWrites();
        console.error(`[SEND][Campaign ${campaignId}] first chunk failed entirely, aborting: ${failed[0].error}`);
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: endStatus() } });
        return;
      }

      if (quotaHit) {
        // Quota rows stay "queued"; force a re-check (and wait) at the top of the loop instead of marking them failed.
        budget = 0;
        break;
      }

      if (throttled) {
        // Throttled rows stay "queued"; the SDK already retried with adaptive backoff, so slow the whole loop down.
        backoff = Math.min(60_000, (backoff || 2_000) * 2);
        console.warn(`[SEND][Campaign ${campaignId}] SES throttling, backing off ${backoff}ms`);
        await sleep(backoff);
        break;
      }
      backoff = 0;

      // ponytail: fixed-window limiter (chunk size == rate, one chunk per second); a token bucket would smooth bursts.
      const elapsed = Date.now() - lastSendAt;
      if (elapsed < 1000) await sleep(1000 - elapsed);
    }
  }

  await settleWrites();
  if (stopping) return; // shutting down mid-campaign: it stays "sending" and the next process continues it

  const finalSent = await prisma.emailEvent.count({ where: { campaignId, eventType: "sent" } });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: finalSent > 0 ? { status: "sent", sentAt: new Date(), totalRecipients: finalSent } : { status: "draft" },
  });
  console.log(`[SEND][Campaign ${campaignId}] finished, ${sentTotal} sent this run, ${finalSent} total`);
}

export const isRunning = (campaignId: number) => running.has(campaignId);
