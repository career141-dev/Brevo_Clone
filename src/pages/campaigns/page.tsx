import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Mail,
  Plus,
  MoreHorizontal,
  Loader2,
  Eye,
  Edit,
  Trash2,
  Copy,
  Send,
  Users,
  FileText,
  ChevronRight,
  ArrowLeft,
  Check,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { api } from "@/lib/api.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { toast } from "sonner";

export default function CampaignsPage() {
  const queryClient = useQueryClient();

  // Wizard Drawer State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [campaignId, setCampaignId] = useState<number | null>(null);

  // Step 1: Details
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");

  // Step 2: Audience
  const [audienceId, setAudienceId] = useState<string>("");
  const [listPopoverOpen, setListPopoverOpen] = useState(false);

  // Step 3: Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedTemplateHtml, setSelectedTemplateHtml] = useState<string>("");

  // Report Modal State
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCampaign, setReportCampaign] = useState<any | null>(null);

  // Delete Confirm State
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Queries
  const { data: campaigns, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.campaigns.list(),
  });

  const { data: campaignsStats } = useQuery({
    queryKey: ["campaigns-stats"],
    queryFn: () => api.campaigns.stats(),
  });

  const { data: listsData } = useQuery({
    queryKey: ["lists-for-campaign"],
    queryFn: () => api.lists.list({ pageSize: 10000 }),
    enabled: wizardOpen && step === 2,
  });

  const { data: templates } = useQuery({
    queryKey: ["templates-for-campaign"],
    queryFn: () => api.templates.list(),
    enabled: wizardOpen && step === 3,
  });

  // Contact Stats Query for Step 4
  const { data: audienceStats, isLoading: isLoadingAudienceStats } = useQuery({
    queryKey: ["audience-stats", audienceId],
    queryFn: () => api.contacts.stats({ listId: Number(audienceId) }),
    enabled: wizardOpen && step === 4 && !!audienceId,
  });

  const lists = listsData?.data ?? [];

  // Mutations
  const createCampaignMutation = useMutation({
    mutationFn: (data: any) => api.campaigns.create(data),
    onSuccess: (data) => {
      setCampaignId(data.id);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-stats"] });
      setStep(2);
      toast.success("Campaign details saved!");
    },
    onError: () => {
      toast.error("Failed to save campaign details.");
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: (vars: { id: number; data: any }) => api.campaigns.update(vars.id, vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-stats"] });
      toast.success("Campaign updated successfully!");
    },
    onError: () => {
      toast.error("Failed to update campaign.");
    },
  });

  const sendCampaignMutation = useMutation({
    mutationFn: (id: number) => api.campaigns.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-stats"] });
      toast.success("Campaign started sending!");
      setWizardOpen(false);
      resetWizard();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to send campaign.");
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: number) => api.campaigns.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-stats"] });
      toast.success("Campaign deleted.");
      setDeleteOpen(false);
      setDeletingId(null);
    },
    onError: () => {
      toast.error("Failed to delete campaign.");
    },
  });

  const duplicateCampaignMutation = useMutation({
    mutationFn: (id: number) => api.campaigns.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-stats"] });
      toast.success("Campaign duplicated.");
    },
    onError: () => {
      toast.error("Failed to duplicate campaign.");
    },
  });

  const resetWizard = () => {
    setStep(1);
    setCampaignId(null);
    setName("");
    setSubject("");
    setFromName("");
    setFromEmail("");
    setAudienceId("");
    setListPopoverOpen(false);
    setSelectedTemplateId(null);
    setSelectedTemplateHtml("");
  };

  const handleOpenCreate = () => {
    resetWizard();
    setWizardOpen(true);
  };

  const handleOpenEdit = (campaign: any) => {
    resetWizard();
    setCampaignId(campaign.id);
    setName(campaign.name || "");
    setSubject(campaign.subject || "");
    setFromName(campaign.fromName || "");
    setFromEmail(campaign.fromEmail || "");
    setAudienceId(campaign.audienceId ? String(campaign.audienceId) : "");
    setSelectedTemplateHtml(campaign.templateHtml || "");
    setStep(1);
    setWizardOpen(true);
  };

  const handleNextStep1 = () => {
    if (!name || !subject || !fromName || !fromEmail) {
      toast.error("Please fill in all fields.");
      return;
    }

    const payload = {
      name,
      subject,
      fromName,
      fromEmail,
      audienceType: "list",
      audienceId: audienceId ? Number(audienceId) : 0,
      templateHtml: selectedTemplateHtml,
    };

    if (campaignId) {
      updateCampaignMutation.mutate(
        { id: campaignId, data: payload },
        {
          onSuccess: () => {
            setStep(2);
          },
        }
      );
    } else {
      createCampaignMutation.mutate(payload);
    }
  };

  const handleNextStep2 = () => {
    if (!audienceId) {
      toast.error("Please select a target audience list.");
      return;
    }

    if (campaignId) {
      updateCampaignMutation.mutate(
        {
          id: campaignId,
          data: {
            audienceType: "list",
            audienceId: Number(audienceId),
          },
        },
        {
          onSuccess: () => {
            setStep(3);
          },
        }
      );
    }
  };

  const handleSelectTemplate = async (template: any) => {
    try {
      const fullTemplate = await api.templates.get(template.id);
      setSelectedTemplateId(template.id);
      setSelectedTemplateHtml(fullTemplate.contentHtml || "");

      if (campaignId) {
        updateCampaignMutation.mutate({
          id: campaignId,
          data: {
            templateHtml: fullTemplate.contentHtml || "",
          },
        });
      }
    } catch {
      toast.error("Failed to fetch template HTML.");
    }
  };

  const handleNextStep3 = () => {
    if (!selectedTemplateHtml) {
      toast.error("Please select an email template.");
      return;
    }
    setStep(4);
  };

  const handleNext = () => {
    if (step === 1) handleNextStep1();
    else if (step === 2) handleNextStep2();
    else if (step === 3) handleNextStep3();
  };

  const handleSendCampaign = () => {
    if (!campaignId) return;
    sendCampaignMutation.mutate(campaignId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">Draft</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">Scheduled</Badge>;
      case "sending":
        return <Badge className="bg-amber-100 text-amber-800 animate-pulse hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">Sending</Badge>;
      case "sent":
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">Sent</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header and stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-500 to-green-600 bg-clip-text text-transparent">
            Email Campaigns
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create, manage, and track bulk newsletters and marketing campaigns.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all">
          <Plus className="size-4 mr-2" />
          Create Campaign
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="p-4 bg-card border border-border/60 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Total</p>
          <p className="text-2xl font-bold mt-1">{campaignsStats?.total ?? 0}</p>
        </Card>
        <Card className="p-4 bg-card border border-border/60 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-emerald-600 uppercase">Sent</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{campaignsStats?.sent ?? 0}</p>
        </Card>
        <Card className="p-4 bg-card border border-border/60 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-amber-500 uppercase">Sending</p>
          <p className="text-2xl font-bold mt-1 text-amber-500">{campaignsStats?.sending ?? 0}</p>
        </Card>
        <Card className="p-4 bg-card border border-border/60 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-blue-500 uppercase">Scheduled</p>
          <p className="text-2xl font-bold mt-1 text-blue-500">{campaignsStats?.scheduled ?? 0}</p>
        </Card>
        <Card className="p-4 bg-card border border-border/60 hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-gray-500 uppercase">Drafts</p>
          <p className="text-2xl font-bold mt-1 text-gray-500">{campaignsStats?.draft ?? 0}</p>
        </Card>
      </div>

      {/* Campaigns list */}
      <Card className="border border-border/50 overflow-hidden shadow-sm">
        {isLoadingCampaigns ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-1/4" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-3">
            <div className="size-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto text-emerald-600">
              <Mail className="size-6" />
            </div>
            <h3 className="text-lg font-semibold">No campaigns yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Ready to send your first newsletter? Click the Create Campaign button to get started.
            </p>
            <Button onClick={handleOpenCreate} variant="outline" className="mt-2">
              Start Wizard
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-medium">
                  <th className="p-4">Campaign Name</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Recipients</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{campaign.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{campaign.subject}</div>
                    </td>
                    <td className="p-4">{getStatusBadge(campaign.status)}</td>
                    <td className="p-4">
                      <span className="font-medium">{campaign.totalRecipients || 0}</span>
                    </td>
                    <td className="p-4 text-muted-foreground text-xs">
                      {campaign.status === "sent" && campaign.sentAt ? (
                        <span>Sent {format(new Date(campaign.sentAt), "MMM d, yyyy h:mm a")}</span>
                      ) : (
                        <span>Created {format(new Date(campaign.createdAt), "MMM d, yyyy")}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8 cursor-pointer">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {campaign.status === "draft" && (
                            <>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenEdit(campaign)}>
                                <Edit className="size-4 mr-2" />
                                Edit Draft
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => {
                                  setDeletingId(campaign.id);
                                  setDeleteOpen(true);
                                }}
                              >
                                <Trash2 className="size-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem className="cursor-pointer" onClick={() => duplicateCampaignMutation.mutate(campaign.id)}>
                            <Copy className="size-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          {campaign.status === "sent" && (
                            <DropdownMenuItem
                              className="cursor-pointer font-semibold text-emerald-600 focus:text-emerald-700"
                              onClick={() => {
                                setReportCampaign(campaign);
                                setReportOpen(true);
                              }}
                            >
                              <Eye className="size-4 mr-2" />
                              View Report
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Wizard Drawer */}
      <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col p-0">
          <SheetHeader className="p-6 border-b border-border bg-muted/20">
            <SheetTitle className="text-xl font-bold flex items-center justify-between">
              <span>{campaignId ? "Edit Campaign" : "New Campaign"}</span>
              <span className="text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary rounded-full">
                Step {step} of 4
              </span>
            </SheetTitle>
          </SheetHeader>

          {/* Progress Bar */}
          <div className="w-full h-1 bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>

          <div className="flex-1 p-6 space-y-6">
            {/* Step 1: Details */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Campaign Details</h3>
                  <p className="text-xs text-muted-foreground">Define the campaign header attributes.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="camp-name">Campaign Name</Label>
                    <Input
                      id="camp-name"
                      placeholder="e.g. June Monthly Newsletter"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="camp-subject">Email Subject Line</Label>
                    <Input
                      id="camp-subject"
                      placeholder="e.g. Exclusive Deals Just For You!"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="camp-from-name">From Name</Label>
                      <Input
                        id="camp-from-name"
                        placeholder="e.g. Jane Doe"
                        value={fromName}
                        onChange={(e) => setFromName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="camp-from-email">From Email</Label>
                      <Input
                        id="camp-from-email"
                        placeholder="e.g. hello@company.com"
                        value={fromEmail}
                        onChange={(e) => setFromEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Audience */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Select Audience</h3>
                  <p className="text-xs text-muted-foreground">Select which contact list you want to target.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Contact List</Label>
                    <Popover open={listPopoverOpen} onOpenChange={setListPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={listPopoverOpen}
                          className="w-full justify-between font-normal h-10"
                        >
                          {audienceId
                            ? lists.find((l: any) => String(l.id) === audienceId)?.name ?? "Select a list..."
                            : "Search and select a list..."}
                          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search lists..." />
                          <CommandList>
                            <CommandEmpty>No lists found.</CommandEmpty>
                            <CommandGroup>
                              {lists.map((list: any) => (
                                <CommandItem
                                  key={list.id}
                                  value={list.name}
                                  onSelect={() => {
                                    setAudienceId(String(list.id));
                                    setListPopoverOpen(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 size-4",
                                      audienceId === String(list.id) ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="font-semibold">{list.name}</span>
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    ({list.contactCount ?? 0} contacts)
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Template Selection */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Pick Email Template</h3>
                  <p className="text-xs text-muted-foreground">Select a saved template. A copy of this HTML will be saved with the campaign.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-1">
                  {templates?.map((t: any) => (
                    <Card
                      key={t.id}
                      onClick={() => handleSelectTemplate(t)}
                      className={cn(
                        "p-4 cursor-pointer hover:border-emerald-500 transition-all border flex flex-col justify-between",
                        selectedTemplateId === t.id ? "border-emerald-600 bg-emerald-50/10 shadow-sm" : "border-border/60"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-sm line-clamp-1">{t.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{t.subject || "No subject"}</div>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-[10px] text-muted-foreground">Updated {format(new Date(t.createdAt), "MMM d")}</span>
                        {selectedTemplateId === t.id && (
                          <span className="size-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                            <Check className="size-3" />
                          </span>
                        )}
                      </div>
                    </Card>
                  ))}
                  {(!templates || templates.length === 0) && (
                    <div className="col-span-2 text-center py-8 text-sm text-muted-foreground">
                      No templates found. Create one under "Email Templates" first.
                    </div>
                  )}
                </div>

                {selectedTemplateHtml && (
                  <div className="border border-border rounded-lg overflow-hidden mt-2 bg-muted/10">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Eye className="size-3.5 text-emerald-600" />
                      Template Preview
                    </div>
                    <iframe
                      srcDoc={selectedTemplateHtml}
                      title="Selected Template HTML Preview"
                      className="w-full h-48 border-none bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Review & Send */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Review & Send</h3>
                  <p className="text-xs text-muted-foreground">Double check everything before sending.</p>
                </div>

                <div className="space-y-3 bg-muted/10 border border-border/80 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Campaign Name</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{name}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Subject Line</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{subject}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">From</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{fromName} &lt;{fromEmail}&gt;</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Audience</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {lists.find((l: any) => String(l.id) === audienceId)?.name || "Selected List"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Audience count alert */}
                <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40 rounded-xl p-4 flex items-start gap-3">
                  <Users className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Target Audience Count</p>
                    {isLoadingAudienceStats ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                        <Loader2 className="size-3 animate-spin" />
                        Fetching contact count...
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        This campaign will send to <span className="font-extrabold text-sm">{audienceStats?.subscribed ?? 0}</span> subscribed contacts.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          <div className="p-6 border-t border-border bg-muted/20 flex items-center justify-between">
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="shadow-sm">
                <ArrowLeft className="size-4 mr-2" />
                Back
              </Button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                {createCampaignMutation.isPending || updateCampaignMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="size-4 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleSendCampaign}
                disabled={sendCampaignMutation.isPending || (audienceStats?.subscribed ?? 0) === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
              >
                {sendCampaignMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Sending Bulk...
                  </>
                ) : (
                  <>
                    <Send className="size-4 mr-2" />
                    Send Now
                  </>
                )}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* View Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Campaign Delivery Report</DialogTitle>
            <DialogDescription>
              Details and stats of historical bulk delivery runs.
            </DialogDescription>
          </DialogHeader>

          {reportCampaign && (
            <div className="space-y-6">
              {/* Info block */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/30 border border-border/80 rounded-xl p-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Status</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-sm">Sent</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Sent At</span>
                  <div className="font-semibold text-sm">
                    {reportCampaign.sentAt ? format(new Date(reportCampaign.sentAt), "MMM d, yyyy h:mm a") : "—"}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Total Delivered</span>
                  <div className="font-semibold text-sm text-emerald-600">
                    {reportCampaign.totalRecipients || 0} emails
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Audience ID</span>
                  <div className="font-semibold text-sm">
                    List #{reportCampaign.audienceId || "—"}
                  </div>
                </div>
              </div>

              {/* Delivery Details */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm border-b pb-1">Campaign Details</h4>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Name</span>
                    <span className="font-medium">{reportCampaign.name}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Subject</span>
                    <span className="font-medium">{reportCampaign.subject}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">From Header</span>
                    <span className="font-medium">{reportCampaign.fromName} ({reportCampaign.fromEmail})</span>
                  </div>
                </div>
              </div>

              {/* Preview content */}
              {reportCampaign.templateHtml && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm border-b pb-1">Sent Content Preview</h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <iframe
                      srcDoc={reportCampaign.templateHtml}
                      title="Sent Template Html Content"
                      className="w-full h-80 border-none bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setReportOpen(false)}>Close Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This will permanently delete the draft campaign and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteCampaignMutation.mutate(deletingId)}
              disabled={deleteCampaignMutation.isPending}
            >
              {deleteCampaignMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete Campaign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
