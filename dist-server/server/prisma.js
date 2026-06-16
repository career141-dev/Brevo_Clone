import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";
export const authStorage = new AsyncLocalStorage();
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required.");
}
let url;
try {
    url = new URL(process.env.DATABASE_URL);
}
catch (err) {
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
const globalForPrisma = globalThis;
const basePrisma = new PrismaClient({ adapter });
const tenantModels = ['Contact', 'Folder', 'List', 'Campaign', 'Automation', 'Company', 'Segment', 'Template'];
export const prisma = globalForPrisma.prisma ?? basePrisma.$extends({
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                if (!tenantModels.includes(model)) {
                    return query(args);
                }
                const store = authStorage.getStore();
                const userId = store?.userId;
                if (!userId) {
                    return query(args);
                }
                const anyArgs = args;
                if (['findMany', 'findFirst', 'count', 'updateMany', 'deleteMany'].includes(operation)) {
                    anyArgs.where = { ...anyArgs.where, userId };
                    return query(anyArgs);
                }
                if (['create'].includes(operation)) {
                    anyArgs.data = { ...anyArgs.data, userId };
                    return query(anyArgs);
                }
                if (['createMany'].includes(operation)) {
                    if (Array.isArray(anyArgs.data)) {
                        anyArgs.data = anyArgs.data.map((d) => ({ ...d, userId }));
                    }
                    else {
                        anyArgs.data = { ...anyArgs.data, userId };
                    }
                    return query(anyArgs);
                }
                if (['findUnique', 'findUniqueOrThrow', 'update', 'delete'].includes(operation)) {
                    // Verify ownership first for operations that require unique where clauses
                    if (anyArgs.where?.id) {
                        const existing = await basePrisma[model].findFirst({
                            where: { id: anyArgs.where.id, userId }
                        });
                        if (!existing) {
                            throw new Error(`Record not found or unauthorized access to ${model}`);
                        }
                    }
                    else if (anyArgs.where?.brevoId) {
                        const existing = await basePrisma[model].findFirst({
                            where: { brevoId: anyArgs.where.brevoId, userId }
                        });
                        if (!existing) {
                            throw new Error(`Record not found or unauthorized access to ${model}`);
                        }
                    }
                    return query(anyArgs);
                }
                if (operation === 'upsert') {
                    anyArgs.where = { ...anyArgs.where, userId };
                    anyArgs.create = { ...anyArgs.create, userId };
                    return query(anyArgs);
                }
                return query(anyArgs);
            }
        }
    }
});
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
