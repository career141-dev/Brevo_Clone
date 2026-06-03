import { Button } from "@/components/ui/button.tsx";
import { FileText, Plus } from "lucide-react";

export default function TemplatesPage() {
  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Email templates</h1>
        <p className="text-sm text-muted-foreground mt-1">Build and manage reusable email layouts</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-16 text-center">
        <div className="p-3 rounded-full bg-green-50 dark:bg-green-900/30 mb-4">
          <FileText className="size-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">No templates saved</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
          Design and save email templates to reuse across your campaigns.
        </p>
        <Button>
          <Plus className="size-4" />
          New template
        </Button>
      </div>
    </div>
  );
}
