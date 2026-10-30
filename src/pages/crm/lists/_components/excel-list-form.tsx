import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { api } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";
import { readSheet, detectColumns, toCandidates, isValidEmail, type Sheet } from "@/lib/candidate-sheet.ts";

type Props = { folders: any[]; onBack: () => void; onDone: () => void };

const labelCls = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export default function ExcelListForm({ folders, onBack, onDone }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [emailCol, setEmailCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const candidates = sheet && emailCol ? toCandidates(sheet.rows, emailCol, nameCol) : [];
  const validCount = candidates.filter((c) => isValidEmail(c.email)).length;

  async function handleFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      const s = await readSheet(file);
      if (!s.rows.length) return setError("That file has no rows.");
      const cols = detectColumns(s.headers);
      setSheet(s);
      setEmailCol(cols.email);
      setNameCol(cols.name);
    } catch {
      setSheet(null);
      setError("Could not read that file. Use .xlsx, .xls or .csv.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("List name is required");
    if (!folderId) return setError("Please select a folder");
    if (!sheet) return setError("Upload an Excel or CSV file");
    if (!emailCol) return setError("Pick the email column");
    if (!validCount) return setError("No valid email addresses found in that column");
    setError("");
    setSaving(true);
    try {
      const res = await api.contacts.importList({ listName: name.trim(), folderId: Number(folderId), contacts: candidates });
      for (const k of ["lists", "lists-stats", "folders", "contacts", "contact-stats"]) {
        queryClient.invalidateQueries({ queryKey: [k] });
      }
      toast.success(
        `"${res.listName}": ${res.created} new, ${res.existing} already existed${res.skipped ? `, ${res.skipped} skipped` : ""}`,
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between min-h-0">
      <div className="space-y-5 overflow-y-auto pr-1">
        <div className="space-y-2">
          <Label htmlFor="excelListName" className={labelCls}>
            List Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="excelListName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales"
            maxLength={191}
            className="h-10 text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className={labelCls}>
            Select a Folder <span className="text-red-500">*</span>
          </Label>
          <Select value={folderId} onValueChange={setFolderId}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Select a folder" />
            </SelectTrigger>
            <SelectContent className="max-h-[250px] overflow-y-auto">
              {folders.map((f: any) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="excelFile" className={labelCls}>
            Excel / CSV file <span className="text-red-500">*</span>
          </Label>
          <Input
            id="excelFile"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="h-10 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Only the candidate name and email columns are used. Other columns are ignored.
          </p>
        </div>

        {sheet && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Email column", value: emailCol, set: setEmailCol, none: "Select" },
                { label: "Name column", value: nameCol, set: setNameCol, none: "None" },
              ].map((c) => (
                <div key={c.label} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{c.label}</Label>
                  <select
                    value={c.value}
                    onChange={(e) => c.set(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{c.none}</option>
                    {sheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">
                {validCount} valid of {sheet.rows.length} rows
              </p>
              {candidates.slice(0, 5).map((c, i) => (
                <p key={i} className="truncate">
                  {c.name || "—"} · {c.email || "—"}
                </p>
              ))}
            </div>
          </>
        )}

        {error && <p className={cn("text-xs text-red-500")}>{error}</p>}
      </div>

      <div className="border-t pt-4 flex items-center justify-between gap-3 mt-6">
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving} className="h-10 text-sm">
          Back
        </Button>
        <Button type="submit" disabled={saving} className="h-10 text-sm min-w-[140px]">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Save list"}
        </Button>
      </div>
    </form>
  );
}
