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

type EnrollmentDirection = "CENTER" | "LEFT" | "RIGHT";

const enrollmentStepCopy: Record<
  EnrollmentDirection,
  { title: string; hint: string; gesture: string }
> = {
  CENTER: {
    title: "Look straight ahead",
    hint: "Centre your face and hold still for the registration photo.",
    gesture: "facing center",
  },
  LEFT: {
    title: "Turn left",
    hint: "Turn your head slowly to your left and hold.",
    gesture: "facing left",
  },
  RIGHT: {
    title: "Turn right",
    hint: "Turn your head slowly to your right and hold.",
    gesture: "facing right",
  },
};

function snapshotFromVideo(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 720 / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera capture is unavailable.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.86);
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
    isEnrollment ? "Loading face registration…" : "Loading secure face verification…",
  );
  const [quality, setQuality] = useState(0);
  const [challengeDone, setChallengeDone] = useState(false);
  const [enrollmentStep, setEnrollmentStep] = useState<EnrollmentDirection>("CENTER");
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
    let enrollmentIndex = 0;
    const enrollmentOrder: EnrollmentDirection[] = ["CENTER", "LEFT", "RIGHT"];
    const enrollmentViews: Array<{
      direction: EnrollmentDirection;
      imageData: string;
      descriptor: number[];
    }> = [];

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
        setMessage(
          isEnrollment
            ? enrollmentStepCopy.CENTER.hint
            : "Centre your face inside the oval.",
        );

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

            const faceScore = Math.min(face.faceScore ?? face.score, face.boxScore ?? face.score);
            const live = face.live ?? 0;
            const real = face.real ?? 0;
            const largeEnough = Math.min(...face.size) >= 180;
            const hasDescriptor = Boolean(face.embedding && face.embedding.length >= 128);

            if (isEnrollment) {
              const step = enrollmentOrder[enrollmentIndex] ?? "CENTER";
              setEnrollmentStep(step);
              const stepMeta = enrollmentStepCopy[step];
              const facingStep = gestures.includes(stepMeta.gesture);
              const scoreProgress = Math.round(
                Math.min(1, faceScore) * 25 +
                  Math.min(1, live) * 25 +
                  Math.min(1, real) * 25 +
                  (largeEnough ? 15 : 0) +
                  (facingStep ? 10 : 0),
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
              } else if (!facingStep) {
                stableFrames = 0;
                stableEmbeddings = [];
                setMessage(stepMeta.hint);
              } else if (!hasDescriptor) {
                stableFrames = 0;
                stableEmbeddings = [];
                setMessage("Hold still while this angle is captured…");
              } else {
                const sampleTime = performance.now();
                if (sampleTime - lastSampleAt >= 140) {
                  lastSampleAt = sampleTime;
                  stableEmbeddings.push([...(face.embedding ?? [])]);
                  stableEmbeddings = stableEmbeddings.slice(-3);
                  stableFrames = stableEmbeddings.length;
                }
                setMessage(
                  `${stepMeta.title}: capturing ${Math.min(stableFrames, 3)}/3… (${enrollmentIndex + 1}/3 angles)`,
                );
              }

              if (stableFrames >= 3 && stableEmbeddings.length === 3 && face.embedding) {
                const averaged = stableEmbeddings[0].map(
                  (_, index) =>
                    stableEmbeddings.reduce((sum, embedding) => sum + embedding[index], 0) /
                    stableEmbeddings.length,
                );
                enrollmentViews.push({
                  direction: step,
                  imageData: snapshotFromVideo(video),
                  descriptor: averaged,
                });
                stableFrames = 0;
                stableEmbeddings = [];
                lastSampleAt = 0;
                enrollmentIndex += 1;
                setChallengeDone(enrollmentIndex >= enrollmentOrder.length);
                if (enrollmentIndex < enrollmentOrder.length) {
                  const next = enrollmentOrder[enrollmentIndex];
                  setEnrollmentStep(next);
                  setMessage(enrollmentStepCopy[next].hint);
                } else {
                  setPhase("verifying");
                  setMessage("Saving your registration photos securely…");
                  const center = enrollmentViews.find((view) => view.direction === "CENTER");
                  if (!center) throw new Error("Centre enrollment photo is required.");
                  stop();
                  await completeRef.current({
                    sessionId: session.sessionId,
                    nonce: session.nonce,
                    descriptor: center.descriptor,
                    descriptorSamples: enrollmentViews.map((view) => view.descriptor),
                    imageData: center.imageData,
                    enrollmentViews,
                    faceConfidence: faceScore,
                    livenessScore: live,
                    antiSpoofScore: real,
                    challengeCompleted: true,
                  });
                  setPhase("done");
                  setMessage("Face registration complete.");
                }
              }
              return;
            }

            // Attendance verify: live match only — no photo is captured or stored.
            if (
              (session.challenge === "BLINK" &&
                gestures.some((gesture) => gesture.startsWith("blink "))) ||
              (session.challenge === "TURN_LEFT" && gestures.includes("facing left")) ||
              (session.challenge === "TURN_RIGHT" && gestures.includes("facing right"))
            ) {
              if (centreObserved) {
                challengeObserved = true;
                setChallengeDone(true);
              }
            }

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
              setMessage("Hold still while your face is verified…");
            } else {
              const sampleTime = performance.now();
              if (sampleTime - lastSampleAt >= 120) {
                lastSampleAt = sampleTime;
                stableEmbeddings.push([...(face.embedding ?? [])]);
                stableEmbeddings = stableEmbeddings.slice(-5);
                stableFrames = stableEmbeddings.length;
              }
              setMessage(`Verifying live match ${Math.min(stableFrames, 5)}/5…`);
            }

            if (stableFrames >= 5 && stableEmbeddings.length === 5 && face.embedding) {
              setPhase("verifying");
              setMessage("Matching your face securely…");
              const averagedDescriptor = stableEmbeddings[0].map(
                (_, index) =>
                  stableEmbeddings.reduce((sum, embedding) => sum + embedding[index], 0) /
                  stableEmbeddings.length,
              );
              stop();
              await completeRef.current({
                sessionId: session.sessionId,
                nonce: session.nonce,
                descriptor: averagedDescriptor,
                descriptorSamples: stableEmbeddings,
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
  }, [session, isEnrollment]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-xl bg-foreground shadow-inner sm:aspect-square">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Live camera preview for face verification"
          className="h-full w-full scale-x-[-1] object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_36%_46%_at_50%_44%,transparent_96%,rgb(0_0_0_/_0.72)_100%)]" />
        <div
          className={`pointer-events-none absolute left-1/2 top-[44%] h-[58%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 transition-colors ${
            challengeDone ? "border-primary" : "border-background/75"
          }`}
        />
        {onCancel && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-3 top-3 rounded-full bg-background/90"
            onClick={onCancel}
            aria-label="Close face verification"
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

      <div className="mx-auto mt-4 grid w-full max-w-md gap-2 sm:grid-cols-2">
        <div
          className={`rounded-xl border p-3 ${
            challengeDone
              ? "border-primary/30 bg-primary/10 text-foreground"
              : "border-border/80 bg-muted/50 text-foreground"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="size-4 text-primary" />
            {isEnrollment
              ? enrollmentStepCopy[enrollmentStep].title
              : challengeCopy[session.challenge].title}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isEnrollment
              ? enrollmentStepCopy[enrollmentStep].hint
              : challengeCopy[session.challenge].hint}
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-foreground">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" />
            {isEnrollment ? "Photos saved once" : "No photo stored"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isEnrollment
              ? "Centre, left, and right registration photos are encrypted for matching."
              : "Check-in only verifies your live face. No new photo is saved."}
          </p>
        </div>
      </div>

      {phase === "error" && (
        <div className="mx-auto mt-4 w-full max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
