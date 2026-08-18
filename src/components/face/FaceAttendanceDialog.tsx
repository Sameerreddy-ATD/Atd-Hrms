import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, LocateFixed, ShieldCheck } from "lucide-react";
import { FaceCapture, preloadFaceRecognition } from "@/components/face/FaceCapture";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { faceApi } from "@/services/api";
import {
  formatImpreciseLocationError,
  preciseLocationRequiredHint,
} from "@/lib/device-permissions";
import { getDeviceLocation } from "@/lib/geolocation";
import type {
  FaceCapturePayload,
  FaceEnrollmentStatus,
  FaceVerificationSession,
} from "@/types/domain";

export interface LocationAttendanceCapture {
  latitude: number;
  longitude: number;
  locationAccuracy: number;
  /** Instant the employee completed the punch (IST-relevant wall clock from device). */
  eventTime: string;
}

export interface VerifiedCheckInCapture extends LocationAttendanceCapture {
  faceVerification: FaceCapturePayload;
}

export type AttendanceCapture = VerifiedCheckInCapture | LocationAttendanceCapture;

function needsFaceRegistration(status: FaceEnrollmentStatus | undefined) {
  return (
    !status ||
    status === "NOT_REGISTERED" ||
    status === "REJECTED" ||
    status === "DISABLED"
  );
}

export function FaceAttendanceDialog({
  action,
  onClose,
  onVerified,
}: {
  action: "check-in" | "check-out" | null;
  onClose: () => void;
  onVerified: (payload: AttendanceCapture) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [session, setSession] = useState<FaceVerificationSession | null>(null);
  const [mode, setMode] = useState<"gps" | "enroll" | "verify" | "pending">("gps");
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [consent, setConsent] = useState(false);
  const [consentText, setConsentText] = useState(t("pages.faceEnrollment.consentDefault"));
  const [consentVersion, setConsentVersion] = useState("2026-07");
  const [startingEnroll, setStartingEnroll] = useState(false);
  const onVerifiedRef = useRef(onVerified);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
    onCloseRef.current = onClose;
  }, [onClose, onVerified]);

  useEffect(() => {
    if (!action) {
      setSession(null);
      setPosition(null);
      setError(null);
      setConsent(false);
      setMode("gps");
      return;
    }
    let active = true;
    setSession(null);
    setPosition(null);
    setError(null);
    setConsent(false);
    const prepare = async () => {
      try {
        const statusPromise = faceApi.status();
        const locationPromise = getDeviceLocation({ allowRecent: false });
        const status = await statusPromise;
        setConsentVersion(status.consent.version);
        setConsentText(status.consent.text);
        const nextPosition = await locationPromise;
        if (!active) return;
        if (nextPosition.coords.accuracy > status.maxGpsAccuracyMeters) {
          throw new Error(
            formatImpreciseLocationError(nextPosition.coords.accuracy, status.maxGpsAccuracyMeters),
          );
        }
        setPosition(nextPosition);

        if (!status.verificationEnabled) {
          setMode("gps");
          await onVerifiedRef.current({
            latitude: nextPosition.coords.latitude,
            longitude: nextPosition.coords.longitude,
            locationAccuracy: nextPosition.coords.accuracy,
            eventTime: new Date().toISOString(),
          });
          if (active) onCloseRef.current();
          return;
        }

        await preloadFaceRecognition().catch(() => undefined);
        if (!active) return;

        if (status.status === "APPROVED") {
          setMode("verify");
          const nextSession = await faceApi.createSession(
            action === "check-out" ? "ATTENDANCE_CHECK_OUT" : "ATTENDANCE_CHECK_IN",
            navigator.userAgent.slice(0, 120),
          );
          if (!active) return;
          setSession(nextSession);
          return;
        }

        if (status.status === "PENDING") {
          setMode("pending");
          await onVerifiedRef.current({
            latitude: nextPosition.coords.latitude,
            longitude: nextPosition.coords.longitude,
            locationAccuracy: nextPosition.coords.accuracy,
            eventTime: new Date().toISOString(),
          });
          if (active) onCloseRef.current();
          return;
        }

        if (needsFaceRegistration(status.status)) {
          setMode("enroll");
          return;
        }

        setMode("gps");
        await onVerifiedRef.current({
          latitude: nextPosition.coords.latitude,
          longitude: nextPosition.coords.longitude,
          locationAccuracy: nextPosition.coords.accuracy,
          eventTime: new Date().toISOString(),
        });
        if (active) onCloseRef.current();
      } catch (caught) {
        if (!active) return;
        const geolocationCode =
          caught && typeof caught === "object" && "code" in caught
            ? Number((caught as { code: unknown }).code)
            : null;
        const message =
          geolocationCode === 1
            ? preciseLocationRequiredHint()
            : caught instanceof Error
              ? caught.message
              : t("pages.faceEnrollment.attendanceStartError");
        setError(message);
      }
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [action, attempt, t]);

  const locationPayload = useCallback((): LocationAttendanceCapture => {
    if (!position) throw new Error(t("pages.faceEnrollment.liveLocationUnavailable"));
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      locationAccuracy: position.coords.accuracy,
      eventTime: new Date().toISOString(),
    };
  }, [position, t]);

  const startEnrollment = async () => {
    if (!consent) {
      setError(t("pages.faceEnrollment.consentRequired"));
      return;
    }
    setStartingEnroll(true);
    setError(null);
    try {
      await preloadFaceRecognition().catch(() => undefined);
      setSession(await faceApi.createSession("ENROLLMENT", navigator.userAgent.slice(0, 120)));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("pages.faceEnrollment.startError"),
      );
    } finally {
      setStartingEnroll(false);
    }
  };

  const finishVerify = useCallback(
    async (capture: FaceCapturePayload) => {
      await onVerified({
        ...locationPayload(),
        faceVerification: capture,
      });
      onClose();
    },
    [locationPayload, onClose, onVerified],
  );

  const finishEnroll = useCallback(
    async (capture: FaceCapturePayload) => {
      await faceApi.enroll({
        ...capture,
        consentAccepted: true,
        consentVersion,
      });
      await onVerified(locationPayload());
      onClose();
    },
    [consentVersion, locationPayload, onClose, onVerified],
  );

  const actionLabel =
    action === "check-in"
      ? t("pages.faceEnrollment.checkInAction")
      : t("pages.faceEnrollment.checkOutAction");
  const title =
    mode === "enroll"
      ? t("pages.faceEnrollment.registerToAction", { action: actionLabel })
      : t("pages.faceEnrollment.verifyToAction", { action: actionLabel });
  const description =
    mode === "enroll"
      ? t("pages.faceEnrollment.punchEnrollDesc")
      : mode === "verify"
        ? t("pages.faceEnrollment.punchVerifyDesc")
        : action === "check-in"
          ? t("pages.faceEnrollment.checkInDialogDesc")
          : t("pages.faceEnrollment.checkOutDialogDesc");

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[calc(100dvh-1rem)] max-w-2xl overflow-y-auto p-4 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:p-6">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </span>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!session && !error && mode !== "enroll" && (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
            <div className="relative flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LocateFixed className="size-8" />
              <LoaderCircle className="absolute -right-1 -top-1 size-5 animate-spin rounded-full bg-background text-primary" />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-foreground">
                {action === "check-in"
                  ? t("pages.faceEnrollment.checkingPolicy")
                  : t("pages.faceEnrollment.confirmingLocation")}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("pages.faceEnrollment.keepLocation")}
              </p>
            </div>
          </div>
        )}

        {!session && !error && mode === "enroll" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/80 bg-muted/40 p-4">
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
            <Button
              size="lg"
              className="h-12 w-full"
              disabled={startingEnroll}
              onClick={() => void startEnrollment()}
            >
              {startingEnroll
                ? t("pages.faceEnrollment.preparingCamera")
                : t("pages.faceEnrollment.startRegistration")}
            </Button>
          </div>
        )}

        {error && (
          <div className="my-auto rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-semibold">{t("pages.faceEnrollment.notSaved")}</div>
            <div className="mt-1 text-destructive/90">{error}</div>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t("pages.faceEnrollment.tryAgain")}
            </Button>
          </div>
        )}

        {session && position && mode === "verify" && (
          <FaceCapture session={session} onComplete={finishVerify} onCancel={onClose} />
        )}
        {session && position && mode === "enroll" && (
          <FaceCapture session={session} onComplete={finishEnroll} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
