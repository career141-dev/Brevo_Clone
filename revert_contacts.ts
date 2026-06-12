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
  
  // Find all unsubscribed events
  const unsubscribedEvents = await prisma.emailEvent.findMany({
    where: { eventType: 'unsubscribed' },
    select: { email: true }
  });
  
  const bouncedEvents = await prisma.emailEvent.findMany({
    where: { eventType: 'bounced' },
    select: { email: true }
  });

  const unsubEmails = [...new Set(unsubscribedEvents.map(e => e.email))];
  const bounceEmails = [...new Set(bouncedEvents.map(e => e.email))];

  if (unsubEmails.length > 0) {
    await prisma.contact.updateMany({
      where: { email: { in: unsubEmails } },
      data: { status: 'unsubscribed' }
    });
    console.log(`Reverted ${unsubEmails.length} contacts back to unsubscribed based on event history.`);
  }

  if (bounceEmails.length > 0) {
    await prisma.contact.updateMany({
      where: { email: { in: bounceEmails } },
      data: { status: 'bounced' }
    });
    console.log(`Reverted ${bounceEmails.length} contacts back to bounced based on event history.`);
  }

  // Now ensure the two the user actually wanted are subscribed
  const targetEmails = ["hdbinath@gmail.com", "sanjeev@career141.com"];
  await prisma.contact.updateMany({
    where: { email: { in: targetEmails } },
    data: { status: "subscribed" }
  });

  console.log(`Ensured the 2 requested emails are subscribed.`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
