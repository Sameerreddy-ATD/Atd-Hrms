import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { employeesApi } from "@/services/api";
import type { EmergencyContact } from "@/types/domain";
import { Loader2, ShieldAlert } from "lucide-react";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const emptyForm = {
  contactName: "",
  relationship: "",
  phone: "",
  alternatePhone: "",
  address: "",
  bloodGroup: "",
  medicalNotes: "",
};

export function EmergencyContactSection({
  employeeId,
  value,
  canEdit,
  onSaved,
  className,
}: {
  employeeId: string;
  value?: EmergencyContact | null;
  canEdit: boolean;
  onSaved?: (next: EmergencyContact) => void;
  className?: string;
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      contactName: value?.contactName ?? "",
      relationship: value?.relationship ?? "",
      phone: value?.phone ?? "",
      alternatePhone: value?.alternatePhone ?? "",
      address: value?.address ?? "",
      bloodGroup: value?.bloodGroup ?? "",
      medicalNotes: value?.medicalNotes ?? "",
    });
  }, [value]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    if (!form.contactName.trim() || !form.relationship.trim() || !form.phone.trim()) {
      toast.error("Contact name, relationship, and phone are required");
      return;
    }
    setSaving(true);
    try {
      const saved = await employeesApi.upsertEmergencyContact(employeeId, {
        contactName: form.contactName.trim(),
        relationship: form.relationship.trim(),
        phone: form.phone.trim(),
        alternatePhone: form.alternatePhone.trim() || null,
        address: form.address.trim() || null,
        bloodGroup: form.bloodGroup || null,
        medicalNotes: form.medicalNotes.trim() || null,
      });
      if (saved) onSaved?.(saved);
      toast.success("Emergency contact saved");
    } catch (error) {
      toast.error((error as Error).message || "Could not save emergency contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="emergency-contact" className={className}>
      <div className="mb-4 border-b pb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="size-4 text-primary" />
          Emergency contact
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {canEdit
            ? "Used for workplace emergencies and the employee ID card."
            : "View-only. Ask HR or Developer Admin to update these details."}
        </p>
      </div>
      <form onSubmit={(event) => void save(event)} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`ec-name-${employeeId}`}>Contact name</Label>
          <Input
            id={`ec-name-${employeeId}`}
            value={form.contactName}
            disabled={!canEdit}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactName: event.target.value }))
            }
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ec-rel-${employeeId}`}>Relationship</Label>
          <Input
            id={`ec-rel-${employeeId}`}
            value={form.relationship}
            disabled={!canEdit}
            onChange={(event) =>
              setForm((current) => ({ ...current, relationship: event.target.value }))
            }
            placeholder="Spouse, parent, sibling…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ec-phone-${employeeId}`}>Phone</Label>
          <Input
            id={`ec-phone-${employeeId}`}
            value={form.phone}
            disabled={!canEdit}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            inputMode="tel"
            autoComplete="tel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ec-alt-${employeeId}`}>Alternate phone</Label>
          <Input
            id={`ec-alt-${employeeId}`}
            value={form.alternatePhone}
            disabled={!canEdit}
            onChange={(event) =>
              setForm((current) => ({ ...current, alternatePhone: event.target.value }))
            }
            inputMode="tel"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`ec-address-${employeeId}`}>Address</Label>
          <Input
            id={`ec-address-${employeeId}`}
            value={form.address}
            disabled={!canEdit}
            onChange={(event) =>
              setForm((current) => ({ ...current, address: event.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Blood group</Label>
          <Select
            value={form.bloodGroup || "none"}
            disabled={!canEdit}
            onValueChange={(next) =>
              setForm((current) => ({ ...current, bloodGroup: next === "none" ? "" : next }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not provided</SelectItem>
              {BLOOD_GROUPS.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`ec-notes-${employeeId}`}>Medical notes</Label>
          <Textarea
            id={`ec-notes-${employeeId}`}
            value={form.medicalNotes}
            disabled={!canEdit}
            onChange={(event) =>
              setForm((current) => ({ ...current, medicalNotes: event.target.value }))
            }
            rows={3}
            placeholder="Allergies, conditions, or instructions for emergencies"
          />
        </div>
        {canEdit && (
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save emergency contact
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
