import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { 
  Send, MailOpen, MousePointerClick, AlertTriangle, UserMinus, 
  Search, ChevronLeft, ChevronRight, Clock, Ban, FileX, Info, Paperclip
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CampaignContactEventsProps {
  campaignId: number;
}

const badgeColors: Record<string, string> = {
  sent:              "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delivered:         "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  opened:            "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  clicked:           "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  bounced:           "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  complained:        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  unsubscribed:      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  rejected:          "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
  rendering_failure: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  delayed:           "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export function CampaignContactEvents({ campaignId }: CampaignContactEventsProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<any>(null);

  // Debounce search
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics", "campaign", campaignId, "contact-events", page, pageSize, debouncedSearch],
    queryFn: () => api.analytics.contactEvents(campaignId, { page, pageSize, q: debouncedSearch }),
    enabled: !!campaignId,
  });

  const getPageNumbers = (current: number, totalPages: number) => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push("...");
      const start = Math.max(2, current - 1);
      const end = Math.min(totalPages - 1, current + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (current < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const getHighestState = (events: any[]) => {
    const types = events.map(e => e.eventType);
    if (types.includes("complained")) return "complained";
    if (types.includes("bounced")) return "bounced";
    if (types.includes("unsubscribed")) return "unsubscribed";
    if (types.includes("rejected")) return "rejected";
    if (types.includes("clicked")) return "clicked";
    if (types.includes("opened")) return "opened";
    if (types.includes("delivered")) return "delivered";
    if (types.includes("sent")) return "sent";
    return "unknown";
  };

  const FlowStep = ({ active, icon: Icon, label, colorClass, isLast = false }: any) => (
    <div className="flex items-center">
      <div className={cn(
        "flex flex-col items-center justify-center relative",
        active ? colorClass : "text-muted-foreground/60 grayscale"
      )}>
        <div className={cn(
          "size-6 sm:size-8 rounded-full flex items-center justify-center transition-all duration-300",
          active ? "bg-current bg-opacity-20 shadow-sm scale-110" : "bg-muted"
        )}>
          <Icon className="size-3 sm:size-4 text-current" />
        </div>
        <span className="text-[10px] mt-1 hidden sm:block font-medium">{label}</span>
      </div>
      {!isLast && (
        <div className={cn(
          "w-4 sm:w-8 h-[2px] mx-1 sm:mx-2 rounded-full transition-all duration-300",
          active ? colorClass : "bg-muted-foreground/20"
        )} />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-t-4 border-t-primary/20">
        <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Contact Interactions</CardTitle>
            <CardDescription>Track the journey of each recipient</CardDescription>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by email..."
              className="pl-9 w-full bg-background/50 focus-visible:ring-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-10 text-center text-muted-foreground flex flex-col items-center">
              <AlertTriangle className="size-8 text-destructive/60 mb-2" />
              <p>Failed to load contact events.</p>
            </div>
          ) : data?.data.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground flex flex-col items-center">
              <Info className="size-8 text-muted-foreground/50 mb-2" />
              <p>No contacts found matching your criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-y">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Contact Email</th>
                    <th className="px-6 py-4 font-semibold">Interaction Flow</th>
                    <th className="px-6 py-4 font-semibold text-right">Latest Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data?.data.map((row: any, i: number) => {
                    const types = row.events.map((e: any) => e.eventType);
                    const errorState = ["bounced", "complained", "rejected", "unsubscribed", "delayed"].find(t => types.includes(t));
                    const hasError = !!errorState;
                    const lastEvent = row.events[row.events.length - 1];
                    
                    return (
                      <tr 
                        key={i} 
                        className="bg-card hover:bg-muted/30 transition-colors cursor-pointer group"
                        onClick={() => setSelectedContact(row)}
                      >
                        <td className="px-6 py-4 font-medium truncate max-w-[200px]" title={row.email}>
                          {row.email}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center">
                              <FlowStep 
                                active={types.includes("sent") || types.includes("delivered") || types.includes("opened") || types.includes("clicked") || hasError} 
                                icon={Send} label="Sent" colorClass="text-blue-500" 
                              />
                              <FlowStep 
                                active={types.includes("delivered") || types.includes("opened") || types.includes("clicked")} 
                                icon={MailOpen} label="Delivered" colorClass="text-emerald-500" 
                              />
                              <FlowStep 
                                active={types.includes("opened") || types.includes("clicked")} 
                                icon={MousePointerClick} label="Opened" colorClass="text-green-500" 
                              />
                              <FlowStep 
                                active={types.includes("clicked")} 
                                icon={MousePointerClick} label="Clicked" colorClass="text-purple-500" isLast={true}
                              />
                            </div>
                            {hasError && (
                              <Badge variant="destructive" className="ml-2 animate-pulse flex items-center gap-1 shadow-sm uppercase text-[10px]">
                                <AlertTriangle className="size-3" />
                                {errorState}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground whitespace-nowrap">
                          {lastEvent ? format(new Date(lastEvent.timestamp), "MMM d, h:mm a") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination Bar */}
          {data && data.total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t bg-muted/20 gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Showing <span className="font-semibold text-foreground">{(page - 1) * pageSize + 1}</span> to{" "}
                  <span className="font-semibold text-foreground">{Math.min(page * pageSize, data.total)}</span> of{" "}
                  <span className="font-semibold text-foreground">{data.total.toLocaleString()}</span> contacts
                </span>

                <div className="flex items-center gap-1.5 ml-2 border-l pl-3">
                  <span>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 text-xs bg-background border border-input rounded px-2 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>
              </div>

              {data.totalPages > 1 && (
                <div className="flex items-center space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-8 text-xs px-2"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev
                  </Button>

                  <div className="flex items-center space-x-1">
                    {getPageNumbers(page, data.totalPages).map((p, idx) =>
                      typeof p === "number" ? (
                        <Button
                          key={idx}
                          variant={page === p ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(p)}
                          className={cn("h-8 w-8 p-0 text-xs font-semibold", page === p && "bg-primary text-primary-foreground")}
                        >
                          {p}
                        </Button>
                      ) : (
                        <span key={idx} className="px-1 text-xs text-muted-foreground">
                          ...
                        </span>
                      )
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page >= data.totalPages}
                    className="h-8 text-xs px-2"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-down Sheet */}
      <Sheet open={!!selectedContact} onOpenChange={(open) => !open && setSelectedContact(null)}>
        <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl">Contact Journey</SheetTitle>
            <SheetDescription className="break-all">{selectedContact?.email}</SheetDescription>
          </SheetHeader>
          
          {selectedContact && (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              {selectedContact.events.map((event: any, idx: number) => {
                const isLast = idx === selectedContact.events.length - 1;
                return (
                  <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    {/* Icon */}
                    <div className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-full border-4 border-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10",
                      badgeColors[event.eventType]?.split(' ')[0] || "bg-muted"
                    )}>
                      <span className={cn(
                        "font-bold text-[10px] uppercase tracking-wider",
                        badgeColors[event.eventType]?.split(' ')[1] || "text-foreground"
                      )}>
                        {event.eventType.substring(0, 2)}
                      </span>
                    </div>
                    
                    {/* Content */}
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border bg-card shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary" className={cn("text-[10px] uppercase", badgeColors[event.eventType] || "")}>
                          {event.eventType.replace('_', ' ')}
                        </Badge>
                        <time className="text-xs text-muted-foreground font-mono">
                          {format(new Date(event.timestamp), "h:mm:ss a")}
                        </time>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {format(new Date(event.timestamp), "MMM d, yyyy")}
                      </div>
                      
                      {event.url && (
                        <div className={cn(
                          "mt-3 p-2.5 rounded-md text-xs break-all border flex flex-col gap-1",
                          event.url.includes("/uploads/") || /\.(pdf|docx?|xlsx?|zip|png|jpe?g)$/i.test(event.url)
                            ? "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"
                            : "bg-muted/50 border"
                        )}>
                          {event.url.includes("/uploads/") || /\.(pdf|docx?|xlsx?|zip|png|jpe?g)$/i.test(event.url) ? (
                            <div className="flex items-center justify-between gap-2 text-blue-700 dark:text-blue-300 font-semibold mb-0.5">
                              <span className="flex items-center gap-1.5">
                                <Paperclip className="size-3.5" />
                                <span>Downloaded Attachment:</span>
                              </span>
                              <Badge className="bg-blue-600 text-white text-[10px]">Document Download</Badge>
                            </div>
                          ) : (
                            <span className="font-semibold text-primary">Clicked Link:</span>
                          )}
                          <a href={event.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-[11px]">
                            {event.url.split("/").pop() || event.url}
                          </a>
                        </div>
                      )}
                      
                      {event.userAgent && (
                        <div className="mt-2 text-[10px] text-muted-foreground/70 truncate" title={event.userAgent}>
                          {event.userAgent}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
