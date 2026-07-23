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
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
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
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[radial-gradient(circle_at_top_left,#eff6ff_0%,#f8fafc_40%,#eef2ff_100%)] px-3 py-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[1.75rem] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,.16)] lg:grid-cols-[.82fr_1.18fr]">
          <aside className="relative overflow-hidden bg-slate-950 p-6 text-white sm:p-9">
            <div className="absolute -right-20 -top-24 size-64 rounded-full bg-blue-500/25 blur-3xl" />
            <div className="relative">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-950/30">
                <Fingerprint className="size-7" />
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[.18em] text-blue-300">
                Secure account activation
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Register your face to continue
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
                This one-time setup protects your account and makes every mobile attendance punch
                verifiable.
              </p>

              <div className="mt-8 space-y-4 text-sm">
                {[
                  {
                    icon: Camera,
                    title: "Live camera check",
                    body: "A blink or head-turn confirms you are physically present.",
                  },
                  {
                    icon: MapPin,
                    title: "Location at attendance",
                    body: "GPS is requested only when you check in or check out.",
                  },
                  {
                    icon: LockKeyhole,
                    title: "Encrypted storage",
                    body: "Face templates and short-lived captures are encrypted.",
                  },
                  {
                    icon: Clock3,
                    title: "Automatic deletion",
                    body: "Verification captures expire after the configured retention period.",
                  },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                      <Icon className="size-4 text-blue-300" />
                    </div>
                    <div>
                      <div className="font-semibold">{title}</div>
                      <div className="mt-0.5 text-xs leading-5 text-slate-400">{body}</div>
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
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">
                    Live verification
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">
                    Follow the camera prompt
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
                <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-amber-100">
                  <Clock3 className="size-8 text-amber-700" />
                </div>
                <h2 className="mt-5 text-2xl font-bold text-slate-950">Registration submitted</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  A Developer Admin must approve your face registration. This page checks
                  automatically, so you can leave it open.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
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
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100">
                    <ShieldCheck className="size-6 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">
                      Signed in as
                    </p>
                    <h2 className="font-bold text-slate-950">{user?.name}</h2>
                  </div>
                </div>

                {rejected && (
                  <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                    <div className="font-semibold">Registration needs to be repeated</div>
                    <p className="mt-1">
                      {user?.faceEnrollmentReason ??
                        "The previous capture could not be approved. Please submit a clearer capture."}
                    </p>
                  </div>
                )}

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => {
                        setConsent(event.target.checked);
                        setError(null);
                      }}
                      className="mt-1 size-4 rounded border-slate-300 accent-blue-600"
                    />
                    <span className="text-sm leading-6 text-slate-700">{consentText}</span>
                  </label>
                </div>

                {error && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <Button
                  size="lg"
                  className="mt-5 h-12 w-full rounded-xl bg-blue-600 text-base hover:bg-blue-700"
                  disabled={starting}
                  onClick={() => void startEnrollment()}
                >
                  {starting
                    ? "Preparing camera…"
                    : rejected
                      ? "Register again"
                      : "Start registration"}
                </Button>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  Use a well-lit area and remove masks or dark glasses.
                </div>
                <Button variant="ghost" className="mt-3 w-full text-slate-600" onClick={logout}>
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
