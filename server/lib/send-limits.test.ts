import { mock, test } from "node:test";
import assert from "node:assert/strict";

mock.module("../prisma.js", { exports: { prisma: {} } });
const { remainingSends } = await import("./send-limits.js");

test("remaining sends under the daily and monthly caps", () => {
  assert.deepEqual(remainingSends({ lastDay: 150, thisMonth: 4000 }, 200, 50000), { daily: 50, monthly: 46000 });
  assert.deepEqual(remainingSends({ lastDay: 900, thisMonth: 50001 }, 200, 50000), { daily: 0, monthly: 0 });
  assert.deepEqual(remainingSends({ lastDay: 900, thisMonth: 9 }, 0, 0), { daily: null, monthly: null }, "0 turns a cap off");
});
