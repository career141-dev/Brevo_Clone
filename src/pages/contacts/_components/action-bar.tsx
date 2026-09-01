import { forwardRef } from "react";
import { ListPlus, ListMinus, Ban, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

interface ActionBarProps {
  selectedCount: number;
  onAddToList: () => void;
  onRemoveFromList?: () => void;
  onBlocklist: () => void;
  onMoreActions: () => void;
  currentListName?: string;
}

const ActionBar = forwardRef<HTMLButtonElement, ActionBarProps>(function ActionBar({
  selectedCount,
  onAddToList,
  onRemoveFromList,
  onBlocklist,
  onMoreActions,
  currentListName,
}, ref) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center justify-between",
        "px-4 py-2 border-b",
        "bg-muted/50 backdrop-blur"
      )}
    >
      <span className="text-sm font-medium text-muted-foreground">
        {selectedCount} contact{selectedCount !== 1 ? "s" : ""} selected
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onAddToList}>
          <ListPlus className="size-3.5 mr-1" />
          Add to list(s)
        </Button>
        {onRemoveFromList && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRemoveFromList}
            className="hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400"
          >
            <ListMinus className="size-3.5 mr-1 text-amber-600 dark:text-amber-400" />
            {currentListName ? "Remove from list" : "Remove from list(s)"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onBlocklist}>
          <Ban className="size-3.5 mr-1" />
          Blocklist
        </Button>
        <Button variant="outline" size="sm" ref={ref} onClick={onMoreActions}>
          More actions
          <ChevronDown className="size-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
});

export default ActionBar;
