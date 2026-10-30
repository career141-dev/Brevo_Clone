
// Analytics cache (30s TTL for near-real-time data).
const analyticsCache = new Map<string, { data: any; expiresAt: number }>();
export function getCached(key: string) {
  const entry = analyticsCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    analyticsCache.delete(key);
    return null;
  }
  return entry.data;
}
export function setCache(key: string, data: any, ttlMs = 30 * 1000) {
  analyticsCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
export function invalidateAnalyticsCache(campaignId?: number) {
  analyticsCache.delete('analytics:campaigns');
  analyticsCache.delete('campaigns:stats:global');
  if (campaignId) analyticsCache.delete(`analytics:campaign:${campaignId}`);
}

// POST /api/upload - Handle file upload and return public downloadable URL (Cloudflare R2 + local fallback)
