import { useState, useEffect } from "react";
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

type Props = {
  open: boolean;
  onClose: () => void;
  contact: any | null;
  onSave: (id: number, data: any) => Promise<void>;
};

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  tags: string;
  status: string;
  designation: string;
  industry: string;
  website: string;
  country: string;
  city: string;
  address: string;
  linkedin: string;
  notes: string;
  ownerId: string;
};

const INITIAL_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
  tags: "",
  status: "subscribed",
  designation: "",
  industry: "",
  website: "",
  country: "",
  city: "",
  address: "",
  linkedin: "",
  notes: "",
  ownerId: "",
};

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

export default function EditContactDrawer({ open, onClose, contact, onSave }: Props) {
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  useEffect(() => {
    if (contact) {
      setForm({
        firstName: contact.firstName ?? "",
        lastName: contact.lastName ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        company: contact.company ?? "",
        tags: contact.tags ?? "",
        status: contact.status ?? "subscribed",
        designation: contact.designation ?? "",
        industry: contact.industry ?? "",
        website: contact.website ?? "",
        country: contact.country ?? "",
        city: contact.city ?? "",
        address: contact.address ?? "",
        linkedin: contact.linkedin ?? "",
        notes: contact.notes ?? "",
        ownerId: contact.ownerId ?? "",
      });
    }
  }, [contact]);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function reset() {
    setForm(INITIAL_FORM);
    setShowAdvanced(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!contact?.id) {
      toast.error("No contact selected");
      return;
    }
    setLoading(true);
    try {
      await onSave(contact.id, {
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        tags: form.tags.trim() || null,
        status: form.status,
        designation: form.designation.trim() || null,
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
        country: form.country.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        linkedin: form.linkedin.trim() || null,
        notes: form.notes.trim() || null,
        ownerId: form.ownerId.trim() || null,
      });
      toast.success("Contact updated successfully");
      reset();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update contact";
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
                <h2 className="text-base font-semibold">Edit Contact</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Update contact details</p>
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
              id="edit-contact-form"
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
            >
              <div className="space-y-1.5">
                <FieldLabel>FIRSTNAME</FieldLabel>
                <Input
                  placeholder="Enter first name"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>LASTNAME</FieldLabel>
                <Input
                  placeholder="Enter last name"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel required>EMAIL</FieldLabel>
                <Input
                  type="email"
                  placeholder="Enter email address"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>PHONE</FieldLabel>
                <Input
                  type="tel"
                  placeholder="Enter phone number"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>COMPANY</FieldLabel>
                <Input
                  placeholder="Enter company name"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel>TAGS</FieldLabel>
                <Input
                  placeholder="Enter tags (comma separated)"
                  value={form.tags}
                  onChange={(e) => set("tags", e.target.value)}
                  className="h-9 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Separate multiple tags with commas</p>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>STATUS</FieldLabel>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subscribed">Subscribed</SelectItem>
                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                    <SelectItem value="bounced">Bounced</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-2 text-xs text-primary font-medium cursor-pointer hover:underline"
              >
                {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {showAdvanced ? "Hide" : "Show"} advanced
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
                    <div className="space-y-1.5">
                      <FieldLabel>DESIGNATION</FieldLabel>
                      <Input
                        placeholder="Enter designation"
                        value={form.designation}
                        onChange={(e) => set("designation", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>INDUSTRY</FieldLabel>
                      <Input
                        placeholder="Enter industry"
                        value={form.industry}
                        onChange={(e) => set("industry", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>WEBSITE</FieldLabel>
                      <Input
                        type="url"
                        placeholder="https://example.com"
                        value={form.website}
                        onChange={(e) => set("website", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>COUNTRY</FieldLabel>
                      <Input
                        placeholder="Enter country"
                        value={form.country}
                        onChange={(e) => set("country", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>CITY</FieldLabel>
                      <Input
                        placeholder="Enter city"
                        value={form.city}
                        onChange={(e) => set("city", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>ADDRESS</FieldLabel>
                      <Input
                        placeholder="Enter address"
                        value={form.address}
                        onChange={(e) => set("address", e.target.value)}
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

                    <div className="space-y-1.5">
                      <FieldLabel>NOTES</FieldLabel>
                      <Input
                        placeholder="Enter notes"
                        value={form.notes}
                        onChange={(e) => set("notes", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel>OWNER_ID</FieldLabel>
                      <Input
                        placeholder="Enter owner ID"
                        value={form.ownerId}
                        onChange={(e) => set("ownerId", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
                form="edit-contact-form"
                disabled={loading}
                className="cursor-pointer min-w-[100px]"
              >
                {loading ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
