import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Clock3,
  Eye,
  RefreshCw,
  RotateCcw,
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
import { faceApi } from "@/services/api";
import type { FaceAdminProfile, FaceEvidenceRecord, FaceSettings } from "@/types/domain";

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
  const [evidenceHistory, setEvidenceHistory] = useState<FaceEvidenceRecord[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [rejecting, setRejecting] = useState<FaceAdminProfile | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

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
  }, []);

  const counts = useMemo(
    () => ({
      approved: profiles.filter((profile) => profile.status === "APPROVED").length,
      pending: profiles.filter((profile) => profile.status === "PENDING").length,
      required: profiles.filter(
        (profile) => profile.status !== "APPROVED" && profile.status !== "DISABLED",
      ).length,
    }),
    [profiles],
  );

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

  async function openEvidence(profile: FaceAdminProfile) {
    setEvidence(profile);
    setEvidenceHistory([]);
    setEvidenceLoading(true);
    try {
      setEvidenceHistory(await faceApi.admin.evidence(profile.userId));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setEvidenceLoading(false);
    }
  }

  if (loading) return <LoadingState label="Loading face security" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Face Security"
        description="Approve registrations, review short-lived evidence, and manage verification controls."
        actions={
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
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

      <div className="grid gap-3 xl:grid-cols-2">
        {profiles.map((profile) => {
          const latest = profile.latestEvidence;
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

                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {latest && (
                    <Button variant="outline" size="sm" onClick={() => void openEvidence(profile)}>
                      <Eye className="mr-1.5 size-4" />
                      Evidence
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
      </div>

      <Dialog open={Boolean(evidence)} onOpenChange={(open) => !open && setEvidence(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registration evidence</DialogTitle>
            <DialogDescription>
              {evidence?.name} · This encrypted capture is automatically deleted after retention.
            </DialogDescription>
          </DialogHeader>
          {evidenceLoading ? (
            <LoadingState label="Loading encrypted evidence" />
          ) : (
            <div className="grid max-h-[70dvh] gap-3 overflow-y-auto sm:grid-cols-2">
              {evidenceHistory.map((item) => (
                <div key={item.evidenceId} className="overflow-hidden rounded-xl border">
                  {item.imageAvailable ? (
                    <img
                      src={faceApi.admin.evidenceImageUrl(item.evidenceId)}
                      alt={`Face evidence for ${evidence?.name}`}
                      className="aspect-[4/3] w-full bg-slate-950 object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-muted text-xs text-muted-foreground">
                      Image expired
                    </div>
                  )}
                  <div className="space-y-1 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.purpose.replaceAll("_", " ")}</span>
                      <Badge variant="outline">{item.outcome}</Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(item.capturedAt).toLocaleString("en-IN")}
                    </div>
                    {item.locationAccuracy !== null && (
                      <div className="text-muted-foreground">
                        GPS accuracy: {Math.round(item.locationAccuracy)} m
                      </div>
                    )}
                    {item.failureReason && <div className="text-red-700">{item.failureReason}</div>}
                  </div>
                </div>
              ))}
              {!evidenceHistory.length && (
                <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No retained evidence is available.
                </div>
              )}
            </div>
          )}
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
