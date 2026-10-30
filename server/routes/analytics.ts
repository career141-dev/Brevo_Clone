import { Router } from "express";
import { Prisma } from "@prisma/client";
import { UAParser } from "ua-parser-js";
import { prisma } from "../prisma.js";
import { getCached, setCache } from "../lib/analytics-cache.js";

export const analyticsRouter = Router();
const router = analyticsRouter;

// ── Analytics ───────────────────────────────────────────────────────

router.get('/api/analytics/campaigns', async (req, res) => {
  try {
    const cached = getCached('analytics:campaigns');
    if (cached) return res.json(cached);

    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // High-performance single SQL aggregation — handles 48k+ campaign events in ~5ms
    const eventStats = await prisma.$queryRaw<any[]>`
      SELECT 
        campaignId,
        eventType,
        COUNT(DISTINCT email) as uniqueCount,
        COUNT(1) as totalCount
      FROM email_events
      WHERE campaignId IS NOT NULL
      GROUP BY campaignId, eventType
    `;

    const statsMap: Record<number, Record<string, { unique: number; total: number }>> = {};
    for (const row of eventStats) {
      const cId = Number(row.campaignId);
      if (!statsMap[cId]) statsMap[cId] = {};
      statsMap[cId][row.eventType] = {
        unique: Number(row.uniqueCount || 0),
        total: Number(row.totalCount || 0),
      };
    }

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 10000) / 100 : 0;

    const result = campaigns.map((campaign) => {
      const cStats = statsMap[campaign.id] || {};
      
      const recipients = campaign.totalRecipients || 0;
      const delivered = cStats['delivered']?.unique || 0;
      const opened = cStats['opened']?.unique || 0;
      const clicked = cStats['clicked']?.unique || 0;
      const rawClicks = cStats['clicked']?.total || 0;
      const bounced = cStats['bounced']?.unique || 0;
      const unsub = cStats['unsubscribed']?.unique || 0;
      const complained = cStats['complained']?.unique || 0;

      return {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        fromEmail: campaign.fromEmail,
        fromName: campaign.fromName,
        sentAt: campaign.sentAt,
        createdAt: campaign.createdAt,
        stats: {
          recipients,
          delivered,
          opened,
          clicked: rawClicks > 0 ? rawClicks : clicked,
          uniqueClicked: clicked,
          bounced,
          unsubscribed: unsub,
          complained,
          deliveryRate: pct(delivered, recipients),
          openRate: pct(opened, delivered || recipients),
          clickRate: pct(clicked, delivered || recipients),
          bounceRate: pct(bounced, recipients),
          unsubscribeRate: pct(unsub, delivered || recipients),
          complaintRate: pct(complained, delivered || recipients),
          clickToOpenRate: pct(clicked, opened),
        },
      };
    });

    setCache('analytics:campaigns', result, 30 * 1000);
    res.json(result);
  } catch (err: any) {
    console.error("Analytics fetch error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

router.get('/api/analytics/campaigns/:id', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const cacheKey = `analytics:campaign:${campaignId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, subject: true, status: true, fromEmail: true, fromName: true, sentAt: true, createdAt: true, audienceType: true, audienceId: true, totalRecipients: true },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Totals, domains, links and time-to-open/click are aggregated in SQL; only opens/clicks are loaded as rows
    // (device/browser/timeline parsing needs them) instead of the campaign's entire event history.
    const [countRows, domainRows, linkRows, engagementEvents, avgRows, timeline] = await Promise.all([
      prisma.$queryRaw<{ eventType: string; uniq: bigint; total: bigint }[]>`
        SELECT eventType, COUNT(DISTINCT email) AS uniq, COUNT(*) AS total
        FROM email_events WHERE campaignId = ${campaignId} GROUP BY eventType`,
      prisma.$queryRaw<{ domain: string; eventType: string; n: bigint }[]>`
        SELECT LOWER(SUBSTRING_INDEX(email, '@', -1)) AS domain, eventType, COUNT(DISTINCT email) AS n
        FROM email_events
        WHERE campaignId = ${campaignId} AND eventType IN ('sent', 'delivered', 'opened', 'clicked', 'bounced')
        GROUP BY domain, eventType`,
      prisma.$queryRaw<{ url: string; n: bigint }[]>`
        SELECT url, COUNT(*) AS n FROM email_events
        WHERE campaignId = ${campaignId} AND eventType = 'clicked' AND url IS NOT NULL
        GROUP BY url ORDER BY n DESC LIMIT 10`,
      prisma.emailEvent.findMany({
        where: { campaignId, eventType: { in: ['opened', 'clicked'] } },
        select: { eventType: true, email: true, userAgent: true, timestamp: true },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.$queryRaw<{ avgOpen: any; avgClick: any }[]>`
        WITH s AS (SELECT LOWER(email) AS e, MIN(timestamp) AS t FROM email_events WHERE campaignId = ${campaignId} AND eventType = 'sent' GROUP BY LOWER(email)),
             o AS (SELECT LOWER(email) AS e, MIN(timestamp) AS t FROM email_events WHERE campaignId = ${campaignId} AND eventType = 'opened' GROUP BY LOWER(email)),
             c AS (SELECT LOWER(email) AS e, MIN(timestamp) AS t FROM email_events WHERE campaignId = ${campaignId} AND eventType = 'clicked' GROUP BY LOWER(email))
        SELECT
          (SELECT AVG(TIMESTAMPDIFF(MICROSECOND, s.t, o.t)) FROM s JOIN o ON o.e = s.e) AS avgOpen,
          (SELECT AVG(TIMESTAMPDIFF(MICROSECOND, COALESCE(o.t, s.t), c.t)) FROM c LEFT JOIN o ON o.e = c.e LEFT JOIN s ON s.e = c.e WHERE COALESCE(o.t, s.t) IS NOT NULL) AS avgClick`,
      prisma.emailEvent.findMany({
        where: { campaignId },
        orderBy: { timestamp: 'desc' },
        take: 50,
        select: { eventType: true, email: true, timestamp: true },
      }),
    ]);

    const c: Record<string, number> = {};
    for (const r of countRows) c[r.eventType] = Number(r.uniq);
    const rawClicks = Number(countRows.find((r) => r.eventType === 'clicked')?.total ?? 0);

    const domainStats: Record<string, { sent: number; delivered: number; opened: number; clicked: number; bounced: number }> = {};
    for (const r of domainRows) {
      if (!r.domain) continue;
      const d = (domainStats[r.domain] ??= { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 });
      d[r.eventType as 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced'] = Number(r.n);
    }
    const topDomains = Object.entries(domainStats)
      .sort((a, b) => b[1].sent - a[1].sent)
      .slice(0, 5)
      .map(([domain, stats]) => ({ domain, ...stats }));

    const topLinks = linkRows.map((r) => ({ url: r.url, count: Number(r.n) }));

    const parser = new UAParser();
    const devices = { desktop: 0, mobile: 0, tablet: 0, other: 0 };
    const browsers: Record<string, number> = {};
    const engagementTimelineMap: Record<string, { time: string; opens: number; clicks: number }> = {};
    const processedEngagement = new Set<string>();
    const engagementHeatmap = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));

    for (const e of engagementEvents) {
      engagementHeatmap[e.timestamp.getHours()].count++;

      if (e.userAgent) {
        // Deduplicate UA parsing per user action type so repeated clicks don't skew the split
        const uaKey = `${e.eventType}:${e.email}:${e.userAgent}`;
        if (!processedEngagement.has(uaKey)) {
          processedEngagement.add(uaKey);
          parser.setUA(e.userAgent);
          const result = parser.getResult();
          const deviceType = result.device.type || 'desktop';
          if (['mobile', 'tablet'].includes(deviceType)) {
            devices[deviceType as 'mobile' | 'tablet']++;
          } else if (['smarttv', 'console', 'wearable', 'embedded'].includes(deviceType)) {
            devices.other++;
          } else {
            devices.desktop++;
          }
          const browser = result.browser.name || 'Unknown';
          browsers[browser] = (browsers[browser] || 0) + 1;
        }
      }

      // Timeline: one entry per user action type per hour
      const hourString = e.timestamp.toISOString().substring(0, 13) + ':00:00.000Z';
      const tlKey = `${e.eventType}:${e.email}:${hourString}`;
      if (!processedEngagement.has(tlKey)) {
        processedEngagement.add(tlKey);
        if (!engagementTimelineMap[hourString]) {
          const timeLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', hour12: true }).format(new Date(hourString));
          engagementTimelineMap[hourString] = { time: timeLabel, opens: 0, clicks: 0 };
        }
        if (e.eventType === 'opened') engagementTimelineMap[hourString].opens++;
        if (e.eventType === 'clicked') engagementTimelineMap[hourString].clicks++;
      }
    }

    const topBrowsers = Object.entries(browsers)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const engagementTimeline = Object.entries(engagementTimelineMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(entry => entry[1]);

    const avgOpen = avgRows[0]?.avgOpen;
    const avgClick = avgRows[0]?.avgClick;
    const averageTimeToOpen = avgOpen != null ? Math.round(Number(avgOpen) / 1e6) : null;
    const averageTimeToClick = avgClick != null ? Math.round(Number(avgClick) / 1e6) : null;

    const unsub = c['unsubscribed'] || 0;
    const recipients = campaign.totalRecipients || 0;
    const delivered = c['delivered'] || 0;
    const opened = c['opened'] || 0;
    const clicked = c['clicked'] || 0;
    const bounced = c['bounced'] || 0;
    const complained = c['complained'] || 0;
    const rejected = c['rejected'] || 0;
    const renderingFailures = c['rendering_failure'] || 0;
    const delayed = c['delayed'] || 0;

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 10000) / 100 : 0;

    const result = {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        fromEmail: campaign.fromEmail,
        fromName: campaign.fromName,
        sentAt: campaign.sentAt,
        createdAt: campaign.createdAt,
        audienceType: campaign.audienceType,
        audienceId: campaign.audienceId,
      },
      stats: {
        recipients,
        delivered,
        opened,
        clicked: rawClicks > 0 ? rawClicks : clicked,
        uniqueClicked: clicked,
        bounced,
        unsubscribed: unsub,
        complained,
        rejected,
        renderingFailures,
        delayed,
        deliveryRate: pct(delivered, recipients),
        openRate: pct(opened, delivered),
        clickRate: pct(clicked, delivered),
        clickToOpenRate: pct(clicked, opened),
        bounceRate: pct(bounced, recipients),
        unsubscribeRate: pct(unsub, delivered),
        complaintRate: pct(complained, delivered),
        rejectedRate: pct(rejected, recipients),
        delayRate: pct(delayed, recipients),
      },
      timeline,
      advanced: {
        topLinks,
        devices,
        topBrowsers,
        engagementTimeline,
        topDomains,
        averageTimeToOpen,
        averageTimeToClick,
        engagementHeatmap,
      }
    };

    setCache(cacheKey, result, 30 * 1000);
    res.json(result);
  } catch (err: any) {
    console.error("Analytics detail fetch error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

router.get('/api/analytics/campaigns/:id/contact-events', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const q = (req.query.q as string || "").toLowerCase();

    // Find distinct emails matching the query (paginated)
    let emailCondition = Prisma.empty;
    if (q) {
      emailCondition = Prisma.sql`AND email LIKE ${'%' + q + '%'}`;
    }

    const countResult = await prisma.$queryRaw<any[]>`
      SELECT COUNT(DISTINCT email) as total
      FROM email_events
      WHERE campaignId = ${campaignId}
      ${emailCondition}
    `;
    const total = Number(countResult[0]?.total || 0);

    const distinctEmails = await prisma.$queryRaw<any[]>`
      SELECT email
      FROM email_events
      WHERE campaignId = ${campaignId}
      ${emailCondition}
      GROUP BY email
      ORDER BY MIN(timestamp) DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;

    const emails = distinctEmails.map((row: any) => row.email);

    let data: any[] = [];
    if (emails.length > 0) {
      // Fetch all events for these emails
      const events = await prisma.emailEvent.findMany({
        where: { campaignId, email: { in: emails } },
        orderBy: { timestamp: 'asc' },
        select: { eventType: true, email: true, timestamp: true, url: true, userAgent: true },
      });

      // Group events by email
      data = emails.map((email: string) => ({
        email,
        events: events.filter((e: any) => e.email === email),
      }));
    }

    res.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    console.error("Contact events fetch error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

router.get('/api/analytics/campaigns/:id/export', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    const events = await prisma.emailEvent.findMany({
      where: { campaignId },
      orderBy: { timestamp: 'asc' },
    });

    const filename = `campaign-${campaignId}-report.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.write('Email,Event Type,Timestamp,URL\n');

    const escapeCSV = (str: string) => {
      if (!str) return "";
      let escaped = String(str);
      // Formula injection mitigation
      if (/^[=+\-@\t\n\r]/.test(escaped)) {
        escaped = "'" + escaped;
      }
      // Handle commas, quotes, carriage returns and newlines
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
        escaped = `"${escaped.replace(/"/g, '""')}"`;
      }
      return escaped;
    };

    events.forEach(e => {
      res.write(`${escapeCSV(e.email)},${escapeCSV(e.eventType)},${e.timestamp.toISOString()},${escapeCSV(e.url || '')}\n`);
    });

    res.end();
  } catch (err: any) {
    console.error("Analytics export error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});
