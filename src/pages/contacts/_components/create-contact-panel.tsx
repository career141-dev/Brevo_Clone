import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { api } from "@/lib/api.ts";

type Props = { open: boolean; onClose: () => void };

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  sms: string;
  whatsapp: string;
  landlineNumber: string;
  extId: string;
  contactOwner: string;
  fullName: string;
  lists: string;
  designation: string;
  associatedCompany: string;
  company: string;
  location: string;
  appliedJobTitle: string;
  jobId: string;
  dateApplied: string;
  doubleOptIn: string;
  optIn: string;
  country: string;
  contactTimezone: string;
  jobTitle: string;
  linkedin: string;
  status: string;
};

const TIMEZONES = [
  "UTC", "Asia/Colombo", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles",
  "Australia/Sydney", "Pacific/Auckland",
];

const PHONE_PREFIX = "+94";

function PhoneInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex gap-1.5">
      <div className="flex items-center px-2.5 h-9 border border-border rounded-md bg-muted text-sm text-muted-foreground shrink-0 select-none">
        {PHONE_PREFIX}
      </div>
      <Input
        type="tel"
        placeholder={placeholder ?? "7XX XXX XXX"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-sm flex-1"
      />
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function CreateContactPanel({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    email: "",
    sms: "",
    whatsapp: "",
    landlineNumber: "",
    extId: "",
    contactOwner: "Uzmaan Azeem",
    fullName: "",
    lists: "",
    designation: "",
    associatedCompany: "",
    company: "",
    location: "",
    appliedJobTitle: "",
    jobId: "",
    dateApplied: "",
    doubleOptIn: "none",
    optIn: "none",
    country: "",
    contactTimezone: "none",
    jobTitle: "",
    linkedin: "",
    status: "active",
  });

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function reset() {
    setForm({
      firstName: "", lastName: "", email: "", sms: "", whatsapp: "",
      landlineNumber: "", extId: "", contactOwner: "Uzmaan Azeem",
      fullName: "", lists: "", designation: "", associatedCompany: "",
      company: "", location: "", appliedJobTitle: "", jobId: "",
      dateApplied: "", doubleOptIn: "none", optIn: "none",
      country: "", contactTimezone: "none", jobTitle: "", linkedin: "",
      status: "active",
    });
    setShowAdvanced(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim() && !form.whatsapp.trim() && !form.sms.trim()) {
      toast.error("At least one of Email, WhatsApp or SMS is required");
      return;
    }
    if (!form.email.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const name =
        [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ") ||
        form.fullName.trim() ||
        form.email.trim();

      const listArr = form.lists
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);

      const smsFull = form.sms.trim() ? `${PHONE_PREFIX}${form.sms.trim()}` : undefined;
      const emailVal = form.email.trim();

      await api.contacts.create({
        name,
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        fullName: form.fullName.trim() || null,
        email: emailVal,
        sms: smsFull ?? null,
        whatsapp: form.whatsapp.trim() ? `${PHONE_PREFIX}${form.whatsapp.trim()}` : null,
        company: form.company.trim() || null,
        jobTitle: form.jobTitle.trim() || null,
        designation: form.designation.trim() || null,
        linkedin: form.linkedin.trim() || null,
        location: form.location.trim() || null,
        country: form.country.trim() || null,
        lists: listArr.length ? listArr : null,
        status: form.status,
        source: "manual",
      });
      toast.success("Contact created successfully");
      reset();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create contact";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={handleClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[440px] bg-background border-l border-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-accent/30">
              <div>
                <h2 className="text-base font-semibold">Create a contact</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Add a new contact to your list</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 cursor-pointer"
                onClick={handleClose}
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Form */}
            <form
              id="create-contact-form"
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
            >
              <SectionDivider label="Basic Info" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <FieldLabel>FIRSTNAME</FieldLabel>
                  <Input
                    placeholder="Enter the FIRSTNAME"
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>LASTNAME</FieldLabel>
                  <Input
                    placeholder="Enter the LASTNAME"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <FieldLabel required>EMAIL</FieldLabel>
                <Input
                  type="email"
                  placeholder="Enter the email address"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>FULL_NAME</FieldLabel>
                <Input
                  placeholder="Some text here"
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <SectionDivider label="Contact Numbers" />

              <div className="space-y-1.5">
                <FieldLabel>SMS</FieldLabel>
                <PhoneInput
                  value={form.sms}
                  onChange={(v) => set("sms", v)}
                  placeholder="7XX XXX XXX"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>WHATSAPP</FieldLabel>
                <PhoneInput
                  value={form.whatsapp}
                  onChange={(v) => set("whatsapp", v)}
                  placeholder="7XX XXX XXX"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>LANDLINE_NUMBER</FieldLabel>
                <PhoneInput
                  value={form.landlineNumber}
                  onChange={(v) => set("landlineNumber", v)}
                  placeholder="11X XXX XXXX"
                />
              </div>

              <SectionDivider label="CRM" />

              <div className="space-y-1.5">
                <FieldLabel>CONTACT OWNER</FieldLabel>
                <Select
                  value={form.contactOwner}
                  onValueChange={(v) => set("contactOwner", v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Uzmaan Azeem">Uzmaan Azeem</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>EXT_ID</FieldLabel>
                <Input
                  placeholder="Some text here"
                  value={form.extId}
                  onChange={(e) => set("extId", e.target.value)}
                  maxLength={254}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>LISTS</FieldLabel>
                <Input
                  placeholder="Select lists (comma separated)"
                  value={form.lists}
                  onChange={(e) => set("lists", e.target.value)}
                  className="h-9 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Separate multiple lists with commas</p>
              </div>

              <SectionDivider label="Company & Role" />

              <div className="space-y-1.5">
                <FieldLabel>DESIGNATION</FieldLabel>
                <Input
                  placeholder="Some text here"
                  value={form.designation}
                  onChange={(e) => set("designation", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>JOB_TITLE</FieldLabel>
                <Input
                  placeholder="Some text here"
                  value={form.jobTitle}
                  onChange={(e) => set("jobTitle", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>ASSOCIATED TO COMPANIES</FieldLabel>
                <Select
                  value={form.associatedCompany || "none"}
                  onValueChange={(v) => set("associatedCompany", v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a company</SelectItem>
                    <SelectItem value="Career141">Career141</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>COMPANY</FieldLabel>
                <Input
                  placeholder="Some text here"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>LINKEDIN</FieldLabel>
                <Input
                  type="url"
                  placeholder="https://linkedin.com/in/..."
                  value={form.linkedin}
                  onChange={(e) => set("linkedin", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {/* Advanced toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-2 text-xs text-primary font-medium cursor-pointer hover:underline"
              >
                {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {showAdvanced ? "Hide" : "Show"} advanced fields
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-4"
                  >
                    <SectionDivider label="Location & Time" />

                    <div className="space-y-1.5">
                      <FieldLabel>LOCATION</FieldLabel>
                      <Input
                        placeholder="Some text here"
                        value={form.location}
                        onChange={(e) => set("location", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>COUNTRY</FieldLabel>
                      <Input
                        placeholder="Some text here"
                        value={form.country}
                        onChange={(e) => set("country", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>CONTACT_TIMEZONE</FieldLabel>
                      <Select
                        value={form.contactTimezone}
                        onValueChange={(v) => set("contactTimezone", v)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select timezone</SelectItem>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <SectionDivider label="Job Application" />

                    <div className="space-y-1.5">
                      <FieldLabel>APPLIED_JOB_TITLE</FieldLabel>
                      <Input
                        placeholder="Some text here"
                        value={form.appliedJobTitle}
                        onChange={(e) => set("appliedJobTitle", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>JOB_ID</FieldLabel>
                      <Input
                        placeholder="Some text here"
                        value={form.jobId}
                        onChange={(e) => set("jobId", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>DATE_APPLIED</FieldLabel>
                      <Input
                        type="date"
                        value={form.dateApplied}
                        onChange={(e) => set("dateApplied", e.target.value)}
                        className="h-9 text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">Format: DD/MM/YYYY</p>
                    </div>

                    <SectionDivider label="Consent" />

                    <div className="space-y-1.5">
                      <FieldLabel>DOUBLE_OPT-IN</FieldLabel>
                      <Select
                        value={form.doubleOptIn}
                        onValueChange={(v) => set("doubleOptIn", v)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="declined">Declined</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>OPT_IN</FieldLabel>
                      <Select
                        value={form.optIn}
                        onValueChange={(v) => set("optIn", v)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <SectionDivider label="Status" />

              <div className="space-y-1.5">
                <FieldLabel>STATUS</FieldLabel>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                    <SelectItem value="bounced">Bounced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </form>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 bg-background">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                type="submit"
                form="create-contact-form"
                disabled={loading}
                className="cursor-pointer min-w-[100px]"
              >
                {loading ? "Creating..." : "Create contact"}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label
      className={cn(
        "text-[11px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1"
      )}
    >
      {children}
      {required && <span className="text-destructive">*</span>}
    </label>
  );
}
