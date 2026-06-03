import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { Label } from "@/components/ui/label.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { api } from "@/lib/api.ts";
import { Loader2, GitBranch } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (workflowId: number) => Promise<void>;
};

type Automation = {
  id: number;
  name: string;
  trigger?: string;
};

export default function AutomationModal({ open, onClose, onConfirm }: Props) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    api
      .automations.list()
      .then((data) => setAutomations(data ?? []))
      .catch(() => setAutomations([]))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleConfirm() {
    if (selectedId === null) return;
    setConfirming(true);
    try {
      await onConfirm(selectedId);
      onClose();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll in workflow</DialogTitle>
          <DialogDescription>
            Select an automation workflow to enroll the selected contacts in.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <GitBranch className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No workflows found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create an automation workflow first.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <RadioGroup
              value={selectedId?.toString() ?? ""}
              onValueChange={(value) => setSelectedId(Number(value))}
            >
              {automations.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem value={w.id.toString()} id={`w-${w.id}`} />
                  <Label
                    htmlFor={`w-${w.id}`}
                    className="flex items-center gap-3 flex-1 cursor-pointer py-1"
                  >
                    <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{w.name}</span>
                      {w.trigger && (
                        <span className="text-xs text-muted-foreground">
                          Trigger: {w.trigger}
                        </span>
                      )}
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedId === null || confirming}
          >
            {confirming && <Loader2 className="size-4 animate-spin mr-2" />}
            Enroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
