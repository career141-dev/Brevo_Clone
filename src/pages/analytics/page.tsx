import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";
import { formatDistanceToNow, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { BarChart3, Users, MailOpen, MousePointerClick, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils.ts";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  sending: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  draft: "bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-400",
};

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["analytics", "campaigns"],
    queryFn: () => api.analytics.campaigns(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Campaign Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Track the performance of your sent email campaigns.
        </p>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 flex gap-4">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : !campaigns || campaigns.length === 0 ? (
          <Card className="py-12 flex flex-col items-center justify-center text-center">
            <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <BarChart3 className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No campaigns found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Send your first campaign to see analytics data appear here.
            </p>
          </Card>
        ) : (
          campaigns.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:shadow-md transition-shadow group overflow-hidden"
              onClick={() => navigate(`/analytics/${c.id}`)}
            >
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  {/* Info Section */}
                  <div className="flex-1 p-5 border-b md:border-b-0 md:border-r border-border">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge
                        variant="secondary"
                        className={cn("text-[11px] uppercase px-2 py-0.5", STATUS_STYLES[c.status] || "")}
                      >
                        {c.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {c.sentAt ? format(new Date(c.sentAt), "MMM d, yyyy 'at' h:mm a") : "Not sent yet"}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold group-hover:text-primary transition-colors">
                      {c.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {c.subject}
                    </p>
                  </div>

                  {/* Stats Section */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:w-[60%] shrink-0 bg-muted/20">
                    <div className="p-4 flex flex-col items-center justify-center text-center border-b sm:border-b-0 border-r border-border">
                      <Users className="size-4 text-muted-foreground mb-1.5" />
                      <span className="text-lg font-semibold">{c.stats.recipients.toLocaleString()}</span>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Recipients</span>
                    </div>
                    <div className="p-4 flex flex-col items-center justify-center text-center border-b sm:border-b-0 sm:border-r border-border">
                      <MailOpen className="size-4 text-emerald-500 mb-1.5" />
                      <span className="text-lg font-semibold text-emerald-600">{c.stats.openRate}%</span>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Opened</span>
                    </div>
                    <div className="p-4 flex flex-col items-center justify-center text-center border-r border-border">
                      <MousePointerClick className="size-4 text-blue-500 mb-1.5" />
                      <span className="text-lg font-semibold text-blue-600">{c.stats.clickRate}%</span>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Clicked</span>
                    </div>
                    <div className="p-4 flex flex-col items-center justify-center text-center">
                      <UserMinus className="size-4 text-orange-500 mb-1.5" />
                      <span className="text-lg font-semibold text-orange-600">{c.stats.unsubscribeRate}%</span>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Unsubbed</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
