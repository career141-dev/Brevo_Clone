import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, isToday, isTomorrow } from "date-fns";
import { api, type SendTiming } from "@/lib/api.ts";
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

/** "under a minute" / "about 14 min" / "about 1 day 3 h", ready to follow "Takes" or start a label. */
export function about(seconds: number) {
  return seconds < 60 ? "under a minute" : `about ${duration(seconds)}`;
}

export function duration(seconds: number) {
  if (seconds < 60) return "less than a minute";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ${mins % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ${h % 24} h`;
}

export function when(d: Date) {
  const time = format(d, "h:mm a");
  if (isToday(d)) return `${time} today`;
  if (isTomorrow(d)) return `${time} tomorrow`;
  return format(d, "EEE d MMM, h:mm a");
}

/** One plain sentence on how long a send of this size takes, from the server's estimate (counted from `from`). */
export function timingSentence(t: SendTiming, from = Date.now()) {
  const shared = t.othersSending > 0
    ? ` ${t.othersSending === 1 ? "Another campaign is" : `${t.othersSending} other campaigns are`} sending too; this time is for its share of the speed.`
    : "";
  return baseSentence(t, from) + shared;
}

function baseSentence(t: SendTiming, from: number) {
  const at = (s: number) => new Date(from + s * 1000);
  if (t.pausesAtMonthlyLimit) {
    return `This month's send limit has room for ${(t.monthlyLeft ?? 0).toLocaleString()} more. It pauses there; press Resume after the 1st.`;
  }
  if (t.finishInSeconds === null) return "It waits for the send limit, then goes out by itself.";
  if (t.resumesInSeconds === null) return `Takes ${about(t.finishInSeconds)}, finishing around ${when(at(t.finishInSeconds))}.`;
  const today = t.room ? `${t.room.toLocaleString()} go today` : "Today's send limit is used up";
  return `${today}; the rest go out by themselves from ${when(at(t.resumesInSeconds))}, finishing around ${when(at(t.finishInSeconds))}.`;
}
