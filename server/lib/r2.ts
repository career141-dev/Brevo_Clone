import "dotenv/config";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const bucketName = process.env.R2_BUCKET_NAME || "attachment";
const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

export const isR2Configured = Boolean(
  accountId && accessKeyId && secretAccessKey && bucketName && publicUrl
);

export const r2Client = isR2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  : null;

/**
 * Uploads a file buffer directly to Cloudflare R2 bucket
 * and returns the public CDN URL.
 */
export async function uploadToR2(
  buffer: Buffer,
  fileName: string,
  contentType: string = "application/octet-stream"
): Promise<{ url: string; key: string; size: number }> {
  if (!r2Client || !isR2Configured) {
    throw new Error("Cloudflare R2 is not configured. Please check environment variables.");
  }

  const ext = fileName.includes(".") ? `.${fileName.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "")}` : "";
  const base = fileName.replace(ext, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const uniqueKey = `${Date.now()}_${base}${ext}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueKey,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const fileUrl = `${publicUrl}/${uniqueKey}`;
  console.log(`[R2 UPLOAD] Successfully uploaded ${fileName} (${buffer.length} bytes) to ${fileUrl}`);

  return {
    url: fileUrl,
    key: uniqueKey,
    size: buffer.length,
  };
}

/**
 * Reads a file directly from the bucket. Public r2.dev links can be blocked by Cloudflare (our sponsor deck was flagged
 * "Suspected Phishing"), so downloads must not depend on that address. Returns null when the file doesn't exist.
 */
export async function readFromR2(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!r2Client) return null;
  try {
    const res = await r2Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
    return { body: Buffer.from(await res.Body!.transformToByteArray()), contentType: res.ContentType || "application/octet-stream" };
  } catch (err: any) {
    if (err?.name === "NoSuchKey") return null;
    throw err;
  }
}
