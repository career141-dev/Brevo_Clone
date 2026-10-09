import crypto from "node:crypto";

const CERT_URL = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\/.+\.pem$/;
const certCache = new Map<string, string>();

const NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];
const SUBSCRIPTION_KEYS = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];

/** Verifies an SNS message signature per AWS docs. Returns false for anything forged or malformed. */
export async function verifySnsMessage(msg: Record<string, any>): Promise<boolean> {
  try {
    if (typeof msg?.Signature !== "string" || typeof msg.SigningCertURL !== "string") return false;
    if (!CERT_URL.test(msg.SigningCertURL)) return false;
    if (process.env.SNS_TOPIC_ARN && msg.TopicArn !== process.env.SNS_TOPIC_ARN) return false;

    const algo = msg.SignatureVersion === "2" ? "RSA-SHA256" : msg.SignatureVersion === "1" ? "RSA-SHA1" : null;
    if (!algo) return false;

    let cert = certCache.get(msg.SigningCertURL);
    if (!cert) {
      const res = await fetch(msg.SigningCertURL);
      if (!res.ok) return false;
      cert = await res.text();
      certCache.set(msg.SigningCertURL, cert);
    }

    const keys = msg.Type === "Notification" ? NOTIFICATION_KEYS : SUBSCRIPTION_KEYS;
    const toSign = keys.filter((k) => msg[k] !== undefined).map((k) => `${k}\n${msg[k]}\n`).join("");

    return crypto.createVerify(algo).update(toSign, "utf8").verify(cert, msg.Signature, "base64");
  } catch {
    return false;
  }
}
