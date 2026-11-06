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
