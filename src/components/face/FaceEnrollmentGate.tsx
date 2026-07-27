import { useCallback, useEffect, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  Fingerprint,
  LockKeyhole,
  LogOut,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { FaceCapture } from "@/components/face/FaceCapture";
import { Button } from "@/components/ui/button";
import { authApi, faceApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import type { FaceCapturePayload, FaceVerificationSession } from "@/types/domain";

export function FaceEnrollmentGate() {
  const { user, logout, updateCurrentUser } = useAuth();
  const [session, setSession] = useState<FaceVerificationSession | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentVersion, setConsentVersion] = useState("2026-07");
  const [consentText, setConsentText] = useState(
    "I consent to secure face-template processing for identity verification and attendance.",
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void faceApi
      .status()
      .then((status) => {
        setConsentVersion(status.consent.version);
        setConsentText(status.consent.text);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user?.faceEnrollmentStatus !== "PENDING") return;
    const refresh = async () => {
      try {
        const result = await authApi.me();
        updateCurrentUser(result.user);
      } catch {
        // A temporary network failure should not unlock or dismiss the gate.
      }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.faceEnrollmentStatus, updateCurrentUser]);

  const startEnrollment = async () => {
    if (!consent) {
      setError("Accept the biometric consent statement to continue.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      setSession(await faceApi.createSession("ENROLLMENT", navigator.userAgent.slice(0, 120)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Face registration could not start.");
    } finally {
      setStarting(false);
    }
  };

  const finishEnrollment = useCallback(
    async (capture: FaceCapturePayload) => {
      await faceApi.enroll({
        ...capture,
        consentAccepted: true,
        consentVersion,
      });
      const refreshed = await authApi.me();
      updateCurrentUser(refreshed.user);
      setSession(null);
    },
    [consentVersion, updateCurrentUser],
  );

  const pending = user?.faceEnrollmentStatus === "PENDING";
  const rejected = user?.faceEnrollmentStatus === "REJECTED";

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-gradient-to-b from-muted/40 via-background to-background px-3 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm lg:grid-cols-[.82fr_1.18fr]">
          <aside className="relative overflow-hidden bg-foreground p-6 text-background sm:p-9">
            <div className="absolute -right-20 -top-24 size-64 rounded-full bg-primary/25 blur-3xl" />
            <div className="relative">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Fingerprint className="size-7" />
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[.18em] text-primary">
                Secure account activation
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Register your face to continue
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-background/70">
                Photos are saved once during registration (centre, left, and right). Later check-ins
                only verify your live face—no new photos are stored.
              </p>

              <div className="mt-8 space-y-4 text-sm">
                {[
                  {
                    icon: Camera,
                    title: "Three-direction photos",
                    body: "Centre, left, and right registration photos improve matching from different angles.",
                  },
                  {
                    icon: MapPin,
                    title: "Location at attendance",
                    body: "GPS is requested only when you check in or check out.",
                  },
                  {
                    icon: LockKeyhole,
                    title: "Encrypted storage",
                    body: "Your face template and registration photos are encrypted at rest.",
                  },
                  {
                    icon: Clock3,
                    title: "Verify without saving",
                    body: "Daily check-in matches your live face only. No attendance photos are kept.",
                  },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background/10">
                      <Icon className="size-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold">{title}</div>
                      <div className="mt-0.5 text-xs leading-5 text-background/60">{body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="flex min-h-[34rem] flex-col p-4 sm:p-7 lg:p-9">
            {session ? (
              <>
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">
                    Registration photos
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
                    Capture centre, left, then right
                  </h2>
                </div>
                <FaceCapture
                  session={session}
                  onComplete={finishEnrollment}
                  onCancel={() => setSession(null)}
                />
              </>
            ) : pending ? (
              <div className="m-auto max-w-md text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Clock3 className="size-8" />
                </div>
                <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
                  Registration submitted
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  A Developer Admin must approve your face registration. This page checks
                  automatically, so you can leave it open.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  <span className="size-2 animate-pulse rounded-full bg-amber-500" />
                  Waiting for approval
                </div>
                <Button variant="outline" className="mt-6 w-full" onClick={logout}>
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="m-auto w-full max-w-lg">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">
                      Signed in as
                    </p>
                    <h2 className="font-bold tracking-tight text-foreground">{user?.name}</h2>
                  </div>
                </div>

                {rejected && (
                  <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    <div className="font-semibold">Registration needs to be repeated</div>
                    <p className="mt-1 text-destructive/90">
                      {user?.faceEnrollmentReason ??
                        "The previous capture could not be approved. Please submit a clearer capture."}
                    </p>
                  </div>
                )}

                <div className="mt-6 rounded-xl border border-border/80 bg-muted/40 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => {
                        setConsent(event.target.checked);
                        setError(null);
                      }}
                      className="mt-1 size-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm leading-6 text-foreground/90">{consentText}</span>
                  </label>
                </div>

                {error && (
                  <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  size="lg"
                  className="mt-5 h-12 w-full rounded-xl text-base"
                  disabled={starting}
                  onClick={() => void startEnrollment()}
                >
                  {starting
                    ? "Preparing camera…"
                    : rejected
                      ? "Register again"
                      : "Start registration"}
                </Button>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-primary" />
                  Use a well-lit area and remove masks or dark glasses.
                </div>
                <Button variant="ghost" className="mt-3 w-full" onClick={logout}>
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
