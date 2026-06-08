import { prisma } from './server/prisma.js';
async function run() {
  try {
    const senders = await prisma.sender.findMany();
    console.log("Senders:", senders);
  } catch (e) {
    console.error("DB Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
