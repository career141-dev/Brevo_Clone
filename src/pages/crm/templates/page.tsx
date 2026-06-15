import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Plus, MoreHorizontal, Loader2, Eye, Edit, Trash2, Code } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { api } from "@/lib/api.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import TemplatePickerModal from "@/components/TemplatePickerModal.tsx";
import SimpleEditor from "@/components/SimpleEditor.tsx";

export default function TemplatesPage() {
  const queryClient = useQueryClient();

  // Drawer / Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [nameError, setNameError] = useState("");
  const [htmlError, setHtmlError] = useState("");

  // Editor mode and Picker State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"none" | "simple" | "html">("none");

  // Preview Modal State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewName, setPreviewName] = useState("");

  // Delete Confirm State
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Dynamic Live Preview scaling
  const [containerWidth, setContainerWidth] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [drawerOpen]);
  // Fetch all templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.templates.list(),
  });

  const resetForm = () => {
    setName("");
    setSubject("");
    setPreviewText("");
    setContentHtml("");
    setNameError("");
    setHtmlError("");
    setEditingTemplate(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setPickerOpen(true);
  };

  const handleSelectOption = (option: "drag-drop" | "simple" | "html") => {
    setPickerOpen(false);
    if (option === "html") {
      setEditorMode("html");
      setDrawerOpen(true);
    } else if (option === "simple") {
      setEditorMode("simple");
    }
  };

  const handleOpenEdit = async (template: any) => {
    try {
      // Fetch full template detail (which includes contentHtml)
      const fullTemplate = await api.templates.get(template.id);
      setEditingTemplate(fullTemplate);
      setName(fullTemplate.name || "");
      setSubject(fullTemplate.subject || "");
      setPreviewText(fullTemplate.previewText || "");
      setContentHtml(fullTemplate.contentHtml || "");
      setNameError("");
      setHtmlError("");
      // Default to Simple Editor
      setEditorMode("simple");
    } catch (err: any) {
      toast.error("Failed to load template details");
    }
  };

  const handleOpenPreview = async (template: any) => {
    try {
      const fullTemplate = await api.templates.get(template.id);
      setPreviewHtml(fullTemplate.contentHtml || "");
      setPreviewName(fullTemplate.name || "");
      setPreviewOpen(true);
    } catch (err: any) {
      toast.error("Failed to load template preview");
    }
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => api.templates.create(data),
    onSuccess: () => {
      toast.success("Template created successfully");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDrawerOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create template");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: number; data: any }) => api.templates.update(vars.id, vars.data),
    onSuccess: () => {
      toast.success("Template updated successfully");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDrawerOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update template");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.templates.delete(id),
    onSuccess: () => {
      toast.success("Template deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDeleteOpen(false);
      setDeletingId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete template");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (!name.trim()) {
      setNameError("Template name is required");
      hasError = true;
    } else {
      setNameError("");
    }

    if (!contentHtml.trim()) {
      setHtmlError("HTML content is required");
      hasError = true;
    } else {
      setHtmlError("");
    }

    if (hasError) return;

    const payload = {
      name: name.trim(),
      subject: subject.trim() || null,
      previewText: previewText.trim() || null,
      contentHtml: contentHtml.trim(),
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteMutation.mutate(deletingId);
    }
  };

  const handleSimpleEditorSave = (savedName: string, savedHtml: string) => {
    const payload = {
      name: savedName.trim() || "Untitled Template",
      subject: null,
      previewText: null,
      contentHtml: savedHtml.trim(),
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
    setEditorMode("none");
  };

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build, edit, and manage reusable email layouts for your campaigns.
          </p>
        </div>
        <div>
          <Button onClick={handleOpenCreate} className="flex items-center gap-2">
            <Plus className="size-4" />
            New template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5 border shadow-sm space-y-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/3" />
              <div className="pt-2 flex justify-between">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-16 text-center">
          <div className="p-3 rounded-full bg-green-50 dark:bg-green-900/30 mb-4">
            <FileText className="size-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">No templates saved</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
            Design and save email templates to reuse across your campaigns.
          </p>
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4" />
            New template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template: any) => (
            <Card key={template.id} className="border shadow-sm flex flex-col hover:border-gray-300 dark:hover:border-gray-700 transition-colors relative group overflow-hidden">
              <div className="h-32 bg-gray-50 dark:bg-gray-900 border-b relative overflow-hidden flex-shrink-0">
                {template.contentHtml ? (
                  <iframe
                    srcDoc={`${template.contentHtml}<style>body { overflow: hidden !important; margin: 0; padding: 0; }</style>`}
                    sandbox="allow-same-origin"
                    className="absolute top-0 left-0 w-[400%] h-[400%] origin-top-left pointer-events-none border-none bg-white"
                    style={{ transform: "scale(0.25)" }}
                    tabIndex={-1}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    No Preview
                  </div>
                )}
                <div className="absolute inset-0 bg-transparent z-10" />
              </div>
              <div className="p-5 flex flex-col flex-1 justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                        <FileText className="size-4 text-green-600 dark:text-green-400" />
                      </div>
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate max-w-[180px]">
                        {template.name}
                      </h3>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[140px]">
                        <DropdownMenuItem onClick={() => handleOpenPreview(template)} className="flex items-center gap-2 text-xs">
                          <Eye className="size-3.5" /> Preview Layout
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenEdit(template)} className="flex items-center gap-2 text-xs">
                          <Edit className="size-3.5" /> Edit Template
                        </DropdownMenuItem>
                        <div className="my-1 border-t border-border/40" />
                        <DropdownMenuItem
                          onClick={() => {
                            setDeletingId(template.id);
                            setDeleteOpen(true);
                          }}
                          className="flex items-center gap-2 text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium truncate">
                      Subject: <span className="font-normal text-gray-700 dark:text-gray-300">{template.subject || "—"}</span>
                    </p>
                    {template.previewText && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        Snippet: <span className="italic">{template.previewText}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t pt-3.5 mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Created {format(new Date(template.createdAt), "dd MMM yyyy")}</span>
                  <Button
                    variant="ghost"
                    onClick={() => handleOpenPreview(template)}
                    className="h-6 text-[10px] px-2 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    <Eye className="size-3" /> Preview
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Slide-out Drawer Panel for Creating/Editing Templates */}
      <Sheet open={drawerOpen} onOpenChange={(open) => {
        if (!open) resetForm();
        setDrawerOpen(open);
      }}>
        <SheetContent side="right" className="w-full sm:max-w-[1100px] p-6 flex flex-col gap-6 overflow-y-auto">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-xl font-semibold text-foreground">
              {editingTemplate ? "Edit Template" : "Create Template"}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
              {/* Left Column: Live Preview */}
              <div className="lg:col-span-6 flex flex-col border rounded-md overflow-hidden bg-white dark:bg-slate-900 min-h-[400px]">
                <div className="bg-muted/30 px-3 py-2 border-b flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Eye className="size-3.5" /> Live Preview
                  </span>
                  <span className="text-[10px] text-muted-foreground italic">
                    Updates automatically as you type
                  </span>
                </div>
                <div ref={containerRef} className="flex-1 relative bg-white overflow-hidden min-h-[500px]">
                  {(() => {
                    const scale = containerWidth && containerWidth > 100 ? Math.min(1, containerWidth / 620) : 0.8;
                    return (
                      <iframe
                        title="Live Template Preview"
                        srcDoc={contentHtml ? `${contentHtml}<style>body { overflow-x: hidden !important; }</style>` : '<div style="padding: 20px; color: #888; font-family: sans-serif; text-align: center; margin-top: 40px;">Write HTML code in the editor to see your live preview here.</div>'}
                        sandbox="allow-same-origin"
                        style={{
                          width: `${100 / scale}%`,
                          height: `${100 / scale}%`,
                          transform: `scale(${scale})`,
                          transformOrigin: "top left",
                          position: "absolute",
                          top: 0,
                          left: 0,
                        }}
                        className="border-none bg-white"
                      />
                    );
                  })()}
                </div>
              </div>

              {/* Right Column: Form Inputs */}
              <div className="lg:col-span-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Template Name */}
                  <div className="space-y-2">
                    <Label htmlFor="templateName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Template Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="templateName"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (nameError) setNameError("");
                      }}
                      placeholder="e.g., Job Alert - Weekly"
                      className={cn("h-10 text-sm", nameError && "border-red-500 focus-visible:ring-red-500")}
                    />
                    {nameError && (
                      <p className="text-xs text-red-500 mt-1">{nameError}</p>
                    )}
                  </div>

                  {/* Subject Line */}
                  <div className="space-y-2">
                    <Label htmlFor="templateSubject" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Default Subject Line
                    </Label>
                    <Input
                      id="templateSubject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g., New job matches for you, {{first_name}}!"
                      className="h-10 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Supports personalization tags like <code className="bg-muted px-1 py-0.5 rounded text-[9px] font-mono">{"{{first_name}}"}</code>.
                    </p>
                  </div>

                  {/* Preview Text */}
                  <div className="space-y-2">
                    <Label htmlFor="templatePreviewText" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Preview Text (Preheader)
                    </Label>
                    <Input
                      id="templatePreviewText"
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      placeholder="e.g., Check out these 5 new opportunities in your inbox today..."
                      className="h-10 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Teaser text shown next to subject line in inbox lists.
                    </p>
                  </div>

                  {/* HTML Content */}
                  <div className="space-y-2 flex-1 flex flex-col">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="templateContentHtml" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Code className="size-3.5" /> HTML Content <span className="text-red-500">*</span>
                      </Label>
                      <span className="text-[10px] text-muted-foreground flex gap-2">
                        <span>Required: <code className="bg-red-50 text-red-600 dark:bg-red-950/20 px-1 py-0.5 rounded font-mono">{"{{unsubscribe_url}}"}</code></span>
                      </span>
                    </div>
                    <Textarea
                      id="templateContentHtml"
                      value={contentHtml}
                      onChange={(e) => {
                        setContentHtml(e.target.value);
                        if (htmlError) setHtmlError("");
                      }}
                      placeholder="<h1>Hello {{first_name}}!</h1><p>Welcome to Career141.</p><p><a href='{{unsubscribe_url}}'>Unsubscribe</a></p>"
                      className={cn(
                        "font-mono text-xs min-h-[250px] flex-1 border bg-slate-950 text-slate-100 p-4 focus-visible:ring-emerald-500 focus-visible:border-emerald-500",
                        htmlError && "border-red-500 focus-visible:ring-red-500"
                      )}
                    />
                    {htmlError && (
                      <p className="text-xs text-red-500 mt-1">{htmlError}</p>
                    )}
                    <div className="bg-muted/50 p-2.5 rounded text-[10px] text-muted-foreground space-y-1">
                      <p className="font-semibold text-gray-700 dark:text-gray-300">Available Merge Tags:</p>
                      <div className="grid grid-cols-2 gap-1 font-mono text-[9px]">
                        <div>{"{{first_name}}"} - First Name</div>
                        <div>{"{{last_name}}"} - Last Name</div>
                        <div>{"{{full_name}}"} - Full Name</div>
                        <div>{"{{email}}"} - Email Address</div>
                        <div>{"{{company}}"} - Company Name</div>
                        <div>{"{{designation}}"} - Designation</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Panel Footer */}
            <div className="border-t pt-4 flex items-center justify-end gap-3 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDrawerOpen(false);
                  resetForm();
                }}
                className="h-10 text-sm"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-10 text-sm min-w-[100px]"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : editingTemplate ? (
                  "Save Changes"
                ) : (
                  "Create Template"
                )}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* HTML Sandboxed Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl h-[80vh] flex flex-col p-6">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="text-base font-semibold truncate flex items-center gap-2">
              <Eye className="size-4 text-primary" /> Preview: {previewName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 border bg-white rounded-md overflow-hidden relative mt-4">
            <iframe
              title="Template Preview"
              srcDoc={previewHtml ? `${previewHtml}<style>body { overflow-x: hidden !important; }</style>` : ""}
              sandbox="allow-same-origin"
              className="w-full h-full border-none bg-white"
            />
          </div>
          <div className="flex justify-end pt-3 border-t mt-4">
            <Button size="sm" onClick={() => setPreviewOpen(false)}>Close Preview</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete template?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Are you sure you want to permanently delete this email template? This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3 border-t pt-4 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setDeletingId(null);
              }}
              className="h-9 text-xs"
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              className="h-9 text-xs min-w-[80px]"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TemplatePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectOption={handleSelectOption}
      />

      {editorMode === "simple" && (
        <SimpleEditor
          initialName={name}
          initialHtml={contentHtml}
          onSave={handleSimpleEditorSave}
          onCancel={() => setEditorMode("none")}
        />
      )}
    </div>
  );
}
