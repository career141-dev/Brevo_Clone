import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog.tsx"

interface BlocklistConfirmProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  count: number
}

export default function BlocklistConfirm({
  open,
  onClose,
  onConfirm,
  count,
}: BlocklistConfirmProps) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
      onClose()
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Blocklist contacts</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to blocklist {count} contact(s)? They will no
            longer receive email communications.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Blocklist
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
