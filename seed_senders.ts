import { prisma } from './server/prisma.js';

async function main() {
  const senders = [
    { name: "Career141", email: "no-reply@career141.com" },
    { name: "Premium Roles", email: "asm@premiumroles.com" }
  ];

  for (const s of senders) {
    await prisma.sender.upsert({
      where: { email: s.email },
      update: {},
      create: s,
    });
  }

  console.log("Senders seeded successfully.");
}

main().finally(() => prisma.$disconnect());
