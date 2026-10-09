import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolves to <repo>/public/uploads from dist-server/server/lib (same target index.ts used from dist-server/server).
export const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../public/uploads");
