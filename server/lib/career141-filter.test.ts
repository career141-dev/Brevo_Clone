// The page's filters and its Excel file (src/lib/career141-filter.ts), tested here with the other suites.
import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, filterRows, isFiltered, levelCounts, NO_FILTER, rowsToCsv } from "../../src/lib/career141-filter.ts";
import type { Career141Row } from "../../src/lib/api.ts";

const rows: Career141Row[] = [
  { email: "a@x.com", name: "Ana Silva", title: "Software Engineer", level: "Junior / Associate", employer: "Acme", phone: "077", kind: "current" },
  { email: "b@x.com", name: "Ben Perera", title: "Programmer", level: "Intern / Trainee", employer: "Dialog", kind: "previous" },
  { email: "c@x.com", name: "Chen", title: "Data Analyst", level: "Junior / Associate", employer: "Acme", phone: " ", kind: "meaning" },
];

test("no filter keeps everyone", () => {
  assert.equal(filterRows(rows, NO_FILTER).length, 3);
  assert.equal(isFiltered(NO_FILTER), false);
});

test("every word must appear, across name, email, title and employer", () => {
  assert.deepEqual(filterRows(rows, { ...NO_FILTER, text: "acme engineer" }).map((r) => r.email), ["a@x.com"]);
  assert.deepEqual(filterRows(rows, { ...NO_FILTER, text: "ACME" }).map((r) => r.email), ["a@x.com", "c@x.com"]);
});

test("level, found as and has phone narrow together; a blank phone is no phone", () => {
  assert.deepEqual(filterRows(rows, { ...NO_FILTER, level: "Junior / Associate", hasPhone: true }).map((r) => r.email), ["a@x.com"]);
  assert.deepEqual(filterRows(rows, { ...NO_FILTER, kind: "previous" }).map((r) => r.email), ["b@x.com"]);
  assert.ok(isFiltered({ ...NO_FILTER, hasPhone: true }));
});

test("levels come in ladder order with counts", () => {
  assert.deepEqual(levelCounts(rows, ["Intern / Trainee", "Junior / Associate"]), [["Intern / Trainee", 1], ["Junior / Associate", 2]]);
});

test("the file opens in Excel and cannot run a formula", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(null), '""');
  const csv = rowsToCsv(rows.slice(0, 1));
  assert.ok(csv.startsWith("﻿\"Name\",\"Email\""));
  assert.match(csv, /"Ana Silva","a@x.com","077","Software Engineer","Junior \/ Associate","Acme","","","Current role",""/);
});
