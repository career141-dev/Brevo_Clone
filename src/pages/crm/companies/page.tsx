import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Building2, Search, ChevronLeft, ChevronRight, Globe, Phone, User, Users } from "lucide-react";
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
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { api } from "@/lib/api.ts";

export default function CompaniesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["companies", page, pageSize, debouncedSearch],
    queryFn: () => api.companies.list({ q: debouncedSearch || undefined, page, pageSize }),
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
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track companies and their associated contacts synced from Brevo.
          </p>
        </div>
      </div>

      <Card className="border shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/20">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by company name or domain..."
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
                  Company
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3">
                  Domain
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden sm:table-cell">
                  Industry
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden md:table-cell text-right">
                  Revenue
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden lg:table-cell text-center">
                  Contacts
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden xl:table-cell w-[100px]">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/40">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="px-3 py-2.5">
                        <Skeleton className="h-3.5 w-full max-w-[100px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data || data.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-60 text-center px-3">
                    <div className="flex flex-col items-center justify-center">
                      <div className="p-3 rounded-full bg-green-50 dark:bg-green-900/30 mb-4">
                        <Building2 className="size-8 text-green-600 dark:text-green-400" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground/70">
                        {debouncedSearch ? "No companies match your search" : "No companies found"}
                      </p>
                      <p className="text-xs text-muted-foreground/50 mt-0.5">
                        {debouncedSearch
                          ? "Try a different search term"
                          : "Run a Brevo import to sync companies."}
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
                    <TableCell className="px-3 py-2.5 font-medium text-sm">
                      <div className="flex flex-col">
                        <span className="truncate max-w-[200px]">{c.name || "—"}</span>
                        {c.phoneNumber && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                            <Phone className="size-3" />
                            {c.phoneNumber}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-sm truncate max-w-[200px]">
                      {c.domain ? (
                        <a 
                          href={`https://${c.domain}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="size-3.5" />
                          {c.domain}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground text-sm hidden sm:table-cell truncate max-w-[140px]">
                      {c.industry || "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-sm hidden md:table-cell tabular-nums text-right">
                      {c.revenue ? `$${c.revenue.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-sm hidden lg:table-cell text-center">
                      <div className="inline-flex items-center justify-center bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                        <Users className="size-3 mr-1.5" />
                        {c.numberOfContacts || 0}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground text-xs hidden xl:table-cell whitespace-nowrap">
                      {c.createdAt ? format(new Date(c.createdAt), "dd/MM/yyyy") : "—"}
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
    </div>
  );
}
