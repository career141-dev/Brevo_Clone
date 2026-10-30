import { Router } from "express";
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { prisma } from "../prisma.js";
import { getCached, setCache } from "../lib/analytics-cache.js";

export const billingRouter = Router();
const router = billingRouter;

// ── Billing & Costs ──────────────────────────────────────────────────

// AWS SES pricing: $0.10 per 1,000 emails
const SES_PRICE_PER_EMAIL_USD = 0.10 / 1000;

// GET /api/billing/exchange-rate — live USD → LKR rate (cached 5 min)
router.get("/api/billing/exchange-rate", async (_req, res) => {
  try {
    const cacheKey = "billing:exchange-rate";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    const data: any = await response.json();
    const lkrRate = data?.rates?.LKR ?? 300;
    const result = {
      usd_to_lkr: lkrRate,
      updated_at: new Date().toISOString(),
      source: "open.er-api.com",
    };
    setCache(cacheKey, result, 5 * 60 * 1000); // cache for 5 minutes
    res.json(result);
  } catch (err: any) {
    console.error("Exchange rate fetch error:", err);
    // Return a fallback rate if API fails
    res.json({ usd_to_lkr: 300, updated_at: new Date().toISOString(), source: "fallback" });
  }
});

// GET /api/billing/aws-costs — real cost data from AWS Cost Explorer
router.get("/api/billing/aws-costs", async (req, res) => {
  try {
    const range = (req.query.range as string) || "current_month";
    const now = new Date();
    
    // AWS Cost Explorer MONTHLY granularity requires Start and End to be exactly the 1st of the month.
    // The End date is exclusive.
    let startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    if (range === "last_30") {
      // For last 30 days, we'll span the previous month and current month
      startMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else if (range === "all_time") {
      // For all time, we go back exactly 12 months (maximum allowed by AWS by default)
      startMonth = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    }

    const formatYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const startDate = formatYMD(startMonth);
    const endDate = formatYMD(endMonth);

    const costClient = new CostExplorerClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const command = new GetCostAndUsageCommand({
      TimePeriod: { Start: startDate, End: endDate },
      Granularity: "MONTHLY",
      Filter: {
        Dimensions: {
          Key: "SERVICE",
          Values: ["Amazon Simple Email Service"],
        },
      },
      Metrics: ["UnblendedCost"],
    });

    const costData = await costClient.send(command);
    let totalCostUsd = 0;
    const monthlyBreakdown: any[] = [];

    for (const result of costData.ResultsByTime ?? []) {
      const amount = parseFloat(result.Total?.UnblendedCost?.Amount ?? "0");
      totalCostUsd += amount;
      monthlyBreakdown.push({
        period: result.TimePeriod?.Start,
        cost_usd: amount,
        unit: result.Total?.UnblendedCost?.Unit ?? "USD",
      });
    }

    res.json({
      total_cost_usd: totalCostUsd,
      range,
      period: { start: startDate, end: endDate },
      monthly_breakdown: monthlyBreakdown,
    });
  } catch (err: any) {
    console.error("AWS Cost Explorer error:", err);
    // If Cost Explorer access is denied or fails, return a graceful error
    if (err.name === "AccessDeniedException" || err.Code === "AccessDeniedException") {
      return res.status(403).json({
        error: "AWS Cost Explorer Access Denied",
        detail: "Please ensure the IAM user has 'ce:GetCostAndUsage' permission.",
      });
    }
    res.status(500).json({ error: "Failed to fetch AWS cost data", detail: err.message });
  }
});

// GET /api/billing/summary — SES-derived cost per campaign + totals
router.get("/api/billing/summary", async (req, res) => {
  try {
    const range = (req.query.range as string) || "current_month";
    const cacheKey = `billing:summary:${range}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    let dateFilter: any = undefined;

    if (range === "current_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { gte: startOfMonth };
    } else if (range === "last_30") {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter = { gte: thirtyDaysAgo };
    }
    // all_time: no filter

    const campaigns = await prisma.campaign.findMany({
      where: {
        ...(dateFilter ? { sentAt: dateFilter } : {}),
      },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        sentAt: true,
        createdAt: true,
        totalRecipients: true,
        fromEmail: true,
      },
    });

    const rows = campaigns.map((c) => {
      const emails = c.totalRecipients || 0;
      const costUsd = emails * SES_PRICE_PER_EMAIL_USD;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        sentAt: c.sentAt,
        createdAt: c.createdAt,
        fromEmail: c.fromEmail,
        emailsSent: emails,
        cost_usd: Math.round(costUsd * 10000) / 10000, // 4 decimal places
      };
    });

    const totalEmailsSent = rows.reduce((sum, r) => sum + r.emailsSent, 0);
    const totalCostUsd = rows.reduce((sum, r) => sum + r.cost_usd, 0);

    const result = {
      range,
      campaigns: rows,
      summary: {
        total_emails_sent: totalEmailsSent,
        total_cost_usd: Math.round(totalCostUsd * 10000) / 10000,
        campaign_count: rows.length,
        sent_campaign_count: rows.filter((r) => r.status === "sent").length,
      },
      pricing_note: "Calculated at $0.10 per 1,000 emails (AWS SES standard rate)",
    };

    setCache(cacheKey, result, 5 * 60 * 1000); // 5 min cache
    res.json(result);
  } catch (err: any) {
    console.error("Billing summary error:", err);
    res.status(500).json({ error: "Failed to fetch billing summary", detail: err.message });
  }
});
