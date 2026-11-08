import { mock, test } from "node:test";
import assert from "node:assert/strict";

mock.module("../prisma.js", { exports: { prisma: {} } });
const { remainingSends, colomboMonthStart } = await import("./send-limits.js");

test("the month starts at midnight on the 1st in Colombo", () => {
  // 1 Dec 00:30 Colombo is still 30 Nov in UTC: it already belongs to December.
  assert.equal(colomboMonthStart(new Date("2026-11-30T19:00:00Z")).toISOString(), "2026-11-30T18:30:00.000Z");
  assert.equal(colomboMonthStart(new Date("2026-11-30T18:00:00Z")).toISOString(), "2026-10-31T18:30:00.000Z");
});

test("remaining sends under the daily and monthly caps", () => {
  assert.deepEqual(remainingSends({ lastDay: 150, thisMonth: 4000 }, 200, 50000), { daily: 50, monthly: 46000 });
  assert.deepEqual(remainingSends({ lastDay: 900, thisMonth: 50001 }, 200, 50000), { daily: 0, monthly: 0 });
  assert.deepEqual(remainingSends({ lastDay: 900, thisMonth: 9 }, 0, 0), { daily: null, monthly: null }, "0 turns a cap off");
});

test("finish time: within today's room, and spread over days past it", async () => {
  const { estimateFinish } = await import("./send-limits.js");
  // 10,000 at 12 a second, room for all: about 14 minutes.
  assert.deepEqual(estimateFinish({ queued: 10000, rate: 12, room: 10000, perDay: 10000, resumesInSeconds: 86400 }), { finishInSeconds: 834, resumesInSeconds: null });
  assert.deepEqual(estimateFinish({ queued: 50, rate: 10, room: null, perDay: null, resumesInSeconds: 0 }), { finishInSeconds: 5, resumesInSeconds: null }, "no cap");
  // 25,000 with 10,000 room now: 10,000 tomorrow, then 5,000 the day after (5,000 / 10 a second = 500s).
  assert.deepEqual(estimateFinish({ queued: 25000, rate: 10, room: 10000, perDay: 10000, resumesInSeconds: 3600 }), { finishInSeconds: 3600 + 86400 + 500, resumesInSeconds: 3600 });
  // Exactly one more day's worth: finishes on the first resumed day.
  assert.deepEqual(estimateFinish({ queued: 10000, rate: 10, room: 0, perDay: 10000, resumesInSeconds: 60 }), { finishInSeconds: 60 + 1000, resumesInSeconds: 60 });
});
