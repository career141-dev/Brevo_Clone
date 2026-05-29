import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { api } from "@/lib/api.ts";

const STATUS_STYLES: Record<string, string> = {
  subscribed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  unsubscribed: "bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-400",
  bounced: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

export default function ContactTable() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", page, pageSize, debouncedSearch],
    queryFn: () => api.contacts.list({ q: debouncedSearch || undefined, page, pageSize }),
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const startRow = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const endRow = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <Card className="border shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/20">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/60">
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3">
                Contact
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3">
                Email
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden sm:table-cell">
                WhatsApp
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden md:table-cell w-[100px]">
                Created
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden lg:table-cell">
                Designation
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden xl:table-cell">
                Company
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 w-[90px]">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-b border-border/40">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j} className="px-3 py-2.5">
                      <Skeleton className="h-3.5 w-full max-w-[100px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data || data.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-60 text-center px-3">
                  <div className="flex flex-col items-center justify-center">
                    <Users className="size-7 text-muted-foreground/30 mb-2" />
                    <p className="text-sm font-medium text-muted-foreground/70">
                      {debouncedSearch ? "No contacts match your search" : "No contacts yet"}
                    </p>
                    <p className="text-xs text-muted-foreground/50 mt-0.5">
                      {debouncedSearch
                        ? "Try a different search term"
                        : "Import contacts from Brevo or add one manually"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((c: any, idx: number) => (
                <TableRow
                  key={c.id}
                  className={cn(
                    "cursor-pointer border-b border-border/40 transition-colors",
                    idx % 2 === 0 ? "bg-background" : "bg-muted/15",
                    "hover:bg-muted/40"
                  )}
                >
                  <TableCell className="px-3 py-2.5 font-medium text-sm truncate max-w-[160px]">
                    {c.name || c.email || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-muted-foreground text-sm truncate max-w-[200px]">
                    {c.email || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-muted-foreground text-sm hidden sm:table-cell truncate max-w-[140px]">
                    {c.whatsapp || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-muted-foreground text-xs hidden md:table-cell whitespace-nowrap">
                    {c.createdAt ? format(new Date(c.createdAt), "dd/MM/yyyy") : "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-muted-foreground text-sm hidden lg:table-cell truncate max-w-[160px]">
                    {c.designation || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-muted-foreground text-sm hidden xl:table-cell truncate max-w-[140px]">
                    {c.company || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] font-semibold border-0 px-1.5 py-0.5",
                        STATUS_STYLES[c.status] ?? ""
                      )}
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer */}
      {data && data.totalPages > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              {startRow}–{endRow} of {data.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]">Rows:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-6 w-14 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">
              Page {data.page} of {data.totalPages.toLocaleString()}
            </span>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
