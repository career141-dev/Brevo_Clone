import "dotenv/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

  const ext = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
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
