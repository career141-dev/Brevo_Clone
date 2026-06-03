import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Filter, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { api } from "@/lib/api.ts";

export default function SegmentsPage() {
  const { data: segments, isLoading } = useQuery({
    queryKey: ["segments"],
    queryFn: () => api.segments.list(),
  });

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dynamic contact groups based on filters, synced from Brevo.
          </p>
        </div>
      </div>

      <Card className="border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60 bg-muted/20">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4">
                  Segment Name
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4 hidden sm:table-cell">
                  Category
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4 text-center">
                  Contacts
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4 hidden md:table-cell text-center">
                  Brevo ID
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4 hidden lg:table-cell w-[120px]">
                  Updated
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/40">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !segments || segments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-60 text-center px-4">
                    <div className="flex flex-col items-center justify-center">
                      <div className="p-3 rounded-full bg-violet-50 dark:bg-violet-900/30 mb-4">
                        <Filter className="size-8 text-violet-600 dark:text-violet-400" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground/70">
                        No segments found
                      </p>
                      <p className="text-xs text-muted-foreground/50 mt-0.5">
                        Run a Brevo import to sync your segments.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                segments.map((seg: any, idx: number) => (
                  <TableRow
                    key={seg.id}
                    className={cn(
                      "cursor-pointer border-b border-border/40 transition-colors",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/15",
                      "hover:bg-muted/40"
                    )}
                  >
                    <TableCell className="px-4 py-3 font-medium text-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
                          <Filter className="size-3.5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <span className="truncate max-w-[240px]">{seg.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {seg.segmentType ? (
                        <span className="capitalize">{seg.segmentType}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-center tabular-nums font-medium">
                      {seg.contactCount ?? 0}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell text-center font-mono">
                      {seg.brevoId || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                      {seg.updatedAt ? format(new Date(seg.updatedAt), "dd/MM/yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
