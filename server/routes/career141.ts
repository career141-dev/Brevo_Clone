/**
 * Find in CAREER141 (9 Nov 2026): the server half. Every call is forwarded to CAREER141's contact discovery API
 * (ta-system docs/CONTACT-DISCOVERY-API.md) with the key, which lives only here and never reaches the browser.
 * CAREER141's status codes and its "error" words pass through as they are. Nothing here sends anything to anyone:
 * the page only reads people and saves them into a list.
 */
import { Readable } from "node:stream";
import { Router, type Request, type Response } from "express";
import { prisma } from "../prisma.js";
import { career141Contacts, listNameFor, SEARCH_ID, type Career141Row } from "../lib/career141.js";
import { fillList } from "../lib/list-fill.js";

const cleanEnv = (v?: string) => (v ?? "").replace(/["']/g, "").trim();
const settings = () => ({
  base: cleanEnv(process.env.CAREER141_API_URL).replace(/\/+$/, ""),
  token: cleanEnv(process.env.CAREER141_CONTACTS_TOKEN),
});

/** Who is asking, read from the sign-in in index.ts. Anyone the app lets in may use the page (owner, 9 Nov 2026). */
export type Career141Access = {
  requesterEmail: (req: Request) => Promise<string | null>;
};

async function call(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<globalThis.Response> {
  const { base, token } = settings();
  return fetch(`${base}/integrations/v1/contacts/discover${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  });
}

type Answer = { status: number; body: { error?: string; [k: string]: unknown } };
const why = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** CAREER141's answer as it is, except a refused key: that is ours to fix, not the person's sign-in. */
async function answer(up: globalThis.Response): Promise<Answer> {
  if (up.status === 401) return { status: 502, body: { error: "CAREER141 refused Brevo's key. An admin needs to check CAREER141_CONTACTS_TOKEN." } };
  const body = (await up.json().catch(() => ({ error: `CAREER141 answered ${up.status}.` }))) as Answer["body"];
  return { status: up.status, body };
}

async function forward(res: Response, path: string, init?: Parameters<typeof call>[1]) {
  try {
    const a = await answer(await call(path, init));
    res.status(a.status).json(a.body);
  } catch (err) {
    console.error("[CAREER141] request failed:", why(err));
    res.status(502).json({ error: "Could not reach CAREER141. Try again in a minute." });
  }
}

class Refused extends Error {
  constructor(readonly a: Answer) { super(a.body.error ?? `CAREER141 answered ${a.status}.`); }
}

/** Every page of rows of a finished search. CAREER141 caps a page at 500. */
async function allRows(id: string): Promise<Career141Row[]> {
  const rows: Career141Row[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 1000; guard++) {
    const qs = new URLSearchParams({ limit: "500", ...(cursor ? { cursor } : {}) });
    const a = await answer(await call(`/${id}/rows?${qs}`));
    if (a.status !== 200) throw new Refused(a);
    rows.push(...((a.body.rows as Career141Row[]) ?? []));
    if (!a.body.nextCursor) return rows;
    cursor = String(a.body.nextCursor);
  }
  throw new Error("The list is longer than expected. Download it as Excel instead.");
}

export function career141Router(access: Career141Access) {
  const router = Router();

  // What the page needs before anything is typed: is CAREER141 connected.
  router.get("/api/career141", (_req, res) => {
    const { base, token } = settings();
    res.json({ connected: Boolean(base && token) });
  });

  router.use("/api/career141", (_req, res, next) => {
    const { base, token } = settings();
    if (!base || !token) return res.status(503).json({ error: "CAREER141 is not connected." });
    next();
  });

  router.param("id", (_req, res, next, id) => (SEARCH_ID.test(String(id)) ? next() : res.status(400).json({ error: "That search id is not valid." })));

  router.post("/api/career141/discover", async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) return res.status(400).json({ error: "Type who you want to find." });
    if (query.length > 500) return res.status(400).json({ error: "Keep the request under 500 characters." });
    // Who asked comes from the sign-in, never from the browser: CAREER141 keeps it with the search.
    const requestedBy = await access.requesterEmail(req).catch(() => null);
    if (!requestedBy) return res.status(503).json({ error: "Could not read your email from the sign-in. Try again." });
    await forward(res, "", { method: "POST", body: { query, requestedBy }, timeoutMs: 60_000 });
  });

  router.post("/api/career141/discover/:id/run", (req, res) =>
    forward(res, `/${req.params.id}/run`, { method: "POST", body: req.body?.rule ? { rule: req.body.rule } : {} }));

  router.get("/api/career141/discover/:id", (req, res) => forward(res, `/${req.params.id}`));

  router.get("/api/career141/discover/:id/rows", (req, res) => {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor.slice(0, 2048) : "";
    const qs = new URLSearchParams({ limit: "500", ...(cursor ? { cursor } : {}) });
    return forward(res, `/${req.params.id}/rows?${qs}`);
  });

  // The whole list as CAREER141's CSV, streamed through as it comes.
  router.get("/api/career141/discover/:id/csv", async (req, res) => {
    try {
      const up = await call(`/${req.params.id}/rows.csv`, { timeoutMs: 120_000 });
      if (!up.ok || !up.body) {
        const a = await answer(up);
        return res.status(a.status).json(a.body);
      }
      res.setHeader("Content-Type", up.headers.get("content-type") ?? "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", up.headers.get("content-disposition") ?? 'attachment; filename="career141-contacts.csv"');
      res.setHeader("Cache-Control", "no-store");
      Readable.fromWeb(up.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } catch (err) {
      console.error("[CAREER141] csv failed:", why(err));
      if (!res.headersSent) res.status(502).json({ error: "Could not reach CAREER141. Try again in a minute." });
    }
  });

  // Save as list: every row of a finished search into one Brevo list. Emails already here keep their status.
  // ponytail: runs inside the request; fine for tens of thousands of rows, a background job if lists grow past that.
  router.post("/api/career141/discover/:id/save", async (req, res) => {
    const id = req.params.id;
    try {
      const st = await answer(await call(`/${id}`));
      if (st.status !== 200) return res.status(st.status).json(st.body);
      const search = st.body as { status?: string; rule?: { label?: string } };
      if (search.status !== "done") return res.status(409).json({ error: "Wait until the search has finished." });

      const contacts = career141Contacts(await allRows(id));
      if (contacts.length === 0) return res.status(400).json({ error: "The search found nobody with an email to save." });

      const folder = (await prisma.folder.findFirst({ where: { name: "CAREER141" } })) ?? (await prisma.folder.create({ data: { name: "CAREER141" } }));
      const name = listNameFor(search.rule?.label);
      // The same search saved twice on one day fills the same list rather than making a second one.
      const list = (await prisma.list.findFirst({ where: { name, type: "list" } })) ??
        (await prisma.list.create({ data: { name, folderId: folder.id, type: "list" } }));
      const { created, existing } = await fillList(list.id, contacts);
      res.json({ listId: list.id, listName: list.name, added: created, alreadyHad: existing });
    } catch (err) {
      if (err instanceof Refused) return res.status(err.a.status).json(err.a.body);
      console.error("[CAREER141] save failed:", why(err));
      res.status(502).json({ error: "Could not save the list. Try again." });
    }
  });

  return router;
}
