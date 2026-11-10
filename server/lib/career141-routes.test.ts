// Find in CAREER141's proxy, run against a fake CAREER141 and an in-memory database: nothing real is reached.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

// ── the database: contacts by email, lists, links ──
// One folder holding one list that already has a member (id 50), as a real Brevo would.
const db = {
  contacts: new Map<string, { id: number; email: string; status: string; [k: string]: unknown }>(),
  lists: [{ id: 1, name: "Engineers", folderId: 1, type: "list" }] as { id: number; name: string; folderId: number; type: string }[],
  folders: [{ id: 1, name: "Campaigns" }] as { id: number; name: string }[],
  links: new Set<string>(["50:1"]),
};
const prisma = {
  folder: {
    findUnique: async ({ where }: any) => db.folders.find((f) => f.id === where.id) ?? null,
  },
  list: {
    findUnique: async ({ where }: any) => db.lists.find((l) => l.id === where.id) ?? null,
    findFirst: async ({ where }: any) =>
      db.lists.find((l) => l.name === where.name && l.folderId === where.folderId && l.type === where.type) ?? null,
    create: async ({ data }: any) => { const l = { id: db.lists.length + 1, ...data }; db.lists.push(l); return l; },
  },
  contact: {
    createMany: async ({ data }: any) => {
      let count = 0;
      for (const c of data) if (!db.contacts.has(c.email)) { db.contacts.set(c.email, { id: db.contacts.size + 1, status: "subscribed", ...c }); count++; }
      return { count };
    },
    findMany: async ({ where }: any) => where.email.in.map((e: string) => db.contacts.get(e)).filter(Boolean),
  },
  contactList: {
    createMany: async ({ data }: any) => {
      let count = 0;
      for (const l of data) { const k = `${l.contactId}:${l.listId}`; if (!db.links.has(k)) { db.links.add(k); count++; } }
      return { count };
    },
  },
};
mock.module("../prisma.js", { exports: { prisma } });
const { career141Router } = await import("../routes/career141.js");

// ── a fake CAREER141 that records what it was sent ──
const ID = "k57search_0001";
const seen: { method: string; url: string; auth?: string; body?: any }[] = [];
let state = { status: "done", rule: { label: "Junior developers" } };
let stopAnswer = (send: (s: number, b: unknown) => void) => send(200, { id: ID, status: "done" });
const pages: Record<string, any> = {
  "": { rows: [{ email: "a@x.com", name: "Ana Silva", title: "Developer", level: "Junior / Associate", kind: "current" }], nextCursor: "c2" },
  c2: { rows: [{ email: "old@x.com", name: "Old Timer", title: "Programmer", kind: "previous" }], nextCursor: null },
};
const ta = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
  const url = new URL(req.url!, "http://x");
  const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const base = "/integrations/v1/contacts/discover";
  if (url.pathname === base) {
    const q = JSON.parse(raw).query as string;
    if (q.includes("key")) return send(401, { error: "Unauthorized" });
    if (q.includes("nothing")) return send(422, { error: "That request names no job." });
    return send(201, { id: ID, readBy: "model", rule: state.rule });
  }
  if (url.pathname === `${base}/${ID}`) return send(200, { id: ID, ...state });
  if (url.pathname === `${base}/${ID}/rows`) return send(200, pages[url.searchParams.get("cursor") ?? ""]);
  if (url.pathname === `${base}/${ID}/rows.csv`) {
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="Contacts - x.csv"' });
    return res.end("Name,Email\nAna,a@x.com\n");
  }
  if (url.pathname === `${base}/${ID}/run`) return send(409, { error: "Another search is running." });
  if (url.pathname === `${base}/${ID}/stop`) return stopAnswer(send);
  send(404, { error: "Unknown" });
});

const app = express();
app.use(express.json());
app.use(career141Router({ requesterEmail: async () => "signed.in@career141.com" }));
const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));
const brevo = http.createServer(app);
const [taPort, port] = await Promise.all([listen(ta), listen(brevo)]);
test.after(() => { ta.close(); brevo.close(); });

process.env.CAREER141_API_URL = `http://127.0.0.1:${taPort}/`;
process.env.CAREER141_CONTACTS_TOKEN = "test-token";
const call = (path: string, init?: RequestInit) =>
  fetch(`http://127.0.0.1:${port}/api/career141${path}`, { ...init, headers: { "content-type": "application/json" } });
const post = (path: string, body: unknown) => call(path, { method: "POST", body: JSON.stringify(body) });

test("who asked comes from the sign-in, never the browser, and the key goes only to CAREER141", async () => {
  const r = await post("/discover", { query: "Find all Junior Developers", requestedBy: "spoofed@evil.com" });
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { id: ID, readBy: "model", rule: { label: "Junior developers" } });
  const sent = seen.at(-1)!;
  assert.deepEqual(sent.body, { query: "Find all Junior Developers", requestedBy: "signed.in@career141.com" });
  assert.equal(sent.auth, "Bearer test-token");
});

test("CAREER141's refusals pass through; a refused key says whose to fix", async () => {
  const none = await post("/discover", { query: "nothing at all" });
  assert.equal(none.status, 422);
  assert.equal((await none.json()).error, "That request names no job.");
  const busy = await post(`/discover/${ID}/run`, { rule: { titles: ["developer"] } });
  assert.equal(busy.status, 409);
  const key = await post("/discover", { query: "bad key" });
  assert.equal(key.status, 502);
  assert.match((await key.json()).error, /CAREER141_CONTACTS_TOKEN/);
});

test("only plain ids are forwarded", async () => {
  const before = seen.length;
  assert.equal((await call("/discover/..%2F..%2Ftables%2Fusers")).status, 400);
  assert.equal((await call("/discover/short")).status, 400);
  assert.equal(seen.length, before);
});

test("the CSV streams through with CAREER141's file name", async () => {
  const r = await call(`/discover/${ID}/csv`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition") ?? "", /Contacts - x\.csv/);
  assert.equal(await r.text(), "Name,Email\nAna,a@x.com\n");
});

test("save into a NEW list: every page read, named by the person, in their folder; Brevo statuses kept", async () => {
  db.contacts.set("a@x.com", { id: 99, email: "a@x.com", status: "unsubscribed" });
  const r = await post(`/discover/${ID}/save`, { newList: { name: "  Junior devs Nov  ", folderId: 1 } });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.listName, "Junior devs Nov");
  assert.equal(db.lists.find((l) => l.id === out.listId)!.folderId, 1);
  assert.equal(out.saved, 2); // both pages of rows
  assert.equal(out.addedToList, 2);
  assert.equal(out.alreadyInList, 0);
  assert.equal(out.newToBrevo, 1);
  assert.equal(db.contacts.get("a@x.com")!.status, "unsubscribed");
  const added = db.contacts.get("old@x.com")!;
  assert.equal(added.source, "career141");
  assert.equal(added.designation, "Programmer");
  assert.ok(db.links.has(`99:${out.listId}`) && db.links.has(`${added.id}:${out.listId}`));
  // The same name again in that folder would mix two lists: refused, with words.
  const twice = await post(`/discover/${ID}/save`, { newList: { name: "Junior devs Nov", folderId: 1 } });
  assert.equal(twice.status, 409);
  assert.match((await twice.json()).error, /already a list in this folder/);
});

test("save into an EXISTING list keeps its people and skips anyone already in it", async () => {
  const oldId = db.contacts.get("old@x.com")!.id;
  db.links.add(`${oldId}:1`); // already in Engineers
  const r = await post(`/discover/${ID}/save`, { listId: 1 });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.listName, "Engineers");
  assert.equal(out.saved, 2);
  assert.equal(out.addedToList, 1);
  assert.equal(out.alreadyInList, 1);
  assert.equal(out.newToBrevo, 0);
  assert.ok(db.links.has("50:1")); // the member it had before is still there
});

test("a narrowed save keeps only chosen people CAREER141 found", async () => {
  const r = await post(`/discover/${ID}/save`, { listId: 1, emails: ["OLD@x.com", "stranger@evil.com"] });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).saved, 1);
  assert.ok(!db.contacts.has("stranger@evil.com"));
  assert.equal((await post(`/discover/${ID}/save`, { listId: 1, emails: [] })).status, 400);
  assert.equal((await post(`/discover/${ID}/save`, { listId: 1, emails: "a@x.com" })).status, 400);
});

test("save needs exactly one place to go, and a place that exists", async () => {
  const bad = async (body: unknown, status: number) => assert.equal((await post(`/discover/${ID}/save`, body)).status, status, JSON.stringify(body));
  await bad({}, 400);
  await bad({ listId: 1, newList: { name: "X", folderId: 1 } }, 400);
  await bad({ newList: { name: "", folderId: 1 } }, 400);
  await bad({ newList: { name: "X" } }, 400);
  await bad({ newList: { name: "x".repeat(192), folderId: 1 } }, 400);
  await bad({ newList: { name: "X", folderId: 99 } }, 400);
  await bad({ listId: 999 }, 404);
});

test("stop goes to CAREER141; an older CAREER141 without Stop is said plainly", async () => {
  const ok = await post(`/discover/${ID}/stop`, {});
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { id: ID, status: "done" });
  assert.equal(seen.at(-1)!.method, "POST");
  assert.match(seen.at(-1)!.url, /\/stop$/);
  stopAnswer = (send) => send(404, { error: "Not found" });
  const old = await post(`/discover/${ID}/stop`, {});
  assert.equal(old.status, 501);
  assert.match((await old.json()).error, /needs an update/);
  stopAnswer = (send) => send(409, { error: "This search has not started, so there is nothing to stop." });
  assert.equal((await post(`/discover/${ID}/stop`, {})).status, 409);
});

test("save waits for a finished search", async () => {
  state = { ...state, status: "running" };
  const r = await post(`/discover/${ID}/save`, { listId: 1 });
  assert.equal(r.status, 409);
  state = { ...state, status: "done" };
});

test("says when CAREER141 is not connected", async () => {
  assert.deepEqual(await (await call("")).json(), { connected: true });
  const token = process.env.CAREER141_CONTACTS_TOKEN;
  delete process.env.CAREER141_CONTACTS_TOKEN;
  const r = await call(`/discover/${ID}`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "CAREER141 is not connected.");
  assert.deepEqual(await (await call("")).json(), { connected: false });
  process.env.CAREER141_CONTACTS_TOKEN = token;
});
