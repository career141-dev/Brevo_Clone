import { prisma } from "../prisma.js";

const CHUNK = 1000;

/**
 * Add contacts to a list. New emails become contacts; an email already in Brevo is only linked to the list and keeps
 * everything it had, its status included, so an unsubscribed person stays unsubscribed. Shared by the Excel candidate
 * import and Find in CAREER141 (9 Nov 2026), so both treat existing people the same way.
 */
export async function fillList(listId: number, contacts: { email: string }[]) {
  let created = 0;
  const links: { contactId: number; listId: number }[] = [];
  for (let i = 0; i < contacts.length; i += CHUNK) {
    const chunk = contacts.slice(i, i + CHUNK);
    const r = await prisma.contact.createMany({ data: chunk, skipDuplicates: true });
    created += r.count;
    const rows = await prisma.contact.findMany({
      where: { email: { in: chunk.map((c) => c.email) } },
      select: { id: true },
    });
    links.push(...rows.map((c: { id: number }) => ({ contactId: c.id, listId })));
  }
  for (let i = 0; i < links.length; i += CHUNK) {
    await prisma.contactList.createMany({ data: links.slice(i, i + CHUNK), skipDuplicates: true });
  }
  return { created, existing: contacts.length - created };
}
