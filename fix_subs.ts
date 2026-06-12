import "dotenv/config";
import { prisma } from "./server/prisma.ts";

async function main() {
  const result = await prisma.contact.updateMany({
    where: {
      email: {
        in: ['sanjaysanjeev2000@gmail.com', 'sanjeev@career141.com']
      }
    },
    data: { status: 'subscribed' }
  });
  console.log(`Updated ${result.count} contacts to subscribed!`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
