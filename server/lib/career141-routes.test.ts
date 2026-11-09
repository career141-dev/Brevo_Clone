// Find in CAREER141's proxy, run against a fake CAREER141 and an in-memory database: nothing real is reached.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

// ── the database: contacts by email, lists, links ──
const db = {
  contacts: new Map<string, { id: number; email: string; status: string; [k: string]: unknown }>(),
  lists: [] as { id: number; name: string; folderId: number; type: string }[],
  folders: [] as { id: number; name: string }[],
  links: new Set<string>(),
};
const prisma = {
  folder: {
    findFirst: async ({ where }: any) => db.folders.find((f) => f.name === where.name) ?? null,
    create: async ({ data }: any) => { const f = { id: db.folders.length + 1, ...data }; db.folders.push(f); return f; },
  },
  list: {
    findFirst: async ({ where }: any) => db.lists.find((l) => l.name === where.name) ?? null,
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
    createMany: async ({ data }: any) => { for (const l of data) db.links.add(`${l.contactId}:${l.listId}`); return { count: data.length }; },
  },
};
mock.module("../prisma.js", { exports: { prisma } });
const { career141Router } = await import("../routes/career141.js");

// ── a fake CAREER141 that records what it was sent ──
const ID = "k57search_0001";
const seen: { method: string; url: string; auth?: string; body?: any }[] = [];
let state = { status: "done", rule: { label: "Junior developers" } };
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

test("save reads every page into one list; people already here keep their status", async () => {
  db.contacts.set("a@x.com", { id: 99, email: "a@x.com", status: "unsubscribed" });
  const r = await post(`/discover/${ID}/save`, {});
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.added, 1);
  assert.equal(out.alreadyHad, 1);
  assert.match(out.listName, /^Junior developers - CAREER141 \d{4}-\d{2}-\d{2}$/);
  assert.equal(db.contacts.get("a@x.com")!.status, "unsubscribed");
  const added = db.contacts.get("old@x.com")!;
  assert.equal(added.source, "career141");
  assert.equal(added.designation, "Programmer");
  assert.ok(db.links.has(`99:${out.listId}`) && db.links.has(`${added.id}:${out.listId}`));
  assert.equal(db.folders[0].name, "CAREER141");
  // The same search saved again the same day fills the same list.
  const again = await (await post(`/discover/${ID}/save`, {})).json();
  assert.equal(again.listId, out.listId);
  assert.equal(again.added, 0);
});

test("a narrowed save keeps only chosen people CAREER141 found, in a list of its own", async () => {
  const r = await post(`/discover/${ID}/save`, { emails: ["OLD@x.com", "stranger@evil.com"] });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.match(out.listName, /^Junior developers \(1 chosen\) - CAREER141 /);
  assert.equal(out.added + out.alreadyHad, 1);
  assert.ok(!db.contacts.has("stranger@evil.com"));
  assert.equal((await post(`/discover/${ID}/save`, { emails: [] })).status, 400);
  assert.equal((await post(`/discover/${ID}/save`, { emails: "a@x.com" })).status, 400);
});

test("save waits for a finished search", async () => {
  state = { ...state, status: "running" };
  const r = await post(`/discover/${ID}/save`, {});
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
