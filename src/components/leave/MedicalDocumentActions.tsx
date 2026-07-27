import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock3, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { LeaveRequest } from "@/types/domain";
import { leaveApi } from "@/services/api";

export function medicalHref(url: string | null | undefined) {
  if (!url) return undefined;
  return leaveApi.medicalFileUrl(url);
}

export function MedicalOpenLink({
  url,
  label = "Open medical report",
}: {
  url: string | null | undefined;
  label?: string;
}) {
  const href = medicalHref(url);
  if (!href) return <span className="text-sm text-muted-foreground">Not uploaded</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

export function MedicalVerifyButton({
  leaveId,
  disabled,
  onVerified,
}: {
  leaveId: string;
  disabled?: boolean;
  onVerified: (leave: LeaveRequest) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        void leaveApi
          .verifyMedicalDocument(leaveId)
          .then((updated) => {
            onVerified(updated);
            toast.success("Medical report verified");
          })
          .catch((err) => toast.error((err as Error).message))
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Verifying..." : "Verify medical"}
    </Button>
  );
}

export function MedicalDocumentUploadCard({
  leave,
  onUpdated,
}: {
  leave: LeaveRequest;
  onUpdated: (leave: LeaveRequest) => void;
}) {
  const [url, setUrl] = useState(leave.medicalDocumentUrl ?? "");
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  if (!leave.medicalDocumentDueAt || leave.medicalDocumentUrl) return null;

  const remaining = Math.max(0, new Date(leave.medicalDocumentDueAt).getTime() - now);
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  async function save() {
    setSaving(true);
    try {
      if (!file) {
        toast.error("Upload a medical certificate file (PDF or image)");
        return;
      }
      if (file.size > 1_500_000) {
        toast.error("File must be under 1.5 MB");
        return;
      }
      const { fileToBase64 } = await import("@/lib/file-upload");
      const upload = await fileToBase64(file);
      const stored = await leaveApi.uploadMedicalFile(upload);
      const updated = await leaveApi.updateMedicalDocument(leave.id, stored.url);
      onUpdated(updated);
      setFile(null);
      setUrl(stored.url);
      toast.success("Medical certificate saved securely");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-amber-200 dark:border-amber-900/50">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Sick leave medical certificate</p>
            <p className="text-sm text-muted-foreground">
              {leave.from} to {leave.to}. Upload a private PDF or image within 48 hours after
              returning to work. Reminders are sent at 24 hours and 2 hours before the deadline.
            </p>
          </div>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-right dark:bg-amber-950/30">
            <p className="flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
              <Clock3 className="h-3.5 w-3.5" /> Time remaining
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-amber-950 dark:text-amber-200">
              {remaining ? `${days}d ${hours}h ${minutes}m ${seconds}s` : "Deadline passed"}
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void save()} disabled={saving || !file} className="sm:shrink-0">
              {saving ? "Saving..." : "Upload securely"}
            </Button>
            {leave.medicalDocumentUrl && (
              <Button asChild variant="outline" size="icon" title="Open medical document">
                <a
                  href={medicalHref(leave.medicalDocumentUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Public or shareable Drive links are not accepted. Authorized roles only can open this
          file.
        </p>
      </CardContent>
    </Card>
  );
}

export function decisionLabel(leave: LeaveRequest) {
  if (leave.reviewedByName) {
    if (leave.status === "Rejected") return `Rejected by ${leave.reviewedByName}`;
    if (leave.status === "Approved") return `Approved by ${leave.reviewedByName}`;
    return leave.reviewedByName;
  }
  if (leave.status === "Pending") return "Awaiting decision";
  return "-";
}
