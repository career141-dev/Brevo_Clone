// Run: node --experimental-test-module-mocks --import tsx --test server/lib/campaign-sender.test.ts
import assert from "node:assert/strict";
import { mock, test } from "node:test";

process.env.JWT_SECRET = "test-secret";
process.env.SEND_QUOTA_WAIT_MS = "50";

type Rec = { id: number; campaignId: number; contactId: number | null; email: string; status: string; error: string | null };
type Opts = { failEmails?: string[]; unsubscribed?: string[]; failAll?: boolean; audience?: string[]; sentBefore?: string[]; quotaRemaining?: number };

function setup(emails: string[], opts: Opts = {}) {
  const campaign: any = {
    id: 1, status: "sending", subject: "Hi", fromName: "Me", fromEmail: "me@x.com",
    templateHtml: "<body>Hello {{first_name}} <a href=\"https://a.com\">x</a></body>",
    replyToEmail: null, replyToListId: null, audienceType: "list", audienceListIds: "5", audienceId: 0, individualEmails: null, skipUnengaged: false,
  };
  const recs: Rec[] = [];
  let nextId = 1;
  const addRecs = (list: string[]) => list.forEach((email, i) => recs.push({ id: nextId++, campaignId: 1, contactId: i + 1, email, status: "queued", error: null }));
  addRecs(emails);
  const contacts = (opts.audience ?? emails).map((email, i) => ({ id: i + 1, email, firstName: "N" + i, status: opts.unsubscribed?.includes(email) ? "unsubscribed" : "subscribed" }));
  const events: any[] = (opts.sentBefore ?? []).map((email) => ({ email, campaignId: 1, eventType: "sent" }));
  const sendTimes: number[] = [];
  const sentTo: string[] = [];

  const match = (r: Rec, w: any) =>
    (w.campaignId === undefined || r.campaignId === w.campaignId) && (w.status ? r.status === w.status : true) && (w.id?.in ? w.id.in.includes(r.id) : true);
  const prisma = {
    campaign: {
      findUnique: async () => ({ ...campaign }),
      update: async ({ data }: any) => Object.assign(campaign, data),
      updateMany: async ({ where, data }: any) => {
        if (where.status && !(where.status.in ?? [where.status]).includes(campaign.status)) return { count: 0 };
        if (where.leaseOwner && campaign.leaseOwner !== where.leaseOwner) return { count: 0 };
        if (where.OR && campaign.leaseOwner && campaign.leaseOwner !== data.leaseOwner && campaign.leaseUntil > new Date()) return { count: 0 };
        Object.assign(campaign, data);
        return { count: 1 };
      },
    },
    list: { findMany: async () => [] },
    contact: {
      findMany: async ({ where }: any) => (where.id?.in ? contacts.filter((c) => where.id.in.includes(c.id)) : contacts.filter((c) => c.status === "subscribed")),
    },
    campaignRecipient: {
      findMany: async ({ where, take }: any) => recs.filter((r) => match(r, where)).slice(0, take),
      updateMany: async ({ where, data }: any) => recs.filter((r) => match(r, where)).forEach((r) => Object.assign(r, data)),
      count: async ({ where }: any) => recs.filter((r) => match(r, where)).length,
      createMany: async ({ data }: any) => {
        for (const d of data) if (!recs.some((r) => r.email === d.email)) recs.push({ id: nextId++, campaignId: d.campaignId, contactId: d.contactId, email: d.email, status: "queued", error: null });
      },
    },
    emailEvent: {
      createMany: async ({ data }: any) => events.push(...data),
      findMany: async () => events.filter((e) => e.eventType === "sent"),
      count: async () => events.filter((e) => e.eventType === "sent").length,
    },
  };
  const sesClient = {
    send: async () => ({ MaxSendRate: 10, Max24HourSend: 100, SentLast24Hours: 100 - (opts.quotaRemaining ?? 100) }),
  };
  const sesv2Client = {
    send: async (cmd: any) => {
      sendTimes.push(Date.now());
      const to = cmd.input.Destination.ToAddresses[0];
      if (opts.failAll || opts.failEmails?.includes(to)) throw Object.assign(new Error("rejected"), { name: "MessageRejected" });
      sentTo.push(to);
      return {};
    },
  };
  return { campaign, recs, events, sendTimes, sentTo, prisma, sesClient, sesv2Client };
}

let cur: ReturnType<typeof setup>;
const proxy = (pick: (s: ReturnType<typeof setup>) => any) => new Proxy({}, { get: (_t, k) => pick(cur)[k] });
mock.module("../prisma.js", { exports: { prisma: proxy((s) => s.prisma) } });
mock.module("./ses.js", { exports: { sesClient: proxy((s) => s.sesClient), sesv2Client: proxy((s) => s.sesv2Client) } });
const { runCampaign, dispatchCampaign, isRunning } = await import("./campaign-sender.js");

const idle = async () => { while (isRunning(1)) await new Promise((r) => setTimeout(r, 20)); };

test("sends in rate-limited chunks, records outcomes in batches, suppresses at send time", async () => {
  const emails = Array.from({ length: 25 }, (_, i) => `u${i}@x.com`);
  const s = setup(emails, { failEmails: ["u3@x.com", "u4@x.com"], unsubscribed: ["u10@x.com"] });
  cur = s;
  const t0 = Date.now();
  await runCampaign(1);

  const by = (st: string) => s.recs.filter((r) => r.status === st).length;
  assert.equal(by("sent"), 22);
  assert.equal(by("failed"), 2);
  assert.equal(by("skipped"), 1);
  assert.equal(s.sendTimes.length, 24, "the unsubscribed contact must never reach SES");
  assert.equal(s.events.filter((e) => e.dedupKey).length, 22);
  assert.equal(s.campaign.status, "sent");
  assert.equal(s.campaign.totalRecipients, 22);
  // MaxSendRate 10 => 9/sec: 25 recipients = 3 chunks, so at least 2 one-second pauses
  assert.ok(Date.now() - t0 >= 2000, "chunks must be paced to the SES rate");
  for (const t of s.sendTimes) assert.ok(s.sendTimes.filter((x) => x >= t && x < t + 1000).length <= 9 + 1);
});

test("aborts when the whole first chunk fails (bad sender config), not after burning the list", async () => {
  const s = setup(Array.from({ length: 30 }, (_, i) => `u${i}@x.com`), { failAll: true });
  cur = s;
  await runCampaign(1);
  assert.equal(s.campaign.status, "draft");
  assert.equal(s.sendTimes.length, 9, "only the first chunk was attempted");
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("dispatch skips recipients who already got it, queues everyone, and waits for the SES daily quota instead of stranding the rest", async () => {
  const all = ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"];
  const s = setup([], { audience: all, sentBefore: ["a@x.com"], quotaRemaining: 3 });
  s.campaign.status = "draft";
  cur = s;

  const first = await dispatchCampaign(1, "send");
  assert.deepEqual(first.ok && [first.queued, first.alreadySent], [4, 1], "a already received it; everyone else is queued");
  while (s.sentTo.length < 3) await wait(20);
  await wait(200);
  assert.equal(s.sentTo.length, 3, "only the 3 emails left in the daily quota go out");
  assert.equal(s.campaign.status, "sending", "the campaign keeps waiting for quota instead of being marked sent");

  cur.sesClient.send = async () => ({ MaxSendRate: 10, Max24HourSend: 100, SentLast24Hours: 0 }) as any; // quota refills
  await idle();
  assert.deepEqual(s.sentTo.sort(), ["b@x.com", "c@x.com", "d@x.com", "e@x.com"], "the rest goes out automatically, no /resume");
  assert.equal(s.campaign.status, "sent");
  assert.equal(s.campaign.totalRecipients, 5);

  const again = await dispatchCampaign(1, "send");
  assert.equal(again.ok, false, "a sent campaign cannot be re-sent");
});

test("an SES daily-quota error leaves recipients queued and retries them, never marking them failed", async () => {
  const s = setup(["a@x.com", "b@x.com"]);
  cur = s;
  let quotaErrors = 2;
  const realSend = s.sesv2Client.send;
  s.sesv2Client.send = async (cmd: any) => {
    if (quotaErrors-- > 0) throw Object.assign(new Error("Daily message quota exceeded"), { name: "LimitExceededException" });
    return realSend(cmd);
  };
  await runCampaign(1);
  assert.equal(s.recs.filter((r) => r.status === "failed").length, 0);
  assert.deepEqual(s.sentTo.sort(), ["a@x.com", "b@x.com"]);
  assert.equal(s.campaign.status, "sent");
});

test("a 200ms database does not slow sending below the SES rate, and nobody is sent twice across pages", async () => {
  const emails = Array.from({ length: 100 }, (_, i) => `u${i}@x.com`);
  const s = setup(emails);
  cur = s;
  const slow = (o: any) => Object.fromEntries(Object.entries(o).map(([k, f]: any) => [k, async (...a: any[]) => { await wait(200); return f(...a); }]));
  for (const model of ["campaignRecipient", "emailEvent", "campaign", "contact"] as const) (s.prisma as any)[model] = slow(s.prisma[model]);

  await runCampaign(1);

  assert.equal(s.sentTo.length, 100);
  assert.equal(new Set(s.sentTo).size, 100, "rows must be saved before they are re-read, or they go out twice");
  assert.equal(s.campaign.status, "sent");
  const span = (s.sendTimes.at(-1)! - s.sendTimes[0]) / 1000;
  // 100 emails at 9/sec = 11 chunks, 10 gaps. A DB-paced loop would need 1.4s+ per chunk (14s+).
  assert.ok(span < 12.5, `took ${span}s`);
});

test("a campaign leased by another process is left alone until the lease expires, and the lease is released when done", async () => {
  const s = setup(["a@x.com", "b@x.com"]);
  cur = s;
  s.campaign.leaseOwner = "other-container";
  s.campaign.leaseUntil = new Date(Date.now() + 60_000);
  await runCampaign(1);
  assert.equal(s.sentTo.length, 0, "must not send while another process holds the lease");
  assert.equal(s.campaign.leaseOwner, "other-container", "must not clear someone else's lease");

  s.campaign.leaseUntil = new Date(Date.now() - 1000); // that process died
  await runCampaign(1);
  assert.deepEqual(s.sentTo.sort(), ["a@x.com", "b@x.com"]);
  assert.equal(s.campaign.status, "sent");
  assert.equal(s.campaign.leaseOwner, null);
});
