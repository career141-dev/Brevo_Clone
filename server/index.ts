import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { clerkMiddleware, getAuth, verifyToken } from "@clerk/express";
import { WORKSPACE_USER_ID } from "./prisma.js";
import { resumeSendingCampaigns, stopSending } from "./lib/campaign-sender.js";
import { analyticsRouter } from "./routes/analytics.js";
import { billingRouter } from "./routes/billing.js";
import { brevoRouter } from "./routes/brevo.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { crmRouter } from "./routes/crm.js";
import { eventsRouter } from "./routes/events.js";
import { downloadRouter, uploadRouter, uploadsDir } from "./routes/files.js";
import { sendersRouter } from "./routes/senders.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

// Required for Railway / reverse proxy environments — trusts the first proxy hop
// This allows express-rate-limit to correctly read X-Forwarded-For headers
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(uploadsDir, {
  setHeaders: (res, filePath) => {
    if (!/\.(png|jpe?g|gif|webp)$/i.test(filePath)) res.setHeader("Content-Disposition", "attachment");
  },
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  // Tracking pixels/links, unsubscribe and SNS webhooks come from recipients' (often shared) IPs and AWS —
  // limiting them silently drops opens/clicks/bounces. The progress poll is also exempt.
  skip: (req) => /^\/api\/(track|webhooks|unsubscribe)(\/|\?|$)/.test(req.originalUrl) || /^\/api\/campaigns\/\d+\/progress/.test(req.originalUrl),
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", apiLimiter);

// Sending and file routes are expensive or abusable, so they get a much lower limit than ordinary reads.
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many requests, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(/^\/api\/(upload|download|campaigns\/\d+\/(send|resume|send-test))/, sensitiveLimiter);

// Public on purpose: recipients open attachment links from emails. Mounted after the limiters so they apply.
app.use(downloadRouter);
// Auth: set CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY to require a signed-in Clerk user on every /api route except
// tracking/unsubscribe/webhooks (those are public by design). Optional ALLOWED_USER_IDS=id1,id2 restricts who may use
// the app (otherwise anyone who can sign up on your Clerk instance can see all data and send via SES).
// Every signed-in user works in the one shared team workspace.
// Without the keys the API runs unauthenticated in that same workspace.
// Quotes/whitespace are stripped because Railway's form editor keeps them literally when pasted from a .env line.
const cleanEnv = (v?: string) => (v ?? "").replace(/["']/g, "").trim();
const CLERK_SECRET_KEY = cleanEnv(process.env.CLERK_SECRET_KEY);
const CLERK_PUBLISHABLE_KEY = cleanEnv(process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY);
const CLERK_ENABLED = Boolean(CLERK_SECRET_KEY);
const PUBLIC_API = /^\/api\/(track|unsubscribe|webhooks)(\/|\?|$)/;
// Team accounts are allowed from code so access never depends on the Railway variable being edited correctly;
// ALLOWED_USER_IDS can still add more.
const TEAM_USER_IDS = [
  WORKSPACE_USER_ID, // sanjeevsivasuthakaran@gmail.com (owns the data)
  "user_3EWBGeBqi9dxi5mlkRgX51G7LGA", // sanjaysanjeev2000@gmail.com
  "user_3EtWIDT0SkIWh03rVqpGcOzkgFn", // uzmaan@career141.com
];
const ALLOWED_USER_IDS = [...new Set([...TEAM_USER_IDS, ...cleanEnv(process.env.ALLOWED_USER_IDS).split(",").map((s) => s.trim()).filter(Boolean)])];
const IS_DEPLOYED = process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME);
if (!CLERK_ENABLED && IS_DEPLOYED) throw new Error("CLERK_SECRET_KEY is required in production: refusing to start with an open API.");
if (!CLERK_ENABLED) console.warn("[AUTH] CLERK_SECRET_KEY not set: API is running UNAUTHENTICATED as a single fixed user.");
else console.log(`[AUTH] Clerk enabled, allowed users: ${ALLOWED_USER_IDS.join(", ") || "ANY signed-in user"}`);
if (CLERK_ENABLED) app.use("/api/", clerkMiddleware({ secretKey: CLERK_SECRET_KEY, publishableKey: CLERK_PUBLISHABLE_KEY }));
app.use("/api/", async (req: any, res: any, next: any) => {
  if (!CLERK_ENABLED) return next();
  if (PUBLIC_API.test(req.originalUrl)) return next();
  const userId = getAuth(req).userId;
  if (!userId) {
    // Re-run verification only to log Clerk's real error (server logs only; the token itself is never logged).
    const bearer = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      const detail = await verifyToken(bearer, { secretKey: CLERK_SECRET_KEY }).then(
        (r: any) => r?.errors?.[0]?.message ?? "token verified but middleware saw no user",
        (e: any) => e?.message ?? String(e),
      );
      console.warn(`[AUTH] 401 invalid token: ${detail}`);
    }
    return res.status(401).json({ error: "Unauthorized", reason: "not signed in" });
  }
  if (ALLOWED_USER_IDS.length > 0 && !ALLOWED_USER_IDS.includes(userId)) {
    console.warn(`[AUTH] rejected ${userId}: not in allowed users (${ALLOWED_USER_IDS.join(", ")})`);
    return res.status(401).json({ error: "Unauthorized", reason: "this account is not allowed to use the app" });
  }
  next();
});

// Body parsing runs after auth so anonymous callers can't force 50MB parses. Public routes bring their own small parsers.
const parseJson = express.json({ limit: "50mb" });
const parseForm = express.urlencoded({ limit: "50mb", extended: true });
app.use((req: any, res: any, next: any) => (PUBLIC_API.test(req.originalUrl) ? next() : parseJson(req, res, next)));
app.use((req: any, res: any, next: any) => (PUBLIC_API.test(req.originalUrl) ? next() : parseForm(req, res, next)));

app.use(uploadRouter);
app.use(crmRouter);
app.use(campaignsRouter);
app.use(analyticsRouter);
app.use(brevoRouter);
app.use(eventsRouter);
app.use(sendersRouter);
app.use(billingRouter);

// ── Static frontend (production) ────────────────────────────────────

const distPath = path.resolve(__dirname, "../../dist");

app.use(express.static(distPath));

// All non-API routes return the React app so client-side routing works
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// Last resort: never send stack traces or internal details to the browser.
app.use((err: any, _req: any, res: any, next: any) => {
  if (res.headersSent) return next(err);
  console.error("[API ERROR]", err);
  res.status(err?.status ?? 500).json({ error: err?.status === 413 ? "Request is too large." : "Something went wrong." });
});

// ── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Resume campaigns left in "sending" by a crash/redeploy (replaces the old startup reset). Only on deployed instances:
// a dev machine pointed at the production DB must never start sending someone else's campaign. The campaign lease in
// campaign-sender.ts keeps overlapping instances from sending the same campaign.
if (IS_DEPLOYED || process.env.ENABLE_SENDER_SWEEP) {
  const sweep = () => resumeSendingCampaigns().catch((e) => console.error("Sender sweep failed:", e));
  void sweep();
  setInterval(sweep, 60_000);
}

// Railway sends SIGTERM on redeploy: let in-flight email chunks finish and save before exiting.
process.on("SIGTERM", () => {
  void stopSending().finally(() => process.exit(0));
});
