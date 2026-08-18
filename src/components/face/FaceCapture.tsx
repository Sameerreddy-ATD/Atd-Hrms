import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, ScanFace, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { lockPortraitOrientation } from "@/lib/screen-orientation";
import { blockedPermissionHint, requestNativeCameraPermission } from "@/lib/device-permissions";
import type { FaceCapturePayload, FaceVerificationSession } from "@/types/domain";

type HumanInstance = InstanceType<typeof import("@vladmandic/human").default>;
let humanPromise: Promise<HumanInstance> | null = null;

function loadHuman() {
  if (!humanPromise) {
    humanPromise = import("@vladmandic/human").then(async ({ default: Human }) => {
      const human = new Human({
        backend: "webgl",
        modelBasePath: "/face-models",
        cacheModels: true,
        cacheSensitivity: 0,
        skipAllowed: false,
        warmup: "none",
        filter: {
          enabled: true,
          equalization: false,
          autoBrightness: true,
          return: false,
        },
        face: {
          enabled: true,
          detector: {
            rotation: true,
            return: false,
            mask: false,
            maxDetected: 2,
            minConfidence: 0.5,
            minSize: 80,
            skipFrames: 0,
            skipTime: 0,
          },
          mesh: { enabled: true },
          description: {
            enabled: true,
            minConfidence: 0.5,
            skipFrames: 0,
            skipTime: 0,
          },
          iris: { enabled: false },
          emotion: { enabled: false },
          antispoof: { enabled: true, skipFrames: 0, skipTime: 0 },
          liveness: { enabled: true, skipFrames: 0, skipTime: 0 },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
      });
      await human.load();
      return human;
    });
    // A transient WebGL / model-fetch failure must not poison the cached promise,
    // or "Try again" and remounts would forever return the same rejection.
    humanPromise.catch(() => {
      humanPromise = null;
    });
  }
  return humanPromise;
}

// Shared by the attendance dialog so model loading can begin before the camera opens.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadFaceRecognition() {
  await loadHuman();
}

/** Two live frames is enough to submit — extra samples only delay save. */
const SCAN_SAMPLES = 2;
const SAMPLE_INTERVAL_MS = 40;
/** Arm's-length selfie; a high floor forces people into the camera (looks zoomed). */
const MIN_FACE_SIZE = 110;

function snapshotFromVideo(video: HTMLVideoElement) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera frame is not ready.");

  // Some phones report landscape sensor buffers while the UI is portrait; rotate so
  // admin evidence photos are upright without relying on device auto-rotate.
  const portraitUi =
    typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches;
  const rotateForPortrait = portraitUi && vw > vh;

  const srcW = rotateForPortrait ? vh : vw;
  const srcH = rotateForPortrait ? vw : vh;
  const scale = Math.min(1, 640 / srcW);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera capture is unavailable.");

  if (rotateForPortrait) {
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-Math.PI / 2);
    context.drawImage(
      video,
      -Math.round((vw * scale) / 2),
      -Math.round((vh * scale) / 2),
      Math.round(vw * scale),
      Math.round(vh * scale),
    );
  } else {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", 0.72);
}

function applyWidestCameraView(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities || !track.applyConstraints) return;
  const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
    zoom?: { min: number };
  };
  const minZoom = capabilities.zoom?.min;
  if (typeof minZoom !== "number") return;
  void track
    .applyConstraints({
      advanced: [{ zoom: minZoom } as MediaTrackConstraintSet],
    })
    .catch(() => undefined);
}

function averageDescriptor(samples: number[][]) {
  return samples[0].map(
    (_, index) => samples.reduce((sum, embedding) => sum + embedding[index], 0) / samples.length,
  );
}

export function FaceCapture({
  session,
  onComplete,
  onCancel,
}: {
  session: FaceVerificationSession;
  onComplete: (capture: FaceCapturePayload) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const completeRef = useRef(onComplete);
  const isEnrollment = session.purpose === "ENROLLMENT";
  const [phase, setPhase] = useState<"loading" | "camera" | "verifying" | "done" | "error">(
    "loading",
  );
  const [message, setMessage] = useState(
    isEnrollment ? "Loading face registration…" : "Loading face scan…",
  );
  const [quality, setQuality] = useState(0);
  const [scanReady, setScanReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let active = true;
    let detecting = false;
    let animationFrame = 0;
    let stableEmbeddings: number[][] = [];
    let lastSampleAt = 0;
    let completing = false;

    const stop = () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const resetScan = () => {
      stableEmbeddings = [];
      lastSampleAt = 0;
      setScanReady(false);
    };

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
          throw new Error("Camera verification requires HTTPS (or localhost) and camera support.");
        }
        lockPortraitOrientation();
        setMessage("Loading face detection models…");
        const human = await loadHuman();
        if (!active) return;
        setMessage("Requesting camera access…");
        // WebView getUserMedia only — never Capacitor Camera.*Permissions (Samsung crash).
        await requestNativeCameraPermission().catch(() => undefined);
        if (!active) return;
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "user" } },
          });
        } catch (firstError) {
          const denied =
            firstError instanceof DOMException &&
            (firstError.name === "NotAllowedError" || firstError.name === "PermissionDeniedError");
          if (denied) throw new Error(blockedPermissionHint("camera"));
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { facingMode: "user" },
            });
          } catch (fallbackError) {
            const name = fallbackError instanceof DOMException ? fallbackError.name : "";
            if (name === "NotAllowedError" || name === "PermissionDeniedError") {
              throw new Error(blockedPermissionHint("camera"));
            }
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: true,
              });
            } catch (lastError) {
              const lastName = lastError instanceof DOMException ? lastError.name : "";
              if (lastName === "NotAllowedError" || lastName === "PermissionDeniedError") {
                throw new Error(blockedPermissionHint("camera"));
              }
              throw lastError instanceof Error ? lastError : new Error("Camera could not start.");
            }
          }
        }
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        applyWidestCameraView(stream);
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview could not be opened.");
        video.srcObject = stream;
        await video.play();
        setPhase("camera");
        setMessage("Look at the camera.");

        const detect = async () => {
          if (!active) return;
          if (detecting || completing || video.readyState < 2) {
            animationFrame = requestAnimationFrame(detect);
            return;
          }
          detecting = true;
          try {
            const result = await human.detect(video);
            if (!active) return;
            if (result.face.length !== 1) {
              resetScan();
              setQuality(0);
              setMessage(
                result.face.length > 1
                  ? "Only one person can be visible."
                  : "Move your face into the camera frame.",
              );
              return;
            }

            const face = result.face[0];
            const faceScore = Math.min(face.faceScore ?? face.score, face.boxScore ?? face.score);
            const live = face.live ?? 0;
            const real = face.real ?? 0;
            const largeEnough = Math.min(...face.size) >= MIN_FACE_SIZE;
            const hasDescriptor = Boolean(face.embedding && face.embedding.length >= 128);
            const qualityOk =
              largeEnough &&
              faceScore >= session.settings.minFaceConfidence &&
              real >= session.settings.minAntiSpoofScore &&
              live >= session.settings.minLivenessScore &&
              hasDescriptor;

            setQuality(
              Math.round(
                Math.min(1, faceScore) * 30 +
                  Math.min(1, live) * 25 +
                  Math.min(1, real) * 25 +
                  (largeEnough ? 20 : 0),
              ),
            );

            if (!largeEnough) {
              resetScan();
              setMessage("Move a little closer to the camera.");
            } else if (faceScore < session.settings.minFaceConfidence) {
              resetScan();
              setMessage("Use brighter, even lighting on your face.");
            } else if (real < session.settings.minAntiSpoofScore) {
              resetScan();
              setMessage("A real face is required—photos and screens are not accepted.");
            } else if (live < session.settings.minLivenessScore) {
              resetScan();
              setMessage("Keep your face visible and look at the camera.");
            } else if (!hasDescriptor || !qualityOk) {
              resetScan();
              setMessage("Look at the camera.");
            } else {
              const now = performance.now();
              setScanReady(true);
              if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
                lastSampleAt = now;
                stableEmbeddings.push([...(face.embedding ?? [])]);
                stableEmbeddings = stableEmbeddings.slice(-SCAN_SAMPLES);
              }
              setMessage(
                stableEmbeddings.length >= SCAN_SAMPLES
                  ? "Scanning…"
                  : "Hold still…",
              );

              if (stableEmbeddings.length >= SCAN_SAMPLES && face.embedding) {
                completing = true;
                setPhase("verifying");
                setMessage(isEnrollment ? "Saving your face…" : "Matching your face…");
                const averaged = averageDescriptor(stableEmbeddings);
                const frame = snapshotFromVideo(video);
                stop();
                await completeRef.current({
                  sessionId: session.sessionId,
                  nonce: session.nonce,
                  descriptor: averaged,
                  descriptorSamples: stableEmbeddings,
                  imageData: frame,
                  faceConfidence: faceScore,
                  livenessScore: live,
                  antiSpoofScore: real,
                  challengeCompleted: true,
                });
                setPhase("done");
                setMessage(isEnrollment ? "Face registration complete." : "Face scan complete.");
              }
            }
          } catch (caught) {
            if (!active) return;
            const text = caught instanceof Error ? caught.message : "Face detection failed.";
            setError(text);
            setPhase("error");
            stop();
          } finally {
            detecting = false;
            if (active) animationFrame = requestAnimationFrame(detect);
          }
        };
        animationFrame = requestAnimationFrame(detect);
      } catch (caught) {
        const text =
          caught instanceof DOMException && caught.name === "NotAllowedError"
            ? blockedPermissionHint("camera")
            : caught instanceof Error
              ? caught.message
              : "The camera could not be opened.";
        setError(text);
        setPhase("error");
        stop();
      }
    }

    void start();
    return stop;
  }, [session, isEnrollment]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-xl bg-foreground shadow-inner">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Live camera preview for face scan"
          className="h-full w-full origin-center scale-x-[-1] object-contain object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_42%_40%_at_50%_42%,transparent_96%,rgb(0_0_0_/_0.55)_100%)]" />
        <div
          className={`pointer-events-none absolute left-1/2 top-[42%] h-[46%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 transition-colors ${
            scanReady ? "border-primary" : "border-background/75"
          }`}
        />
        {onCancel && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-3 top-3 rounded-full bg-background/90"
            onClick={onCancel}
            aria-label="Close face scan"
          >
            <X className="size-4" />
          </Button>
        )}
        <div className="absolute inset-x-3 bottom-3 rounded-xl bg-foreground/80 p-3 text-background backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {phase === "loading" || phase === "verifying" ? (
              <LoaderCircle className="size-4 animate-spin text-primary" />
            ) : phase === "done" ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <ScanFace className="size-4 text-primary" />
            )}
            {message}
          </div>
          <Progress value={quality} className="mt-2 h-1.5 bg-background/20" />
        </div>
      </div>

      <p className="mx-auto mt-3 max-w-md text-center text-sm text-muted-foreground">
        Look at the camera. Capture happens automatically.
      </p>

      {phase === "error" && (
        <div className="mx-auto mt-4 w-full max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
