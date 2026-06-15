import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowLeft, Download, MailOpen, MousePointerClick, Send, AlertTriangle, UserMinus, ShieldAlert, Globe, MonitorSmartphone, Clock, Ban, FileX, Timer, Activity } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { CampaignContactEvents } from "@/components/analytics/CampaignContactEvents.tsx";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  sending: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  draft: "bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-400",
};

export default function AnalyticsDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", "campaign", id],
    queryFn: () => api.analytics.campaignDetail(Number(id)),
    enabled: !!id,
    refetchInterval: 20_000, // auto-refresh every 20 seconds
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return (
      <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-6 py-12 flex flex-col items-center justify-center text-center">
        <h2 className="text-xl font-semibold mb-2">Campaign Not Found</h2>
        <Button onClick={() => navigate("/analytics")} variant="outline">Back to Analytics</Button>
      </div>
    );
  }

  const { campaign, stats, timeline, advanced } = data;
  const { 
    topLinks = [], 
    devices = { desktop: 0, mobile: 0, tablet: 0, other: 0 }, 
    topBrowsers = [], 
    engagementTimeline = [],
    topDomains = [],
    averageTimeToOpen = null,
    averageTimeToClick = null,
    engagementHeatmap = []
  } = advanced || {};
  
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m ${seconds % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };
  const deviceData = [
    { name: "Desktop", value: devices.desktop },
    { name: "Mobile", value: devices.mobile },
    { name: "Tablet", value: devices.tablet },
    { name: "Other", value: devices.other },
  ].filter(d => d.value > 0);
  
  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

  const handleExport = () => {
    window.location.href = `/api/analytics/campaigns/${campaign.id}/export`;
  };

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/analytics")} className="mt-0.5 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
              <Badge variant="secondary" className={cn("text-[11px] uppercase px-2 py-0.5", STATUS_STYLES[campaign.status] || "")}>
                {campaign.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span>Subject: <strong className="font-medium text-foreground">{campaign.subject}</strong></span>
              <span>•</span>
              <span>Sent: {campaign.sentAt ? format(new Date(campaign.sentAt), "MMM d, yyyy 'at' h:mm a") : "N/A"}</span>
            </p>
          </div>
        </div>
        <Button onClick={handleExport} variant="outline" className="shrink-0 gap-2">
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="size-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <Send className="size-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Delivered</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">{stats.delivered.toLocaleString()}</h3>
                <span className="text-sm font-medium text-blue-600">({stats.deliveryRate}%)</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Out of {stats.recipients.toLocaleString()} recipients</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <MailOpen className="size-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Opened</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">{stats.opened.toLocaleString()}</h3>
                <span className="text-sm font-medium text-emerald-600">({stats.openRate}%)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="size-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <MousePointerClick className="size-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Clicked</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">{stats.clicked.toLocaleString()}</h3>
                <span className="text-sm font-medium text-purple-600">({stats.clickRate}%)</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">CTR from opens: {stats.clickToOpenRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics — 8 metrics in 4 cols (lg) or 2/3 cols */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm bg-muted/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 text-orange-500" />
              <span className="font-medium text-sm">Hard Bounces</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold">{stats.bounced.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground ml-1">({stats.bounceRate}%)</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-muted/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserMinus className="size-5 text-pink-500" />
              <span className="font-medium text-sm">Unsubscribes</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold">{stats.unsubscribed.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground ml-1">({stats.unsubscribeRate}%)</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-muted/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldAlert className="size-5 text-red-500" />
              <span className="font-medium text-sm">Spam Complaints</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold">{stats.complained.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground ml-1">({stats.complaintRate}%)</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-muted/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="size-5 text-yellow-500" />
              <span className="font-medium text-sm">Delivery Delays</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold">{(stats.delayed ?? 0).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground ml-1">({stats.delayRate ?? 0}%)</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-muted/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Ban className="size-5 text-gray-500" />
              <span className="font-medium text-sm">Rejected</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold">{(stats.rejected ?? 0).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground ml-1">({stats.rejectedRate ?? 0}%)</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-muted/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileX className="size-5 text-rose-400" />
              <span className="font-medium text-sm">Render Failures</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold">{(stats.renderingFailures ?? 0).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground ml-1 block">of {stats.recipients}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-muted/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Timer className="size-5 text-cyan-500" />
              <span className="font-medium text-sm">Avg Time to Open</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold">
                {averageTimeToOpen !== null ? formatTime(averageTimeToOpen) : "—"}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm bg-muted/20">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MousePointerClick className="size-5 text-purple-400" />
              <span className="font-medium text-sm">Avg Time to Click</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold">
                {averageTimeToClick !== null ? formatTime(averageTimeToClick) : "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Analytics Grids */}
      {advanced && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Links */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Globe className="size-5 text-indigo-500" />
                  Top Clicked Links
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topLinks.length > 0 ? (
                  <div className="space-y-4">
                    {topLinks.map((link: any, i: number) => (
                      <div key={i} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                        <span className="text-sm font-medium truncate pr-4 text-blue-600 hover:underline cursor-pointer" title={link.url} onClick={() => window.open(link.url, '_blank')}>
                          {link.url}
                        </span>
                        <Badge variant="secondary">{link.count} clicks</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No links clicked yet.</p>
                )}
              </CardContent>
            </Card>

            {/* Devices & Browsers */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <MonitorSmartphone className="size-5 text-purple-500" />
                  Devices & Browsers
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
                {deviceData.length > 0 ? (
                  <div className="h-[200px] w-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deviceData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {deviceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6 w-full">No device data yet.</p>
                )}

                {topBrowsers.length > 0 && (
                  <div className="w-full sm:w-1/2 space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Top Browsers</h4>
                    {topBrowsers.map((b: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{b.name}</span>
                        <span className="font-medium">{b.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Engagement Timeline */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Engagement Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {engagementTimeline.length > 0 ? (
                <div className="h-[300px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={engagementTimeline} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="opens" name="Opens" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">Not enough data to display timeline.</p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Domains */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Globe className="size-5 text-sky-500" />
                  Performance by Domain
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topDomains && topDomains.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase border-b">
                        <tr>
                          <th className="px-2 py-2">Domain</th>
                          <th className="px-2 py-2 text-right">Sent</th>
                          <th className="px-2 py-2 text-right">Open Rate</th>
                          <th className="px-2 py-2 text-right">Click Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {topDomains.map((d: any, i: number) => (
                          <tr key={i}>
                            <td className="px-2 py-3 font-medium">{d.domain}</td>
                            <td className="px-2 py-3 text-right">{d.sent}</td>
                            <td className="px-2 py-3 text-right">{d.delivered > 0 ? Math.round(d.opened/d.delivered*100) : 0}%</td>
                            <td className="px-2 py-3 text-right">{d.delivered > 0 ? Math.round(d.clicked/d.delivered*100) : 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No domain data yet.</p>
                )}
              </CardContent>
            </Card>

            {/* 24-Hour Engagement Heatmap */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="size-5 text-orange-500" />
                  24-Hour Engagement Heatmap
                </CardTitle>
              </CardHeader>
              <CardContent>
                {engagementHeatmap && engagementHeatmap.length > 0 ? (
                  <div className="h-[250px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={engagementHeatmap} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="hour" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}:00`} />
                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          labelFormatter={(h) => `${h}:00 - ${Number(h)+1}:00`}
                        />
                        <Bar dataKey="count" name="Interactions" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No activity data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Timeline List */}
      <CampaignContactEvents campaignId={Number(id)} />
    </div>
  );
}
