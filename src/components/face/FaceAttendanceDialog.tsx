import { useCallback, useEffect, useRef, useState } from "react";
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
import type { FaceCapturePayload, FaceVerificationSession } from "@/types/domain";

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

export function FaceAttendanceDialog({
  action,
  onClose,
  onVerified,
}: {
  action: "check-in" | "check-out" | null;
  onClose: () => void;
  onVerified: (payload: AttendanceCapture) => Promise<void>;
}) {
  const [session, setSession] = useState<FaceVerificationSession | null>(null);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
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
      return;
    }
    let active = true;
    setSession(null);
    setPosition(null);
    setError(null);
    const prepare = async () => {
      try {
        // Load face models only when the user starts check-in (not on every dashboard visit).
        const statusPromise = faceApi.status();
        const locationPromise = getDeviceLocation({ allowRecent: false });
        const status = await statusPromise;
        if (action === "check-in" && status.verificationEnabled) {
          void preloadFaceRecognition().catch(() => undefined);
        }
        const nextPosition = await locationPromise;
        if (!active) return;
        if (nextPosition.coords.accuracy > status.maxGpsAccuracyMeters) {
          throw new Error(
            formatImpreciseLocationError(
              nextPosition.coords.accuracy,
              status.maxGpsAccuracyMeters,
            ),
          );
        }
        setPosition(nextPosition);
        if (action === "check-in" && status.verificationEnabled) {
          await preloadFaceRecognition().catch(() => undefined);
          const nextSession = await faceApi.createSession(
            "ATTENDANCE_CHECK_IN",
            navigator.userAgent.slice(0, 120),
          );
          if (!active) return;
          setSession(nextSession);
          return;
        }
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
              : "Attendance could not start.";
        setError(message);
      }
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [action, attempt]);

  const finish = useCallback(
    async (capture: FaceCapturePayload) => {
      if (!position) throw new Error("Live location is unavailable. Please try again.");
      await onVerified({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        locationAccuracy: position.coords.accuracy,
        eventTime: new Date().toISOString(),
        faceVerification: capture,
      });
      onClose();
    },
    [onClose, onVerified, position],
  );

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[calc(100dvh-1rem)] max-w-2xl overflow-y-auto p-4 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:p-6">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </span>
            Verify to {action === "check-in" ? "check in" : "check out"}
          </DialogTitle>
          <DialogDescription>
            {action === "check-in"
              ? "Blink once while looking at the camera — no head turns. Your face is matched live (no new photo saved). Precise location and the exact punch time are recorded."
              : "No camera is used for check-out. Your precise location and the exact punch time are recorded."}
          </DialogDescription>
        </DialogHeader>

        {!session && !error && (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
            <div className="relative flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LocateFixed className="size-8" />
              <LoaderCircle className="absolute -right-1 -top-1 size-5 animate-spin rounded-full bg-background text-primary" />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-foreground">
                {action === "check-in"
                  ? "Checking face policy and precise location"
                  : "Confirming precise check-out location"}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Keep precise location enabled.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="my-auto rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-semibold">Attendance was not saved</div>
            <div className="mt-1 text-destructive/90">{error}</div>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        )}

        {action === "check-in" && session && position && (
          <FaceCapture session={session} onComplete={finish} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
