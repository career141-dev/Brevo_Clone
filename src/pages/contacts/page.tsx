import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Plus, Upload } from "lucide-react";
import ContactTable from "./_components/contact-table.tsx";
import CreateContactPanel from "./_components/create-contact-panel.tsx";
import ImportContactsModal from "./_components/import-contacts-modal.tsx";

export default function ContactsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
            <p className="text-sm text-muted-foreground">
              Manage subscribers, candidates, and imported contact records.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New contact
            </Button>
          </div>
        </div>

        <ContactTable />
      </div>

      <CreateContactPanel open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportContactsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
