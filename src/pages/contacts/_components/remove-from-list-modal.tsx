import { useState, useEffect } from "react";
import { Search, Loader2, ListMinus, Info } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { api } from "@/lib/api.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (listIds: number[]) => Promise<void>;
  count: number;
  currentListId?: number;
  currentListName?: string;
};

type ListItem = {
  id: number;
  name: string;
  contactCount?: number;
};

export default function RemoveFromListModal({
  open,
  onClose,
  onConfirm,
  count,
  currentListId,
  currentListName,
}: Props) {
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (currentListId) {
      setSelectedIds([currentListId]);
      return;
    }

    setLoading(true);
    setSearch("");
    setSelectedIds([]);
    api.lists
      .list({ pageSize: 10000 })
      .then((res) => setLists(res.data as ListItem[]))
      .catch(() => setLists([]))
      .finally(() => setLoading(false));
  }, [open, currentListId]);

  const filtered = lists.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleConfirm() {
    if (selectedIds.length === 0 && !currentListId) return;
    const targetIds = currentListId ? [currentListId] : selectedIds;
    setSubmitting(true);
    try {
      await onConfirm(targetIds);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  // Single list direct confirmation mode
  if (currentListId && currentListName) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ListMinus className="size-5" />
              </div>
              <DialogTitle>Remove from list</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-foreground/80">
              Are you sure you want to remove{" "}
              <strong className="text-foreground">
                {count} {count === 1 ? "contact" : "contacts"}
              </strong>{" "}
              from the list <strong className="text-foreground">"{currentListName}"</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2.5 p-3 rounded-md bg-muted/60 border border-border/60 text-xs text-muted-foreground">
            <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <span>
              This will only unassign the contact from this list. It will <strong>NOT</strong> delete the contact from your database or any other lists.
            </span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <ListMinus className="size-4 mr-1.5" />
              )}
              Remove from list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Multi-list selector mode
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ListMinus className="size-5" />
            </div>
            <DialogTitle>Remove from lists</DialogTitle>
          </div>
          <DialogDescription>
            Select the lists you want to remove{" "}
            <strong>
              {count} {count === 1 ? "contact" : "contacts"}
            </strong>{" "}
            from.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search lists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {lists.length === 0 ? "No lists found." : "No lists match your search."}
            </p>
          ) : (
            <ScrollArea className="h-60 rounded-md border p-2">
              <div className="space-y-1">
                {filtered.map((list) => {
                  const checked = selectedIds.includes(list.id);
                  return (
                    <label
                      key={list.id}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(list.id)}
                        />
                        <span className="font-medium">{list.name}</span>
                      </div>
                      {typeof list.contactCount === "number" && (
                        <span className="text-xs text-muted-foreground">
                          {list.contactCount} contacts
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/60 text-xs text-muted-foreground">
            <Info className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <span>Contacts will remain safely in your database and other lists.</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="default"
            className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
            disabled={selectedIds.length === 0 || submitting}
            onClick={handleConfirm}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <ListMinus className="size-4 mr-1.5" />
            )}
            Remove from {selectedIds.length > 0 ? `${selectedIds.length} list(s)` : "lists"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
