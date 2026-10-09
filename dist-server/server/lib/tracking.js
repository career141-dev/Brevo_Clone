import jwt from "jsonwebtoken";
if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required.");
}
export const JWT_SECRET = process.env.JWT_SECRET;
const APP_URL = () => process.env.APP_URL ?? "http://localhost:3001";
export function makeUnsubscribeUrl(email, campaignId) {
    // No expiry on unsubscribe links — recipients must always be able to unsubscribe (CAN-SPAM / GDPR compliance)
    const token = jwt.sign({ email, campaignId }, JWT_SECRET);
    return `${APP_URL()}/api/unsubscribe?token=${token}`;
}
/** Returns a URL that logs an open event then serves a 1×1 transparent pixel */
function makeOpenPixelUrl(email, campaignId) {
    const token = jwt.sign({ email, campaignId }, JWT_SECRET, { expiresIn: "2y" });
    return `${APP_URL()}/api/track/open?t=${token}`;
}
/** Rewrites a destination URL into a tracked click-redirect URL */
function makeClickUrl(email, campaignId, destinationUrl) {
    const token = jwt.sign({ email, campaignId, url: destinationUrl }, JWT_SECRET, { expiresIn: "2y" });
    return `${APP_URL()}/api/track/click?t=${token}`;
}
// 1×1 transparent GIF (35 bytes)
export const PIXEL_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
/**
 * Rewrites every <a href="..."> in the HTML through the click-tracker,
 * then appends the open-tracking pixel just before </body>.
 */
export function injectTracking(html, email, campaignId) {
    // Rewrite links — skip unsubscribe, tracking, uploads, R2 CDN, and /api/download links
    const tracked = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_match, url) => {
        if (url.includes("/api/track/") ||
            url.includes("/api/unsubscribe") ||
            url.includes("/api/download") ||
            url.includes("/uploads/") ||
            url.includes("r2.dev") ||
            url.includes("r2.cloudflarestorage.com")) {
            return `href="${url}"`;
        }
        return `href="${makeClickUrl(email, campaignId, url)}"`;
    });
    const pixelTag = `<img src="${makeOpenPixelUrl(email, campaignId)}" width="1" height="1" border="0" style="display:none;width:1px;height:1px" alt="" />`;
    if (/<\/body>/i.test(tracked)) {
        return tracked.replace(/<\/body>/i, `${pixelTag}</body>`);
    }
    return tracked + pixelTag;
}
