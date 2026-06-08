import { useRef, useState, useEffect } from "react";
import { Search, ChevronLeft, ChevronRight, Users, MoreHorizontal } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";

type Contact = {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  company?: string;
  tags?: string;
  blocked?: boolean;
  status?: string;
  createdAt?: string;
  ownerId?: string;
  designation?: string;
  whatsapp?: string;
  sms?: string;
};

type Props = {
  contacts: Contact[];
  total: number;
  totalPages: number;
  isLoading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  page: number;
  onPageChange: (p: number) => void;
  pageSize: number;
  onPageSizeChange: (s: number) => void;
  selectedIds: number[];
  onSelectAll: (ids: number[]) => void;
  onSelectOne: (id: number) => void;
  onRowEdit: (contact: Contact) => void;
  onRowBlocklist: (contact: Contact) => void;
  onRowAddToList: (contact: Contact) => void;
  onRowAssign: (contact: Contact) => void;
  onRowExport: (contact: Contact) => void;
  onRowAddToAutomation: (contact: Contact) => void;
  onRowDelete: (contact: Contact) => void;
};

function RowActionsDropdown({
  contact,
  onEdit,
  onBlocklist,
  onAddToList,
  onAssign,
  onExport,
  onAddToAutomation,
  onDelete,
}: {
  contact: Contact;
  onEdit: () => void;
  onBlocklist: () => void;
  onAddToList: () => void;
  onAssign: () => void;
  onExport: () => void;
  onAddToAutomation: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px] z-[9999]">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onBlocklist(); }}>
          Blocklist
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddToList(); }}>
          Add to list
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAssign(); }}>
          Assign
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExport(); }}>
          Export
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddToAutomation(); }}>
          Add to automation
        </DropdownMenuItem>
        <div className="my-1 border-t border-border/40" />
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          Delete permanently
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadge({ status, blocked }: { status?: string; blocked?: boolean }) {
  if (blocked || status === "bounced" || status === "complained") {
    return (
      <Badge variant="outline" className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-400 border-red-200 dark:border-red-500/30 text-[10px] px-1.5 py-0 uppercase tracking-wider font-bold">
        {blocked ? "Blocklisted" : status || "Blocklisted"}
      </Badge>
    );
  }
  if (status === "unsubscribed") {
    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-[10px] px-1.5 py-0 uppercase tracking-wider font-bold">
        Unsubscribed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 text-[10px] px-1.5 py-0 uppercase tracking-wider font-bold">
      Subscribed
    </Badge>
  );
}

function ChannelBadges({ contact }: { contact: Contact }) {
  const channels: { label: string; active: boolean }[] = [
    { label: "Email", active: !!contact.email },
    { label: "SMS", active: !!contact.sms },
    { label: "WhatsApp", active: !!contact.whatsapp },
  ];
  return (
    <div className="flex gap-1 flex-wrap">
      {channels.map((ch) => (
        <span
          key={ch.label}
          className={cn(
            "inline-flex items-center px-1.5 py-[1px] rounded text-[10px] font-bold uppercase tracking-wider",
            ch.active
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
              : "bg-muted text-muted-foreground/50"
          )}
        >
          {ch.label}
        </span>
      ))}
    </div>
  );
}

function TagsBadge({ tags }: { tags?: string }) {
  if (!tags) return <span className="text-muted-foreground/50 text-xs">—</span>;
  const list = tags.split(",").map((t) => t.trim()).filter(Boolean);
  return (
    <div className="flex gap-1 flex-wrap max-w-[140px]">
      {list.slice(0, 3).map((t, i) => (
        <Badge key={i} variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
          {t}
        </Badge>
      ))}
      {list.length > 3 && (
        <span className="text-[10px] text-muted-foreground">+{list.length - 3}</span>
      )}
    </div>
  );
}

export default function ContactsTable({
  contacts, total, totalPages, isLoading,
  search, onSearchChange,
  page, onPageChange, pageSize, onPageSizeChange,
  selectedIds, onSelectAll, onSelectOne,
  onRowEdit, onRowBlocklist, onRowAddToList, onRowAssign,
  onRowExport, onRowAddToAutomation, onRowDelete,
}: Props) {
  const startRow = total ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);
  const visibleIds = contacts.map((c) => c.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <Card className="border shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/20">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/60">
              <TableHead className="w-10 px-3">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={() => onSelectAll(visibleIds)}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3">Email</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3">Status</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3">Channels</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden sm:table-cell">Phone</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden md:table-cell">Created</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden lg:table-cell">Company</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-3 hidden xl:table-cell">Tags</TableHead>
              <TableHead className="w-10 px-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-b border-border/40">
                  <TableCell className="px-3 py-2.5"><Skeleton className="size-4" /></TableCell>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j} className="px-3 py-2.5">
                      <Skeleton className="h-3.5 w-full max-w-[100px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !contacts || contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-60 text-center px-3">
                  <div className="flex flex-col items-center justify-center">
                    <Users className="size-7 text-muted-foreground/30 mb-2" />
                    <p className="text-sm font-medium text-muted-foreground/70">
                      {search ? "No contacts match your search" : "No contacts yet"}
                    </p>
                    <p className="text-xs text-muted-foreground/50 mt-0.5">
                      {search ? "Try a different search term" : "Import contacts from Brevo or add one manually"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c, idx) => (
                <TableRow
                  key={c.id}
                  className={cn(
                    "border-b border-border/40 transition-colors group",
                    idx % 2 === 0 ? "bg-background" : "bg-muted/15",
                    "hover:bg-muted/40",
                    c.blocked && "opacity-50"
                  )}
                >
                  <TableCell className="px-3 py-2.5">
                    <Checkbox
                      checked={selectedIds.includes(c.id)}
                      onCheckedChange={() => onSelectOne(c.id)}
                      aria-label={`Select ${c.email}`}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-sm truncate max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{c.email || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <StatusBadge status={c.status} blocked={c.blocked} />
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <ChannelBadges contact={c} />
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-muted-foreground text-sm hidden sm:table-cell truncate max-w-[140px]">
                    {c.phone || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-muted-foreground text-xs hidden md:table-cell whitespace-nowrap">
                    {c.createdAt ? format(new Date(c.createdAt), "dd/MM/yyyy") : "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-muted-foreground text-sm hidden lg:table-cell truncate max-w-[140px]">
                    {c.company || "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 hidden xl:table-cell">
                    <TagsBadge tags={c.tags} />
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <div className="opacity-60 group-hover:opacity-100 transition-opacity">
                      <RowActionsDropdown
                        contact={c}
                        onEdit={() => onRowEdit(c)}
                        onBlocklist={() => onRowBlocklist(c)}
                        onAddToList={() => onRowAddToList(c)}
                        onAssign={() => onRowAssign(c)}
                        onExport={() => onRowExport(c)}
                        onAddToAutomation={() => onRowAddToAutomation(c)}
                        onDelete={() => onRowDelete(c)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer */}
      {total > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{startRow}–{endRow} of {total.toLocaleString()}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]">Rows:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => { onPageSizeChange(Number(v)); onPageChange(1); }}
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
            <span className="text-[11px]">Page {page} of {totalPages.toLocaleString()}</span>
            <div className="flex items-center">
              <Button
                variant="ghost" size="icon" className="size-7"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="size-7"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
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
