import { useState, useRef } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { useContacts } from "./_components/use-contacts.ts";
import ContactsTable from "./_components/contacts-table.tsx";
import ActionBar from "./_components/action-bar.tsx";
import BulkActionsDropdown from "./_components/bulk-actions-dropdown.tsx";
import EditContactDrawer from "./_components/edit-contact-drawer.tsx";
import AddToListModal from "./_components/add-to-list-modal.tsx";
import BlocklistConfirm from "./_components/blocklist-confirm.tsx";
import DeleteConfirm from "./_components/delete-confirm.tsx";
import ExportModal from "./_components/export-modal.tsx";
import AutomationModal from "./_components/automation-modal.tsx";
import CreateContactPanel from "./_components/create-contact-panel.tsx";
import ImportContactsModal from "./_components/import-contacts-modal.tsx";
import { useSearchParams, useNavigate } from "react-router-dom";
import { X } from "lucide-react";

export default function ContactsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const listIdParam = searchParams.get("listId");
  const listNameParam = searchParams.get("listName");

  const {
    contacts, total, totalPages, isLoading, search, setSearch,
    page, setPage, pageSize, setPageSize,
    selectedIds, setSelectedIds, handleSelectAll, handleSelectOne,
    bulkBlocklist, bulkAddToList, bulkAssign, bulkExport,
    bulkAddToAutomation, bulkDelete, updateContact,
  } = useContacts();

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Bulk modals
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [blocklistOpen, setBlocklistOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOwnerId, setAssignOwnerId] = useState("");

  // Edit drawer
  const [editContact, setEditContact] = useState<any | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // More actions dropdown
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreActionsBtnRef = useRef<HTMLButtonElement>(null);

  // Per-row actions
  const [rowAction, setRowAction] = useState<{
    type: "edit" | "blocklist" | "addToList" | "assign" | "export" | "automation" | "delete";
    contact: any;
  } | null>(null);

  function bulkAction(mode: string) {
    setMoreActionsOpen(false);
    if (selectedIds.length === 0) {
      toast.error("No contacts selected");
      return;
    }
    switch (mode) {
      case "edit":
        if (selectedIds.length !== 1) { toast.error("Select exactly one contact to edit"); return; }
        setEditContact(contacts.find((c) => c.id === selectedIds[0]) ?? null);
        setEditOpen(true);
        break;
      case "assign":
        setAssignOpen(true);
        break;
      case "export":
        setExportOpen(true);
        break;
      case "automation":
        setAutomationOpen(true);
        break;
      case "delete":
        setDeleteOpen(true);
        break;
    }
  }

  function handleRowAction(action: typeof rowAction) {
    if (!action) return;
    switch (action.type) {
      case "edit":
        setEditContact(action.contact);
        setEditOpen(true);
        break;
      case "blocklist":
        setSelectedIds([action.contact.id]);
        setBlocklistOpen(true);
        break;
      case "addToList":
        setSelectedIds([action.contact.id]);
        setAddToListOpen(true);
        break;
      case "assign":
        setSelectedIds([action.contact.id]);
        setAssignOpen(true);
        break;
      case "export":
        setSelectedIds([action.contact.id]);
        setExportOpen(true);
        break;
      case "automation":
        setSelectedIds([action.contact.id]);
        setAutomationOpen(true);
        break;
      case "delete":
        setSelectedIds([action.contact.id]);
        setDeleteOpen(true);
        break;
    }
  }

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

        {listIdParam && (
          <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 px-4 py-3 rounded-lg text-sm text-blue-800 dark:text-blue-300">
            <div className="flex items-center gap-2">
              <span>Showing contacts in list <strong>"{listNameParam || "Unnamed List"}"</strong></span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/contacts")}
              className="text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/40 p-1 h-auto flex items-center gap-1 text-xs"
            >
              <X className="size-3.5" />
              Clear filter
            </Button>
          </div>
        )}

        <div className="relative">
          {/* Action bar with dropdown */}
          <div className="relative">
            {selectedIds.length > 0 && (
              <ActionBar
                ref={moreActionsBtnRef}
                selectedCount={selectedIds.length}
                onAddToList={() => setAddToListOpen(true)}
                onBlocklist={() => setBlocklistOpen(true)}
                onMoreActions={() => setMoreActionsOpen((v) => !v)}
              />
            )}
            <BulkActionsDropdown
              open={moreActionsOpen}
              onClose={() => setMoreActionsOpen(false)}
              anchorRef={moreActionsBtnRef as React.RefObject<HTMLElement>}
              selectedCount={selectedIds.length}
              onEdit={() => bulkAction("edit")}
              onAssign={() => bulkAction("assign")}
              onExport={() => bulkAction("export")}
              onAddToAutomation={() => bulkAction("automation")}
              onDelete={() => bulkAction("delete")}
            />
          </div>

          <ContactsTable
            contacts={contacts}
            total={total}
            totalPages={totalPages}
            isLoading={isLoading}
            search={search}
            onSearchChange={setSearch}
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            selectedIds={selectedIds}
            onSelectAll={handleSelectAll}
            onSelectOne={handleSelectOne}
            onRowEdit={(c) => handleRowAction({ type: "edit", contact: c })}
            onRowBlocklist={(c) => handleRowAction({ type: "blocklist", contact: c })}
            onRowAddToList={(c) => handleRowAction({ type: "addToList", contact: c })}
            onRowAssign={(c) => handleRowAction({ type: "assign", contact: c })}
            onRowExport={(c) => handleRowAction({ type: "export", contact: c })}
            onRowAddToAutomation={(c) => handleRowAction({ type: "automation", contact: c })}
            onRowDelete={(c) => handleRowAction({ type: "delete", contact: c })}
          />
        </div>
      </div>

      {/* Modals */}
      <CreateContactPanel open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportContactsModal open={importOpen} onClose={() => setImportOpen(false)} />

      <EditContactDrawer
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditContact(null); setSelectedIds([]); }}
        contact={editContact}
        onSave={updateContact}
      />

      <AddToListModal
        open={addToListOpen}
        onClose={() => { setAddToListOpen(false); setSelectedIds([]); }}
        onConfirm={async (listIds) => {
          await bulkAddToList(selectedIds, listIds);
          setAddToListOpen(false);
        }}
      />

      <BlocklistConfirm
        open={blocklistOpen}
        onClose={() => { setBlocklistOpen(false); setSelectedIds([]); }}
        onConfirm={async () => {
          await bulkBlocklist(selectedIds, true);
          setBlocklistOpen(false);
        }}
        count={selectedIds.length}
      />

      <DeleteConfirm
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setSelectedIds([]); }}
        onConfirm={async () => {
          await bulkDelete(selectedIds);
          setDeleteOpen(false);
        }}
        count={selectedIds.length}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => { setExportOpen(false); setSelectedIds([]); }}
        onConfirm={async (format) => {
          await bulkExport(selectedIds, format);
          setExportOpen(false);
        }}
      />

      <AutomationModal
        open={automationOpen}
        onClose={() => { setAutomationOpen(false); setSelectedIds([]); }}
        onConfirm={async (workflowId) => {
          await bulkAddToAutomation(selectedIds, workflowId);
          setAutomationOpen(false);
        }}
      />

      {/* Assign modal (simple inline dialog) */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setAssignOpen(false); setSelectedIds([]); }}>
          <div className="bg-background rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Assign owner</h2>
            <p className="text-sm text-muted-foreground">Enter the owner ID to assign {selectedIds.length} contact(s) to.</p>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              placeholder="Owner ID"
              value={assignOwnerId}
              onChange={(e) => setAssignOwnerId(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setAssignOpen(false); setSelectedIds([]); }}>Cancel</Button>
              <Button size="sm" disabled={!assignOwnerId.trim()} onClick={async () => {
                await bulkAssign(selectedIds, assignOwnerId.trim());
                setAssignOwnerId("");
                setAssignOpen(false);
              }}>Assign</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
