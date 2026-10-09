// Run: node --import tsx --test server/lib/sns.test.ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { verifySnsMessage } from "./sns.js";

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const certPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const CERT_URL = "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem";
globalThis.fetch = (async () => new Response(certPem)) as any;

function signed(fields: Record<string, string>, version: "1" | "2" = "2") {
  const keys = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];
  const toSign = keys.filter((k) => fields[k] !== undefined).map((k) => `${k}\n${fields[k]}\n`).join("");
  const sig = crypto.createSign(version === "2" ? "RSA-SHA256" : "RSA-SHA1").update(toSign).sign(privateKey, "base64");
  return { ...fields, SignatureVersion: version, Signature: sig, SigningCertURL: CERT_URL };
}

const base = { Type: "Notification", MessageId: "m1", TopicArn: "arn:aws:sns:us-east-1:1:t", Message: '{"a":1}', Timestamp: "2026-01-01T00:00:00.000Z" };

test("accepts a correctly signed notification (v1 and v2, with and without Subject)", async () => {
  assert.equal(await verifySnsMessage(signed(base)), true);
  assert.equal(await verifySnsMessage(signed({ ...base, Subject: "hi" }, "1")), true);
});

test("rejects tampered body, wrong cert host, missing signature", async () => {
  assert.equal(await verifySnsMessage({ ...signed(base), Message: '{"a":2}' }), false);
  assert.equal(await verifySnsMessage({ ...signed(base), SigningCertURL: "https://evil.example.com/x.pem" }), false);
  assert.equal(await verifySnsMessage({ ...base }), false);
  assert.equal(await verifySnsMessage(null as any), false);
});
