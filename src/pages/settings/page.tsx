import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Search, Edit2, ShieldCheck, CheckCircle2, ShieldAlert, Copy, ExternalLink } from "lucide-react";
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

  // Search State
  const [senderSearch, setSenderSearch] = useState("");
  const [domainSearch, setDomainSearch] = useState("");

  // DNS Config Modal State
  const [dnsRecordsOpen, setDnsRecordsOpen] = useState(false);
  const [selectedDomainForDns, setSelectedDomainForDns] = useState("");

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

  const domains = useMemo(() => {
    if (!senders) return [];
    const uniqueDomains = new Set<string>();
    senders.forEach((s: any) => {
      const parts = s.email.split("@");
      if (parts.length === 2) uniqueDomains.add(parts[1]);
    });
    const arr = Array.from(uniqueDomains);
    const lowerQ = domainSearch.toLowerCase();
    return arr.filter((d: string) => d.toLowerCase().includes(lowerQ));
  }, [senders, domainSearch]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Senders, Domains & Dedicated IPs
        </h1>
      </div>

      <Tabs defaultValue="senders" className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="senders">Senders</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
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
            <Button onClick={() => setAddSenderOpen(true)} className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white">
              Add sender
            </Button>
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
                  <th className="p-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {domains.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-500">No domains found.</td>
                  </tr>
                ) : (
                  domains.map(domain => {
                    const senderWithDomain = senders?.find((s: any) => s.email.endsWith("@" + domain));
                    const status = sendersStatus?.[domain] || (senderWithDomain ? sendersStatus?.[senderWithDomain.email] : {}) || {};
                    const isVerified = status.verificationStatus === "Success" || status.dkimStatus === "Success";

                    return (
                      <tr key={domain} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors group">
                        <td className="p-4 font-medium text-gray-900 dark:text-gray-100">{domain}</td>
                        <td className="p-4">
                          {isVerified ? (
                            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                              <ShieldCheck className="size-4" /> Authenticated
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500 font-medium">
                              <ShieldAlert className="size-4" /> Not Authenticated
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium"
                            onClick={() => {
                              setSelectedDomainForDns(domain);
                              setDnsRecordsOpen(true);
                            }}
                          >
                            View configuration
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
              1-{domains.length} of {domains.length}
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-2">1 of 1 pages</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 disabled:opacity-50" disabled>1</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
