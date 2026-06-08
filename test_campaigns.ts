import { prisma } from './server/prisma.js';

async function run() {
  try {
    const total = await prisma.campaign.count();
    console.log("Campaigns total:", total);
  } catch (e) {
    console.error("Prisma Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
