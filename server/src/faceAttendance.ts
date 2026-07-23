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
import { prisma } from "./prisma.js";

const FACE_SETTING_KEY = "face_attendance_settings";
const FACE_CONSENT_VERSION = "2026-07";
const CHALLENGES = ["TURN_LEFT", "TURN_RIGHT"] as const;
const MAX_RETAINED_IMAGES_PER_USER = 5;

export const faceSettingsSchema = z.object({
  retentionDays: z.number().int().min(1).max(30).default(5),
  matchThreshold: z.number().min(0.4).max(0.9).default(0.6),
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

export const faceCaptureSchema = z.object({
  sessionId: z.string().min(10).max(191),
  nonce: z.string().min(32).max(200),
  descriptor: z.array(z.number().finite().min(-10).max(10)).min(128).max(2048),
  imageData: z
    .string()
    .max(950_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "A JPEG camera image is required"),
  faceConfidence: z.number().min(0).max(1),
  livenessScore: z.number().min(0).max(1),
  antiSpoofScore: z.number().min(0).max(1),
  challengeCompleted: z.literal(true),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationAccuracy: z.number().min(0).max(10_000).optional(),
  consentAccepted: z.boolean().optional(),
  consentVersion: z.string().max(40).optional(),
});

export type FaceCaptureInput = z.infer<typeof faceCaptureSchema>;

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
  await mkdir(path.dirname(target), { recursive: true });
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

export async function readFaceSettings(): Promise<FaceSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: FACE_SETTING_KEY } });
  if (!row) return defaultSettings;
  try {
    return faceSettingsSchema.parse(JSON.parse(row.value));
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
    expiresAt: expiresAt.toISOString(),
    settings: {
      minFaceConfidence: settings.minFaceConfidence,
      minLivenessScore: settings.minLivenessScore,
      minAntiSpoofScore: settings.minAntiSpoofScore,
      maxGpsAccuracyMeters: settings.maxGpsAccuracyMeters,
    },
  };
}

async function approvedDescriptorForUser(userId: string) {
  const profile = await prisma.faceProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== FaceEnrollmentStatus.APPROVED) {
    throw new HttpError(403, "Approved face registration is required");
  }
  const decrypted = decryptEmployeeField(profile.descriptorEncrypted);
  if (!decrypted) throw new HttpError(500, "The registered face template cannot be read");
  try {
    return faceCaptureSchema.shape.descriptor.parse(JSON.parse(decrypted));
  } catch {
    throw new HttpError(500, "The registered face template is invalid");
  }
}

async function duplicateEnrollmentSimilarity(userId: string, descriptor: number[]) {
  const profiles = await prisma.faceProfile.findMany({
    where: { userId: { not: userId }, status: FaceEnrollmentStatus.APPROVED },
    select: { descriptorEncrypted: true },
  });
  let best = 0;
  for (const profile of profiles) {
    const value = decryptEmployeeField(profile.descriptorEncrypted);
    if (!value) continue;
    try {
      best = Math.max(best, descriptorSimilarity(descriptor, JSON.parse(value) as number[]));
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
        outcome: FaceVerificationOutcome.EXPIRED,
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

  try {
    imageKey = await saveEncryptedEvidence(capture.imageData, evidenceId, capturedAt);
  } catch (error) {
    failureReason = error instanceof Error ? error.message : "Evidence image could not be stored";
  }

  if (!failureReason && capture.faceConfidence < settings.minFaceConfidence) {
    failureReason = "Face confidence is too low. Use better lighting and try again.";
  }
  if (!failureReason && capture.livenessScore < settings.minLivenessScore) {
    failureReason = "Liveness verification failed. Please look directly at the camera.";
  }
  if (!failureReason && capture.antiSpoofScore < settings.minAntiSpoofScore) {
    failureReason = "A real face could not be confirmed. Photos and screens are not accepted.";
  }
  if (!failureReason && !capture.challengeCompleted) {
    failureReason = "The requested face movement was not completed.";
  }

  const isAttendance =
    input.expectedPurpose === FaceVerificationPurpose.ATTENDANCE_CHECK_IN ||
    input.expectedPurpose === FaceVerificationPurpose.ATTENDANCE_CHECK_OUT;
  if (!failureReason && isAttendance) {
    if (
      capture.latitude === undefined ||
      capture.longitude === undefined ||
      capture.locationAccuracy === undefined
    ) {
      failureReason = "Live location permission is required for attendance.";
    } else if (capture.locationAccuracy > settings.maxGpsAccuracyMeters) {
      failureReason = `Location accuracy must be within ${settings.maxGpsAccuracyMeters} metres.`;
    } else {
      const registered = await approvedDescriptorForUser(input.userId);
      similarityScore = descriptorSimilarity(registered, capture.descriptor);
      if (similarityScore < settings.matchThreshold) {
        failureReason =
          "Another face detected. Check-in was blocked because this face does not match the registered employee.";
      }
    }
  }

  if (!failureReason && input.expectedPurpose === FaceVerificationPurpose.ENROLLMENT) {
    if (!capture.consentAccepted || capture.consentVersion !== FACE_CONSENT_VERSION) {
      failureReason = "Biometric consent is required before face registration.";
    } else {
      const duplicateSimilarity = await duplicateEnrollmentSimilarity(
        input.userId,
        capture.descriptor,
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
      faceConfidence: capture.faceConfidence,
      livenessScore: capture.livenessScore,
      antiSpoofScore: capture.antiSpoofScore,
      similarityScore,
      latitude: capture.latitude,
      longitude: capture.longitude,
      locationAccuracy: capture.locationAccuracy,
      failureReason,
      capturedAt,
      expiresAt,
      deletedAt: imageKey ? null : capturedAt,
    },
  });
  await enforceEvidenceImageLimit(input.userId);
  if (failureReason) throw new HttpError(422, failureReason);
  return { evidence, settings };
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
  const existingProfile = await prisma.faceProfile.findUnique({
    where: { userId: input.userId },
    select: { status: true },
  });
  if (existingProfile?.status === FaceEnrollmentStatus.APPROVED) {
    throw new HttpError(409, "Approved face registration must be reset by Developer Admin");
  }
  await verifyFaceCapture({
    userId: input.userId,
    employeeId: input.employeeId,
    expectedPurpose: FaceVerificationPurpose.ENROLLMENT,
    capture: input.capture,
  });
  const now = new Date();
  const profile = await prisma.faceProfile.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      descriptorEncrypted: encryptEmployeeField(JSON.stringify(input.capture.descriptor))!,
      status: FaceEnrollmentStatus.PENDING,
      consentVersion: FACE_CONSENT_VERSION,
      consentedAt: now,
      submittedAt: now,
      approvedByUserId: null,
      approvedAt: null,
    },
    update: {
      descriptorEncrypted: encryptEmployeeField(JSON.stringify(input.capture.descriptor))!,
      status: FaceEnrollmentStatus.PENDING,
      consentVersion: FACE_CONSENT_VERSION,
      consentedAt: now,
      submittedAt: now,
      approvedByUserId: null,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      disabledAt: null,
    },
  });
  invalidateFaceStatusCache(input.userId);
  return {
    status: profile.status,
    autoApproved: false,
    consentVersion: FACE_CONSENT_VERSION,
  };
}

const faceStatusCache = new Map<string, { approved: boolean; expiresAt: number }>();

export function invalidateFaceStatusCache(userId?: string) {
  if (userId) faceStatusCache.delete(userId);
  else faceStatusCache.clear();
}

export async function userHasApprovedFace(userId: string) {
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
      data: { imageKey: null, deletedAt: new Date(), outcome: FaceVerificationOutcome.EXPIRED },
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
      evidence: { is: null },
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
  text: "I consent to the encrypted storage and processing of my face template for identity verification and attendance. Verification images are retained for the configured short retention period.",
};
