import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { X, Upload, Key, Check, AlertCircle, Loader2, List } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { api } from "@/lib/api.ts";
import { useQueryClient } from "@tanstack/react-query";

type Props = { open: boolean; onClose: () => void };
type Step = "choose" | "brevo" | "csv" | "importing" | "done";
type Mode = "full" | "lists";

type FullResult = { imported: number; skipped: number; total: number; listsImported: number; contactsLinked: number };
type ListsResult = { contactsLinked: number; listsFound: number };

export default function ImportContactsModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<Mode>("full");
  const [brevoKey, setBrevoKey] = useState("");
  const [result, setResult] = useState<FullResult | ListsResult | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setStep("choose");
    setMode("full");
    setBrevoKey("");
    setResult(null);
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleBrevoImport() {
    if (!brevoKey.trim()) {
      setError("Please enter your Brevo API key");
      return;
    }
    setError("");
    setStep("importing");
    try {
      if (mode === "lists") {
        const res = await api.brevo.linkLists(brevoKey.trim());
        setResult(res);
        setStep("done");
        queryClient.invalidateQueries({ queryKey: ["lists"] });
        queryClient.invalidateQueries({ queryKey: ["segments"] });
        toast.success(`Linked ${res.contactsLinked} contacts to lists`);
      } else {
        const res = await api.brevo.import(brevoKey.trim());
        setResult(res);
        setStep("done");
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
        queryClient.invalidateQueries({ queryKey: ["contact-stats"] });
        queryClient.invalidateQueries({ queryKey: ["lists"] });
        queryClient.invalidateQueries({ queryKey: ["segments"] });
        toast.success(`Imported ${res.imported.toLocaleString()} contacts from Brevo`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      setStep("brevo");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg pointer-events-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                <h2 className="text-base font-semibold">Import your contacts</h2>
                <Button variant="ghost" size="icon" className="size-8 cursor-pointer" onClick={handleClose}>
                  <X className="size-4" />
                </Button>
              </div>

              {/* Body */}
              <div className="px-6 py-6">
                {/* STEP: choose */}
                {step === "choose" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-4">
                      Choose what you'd like to import:
                    </p>
                    <button
                      className="w-full flex items-start gap-4 p-4 border-2 border-primary rounded-xl bg-primary/5 cursor-pointer text-left transition-colors"
                      onClick={() => { setMode("full"); setStep("brevo"); }}
                    >
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Key className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Full import (contacts + lists)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Pull all contacts, lists & segments from Brevo. Duplicates are skipped.
                        </p>
                      </div>
                    </button>
                    <button
                      className="w-full flex items-start gap-4 p-4 border border-border rounded-xl hover:border-primary/50 hover:bg-muted/40 cursor-pointer text-left transition-colors"
                      onClick={() => { setMode("lists"); setStep("brevo"); }}
                    >
                      <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <List className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Link Lists & Segments only</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Link existing contacts to their Brevo lists & segments. No contact data is modified.
                        </p>
                      </div>
                    </button>
                    <button
                      className="w-full flex items-start gap-4 p-4 border border-border rounded-xl hover:border-primary/50 hover:bg-muted/40 cursor-pointer text-left transition-colors"
                      onClick={() => {
                        toast.info("CSV import coming soon — use Brevo API import for now");
                        setStep("csv");
                      }}
                    >
                      <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Upload className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Upload a CSV file</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Export a CSV from Brevo and upload it here. Supported columns: Email, First Name, Last Name, WhatsApp, Company, Designation
                        </p>
                      </div>
                    </button>
                  </div>
                )}

                {/* STEP: brevo */}
                {step === "brevo" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {mode === "lists" ? <List className="size-4 text-primary" /> : <Key className="size-4 text-primary" />}
                      <span>{mode === "lists" ? "Link Lists & Segments" : "Brevo API import"}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Brevo API Key
                      </Label>
                      <Input
                        type="password"
                        placeholder="xkeysib-..."
                        value={brevoKey}
                        onChange={(e) => setBrevoKey(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Find your API key in Brevo → Settings → API Keys. Your key is never stored — it's used only for this import.
                      </p>
                    </div>
                    {error && (
                      <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                        <AlertCircle className="size-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}
                    {mode === "lists" ? (
                      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">What will happen:</p>
                        <p>• Each list & segment in Brevo is scanned for members</p>
                        <p>• Matching contacts in your database are linked</p>
                        <p>• No contact data is added or modified</p>
                        <p className="mt-2 text-[11px]">Quick: only iterates lists (~200), not all contacts.</p>
                      </div>
                    ) : (
                      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">What will be imported:</p>
                        <p>• All contacts with email, name, WhatsApp, company, designation</p>
                        <p>• Lists & segments are imported and contacts are linked</p>
                        <p>• Duplicate emails will be automatically skipped</p>
                        <p>• Blacklisted contacts will be marked as unsubscribed</p>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP: csv */}
                {step === "csv" && (
                  <div className="text-center py-6 space-y-3">
                    <Upload className="size-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium">CSV Import</p>
                    <p className="text-xs text-muted-foreground">
                      CSV import is coming soon. Use the Brevo API import for now to pull all your contacts instantly.
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => setStep("brevo")} className="cursor-pointer">
                      Use Brevo API instead
                    </Button>
                  </div>
                )}

                {/* STEP: importing */}
                {step === "importing" && (
                  <div className="flex flex-col items-center py-10 gap-4">
                    <Loader2 className="size-10 animate-spin text-primary" />
                    <div className="text-center">
                      {mode === "lists" ? (
                        <>
                          <p className="font-medium text-sm">Linking contacts to lists & segments...</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Scanning each list in Brevo and creating links.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-sm">Importing contacts from Brevo...</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Fetching and saving page by page. This can take several minutes for large accounts.
                          </p>
                        </>
                      )}
                      <p className="text-xs text-muted-foreground mt-2 font-medium">
                        Please keep this window open until complete.
                      </p>
                    </div>
                  </div>
                )}

                {/* STEP: done */}
                {step === "done" && result && (
                  <div className="flex flex-col items-center py-8 gap-4">
                    <div className="size-14 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
                      <Check className="size-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold">Import complete!</p>
                      {"listsFound" in result ? (
                        <p className="text-sm text-muted-foreground mt-1">
                          {result.contactsLinked} contacts linked across {result.listsFound} lists & segments
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1">
                          {result.imported.toLocaleString()} contacts imported, {result.skipped.toLocaleString()} duplicates skipped
                        </p>
                      )}
                    </div>
                    {"listsFound" in result ? (
                      <div className="grid grid-cols-3 gap-3 w-full">
                        {[
                          { label: "Lists & Segments", value: result.listsFound.toLocaleString(), color: "text-emerald-600" },
                          { label: "Contacts Linked", value: result.contactsLinked.toLocaleString() },
                        ].map((s) => (
                          <div key={s.label} className="bg-muted rounded-lg p-3 text-center">
                            <p className={cn("text-xl font-bold", s.color ?? "text-foreground")}>{s.value}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3 w-full">
                        {[
                          { label: "Total in Brevo", value: result.total?.toLocaleString() ?? "—" },
                          { label: "Imported", value: result.imported?.toLocaleString() ?? "—", color: "text-emerald-600" },
                          { label: "Skipped", value: result.skipped?.toLocaleString() ?? "—", color: "text-muted-foreground" },
                          { label: "Contacts Linked", value: result.contactsLinked?.toLocaleString() ?? "—" },
                        ].map((s) => (
                          <div key={s.label} className="bg-muted rounded-lg p-3 text-center">
                            <p className={cn("text-xl font-bold", s.color ?? "text-foreground")}>{s.value}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {"listsImported" in result && (
                      <p className="text-xs text-muted-foreground">
                        {result.listsImported} lists & segments imported from Brevo
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
                {step === "choose" && (
                  <Button variant="ghost" size="sm" onClick={handleClose} className="cursor-pointer">
                    Cancel
                  </Button>
                )}
                {step === "brevo" && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setStep("choose")} className="cursor-pointer">
                      Back
                    </Button>
                    <Button size="sm" onClick={handleBrevoImport} className="cursor-pointer">
                      {mode === "lists" ? "Start linking" : "Start import"}
                    </Button>
                  </>
                )}
                {step === "csv" && (
                  <Button variant="ghost" size="sm" onClick={() => setStep("choose")} className="cursor-pointer">
                    Back
                  </Button>
                )}
                {step === "done" && (
                  <Button size="sm" onClick={handleClose} className="cursor-pointer">
                    Done
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
