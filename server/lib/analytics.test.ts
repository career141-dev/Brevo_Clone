// Analytics fixes from the QA report of 8 Nov (findings 12, 14, 15, 18), run through the real routes with a fake database.
import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";

process.env.JWT_SECRET = "test-secret";

const events: any[] = [];
const sqlSeen: string[] = [];
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
let uaRows: { userAgent: string }[] = [];
let sentAt: Date | null = null; // when the fake "sent" event happened, for the link-scanner rule

mock.module("../prisma.js", {
  exports: {
    prisma: {
      campaign: {
        findUnique: async ({ where }: any) =>
          where.id === 7 ? { id: 7, name: "N", subject: "S", status: "sending", sentAt: null, totalRecipients: 3 } : null,
      },
      emailEvent: {
        create: async ({ data }: any) => {
          if (data.dedupKey && events.some((e) => e.dedupKey === data.dedupKey)) throw Object.assign(new Error("dup"), { code: "P2002" });
          events.push(data);
          return data;
        },
        findMany: async () => [],
        findFirst: async () => (sentAt ? { timestamp: sentAt } : null),
      },
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = Prisma.sql(strings, ...values).sql;
        sqlSeen.push(sql);
        if (sql.includes("AS uniq")) return [
          { eventType: "sent", uniq: 3n, total: 3n },
          { eventType: "opened", uniq: 1n, total: 1n },
          { eventType: "clicked", uniq: 2n, total: 5n },
        ];
        if (sql.includes("SELECT userAgent")) return uaRows;
        if (sql.includes("HOUR(")) return [{ h: 9, n: 4n }];
        if (sql.includes("DATE_FORMAT")) return [
          { h: "2026-11-08 09:00", eventType: "opened", n: 1n },
          { h: "2026-11-08 09:00", eventType: "clicked", n: 2n },
        ];
        if (sql.includes("avgOpen")) return [{ avgOpen: null, avgClick: null }];
        return [];
      },
    },
  },
});
const { analyticsRouter, UA_SAMPLE } = await import("../routes/analytics.js");
const { eventsRouter } = await import("../routes/events.js");

const server = express().use(analyticsRouter).use(eventsRouter).listen(0);
const base = `http://127.0.0.1:${(server.address() as any).port}`;
after(() => server.close());

test("a bad campaign id is a 400, not a 500", async () => {
  for (const path of ["/api/analytics/campaigns/abc", "/api/analytics/campaigns/1.5/export", "/api/analytics/campaigns/0/contact-events"]) {
    assert.equal((await fetch(base + path)).status, 400, path);
  }
});

test("detail: unique clickers, sent so far, Colombo hours and a capped device sample", async () => {
  uaRows = Array.from({ length: UA_SAMPLE + 1 }, () => ({ userAgent: iphone }));
  const body = await (await fetch(`${base}/api/analytics/campaigns/7`)).json();
  assert.equal(body.stats.clicked, 2, "unique clickers, matching the click rate");
  assert.equal(body.stats.totalClicks, 5);
  assert.equal(body.stats.sent, 3, "sent so far while sending");
  // 03:30 UTC is 09:00 in Colombo; the hour comes from the shifted time, not the server clock.
  assert.ok(sqlSeen.filter((s) => s.includes("HOUR(") || s.includes("DATE_FORMAT")).every((s) => s.includes("INTERVAL 330 MINUTE")));
  assert.equal(body.advanced.engagementHeatmap[9].count, 4);
  assert.deepEqual(body.advanced.engagementTimeline, [{ time: "Nov 8, 9 AM", opens: 1, clicks: 2 }]);
  assert.deepEqual(body.advanced.deviceSample, { size: UA_SAMPLE, capped: true });
  assert.equal(body.advanced.devices.mobile, UA_SAMPLE);
});

test("a click counts as an open once, even when the pixel never loaded", async () => {
  const click = async () => {
    const t = jwt.sign({ email: "A@x.com", campaignId: 7, url: "https://career141.com" }, "test-secret");
    return fetch(`${base}/api/track/click?t=${t}`, { redirect: "manual" });
  };
  assert.equal((await click()).status, 302);
  assert.equal((await click()).status, 302);
  assert.equal(events.filter((e) => e.eventType === "clicked").length, 2, "every click is kept");
  assert.deepEqual(events.filter((e) => e.eventType === "opened").map((e) => e.dedupKey), ["opened:7:a@x.com"]);
});

test("a click within two minutes of sending is a link scanner: no open is counted", async () => {
  sentAt = new Date(Date.now() - 30_000);
  const t = jwt.sign({ email: "b@x.com", campaignId: 7, url: "https://career141.com" }, "test-secret");
  assert.equal((await fetch(`${base}/api/track/click?t=${t}`, { redirect: "manual" })).status, 302);
  assert.equal(events.filter((e) => e.eventType === "opened" && e.email === "b@x.com").length, 0);
  assert.equal(events.filter((e) => e.eventType === "clicked" && e.email === "b@x.com").length, 1, "the click itself is still kept");
  sentAt = null;
});
