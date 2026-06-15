import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { FileText, Code, LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";

interface TemplatePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectOption: (option: "drag-drop" | "simple" | "html") => void;
  // If provided, we show a "Saved Templates" tab to pick an existing one
  savedTemplates?: any[];
  onSelectSaved?: (template: any) => void;
}

export default function TemplatePickerModal({
  open,
  onOpenChange,
  onSelectOption,
  savedTemplates,
  onSelectSaved,
}: TemplatePickerModalProps) {
  const showSavedTab = savedTemplates !== undefined && onSelectSaved !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select a Template Option</DialogTitle>
        </DialogHeader>

        {showSavedTab ? (
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Create New</TabsTrigger>
              <TabsTrigger value="saved">Saved Templates</TabsTrigger>
            </TabsList>
            <TabsContent value="create" className="pt-4">
              <CreationOptions onSelect={onSelectOption} />
            </TabsContent>
            <TabsContent value="saved" className="pt-4">
              <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto p-1">
                {savedTemplates.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-2 text-center py-8">
                    No saved templates found.
                  </p>
                )}
                {savedTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="border rounded-md cursor-pointer hover:border-primary transition-colors flex flex-col overflow-hidden group"
                    onClick={() => onSelectSaved(tpl)}
                  >
                    <div className="h-28 bg-gray-50 dark:bg-gray-900 border-b relative overflow-hidden flex-shrink-0">
                      {tpl.contentHtml ? (
                        <iframe
                          srcDoc={`${tpl.contentHtml}<style>body { overflow: hidden !important; margin: 0; padding: 0; }</style>`}
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
                    <div className="p-3 flex flex-col gap-1">
                      <h4 className="font-semibold text-sm truncate">{tpl.name}</h4>
                      <p className="text-xs text-muted-foreground truncate">{tpl.subject || "No subject"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <CreationOptions onSelect={onSelectOption} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreationOptions({ onSelect }: { onSelect: (opt: any) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Drag & Drop */}
      <div className="border rounded-xl p-6 flex flex-col items-center text-center gap-3 relative overflow-hidden bg-gray-50/50 opacity-70">
        <div className="absolute top-3 right-3">
          <Badge variant="secondary" className="text-[10px] bg-gray-200">Coming Soon</Badge>
        </div>
        <div className="p-3 bg-gray-100 rounded-full text-gray-400">
          <LayoutTemplate className="size-6" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Drag & Drop Editor</h3>
          <p className="text-xs text-muted-foreground mt-1">Build beautiful emails visually without coding.</p>
        </div>
        <Button variant="outline" className="w-full mt-2" disabled>
          Select
        </Button>
      </div>

      {/* Simple Editor */}
      <div className="border rounded-xl p-6 flex flex-col items-center text-center gap-3 hover:border-primary transition-colors hover:shadow-sm">
        <div className="p-3 bg-green-50 rounded-full text-green-600">
          <FileText className="size-6" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Simple Editor</h3>
          <p className="text-xs text-muted-foreground mt-1">A lightweight rich text editor for quick emails.</p>
        </div>
        <Button onClick={() => onSelect("simple")} className="w-full mt-2">
          Select
        </Button>
      </div>

      {/* HTML Custom Code */}
      <div className="border rounded-xl p-6 flex flex-col items-center text-center gap-3 hover:border-primary transition-colors hover:shadow-sm">
        <div className="p-3 bg-blue-50 rounded-full text-blue-600">
          <Code className="size-6" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">HTML Custom Code</h3>
          <p className="text-xs text-muted-foreground mt-1">Write your own raw HTML for full control.</p>
        </div>
        <Button onClick={() => onSelect("html")} variant="outline" className="w-full mt-2">
          Select
        </Button>
      </div>
    </div>
  );
}
