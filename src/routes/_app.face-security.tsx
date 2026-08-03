import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Clock3,
  Eye,
  ImageOff,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { faceApi, fetchAuthenticatedBlob } from "@/services/api";
import type { FaceAdminProfile, FaceEvidenceSummary, FaceSettings } from "@/types/domain";

export const Route = createFileRoute("/_app/face-security")({
  component: FaceSecurityPage,
});

const statusTone: Record<string, string> = {
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  REJECTED: "border-red-200 bg-red-50 text-red-800",
  NOT_REGISTERED: "border-slate-200 bg-slate-50 text-slate-700",
  DISABLED: "border-slate-200 bg-slate-100 text-slate-700",
};

function FaceSecurityPage() {
  const [profiles, setProfiles] = useState<FaceAdminProfile[]>([]);
  const [settings, setSettings] = useState<FaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<FaceAdminProfile | null>(null);
  const [rejecting, setRejecting] = useState<FaceAdminProfile | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState<"all" | "pending" | "alerts" | "unregistered">(
    "all",
  );

  const refresh = async () => {
    const [nextProfiles, nextSettings] = await Promise.all([
      faceApi.admin.profiles(),
      faceApi.admin.settings(),
    ]);
    setProfiles(nextProfiles);
    setSettings(nextSettings);
  };

  useEffect(() => {
    void refresh()
      .catch((error) => toast.error((error as Error).message))
      .finally(() => setLoading(false));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    }, 45_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(
    () => ({
      approved: profiles.filter((profile) => profile.status === "APPROVED").length,
      pending: profiles.filter((profile) => profile.status === "PENDING").length,
      required: settings?.verificationEnabled
        ? profiles.filter(
            (profile) => profile.status !== "APPROVED" && profile.status !== "DISABLED",
          ).length
        : 0,
      alerts: profiles.filter((profile) => profile.latestAlert).length,
    }),
    [profiles, settings?.verificationEnabled],
  );

  const visibleProfiles = useMemo(() => {
    const query = profileSearch.trim().toLowerCase();
    return profiles.filter((profile) => {
      const matchesSearch =
        !query ||
        [profile.name, profile.email, profile.employeeId, profile.role]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      const matchesFilter =
        profileFilter === "all" ||
        (profileFilter === "pending" && profile.status === "PENDING") ||
        (profileFilter === "alerts" && Boolean(profile.latestAlert)) ||
        (profileFilter === "unregistered" && profile.status === "NOT_REGISTERED");
      return matchesSearch && matchesFilter;
    });
  }, [profileFilter, profileSearch, profiles]);

  async function updateProfile(userId: string, action: () => Promise<unknown>, success: string) {
    setBusyUser(userId);
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyUser(null);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      setSettings(await faceApi.admin.updateSettings(settings));
      toast.success("Face attendance settings updated");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleVerification(verificationEnabled: boolean) {
    if (!settings) return;
    const previous = settings;
    const next = { ...settings, verificationEnabled };
    setSettings(next);
    setSaving(true);
    try {
      setSettings(await faceApi.admin.updateSettings(next));
      toast.success(
        verificationEnabled
          ? "Face verification enabled for employees"
          : "Face verification paused; precise location remains required",
      );
    } catch (error) {
      setSettings(previous);
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading face security" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Face Security"
        description="Approve registrations, review face photos, and manage verification controls."
        actions={
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {[
          {
            label: "Approved",
            value: counts.approved,
            icon: UserRoundCheck,
            tone: "text-emerald-700",
          },
          { label: "Pending", value: counts.pending, icon: Clock3, tone: "text-amber-700" },
          {
            label: "Required",
            value: counts.required,
            icon: ShieldCheck,
            tone: "text-blue-700",
          },
          {
            label: "Face alerts",
            value: counts.alerts,
            icon: ShieldAlert,
            tone: "text-red-700",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <CardContent className="p-3 sm:p-5">
              <Icon className={`size-5 ${tone}`} />
              <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
              <div className="text-[11px] text-muted-foreground sm:text-sm">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {settings && (
        <Card
          className={
            settings.verificationEnabled
              ? "border-emerald-200 bg-emerald-50/35"
              : "border-amber-200 bg-amber-50/45"
          }
        >
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex gap-3">
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
                  settings.verificationEnabled
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {settings.verificationEnabled ? (
                  <Power className="size-5" />
                ) : (
                  <PowerOff className="size-5" />
                )}
              </div>
              <div>
                <div className="font-semibold">
                  Face verification {settings.verificationEnabled ? "is active" : "is paused"}
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {settings.verificationEnabled
                    ? "Employees must have an approved face profile and complete a live face match at check-in. The first 3 registration photos (centre, left, right) are kept for review; daily check-in does not store new photos."
                    : "Employees can open the application and check in without a camera. Precise GPS is still required; existing face profiles and evidence are retained."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 sm:justify-start">
              <Label htmlFor="faceVerificationEnabled" className="cursor-pointer">
                Employee verification
              </Label>
              <Switch
                id="faceVerificationEnabled"
                checked={settings.verificationEnabled}
                disabled={saving}
                onCheckedChange={(checked) => void toggleVerification(checked)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {settings && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <div className="font-semibold">Face registration approval</div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Manual keeps new registrations pending until you approve them. Automatic approves
                valid liveness registrations immediately and records them in auto-approved history.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-xl border bg-background px-4 py-3">
              <Label htmlFor="registrationApprovalMode">Mode</Label>
              <select
                id="registrationApprovalMode"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={settings.registrationApprovalMode ?? "MANUAL"}
                disabled={saving}
                onChange={(event) => {
                  const registrationApprovalMode = event.target.value as "MANUAL" | "AUTOMATIC";
                  const next = { ...settings, registrationApprovalMode };
                  setSettings(next);
                  void faceApi.admin
                    .updateSettings(next)
                    .then(() =>
                      toast.success(
                        registrationApprovalMode === "AUTOMATIC"
                          ? "Automatic face approval enabled"
                          : "Manual face approval enabled",
                      ),
                    )
                    .catch((error) => toast.error((error as Error).message));
                }}
              >
                <option value="MANUAL">Manual</option>
                <option value="AUTOMATIC">Automatic</option>
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Privacy and verification policy</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="retentionDays">Capture retention (days)</Label>
              <Input
                id="retentionDays"
                type="number"
                min={1}
                max={30}
                value={settings.retentionDays}
                onChange={(event) =>
                  setSettings({ ...settings, retentionDays: Number(event.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">Default is 5; allowed range is 1–30.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="matchThreshold">Face-match threshold</Label>
              <Input
                id="matchThreshold"
                type="number"
                min={0.4}
                max={0.9}
                step={0.01}
                value={settings.matchThreshold}
                onChange={(event) =>
                  setSettings({ ...settings, matchThreshold: Number(event.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Recommended: 0.50. Raising this is stricter but can reject the correct employee.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gpsAccuracy">Maximum GPS error (metres)</Label>
              <Input
                id="gpsAccuracy"
                type="number"
                min={10}
                max={2000}
                value={settings.maxGpsAccuracyMeters}
                onChange={(event) =>
                  setSettings({ ...settings, maxGpsAccuracyMeters: Number(event.target.value) })
                }
              />
            </div>
            <div className="flex items-end">
              <Button className="w-full" disabled={saving} onClick={() => void saveSettings()}>
                {saving ? "Saving…" : "Save policy"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={profileSearch}
            onChange={(event) => setProfileSearch(event.target.value)}
            placeholder="Search employee, email, ID, or role"
            aria-label="Search face profiles"
            className="h-11 pl-9 sm:h-10"
          />
        </div>
        <div
          className="scrollbar-none flex max-w-full snap-x gap-1 overflow-x-auto rounded-lg bg-muted/55 p-1"
          aria-label="Filter face profiles"
        >
          {[
            { value: "all", label: "All", count: profiles.length },
            { value: "pending", label: "Pending", count: counts.pending },
            { value: "alerts", label: "Alerts", count: counts.alerts },
            {
              value: "unregistered",
              label: "Not registered",
              count: profiles.filter((profile) => profile.status === "NOT_REGISTERED").length,
            },
          ].map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={profileFilter === filter.value ? "default" : "ghost"}
              className="shrink-0 snap-start"
              onClick={() =>
                setProfileFilter(filter.value as "all" | "pending" | "alerts" | "unregistered")
              }
            >
              {filter.label}
              <span className="tabular-nums opacity-70">{filter.count}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {visibleProfiles.map((profile) => {
          const photos =
            profile.enrollmentEvidence?.length > 0
              ? profile.enrollmentEvidence
              : profile.latestEvidence
                ? [profile.latestEvidence]
                : [];
          const latest = photos[0] ?? null;
          const busy = busyUser === profile.userId;
          return (
            <Card key={profile.userId} className="overflow-hidden">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{profile.name}</div>
                    <div className="truncate text-sm text-muted-foreground">{profile.email}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {profile.employeeId ?? "System account"} · {profile.role.replaceAll("_", " ")}
                    </div>
                  </div>
                  <Badge variant="outline" className={statusTone[profile.status]}>
                    {profile.status.replaceAll("_", " ")}
                  </Badge>
                </div>

                {latest && (
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/45 p-3 text-xs sm:grid-cols-4">
                    <div>
                      <div className="text-muted-foreground">Face</div>
                      <div className="mt-1 font-semibold">
                        {Math.round(latest.faceConfidence * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Liveness</div>
                      <div className="mt-1 font-semibold">
                        {Math.round(latest.livenessScore * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Anti-spoof</div>
                      <div className="mt-1 font-semibold">
                        {Math.round(latest.antiSpoofScore * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Captured</div>
                      <div className="mt-1 font-semibold">
                        {new Date(latest.capturedAt).toLocaleDateString("en-IN")}
                      </div>
                    </div>
                  </div>
                )}

                {profile.rejectionReason && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                    {profile.rejectionReason}
                  </div>
                )}

                {profile.latestAlert && (
                  <div className="mt-3 flex gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Another face detected</div>
                      <div className="mt-0.5 text-xs">
                        A check-in attempt was blocked because the face did not match this employee
                        {" · "}
                        {new Date(profile.latestAlert.capturedAt).toLocaleString("en-IN")}.
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {photos.some((photo) => photo.imageAvailable) && (
                    <Button variant="outline" size="sm" onClick={() => setEvidence(profile)}>
                      <Eye className="mr-1.5 size-4" />
                      View photos ({photos.filter((photo) => photo.imageAvailable).length})
                    </Button>
                  )}
                  {profile.status === "PENDING" && (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void updateProfile(
                            profile.userId,
                            () => faceApi.admin.approve(profile.userId),
                            `${profile.name} is approved`,
                          )
                        }
                      >
                        <Check className="mr-1.5 size-4" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setRejecting(profile);
                          setRejectionReason("");
                        }}
                      >
                        <X className="mr-1.5 size-4" />
                        Reject
                      </Button>
                    </>
                  )}
                  {profile.status !== "NOT_REGISTERED" && profile.role !== "DEVELOPER_ADMIN" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Reset face registration for ${profile.name}?`)) return;
                        void updateProfile(
                          profile.userId,
                          () => faceApi.admin.reset(profile.userId),
                          `${profile.name} must register again`,
                        );
                      }}
                    >
                      <RotateCcw className="mr-1.5 size-4" />
                      Reset
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!visibleProfiles.length && (
          <div className="col-span-full rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center">
            <Search className="mx-auto size-6 text-muted-foreground" />
            <div className="mt-3 font-medium">No matching face profiles</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Change the search text or select another filter.
            </p>
          </div>
        )}
      </div>

      <Dialog open={Boolean(evidence)} onOpenChange={(open) => !open && setEvidence(null)}>
        <DialogContent className="max-w-3xl overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-4 py-4 pr-14 text-left sm:px-5">
            <DialogTitle>Registration photos</DialogTitle>
            <DialogDescription>
              {evidence?.name}
              {evidence?.latestEvidence
                ? ` · ${new Date(evidence.latestEvidence.capturedAt).toLocaleString("en-IN")}`
                : ""}
              {" · "}
              First 3 enrollment angles (centre, left, right)
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-950 p-3 sm:p-4">
            {(evidence?.enrollmentEvidence?.length
              ? evidence.enrollmentEvidence
              : evidence?.latestEvidence
                ? [evidence.latestEvidence]
                : []
            ).length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(evidence?.enrollmentEvidence?.length
                  ? evidence.enrollmentEvidence
                  : evidence?.latestEvidence
                    ? [evidence.latestEvidence]
                    : []
                ).map((photo) => (
                  <div key={photo.evidenceId} className="min-w-0 space-y-2">
                    <EvidencePhoto
                      evidenceId={photo.evidenceId}
                      imageAvailable={photo.imageAvailable}
                      employeeName={evidence?.name}
                      className="aspect-[3/4] w-full overflow-hidden rounded-xl"
                    />
                    <div className="text-center text-sm font-medium text-slate-200">
                      {photo.label ?? `Photo ${photo.photoIndex ?? ""}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <ImageOff className="size-6" />
                No photo available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject face registration</DialogTitle>
            <DialogDescription>
              Explain what {rejecting?.name} should correct before registering again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejectionReason">Reason</Label>
            <Textarea
              id="rejectionReason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="For example: face is partly covered or the image is too dark."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectionReason.trim().length < 3 || Boolean(busyUser)}
              onClick={() => {
                if (!rejecting) return;
                void updateProfile(
                  rejecting.userId,
                  () => faceApi.admin.reject(rejecting.userId, rejectionReason.trim()),
                  `${rejecting.name}'s registration was rejected`,
                ).then(() => setRejecting(null));
              }}
            >
              Reject registration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EvidencePhoto({
  evidenceId,
  imageAvailable,
  employeeName,
  className,
  onOpen,
}: {
  evidenceId: string;
  imageAvailable: boolean;
  employeeName?: string;
  className?: string;
  onOpen?: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageAvailable || !evidenceId) {
      setBlobUrl(null);
      setImageFailed(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setImageFailed(false);
    setBlobUrl(null);
    void (async () => {
      try {
        const blob = await fetchAuthenticatedBlob(faceApi.admin.evidenceImagePath(evidenceId));
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setImageFailed(true);
          setBlobUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidenceId, imageAvailable]);

  const imageVisible = imageAvailable && Boolean(blobUrl) && !imageFailed;
  const content = imageVisible ? (
    <img
      src={blobUrl!}
      alt={`Face evidence for ${employeeName ?? "employee"}`}
      className="absolute inset-0 h-full w-full object-cover object-center"
    />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
      <ImageOff className="size-6" />
      <span>{imageFailed ? "Could not load" : imageAvailable ? "Loading…" : "Expired"}</span>
    </div>
  );

  if (onOpen && imageVisible) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`relative block cursor-zoom-in ${className ?? ""}`}
        aria-label={`View face photo for ${employeeName ?? "employee"}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`relative ${className ?? ""}`}>{content}</div>;
}
