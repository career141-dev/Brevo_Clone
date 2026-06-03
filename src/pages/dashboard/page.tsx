import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Users, Mail, Send, TrendingUp, Plus, ArrowRight, Calendar } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { useEffect } from "react";
import { api } from "@/lib/api.ts";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <motion.div variants={item}>
      <Card className={`border shadow-sm hover:shadow-md transition-shadow duration-200 ${bg}`}>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {label}
              </p>
              <p className="text-2xl font-bold mt-1.5 tabular-nums text-foreground">
                {value.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-background/60 dark:bg-background/40">
              <Icon className={`size-5 ${color}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  sending: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  draft: "bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-400",
};

function DashboardInner() {
  const { user } = useUser();
  const { data: recentCampaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.campaigns.list(),
  });
  const { data: contactStats } = useQuery({
    queryKey: ["contact-stats"],
    queryFn: () => api.contacts.stats(),
  });
  const { data: campaignStats } = useQuery({
    queryKey: ["campaign-stats"],
    queryFn: () => api.campaigns.stats(),
  });
  const navigate = useNavigate();

  const firstName = user?.firstName ?? "there";
  const today = format(new Date(), "EEEE, d MMMM yyyy");

  const stats = [
    {
      label: "Total Contacts",
      value: contactStats?.total ?? 0,
      sub: `${contactStats?.subscribed ?? 0} subscribed`,
      icon: Users,
      color: "text-[#00F59B]",
      bg: "bg-[#D7FEC8] dark:bg-[#00F59B]/15",
    },
    {
      label: "Active Contacts",
      value: contactStats?.subscribed ?? 0,
      sub: `${contactStats?.unsubscribed ?? 0} unsubscribed`,
      icon: TrendingUp,
      color: "text-[#00F59B]",
      bg: "bg-[#D7FEC8] dark:bg-[#00F59B]/15",
    },
    {
      label: "Campaigns Sent",
      value: campaignStats?.sent ?? 0,
      sub: `${campaignStats?.draft ?? 0} in draft`,
      icon: Send,
      color: "text-[#00F59B]",
      bg: "bg-[#D7FEC8] dark:bg-[#00F59B]/15",
    },
    {
      label: "Emails Delivered",
      value: 0,
      sub: `${campaignStats?.total ?? 0} sent campaigns`,
      icon: Mail,
      color: "text-[#00F59B]",
      bg: "bg-[#D7FEC8] dark:bg-[#00F59B]/15",
    },
  ];

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-7">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Hello {firstName} 👋
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground text-sm">
            <Calendar className="size-3.5" />
            <span>{today}</span>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5 cursor-pointer"
          onClick={() => navigate("/campaigns")}
        >
          <Plus className="size-4" />
          Create campaign
        </Button>
      </motion.div>

      {/* Stats grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </motion.div>

      {/* Two-panel row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent campaigns */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35, ease: "easeOut" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Recent Campaigns</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-primary gap-1 cursor-pointer h-7"
              onClick={() => navigate("/campaigns")}
            >
              View all <ArrowRight className="size-3" />
            </Button>
          </div>
          <Card className="border shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="divide-y">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-20 ml-auto" />
                  </div>
                ))}
              </div>
            ) : !recentCampaigns || recentCampaigns.length === 0 ? (
              <div className="py-14 text-center">
                <Mail className="size-9 mx-auto mb-2.5 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No campaigns yet</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3 cursor-pointer"
                  onClick={() => navigate("/campaigns")}
                >
                  Create your first campaign
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {recentCampaigns.slice(0, 6).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => navigate("/campaigns")}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.subject}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {c.sentAt
                          ? formatDistanceToNow(new Date(c.sentAt), { addSuffix: true })
                          : null}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[11px] font-medium border-0 px-2 py-0.5",
                          STATUS_STYLES[c.status] ?? ""
                        )}
                      >
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Quick actions panel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.35, ease: "easeOut" }}
        >
          <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
          <div className="space-y-2.5">
            {[
              {
                title: "Import contacts from Brevo",
                desc: "Bulk import your 84k contacts",
                icon: Users,
                color: "text-violet-600 dark:text-violet-400",
                bg: "bg-violet-100 dark:bg-violet-500/15",
                path: "/contacts",
              },
              {
                title: "Create a campaign",
                desc: "Draft a new email blast",
                icon: Mail,
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-100 dark:bg-blue-500/15",
                path: "/campaigns",
              },
              {
                title: "View analytics",
                desc: "Open/click rates & trends",
                icon: TrendingUp,
                color: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-100 dark:bg-emerald-500/15",
                path: "/analytics",
              },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Card
                  key={action.title}
                  className="border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
                  onClick={() => navigate(action.path)}
                >
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${action.bg} shrink-0`}>
                      <Icon className={`size-4 ${action.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium group-hover:text-primary transition-colors">
                        {action.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{action.desc}</p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground/40 ml-auto shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate("/login");
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded) {
    return (
      <div className="px-6 py-6 space-y-6">
        <Skeleton className="h-7 w-44" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  return <DashboardInner />;
}


