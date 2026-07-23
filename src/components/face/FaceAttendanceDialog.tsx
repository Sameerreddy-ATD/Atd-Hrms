import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, LocateFixed, ShieldCheck } from "lucide-react";
import { FaceCapture } from "@/components/face/FaceCapture";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { faceApi } from "@/services/api";
import { getDeviceLocation } from "@/lib/geolocation";
import type { FaceCapturePayload, FaceVerificationSession } from "@/types/domain";

export interface VerifiedAttendanceCapture {
  latitude: number;
  longitude: number;
  locationAccuracy: number;
  faceVerification: FaceCapturePayload;
}

export function FaceAttendanceDialog({
  action,
  onClose,
  onVerified,
}: {
  action: "check-in" | "check-out" | null;
  onClose: () => void;
  onVerified: (payload: VerifiedAttendanceCapture) => Promise<void>;
}) {
  const [session, setSession] = useState<FaceVerificationSession | null>(null);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    Promise.all([
      faceApi.createSession(
        action === "check-in" ? "ATTENDANCE_CHECK_IN" : "ATTENDANCE_CHECK_OUT",
        navigator.userAgent.slice(0, 120),
      ),
      getDeviceLocation({ allowRecent: false }),
    ])
      .then(([nextSession, nextPosition]) => {
        if (!active) return;
        if (nextPosition.coords.accuracy > nextSession.settings.maxGpsAccuracyMeters) {
          throw new Error(
            `Location accuracy is ${Math.round(nextPosition.coords.accuracy)} m. Move near a window, enable precise location, and try again.`,
          );
        }
        setSession(nextSession);
        setPosition(nextPosition);
      })
      .catch((caught) => {
        if (!active) return;
        const geolocationCode =
          caught && typeof caught === "object" && "code" in caught
            ? Number((caught as { code: unknown }).code)
            : null;
        const message =
          geolocationCode === 1
            ? "Precise location permission is required to mark attendance."
            : caught instanceof Error
              ? caught.message
              : "Face attendance could not start.";
        setError(message);
      });
    return () => {
      active = false;
    };
  }, [action]);

  const finish = useCallback(
    async (capture: FaceCapturePayload) => {
      if (!position) throw new Error("Live location is unavailable. Please try again.");
      await onVerified({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        locationAccuracy: position.coords.accuracy,
        faceVerification: capture,
      });
      onClose();
    },
    [onClose, onVerified, position],
  );

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[calc(100dvh-1rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:p-6">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-blue-600" />
            Verify to {action === "check-in" ? "check in" : "check out"}
          </DialogTitle>
          <DialogDescription>
            Complete the live face movement. Your precise location is attached to this attendance
            event.
          </DialogDescription>
        </DialogHeader>

        {!session && !error && (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
            <div className="relative flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <LocateFixed className="size-8" />
              <LoaderCircle className="absolute -right-1 -top-1 size-5 animate-spin rounded-full bg-white text-blue-600" />
            </div>
            <div>
              <div className="font-semibold text-slate-950">Confirming camera and location</div>
              <p className="mt-1 text-sm text-slate-500">Keep precise location enabled.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="my-auto rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {session && position && (
          <FaceCapture session={session} onComplete={finish} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
