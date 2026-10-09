// Run: node --experimental-test-module-mocks --import tsx --test server/lib/campaign-sender.test.ts
import assert from "node:assert/strict";
import { mock, test } from "node:test";

process.env.JWT_SECRET = "test-secret";

type Rec = { id: number; campaignId: number; contactId: number | null; email: string; status: string; error: string | null };

function setup(emails: string[], opts: { failEmails?: string[]; unsubscribed?: string[]; failAll?: boolean } = {}) {
  const campaign: any = { id: 1, status: "sending", subject: "Hi", fromName: "Me", fromEmail: "me@x.com", templateHtml: "<body>Hello {{first_name}} <a href=\"https://a.com\">x</a></body>", replyToEmail: null, replyToListId: null };
  const recs: Rec[] = emails.map((email, i) => ({ id: i + 1, campaignId: 1, contactId: i + 1, email, status: "queued", error: null }));
  const contacts = emails.map((email, i) => ({ id: i + 1, firstName: "N" + i, status: opts.unsubscribed?.includes(email) ? "unsubscribed" : "subscribed" }));
  const events: any[] = [];
  const sendTimes: number[] = [];

  const match = (r: Rec, w: any) => (w.status ? r.status === w.status : true) && (w.id?.in ? w.id.in.includes(r.id) : true);
  const prisma = {
    campaign: {
      findUnique: async () => ({ ...campaign }),
      update: async ({ data }: any) => Object.assign(campaign, data),
    },
    contact: { findMany: async () => contacts },
    campaignRecipient: {
      findMany: async ({ where, take }: any) => recs.filter((r) => match(r, where)).slice(0, take),
      updateMany: async ({ where, data }: any) => recs.filter((r) => match(r, where)).forEach((r) => Object.assign(r, data)),
      count: async ({ where }: any) => recs.filter((r) => match(r, where)).length,
    },
    emailEvent: { createMany: async ({ data }: any) => events.push(...data) },
  };
  const sesClient = { send: async () => ({ MaxSendRate: 10 }) };
  const sesv2Client = {
    send: async (cmd: any) => {
      sendTimes.push(Date.now());
      const to = cmd.input.Destination.ToAddresses[0];
      if (opts.failAll || opts.failEmails?.includes(to)) throw Object.assign(new Error("rejected"), { name: "MessageRejected" });
      return {};
    },
  };
  return { campaign, recs, events, sendTimes, prisma, sesClient, sesv2Client };
}

let cur: ReturnType<typeof setup>;
const proxy = (pick: (s: ReturnType<typeof setup>) => any) => new Proxy({}, { get: (_t, k) => pick(cur)[k] });
mock.module("../prisma.js", { exports: { prisma: proxy((s) => s.prisma) } });
mock.module("./ses.js", { exports: { sesClient: proxy((s) => s.sesClient), sesv2Client: proxy((s) => s.sesv2Client) } });
const { runCampaign } = await import("./campaign-sender.js");

async function load(s: ReturnType<typeof setup>) {
  cur = s;
  return runCampaign;
}

test("sends in rate-limited chunks, records outcomes in batches, suppresses at send time", async () => {
  const emails = Array.from({ length: 25 }, (_, i) => `u${i}@x.com`);
  const s = setup(emails, { failEmails: ["u3@x.com", "u4@x.com"], unsubscribed: ["u10@x.com"] });
  const run = await load(s);
  const t0 = Date.now();
  await run(1);

  const by = (st: string) => s.recs.filter((r) => r.status === st).length;
  assert.equal(by("sent"), 22);
  assert.equal(by("failed"), 2);
  assert.equal(by("skipped"), 1);
  assert.equal(s.sendTimes.length, 24, "the unsubscribed contact must never reach SES");
  assert.equal(s.events.length, 22);
  assert.equal(s.campaign.status, "sent");
  assert.equal(s.campaign.totalRecipients, 22);
  // MaxSendRate 10 => 9/sec: 25 recipients = 3 chunks, so at least 2 one-second pauses
  assert.ok(Date.now() - t0 >= 2000, "chunks must be paced to the SES rate");
  for (const t of s.sendTimes) assert.ok(s.sendTimes.filter((x) => x >= t && x < t + 1000).length <= 9 + 1);
});

test("aborts to draft when the whole first chunk fails (bad sender config), not after burning the list", async () => {
  const s = setup(Array.from({ length: 30 }, (_, i) => `u${i}@x.com`), { failAll: true });
  const run = await load(s);
  await run(1);
  assert.equal(s.campaign.status, "draft");
  assert.equal(s.sendTimes.length, 9, "only the first chunk was attempted");
});
