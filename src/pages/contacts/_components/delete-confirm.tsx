import { useEffect, useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog.tsx"

interface DeleteConfirmProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  count: number
}

export default function DeleteConfirm({ open, onClose, onConfirm, count }: DeleteConfirmProps) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setText("")
    }
  }, [open])

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
      onClose()
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setText("")
      onClose()
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDialogTitle>Delete contacts permanently</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-destructive font-medium">
            This action cannot be undone. {count} contact(s) will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Type &quot;DELETE&quot; to confirm
          </label>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="DELETE"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={text !== "DELETE" || loading}
            onClick={handleConfirm}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
