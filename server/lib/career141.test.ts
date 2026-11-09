import test from "node:test";
import assert from "node:assert/strict";
import { career141Contacts, listNameFor, SEARCH_ID } from "./career141.ts";

test("maps a CAREER141 row onto the contact columns", () => {
  const [c] = career141Contacts([{
    email: " Ana@Example.com ", name: "Ana Silva", phone: "+94 77 123", title: "Software Engineer", level: "Junior / Associate",
    employer: "Acme", location: "Colombo", linkedinUrl: "https://linkedin.com/in/ana", kind: "current", matchedBy: "current title: software engineer",
  }]);
  assert.deepEqual(c, {
    email: "ana@example.com", fullName: "Ana Silva", firstName: "Ana", lastName: "Silva", phone: "+94 77 123",
    company: "Acme", designation: "Software Engineer", city: "Colombo", linkedin: "https://linkedin.com/in/ana",
    tags: "career141,Junior / Associate", source: "career141",
  });
});

test("one contact per email, the first row wins, bad emails dropped", () => {
  const out = career141Contacts([
    { email: "a@x.com", title: "First" },
    { email: "A@X.com", title: "Second" },
    { email: "not-an-email" },
    {},
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].designation, "First");
  assert.equal(out[0].tags, "career141");
});

test("long values are cut to fit the column", () => {
  const [c] = career141Contacts([{ email: "b@x.com", employer: "x".repeat(400) }]);
  assert.equal(c.company?.length, 191);
});

test("only plain ids are forwarded", () => {
  assert.ok(SEARCH_ID.test("k57abc_DEF-123"));
  for (const bad of ["short", "../../tables/users", "k57abc def123", "x".repeat(65)]) assert.ok(!SEARCH_ID.test(bad), bad);
});

test("the list is named after the rule and the day", () => {
  assert.equal(listNameFor("Junior developers", new Date("2026-11-09T10:00:00Z")), "Junior developers - CAREER141 2026-11-09");
  assert.equal(listNameFor("", new Date("2026-11-09T10:00:00Z")), "Search - CAREER141 2026-11-09");
});
