import {
  FaceEnrollmentStatus,
  FaceVerificationOutcome,
  FaceVerificationPurpose,
  Role,
} from "@prisma/client";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { decryptEmployeeField, encryptEmployeeField } from "./employeePrivateData.js";
import { HttpError } from "./errors.js";
import { analyzeFaceFrame, isFaceServerInferenceEnabled } from "./faceInference.js";
import { prisma } from "./prisma.js";

const FACE_SETTING_KEY = "face_attendance_settings";
const FACE_CONSENT_VERSION = "2026-07";
/** One automatic face scan — no blink or pose challenges. */
const CHALLENGES = ["FACE"] as const;
const MAX_RETAINED_IMAGES_PER_USER = 2;

export const faceSettingsSchema = z.object({
  verificationEnabled: z.boolean().default(true),
  registrationApprovalMode: z.enum(["MANUAL", "AUTOMATIC"]).default("MANUAL"),
  retentionDays: z.number().int().min(1).max(30).default(5),
  matchThreshold: z.number().min(0.4).max(0.9).default(0.5),
  minFaceConfidence: z.number().min(0.4).max(1).default(0.6),
  minLivenessScore: z.number().min(0.4).max(1).default(0.6),
  minAntiSpoofScore: z.number().min(0.4).max(1).default(0.6),
  maxGpsAccuracyMeters: z.number().int().min(10).max(2000).default(200),
  sessionTtlSeconds: z.number().int().min(30).max(300).default(120),
});

export type FaceSettings = z.infer<typeof faceSettingsSchema>;

export const faceSessionSchema = z.object({
  purpose: z.nativeEnum(FaceVerificationPurpose),
  deviceId: z.string().trim().min(3).max(200).optional(),
});

const faceDescriptorSchema = z.array(z.number().finite().min(-10).max(10)).min(128).max(2048);

export const faceCaptureObjectSchema = z.object({
  sessionId: z.string().min(10).max(191),
  nonce: z.string().min(32).max(200),
  descriptor: faceDescriptorSchema,
  descriptorSamples: z.array(faceDescriptorSchema).min(2).max(9).optional(),
  imageData: z
    .string()
    .max(950_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "A JPEG camera image is required")
    .optional(),
  enrollmentViews: z
    .array(
      z.object({
        direction: z.enum(["FRONT", "EYES_OPEN", "EYES_CLOSED"]),
        imageData: z
          .string()
          .max(950_000)
          .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "A JPEG camera image is required"),
        descriptor: faceDescriptorSchema,
      }),
    )
    .min(1)
    .max(2)
    .optional(),
  faceConfidence: z.number().min(0).max(1),
  livenessScore: z.number().min(0).max(1),
  antiSpoofScore: z.number().min(0).max(1),
  challengeCompleted: z.boolean(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationAccuracy: z.number().min(0).max(10_000).optional(),
  consentAccepted: z.boolean().optional(),
  consentVersion: z.string().max(40).optional(),
});

export const faceCaptureSchema = faceCaptureObjectSchema.superRefine((value, ctx) => {
  // Enrollment stores one front photo. Attendance verify analyses a frame and discards it.
  if (value.enrollmentViews?.length && !value.imageData) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["imageData"],
      message: "Enrollment requires a front face photo",
    });
  }
});

export type FaceCaptureInput = z.infer<typeof faceCaptureObjectSchema>;

const defaultSettings: FaceSettings = faceSettingsSchema.parse({});

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function evidenceEncryptionKey() {
  return createHash("sha256").update(config.employeeDataEncryptionKey, "utf8").digest();
}

function evidenceRoot() {
  return path.resolve(config.faceEvidenceDir);
}

function evidencePath(imageKey: string) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}[/\\][A-Za-z0-9-]+\.bin$/.test(imageKey)) {
    throw new HttpError(400, "Invalid evidence image key");
  }
  const resolved = path.resolve(evidenceRoot(), imageKey);
  const relative = path.relative(evidenceRoot(), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "Invalid evidence image path");
  }
  return resolved;
}

async function saveEncryptedEvidence(imageData: string, evidenceId: string, capturedAt: Date) {
  const encoded = imageData.slice("data:image/jpeg;base64,".length);
  const source = Buffer.from(encoded, "base64");
  if (source.length < 1_000 || source.length > 700_000) {
    throw new HttpError(422, "Camera image size is invalid");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", evidenceEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(source), cipher.final()]);
  const tag = cipher.getAuthTag();
  const folder = capturedAt.toISOString().slice(0, 10);
  const imageKey = `${folder}/${evidenceId}.bin`;
  const target = evidencePath(imageKey);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, Buffer.concat([iv, tag, encrypted]), { mode: 0o600 });
  return imageKey;
}

export async function readDecryptedEvidence(imageKey: string) {
  let encrypted: Buffer;
  try {
    encrypted = await readFile(evidencePath(imageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new HttpError(404, "Evidence image is unavailable");
    }
    throw error;
  }
  if (encrypted.length < 29) throw new HttpError(404, "Evidence image is unavailable");
  const iv = encrypted.subarray(0, 12);
  const tag = encrypted.subarray(12, 28);
  const payload = encrypted.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", evidenceEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

export async function removeFaceEvidenceFiles(imageKeys: Array<string | null | undefined>) {
  for (const imageKey of imageKeys) {
    if (!imageKey) continue;
    try {
      await unlink(evidencePath(imageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function descriptorSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 64) return 0;
  let squaredDifference = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    squaredDifference += difference * difference;
  }
  const distance = Math.round(100 * 25 * squaredDifference) / 100;
  if (distance === 0) return 1;
  const normalized = (1 - Math.sqrt(distance) / 100 - 0.2) / 0.6;
  return Math.round(100 * Math.max(0, Math.min(1, normalized))) / 100;
}

export function descriptorSetSimilarity(registered: number[][], captured: number[][]) {
  const scores = captured
    .map((capturedDescriptor) =>
      Math.max(
        0,
        ...registered.map((registeredDescriptor) =>
          descriptorSimilarity(registeredDescriptor, capturedDescriptor),
        ),
      ),
    )
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
  if (!scores.length) return 0;
  const strongest = scores.slice(0, Math.min(3, scores.length));
  return (
    Math.round((strongest.reduce((total, score) => total + score, 0) / strongest.length) * 100) /
    100
  );
}

function capturedDescriptors(capture: FaceCaptureInput) {
  return capture.descriptorSamples?.length
    ? [capture.descriptor, ...capture.descriptorSamples]
    : [capture.descriptor];
}

/**
 * Rejects a sample set that is all the same floating-point vector. Five copies
 * of one descriptor score identically to five live frames under
 * descriptorSetSimilarity, so a forged POST that repeats a single array would
 * otherwise pass. Real captures always show small inter-frame jitter.
 */
export function descriptorsHaveTemporalVariance(descriptors: number[][]) {
  if (descriptors.length < 2) return true;
  let maxDistance = 0;
  for (let i = 0; i < descriptors.length; i += 1) {
    for (let j = i + 1; j < descriptors.length; j += 1) {
      const left = descriptors[i];
      const right = descriptors[j];
      if (left.length !== right.length) return false;
      let squared = 0;
      for (let k = 0; k < left.length; k += 1) {
        const difference = left[k] - right[k];
        squared += difference * difference;
      }
      maxDistance = Math.max(maxDistance, Math.sqrt(squared));
    }
  }
  // Empirically, identical copies are ~0; live frames of the same person sit
  // well above this floor. Keep the threshold low so we only reject clones.
  return maxDistance > 0.001;
}

export async function readFaceSettings(): Promise<FaceSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: FACE_SETTING_KEY } });
  if (!row) return defaultSettings;
  try {
    const stored = JSON.parse(row.value) as Record<string, unknown>;
    // Settings saved before the v2 multi-sample matcher used an overly strict recommended
    // threshold. Migrate that one legacy default in memory until the admin next saves policy.
    if (stored.verificationEnabled === undefined) {
      stored.matchThreshold = Math.min(Number(stored.matchThreshold ?? 0.5), 0.5);
    }
    return faceSettingsSchema.parse(stored);
  } catch {
    return defaultSettings;
  }
}

export async function saveFaceSettings(value: unknown, updatedById: string) {
  const settings = faceSettingsSchema.parse(value);
  await prisma.systemSetting.upsert({
    where: { key: FACE_SETTING_KEY },
    create: { key: FACE_SETTING_KEY, value: JSON.stringify(settings), updatedById },
    update: { value: JSON.stringify(settings), updatedById },
  });
  const activeEvidence = await prisma.faceEvidence.findMany({
    where: { deletedAt: null },
    select: { evidenceId: true, capturedAt: true },
  });
  for (let index = 0; index < activeEvidence.length; index += 100) {
    await prisma.$transaction(
      activeEvidence.slice(index, index + 100).map((evidence) =>
        prisma.faceEvidence.update({
          where: { evidenceId: evidence.evidenceId },
          data: {
            expiresAt: new Date(
              evidence.capturedAt.getTime() + settings.retentionDays * 86_400_000,
            ),
          },
        }),
      ),
    );
  }
  await cleanupExpiredFaceEvidence();
  invalidateFaceStatusCache();
  return settings;
}

export async function createFaceVerificationSession(
  userId: string,
  input: z.infer<typeof faceSessionSchema>,
) {
  const settings = await readFaceSettings();
  const nonce = randomBytes(32).toString("base64url");
  const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
  const expiresAt = new Date(Date.now() + settings.sessionTtlSeconds * 1000);
  const session = await prisma.faceVerificationSession.create({
    data: {
      userId,
      purpose: input.purpose,
      challenge,
      nonceHash: sha256(nonce),
      deviceId: input.deviceId,
      expiresAt,
    },
  });
  return {
    sessionId: session.sessionId,
    nonce,
    challenge,
    purpose: input.purpose,
    expiresAt: expiresAt.toISOString(),
    settings: {
      minFaceConfidence: settings.minFaceConfidence,
      minLivenessScore: settings.minLivenessScore,
      minAntiSpoofScore: settings.minAntiSpoofScore,
      maxGpsAccuracyMeters: settings.maxGpsAccuracyMeters,
    },
  };
}

const storedFaceTemplateSchema = z.union([
  faceDescriptorSchema,
  z.object({
    version: z.literal(2),
    centroid: faceDescriptorSchema,
    samples: z.array(faceDescriptorSchema).min(1).max(12),
  }),
]);

async function approvedDescriptorsForUser(userId: string) {
  const profile = await prisma.faceProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== FaceEnrollmentStatus.APPROVED) {
    throw new HttpError(403, "Approved face registration is required");
  }
  const decrypted = decryptEmployeeField(profile.descriptorEncrypted);
  if (!decrypted) throw new HttpError(500, "The registered face template cannot be read");
  try {
    const stored = storedFaceTemplateSchema.parse(JSON.parse(decrypted));
    return Array.isArray(stored) ? [stored] : [stored.centroid, ...stored.samples];
  } catch {
    throw new HttpError(500, "The registered face template is invalid");
  }
}

async function duplicateEnrollmentSimilarity(userId: string, descriptors: number[][]) {
  // Pending and rejected profiles count too: two colleagues enrolling the same
  // face in one review window used to both pass, and a rejected face could be
  // re-enrolled on another account with no signal.
  const profiles = await prisma.faceProfile.findMany({
    where: { userId: { not: userId } },
    select: { descriptorEncrypted: true },
  });
  let best = 0;
  for (const profile of profiles) {
    const value = decryptEmployeeField(profile.descriptorEncrypted);
    if (!value) continue;
    try {
      const stored = storedFaceTemplateSchema.parse(JSON.parse(value));
      const registered = Array.isArray(stored) ? [stored] : [stored.centroid, ...stored.samples];
      best = Math.max(best, descriptorSetSimilarity(registered, descriptors));
    } catch {
      // An unreadable historical template is skipped and remains visible to database audits.
    }
  }
  return best;
}

async function enforceEvidenceImageLimit(userId: string) {
  const overflow = await prisma.faceEvidence.findMany({
    where: { userId, imageKey: { not: null }, deletedAt: null },
    orderBy: [{ capturedAt: "desc" }, { evidenceId: "desc" }],
    skip: MAX_RETAINED_IMAGES_PER_USER,
    select: { evidenceId: true, imageKey: true },
  });
  for (const row of overflow) {
    await removeFaceEvidenceFiles([row.imageKey]);
    await prisma.faceEvidence.update({
      where: { evidenceId: row.evidenceId },
      data: {
        imageKey: null,
        deletedAt: new Date(),
      },
    });
  }
  return overflow.length;
}

export async function verifyFaceCapture(input: {
  userId: string;
  employeeId?: string | null;
  expectedPurpose: FaceVerificationPurpose;
  capture: FaceCaptureInput;
}) {
  const { capture } = input;
  const settings = await readFaceSettings();
  const session = await prisma.faceVerificationSession.findUnique({
    where: { sessionId: capture.sessionId },
  });
  if (
    !session ||
    session.userId !== input.userId ||
    session.purpose !== input.expectedPurpose ||
    session.nonceHash !== sha256(capture.nonce)
  ) {
    throw new HttpError(403, "Invalid face verification session");
  }
  if (session.usedAt) throw new HttpError(409, "This face verification session was already used");
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.faceVerificationSession.update({
      where: { sessionId: session.sessionId },
      data: { usedAt: new Date() },
    });
    throw new HttpError(410, "Face verification expired. Please try again.");
  }

  const consumed = await prisma.faceVerificationSession.updateMany({
    where: { sessionId: session.sessionId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) throw new HttpError(409, "Face verification was already submitted");

  const capturedAt = new Date();
  const expiresAt = new Date(capturedAt.getTime() + settings.retentionDays * 86_400_000);
  const evidenceId = randomUUID();
  let imageKey: string | null = null;
  let failureReason: string | null = null;
  let similarityScore: number | null = null;

  const isAttendance =
    input.expectedPurpose === FaceVerificationPurpose.ATTENDANCE_CHECK_IN ||
    input.expectedPurpose === FaceVerificationPurpose.ATTENDANCE_CHECK_OUT;
  const isEnrollment = input.expectedPurpose === FaceVerificationPurpose.ENROLLMENT;

  // Recompute every decision input from the submitted frame. The client's own
  // scores are advisory and a forged POST can claim anything; `serverAnalysed`
  // records which regime produced the numbers stored on the evidence row.
  let scores = {
    faceConfidence: capture.faceConfidence,
    livenessScore: capture.livenessScore,
    antiSpoofScore: capture.antiSpoofScore,
  };
  let matchDescriptors = capturedDescriptors(capture);
  let serverAnalysed = false;

  if (isFaceServerInferenceEnabled()) {
    if (!capture.imageData) {
      failureReason = "A camera photo is required for face verification.";
    } else {
      try {
        const analysis = await analyzeFaceFrame(capture.imageData);
        scores = {
          faceConfidence: analysis.faceConfidence,
          livenessScore: analysis.livenessScore,
          antiSpoofScore: analysis.antiSpoofScore,
        };
        // The descriptor the client sent is ignored entirely for matching.
        matchDescriptors = [analysis.descriptor];
        // Enrollment stores a template, so every photo the admin will review has
        // to contribute the descriptor we derived from it — otherwise the
        // approved template is still whatever the client chose to send.
        if (isEnrollment && capture.enrollmentViews) {
          for (const view of capture.enrollmentViews) {
            if (view.imageData === capture.imageData) continue;
            const viewAnalysis = await analyzeFaceFrame(view.imageData);
            matchDescriptors.push(viewAnalysis.descriptor);
            scores.faceConfidence = Math.min(scores.faceConfidence, viewAnalysis.faceConfidence);
            scores.antiSpoofScore = Math.min(scores.antiSpoofScore, viewAnalysis.antiSpoofScore);
          }
        }
        serverAnalysed = true;
      } catch (error) {
        failureReason =
          error instanceof HttpError
            ? error.message
            : "Face verification could not be completed. Please try again.";
        if (!(error instanceof HttpError)) {
          console.error("Server-side face inference failed", error);
        }
      }
    }
  }

  // Registration keeps one front photo. Daily verify stores none.
  if (!failureReason && isEnrollment) {
    if (!capture.imageData) {
      failureReason = "Enrollment requires a front face photo.";
    } else {
      try {
        imageKey = await saveEncryptedEvidence(capture.imageData, evidenceId, capturedAt);
      } catch (error) {
        failureReason =
          error instanceof Error ? error.message : "Evidence image could not be stored";
      }
    }
  }

  if (!failureReason && scores.faceConfidence < settings.minFaceConfidence) {
    failureReason = "Face confidence is too low. Use better lighting and try again.";
  }
  if (!failureReason && scores.livenessScore < settings.minLivenessScore) {
    failureReason = "Liveness verification failed. Please look directly at the camera.";
  }
  if (!failureReason && scores.antiSpoofScore < settings.minAntiSpoofScore) {
    failureReason = "A real face could not be confirmed. Photos and screens are not accepted.";
  }
  if (!failureReason && !capture.challengeCompleted) {
    failureReason = "Face scan was not completed. Look at the camera and try again.";
  }
  // Only meaningful for client-supplied sample sets; a server descriptor is a
  // single vector derived from a frame we decoded ourselves.
  if (!failureReason && !serverAnalysed && !descriptorsHaveTemporalVariance(matchDescriptors)) {
    failureReason = "The camera did not capture enough live movement. Hold still, then try again.";
  }

  if (!failureReason && isAttendance) {
    if (
      capture.latitude === undefined ||
      capture.longitude === undefined ||
      capture.locationAccuracy === undefined
    ) {
      failureReason =
        "Precise location is required for attendance. Approximate location is not enough.";
    } else if (capture.locationAccuracy > settings.maxGpsAccuracyMeters) {
      failureReason = `Precise location accuracy must be within ${settings.maxGpsAccuracyMeters} metres. Turn on Precise location and try again near a window or outdoors.`;
    } else {
      const registered = await approvedDescriptorsForUser(input.userId);
      similarityScore = descriptorSetSimilarity(registered, matchDescriptors);
      if (similarityScore < settings.matchThreshold) {
        failureReason =
          "Another face detected. Check-in was blocked because this face does not match the registered employee.";
      }
    }
  }

  if (!failureReason && isEnrollment) {
    if (!capture.consentAccepted || capture.consentVersion !== FACE_CONSENT_VERSION) {
      failureReason = "Biometric consent is required before face registration.";
    } else {
      const duplicateSimilarity = await duplicateEnrollmentSimilarity(
        input.userId,
        matchDescriptors,
      );
      if (duplicateSimilarity >= settings.matchThreshold) {
        similarityScore = duplicateSimilarity;
        failureReason = "This face is already registered to another account.";
      }
    }
  }

  const evidence = await prisma.faceEvidence.create({
    data: {
      evidenceId,
      userId: input.userId,
      employeeId: input.employeeId ?? null,
      sessionId: session.sessionId,
      purpose: input.expectedPurpose,
      outcome: failureReason ? FaceVerificationOutcome.FAILED : FaceVerificationOutcome.PASSED,
      imageKey,
      faceConfidence: scores.faceConfidence,
      livenessScore: scores.livenessScore,
      antiSpoofScore: scores.antiSpoofScore,
      similarityScore,
      latitude: capture.latitude,
      longitude: capture.longitude,
      locationAccuracy: capture.locationAccuracy,
      failureReason,
      capturedAt,
      expiresAt,
      // Attendance rows carry no image but do carry GPS. Leaving deletedAt null
      // keeps them inside the retention sweep, which clears the coordinates on
      // schedule; pre-setting it here made them immortal.
      deletedAt: null,
    },
  });

  if (!failureReason && isEnrollment && capture.enrollmentViews) {
    for (const view of capture.enrollmentViews) {
      if (view.direction === "EYES_OPEN" && view.imageData === capture.imageData) continue;
      const viewEvidenceId = randomUUID();
      try {
        const viewKey = await saveEncryptedEvidence(view.imageData, viewEvidenceId, capturedAt);
        await prisma.faceEvidence.create({
          data: {
            evidenceId: viewEvidenceId,
            userId: input.userId,
            employeeId: input.employeeId ?? null,
            sessionId: session.sessionId,
            purpose: FaceVerificationPurpose.ENROLLMENT,
            outcome: FaceVerificationOutcome.PASSED,
            imageKey: viewKey,
            faceConfidence: scores.faceConfidence,
            livenessScore: scores.livenessScore,
            antiSpoofScore: scores.antiSpoofScore,
            similarityScore: null,
            failureReason: null,
            capturedAt,
            expiresAt,
          },
        });
      } catch (error) {
        console.error(`Failed to store enrollment view ${view.direction}`, error);
      }
    }
  }

  if (isEnrollment) await enforceEvidenceImageLimit(input.userId);
  if (failureReason) throw new HttpError(422, failureReason);
  // serverDescriptors is null when inference is disabled, so callers can tell a
  // server-derived template from a client-supplied one.
  return { evidence, settings, serverDescriptors: serverAnalysed ? matchDescriptors : null };
}

export async function submitFaceEnrollment(input: {
  userId: string;
  employeeId?: string | null;
  role: Role;
  capture: FaceCaptureInput;
}) {
  if (input.role === Role.DEVELOPER_ADMIN) {
    throw new HttpError(403, "Developer Admin accounts do not use face authentication");
  }
  const settings = await readFaceSettings();
  if (!settings.verificationEnabled) {
    throw new HttpError(409, "Face verification is currently disabled by Developer Admin");
  }
  const existingProfile = await prisma.faceProfile.findUnique({
    where: { userId: input.userId },
    select: { status: true },
  });
  if (existingProfile?.status === FaceEnrollmentStatus.APPROVED) {
    throw new HttpError(409, "Approved face registration must be reset by Developer Admin");
  }
  const { serverDescriptors } = await verifyFaceCapture({
    userId: input.userId,
    employeeId: input.employeeId,
    expectedPurpose: FaceVerificationPurpose.ENROLLMENT,
    capture: input.capture,
  });
  const now = new Date();
  const autoApprove = settings.registrationApprovalMode === "AUTOMATIC";
  // Bind the stored template to the photos the admin reviews. Falling back to
  // the client's descriptors only happens when server inference is disabled.
  const templateDescriptors = serverDescriptors ?? [
    input.capture.descriptor,
    ...(input.capture.descriptorSamples ?? []),
    ...(input.capture.enrollmentViews?.map((view) => view.descriptor) ?? []),
  ];
  const template = {
    version: 2 as const,
    centroid: templateDescriptors[0],
    samples: templateDescriptors.slice(0, 12),
  };
  const profile = await prisma.faceProfile.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      descriptorEncrypted: encryptEmployeeField(JSON.stringify(template))!,
      status: autoApprove ? FaceEnrollmentStatus.APPROVED : FaceEnrollmentStatus.PENDING,
      consentVersion: FACE_CONSENT_VERSION,
      consentedAt: now,
      submittedAt: now,
      // Auto-approval had no human reviewer. Recording the enrolling user here
      // made the admin roster read as though someone had checked the photos.
      approvedByUserId: null,
      approvedAt: autoApprove ? now : null,
    },
    update: {
      descriptorEncrypted: encryptEmployeeField(JSON.stringify(template))!,
      status: autoApprove ? FaceEnrollmentStatus.APPROVED : FaceEnrollmentStatus.PENDING,
      consentVersion: FACE_CONSENT_VERSION,
      consentedAt: now,
      submittedAt: now,
      approvedByUserId: null,
      approvedAt: autoApprove ? now : null,
      rejectedAt: null,
      rejectionReason: null,
      disabledAt: null,
    },
  });
  invalidateFaceStatusCache(input.userId);
  return {
    status: profile.status,
    autoApproved: autoApprove,
    consentVersion: FACE_CONSENT_VERSION,
  };
}

const faceStatusCache = new Map<string, { approved: boolean; expiresAt: number }>();

export function invalidateFaceStatusCache(userId?: string) {
  if (userId) faceStatusCache.delete(userId);
  else faceStatusCache.clear();
}

export async function isFaceVerificationRequiredForUser(userId: string) {
  const settings = await readFaceSettings();
  if (!settings.verificationEnabled) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      employee: {
        select: {
          attendanceRequired: true,
          department: { select: { faceVerificationEnabled: true } },
        },
      },
    },
  });
  if (!user || user.role === Role.DEVELOPER_ADMIN) return false;
  // People excused from attendance/leave also skip face enrollment and punch camera.
  if (user.employee && user.employee.attendanceRequired === false) return false;
  if (!user.employee?.department) return true;
  return user.employee.department.faceVerificationEnabled;
}

export async function userHasApprovedFace(userId: string) {
  if (!(await isFaceVerificationRequiredForUser(userId))) return true;
  const cached = faceStatusCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.approved;
  const profile = await prisma.faceProfile.findUnique({
    where: { userId },
    select: { status: true },
  });
  const approved = profile?.status === FaceEnrollmentStatus.APPROVED;
  faceStatusCache.set(userId, { approved, expiresAt: Date.now() + 15_000 });
  return approved;
}

/** After auto-approval, the same punch may finish on GPS without a second camera pass. */
export const FACE_ENROLLMENT_PUNCH_GRACE_MS = 5 * 60 * 1000;

export function attendanceFaceDecision(
  profile: { status: FaceEnrollmentStatus; approvedAt: Date | null } | null,
  hasCapture: boolean,
  now = Date.now(),
): "register" | "allow-location" | "verify" {
  if (
    !profile ||
    profile.status === FaceEnrollmentStatus.REJECTED ||
    profile.status === FaceEnrollmentStatus.DISABLED
  ) {
    return "register";
  }
  if (profile.status === FaceEnrollmentStatus.PENDING) return "allow-location";
  if (profile.status !== FaceEnrollmentStatus.APPROVED) return "register";
  if (hasCapture) return "verify";
  if (
    profile.approvedAt &&
    now - profile.approvedAt.getTime() < FACE_ENROLLMENT_PUNCH_GRACE_MS
  ) {
    return "allow-location";
  }
  return "verify";
}

export async function verifyOrAllowAttendanceFace(input: {
  userId: string;
  employeeId: string;
  isCheckOut: boolean;
  capture?: FaceCaptureInput;
  latitude: number;
  longitude: number;
  locationAccuracy: number;
}) {
  if (!(await isFaceVerificationRequiredForUser(input.userId))) return null;

  const profile = await prisma.faceProfile.findUnique({
    where: { userId: input.userId },
    select: { status: true, approvedAt: true },
  });
  const decision = attendanceFaceDecision(profile, Boolean(input.capture));
  if (decision === "register") {
    throw new HttpError(
      400,
      "Register your face before punching. Look at the camera to save it first.",
    );
  }
  if (decision === "allow-location") return null;
  if (!input.capture) {
    throw new HttpError(
      400,
      input.isCheckOut
        ? "Live face verification is required for check-out"
        : "Live face verification is required for check-in",
    );
  }
  return verifyFaceCapture({
    userId: input.userId,
    employeeId: input.employeeId,
    expectedPurpose: input.isCheckOut
      ? FaceVerificationPurpose.ATTENDANCE_CHECK_OUT
      : FaceVerificationPurpose.ATTENDANCE_CHECK_IN,
    capture: faceCaptureSchema.parse({
      ...input.capture,
      latitude: input.latitude,
      longitude: input.longitude,
      locationAccuracy: input.locationAccuracy,
    }),
  });
}

export async function cleanupExpiredFaceEvidence() {
  const settings = await readFaceSettings();
  const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);
  const rows = await prisma.faceEvidence.findMany({
    where: { deletedAt: null, capturedAt: { lt: cutoff } },
    select: { evidenceId: true, imageKey: true },
    take: 500,
  });
  for (const row of rows) {
    if (row.imageKey) {
      try {
        await removeFaceEvidenceFiles([row.imageKey]);
      } catch (error) {
        console.error(`Failed to delete face evidence ${row.evidenceId}`, error);
        continue;
      }
    }
    await prisma.faceEvidence.update({
      where: { evidenceId: row.evidenceId },
      data: {
        imageKey: null,
        deletedAt: new Date(),
        // Coordinates are the sensitive part of a row that outlives its image.
        latitude: null,
        longitude: null,
        locationAccuracy: null,
      },
    });
  }
  const owners = await prisma.faceEvidence.findMany({
    where: { imageKey: { not: null }, deletedAt: null },
    distinct: ["userId"],
    select: { userId: true },
  });
  let trimmedImages = 0;
  for (const owner of owners) {
    trimmedImages += await enforceEvidenceImageLimit(owner.userId);
  }
  await prisma.faceVerificationSession.deleteMany({
    where: {
      expiresAt: { lt: new Date(Date.now() - 86_400_000) },
      evidence: { none: {} },
    },
  });
  return rows.length + trimmedImages;
}

export function startFaceEvidenceCleanupScheduler() {
  void cleanupExpiredFaceEvidence().catch((error) => {
    console.error("Initial face evidence cleanup failed", error);
  });
  const timer = setInterval(
    () => {
      void cleanupExpiredFaceEvidence().catch((error) => {
        console.error("Scheduled face evidence cleanup failed", error);
      });
    },
    60 * 60 * 1000,
  );
  timer.unref();
}

export const FACE_CONSENT = {
  version: FACE_CONSENT_VERSION,
  text: "I consent to the encrypted storage of my face template and one registration photo. Attendance check-in only verifies my live face against that template and does not store new photos.",
};
