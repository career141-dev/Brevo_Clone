import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEmailContent } from "./content-check.js";

const words = "Join us at The Talent Suite 2026, Southern Chapter. ".repeat(6);

test("a normal email passes with nothing to fix", () => {
  const r = checkEmailContent("Meet Southern Sri Lanka's hospitality leaders", `<p>${words}</p><a href="https://career141.com">Site</a><a href="{{unsubscribe_url}}">Unsubscribe</a><a href="mailto:a@b.com">Mail</a>`);
  assert.deepEqual(r, { problems: [], warnings: [] });
});

test("broken mail is blocked", () => {
  const r = checkEmailContent("  ", `<img src="data:image/png;base64,AAAA"><a href="/api/download?x=1">File</a><a href="http://localhost:3001/uploads/a.pdf">A</a>`);
  assert.equal(r.problems.length, 3);
  assert.match(r.problems[0], /subject/);
  assert.match(r.problems[1], /pasted into the email/);
  assert.match(r.problems[2], /\/api\/download\?x=1, http:\/\/localhost:3001/);
});

test("lazy-loading data-src is not mistaken for a link", () => {
  const r = checkEmailContent("Hello there", `<p>${words}</p><img data-src="img/a.png" src="https://career141.com/a.png">`);
  assert.deepEqual(r.problems, []);
});

test("crafted HTML that never closes a tag is checked in linear time", () => {
  for (const unit of ["<", "<style", 'href="', "<a href='"]) {
    const html = unit.repeat(Math.ceil(400_000 / unit.length));
    const started = performance.now();
    checkEmailContent("Hi", html);
    assert.ok(performance.now() - started < 500, `${unit} x400KB took too long`);
  }
  assert.match(checkEmailContent("Hi", "x".repeat(2_000_001)).problems[0], /far too large/);
});

test("spam signals are warnings, not blocks", () => {
  const r = checkEmailContent("FREE EVENT TICKETS!!", `<img src="https://pub-1.r2.dev/a.png"><a href="http://example.com">x</a>${"x".repeat(105 * 1024)}`);
  assert.equal(r.problems.length, 0);
  assert.equal(r.warnings.length, 5);
});
