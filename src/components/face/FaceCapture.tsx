import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, LoaderCircle, ScanFace, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { FaceCapturePayload, FaceChallenge, FaceVerificationSession } from "@/types/domain";

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
        warmup: "full",
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
            minSize: 160,
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
        gesture: { enabled: true },
      });
      await human.load();
      await human.warmup();
      return human;
    });
  }
  return humanPromise;
}

// Shared by the attendance dialog so model loading can begin before the camera opens.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadFaceRecognition() {
  await loadHuman();
}

const challengeCopy: Record<FaceChallenge, { title: string; hint: string }> = {
  BLINK: { title: "Blink naturally", hint: "Blink once, then look straight at the camera." },
  TURN_LEFT: {
    title: "Turn your head left",
    hint: "Turn slowly to your left, then return to the centre.",
  },
  TURN_RIGHT: {
    title: "Turn your head right",
    hint: "Turn slowly to your right, then return to the centre.",
  },
};

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
  const [phase, setPhase] = useState<"loading" | "camera" | "verifying" | "done" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("Loading secure face verification…");
  const [quality, setQuality] = useState(0);
  const [challengeDone, setChallengeDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let active = true;
    let detecting = false;
    let animationFrame = 0;
    let challengeObserved = false;
    let centreObserved = false;
    let stableFrames = 0;
    let stableEmbeddings: number[][] = [];
    let lastSampleAt = 0;

    const stop = () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
          throw new Error("Camera verification requires HTTPS (or localhost) and camera support.");
        }
        setMessage("Loading face detection models…");
        const human = await loadHuman();
        if (!active) return;
        setMessage("Requesting camera access…");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 640 },
          },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview could not be opened.");
        video.srcObject = stream;
        await video.play();
        setPhase("camera");
        setMessage("Centre your face inside the oval.");

        const detect = async () => {
          if (!active) return;
          if (detecting || video.readyState < 2) {
            animationFrame = requestAnimationFrame(detect);
            return;
          }
          detecting = true;
          try {
            const result = await human.detect(video);
            if (!active) return;
            if (result.face.length !== 1) {
              stableFrames = 0;
              stableEmbeddings = [];
              setQuality(0);
              setMessage(
                result.face.length > 1
                  ? "Only one person can be visible."
                  : "Move your face into the camera frame.",
              );
              return;
            }

            const face = result.face[0];
            const gestures = result.gesture
              .filter((gesture) => "face" in gesture && gesture.face === 0)
              .map((gesture) => gesture.gesture);
            const facingCentre = gestures.includes("facing center");
            if (facingCentre) centreObserved = true;
            if (centreObserved) {
              if (
                (session.challenge === "BLINK" &&
                  gestures.some((gesture) => gesture.startsWith("blink "))) ||
                (session.challenge === "TURN_LEFT" && gestures.includes("facing left")) ||
                (session.challenge === "TURN_RIGHT" && gestures.includes("facing right"))
              ) {
                challengeObserved = true;
                setChallengeDone(true);
              }
            }

            const faceScore = Math.min(face.faceScore ?? face.score, face.boxScore ?? face.score);
            const live = face.live ?? 0;
            const real = face.real ?? 0;
            const largeEnough = Math.min(...face.size) >= 180;
            const hasDescriptor = Boolean(face.embedding && face.embedding.length >= 128);
            const scoreProgress = Math.round(
              Math.min(1, faceScore) * 25 +
                Math.min(1, live) * 25 +
                Math.min(1, real) * 25 +
                (largeEnough ? 15 : 0) +
                (challengeObserved ? 10 : 0),
            );
            setQuality(scoreProgress);

            if (!largeEnough) {
              stableFrames = 0;
              stableEmbeddings = [];
              setMessage("Move a little closer to the camera.");
            } else if (faceScore < session.settings.minFaceConfidence) {
              stableFrames = 0;
              stableEmbeddings = [];
              setMessage("Use brighter, even lighting on your face.");
            } else if (real < session.settings.minAntiSpoofScore) {
              stableFrames = 0;
              stableEmbeddings = [];
              setMessage("A real face is required—photos and screens are not accepted.");
            } else if (live < session.settings.minLivenessScore) {
              stableFrames = 0;
              stableEmbeddings = [];
              setMessage("Keep your face visible and follow the movement prompt.");
            } else if (!challengeObserved) {
              stableFrames = 0;
              stableEmbeddings = [];
              setMessage(challengeCopy[session.challenge].hint);
            } else if (!facingCentre) {
              stableFrames = 0;
              stableEmbeddings = [];
              setMessage("Great. Now look straight at the camera.");
            } else if (!hasDescriptor) {
              stableFrames = 0;
              stableEmbeddings = [];
              setMessage("Hold still while your face template is prepared.");
            } else {
              const sampleTime = performance.now();
              if (sampleTime - lastSampleAt >= 120) {
                lastSampleAt = sampleTime;
                stableEmbeddings.push([...(face.embedding ?? [])]);
                stableEmbeddings = stableEmbeddings.slice(-5);
                stableFrames = stableEmbeddings.length;
              }
              setMessage(`Building accurate face match ${Math.min(stableFrames, 5)}/5…`);
            }

            if (stableFrames >= 5 && stableEmbeddings.length === 5 && face.embedding) {
              setPhase("verifying");
              setMessage("Matching your face securely…");
              const averagedDescriptor = stableEmbeddings[0].map(
                (_, index) =>
                  stableEmbeddings.reduce((sum, embedding) => sum + embedding[index], 0) /
                  stableEmbeddings.length,
              );
              const canvas = document.createElement("canvas");
              const scale = Math.min(1, 720 / video.videoWidth);
              canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
              canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Camera capture is unavailable.");
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              stop();
              await completeRef.current({
                sessionId: session.sessionId,
                nonce: session.nonce,
                descriptor: averagedDescriptor,
                descriptorSamples: stableEmbeddings,
                imageData: canvas.toDataURL("image/jpeg", 0.86),
                faceConfidence: faceScore,
                livenessScore: live,
                antiSpoofScore: real,
                challengeCompleted: true,
              });
              setPhase("done");
              setMessage("Face verification complete.");
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
            ? "Camera permission was denied. Allow camera access in your browser and try again."
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
  }, [session]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[1.75rem] bg-slate-950 shadow-inner sm:aspect-square">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Live camera preview for face verification"
          className="h-full w-full scale-x-[-1] object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_36%_46%_at_50%_44%,transparent_96%,rgba(2,6,23,.72)_100%)]" />
        <div
          className={`pointer-events-none absolute left-1/2 top-[44%] h-[58%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 transition-colors ${
            challengeDone ? "border-emerald-400" : "border-white/75"
          }`}
        />
        {onCancel && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-3 top-3 rounded-full bg-white/90"
            onClick={onCancel}
            aria-label="Close face verification"
          >
            <X className="size-4" />
          </Button>
        )}
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-slate-950/75 p-3 text-white backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {phase === "loading" || phase === "verifying" ? (
              <LoaderCircle className="size-4 animate-spin text-sky-300" />
            ) : phase === "done" ? (
              <CheckCircle2 className="size-4 text-emerald-300" />
            ) : (
              <ScanFace className="size-4 text-sky-300" />
            )}
            {message}
          </div>
          <Progress value={quality} className="mt-2 h-1.5 bg-white/20" />
        </div>
      </div>

      <div className="mx-auto mt-4 grid w-full max-w-md gap-2 sm:grid-cols-2">
        <div
          className={`rounded-xl border p-3 ${
            challengeDone
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-sky-200 bg-sky-50 text-sky-950"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="size-4" />
            {challengeCopy[session.challenge].title}
          </div>
          <p className="mt-1 text-xs opacity-80">{challengeCopy[session.challenge].hint}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-emerald-600" />
            Private and protected
          </div>
          <p className="mt-1 text-xs">
            Spectacles are supported. Reduce screen glare if it covers your eyes.
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-auto mt-4 w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          {onCancel && (
            <Button type="button" variant="outline" className="mt-3 w-full" onClick={onCancel}>
              Close and try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
