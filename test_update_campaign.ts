import { prisma } from './server/prisma.js';

async function testUpdate() {
  try {
    const c = await prisma.campaign.findFirst();
    if (!c) { console.log("no campaign found"); return; }
    
    // Simulate updating fromName and fromEmail (Step 1)
    await prisma.campaign.update({
      where: { id: c.id },
      data: { fromName: "Test", fromEmail: "test@career141.com" }
    });
    console.log("update 1 successful");

    // Simulate updating audience (Step 2)
    await prisma.campaign.update({
      where: { id: c.id },
      data: { audienceType: "list", audienceId: 1 }
    });
    console.log("update 2 successful");

    // Simulate updating subject (Step 3)
    await prisma.campaign.update({
      where: { id: c.id },
      data: { 
        name: "Test Name",
        subject: "Test Subject",
        previewText: "Preview",
        fromName: "Test",
        fromEmail: "test@career141.com",
        audienceType: "list",
        audienceId: 1,
        templateHtml: ""
      }
    });
    console.log("update 3 successful");
    
  } catch(e) {
    console.error("Error updating:", e);
  } finally {
    await prisma.$disconnect();
  }
}
testUpdate();
