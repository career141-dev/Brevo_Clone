import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Clock, Loader2, PauseCircle, PlayCircle, Send } from "lucide-react";
import { api } from "@/lib/api.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { PauseDialog, about, useResume, when } from "./_components/send-controls.tsx";

const n = (v: number) => v.toLocaleString();

// The page the user lands on after pressing Send: how far it got, how long is left, and when it ends.
export default function CampaignProgressPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["campaign-progress", id],
    queryFn: () => api.campaigns.progress(Number(id)),
    enabled: !!id,
    refetchInterval: (q) => (["sending", "scheduled"].includes(q.state.data?.status ?? "sending") ? 5000 : false),
  });

  // Ticks the countdown between polls. The server's seconds are counted from when it answered.
  const [now, setNow] = useState(Date.now());
  const [pausing, setPausing] = useState(false);
  const resume = useResume();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center space-y-3">
        <h2 className="text-xl font-semibold">Couldn't load this campaign</h2>
        <Button variant="outline" onClick={() => navigate("/campaigns")}>Back to campaigns</Button>
      </div>
    );
  }

  const pct = data.total > 0 ? Math.floor((data.sent / data.total) * 100) : 0;
  const t = data.timing;
  const elapsed = Math.max(0, (now - dataUpdatedAt) / 1000);
  const finishAt = t?.finishInSeconds != null ? new Date(dataUpdatedAt + t.finishInSeconds * 1000) : null;
  const resumesAt = t?.resumesInSeconds != null ? new Date(dataUpdatedAt + t.resumesInSeconds * 1000) : null;
  const left = t?.finishInSeconds != null ? Math.max(0, t.finishInSeconds - elapsed) : null;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to campaigns" onClick={() => navigate("/campaigns")} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{data.name}</h1>
          <p className="text-sm text-muted-foreground break-words">{data.subject}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <Headline status={data.status} queued={data.queued} sent={data.sent} />

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span><strong>{n(data.sent)}</strong> of {n(data.total)} sent</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} aria-label={`${pct}% sent`} />
          </div>

          {data.status === "sending" && t && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat icon={<Clock className="size-4" />} label="Time left">
                {t.pausesAtMonthlyLimit ? "More than this month allows" : left !== null ? about(left).replace(/^./, (c) => c.toUpperCase()) : "Waiting for the send limit"}
              </Stat>
              <Stat icon={<CheckCircle2 className="size-4" />} label="Expected to finish">
                {t.pausesAtMonthlyLimit ? "Next month" : finishAt ? when(finishAt) : "Not known yet"}
              </Stat>
            </div>
          )}

          {data.status === "sending" && t && resumesAt && (
            <Note tone="amber">
              {t.room === 0
                ? <>Today's send limit{t.perDay ? ` of ${n(t.perDay)} emails` : ""} is used up.</>
                : <>Your daily limit lets {n(t.room ?? 0)} more go today.</>}{" "}
              The rest continues by itself at <strong>{when(resumesAt)}</strong>. You don't need to do anything.
            </Note>
          )}

          {data.status === "sending" && t && t.othersSending > 0 && (
            <Note tone="blue">
              {t.othersSending === 1 ? "Another campaign is" : `${t.othersSending} other campaigns are`} sending at the same time. They share the
              sending speed and the daily limit, so this will take longer than shown.
            </Note>
          )}

          {data.status === "sending" && t?.pausesAtMonthlyLimit && (
            <Note tone="red">
              This month's send limit has room for {n(t.monthlyLeft ?? 0)} more. The campaign pauses after that; press Resume after the 1st to finish it.
            </Note>
          )}

          {data.status === "sending" && (
            <p className="text-xs text-muted-foreground">
              Sending {t ? `about ${t.rate} emails a second` : ""}. You can close this page; sending carries on in the background.
            </p>
          )}

          {data.status === "paused" && data.pauseReason && <Note tone="amber">{data.pauseReason}</Note>}

          {data.status === "scheduled" && data.scheduledAt && (
            <Note tone="blue">Scheduled for <strong>{when(new Date(data.scheduledAt))}</strong>. It starts by itself; this page updates when it does.</Note>
          )}
          {data.status === "sent" && data.sentAt && (
            <Note tone="green">Finished at <strong>{when(new Date(data.sentAt))}</strong>.</Note>
          )}
          {data.lastError && data.failed > 0 && (
            <Note tone="red">{n(data.failed)} could not be sent. Last error: {data.lastError}</Note>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Count label="Sent" value={data.sent} />
            <Count label="Waiting" value={data.queued} />
            <Count label="Failed" value={data.failed} />
            <Count label="Skipped" value={data.skipped} hint="Unsubscribed or blocked since the send started" />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate(`/analytics/${id}`)} className="gap-2">
          <BarChart3 className="size-4" /> View analytics
        </Button>
        {data.status === "sending" && (
          <Button variant="outline" className="gap-2" onClick={() => setPausing(true)}>
            <PauseCircle className="size-4" /> Pause sending
          </Button>
        )}
        {data.status === "paused" && data.queued > 0 && (
          <Button variant="outline" className="gap-2" disabled={resume.isPending} onClick={() => resume.mutate(Number(id))}>
            {resume.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />} Resume sending
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate("/campaigns")}>Back to campaigns</Button>
      </div>
      <PauseDialog target={pausing ? { id: Number(id), name: data.name } : null} onClose={() => setPausing(false)} />
    </div>
  );
}

function Headline({ status, queued, sent }: { status: string; queued: number; sent: number }) {
  if (status === "sending") return <h2 className="flex items-center gap-2 text-lg font-semibold"><Loader2 className="size-5 animate-spin text-amber-500" />Sending</h2>;
  if (status === "sent") return <h2 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="size-5 text-emerald-600" />Finished</h2>;
  if (status === "scheduled") return <h2 className="flex items-center gap-2 text-lg font-semibold"><Clock className="size-5 text-blue-600" />Scheduled</h2>;
  if (status === "paused") return <h2 className="flex items-center gap-2 text-lg font-semibold"><PauseCircle className="size-5 text-amber-600" />Paused, {queued.toLocaleString()} still waiting</h2>;
  // Back in draft after a send started: the first emails all failed (see the error below), or it was stopped.
  if (sent > 0 || queued > 0) return <h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="size-5 text-red-600" />Sending stopped</h2>;
  return <h2 className="flex items-center gap-2 text-lg font-semibold"><Send className="size-5 text-muted-foreground" />Not sent yet</h2>;
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-lg font-semibold">{children}</div>
    </div>
  );
}

function Count({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3" title={hint}>
      <div className="text-xl font-bold">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

const TONES = {
  amber: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900",
  red: "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900",
  blue: "bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900",
  green: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900",
};

function Note({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  if (!children) return null;
  return <div className={`rounded-lg border p-3 text-sm ${TONES[tone]}`}>{children}</div>;
}
