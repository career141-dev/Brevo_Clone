import crypto from "node:crypto";

const CERT_URL = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\/.+\.pem$/;
const certCache = new Map<string, string>();

const NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];
const SUBSCRIPTION_KEYS = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];

/**
 * AWS account id encoded in an AKIA/ASIA access key id (bits 7..46 of the base32-decoded key body).
 * See https://hackingthe.cloud/aws/enumeration/get-account-id-from-keys/
 */
export function accountIdFromAccessKey(keyId: string | undefined): string | null {
  const body = String(keyId ?? "").trim().slice(4);
  if (!/^[A-Z2-7]{16}$/.test(body)) return null;
  let bits = 0n;
  for (const ch of body) bits = (bits << 5n) | BigInt("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch));
  const first6Bytes = bits >> 32n; // 80 decoded bits -> keep the top 48
  return String((first6Bytes & 0x7fffffffff80n) >> 7n).padStart(12, "0");
}

/** The SNS topic(s) we accept: an exact SNS_TOPIC_ARN if set, otherwise any topic in our own AWS account. */
function isOurTopic(topicArn: unknown): boolean {
  if (typeof topicArn !== "string") return false;
  if (process.env.SNS_TOPIC_ARN) return topicArn === process.env.SNS_TOPIC_ARN.trim();
  const account = accountIdFromAccessKey(process.env.AWS_ACCESS_KEY_ID);
  return account !== null && topicArn.split(":")[4] === account;
}

/**
 * Verifies an SNS message signature per AWS docs AND that it comes from our own topic: a validly signed message from
 * someone else's AWS account could otherwise mark our contacts bounced/unsubscribed. False for anything else.
 */
export async function verifySnsMessage(msg: Record<string, any>): Promise<boolean> {
  try {
    if (typeof msg?.Signature !== "string" || typeof msg.SigningCertURL !== "string") return false;
    if (!CERT_URL.test(msg.SigningCertURL)) return false;
    if (!isOurTopic(msg.TopicArn)) {
      console.warn(`[SNS] rejected message from foreign topic ${msg.TopicArn}`);
      return false;
    }

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
