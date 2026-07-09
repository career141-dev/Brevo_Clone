import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2, Loader2, Search, ShieldCheck, CheckCircle2, ShieldAlert, Copy, ExternalLink, DollarSign, Mail, TrendingUp, RefreshCw, AlertCircle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { toast } from "sonner";
import { api } from "@/lib/api.ts";

export default function SettingsPage() {
  const queryClient = useQueryClient();

  // Dialog State
  const [addSenderOpen, setAddSenderOpen] = useState(false);
  const [newSenderName, setNewSenderName] = useState("");
  const [newSenderEmail, setNewSenderEmail] = useState("");

  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  // Search State
  const [senderSearch, setSenderSearch] = useState("");
  const [domainSearch, setDomainSearch] = useState("");

  // DNS Config Modal State
  const [dnsRecordsOpen, setDnsRecordsOpen] = useState(false);
  const [selectedDomainForDns, setSelectedDomainForDns] = useState("");

  // Billing tab state
  const [billingRange, setBillingRange] = useState<"current_month" | "last_30" | "all_time">("current_month");

  const { data: senders, isLoading } = useQuery({
    queryKey: ["senders"],
    queryFn: () => api.senders.list(),
  });

  const { data: sendersStatus } = useQuery({
    queryKey: ["senders-status", senders?.map((s: any) => s.email).join(",")],
    queryFn: () => {
      if (!senders || senders.length === 0) return Promise.resolve({});
      return api.senders.status(senders.map((s: any) => s.email));
    },
    enabled: !!senders && senders.length > 0,
    refetchInterval: 30000,
  });

  // Billing queries
  const { data: billingSummary, isLoading: isLoadingBilling, refetch: refetchBilling } = useQuery({
    queryKey: ["billing-summary", billingRange],
    queryFn: () => api.billing.summary(billingRange),
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });

  const { data: exchangeRate, isLoading: isLoadingRate } = useQuery({
    queryKey: ["billing-exchange-rate"],
    queryFn: () => api.billing.exchangeRate(),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: awsCosts, isLoading: isLoadingAwsCosts, error: awsCostsError } = useQuery({
    queryKey: ["billing-aws-costs", billingRange],
    queryFn: () => api.billing.awsCosts(billingRange),
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: domainsData, isLoading: isLoadingDomains } = useQuery({
    queryKey: ["aws-domains"],
    queryFn: () => api.domains.list(),
    refetchInterval: 60000,
  });

  const createSenderMutation = useMutation({
    mutationFn: (data: { name: string; email: string }) => api.senders.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["senders"] });
      queryClient.invalidateQueries({ queryKey: ["senders-for-campaign"] });
      toast.success("Sender added successfully!");
      setNewSenderName("");
      setNewSenderEmail("");
      setAddSenderOpen(false);
    },
    onError: () => {
      toast.error("Failed to add sender.");
    },
  });

  const deleteSenderMutation = useMutation({
    mutationFn: (id: number) => api.senders.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["senders"] });
      queryClient.invalidateQueries({ queryKey: ["senders-for-campaign"] });
      toast.success("Sender deleted.");
    },
    onError: () => {
      toast.error("Failed to delete sender.");
    },
  });

  const syncSendersMutation = useMutation({
    mutationFn: () => api.senders.sync(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["senders"] });
      queryClient.invalidateQueries({ queryKey: ["senders-for-campaign"] });
      toast.success(`Successfully synced ${data.synced} senders from AWS.`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to sync senders from AWS.");
    },
  });

  const syncDomainsMutation = useMutation({
    mutationFn: () => api.domains.sync(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["aws-domains"] });
      toast.success(`Successfully synced ${data.synced} domains from AWS.`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to sync domains from AWS.");
    },
  });

  const addDomainMutation = useMutation({
    mutationFn: (domain: string) => api.domains.add(domain),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["aws-domains"] });
      toast.success("Domain added successfully!");
      setNewDomain("");
      setAddDomainOpen(false);
      // Automatically open the DNS records dialog
      setSelectedDomainForDns(variables);
      setDnsRecordsOpen(true);
    },
    onError: (err: any) => {
      toast.error(`Failed to add domain: ${err.message || "Unknown error"}`);
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: (domain: string) => api.domains.remove(domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aws-domains"] });
      toast.success("Domain deleted from local view.");
    },
    onError: () => {
      toast.error("Failed to delete domain.");
    },
  });

  const { data: dnsRecordsData, isLoading: isLoadingDnsRecords, error: errorDnsRecords } = useQuery({
    queryKey: ["dns-records", selectedDomainForDns],
    queryFn: () => api.domains.getDnsRecords(selectedDomainForDns),
    enabled: !!selectedDomainForDns && dnsRecordsOpen,
    retry: false,
  });

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy to clipboard.");
    }
  };

  // Derived Data
  const filteredSenders = useMemo(() => {
    if (!senders) return [];
    const lowerQ = senderSearch.toLowerCase();
    return senders.filter((s: any) => 
      s.name.toLowerCase().includes(lowerQ) || 
      s.email.toLowerCase().includes(lowerQ)
    );
  }, [senders, senderSearch]);

  // Domains come directly from AWS SES — not derived from DB senders
  const filteredDomains = useMemo(() => {
    if (!domainsData?.domains) return [];
    const lowerQ = domainSearch.toLowerCase();
    return domainsData.domains.filter((d: any) => d.domain.toLowerCase().includes(lowerQ));
  }, [domainsData, domainSearch]);

  // Helper: format USD + LKR
  const lkrRate = exchangeRate?.usd_to_lkr ?? 300;
  const fmtCost = (usd: number) => {
    const lkr = usd * lkrRate;
    return {
      usd: usd < 0.0001 ? "$0.00" : `$${usd.toFixed(4)}`,
      lkr: `LKR ${lkr.toFixed(2)}`,
    };
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Settings
        </h1>
      </div>

      <Tabs defaultValue="senders" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="senders">Senders</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="billing">Billing & Costs</TabsTrigger>
        </TabsList>

        {/* SENDERS TAB */}
        <TabsContent value="senders" className="mt-6 space-y-6">
          <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div className="max-w-3xl">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Senders</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A sender is the name and email address that help recipients recognize your brand and feel confident opening your emails. To use a sender, it must be verified. For better email deliverability, your sender's domain should also be authenticated.
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                All your sender domains are compliant with Google, Yahoo, and Microsoft's new requirements for senders. You can use any of them to send your email campaigns.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button 
                variant="outline"
                onClick={() => syncSendersMutation.mutate()} 
                disabled={syncSendersMutation.isPending}
              >
                {syncSendersMutation.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Sync from AWS
              </Button>
              <Button onClick={() => setAddSenderOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                Add sender
              </Button>
            </div>
          </div>

          <div className="flex items-center w-full max-w-md relative">
            <Search className="size-4 absolute left-3 text-gray-400" />
            <Input 
              placeholder="Search sender by name or email" 
              className="pl-9 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
              value={senderSearch}
              onChange={e => setSenderSearch(e.target.value)}
            />
          </div>

          <div className="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="size-6 animate-spin text-gray-400" />
              </div>
            ) : filteredSenders.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No senders found.</div>
            ) : (
              filteredSenders.map((sender: any) => {
                const domain = sender.email.split("@")[1] || "unknown.com";
                const status = sendersStatus?.[sender.email] || {};
                const isVerified = status.verificationStatus === "Success";
                const isDkimVerified = status.dkimStatus === "Success";

                return (
                  <div key={sender.id} className="p-5 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                          {sender.name} <span className="text-gray-500 font-normal">&lt;{sender.email}&gt;</span>
                        </span>
                        {isVerified ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 border-none font-medium text-xs rounded-full px-2.5">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 border-none font-medium text-xs rounded-full px-2.5">
                            Pending Verification
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium">
                          Edit
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity" 
                          onClick={() => {
                            if (window.confirm("Are you sure you want to delete this sender?")) {
                              deleteSenderMutation.mutate(sender.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-400 mb-0.5">IP address</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Shared IP</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-400 mb-0.5">DKIM signature</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">{domain}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-400 mb-0.5">DMARC</span>
                        {isDkimVerified ? (
                          <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                            DMARC is configured
                          </span>
                        ) : (
                          <span className="font-medium text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
                            <ShieldAlert className="size-3.5" />
                            Not configured in AWS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          <div className="flex items-center justify-between text-sm text-gray-500 mt-4 px-2">
            <div>
              Rows per page: <strong>10</strong>
            </div>
            <div>
              1-{filteredSenders.length} of {filteredSenders.length}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 disabled:opacity-50" disabled>1</Button>
            </div>
          </div>
        </TabsContent>

        {/* DOMAINS TAB */}
        <TabsContent value="domains" className="mt-6 space-y-6">
          <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div className="max-w-3xl">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Domains</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                An email domain is the part of your email address that comes after the @ symbol. It helps your recipients recognise your brand and trust your emails. For better deliverability results, domain must be authenticated.
              </p>
              <a href="#" className="text-sm text-blue-600 hover:underline mt-2 inline-block font-medium">
                Learn what a DKIM or DMARC is.
              </a>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button 
                variant="outline"
                onClick={() => syncDomainsMutation.mutate()} 
                disabled={syncDomainsMutation.isPending}
              >
                {syncDomainsMutation.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Sync from AWS
              </Button>
              <Button onClick={() => setAddDomainOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                Add domain
              </Button>
            </div>
          </div>

          <div className="flex items-center w-full max-w-md relative">
            <Search className="size-4 absolute left-3 text-gray-400" />
            <Input 
              placeholder="Search domain by name" 
              className="pl-9 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
              value={domainSearch}
              onChange={e => setDomainSearch(e.target.value)}
            />
          </div>

          <div className="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 text-gray-500 font-medium">
                  <th className="p-4 py-3 font-medium">Domain name</th>
                  <th className="p-4 py-3 font-medium">Domain status</th>
                  <th className="p-4 py-3 font-medium">DKIM</th>
                  <th className="p-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoadingDomains ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center">
                      <Loader2 className="size-6 animate-spin text-gray-400 mx-auto" />
                    </td>
                  </tr>
                ) : filteredDomains.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">No domains found in AWS SES.</td>
                  </tr>
                ) : (
                  filteredDomains.map((d: any) => {
                    const isVerified = d.verificationStatus === "Success";
                    const isDkimVerified = d.dkimStatus === "Success";

                    return (
                      <tr key={d.domain} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors group">
                        <td className="p-4 font-medium text-gray-900 dark:text-gray-100">{d.domain}</td>
                        <td className="p-4">
                          {isVerified ? (
                            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                              <ShieldCheck className="size-4" /> Verified
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500 font-medium">
                              <ShieldAlert className="size-4" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          {isDkimVerified ? (
                            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="size-4" /> Configured
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 font-medium">
                              <ShieldAlert className="size-4" /> Not configured
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium"
                            onClick={() => {
                              setSelectedDomainForDns(d.domain);
                              setDnsRecordsOpen(true);
                            }}
                          >
                            View configuration
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity" 
                            onClick={() => {
                              if (window.confirm("Are you sure you want to delete this domain from the local view?")) {
                                deleteDomainMutation.mutate(d.domain);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500 mt-4 px-2">
            <div>
              Rows per page: <strong>10</strong>
            </div>
            <div>
              1–{filteredDomains.length} of {filteredDomains.length}
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-2">1 of 1 pages</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 disabled:opacity-50" disabled>1</Button>
            </div>
          </div>
        </TabsContent>

        {/* BILLING & COSTS TAB */}
        <TabsContent value="billing" className="mt-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div className="max-w-3xl">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Billing & Costs</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Track your AWS SES email sending costs per campaign. Costs are calculated at $0.10 per 1,000 emails.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => refetchBilling()}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <RefreshCw className="size-3.5" />
                Refresh
              </button>
              <a
                href="https://console.aws.amazon.com/cost-management/home#/cost-explorer"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-md border border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-900/20 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                AWS Cost Explorer
              </a>
            </div>
          </div>

          {/* Time Range Toggle */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
            {(["current_month", "last_30", "all_time"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setBillingRange(r)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  billingRange === r
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                {r === "current_month" ? "This Month" : r === "last_30" ? "Last 30 Days" : "All Time"}
              </button>
            ))}
          </div>

          {/* Exchange Rate Badge */}
          <div className="flex items-center gap-2">
            {isLoadingRate ? (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Fetching exchange rate...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 px-2.5 py-1 rounded-full font-medium">
                <TrendingUp className="size-3" />
                1 USD = {lkrRate.toFixed(2)} LKR
                {exchangeRate?.source === "fallback" && <span className="text-amber-500"> (fallback rate)</span>}
              </span>
            )}
          </div>

          {/* Summary Cards */}
          {isLoadingBilling ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Total Cost Card */}
              <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-xl p-5 shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="size-4 opacity-80" />
                  <span className="text-sm font-medium opacity-80">Total SES Cost</span>
                </div>
                <div className="text-2xl font-bold">
                  {fmtCost(billingSummary?.summary.total_cost_usd ?? 0).usd}
                </div>
                <div className="text-sm opacity-70 mt-0.5">
                  {fmtCost(billingSummary?.summary.total_cost_usd ?? 0).lkr}
                </div>
              </div>

              {/* Emails Sent Card */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-xl p-5 shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="size-4 opacity-80" />
                  <span className="text-sm font-medium opacity-80">Total Emails Sent</span>
                </div>
                <div className="text-2xl font-bold">
                  {(billingSummary?.summary.total_emails_sent ?? 0).toLocaleString()}
                </div>
                <div className="text-sm opacity-70 mt-0.5">
                  {billingSummary?.summary.sent_campaign_count ?? 0} campaigns
                </div>
              </div>

              {/* AWS Real Cost Card */}
              <div className="bg-gradient-to-br from-orange-500 to-orange-700 text-white rounded-xl p-5 shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="size-4 opacity-80" />
                  <span className="text-sm font-medium opacity-80">AWS Actual Cost</span>
                </div>
                {isLoadingAwsCosts ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin opacity-70" />
                    <span className="text-sm opacity-70">Fetching...</span>
                  </div>
                ) : awsCostsError ? (
                  <div className="text-sm opacity-80">
                    <AlertCircle className="size-4 inline mr-1" />
                    {(awsCostsError as any)?.message?.includes("Access Denied") ? "Permission required" : "Unavailable"}
                  </div>
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {fmtCost(awsCosts?.total_cost_usd ?? 0).usd}
                    </div>
                    <div className="text-sm opacity-70 mt-0.5">
                      {fmtCost(awsCosts?.total_cost_usd ?? 0).lkr}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* AWS Monthly Breakdown */}
          {awsCosts?.monthly_breakdown && awsCosts.monthly_breakdown.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">AWS Cost Explorer — Monthly Breakdown</h3>
                <p className="text-xs text-gray-500 mt-0.5">Real billing data from your AWS account</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {awsCosts.monthly_breakdown.map((m, i) => {
                  const cost = fmtCost(m.cost_usd);
                  return (
                    <div key={i} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {m.period ? format(new Date(m.period), "MMMM yyyy") : "—"}
                      </span>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{cost.usd}</div>
                        <div className="text-xs text-gray-500">{cost.lkr}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-Campaign Cost Table */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Cost Per Campaign</h3>
                <p className="text-xs text-gray-500 mt-0.5">Calculated at $0.10 / 1,000 emails (AWS SES standard rate)</p>
              </div>
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 text-gray-500 font-medium">
                  <th className="p-4 py-3 font-medium">Campaign</th>
                  <th className="p-4 py-3 font-medium">Status</th>
                  <th className="p-4 py-3 font-medium">Sent At</th>
                  <th className="p-4 py-3 font-medium text-right">Emails Sent</th>
                  <th className="p-4 py-3 font-medium text-right">Cost (USD)</th>
                  <th className="p-4 py-3 font-medium text-right">Cost (LKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoadingBilling ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center">
                      <Loader2 className="size-6 animate-spin text-gray-400 mx-auto" />
                    </td>
                  </tr>
                ) : !billingSummary?.campaigns || billingSummary.campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500 text-sm">
                      No campaigns found for the selected period.
                    </td>
                  </tr>
                ) : (
                  billingSummary.campaigns.map((c) => {
                    const cost = fmtCost(c.cost_usd);
                    const isSent = c.status === "sent";
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                        <td className="p-4">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{c.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{c.fromEmail}</div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            c.status === "sent"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : c.status === "sending"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse"
                              : c.status === "draft"
                              ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          }`}>
                            {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </span>
                        </td>
                        <td className="p-4 text-gray-600 dark:text-gray-400">
                          {c.sentAt ? format(new Date(c.sentAt), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="p-4 text-right font-medium text-gray-900 dark:text-gray-100">
                          {isSent ? c.emailsSent.toLocaleString() : "—"}
                        </td>
                        <td className="p-4 text-right">
                          {isSent ? (
                            <span className="font-semibold text-blue-700 dark:text-blue-400">{cost.usd}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {isSent ? (
                            <span className="font-semibold text-orange-600 dark:text-orange-400">{cost.lkr}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {billingSummary && billingSummary.campaigns.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 font-semibold">
                    <td className="p-4" colSpan={3}>Total</td>
                    <td className="p-4 text-right">{billingSummary.summary.total_emails_sent.toLocaleString()}</td>
                    <td className="p-4 text-right text-blue-700 dark:text-blue-400">
                      {fmtCost(billingSummary.summary.total_cost_usd).usd}
                    </td>
                    <td className="p-4 text-right text-orange-600 dark:text-orange-400">
                      {fmtCost(billingSummary.summary.total_cost_usd).lkr}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Footer note */}
          <p className="text-xs text-gray-400 dark:text-gray-600">
            Exchange rate refreshes every 5 minutes · Costs auto-refresh every 5 minutes ·
            {exchangeRate?.updated_at && ` Rate last updated: ${format(new Date(exchangeRate.updated_at), "h:mm a")}`}
          </p>
        </TabsContent>
      </Tabs>

      {/* Add Domain Dialog */}
      <Dialog open={addDomainOpen} onOpenChange={setAddDomainOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add a new domain</DialogTitle>
            <DialogDescription>
              Enter the domain name to authenticate. This will initiate verification in AWS SES.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Domain Name</Label>
              <Input
                id="domain"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. acmecorp.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDomainOpen(false)}>
              Cancel
            </Button>
            <Button 
              disabled={!newDomain || addDomainMutation.isPending}
              onClick={() => addDomainMutation.mutate(newDomain)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {addDomainMutation.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Authenticate Domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sender Dialog */}
      <Dialog open={addSenderOpen} onOpenChange={setAddSenderOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add a new sender</DialogTitle>
            <DialogDescription>
              Enter the sender name and email address to use for your campaigns.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Sender Name</Label>
              <Input
                id="name"
                value={newSenderName}
                onChange={(e) => setNewSenderName(e.target.value)}
                placeholder="e.g. Acme Marketing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Sender Email</Label>
              <Input
                id="email"
                type="email"
                value={newSenderEmail}
                onChange={(e) => setNewSenderEmail(e.target.value)}
                placeholder="e.g. hello@acmecorp.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSenderOpen(false)}>
              Cancel
            </Button>
            <Button 
              disabled={!newSenderName || !newSenderEmail || createSenderMutation.isPending}
              onClick={() => createSenderMutation.mutate({ name: newSenderName, email: newSenderEmail })}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {createSenderMutation.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View DNS Configuration Dialog */}
      <Dialog open={dnsRecordsOpen} onOpenChange={setDnsRecordsOpen}>
        <DialogContent className="sm:max-w-[1100px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Authenticate Domain: {selectedDomainForDns}
            </DialogTitle>
            <DialogDescription>
              Add these records to your domain provider (e.g. GoDaddy, AWS Route 53, Cloudflare). Once added, it may take up to 48 hours for the changes to propagate, but often much faster.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {isLoadingDnsRecords ? (
              <div className="flex justify-center p-8">
                <Loader2 className="size-8 animate-spin text-gray-400" />
              </div>
            ) : errorDnsRecords || !dnsRecordsData?.records ? (
              <div className="text-center py-8 px-4">
                <ShieldAlert className="size-12 text-red-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {errorDnsRecords?.message || "Failed to load DNS records"}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                  {errorDnsRecords?.message === "AWS IAM Permission Denied" 
                    ? "Your AWS IAM user does not have permission to verify domains. Please add 'ses:VerifyDomainIdentity' and 'ses:VerifyDomainDkim' permissions to the 'career141User' in AWS IAM."
                    : "An unexpected error occurred while fetching your DNS records."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-600" /> Identity Verification Record
                  </h3>
                  <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden text-sm">
                    {dnsRecordsData.records.filter((r: any) => r.type === "TXT").map((record: any, i: number) => (
                      <div key={i} className="grid grid-cols-[80px_1fr_1.5fr] divide-x divide-gray-200 dark:divide-gray-800 border-b border-gray-200 dark:border-gray-800 last:border-0 bg-gray-50/50 dark:bg-gray-900/20">
                        <div className="p-3 font-medium text-gray-500">TXT</div>
                        <div className="p-3 font-mono text-sm break-all flex items-center justify-between group">
                          <span>{record.name}</span>
                          <button onClick={() => handleCopy(record.name)} className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                        <div className="p-3 font-mono text-sm break-all flex items-center justify-between group">
                          <span>"{record.value}"</span>
                          <button onClick={() => handleCopy(`"${record.value}"`)} className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-600" /> DKIM Records
                  </h3>
                  <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden text-sm">
                    {dnsRecordsData.records.filter((r: any) => r.type === "CNAME").map((record: any, i: number) => (
                      <div key={i} className="grid grid-cols-[80px_1fr_1fr] divide-x divide-gray-200 dark:divide-gray-800 border-b border-gray-200 dark:border-gray-800 last:border-0 bg-gray-50/50 dark:bg-gray-900/20">
                        <div className="p-3 font-medium text-gray-500">CNAME</div>
                        <div className="p-3 font-mono text-sm break-all flex items-center justify-between group">
                          <span>{record.name}</span>
                          <button onClick={() => handleCopy(record.name)} className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                        <div className="p-3 font-mono text-sm break-all flex items-center justify-between group">
                          <span>{record.value}</span>
                          <button onClick={() => handleCopy(record.value)} className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDnsRecordsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
