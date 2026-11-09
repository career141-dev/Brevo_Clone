/**
 * Find in CAREER141 (9 Nov 2026). Ask CAREER141 (the TA System) for people by job: it reads the request into a rule,
 * a person checks the rule and presses Run, CAREER141 checks every candidate, and the people come back here to read,
 * download or save as a list. Nothing on this page sends anything to anyone. One page, no pop-ups: the search id sits
 * in the address (?id=), so a scan that takes a few minutes survives a refresh or a trip to another page.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, ListPlus, Loader2, Plus, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api, type Career141Row, type Career141Rule, type Career141Search } from "@/lib/api.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

// CAREER141's level ladder (convex/lib/roleLevel.ts in the TA System), in its order.
const LEVELS = [
  "Intern / Trainee", "Junior / Associate", "Mid-level", "Senior", "Lead / Assistant Manager",
  "Manager", "Senior Manager / Head", "AGM / DGM", "GM / VP", "Director / C-suite",
];
const EXAMPLES = ["Junior Developers", "Sales Managers", "Customer Experience Managers", "Finance professionals"];
// ponytail: CAREER141 does not say how many candidates it holds, so the bar is against the known size (~78,000).
const ABOUT = 78_000;

export default function Career141Page() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<{ rule: Career141Rule; readBy: "model" | "words" } | null>(null);
  const qc = useQueryClient();

  const access = useQuery({ queryKey: ["career141-access"], queryFn: api.career141.access });
  const search = useQuery({
    queryKey: ["career141", id],
    queryFn: () => api.career141.status(id!),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 4000 : false),
  });

  // Coming back to a search that was read but not run: edit the rule it was read into.
  useEffect(() => {
    if (search.data?.status === "read" && !draft) setDraft({ rule: search.data.rule, readBy: search.data.readBy });
  }, [search.data, draft]);

  const read = useMutation({
    mutationFn: (q: string) => api.career141.read(q),
    onSuccess: (r) => {
      setDraft({ rule: r.rule, readBy: r.readBy });
      setParams({ id: r.id });
    },
  });
  const run = useMutation({
    mutationFn: () => api.career141.run(id!, draft!.rule),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["career141", id] }),
  });

  const startAgain = () => {
    setDraft(null);
    setQuery("");
    read.reset();
    run.reset();
    setParams({});
  };

  const blocked = access.data && (!access.data.connected || !access.data.allowed);
  const s = search.data;

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Find in CAREER141</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask for people by job. CAREER141 checks every candidate and gives you the ones who fit, with their email.
          This page only builds lists. It sends nothing to anyone.
        </p>
      </div>

      {blocked && (
        <Notice tone="warn">
          {!access.data!.allowed
            ? "Only named people may use Find in CAREER141. Ask an admin to add you."
            : "CAREER141 is not connected yet. An admin needs to set its address and key on the server."}
        </Notice>
      )}

      {!id && (
        <Card className="p-5 space-y-4">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) read.mutate(query.trim());
            }}
          >
            <Label htmlFor="c141-query" className="text-base">Who do you want to find?</Label>
            <div className="flex gap-2">
              <Input
                id="c141-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="For example: Find all Junior Developers"
                maxLength={500}
                disabled={Boolean(blocked)}
              />
              <Button type="submit" disabled={!query.trim() || read.isPending || Boolean(blocked)}>
                {read.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Read
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setQuery(`Find all ${ex}`)}
                className="rounded-full border px-3 py-1 hover:bg-accent transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
          {read.isPending && <p className="text-sm text-muted-foreground">Reading your request…</p>}
          {read.error && <Notice tone="error">{read.error.message}</Notice>}
        </Card>
      )}

      {id && search.isLoading && <p className="text-sm text-muted-foreground">Loading the search…</p>}
      {id && search.error && (
        <Card className="p-5 space-y-3">
          <Notice tone="error">{search.error.message}</Notice>
          <Button variant="outline" onClick={startAgain}><RotateCcw className="size-4" />Start again</Button>
        </Card>
      )}

      {s && (
        <p className="text-sm text-muted-foreground">
          You asked: <span className="text-foreground font-medium">{s.query}</span>
        </p>
      )}

      {s?.status === "read" && draft && (
        <RuleCard
          draft={draft}
          onChange={(rule) => setDraft({ ...draft, rule })}
          onRun={() => run.mutate()}
          running={run.isPending}
          error={run.error?.message}
          onStartAgain={startAgain}
        />
      )}

      {s?.status === "running" && <Running search={s} />}

      {s?.status === "failed" && (
        <Card className="p-5 space-y-3">
          <Notice tone="error">The search could not finish: {s.error ?? "CAREER141 did not say why."}</Notice>
          <Button variant="outline" onClick={startAgain}><RotateCcw className="size-4" />Start again</Button>
        </Card>
      )}

      {s?.status === "done" && <Results search={s} onStartAgain={startAgain} />}
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

/** Words as removable chips, plus a box to add one. */
function ChipEditor({ label, values, onChange, placeholder, tone }: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  tone?: "exclude";
}) {
  const [adding, setAdding] = useState("");
  const add = () => {
    const v = adding.trim().toLowerCase();
    if (v && !values.includes(v)) onChange([...values, v]);
    setAdding("");
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
        {values.map((v) => (
          <span
            key={v}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border pl-3 pr-1 py-0.5 text-sm",
              tone === "exclude" ? "bg-muted line-through decoration-muted-foreground/60" : "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
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
      </div>
      <div className="flex gap-2 max-w-sm">
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          maxLength={60}
          className="h-8"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!adding.trim()}>
          <Plus className="size-4" />Add
        </Button>
      </div>
    </div>
  );
}

function RuleCard({ draft, onChange, onRun, running, error, onStartAgain }: {
  draft: { rule: Career141Rule; readBy: "model" | "words" };
  onChange: (r: Career141Rule) => void;
  onRun: () => void;
  running: boolean;
  error?: string;
  onStartAgain: () => void;
}) {
  const { rule, readBy } = draft;
  const toggleLevel = (n: number) =>
    onChange({ ...rule, levels: rule.levels.includes(n) ? rule.levels.filter((x) => x !== n) : [...rule.levels, n].sort((a, b) => a - b) });
  return (
    <Card className="p-5 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Here is what I will search for. Does this look right?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Nothing is searched until you press Run. Change anything first if you need to.
        </p>
      </div>
      {readBy === "words" && <Notice tone="warn">Read without AI. Check the titles.</Notice>}

      <ChipEditor label="Job titles to look for" values={rule.titles} onChange={(titles) => onChange({ ...rule, titles })} placeholder="Add a title" />
      <ChipEditor label="Leave out titles with these words" values={rule.exclude} onChange={(exclude) => onChange({ ...rule, exclude })} placeholder="Add a word" tone="exclude" />
      <ChipEditor label="Must have these skills" values={rule.skills} onChange={(skills) => onChange({ ...rule, skills })} placeholder="Add a skill" />

      <div className="space-y-2">
        <p className="text-sm font-medium">Levels</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {LEVELS.map((name, n) => (
            <label key={n} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={rule.levels.includes(n)} onCheckedChange={() => toggleLevel(n)} />
              {name}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {rule.levels.length ? "Only the ticked levels." : "None ticked: every level."}
        </p>
      </div>

      <label className="flex items-center gap-3 text-sm cursor-pointer">
        <Switch checked={rule.includePastRoles} onCheckedChange={(v) => onChange({ ...rule, includePastRoles: v })} />
        Include people who held this job before
      </label>

      {error && <Notice tone="error">{error}</Notice>}
      {rule.titles.length === 0 && <p className="text-sm text-muted-foreground">Add at least one job title to run the search.</p>}

      <div className="flex gap-2">
        <Button onClick={onRun} disabled={running || rule.titles.length === 0}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Run
        </Button>
        <Button variant="outline" onClick={onStartAgain}><RotateCcw className="size-4" />Start again</Button>
      </div>
    </Card>
  );
}

function Running({ search }: { search: Career141Search }) {
  return (
    <Card className="p-5 space-y-3" aria-live="polite">
      <div className="flex items-center gap-2 font-medium">
        <Loader2 className="size-4 animate-spin" />
        Searching for {search.rule.label}
      </div>
      <Progress value={Math.min(100, (search.scanned / ABOUT) * 100)} />
      <p className="text-sm text-muted-foreground">
        Checked {search.scanned.toLocaleString()} of about {ABOUT.toLocaleString()} people · {search.found.toLocaleString()} found.
        This takes a few minutes. You can leave this page and come back.
      </p>
    </Card>
  );
}

const FOUND_AS: Record<Career141Row["kind"], string> = {
  current: "Current role",
  previous: "Previous role",
  meaning: "Found by meaning, check",
};

function Results({ search, onStartAgain }: { search: Career141Search; onStartAgain: () => void }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [hideMeaning, setHideMeaning] = useState(false);
  const [saved, setSaved] = useState<{ listName: string; added: number; alreadyHad: number } | null>(null);
  const cursor = cursors[cursors.length - 1];

  const rows = useQuery({
    queryKey: ["career141-rows", search.id, cursor],
    queryFn: () => api.career141.rows(search.id, cursor),
  });
  const download = useMutation({
    mutationFn: () => api.career141.download(search.id),
    onError: (e) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: () => api.career141.save(search.id),
    onSuccess: (r) => {
      setSaved(r);
      toast.success(`Saved to ${r.listName}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const shown = (rows.data?.rows ?? []).filter((r) => !hideMeaning || r.kind !== "meaning");

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {search.found.toLocaleString()} {search.found === 1 ? "person" : "people"} found for {search.rule.label}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Checked {search.scanned.toLocaleString()} people.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => download.mutate()} disabled={download.isPending || search.found === 0}>
            {download.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download Excel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || search.found === 0}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
            Save as list
          </Button>
          <Button variant="ghost" onClick={onStartAgain}><RotateCcw className="size-4" />Start again</Button>
        </div>
      </div>

      {saved && (
        <p className="text-sm" role="status">
          Saved to <Link to="/crm/lists" className="font-medium underline">{saved.listName}</Link>.
          Added {saved.added.toLocaleString()}, already had {saved.alreadyHad.toLocaleString()}.
          People who were already here keep their status, so anyone unsubscribed stays unsubscribed.
        </p>
      )}
      {search.meaning && <Notice tone="warn">{search.meaning}</Notice>}

      <label className="flex items-center gap-3 text-sm cursor-pointer w-fit">
        <Switch checked={hideMeaning} onCheckedChange={setHideMeaning} />
        Hide people found by meaning
      </label>

      {rows.error && <Notice tone="error">{rows.error.message}</Notice>}
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
            {rows.isLoading && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!rows.isLoading && shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  {search.found === 0 ? "Nobody matched. Start again and widen the titles or levels." : "Nobody on this page. Turn off the filter or go to the next page."}
                </TableCell>
              </TableRow>
            )}
            {shown.map((r) => (
              <TableRow key={r.email}>
                <TableCell className="font-medium">{r.name ?? "-"}</TableCell>
                <TableCell>{r.email}</TableCell>
                <TableCell>{r.title ?? "-"}</TableCell>
                <TableCell>{r.level ?? "-"}</TableCell>
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

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Page {cursors.length} · up to 500 people a page</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={cursors.length === 1} onClick={() => setCursors(cursors.slice(0, -1))}>
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.data?.nextCursor}
            onClick={() => setCursors([...cursors, rows.data!.nextCursor])}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}
