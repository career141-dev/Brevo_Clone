import jwt from "jsonwebtoken";
if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required.");
}
export const JWT_SECRET = process.env.JWT_SECRET;
const APP_URL = () => process.env.APP_URL ?? "http://localhost:3001";
export function makeUnsubscribeUrl(email, campaignId) {
    const token = jwt.sign({ email, campaignId }, JWT_SECRET, { expiresIn: "90d" });
    return `${APP_URL()}/api/unsubscribe?token=${token}`;
}
function makeOpenPixelUrl(email, campaignId) {
    const token = jwt.sign({ email, campaignId }, JWT_SECRET, { expiresIn: "90d" });
    return `${APP_URL()}/api/track/open?t=${token}`;
}
function makeClickUrl(email, campaignId, destinationUrl) {
    const token = jwt.sign({ email, campaignId, url: destinationUrl }, JWT_SECRET, { expiresIn: "90d" });
    return `${APP_URL()}/api/track/click?t=${token}`;
}
// 1×1 transparent GIF (35 bytes)
export const PIXEL_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
/** Rewrites every <a href="http..."> through the click tracker and appends the open pixel. */
export function injectTracking(html, email, campaignId) {
    const tracked = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_match, url) => {
        if (url.includes("/api/track/") || url.includes("/api/unsubscribe")) {
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
