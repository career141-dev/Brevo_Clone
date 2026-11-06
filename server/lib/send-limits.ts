import { prisma } from "../prisma.js";

// Our own caps, well under AWS's 50,000 a day. The monthly default matches the $5 AWS budget at $0.10 per 1,000
// emails, so a runaway send stops in the app before the AWS cost alarm has to. 0 turns a cap off.
function readLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : fallback;
}
// 10,000 a day (owner, 6 Nov 2026): one campaign to the ~50,000 list goes out over about five days.
export const DAILY_SEND_LIMIT = readLimit("DAILY_SEND_LIMIT", 10000);
export const MONTHLY_SEND_LIMIT = readLimit("MONTHLY_SEND_LIMIT", 50000);

export type SendUsage = { lastDay: number; thisMonth: number };

// The team works in Colombo (UTC+05:30, no daylight saving); Railway's clock is UTC, which started the month 5.5h late.
const COLOMBO_OFFSET_MS = 5.5 * 3_600_000;
export function colomboMonthStart(now: Date): Date {
  const local = new Date(now.getTime() + COLOMBO_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - COLOMBO_OFFSET_MS);
}

/** Campaign emails sent in the rolling last 24 hours and since the 1st of this month in Colombo. */
export async function sendUsage(now = new Date()): Promise<SendUsage> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const monthStart = colomboMonthStart(now);
  const [lastDay, thisMonth] = await Promise.all([
    prisma.emailEvent.count({ where: { eventType: "sent", timestamp: { gte: dayAgo } } }),
    prisma.emailEvent.count({ where: { eventType: "sent", timestamp: { gte: monthStart } } }),
  ]);
  return { lastDay, thisMonth };
}

/** How many more may go under each cap; null = that cap is off. */
export function remainingSends(usage: SendUsage, daily = DAILY_SEND_LIMIT, monthly = MONTHLY_SEND_LIMIT) {
  return {
    daily: daily > 0 ? Math.max(0, daily - usage.lastDay) : null,
    monthly: monthly > 0 ? Math.max(0, monthly - usage.thisMonth) : null,
  };
}
