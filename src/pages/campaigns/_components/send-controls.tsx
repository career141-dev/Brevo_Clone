import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";

// Pause and Resume, shared by the campaigns list and the progress page. They replace "Reset Status", which flipped a
// sending campaign to "sent" and stranded everyone still queued (QA report 8 Nov, finding 2).

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["campaigns", "campaigns-stats", "campaign-progress"]) qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useResume() {
  const refresh = useRefresh();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: number) => api.campaigns.resume(id),
    onSuccess: (data, id) => {
      refresh();
      toast.success(`Sending again: ${data.remainingToSend.toLocaleString()} still to go.`);
      for (const w of data.warnings ?? []) toast.warning(w, { duration: 10000 });
      navigate(`/campaigns/${id}/progress`);
    },
    onError: (err: Error) => toast.error(err.message, { duration: 8000 }),
  });
}

export function PauseDialog({ target, onClose }: { target: { id: number; name: string } | null; onClose: () => void }) {
  const refresh = useRefresh();
  const pause = useMutation({
    mutationFn: (id: number) => api.campaigns.pause(id),
    onSuccess: (data) => {
      refresh();
      toast.success(`Paused. ${data.waiting.toLocaleString()} still waiting; press Resume to continue.`);
    },
    onError: (err: Error) => toast.error(err.message, { duration: 8000 }),
    onSettled: onClose,
  });

  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pause sending?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground break-words">{target?.name}</span> stops within a second. Everyone
            not sent yet stays waiting, and Resume continues from there. Nobody gets it twice.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pause.isPending}>Keep sending</AlertDialogCancel>
          <AlertDialogAction
            disabled={pause.isPending}
            onClick={(e) => {
              e.preventDefault(); // stay open until the server answers
              if (target) pause.mutate(target.id);
            }}
          >
            {pause.isPending ? "Pausing…" : "Pause"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
