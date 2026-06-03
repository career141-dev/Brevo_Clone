import { useState, useEffect } from "react"
import { Search, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { Input } from "@/components/ui/input.tsx"
import { ScrollArea } from "@/components/ui/scroll-area.tsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.tsx"
import { api } from "@/lib/api.ts"

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (listIds: number[]) => Promise<void>
}

type ListItem = {
  id: number
  name: string
  contactCount?: number
}

export default function AddToListModal({ open, onClose, onConfirm }: Props) {
  const [lists, setLists] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSearch("")
    setSelectedIds([])
    api
      .lists.list({ pageSize: 10000 })
      .then((res) => setLists(res.data as ListItem[]))
      .catch(() => setLists([]))
      .finally(() => setLoading(false))
  }, [open])

  const filtered = lists.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()),
  )

  function toggle(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleConfirm() {
    if (selectedIds.length === 0) return
    setSubmitting(true)
    try {
      await onConfirm(selectedIds)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to lists</DialogTitle>
          <DialogDescription>
            Select the lists you want to add these contacts to.
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
              {lists.length === 0
                ? "No lists found."
                : "No lists match your search."}
            </p>
          ) : (
            <ScrollArea className="max-h-[300px] pr-2">
              <div className="space-y-1">
                {filtered.map((list) => (
                  <label
                    key={list.id}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.includes(list.id)}
                      onCheckedChange={() => toggle(list.id)}
                    />
                    <span className="flex-1 text-sm truncate">{list.name}</span>
                    {list.contactCount !== undefined && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {list.contactCount}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.length === 0 || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1" />
                Adding...
              </>
            ) : (
              `Add to lists (${selectedIds.length})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
