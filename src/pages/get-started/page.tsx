import { useNavigate } from "react-router-dom";
import {
  Rocket,
  Users,
  FolderOpen,
  List,
  Mail,
  Send,
  BarChart2,
  ChevronRight,
  ArrowRight,
  Zap,
  UserPlus,
  FileText,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

const STEPS = [
  {
    number: "01",
    icon: FolderOpen,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-900/40",
    border: "border-violet-200 dark:border-violet-800/50",
    title: "Create a Folder",
    description:
      "Folders organise your contact lists. Head to CRM → Lists and create a folder first (e.g. Marketing, Newsletter).",
    link: "/crm/lists",
    linkLabel: "Go to Lists →",
  },
  {
    number: "02",
    icon: List,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/40",
    border: "border-blue-200 dark:border-blue-800/50",
    title: "Create a List inside the Folder",
    description:
      "Inside your folder, create a list (e.g. June Newsletter). This is what your campaign will send to.",
    link: "/crm/lists",
    linkLabel: "Go to Lists →",
  },
  {
    number: "03",
    icon: UserPlus,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-100 dark:bg-teal-900/40",
    border: "border-teal-200 dark:border-teal-800/50",
    title: "Add Contacts to the List",
    description:
      "Go to Contacts to add contacts manually or import them. When creating a contact, assign them to your list. Or use the Add Contact action on any list to assign existing contacts.",
    link: "/contacts",
    linkLabel: "Go to Contacts",
  },
  {
    number: "04",
    icon: FileText,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    border: "border-amber-200 dark:border-amber-800/50",
    title: "Create an Email Template",
    description:
      "Go to CRM → Email Templates and create the email content for your campaign. You can write HTML or use an existing design.",
    link: "/crm/templates",
    linkLabel: "Go to Templates",
  },
  {
    number: "05",
    icon: Mail,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    border: "border-emerald-200 dark:border-emerald-800/50",
    title: "Create a Campaign",
    description:
      "Go to Campaigns → Create Campaign. The wizard will walk you through: Sender → Recipients (pick your list) → Subject → Design (pick your template) → Review & Send.",
    link: "/campaigns",
    linkLabel: "Go to Campaigns",
  },
  {
    number: "06",
    icon: Send,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-900/40",
    border: "border-rose-200 dark:border-rose-800/50",
    title: "Send & Track",
    description:
      "Hit Send Now in the final step of the wizard. Your emails go out immediately. Track opens, clicks and delivery in Analytics.",
    link: "/analytics",
    linkLabel: "Go to Analytics",
  },
];

const QUICK_LINKS = [
  { icon: FolderOpen, label: "Lists & Folders", path: "/crm/lists", color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/40" },
  { icon: Users, label: "Contacts", path: "/contacts", color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/40" },
  { icon: FileText, label: "Email Templates", path: "/crm/templates", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40" },
  { icon: Mail, label: "Campaigns", path: "/campaigns", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40" },
  { icon: Zap, label: "Automations", path: "/automations", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40" },
  { icon: BarChart2, label: "Analytics", path: "/analytics", color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40" },
];

export default function GetStartedPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">

        {/* ── Hero ── */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="size-3.5" />
            Get Started
          </div>

          <div className="size-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-xl mx-auto">
            <Rocket className="size-8 text-white" />
          </div>

          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              How this app works
            </h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
              Follow these steps in order to send your first email campaign. Each step links you to the right place.
            </p>
          </div>

          {/* Flow summary pills */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            {["Folder", "List", "Contacts", "Template", "Campaign", "Send!"].map((s, i, arr) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="px-3 py-1 rounded-full bg-muted text-xs font-semibold text-muted-foreground border border-border">
                  {s}
                </span>
                {i < arr.length - 1 && (
                  <ChevronRight className="size-3.5 text-muted-foreground/40" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step-by-step guide ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            Step-by-Step
          </h2>

          <div className="space-y-3">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={idx}
                  className={`relative rounded-xl border ${step.border} bg-card overflow-hidden`}
                >
                  <div className="flex items-start gap-4 p-5">
                    {/* Step number + icon */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <div className={`size-10 rounded-xl ${step.bg} flex items-center justify-center`}>
                        <Icon className={`size-5 ${step.color}`} />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground/50 tabular-nums">
                        {step.number}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        {step.description}
                      </p>
                      <button
                        onClick={() => navigate(step.link)}
                        className={`inline-flex items-center gap-1 mt-2 text-xs font-semibold ${step.color} hover:underline`}
                      >
                        {step.linkLabel}
                        <ArrowRight className="size-3" />
                      </button>
                    </div>

                    {/* Done indicator placeholder */}
                    <CheckCircle2 className="size-4 text-muted-foreground/20 shrink-0 mt-1" />
                  </div>

                  {/* Connector line between steps (not on last) */}
                  {idx < STEPS.length - 1 && (
                    <div className="absolute left-[38px] -bottom-3 w-px h-3 bg-border z-10" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Quick Navigation ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            Quick Navigation
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className={`flex items-center gap-3 p-4 rounded-xl border ${link.bg} hover:shadow-sm transition-all text-left group`}
                >
                  <Icon className={`size-4 ${link.color} shrink-0`} />
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {link.label}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground/30 ml-auto group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 p-6 text-center space-y-4">
          <div className="size-10 rounded-xl bg-emerald-500 flex items-center justify-center mx-auto">
            <Send className="size-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-emerald-900 dark:text-emerald-100">Ready to send?</p>
            <p className="text-sm text-emerald-700/80 dark:text-emerald-300/70 mt-1">
              Start from the Lists page to create your first folder and list.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button
              onClick={() => navigate("/crm/lists")}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2"
            >
              <List className="size-4" />
              Start with Lists
            </Button>
            <Button variant="outline" onClick={() => navigate("/campaigns")}>
              Go to Campaigns
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
