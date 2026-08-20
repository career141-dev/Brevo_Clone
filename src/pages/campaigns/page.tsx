import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
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
  DollarSign,
  UserCheck,
  X,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { toast } from "sonner";
import TemplatePickerModal from "@/components/TemplatePickerModal.tsx";
import SimpleEditor from "@/components/SimpleEditor.tsx";

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Wizard Drawer State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [campaignId, setCampaignId] = useState<number | null>(null);

  // Step 1: Details
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyToName, setReplyToName] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [replyToEmails, setReplyToEmails] = useState<string[]>([]);
  const [newReplyToEmail, setNewReplyToEmail] = useState("");
  const [replyToListId, setReplyToListId] = useState<number | null>(null);

  const handleAddReplyToEmail = () => {
    const trimmed = newReplyToEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes("@")) {
      toast.error("Please enter a valid receptionist email address.");
      return;
    }
    if (replyToEmails.includes(trimmed)) {
      toast.error("This receptionist email address is already added.");
      return;
    }
    setReplyToEmails([...replyToEmails, trimmed]);
    setNewReplyToEmail("");
  };

  // Sender Domain Sheet State
  const [sendersSheetOpen, setSendersSheetOpen] = useState(false);
  const [newSenderName, setNewSenderName] = useState("");
  const [newSenderEmail, setNewSenderEmail] = useState("");

  // Step 2: Audience / Recipients
  const [recipientTab, setRecipientTab] = useState<"lists" | "segments" | "individual">("lists");
  const [selectedListIds, setSelectedListIds] = useState<number[]>([]);
  const [excludedListIds, setExcludedListIds] = useState<number[]>([]);
  const [individualEmails, setIndividualEmails] = useState<string[]>([]);
  const [newIndividualEmail, setNewIndividualEmail] = useState("");
  const [skipUnengaged, setSkipUnengaged] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [listPopoverOpen, setListPopoverOpen] = useState(false);
  const [excludeListPopoverOpen, setExcludeListPopoverOpen] = useState(false);
  const [replyListPopoverOpen, setReplyListPopoverOpen] = useState(false);
  const audienceId = selectedListIds[0] ? String(selectedListIds[0]) : "";

  const handleAddIndividualEmail = () => {
    const trimmed = newIndividualEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (individualEmails.includes(trimmed)) {
      toast.error("This email address is already added.");
      return;
    }
    if (individualEmails.length >= 10) {
      toast.error("You can add up to 10 individual contact email addresses.");
      return;
    }
    setIndividualEmails([...individualEmails, trimmed]);
    setNewIndividualEmail("");
  };

  // Step 3: Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedTemplateHtml, setSelectedTemplateHtml] = useState<string>("");

  // Step 5: Test Email State & Quota Modal State
  const [testEmail, setTestEmail] = useState<string>("");
  const [lastTestSentTo, setLastTestSentTo] = useState<{ email: string; time: string } | null>(null);
  const [planExceededModalOpen, setPlanExceededModalOpen] = useState(false);

  // Template Picker / Editor State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"none" | "simple">("none");

  // Report Modal State
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCampaign, setReportCampaign] = useState<any | null>(null);

  // Delete Confirm State
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Bulk Delete State
  const [selectedCampaigns, setSelectedCampaigns] = useState<number[]>([]);

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
    enabled: wizardOpen,
  });

  const { data: senders } = useQuery({
    queryKey: ["senders-for-campaign"],
    queryFn: () => api.senders.list(),
    enabled: wizardOpen && step === 1,
  });

  const { data: templates } = useQuery({
    queryKey: ["templates-for-campaign"],
    queryFn: () => api.templates.list(),
    enabled: wizardOpen && step === 3,
  });

  // Contact Stats Query for Step 2 & 5
  const listIdsParam = selectedListIds.length > 0 ? selectedListIds.join(",") : "";
  const { data: audienceStats, isLoading: isLoadingAudienceStats } = useQuery({
    queryKey: ["audience-stats", listIdsParam],
    queryFn: () => api.contacts.stats({ listIds: listIdsParam }),
    enabled: wizardOpen && selectedListIds.length > 0,
  });

  const { data: quotaData, isLoading: isLoadingQuota } = useQuery({
    queryKey: ["ses-quota"],
    queryFn: () => api.senders.quota(),
    enabled: wizardOpen,
  });

  const lists = listsData?.data ?? [];

  // Live exchange rate for cost estimate in step 5
  const { data: campaignExchangeRate } = useQuery({
    queryKey: ["billing-exchange-rate"],
    queryFn: () => api.billing.exchangeRate(),
    staleTime: 5 * 60 * 1000,
    enabled: wizardOpen && step === 5,
  });

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
    onError: (err: any) => {
      const serverDetails = err?.response?.data?.details;
      const serverError = err?.response?.data?.error;
      const msg = serverDetails ? `${serverError || "Save failed"}: ${serverDetails}` : (serverError || err?.message || "Failed to save campaign details.");
      toast.error(msg, { duration: 6000 });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: (vars: { id: number; data: any }) => api.campaigns.update(vars.id, vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-stats"] });
      toast.success("Campaign updated successfully!");
    },
    onError: (err: any) => {
      const serverDetails = err?.response?.data?.details;
      const serverError = err?.response?.data?.error;
      const msg = serverDetails ? `${serverError || "Update failed"}: ${serverDetails}` : (serverError || err?.message || "Failed to update campaign.");
      toast.error(msg, { duration: 6000 });
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
      const serverDetails = err?.response?.data?.details;
      const serverError = err?.response?.data?.error;
      const msg = serverDetails ? `${serverError || "Send failed"}: ${serverDetails}` : (serverError || err?.message || "Failed to send campaign.");
      toast.error(msg, { duration: 6000 });
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: (vars: { testEmail: string }) => {
      const resolvedReplyToEmail = replyToEmails.length > 0 ? replyToEmails.join(",") : null;
      const draftData = {
        subject,
        fromName: fromName || senders?.[0]?.name || "Talent Suite 2026",
        fromEmail: fromEmail || senders?.[0]?.email || "events@premiumroles.com",
        replyToEmail: resolvedReplyToEmail,
        replyToListId,
        templateHtml: selectedTemplateHtml,
      };
      return api.campaigns.sendTest(campaignId || 0, vars.testEmail, draftData);
    },
    onSuccess: (_, vars) => {
      const sentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastTestSentTo({ email: vars.testEmail, time: sentTime });
      toast.success(`Test email sent to ${vars.testEmail}! Please check your inbox.`);
    },
    onError: (err: any) => {
      const serverDetails = err?.response?.data?.details;
      const serverError = err?.response?.data?.error;
      const msg = serverDetails ? `${serverError || "Failed to send test email"}: ${serverDetails}` : (serverError || err?.message || "Failed to send test email.");
      toast.error(msg, { duration: 6000 });
    },
  });

  const handleSendTestEmail = () => {
    if (!testEmail || !testEmail.trim() || !testEmail.includes("@")) {
      toast.error("Please enter a valid test email address.");
      return;
    }
    if (!selectedTemplateHtml) {
      toast.error("Please select or design an email template before sending a test email.");
      return;
    }
    sendTestEmailMutation.mutate({ testEmail: testEmail.trim() });
  };

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

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => api.campaigns.deleteBulk(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-stats"] });
      toast.success(`Deleted ${data.affected} campaigns.`);
      setSelectedCampaigns([]);
    },
    onError: () => {
      toast.error("Failed to delete selected campaigns.");
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

  const resetCampaignMutation = useMutation({
    mutationFn: (id: number) => api.campaigns.reset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns-stats"] });
      toast.success("Campaign status updated!");
    },
    onError: () => {
      toast.error("Failed to reset campaign status.");
    },
  });

  const createSenderMutation = useMutation({
    mutationFn: (data: { name: string; email: string }) => api.senders.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["senders-for-campaign"] });
      toast.success("Sender added successfully!");
      setNewSenderName("");
      setNewSenderEmail("");
    },
    onError: () => {
      toast.error("Failed to add sender.");
    },
  });

  const resetWizard = () => {
    setStep(1);
    setCampaignId(null);
    setName("");
    setSubject("");
    setPreviewText("");
    setFromName("");
    setFromEmail("");
    setReplyToName("");
    setReplyToEmail("");
    setReplyToEmails([]);
    setNewReplyToEmail("");
    setReplyToListId(null);
    setRecipientTab("lists");
    setSelectedListIds([]);
    setExcludedListIds([]);
    setIndividualEmails([]);
    setNewIndividualEmail("");
    setSkipUnengaged(false);
    setShowAdvanced(false);
    setListPopoverOpen(false);
    setExcludeListPopoverOpen(false);
    setSelectedTemplateId(null);
    setSelectedTemplateHtml("");
    setTestEmail("");
    setLastTestSentTo(null);
  };

  const handleOpenCreate = () => {
    resetWizard();
    setWizardOpen(true);
  };

  const handleOpenEdit = async (campaign: any) => {
    resetWizard();
    setCampaignId(campaign.id);
    setWizardOpen(true);

    let fullCampaign = campaign;
    try {
      fullCampaign = await api.campaigns.get(campaign.id);
    } catch (err) {
      console.warn("Failed to fetch fresh campaign details, using list item fallback:", err);
    }

    setName(fullCampaign.name || "");
    setSubject(fullCampaign.subject || "");
    setPreviewText(fullCampaign.previewText || "");
    setFromName(fullCampaign.fromName || "");
    setFromEmail(fullCampaign.fromEmail || "");
    setReplyToName(fullCampaign.replyToName || "");
    setReplyToEmail(fullCampaign.replyToEmail || "");

    if (fullCampaign.replyToEmail) {
      const emails = String(fullCampaign.replyToEmail).split(",").map(e => e.trim()).filter(Boolean);
      setReplyToEmails(emails);
    } else {
      setReplyToEmails([]);
    }

    setReplyToListId(fullCampaign.replyToListId ? Number(fullCampaign.replyToListId) : null);
    setSkipUnengaged(Boolean(fullCampaign.skipUnengaged));

    if (fullCampaign.audienceType === "individual" || fullCampaign.individualEmails) {
      setRecipientTab("individual");
      const emails = String(fullCampaign.individualEmails || "").split(",").map(e => e.trim()).filter(Boolean);
      setIndividualEmails(emails);
    } else {
      setRecipientTab("lists");
    }

    let listIds: number[] = [];
    if (fullCampaign.audienceListIds) {
      listIds = String(fullCampaign.audienceListIds)
        .split(",")
        .map(id => Number(id.trim()))
        .filter(n => !isNaN(n) && n > 0);
    } else if (fullCampaign.audienceId && Number(fullCampaign.audienceId) > 0) {
      listIds = [Number(fullCampaign.audienceId)];
    }
    setSelectedListIds(listIds);

    if (fullCampaign.excludeListIds) {
      const exc = String(fullCampaign.excludeListIds)
        .split(",")
        .map(id => Number(id.trim()))
        .filter(n => !isNaN(n) && n > 0);
      setExcludedListIds(exc);
      if (exc.length > 0) setShowAdvanced(true);
    } else {
      setExcludedListIds([]);
    }

    setSelectedTemplateHtml(fullCampaign.templateHtml || "");
    setStep(1);
  };

  const handleSaveDraft = () => {
    const resolvedReplyToEmail = replyToEmails.length > 0 ? replyToEmails.join(",") : null;
    const payload = {
      name: name || "Untitled Campaign Draft",
      subject: subject || "",
      previewText: previewText || null,
      fromName: fromName || "Default Sender",
      fromEmail: fromEmail || "",
      replyToName: replyToName.trim() || null,
      replyToEmail: resolvedReplyToEmail,
      replyToListId,
      audienceType: recipientTab === "individual" ? "individual" : "list",
      audienceId: selectedListIds[0] || 0,
      audienceListIds: recipientTab === "individual" ? null : (selectedListIds.length > 0 ? selectedListIds.join(",") : null),
      individualEmails: recipientTab === "individual" ? (individualEmails.length > 0 ? individualEmails.join(",") : null) : null,
      excludeListIds: excludedListIds.length > 0 ? excludedListIds.join(",") : null,
      skipUnengaged,
      templateHtml: selectedTemplateHtml || "",
      status: "draft",
    };

    if (campaignId) {
      updateCampaignMutation.mutate(
        { id: campaignId, data: payload },
        {
          onSuccess: () => {
            toast.success("Draft saved successfully!");
            setWizardOpen(false);
            resetWizard();
          },
        }
      );
    } else {
      createCampaignMutation.mutate(payload, {
        onSuccess: () => {
          toast.success("Draft created and saved!");
          setWizardOpen(false);
          resetWizard();
        },
      });
    }
  };

  const handleNextStep1 = () => {
    if (!fromName || !fromEmail) {
      toast.error("Please provide a sender name and email.");
      return;
    }
    if (!testEmail) {
      setTestEmail(fromEmail);
    }
    const resolvedReplyToEmail = replyToEmails.length > 0 ? replyToEmails.join(",") : null;

    console.log("[STEP 1] replyToEmails:", replyToEmails, "resolved:", resolvedReplyToEmail);

    const step1Data = { fromName, fromEmail, replyToName, replyToEmail: resolvedReplyToEmail, replyToListId };

    if (campaignId) {
      // Existing campaign — update immediately
      updateCampaignMutation.mutate(
        { id: campaignId, data: step1Data },
        { onSuccess: () => setStep(2) }
      );
    } else {
      // NEW campaign — create a draft immediately so replyToEmail is persisted
      createCampaignMutation.mutate(
        {
          name: name || "Untitled Campaign",
          subject: subject || "(No subject)",
          previewText: previewText || null,
          fromName,
          fromEmail,
          replyToName: replyToName.trim() || null,
          replyToEmail: resolvedReplyToEmail,
          replyToListId,
          templateHtml: "",
          audienceType: "list",
          audienceId: 0,
          audienceListIds: null,
          individualEmails: null,
          excludeListIds: null,
          skipUnengaged: false,
        },
        {
          onSuccess: (data) => {
            setCampaignId(data.id);
            console.log("[STEP 1] Campaign draft created with ID:", data.id, "replyToEmail:", data.replyToEmail);
            setStep(2);
          },
        }
      );
    }
  };

  const handleNextStep2 = () => {
    if (recipientTab === "individual") {
      if (individualEmails.length === 0) {
        toast.error("Please add at least one individual contact email address.");
        return;
      }
    } else {
      if (selectedListIds.length === 0) {
        toast.error("Please select at least one target audience list.");
        return;
      }
    }

    // campaignId is always set now (created in Step 1)
    updateCampaignMutation.mutate(
      {
        id: campaignId!,
        data: {
          audienceType: recipientTab === "individual" ? "individual" : "list",
          audienceId: selectedListIds[0] || 0,
          audienceListIds: recipientTab === "individual" ? null : selectedListIds.join(","),
          individualEmails: recipientTab === "individual" ? individualEmails.join(",") : null,
          excludeListIds: excludedListIds.length > 0 ? excludedListIds.join(",") : null,
          skipUnengaged,
        },
      },
      { onSuccess: () => setStep(3) }
    );
  };

  const handleNextStep3 = () => {
    if (!subject) {
      toast.error("Subject is missing. Please add a subject line before sending.");
      return;
    }
    if (!name) {
      toast.error("Campaign Name is missing.");
      return;
    }

    const resolvedReplyToEmail = replyToEmails.length > 0 ? replyToEmails.join(",") : null;

    console.log("[CAMPAIGN WIZARD] handleNextStep3 replyToEmails state:", replyToEmails);
    console.log("[CAMPAIGN WIZARD] resolvedReplyToEmail being saved:", resolvedReplyToEmail);

    const payload = {
      name,
      subject,
      previewText,
      fromName,
      fromEmail,
      replyToName: replyToName.trim() || null,
      replyToEmail: resolvedReplyToEmail,
      replyToListId,
      audienceType: recipientTab === "individual" ? "individual" : "list",
      audienceId: selectedListIds[0] || 0,
      audienceListIds: recipientTab === "individual" ? null : selectedListIds.join(","),
      individualEmails: recipientTab === "individual" ? individualEmails.join(",") : null,
      excludeListIds: excludedListIds.length > 0 ? excludedListIds.join(",") : null,
      skipUnengaged,
      templateHtml: selectedTemplateHtml,
    };

    // campaignId is always set now (created in Step 1)
    updateCampaignMutation.mutate(
      { id: campaignId!, data: payload },
      { onSuccess: () => setStep(4) }
    );
  };

  const handleSelectTemplate = async (template: any) => {
    try {
      const fullTemplate = await api.templates.get(template.id);
      setSelectedTemplateId(template.id);
      setSelectedTemplateHtml(fullTemplate.contentHtml || "");
      setPickerOpen(false); // Close the modal

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

  const handleSelectOption = (option: "drag-drop" | "simple" | "html") => {
    setPickerOpen(false);
    if (option === "simple") {
      setEditorMode("simple");
      // Hide the wizard momentarily to show the full-screen editor
      setWizardOpen(false);
    } else {
      toast.info(`${option} editor coming soon!`);
    }
  };

  const handleOpenEditorForCurrent = () => {
    setWizardOpen(false);
    setEditorMode("simple");
  };

  const handleSimpleEditorSave = async (savedName: string, savedHtml: string) => {
    const cleanHtml = savedHtml.trim();
    setSelectedTemplateHtml(cleanHtml);

    // 1. Update existing campaign draft if created
    if (campaignId) {
      updateCampaignMutation.mutate({
        id: campaignId,
        data: { templateHtml: cleanHtml },
      });
    } else if (name && name.trim()) {
      try {
        const newCamp = await api.campaigns.create({
          name: name.trim(),
          subject: subject.trim() || name.trim(),
          fromName: fromName || "Talent Suite 2026",
          fromEmail: fromEmail || "events@premiumroles.com",
          templateHtml: cleanHtml,
        });
        setCampaignId(newCamp.id);
      } catch (err) {
        console.warn("Failed to auto-create draft for template save:", err);
      }
    }

    // 2. Update selected base template if linked
    if (selectedTemplateId) {
      try {
        await api.templates.update(selectedTemplateId, {
          name: savedName.trim() || "Campaign Template",
          contentHtml: cleanHtml,
        });
        queryClient.invalidateQueries({ queryKey: ["templates-for-campaign"] });
      } catch (err) {
        console.warn("Failed to update base template record:", err);
      }
    }

    setEditorMode("none");
    setWizardOpen(true);
    toast.success("Email design & attachments updated successfully!");
  };

  const createCampaignTemplateMutation = useMutation({
    mutationFn: (data: any) => api.templates.create(data),
    onSuccess: (newTemplate) => {
      handleSelectTemplate(newTemplate);
      setEditorMode("none");
      setWizardOpen(true); // Bring back the wizard
      toast.success("Template created and assigned!");
    },
    onError: () => {
      toast.error("Failed to create template.");
    }
  });

  const handleNextStep4 = () => {
    if (!selectedTemplateHtml) {
      toast.error("Please select an email template.");
      return;
    }
    if (campaignId) {
      updateCampaignMutation.mutate(
        {
          id: campaignId,
          data: {
            templateHtml: selectedTemplateHtml,
          },
        },
        { onSuccess: () => setStep(5) }
      );
    } else {
      setStep(5);
    }
  };

  const handleNext = () => {
    if (step === 1) handleNextStep1();
    else if (step === 2) handleNextStep2();
    else if (step === 3) handleNextStep3();
    else if (step === 4) handleNextStep4();
  };

  const handleSendCampaign = () => {
    if (!campaignId) return;

    const recipientCount = audienceStats?.subscribed ?? 0;
    const remainingEmails = quotaData?.remaining;

    if (remainingEmails !== undefined && remainingEmails !== null && recipientCount > remainingEmails) {
      setPlanExceededModalOpen(true);
      return;
    }

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
        {selectedCampaigns.length > 0 && (
          <div className="bg-muted/50 p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">{selectedCampaigns.length} campaigns selected</span>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => bulkDeleteMutation.mutate(selectedCampaigns)}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : <Trash2 className="size-4 mr-2" />}
              Delete Selected
            </Button>
          </div>
        )}
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
                  <th className="p-4 w-10">
                    <Checkbox
                      checked={campaigns.length > 0 && selectedCampaigns.length === campaigns.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCampaigns(campaigns.map((c: any) => c.id));
                        } else {
                          setSelectedCampaigns([]);
                        }
                      }}
                    />
                  </th>
                  <th className="p-4">Campaign Name</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Recipients</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {campaigns.map((campaign: any) => (
                  <tr key={campaign.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-4 w-10">
                      <Checkbox
                        checked={selectedCampaigns.includes(campaign.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedCampaigns((prev) => [...prev, campaign.id]);
                          } else {
                            setSelectedCampaigns((prev) => prev.filter((id) => id !== campaign.id));
                          }
                        }}
                      />
                    </td>
                    <td
                      className="p-4 cursor-pointer select-none"
                      onClick={() => {
                        if (campaign.status === "draft") {
                          handleOpenEdit(campaign);
                        } else if (campaign.status === "sent") {
                          setReportCampaign(campaign);
                          setReportOpen(true);
                        }
                      }}
                    >
                      <div className="font-semibold text-gray-900 dark:text-gray-100 hover:text-emerald-600 transition-colors flex items-center gap-2">
                        {campaign.name}
                        {campaign.status === "draft" && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
                            Click to Edit / Send ➔
                          </span>
                        )}
                      </div>
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
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenEdit(campaign)}>
                              <Edit className="size-4 mr-2" />
                              Edit Draft
                            </DropdownMenuItem>
                          )}
                          {campaign.status === "sending" && (
                            <DropdownMenuItem
                              className="cursor-pointer text-amber-600 focus:text-amber-700 font-medium"
                              onClick={() => resetCampaignMutation.mutate(campaign.id)}
                            >
                              <RefreshCw className="size-4 mr-2" />
                              Reset Status
                            </DropdownMenuItem>
                          )}
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
                Step {step} of 5
              </span>
            </SheetTitle>
          </SheetHeader>

          {/* Progress Bar */}
          <div className="w-full h-1 bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>

          <div className="flex-1 p-6 space-y-6">
            {/* Step 1: Sender */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Who is sending this email campaign?</h3>
                  <p className="text-xs text-muted-foreground">To preselect your default sender as the campaign sender, please verify it in your sender settings.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <Label>Email address</Label>
                      <Button variant="link" size="sm" className="h-auto p-0 text-emerald-600 font-semibold" onClick={() => setSendersSheetOpen(true)}>
                        <Plus className="size-3 mr-1" /> Add a new sender
                      </Button>
                    </div>
                    <Select
                      value={fromEmail ? `${fromName}|${fromEmail}` : ""}
                      onValueChange={(v) => {
                        const [n, e] = v.split("|");
                        setFromName(n);
                        setFromEmail(e);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a sender..." />
                      </SelectTrigger>
                      <SelectContent>
                        {senders?.map((s) => (
                          <SelectItem key={s.id} value={`${s.name}|${s.email}`}>
                            {s.name} &lt;{s.email}&gt;
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="camp-from-name">Name</Label>
                      <Input
                        id="camp-from-name"
                        placeholder="Who is sending the campaign?"
                        value={fromName}
                        onChange={(e) => setFromName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="camp-from-email">Email (Read Only)</Label>
                      <Input
                        id="camp-from-email"
                        value={fromEmail}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                  </div>

                  {/* Custom Reply-To Inbox & Receptionist List Section */}
                  <div className="pt-3 border-t space-y-4">
                    <div>
                      <Label className="font-semibold text-sm">Reply-To / Receptionist Inbox (Optional)</Label>
                      <p className="text-xs text-muted-foreground">Specify individual email addresses or choose a Receptionist Contact List to receive campaign replies in Gmail or Outlook.</p>
                    </div>

                    <div className="space-y-3">
                      {/* Select a Receptionist Contact List (Searchable Popover) */}
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Select Receptionist Contact List (Optional)</Label>
                        <Popover open={replyListPopoverOpen} onOpenChange={setReplyListPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={replyListPopoverOpen}
                              className="w-full justify-between text-left font-normal h-9 text-sm border-input"
                            >
                              <span className="truncate">
                                {!replyToListId
                                  ? "-- None (Use Manual Email Below) --"
                                  : lists.find((l: any) => l.id === replyToListId)
                                  ? `📋 ${lists.find((l: any) => l.id === replyToListId).name} (${lists.find((l: any) => l.id === replyToListId).contactCount ?? 0} contacts)`
                                  : `List #${replyToListId}`}
                              </span>
                              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search receptionist lists by name or ID..." className="text-xs" />
                              <CommandList className="max-h-[220px] overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
                                <CommandEmpty>No lists found matching search.</CommandEmpty>
                                <CommandGroup>
                                  {/* Option to clear / select none */}
                                  <CommandItem
                                    value="none select-none clear"
                                    onSelect={() => {
                                      setReplyToListId(null);
                                      setReplyListPopoverOpen(false);
                                    }}
                                    className="cursor-pointer text-xs flex items-center justify-between py-2 text-muted-foreground italic border-b mb-1"
                                  >
                                    <span>-- None (Use Manual Email Below) --</span>
                                    {!replyToListId && <Check className="size-3.5 text-primary" />}
                                  </CommandItem>

                                  {lists.map((list: any) => {
                                    const isSelected = replyToListId === list.id;
                                    const searchValue = `${list.name} id-${list.id}`;
                                    return (
                                      <CommandItem
                                        key={list.id}
                                        value={searchValue}
                                        onSelect={() => {
                                          setReplyToListId(list.id);
                                          setReplyListPopoverOpen(false);
                                        }}
                                        className="cursor-pointer text-xs flex items-center justify-between py-2"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold">📋 {list.name}</span>
                                          <span className="text-[10px] text-muted-foreground">#{list.id}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[11px] text-muted-foreground">({list.contactCount ?? 0} contacts)</span>
                                          {isSelected && <Check className="size-3.5 text-emerald-600 font-bold" />}
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Dynamic One-by-One Receptionist Email Adder */}
                      <div className="space-y-2 pt-2 border-t">
                        <Label className="text-xs font-semibold">Add Individual Receptionist Email Addresses</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Enter receptionist email address (e.g. support@company.com)..."
                            value={newReplyToEmail}
                            onChange={(e) => setNewReplyToEmail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddReplyToEmail();
                              }
                            }}
                            className="h-10 text-sm"
                          />
                          <Button
                            type="button"
                            onClick={handleAddReplyToEmail}
                            disabled={!newReplyToEmail.trim()}
                            className="h-10 text-xs font-bold gap-1 px-4 shrink-0"
                          >
                            <Plus className="size-4" /> Add Email
                          </Button>
                        </div>

                        {/* Added Receptionist Emails List / Badges */}
                        {replyToEmails.length === 0 ? (
                          <div className="p-3.5 border border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/40 text-center space-y-1">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No individual receptionist emails added yet.</p>
                            <p className="text-[11px] text-muted-foreground">Type an email address above and click Add Email to add receptionists one by one.</p>
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                              <span>Added Receptionist Inboxes ({replyToEmails.length})</span>
                              <button
                                type="button"
                                onClick={() => setReplyToEmails([])}
                                className="text-red-600 hover:underline cursor-pointer text-xs"
                              >
                                Clear all
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2 p-3 bg-muted/30 border rounded-lg">
                              {replyToEmails.map((email, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="py-1 px-3 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 text-xs font-semibold flex items-center gap-1.5"
                                >
                                  <span>📬 {email}</span>
                                  <X
                                    className="size-3.5 cursor-pointer hover:text-red-600 ml-1"
                                    onClick={() => setReplyToEmails(replyToEmails.filter((_, i) => i !== idx))}
                                  />
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Reply-To Display Name */}
                        <div className="space-y-1 pt-2">
                          <Label htmlFor="camp-reply-name" className="text-xs font-semibold">Reply-To Display Name (Optional)</Label>
                          <Input
                            id="camp-reply-name"
                            placeholder="e.g. Support Team"
                            value={replyToName}
                            onChange={(e) => setReplyToName(e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Recipients */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Recipients</h3>
                  <p className="text-xs text-muted-foreground">The people who receive your campaign</p>
                </div>

                {/* Recipient Tabs: Lists | Segments | Individual contacts */}
                <div className="flex items-center gap-1 border-b pb-2">
                  <button
                    type="button"
                    onClick={() => setRecipientTab("lists")}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer",
                      recipientTab === "lists"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    Lists
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientTab("segments")}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer",
                      recipientTab === "segments"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    Segments
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientTab("individual")}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1.5",
                      recipientTab === "individual"
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <span>Individual contacts</span>
                    {individualEmails.length > 0 && (
                      <span className="px-1.5 py-0.2 bg-emerald-500 text-white rounded-full text-[10px] font-extrabold">
                        {individualEmails.length}
                      </span>
                    )}
                  </button>
                </div>

                <div className="space-y-4">
                  {/* ── TAB 1: LISTS ── */}
                  {recipientTab === "lists" && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between mb-1">
                          <Label className="font-semibold text-sm">Send to</Label>
                          {selectedListIds.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                {selectedListIds.length} {selectedListIds.length === 1 ? "list" : "lists"} selected
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedListIds([])}
                                className="h-auto p-0 text-xs text-red-600 hover:text-red-700 hover:bg-transparent"
                              >
                                Clear selection
                              </Button>
                            </div>
                          )}
                        </div>

                        <Popover open={listPopoverOpen} onOpenChange={setListPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={listPopoverOpen}
                              className="w-full justify-between text-left font-normal h-10 border-input"
                            >
                              <span className="truncate">
                                {selectedListIds.length === 0
                                  ? "Select list(s), segment(s) or individual contacts"
                                  : selectedListIds.length === 1
                                  ? lists.find((l: any) => l.id === selectedListIds[0])?.name ?? "1 list selected"
                                  : `${selectedListIds.length} lists selected (${selectedListIds.map(id => lists.find((l: any) => l.id === id)?.name).filter(Boolean).join(", ")})`}
                              </span>
                              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search lists by name or ID..." />
                              <CommandList
                                className="max-h-[280px] overflow-y-auto pointer-events-auto touch-auto p-1"
                                onWheel={(e) => e.stopPropagation()}
                              >
                                <CommandEmpty>No lists found.</CommandEmpty>
                                <CommandGroup>
                                  <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50 text-xs">
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedListIds(lists.map((l: any) => l.id))}
                                        className="text-primary hover:underline font-medium cursor-pointer"
                                      >
                                        Select All ({lists.length})
                                      </button>
                                      {selectedListIds.length > 0 && (
                                        <>
                                          <span className="text-gray-300">|</span>
                                          <button
                                            type="button"
                                            onClick={() => setSelectedListIds([])}
                                            className="text-red-600 hover:underline font-medium cursor-pointer flex items-center gap-1"
                                          >
                                            Clear Selection
                                          </button>
                                        </>
                                      )}
                                    </div>
                                    <span className="text-muted-foreground">{selectedListIds.length} / {lists.length} selected</span>
                                  </div>
                                  {lists.map((list: any) => {
                                    const isSelected = selectedListIds.includes(list.id);
                                    const uniqueValue = `${list.name} id-${list.id}`;
                                    return (
                                      <CommandItem
                                        key={list.id}
                                        value={uniqueValue}
                                        onSelect={() => {
                                          if (isSelected) {
                                            setSelectedListIds(selectedListIds.filter((id) => id !== list.id));
                                          } else {
                                            setSelectedListIds([...selectedListIds, list.id]);
                                          }
                                        }}
                                        className="cursor-pointer flex items-center justify-between py-2"
                                      >
                                        <div className="flex items-center gap-2">
                                          <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => {
                                              if (isSelected) {
                                                setSelectedListIds(selectedListIds.filter((id) => id !== list.id));
                                              } else {
                                                setSelectedListIds([...selectedListIds, list.id]);
                                              }
                                            }}
                                          />
                                          <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{list.name}</span>
                                            <span className="text-[10px] text-muted-foreground">ID: #{list.id}</span>
                                          </div>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                          ({list.contactCount ?? 0} contacts)
                                        </span>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>

                        {/* Selected List Badges/Pills */}
                        {selectedListIds.length > 0 && (
                          <div className="space-y-1.5 pt-2">
                            <div className="flex flex-wrap gap-1.5">
                              {selectedListIds.map((id) => {
                                const listObj = lists.find((l: any) => l.id === id);
                                return (
                                  <Badge
                                    key={id}
                                    variant="secondary"
                                    className="flex items-center gap-1 text-xs py-1 px-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                                  >
                                    <span className="font-medium">{listObj?.name || `List #${id}`} <span className="opacity-70 text-[10px]">#{id}</span></span>
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">({listObj?.contactCount ?? 0})</span>
                                    <X
                                      className="size-3 cursor-pointer ml-0.5 hover:text-red-500"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedListIds(selectedListIds.filter((item) => item !== id));
                                      }}
                                    />
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── TAB 2: SEGMENTS ── */}
                  {recipientTab === "segments" && (
                    <div className="p-6 bg-muted/20 border rounded-lg text-center space-y-2">
                      <p className="text-sm font-semibold">Dynamic Contact Segments</p>
                      <p className="text-xs text-muted-foreground">Select saved dynamic filter segments or switch to Lists or Individual contacts tab.</p>
                    </div>
                  )}

                  {/* ── TAB 3: INDIVIDUAL CONTACTS ── */}
                  {recipientTab === "individual" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="font-semibold text-xs text-slate-600 dark:text-slate-400">
                          Add up to 10 email addresses from your contacts.
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Enter contact email address (e.g. john@example.com)..."
                            value={newIndividualEmail}
                            onChange={(e) => setNewIndividualEmail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddIndividualEmail();
                              }
                            }}
                            className="h-10 text-sm"
                          />
                          <Button
                            type="button"
                            onClick={handleAddIndividualEmail}
                            disabled={individualEmails.length >= 10 || !newIndividualEmail.trim()}
                            className="h-10 text-xs font-bold gap-1 px-4"
                          >
                            <Plus className="size-4" /> Add contact
                          </Button>
                        </div>
                      </div>

                      {/* Empty State Box */}
                      {individualEmails.length === 0 ? (
                        <div className="p-8 border border-dashed rounded-xl bg-slate-50 dark:bg-slate-900/40 text-center space-y-3">
                          <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-600 dark:text-slate-400">
                            <UserCheck className="size-5" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">There are no contacts in this list yet.</p>
                            <p className="text-xs text-muted-foreground">Add up to 10 email addresses from your contacts.</p>
                          </div>
                        </div>
                      ) : (
                        /* Individual Email Pills List */
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <span>Selected Individual Contacts ({individualEmails.length} / 10)</span>
                            <button
                              type="button"
                              onClick={() => setIndividualEmails([])}
                              className="text-red-600 hover:underline cursor-pointer"
                            >
                              Clear all
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 p-3 bg-muted/20 border rounded-lg">
                            {individualEmails.map((email, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="py-1 px-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center gap-1.5"
                              >
                                <span>{email}</span>
                                <X
                                  className="size-3.5 cursor-pointer hover:text-red-600 ml-1"
                                  onClick={() => setIndividualEmails(individualEmails.filter((_, i) => i !== idx))}
                                />
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Skip Unengaged Contacts */}
                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                      id="skip-unengaged-check"
                      checked={skipUnengaged}
                      onCheckedChange={(c) => setSkipUnengaged(Boolean(c))}
                    />
                    <Label htmlFor="skip-unengaged-check" className="font-normal text-sm cursor-pointer">
                      Don’t send to unengaged contacts
                    </Label>
                  </div>

                  {/* Advanced Options Toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-sm font-semibold text-emerald-600 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      {showAdvanced ? "Hide advanced options" : "Advanced options"}
                      <ChevronRight className={cn("size-3.5 transition-transform", showAdvanced && "rotate-90")} />
                    </button>

                    {showAdvanced && (
                      <div className="mt-3 p-4 bg-muted/20 border rounded-lg space-y-4">
                        {/* Exclusion Lists */}
                        <div className="space-y-1.5">
                          <Label className="font-semibold text-xs text-red-600 dark:text-red-400">
                            Don’t send to (Exclusion Lists)
                          </Label>
                          <Popover open={excludeListPopoverOpen} onOpenChange={setExcludeListPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between text-left font-normal h-9 text-xs"
                              >
                                <span className="truncate text-muted-foreground">
                                  {excludedListIds.length === 0
                                    ? "Select list(s), segment(s) or individual contacts to exclude"
                                    : `${excludedListIds.length} exclusion lists selected`}
                                </span>
                                <ChevronsUpDown className="ml-2 size-3.5 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search exclusion lists..." className="text-xs" />
                                <CommandList className="max-h-[220px] overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
                                  <CommandEmpty>No lists found.</CommandEmpty>
                                  <CommandGroup>
                                    {lists.map((list: any) => {
                                      const isExcluded = excludedListIds.includes(list.id);
                                      return (
                                        <CommandItem
                                          key={list.id}
                                          value={`${list.name} exclude-${list.id}`}
                                          onSelect={() => {
                                            if (isExcluded) setExcludedListIds(excludedListIds.filter(id => id !== list.id));
                                            else setExcludedListIds([...excludedListIds, list.id]);
                                          }}
                                          className="cursor-pointer text-xs flex items-center justify-between py-1.5"
                                        >
                                          <div className="flex items-center gap-2">
                                            <Checkbox checked={isExcluded} />
                                            <span>{list.name}</span>
                                          </div>
                                          <span className="text-[10px] text-muted-foreground">({list.contactCount ?? 0})</span>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>

                          {/* Excluded Badges */}
                          {excludedListIds.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {excludedListIds.map(id => (
                                <Badge key={id} variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[11px] gap-1">
                                  <span>Excluded: {lists.find(l => l.id === id)?.name || `#${id}`}</span>
                                  <X className="size-3 cursor-pointer hover:text-red-900" onClick={() => setExcludedListIds(excludedListIds.filter(i => i !== id))} />
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Filter Conditions */}
                        <div className="pt-1">
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => toast.info("Custom condition filter added!")}>
                            <Plus className="size-3" /> Filter recipients (Add a condition)
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recipient & Quota Summary Box */}
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      <span>
                        {recipientTab === "individual"
                          ? `${individualEmails.length} recipients`
                          : `${isLoadingAudienceStats ? "..." : (audienceStats?.subscribed ?? 0).toLocaleString()} recipients`}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {isLoadingQuota ? <Loader2 className="inline size-3.5 animate-spin mr-1" /> : (quotaData?.remaining ?? 0).toLocaleString()} remaining emails
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Send to as many recipients as you wish, within your plan limits.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Subject */}
            {step === 3 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">Subject</h3>
                      <p className="text-xs text-muted-foreground">Add a subject line for this campaign.</p>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="camp-subject">Subject line*</Label>
                        <Input
                          id="camp-subject"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="camp-preview">Preview text</Label>
                        <Input
                          id="camp-preview"
                          value={previewText}
                          onChange={(e) => setPreviewText(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border/60">
                    <div>
                      <h3 className="text-lg font-semibold">Internal Campaign Name</h3>
                      <p className="text-xs text-muted-foreground">Name your campaign for internal reference.</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="camp-name">Campaign Name*</Label>
                      <Input
                        id="camp-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-muted/10 border border-border rounded-xl p-4 flex flex-col justify-center">
                  <div className="bg-white dark:bg-gray-900 border border-border shadow-sm rounded-lg overflow-hidden max-w-sm w-full mx-auto">
                    <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-border flex justify-between items-center text-xs text-muted-foreground">
                      <span>9:47</span>
                      <span className="font-semibold">Inbox</span>
                      <span>100%</span>
                    </div>
                    <div className="p-4 flex gap-3 border-b border-border">
                      <div className="size-10 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                        {fromName ? fromName.charAt(0).toUpperCase() : "S"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <span className="font-bold text-sm truncate">{fromName || "Sender"}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">17:45</span>
                        </div>
                        <div className="font-semibold text-sm truncate">{subject || "Message subject..."}</div>
                        <div className="text-sm text-muted-foreground truncate">{previewText || "Your preview text"}</div>
                      </div>
                    </div>

                  </div>
                  <p className="text-[10px] text-center text-muted-foreground mt-4">Actual email preview may vary depending on the email client.</p>
                </div>
              </div>
            )}

            {/* Step 4: Design */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Design</h3>
                    <p className="text-xs text-muted-foreground">Create and customize your email content.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedTemplateHtml && (
                      <Button
                        size="sm"
                        onClick={handleOpenEditorForCurrent}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                      >
                        <Edit className="size-4 mr-1.5" />
                        Edit Design
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPickerOpen(true)}
                    >
                      {selectedTemplateHtml ? (
                        <>
                          <RefreshCw className="size-4 mr-2" />
                          Change Template
                        </>
                      ) : (
                        <>
                          <Plus className="size-4 mr-2" />
                          Choose Template
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="mt-4">
                  {selectedTemplateId ? (
                    (() => {
                      const t = templates?.find((tpl: any) => tpl.id === selectedTemplateId);
                      if (!t) return null;
                      return (
                        <Card className="p-4 border-emerald-600 bg-emerald-50/10 shadow-sm flex flex-col justify-between">
                          <div className="space-y-1">
                            <div className="font-semibold text-sm line-clamp-1">{t.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2">{t.subject || "No subject"}</div>
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <span className="text-[10px] text-muted-foreground">Updated {format(new Date(t.createdAt), "MMM d")}</span>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleOpenEditorForCurrent}
                                className="h-7 text-xs bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                              >
                                <Edit className="size-3 mr-1" />
                                Edit Content
                              </Button>
                              <span className="size-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                                <Check className="size-3" />
                              </span>
                            </div>
                          </div>
                        </Card>
                      );
                    })()
                  ) : selectedTemplateHtml ? (
                    <Card className="p-4 border-emerald-600 bg-emerald-50/10 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="font-semibold text-sm">Custom Campaign Design</div>
                        <div className="text-xs text-muted-foreground">Custom HTML design attached to campaign</div>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleOpenEditorForCurrent}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-8"
                      >
                        <Edit className="size-3.5 mr-1.5" />
                        Edit Design
                      </Button>
                    </Card>
                  ) : (
                    <div className="text-center py-8 px-4 border rounded-lg border-dashed">
                      <FileText className="size-8 mx-auto text-muted-foreground mb-3" />
                      <h4 className="font-medium">No template selected</h4>
                      <p className="text-xs text-muted-foreground mt-1 mb-4">You need an email design to send this campaign.</p>
                      <Button onClick={() => setPickerOpen(true)}>Choose a Template</Button>
                    </div>
                  )}
                </div>

                {selectedTemplateHtml && (
                  <div className="border border-border rounded-lg overflow-hidden mt-2 bg-muted/10">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Eye className="size-3.5 text-emerald-600" />
                        Template Preview
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleOpenEditorForCurrent}
                        className="h-6 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold px-2"
                      >
                        <Edit className="size-3 mr-1" />
                        Edit Content
                      </Button>
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

            {/* Step 5: Review & Send */}
            {step === 5 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Review & Send</h3>
                  <p className="text-xs text-muted-foreground">Double check everything before sending.</p>
                </div>

                {/* Send Test Email Card */}
                <div className="bg-amber-50/70 border border-amber-200/90 dark:bg-amber-950/20 dark:border-amber-800/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="size-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
                      <FlaskConical className="size-5" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          Send a Test Email First
                        </h4>
                        <Badge variant="outline" className="bg-amber-100/80 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700 text-[10px] font-semibold uppercase tracking-wide">
                          Recommended
                        </Badge>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                        Send a test email to yourself or a colleague to check design formatting, subject line, reply-to header, and links before sending to your full audience.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <div className="relative flex-1">
                      <Input
                        type="email"
                        placeholder="Enter recipient test email (e.g. name@company.com)"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className="bg-white dark:bg-slate-900 border-amber-300/80 dark:border-amber-800/80 text-xs focus-visible:ring-amber-500 pr-8"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSendTestEmail();
                          }
                        }}
                      />
                      {testEmail && (
                        <button
                          type="button"
                          onClick={() => setTestEmail("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <Button
                      onClick={handleSendTestEmail}
                      disabled={sendTestEmailMutation.isPending || !testEmail.trim()}
                      className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm font-medium text-xs h-9 px-4 shrink-0"
                    >
                      {sendTestEmailMutation.isPending ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin mr-1.5" />
                          Sending Test...
                        </>
                      ) : (
                        <>
                          <Send className="size-3.5 mr-1.5" />
                          Send Test Email
                        </>
                      )}
                    </Button>
                  </div>

                  {lastTestSentTo && (
                    <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/40 border border-emerald-300/70 dark:border-emerald-800/50 rounded-lg px-3 py-1.5">
                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                      <span>
                        Test email sent to <strong className="font-semibold">{lastTestSentTo.email}</strong> at {lastTestSentTo.time}. Check your inbox!
                      </span>
                    </div>
                  )}
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
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Reply-To (Receptionist Inbox)</span>
                      {replyToEmails.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {replyToEmails.map((email) => (
                            <span
                              key={email}
                              className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-semibold px-2 py-0.5 rounded-full"
                            >
                              📬 {email}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          ⚠️ Not set — replies will go to the From address
                        </span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Audience</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {recipientTab === "individual"
                          ? `${individualEmails.length} individual contact(s): ${individualEmails.join(", ")}`
                          : selectedListIds.length === 0
                            ? "No list selected"
                            : selectedListIds.map((id) => lists.find((l: any) => l.id === id)?.name || `List #${id}`).join(", ")}
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

                {/* Pre-send AWS cost estimate */}
                {!isLoadingAudienceStats && (audienceStats?.subscribed ?? 0) > 0 && (() => {
                  const recipientCount = audienceStats?.subscribed ?? 0;
                  const costUsd = recipientCount * (0.10 / 1000);
                  const lkrRate = campaignExchangeRate?.usd_to_lkr ?? 300;
                  const costLkr = costUsd * lkrRate;
                  return (
                    <div className="bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/40 rounded-xl p-4 flex items-start gap-3">
                      <DollarSign className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Estimated AWS SES Cost</p>
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          Sending to {recipientCount.toLocaleString()} emails will cost approximately{" "}
                          <span className="font-extrabold text-sm">${costUsd.toFixed(4)}</span>
                          {" / "}
                          <span className="font-extrabold text-sm">LKR {costLkr.toFixed(2)}</span>
                        </p>
                        <p className="text-[10px] text-blue-500 dark:text-blue-500 mt-0.5">
                          Billed by AWS SES at $0.10 per 1,000 emails · 1 USD = {lkrRate.toFixed(2)} LKR
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Plan Limit Exceeded Alert Banner */}
                {!isLoadingAudienceStats && !isLoadingQuota && quotaData?.remaining !== undefined && (audienceStats?.subscribed ?? 0) > quotaData.remaining && (
                  <div className="bg-red-50 border border-red-300 dark:bg-red-950/40 dark:border-red-800/60 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                    <AlertTriangle className="size-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-red-900 dark:text-red-200">
                          Plan Sending Limit Exceeded
                        </p>
                        <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider">
                          Limit Exceeded
                        </Badge>
                      </div>
                      <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                        Your campaign target has <strong className="font-extrabold text-red-950 dark:text-red-100">{(audienceStats?.subscribed ?? 0).toLocaleString()}</strong> recipients, but you only have <strong className="font-extrabold text-red-950 dark:text-red-100">{(quotaData.remaining).toLocaleString()}</strong> remaining emails in your plan limit.
                      </p>
                      <p className="text-[11px] text-red-700 dark:text-red-400 font-medium">
                        Exceeds limit by <strong className="font-bold text-red-900 dark:text-red-200">{((audienceStats?.subscribed ?? 0) - quotaData.remaining).toLocaleString()}</strong> contacts.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStep(2)}
                          className="h-7 text-xs bg-white text-red-700 border-red-300 hover:bg-red-50 hover:text-red-800"
                        >
                          Adjust Recipients (Step 2)
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setPlanExceededModalOpen(true)}
                          className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                        >
                          View Limit Warning Popup
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer Navigation */}
          <div className="p-6 border-t border-border bg-muted/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)} className="shadow-sm">
                  <ArrowLeft className="size-4 mr-2" />
                  Back
                </Button>
              ) : null}

              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={createCampaignMutation.isPending || updateCampaignMutation.isPending}
                className="shadow-sm text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700"
              >
                <FileText className="size-4 mr-2 text-slate-500" />
                Save as Draft
              </Button>
            </div>

            {step < 5 ? (
              <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold">
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

      {/* Senders Sheet */}
      <Sheet open={sendersSheetOpen} onOpenChange={setSendersSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl font-bold">Manage Senders</SheetTitle>
          </SheetHeader>
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Add New Sender</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Sender Name</Label>
                  <Input value={newSenderName} onChange={e => setNewSenderName(e.target.value)} placeholder="e.g. John Doe" />
                </div>
                <div className="space-y-1">
                  <Label>Sender Email</Label>
                  <Input value={newSenderEmail} onChange={e => setNewSenderEmail(e.target.value)} placeholder="e.g. john@example.com" />
                </div>
                <Button 
                  disabled={!newSenderName || !newSenderEmail || createSenderMutation.isPending}
                  onClick={() => createSenderMutation.mutate({ name: newSenderName, email: newSenderEmail })}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {createSenderMutation.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                  Add Sender
                </Button>
              </div>
            </div>

            <div className="space-y-3 border-t pt-6">
              <h3 className="text-sm font-semibold">Previously Added Senders</h3>
              {senders?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No senders found.</p>
              ) : (
                <div className="space-y-2">
                  {senders?.map((s) => (
                    <div key={s.id} className="flex justify-between items-center p-3 border rounded-md">
                      <div>
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => api.senders.delete(s.id).then(() => { queryClient.invalidateQueries({ queryKey: ["senders-for-campaign"] }); toast.success("Sender deleted"); }).catch(() => toast.error("Failed to delete sender"))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              This will permanently delete the campaign and cannot be undone.
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
      <TemplatePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectOption={handleSelectOption}
        savedTemplates={templates || []}
        onSelectSaved={handleSelectTemplate}
      />

      {editorMode === "simple" && (
        <SimpleEditor
          initialName={
            selectedTemplateId
              ? templates?.find((tpl: any) => tpl.id === selectedTemplateId)?.name || name || "Campaign Email Content"
              : name || "Campaign Email Content"
          }
          initialHtml={selectedTemplateHtml}
          onSave={handleSimpleEditorSave}
          onCancel={() => {
            setEditorMode("none");
            setWizardOpen(true);
          }}
        />
      )}
      {/* Plan Limit Exceeded Modal */}
      <Dialog open={planExceededModalOpen} onOpenChange={setPlanExceededModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-3 text-center sm:text-left">
            <div className="size-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto sm:mx-0 border border-red-200 dark:border-red-900">
              <AlertTriangle className="size-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-red-900 dark:text-red-200">
                Plan Limit Exceeded
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Send to as many recipients as you wish, within your plan limits. You cannot send this campaign because the selected target audience exceeds your remaining plan limit.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <span className="text-muted-foreground">Target Recipients:</span>
              <span className="font-bold text-foreground text-sm">{(audienceStats?.subscribed ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <span className="text-muted-foreground">Remaining Plan Emails:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{(quotaData?.remaining ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-semibold">
              <span>Excess Recipients:</span>
              <span className="font-bold text-sm">
                {Math.max(0, (audienceStats?.subscribed ?? 0) - (quotaData?.remaining ?? 0)).toLocaleString()}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Please adjust your audience selection in Step 2 to fit within your remaining <strong>{(quotaData?.remaining ?? 0).toLocaleString()}</strong> emails, or upgrade your plan limit.
          </p>

          <DialogFooter className="gap-2 sm:gap-0 flex-col-reverse sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setPlanExceededModalOpen(false);
                setStep(2);
              }}
            >
              Adjust Recipients (Step 2)
            </Button>
            <Button
              onClick={() => {
                setPlanExceededModalOpen(false);
                navigate("/settings");
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Upgrade Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
