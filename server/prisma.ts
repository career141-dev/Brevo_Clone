import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

/** The app is one shared team workspace: every row is owned by this id, and every signed-in user sees all of it. */
export const WORKSPACE_USER_ID = "user_3Epvu1kcUczQTmQSvidHS9K4Wak";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required.");
}

let url: URL;
try {
  url = new URL(process.env.DATABASE_URL);
} catch (err) {
  throw new Error("Failed to parse DATABASE_URL. Please ensure it is a valid connection string.");
}

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: url.port ? Number(url.port) : 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: true },
  connectTimeout: 30000,
  connectionLimit: 30,
});

const globalForPrisma = globalThis as unknown as {
  prisma?: any;
};

const basePrisma = new PrismaClient({ adapter });

const ownedModels = ["Contact", "Folder", "List", "Campaign", "Automation", "Company", "Segment", "Template"];

// These tables still require userId, so new rows are stamped with the workspace owner. Reads need no filter.
export const prisma = globalForPrisma.prisma ?? basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!ownedModels.includes(model)) return query(args);
        const a = args as any;
        if (operation === "create") a.data = { ...a.data, userId: WORKSPACE_USER_ID };
        if (operation === "upsert") a.create = { ...a.create, userId: WORKSPACE_USER_ID };
        if (operation === "createMany") {
          a.data = Array.isArray(a.data) ? a.data.map((d: any) => ({ ...d, userId: WORKSPACE_USER_ID })) : { ...a.data, userId: WORKSPACE_USER_ID };
        }
        return query(a);
      },
    },
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
