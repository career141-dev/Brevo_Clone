import { useEffect, useRef } from "react";
import { X, Pencil, UserPlus, Download, GitBranch, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";

interface BulkActionsDropdownProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  selectedCount: number;
  onEdit: () => void;
  onAssign: () => void;
  onExport: () => void;
  onAddToAutomation: () => void;
  onDelete: () => void;
}

export default function BulkActionsDropdown({
  open,
  onClose,
  anchorRef,
  selectedCount,
  onEdit,
  onAssign,
  onExport,
  onAddToAutomation,
  onDelete,
}: BulkActionsDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, onClose, anchorRef]);

  if (!open || !anchorRef.current) return null;

  const rect = anchorRef.current.getBoundingClientRect();

  return (
    <div
      ref={dropdownRef}
      className="min-w-[200px] bg-popover border rounded-md shadow-lg z-[999] py-1"
      style={{
        position: "fixed",
        top: rect.bottom + 4,
        left: Math.max(0, rect.right - 200),
      }}
    >
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-sm w-full hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
        disabled={selectedCount !== 1}
        onClick={onEdit}
      >
        <Pencil className="size-4" />
        Edit
      </button>
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-sm w-full hover:bg-accent"
        onClick={onAssign}
      >
        <UserPlus className="size-4" />
        Assign
      </button>
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-sm w-full hover:bg-accent"
        onClick={onExport}
      >
        <Download className="size-4" />
        Export
      </button>
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-sm w-full hover:bg-accent"
        onClick={onAddToAutomation}
      >
        <GitBranch className="size-4" />
        Add to automation
      </button>
      <hr className="my-1 border-t" />
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-sm w-full hover:bg-accent text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
        Delete permanently
      </button>
    </div>
  );
}
