import { PrismaClient } from '@prisma/client';
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

async function main() {
  let adapter;
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    adapter = new PrismaMariaDb({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      ssl: { rejectUnauthorized: true },
      connectTimeout: 30000,
      connectionLimit: 30,
    });
  }

  const prisma = new PrismaClient({ adapter });
  
  const events = await prisma.emailEvent.findMany({
    orderBy: { timestamp: 'desc' },
    take: 10
  });

  console.log("Recent events:", events);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
