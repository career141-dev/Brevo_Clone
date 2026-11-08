// The PUT /api/campaigns/:id guard (QA report 8 Nov, finding 3), run through the real route with a fake database.
import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import express from "express";

process.env.JWT_SECRET = "test-secret";

const campaign: any = { id: 7, status: "sending", subject: "Old" };
mock.module("../prisma.js", {
  exports: {
    prisma: {
      campaign: {
        updateMany: async ({ where, data }: any) => {
          if (where.id !== campaign.id || !where.status.in.includes(campaign.status)) return { count: 0 };
          Object.assign(campaign, data);
          return { count: 1 };
        },
        findUnique: async ({ where }: any) => (where.id === campaign.id ? { ...campaign } : null),
      },
    },
  },
});
mock.module("./ses.js", { exports: { sesClient: {}, sesv2Client: {} } });
const { campaignsRouter } = await import("../routes/campaigns.js");

const app = express().use(express.json()).use(campaignsRouter);
const server = app.listen(0);
const port = (server.address() as any).port;
after(() => server.close()); // also when a test fails, so the run can't hang
const put = async (body: object) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/campaigns/7`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test("a sending campaign can't be edited or turned into a draft", async () => {
  const r = await put({ subject: "New", status: "draft" });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Pause it first/);
  assert.deepEqual([campaign.status, campaign.subject], ["sending", "Old"], "nothing changed");
});

test("a sent campaign's edits save but it stays sent; a paused one too", async () => {
  campaign.status = "sent";
  assert.equal((await put({ status: "draft" })).status, 409, "sent never turns back into a draft");
  assert.equal(campaign.status, "sent");
  assert.equal((await put({ subject: "Fixed typo" })).status, 200);
  assert.deepEqual([campaign.status, campaign.subject], ["sent", "Fixed typo"]);
  campaign.status = "paused";
  assert.equal((await put({ subject: "Paused edit" })).status, 200);
  assert.equal(campaign.status, "paused");
});

test("a draft or a scheduled campaign saves as a draft; other statuses go through their own buttons", async () => {
  campaign.status = "scheduled";
  assert.equal((await put({ status: "draft" })).status, 200);
  assert.equal(campaign.status, "draft", "saving a scheduled campaign as a draft unschedules it");
  assert.equal((await put({ status: "sending" })).status, 400);
  assert.equal(campaign.status, "draft");
});
