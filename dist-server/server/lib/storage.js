import fs from "node:fs";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { uploadsDir } from "./paths.js";
// Object storage is opt-in: set UPLOADS_BUCKET (S3 or Cloudflare R2). Without it uploads stay on local disk.
//   UPLOADS_ENDPOINT          R2: https://<account>.r2.cloudflarestorage.com (omit for AWS S3)
//   UPLOADS_REGION            default AWS_REGION ("auto" for R2)
//   UPLOADS_ACCESS_KEY_ID / UPLOADS_SECRET_ACCESS_KEY   default to the AWS_* keys used for SES
const bucket = process.env.UPLOADS_BUCKET;
const s3 = bucket
    ? new S3Client({
        region: process.env.UPLOADS_REGION ?? process.env.AWS_REGION ?? "auto",
        endpoint: process.env.UPLOADS_ENDPOINT,
        credentials: {
            accessKeyId: (process.env.UPLOADS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID),
            secretAccessKey: (process.env.UPLOADS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY),
        },
    })
    : null;
export const usingObjectStorage = s3 !== null;
export async function saveUpload(name, data) {
    if (!s3) {
        await fs.promises.mkdir(uploadsDir, { recursive: true });
        await fs.promises.writeFile(path.join(uploadsDir, name), data);
        return;
    }
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: data }));
}
/** Returns null when the file does not exist. */
export async function readUpload(name) {
    const safe = path.basename(name);
    if (!s3) {
        const p = path.join(uploadsDir, safe);
        return fs.existsSync(p) ? fs.promises.readFile(p) : null;
    }
    try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: safe }));
        return Buffer.from(await res.Body.transformToByteArray());
    }
    catch (err) {
        if (err?.name === "NoSuchKey")
            return null;
        throw err;
    }
}
