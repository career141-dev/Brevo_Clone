import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { Loader2, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (format: "csv" | "json") => Promise<void>;
};

export default function ExportModal({ open, onClose, onConfirm }: Props) {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(format);
      onClose();
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export contacts</DialogTitle>
          <DialogDescription>
            Choose a format to export your selected contacts.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={format}
          onValueChange={(v) => setFormat(v as "csv" | "json")}
          className="grid gap-3"
        >
          <Label
            htmlFor="csv"
            className="flex items-start gap-4 rounded-lg border has-[:checked]:border-primary has-[:checked]:bg-primary/5 p-4 cursor-pointer"
          >
            <RadioGroupItem value="csv" id="csv" className="mt-0.5" />
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="size-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium leading-none">CSV</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated values — open in Excel, Google Sheets, or any spreadsheet app.
                </p>
              </div>
            </div>
          </Label>

          <Label
            htmlFor="json"
            className="flex items-start gap-4 rounded-lg border has-[:checked]:border-primary has-[:checked]:bg-primary/5 p-4 cursor-pointer"
          >
            <RadioGroupItem value="json" id="json" className="mt-0.5" />
            <div className="flex items-start gap-3">
              <FileJson className="size-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium leading-none">JSON</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Machine-readable format — ideal for APIs, automation, and developers.
                </p>
              </div>
            </div>
          </Label>
        </RadioGroup>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
