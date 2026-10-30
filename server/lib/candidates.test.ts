import test from "node:test";
import assert from "node:assert/strict";
import { cleanCandidates } from "./candidates.ts";

test("lowercases, de-dupes and splits names", () => {
  const out = cleanCandidates([
    { email: " Ana@Example.com ", name: "  Ana   Maria  Silva " },
    { email: "ana@example.com", name: "Duplicate" },
    { email: "bob@example.com", name: "" },
  ]);
  assert.deepEqual(out, [
    { email: "ana@example.com", fullName: "Ana Maria Silva", firstName: "Ana", lastName: "Maria Silva" },
    { email: "bob@example.com", fullName: null, firstName: null, lastName: null },
  ]);
});

test("skips bad rows instead of failing the import", () => {
  const out = cleanCandidates([{ email: "not-an-email" }, { email: 42 }, null, { email: `${"a".repeat(190)}@example.com` }]);
  assert.deepEqual(out, []);
});

test("trims names that would not fit the column", () => {
  const [c] = cleanCandidates([{ email: "long@example.com", name: "x".repeat(500) }]);
  assert.equal(c.fullName?.length, 191);
  assert.equal(c.firstName?.length, 191);
});
