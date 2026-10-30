import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { uploadToR2, isR2Configured } from "../lib/r2.js";

export const downloadRouter = Router();
export const uploadRouter = Router();

export const uploadsDir = path.resolve(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed origins for /api/download — prevents open proxy abuse
const R2_PUBLIC_DOMAIN = (process.env.R2_PUBLIC_URL || "").replace(/^https?:\/\//, "").split("/")[0];
const ALLOWED_DOWNLOAD_HOSTS = [
  R2_PUBLIC_DOMAIN,
  "r2.dev",
  "r2.cloudflarestorage.com",
];

// GET /api/download - Force-download files with Content-Disposition: attachment
// 🔒 Whitelist guard: only serves files from R2 or local uploads — prevents open proxy abuse
downloadRouter.get("/api/download", async (req, res) => {
  try {
    const fileUrl = req.query.url as string;
    const rawName = (req.query.name as string) || "document.pdf";
    const cleanName = rawName.replace(/^(\d+_)+/, "").replace(/[^a-zA-Z0-9_\- .]/g, "_");

    if (!fileUrl) {
      return res.status(400).send("Missing file URL");
    }

    // 🔒 Reject any URL that is not from our R2 bucket or local uploads
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
      try {
        const parsedHost = new URL(fileUrl).hostname;
        // Exact host or a real subdomain only ("evilr2.dev" must not match "r2.dev").
        const isAllowed = ALLOWED_DOWNLOAD_HOSTS.some(h => h && (parsedHost === h || parsedHost.endsWith("." + h)));
        if (!isAllowed) {
          console.warn(`[DOWNLOAD BLOCKED] Rejected proxy request for external URL: ${fileUrl}`);
          return res.status(403).send("Forbidden: Only Career141 R2 hosted files can be downloaded via this endpoint.");
        }
      } catch {
        return res.status(400).send("Invalid file URL.");
      }

      res.setHeader("Content-Disposition", `attachment; filename="${cleanName}"`);
      // No redirects: an allowed host must not be able to bounce us to internal addresses.
      const response = await fetch(fileUrl, { redirect: "error" });
      if (!response.ok) {
        return res.status(response.status).send("File not found on storage");
      }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }

    // 2. If local /uploads/ file
    const localDiskName = fileUrl.replace(/^\/uploads\//, "");
    const localPath = path.resolve(uploadsDir, localDiskName);
    // Path traversal guard: "../../etc/passwd" must never leave the uploads folder.
    if (!localPath.startsWith(uploadsDir + path.sep)) return res.status(400).send("Invalid file path");
    if (fs.existsSync(localPath)) {
      res.setHeader("Content-Disposition", `attachment; filename="${cleanName}"`);
      return res.download(localPath, cleanName);
    }

    res.status(404).send("File not found");
  } catch (err: any) {
    console.error("Download endpoint error:", err);
    res.status(500).send("Failed to download file");
  }
});


const UPLOAD_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

uploadRouter.post("/api/upload", async (req: any, res: any) => {
  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: "fileName and fileData required" });
    }

    const ext = path.extname(fileName).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: `File type ${ext || "(none)"} is not allowed.` });
    }
    const base64Data = fileData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: "File is too large (limit 25 MB)." });
    }

    const safeName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueFileName = `${Date.now()}_${safeName}${ext}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

    let fileUrl = "";
    let isR2 = false;

    // 1. Upload to Cloudflare R2 for zero-egress, high-speed CDN delivery
    if (isR2Configured) {
      try {
        let contentType = "application/octet-stream";
        if (ext === ".pdf") contentType = "application/pdf";
        else if (ext === ".docx" || ext === ".doc") contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (ext === ".xlsx" || ext === ".xls") contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        else if (ext === ".pptx" || ext === ".ppt") contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        else if (ext === ".zip") contentType = "application/zip";
        else if (ext === ".png") contentType = "image/png";
        else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";

        const r2Result = await uploadToR2(buffer, fileName, contentType);
        fileUrl = r2Result.url;
        isR2 = true;
      } catch (r2Err) {
        // No disk fallback when R2 is set up: Railway's disk is wiped on deploy, so links in sent emails would break later.
        console.error("[R2 UPLOAD FAILED]:", r2Err);
        return res.status(502).json({ error: "File storage failed, please try again." });
      }
    }

    // 2. Local disk, only for development without R2
    if (!fileUrl) {
      await fs.promises.writeFile(filePath, buffer);
      fileUrl = `${process.env.APP_URL ?? "http://localhost:3001"}/uploads/${uniqueFileName}`;
    }

    res.json({
      url: fileUrl,
      fileName,
      size: buffer.length,
      isR2,
    });
  } catch (err: any) {
    console.error("File upload error:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});
