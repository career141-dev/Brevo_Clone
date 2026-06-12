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
  
  const targetEmail = "sanjaysanjeev2000@gmail.com";
  await prisma.contact.update({
    where: { email: targetEmail },
    data: { status: "subscribed" }
  });

  console.log(`Ensured ${targetEmail} is subscribed.`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
