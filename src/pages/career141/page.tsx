/**
 * Find in CAREER141 (9 Nov 2026). Ask CAREER141 (the TA System) for people by job: it reads the request into a rule,
 * a person checks the rule and presses Run, CAREER141 checks every candidate, and the people come back here to narrow,
 * download or save as a list for a campaign. Nothing on this page sends anything to anyone. One page, no pop-ups: the
 * search id sits in the address (?id=), so a scan that takes a few minutes survives a refresh or a trip elsewhere.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Clock, Download, ListPlus, Loader2, Plus, RotateCcw, Search, Sparkles, Square, X } from "lucide-react";
import { toast } from "sonner";
import { api, errorStatus, type Career141Row, type Career141Rule, type Career141Saved, type Career141Search } from "@/lib/api.ts";
import { filterRows, isFiltered, levelCounts, NO_FILTER, rowsToCsv, type RowFilter } from "@/lib/career141-filter.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

// CAREER141's level ladder (convex/lib/roleLevel.ts in the TA System), in its order.
const LEVELS = [
  "Intern / Trainee", "Junior / Associate", "Mid-level", "Senior", "Lead / Assistant Manager",
  "Manager", "Senior Manager / Head", "AGM / DGM", "GM / VP", "Director / C-suite",
];
// One tap reads these straight away.
const SUGGESTIONS = [
  "Junior Developers", "Senior Developers", "Sales Managers", "Sales Executives",
  "Customer Experience Managers", "Finance professionals", "Marketing professionals", "HR professionals",
];
// ponytail: CAREER141 does not say how many candidates it holds; 92,292 were checked on 9 Nov. Only the bar uses it.
const ABOUT = 92_300;
const STALL_MS = 3 * 60_000;
const isGone = (e: unknown) => e != null && [400, 404].includes(errorStatus(e));
const PAGE = 50;

// ── Recent searches: this browser only, a convenience; CAREER141 keeps a search for 7 days ──
type Recent = { id: string; query: string; at: number };
const RECENT_KEY = "career141-recent";
function loadRecent(): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
    return list.filter((r) => r && r.id && Date.now() - r.at < 7 * 86_400_000);
  } catch {
    return [];
  }
}
function rememberSearch(r: Recent) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...loadRecent().filter((x) => x.id !== r.id)].slice(0, 6)));
  } catch { /* private window: no recent list, nothing else changes */ }
}
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default function Career141Page() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<{ rule: Career141Rule; readBy: "model" | "words" } | null>(null);
  // Run was pressed: keep asking CAREER141 until it says "running" (9 Nov: polling only while "running" left the
  // page frozen on the rule card when the first answer after Run still said "read").
  const [started, setStarted] = useState(false);
  const [recent] = useState(loadRecent);
  const qc = useQueryClient();

  // Only a search CAREER141 says it does not have (404, or an id it refuses, 400) is gone. A timeout, a lost
  // connection, or a 401 while the sign-in is still loading after a refresh is tried again, and the id stays in the
  // address (10 Nov: a refresh said "gone" for a search that was running, and one hung request froze the count).
  const access = useQuery({
    queryKey: ["career141-access"],
    queryFn: api.career141.access,
    retry: (n, e) => !isGone(e) && n < 30,
    retryDelay: 2000,
  });
  const search = useQuery({
    queryKey: ["career141", id],
    queryFn: () => api.career141.status(id!),
    enabled: Boolean(id),
    retry: (_n, e) => !isGone(e),
    retryDelay: (n) => Math.min(2000 * (n + 1), 10_000),
    refetchIntervalInBackground: true,
    // Keeps asking while the last status it saw was "running", errors or not.
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      if (st === "running") return 3000;
      return started && st === "read" ? 1500 : false;
    },
  });
  const reconnecting = Boolean(id) && search.failureCount > 0 && !isGone(search.failureReason);

  // The poll that sees "done" fetches once more, so the final count shows without a refresh.
  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const now = search.data?.status;
    if (lastStatus.current === "running" && now === "done") qc.invalidateQueries({ queryKey: ["career141", id] });
    lastStatus.current = now;
  }, [search.data?.status, id, qc]);

  // Coming back to a search that was read but not run: edit the rule it was read into.
  useEffect(() => {
    if (search.data?.status === "read" && !draft) setDraft({ rule: search.data.rule, readBy: search.data.readBy });
  }, [search.data, draft]);

  const read = useMutation({
    mutationFn: (q: string) => api.career141.read(q),
    onSuccess: (r, q) => {
      rememberSearch({ id: r.id, query: q, at: Date.now() });
      setDraft({ rule: r.rule, readBy: r.readBy });
      setParams({ id: r.id });
    },
  });
  const run = useMutation({
    mutationFn: () => api.career141.run(id!, draft!.rule),
    onSuccess: () => {
      setStarted(true);
      qc.invalidateQueries({ queryKey: ["career141", id] });
    },
  });

  const ask = (q: string) => {
    const text = q.trim();
    if (!text || read.isPending) return;
    setQuery(text);
    read.mutate(text);
  };
  const startAgain = () => {
    setDraft(null);
    setStarted(false);
    setQuery("");
    read.reset();
    run.reset();
    setParams({});
  };

  // Why the page cannot be used yet, said before anyone types (9 Nov: a failed check used to show nothing at all,
  // so the page looked ready until Read failed).
  const blocked = access.error
    ? `Could not reach the server: ${access.error.message}. Refresh the page or sign in again.`
    : access.data && !access.data.connected
      ? "CAREER141 is not connected yet. An admin needs to set CAREER141_API_URL and CAREER141_CONTACTS_TOKEN on the server."
      : null;
  const s = search.data;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Find in CAREER141</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find people for a campaign by the job they do. CAREER141 checks every candidate it holds and gives you the
          ones who fit, with their email. This page only builds lists. It sends nothing to anyone.
        </p>
      </div>

      {blocked && <Notice tone="warn">{blocked}</Notice>}

      {!id && (
        <Card className="p-5 sm:p-6 space-y-5">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(query);
            }}
          >
            <label htmlFor="c141-query" className="text-base font-semibold">Who do you want to find?</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                <Input
                  id="c141-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Describe the people, e.g. Junior software developers in Colombo"
                  maxLength={500}
                  disabled={Boolean(blocked) || read.isPending}
                  className="h-12 pl-11 text-base"
                  autoFocus
                />
              </div>
              <Button type="submit" className="h-12 px-6 text-base" disabled={!query.trim() || read.isPending || Boolean(blocked)}>
                {read.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Find people
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Write it as you would to a colleague: the job, the level, anything they must have. You check what CAREER141
              understood before anything is searched.
            </p>
          </form>

          {read.isPending ? (
            <Working
              title={`Reading "${query}"`}
              detail="CAREER141 is working out which job titles and levels you mean. This usually takes 5 to 30 seconds."
            />
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Popular searches</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    disabled={Boolean(blocked)}
                    onClick={() => ask(`Find all ${ex}`)}
                    className="rounded-full border px-3.5 py-1.5 text-sm hover:bg-accent hover:border-primary/40 transition-colors disabled:opacity-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
          {read.error && <Notice tone="error">{read.error.message}</Notice>}

          {recent.length > 0 && !read.isPending && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Your recent searches</p>
              <ul className="divide-y rounded-lg border">
                {recent.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setParams({ id: r.id })}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <Clock className="size-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{r.query}</span>
                      <span className="text-xs text-muted-foreground">{ago(r.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {id && !s && reconnecting && (
        <Working title="Reconnecting to the server" detail="Your search is safe in CAREER141. Trying again every few seconds." />
      )}
      {id && search.isLoading && !reconnecting && <Working title="Loading the search" />}
      {id && search.error && !s && isGone(search.error) && (
        <Card className="p-5 space-y-3">
          <Notice tone="error">
            {search.error.message.replace(/\.+$/, "")}. A search is kept for 7 days; an older one is gone. Start again to search afresh.
          </Notice>
          <Button variant="outline" onClick={startAgain}><RotateCcw className="size-4" />Start again</Button>
        </Card>
      )}

      {s && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>You asked:</span>
          <span className="text-foreground font-medium">{s.query}</span>
          {s.status !== "running" && (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={startAgain}>
              <RotateCcw className="size-4" />New search
            </Button>
          )}
        </div>
      )}
      {s && reconnecting && <Notice tone="warn">Reconnecting to the server… Your search keeps running in CAREER141.</Notice>}

      {s?.status === "read" && (run.isPending || started) && (
        <Working title="Starting the search" detail="CAREER141 is getting ready to check every candidate. The count starts in a moment." />
      )}

      {s?.status === "read" && draft && !run.isPending && !started && (
        <RuleCard
          draft={draft}
          onChange={(rule) => setDraft({ ...draft, rule })}
          onRun={() => run.mutate()}
          error={run.error?.message}
        />
      )}

      {s?.status === "running" && (
        <Running search={s} reconnecting={reconnecting} onStartAgain={startAgain} onStopped={() => qc.invalidateQueries({ queryKey: ["career141", id] })} />
      )}

      {s?.status === "failed" && (
        <Card className="p-5 space-y-3">
          <Notice tone="error">The search could not finish: {s.error ?? "CAREER141 did not say why."}</Notice>
          <Button variant="outline" onClick={startAgain}><RotateCcw className="size-4" />Start again</Button>
        </Card>
      )}

      {s?.status === "done" && <Results search={s} />}
    </div>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        tone === "warn"
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
      )}
    >
      <AlertTriangle className="size-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Seconds since `since` (or since this showed), ticking every second, so a wait always visibly moves. */
function useElapsed(since?: number | null) {
  const [start] = useState(() => since ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.round((now - (since ?? start)) / 1000));
}

const clock = (sec: number) => (sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)} min ${sec % 60}s`);

/** A bar that moves when there is no number to show yet. */
function MovingBar() {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-busy="true">
      <style>{"@keyframes c141-slide{0%{left:-35%}100%{left:100%}}"}</style>
      <div className="absolute inset-y-0 w-1/3 rounded-full bg-primary" style={{ animation: "c141-slide 1.3s ease-in-out infinite" }} />
    </div>
  );
}

/** Any wait: what is happening, a moving bar, and a clock that keeps counting. */
function Working({ title, detail }: { title: string; detail?: string }) {
  const sec = useElapsed();
  return (
    <Card className="p-5 space-y-3" aria-live="polite">
      <div className="flex items-center gap-2 font-medium">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="truncate">{title}…</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">{clock(sec)}</span>
      </div>
      <MovingBar />
      {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
    </Card>
  );
}

/** Words as removable chips with a small box to add one. Long lists show the first few and a "+N more". */
function ChipEditor({ values, onChange, placeholder, tone, show = 12 }: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  tone?: "exclude";
  show?: number;
}) {
  const [adding, setAdding] = useState("");
  const [all, setAll] = useState(false);
  const add = () => {
    const v = adding.trim().toLowerCase();
    if (v && !values.includes(v)) onChange([...values, v]);
    setAdding("");
  };
  const visible = all ? values : values.slice(0, show);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((v) => (
        <span
          key={v}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-0.5 text-sm",
            tone === "exclude" ? "bg-muted text-muted-foreground" : "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
          )}
        >
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {values.length > show && (
        <button type="button" onClick={() => setAll(!all)} className="text-sm font-medium text-primary hover:underline px-1">
          {all ? "Show fewer" : `+${values.length - show} more`}
        </button>
      )}
      <span className="inline-flex items-center gap-1">
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          maxLength={60}
          className="h-7 w-36 text-sm"
          aria-label={placeholder}
        />
        {adding.trim() && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={add}><Plus className="size-4" />Add</Button>
        )}
      </span>
    </div>
  );
}

/** A section the page keeps folded: its title and a one-line summary, opened only when someone wants to change it. */
function Fold({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="truncate text-muted-foreground">{summary}</span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-3 py-3">{children}</div>
    </details>
  );
}

function RuleCard({ draft, onChange, onRun, error }: {
  draft: { rule: Career141Rule; readBy: "model" | "words" };
  onChange: (r: Career141Rule) => void;
  onRun: () => void;
  error?: string;
}) {
  const { rule, readBy } = draft;
  const toggleLevel = (n: number) =>
    onChange({ ...rule, levels: rule.levels.includes(n) ? rule.levels.filter((x) => x !== n) : [...rule.levels, n].sort((a, b) => a - b) });
  return (
    <Card className="p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Here is what I will search for. Does this look right?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Nothing is searched until you press Run. Remove a title that does not fit, or add one that is missing.
        </p>
      </div>
      {readBy === "words" && <Notice tone="warn">Read without AI. Check the titles.</Notice>}

      <section className="space-y-2">
        <p className="text-sm font-medium">Job titles <span className="font-normal text-muted-foreground">({rule.titles.length})</span></p>
        <ChipEditor values={rule.titles} onChange={(titles) => onChange({ ...rule, titles })} placeholder="Add a title" />
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium">
          Level <span className="font-normal text-muted-foreground">{rule.levels.length ? `(${rule.levels.length} chosen)` : "(every level)"}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((name, n) => {
            const on = rule.levels.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLevel(n)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </section>

      <div className="space-y-2">
        <Fold
          title="Leave out"
          summary={rule.exclude.length ? `${rule.exclude.length} words, like ${rule.exclude.slice(0, 2).join(", ")}` : "nothing"}
        >
          <p className="text-xs text-muted-foreground mb-2">A title with any of these words is not counted, e.g. "business developer" for developers.</p>
          <ChipEditor values={rule.exclude} onChange={(exclude) => onChange({ ...rule, exclude })} placeholder="Add a word" tone="exclude" />
        </Fold>
        <Fold title="Must-have skills" summary={rule.skills.length ? rule.skills.join(", ") : "none: any skills"}>
          <p className="text-xs text-muted-foreground mb-2">Only people whose CV lists every one of these.</p>
          <ChipEditor values={rule.skills} onChange={(skills) => onChange({ ...rule, skills })} placeholder="Add a skill" />
        </Fold>
      </div>

      <label className="flex items-center gap-3 text-sm cursor-pointer w-fit">
        <Switch checked={rule.includePastRoles} onCheckedChange={(v) => onChange({ ...rule, includePastRoles: v })} />
        Also people who did this job before
      </label>

      {error && <Notice tone="error">{error}</Notice>}
      {rule.titles.length === 0 && <p className="text-sm text-muted-foreground">Add at least one job title to run the search.</p>}

      <Button size="lg" onClick={onRun} disabled={rule.titles.length === 0}>
        <Search className="size-4" />Run the search
      </Button>
    </Card>
  );
}

function Running({ search, reconnecting, onStartAgain, onStopped }: {
  search: Career141Search;
  reconnecting: boolean;
  onStartAgain: () => void;
  onStopped: () => void;
}) {
  const sec = useElapsed(search.startedAt);
  // Stop: enough people already. CAREER141 keeps everyone found so far and the results open below (9 Nov, owner).
  const stop = useMutation({ mutationFn: () => api.career141.stop(search.id), onSuccess: onStopped });
  const pct = Math.min(99, Math.round((search.scanned / ABOUT) * 100));
  // A search that stops moving says so rather than spinning for an hour (9 Nov). CAREER141 itself marks a search
  // that has not moved for ten minutes as failed.
  const last = useRef({ scanned: search.scanned, at: Date.now() });
  if (search.scanned !== last.current.scanned) last.current = { scanned: search.scanned, at: Date.now() };
  // While the page cannot reach the server the count cannot move; that is not CAREER141 stopping.
  const stalled = !reconnecting && Date.now() - last.current.at > STALL_MS;
  return (
    <Card className="p-5 space-y-3" aria-live="polite">
      <div className="flex items-center gap-2 font-medium">
        <Loader2 className="size-4 animate-spin text-primary" />
        Searching for {search.rule.label}
        <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">{clock(sec)}</span>
      </div>
      {search.scanned > 0 ? <Progress value={pct} /> : <MovingBar />}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-2xl font-semibold tabular-nums">
          {search.found.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">found so far</span>
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {search.scanned > 0
            ? `Checked ${search.scanned.toLocaleString()} of about ${ABOUT.toLocaleString()} people (${pct}%)`
            : "Starting to check people…"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => stop.mutate()} disabled={stop.isPending || stop.isSuccess}>
          {stop.isPending || stop.isSuccess ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
          {search.found > 0 ? `Stop here and use these ${search.found.toLocaleString()} people` : "Stop the search"}
        </Button>
        <span className="text-xs text-muted-foreground">Have enough? Stop now and work with who is found so far.</span>
      </div>
      {stop.error && <Notice tone="error">{stop.error.message}</Notice>}
      {stalled ? (
        <div className="space-y-2">
          <Notice tone="warn">
            No progress for {Math.round((Date.now() - last.current.at) / 60_000)} minutes. CAREER141 may have stopped this
            search; it gives up on a stuck one after 10 minutes. You can start again.
          </Notice>
          <Button variant="outline" onClick={onStartAgain}><RotateCcw className="size-4" />Start again</Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          A full search takes about 4 minutes and updates every few seconds. You can leave this page and come back: the
          search keeps running, and it is under Your recent searches.
        </p>
      )}
    </Card>
  );
}

const FOUND_AS: Record<Career141Row["kind"], string> = {
  current: "Current role",
  previous: "Previous role",
  meaning: "Found by meaning, check",
};

/** Brevo's own way to open a list: its contacts, filtered to that list (as the Lists page's "View"). */
const listLink = (r: { listId: number; listName: string }) => `/contacts?listId=${r.listId}&listName=${encodeURIComponent(r.listName)}`;

/**
 * Where to save (10 Nov, owner): a folder first, then one of its lists or a new one named here. Nothing is saved until
 * Save. Every person the search and filters keep goes in, not only the page on screen; a list keeps the people it
 * had and skips anyone already in it. Folders and lists are Brevo's own (GET /api/folders, /api/lists?folderId=).
 */
function SaveDialog({ open, onOpenChange, searchId, defaultName, count, emails, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchId: string;
  defaultName: string;
  count: number;
  emails?: string[];
  onSaved: (r: Career141Saved) => void;
}) {
  const qc = useQueryClient();
  const [folderId, setFolderId] = useState("");
  const [choice, setChoice] = useState<number | "new" | null>(null);
  const [name, setName] = useState(defaultName);
  const [find, setFind] = useState("");
  const [newFolder, setNewFolder] = useState<string | null>(null);

  const folders = useQuery({ queryKey: ["folders"], queryFn: () => api.folders.list(), enabled: open });
  const lists = useQuery({
    queryKey: ["lists", "in-folder", folderId],
    queryFn: () => api.lists.list({ folderId: Number(folderId), type: "list", pageSize: 1000 }),
    enabled: open && Boolean(folderId),
  });
  const inFolder = (lists.data?.data ?? []) as { id: number; name: string; contactCount: number }[];
  const needle = find.trim().toLowerCase();
  const shown = needle ? inFolder.filter((l) => l.name.toLowerCase().includes(needle)) : inFolder;

  // An empty folder can only take a new list, so that is already chosen.
  useEffect(() => {
    if (lists.data && inFolder.length === 0 && choice === null) setChoice("new");
  }, [lists.data, inFolder.length, choice]);

  const makeFolder = useMutation({
    mutationFn: (n: string) => api.folders.create({ name: n }),
    onSuccess: (f: { id: number }) => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      setFolderId(String(f.id));
      setChoice("new");
      setNewFolder(null);
    },
  });
  const save = useMutation({
    mutationFn: () =>
      api.career141.save(
        searchId,
        choice === "new" ? { newList: { name: name.trim(), folderId: Number(folderId) } } : { listId: choice as number },
        emails,
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["lists"] });
      qc.invalidateQueries({ queryKey: ["folders"] });
      onSaved(r);
      onOpenChange(false);
      reset();
    },
  });
  function reset() {
    setFolderId("");
    setChoice(null);
    setName(defaultName);
    setFind("");
    setNewFolder(null);
    save.reset();
    makeFolder.reset();
  }

  const ready = Boolean(folderId) && (choice === "new" ? name.trim().length > 0 && name.trim().length <= 191 : choice !== null);
  const word = count === 1 ? "person" : "people";
  const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const noFolders = folders.data !== undefined && folders.data.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (save.isPending) return; // a save under way finishes first; closing would hide its answer
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save {count.toLocaleString()} {word} to a list</DialogTitle>
          <DialogDescription>
            Everyone your search and filters found, across every page, not only the ones on screen. Anyone already in
            the list is skipped, and people already in Brevo keep their status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className={labelClass}>Folder</Label>
            {folders.isLoading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Loading folders…</p>
            ) : newFolder !== null || noFolders ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newFolder ?? ""}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="New folder name"
                  maxLength={255}
                  className="h-10 text-sm"
                  aria-label="New folder name"
                />
                <Button type="button" className="h-10" disabled={!newFolder?.trim() || makeFolder.isPending} onClick={() => makeFolder.mutate(newFolder!.trim())}>
                  {makeFolder.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create"}
                </Button>
                {!noFolders && (
                  <Button type="button" variant="ghost" className="h-10" onClick={() => setNewFolder(null)}>Cancel</Button>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={folderId} onValueChange={(v) => { setFolderId(v); setChoice(null); setFind(""); }}>
                  <SelectTrigger className="h-10 text-sm flex-1" aria-label="Folder"><SelectValue placeholder="Choose a folder" /></SelectTrigger>
                  <SelectContent>
                    {(folders.data ?? []).map((f: { id: number; name: string; _count?: { lists: number } }) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name}{f._count ? ` (${f._count.lists} ${f._count.lists === 1 ? "list" : "lists"})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-10" onClick={() => setNewFolder("")}><Plus className="size-4" />New folder</Button>
              </div>
            )}
            {makeFolder.error && <p className="text-xs text-red-500">{makeFolder.error.message}</p>}
            {folders.error && <p className="text-xs text-red-500">{folders.error.message}</p>}
          </div>

          {folderId && (
            <div className="space-y-2">
              <Label className={labelClass}>List</Label>
              {lists.isLoading ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Loading lists…</p>
              ) : (
                <>
                  {inFolder.length > 6 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a list in this folder" className="h-9 pl-8 text-sm" />
                    </div>
                  )}
                  <div role="radiogroup" aria-label="List" className="max-h-60 overflow-y-auto rounded-lg border divide-y">
                    <label className={cn("flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm hover:bg-muted/60", choice === "new" && "bg-primary/10")}>
                      <input type="radio" name="c141-list" className="accent-primary" checked={choice === "new"} onChange={() => setChoice("new")} />
                      <Plus className="size-4 text-muted-foreground" />
                      <span className="font-medium">New list</span>
                    </label>
                    {shown.map((l) => (
                      <label key={l.id} className={cn("flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm hover:bg-muted/60", choice === l.id && "bg-primary/10")}>
                        <input type="radio" name="c141-list" className="accent-primary" checked={choice === l.id} onChange={() => setChoice(l.id)} />
                        <span className="flex-1 truncate">{l.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{l.contactCount.toLocaleString()} {l.contactCount === 1 ? "contact" : "contacts"}</span>
                      </label>
                    ))}
                    {inFolder.length === 0 && <p className="px-3 py-2.5 text-sm text-muted-foreground">No lists in this folder yet.</p>}
                    {inFolder.length > 0 && shown.length === 0 && <p className="px-3 py-2.5 text-sm text-muted-foreground">No list matches that.</p>}
                  </div>
                  {choice === "new" && (
                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="c141-new-list" className={labelClass}>New list name</Label>
                      <Input id="c141-new-list" value={name} onChange={(e) => setName(e.target.value)} maxLength={191} className="h-10 text-sm" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {save.error && <Notice tone="error">{save.error.message}</Notice>}
          {save.isPending && (
            <p className="text-sm text-muted-foreground flex items-center gap-2" aria-live="polite">
              <Loader2 className="size-4 animate-spin" />Saving {count.toLocaleString()} {word}… large lists take a minute.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" className="h-10 text-sm" disabled={save.isPending} onClick={() => { reset(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button type="button" className="h-10 text-sm min-w-[100px]" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
            Save {count.toLocaleString()} {word}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Results({ search }: { search: Career141Search }) {
  const [filter, setFilter] = useState<RowFilter>(NO_FILTER);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [saved, setSaved] = useState<Career141Saved | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const navigate = useNavigate();

  // Every person, read once, so the filters below narrow the whole list rather than one page of it.
  const all = useQuery({
    queryKey: ["career141-all", search.id],
    staleTime: Infinity,
    queryFn: async () => {
      const rows: Career141Row[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 1000; guard++) {
        const p = await api.career141.rows(search.id, cursor);
        rows.push(...p.rows);
        setLoaded(rows.length);
        if (!p.nextCursor) break;
        cursor = p.nextCursor;
      }
      return rows;
    },
  });
  const rows = useMemo(() => all.data ?? [], [all.data]);
  const shown = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const levels = useMemo(() => levelCounts(rows, LEVELS), [rows]);
  const narrowed = isFiltered(filter);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const set = (patch: Partial<RowFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  const download = useMutation({
    mutationFn: async () => {
      if (!narrowed) return api.career141.download(search.id); // CAREER141's own file, counted there
      const url = URL.createObjectURL(new Blob([rowsToCsv(shown)], { type: "text/csv;charset=utf-8" }));
      const name = `Contacts - ${search.rule.label} (${shown.length} chosen) - ${new Date().toISOString().slice(0, 10)}.csv`;
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onError: (e) => toast.error(e.message),
  });
  const onSaved = (r: Career141Saved) => {
    setSaved(r);
    toast.success(`Saved ${r.saved.toLocaleString()} ${r.saved === 1 ? "person" : "people"} to ${r.listName}`, {
      action: { label: "View list", onClick: () => navigate(listLink(r)) },
      duration: 10_000,
    });
  };

  const count = narrowed ? shown.length : search.found;
  const word = count === 1 ? "person" : "people";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {search.found.toLocaleString()} {search.found === 1 ? "person" : "people"} found for {search.rule.label}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {search.stopped
              ? `You stopped the search after checking ${search.scanned.toLocaleString()} people. These are everyone found up to then.`
              : `Checked ${search.scanned.toLocaleString()} people.`}{" "}
            Narrow the list below, then save it for a campaign.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => download.mutate()} disabled={download.isPending || count === 0 || !all.data}>
            {download.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download {count.toLocaleString()} (Excel)
          </Button>
          <Button onClick={() => setSaveOpen(true)} disabled={count === 0 || !all.data}>
            <ListPlus className="size-4" />
            Save {count.toLocaleString()} {word} as a list
          </Button>
        </div>
      </div>

      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        searchId={search.id}
        defaultName={`${search.rule.label} - ${new Date().toISOString().slice(0, 10)}`}
        count={count}
        // Every person the search and filters keep, across every page, not the 50 on screen.
        emails={narrowed ? shown.map((r) => r.email) : undefined}
        onSaved={onSaved}
      />
      {download.isPending && <Working title="Preparing the Excel file" />}
      {saved && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-950" role="status">
          <span className="flex-1 min-w-60">
            Saved {saved.saved.toLocaleString()} {saved.saved === 1 ? "person" : "people"} to <span className="font-medium">{saved.listName}</span>:{" "}
            {saved.addedToList.toLocaleString()} added
            {saved.alreadyInList > 0 && `, ${saved.alreadyInList.toLocaleString()} already in it and skipped`}.
            {" "}People already in Brevo keep their status, so anyone unsubscribed stays unsubscribed.
          </span>
          <Button asChild size="sm" variant="outline"><Link to={listLink(saved)}>View list</Link></Button>
        </div>
      )}
      {search.meaning && !search.stopped && (/could not|failed|not run|unavailable/i.test(search.meaning)
        ? <Notice tone="warn">{search.meaning}</Notice>
        : <p className="text-sm text-muted-foreground">Also: {search.meaning}, marked "Found by meaning, check".</p>)}

      {/* The filters: one row, everything optional. */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={filter.text}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="Search name, email, title or employer"
            className="h-9 pl-8 bg-background"
            aria-label="Search the people found"
          />
        </div>
        <select className={selectClass} value={filter.level} onChange={(e) => set({ level: e.target.value })} aria-label="Level">
          <option value="">Every level</option>
          {levels.map(([l, n]) => <option key={l} value={l}>{l} ({n.toLocaleString()})</option>)}
        </select>
        <select className={selectClass} value={filter.kind} onChange={(e) => set({ kind: e.target.value as RowFilter["kind"] })} aria-label="Found as">
          <option value="">Any match</option>
          <option value="current">Current role</option>
          <option value="previous">Previous role</option>
          <option value="meaning">By meaning</option>
        </select>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap cursor-pointer px-1">
          <Checkbox checked={filter.hasPhone} onCheckedChange={(v) => set({ hasPhone: v === true })} />
          Has a phone
        </label>
        {narrowed && (
          <Button variant="ghost" size="sm" onClick={() => set(NO_FILTER)}><X className="size-4" />Clear</Button>
        )}
      </div>

      {all.isLoading && <Working title={`Loading the people found (${loaded.toLocaleString()} of ${search.found.toLocaleString()})`} />}
      {all.error && <Notice tone="error">{all.error.message}</Notice>}

      {all.data && (
        <>
          <p className="text-sm text-muted-foreground">
            {narrowed
              ? `Showing ${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} people.`
              : `Showing all ${rows.length.toLocaleString()} people.`}
          </p>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Employer</TableHead>
                  <TableHead>Found as</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      {rows.length === 0 ? "Nobody matched. Start a new search with more titles or levels." : "Nobody fits these filters. Clear one to see more."}
                    </TableCell>
                  </TableRow>
                )}
                {shown.slice(page * PAGE, page * PAGE + PAGE).map((r) => (
                  <TableRow key={r.email}>
                    <TableCell className="font-medium">{r.name ?? "-"}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.title ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.level ?? "-"}</TableCell>
                    <TableCell>{r.employer ?? "-"}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
                        r.kind === "meaning"
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                          : "bg-muted text-foreground",
                      )}>
                        {FOUND_AS[r.kind] ?? r.kind}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-64">{r.matchedBy ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
