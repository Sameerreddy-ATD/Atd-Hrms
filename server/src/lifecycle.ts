import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Express, Request } from "express";
import { Prisma, Role, UserStatus, EmployeeStatus, EmploymentType, ShiftType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { asyncHandler, HttpError } from "./errors.js";
import { requireAuth, requireRoles, getOrganizationTeamEmployeeIds } from "./rbac.js";
import { audit } from "./audit.js";
import { ensureChecklistInstance } from "./checklistService.js";
import { encryptEmployeeField, lastFour } from "./employeePrivateData.js";
import { reportingHierarchyCycle } from "./organizationRules.js";
import { detectAllowedUploadMime, assertClientMimeMatches, decodeBase64Payload } from "./privateFiles.js";

const PEOPLE_OPS: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.CEO];
const TALENT_ROLES: Role[] = [...PEOPLE_OPS, Role.MANAGER];
const CHANGE_ROLES: Role[] = [...PEOPLE_OPS, Role.MANAGER];
const ONBOARDING_DOC_TYPES = ["OFFER_LETTER", "NDA", "AADHAAR", "PAN", "HANDBOOK"] as const;
const CHANGE_KINDS = [
  "SHIFT_CHANGE",
  "SHIFT_SWAP",
  "PROMOTION",
  "DEPARTMENT_CHANGE",
  "EMPLOYMENT_TYPE_CHANGE",
  "SALARY_CHANGE",
  "DESIGNATION_CHANGE",
  "BRANCH_CHANGE",
  "ADDRESS_CHANGE",
  "MANAGER_CHANGE",
  "HIERARCHY_CHANGE",
  "RECURRING_ALLOWANCE",
  "ONE_TIME_PAYMENT",
] as const;

const filesDir = process.env.LIFECYCLE_FILES_DIR ?? ".lifecycle-files";

function isPeopleOps(role: Role) {
  return PEOPLE_OPS.includes(role);
}

function routeParam(req: Request, name: string) {
  const value = req.params[name];
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) throw new HttpError(400, "Missing id");
  return id;
}

function money(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) return null;
  return Number(value);
}

function dateKey(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function teamIdsFor(user: NonNullable<Request["user"]>) {
  if (!user.employeeId) return [] as string[];
  return getOrganizationTeamEmployeeIds(user.employeeId);
}

async function assertCanSeeEmployee(user: NonNullable<Request["user"]>, employeeId: string) {
  if (isPeopleOps(user.role)) return;
  if (user.employeeId === employeeId) return;
  const team = await teamIdsFor(user);
  if (team.includes(employeeId)) return;
  throw new HttpError(403, "You can only view your own or your team's records.");
}

async function saveLifecycleFile(prefix: string, fileName: string, contentBase64: string, claimedMime: string) {
  const buffer = decodeBase64Payload(contentBase64);
  if (buffer.length > 2_500_000) throw new HttpError(400, "File must be under 2.5 MB");
  const mimeType = detectAllowedUploadMime(buffer);
  assertClientMimeMatches(mimeType, claimedMime);
  await mkdir(filesDir, { recursive: true });
  const safeName = fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const storageKey = `${prefix}-${randomBytes(8).toString("hex")}-${safeName}`;
  await writeFile(path.join(filesDir, storageKey), buffer, { mode: 0o600 });
  return { storageKey, fileName: safeName, mimeType };
}

const filePayload = z
  .object({
    fileName: z.string().min(1).max(160),
    contentBase64: z.string().min(20),
    mimeType: z.string().min(3).max(120),
  })
  .optional();

function jobDto(job: {
  jobId: string;
  title: string;
  departmentName: string | null;
  description: string | null;
  employmentType: string | null;
  openings: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { candidates: number };
}) {
  return {
    id: job.jobId,
    title: job.title,
    departmentName: job.departmentName,
    description: job.description,
    employmentType: job.employmentType,
    openings: job.openings,
    status: job.status,
    candidateCount: job._count?.candidates ?? 0,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function candidateDto(
  row: Prisma.CandidateGetPayload<{
    include: { job: true; interviews: true; offers: true; hiredEmployee: { select: { employeeId: true; name: true; employeeCode: true } } };
  }>,
) {
  return {
    id: row.candidateId,
    jobId: row.jobId,
    jobTitle: row.job.title,
    name: row.name,
    email: row.email,
    phone: row.phone,
    stage: row.stage,
    source: row.source,
    notes: row.notes,
    currentCtc: money(row.currentCtc),
    expectedCtc: money(row.expectedCtc),
    noticeDays: row.noticeDays,
    hiredEmployeeId: row.hiredEmployeeId,
    hiredEmployeeName: row.hiredEmployee?.name ?? null,
    hiredEmployeeCode: row.hiredEmployee?.employeeCode ?? null,
    hasResume: Boolean(row.resumeStorageKey),
    resumeFileName: row.resumeFileName,
    interviews: row.interviews.map((item) => ({
      id: item.interviewId,
      roundName: item.roundName,
      scheduledAt: item.scheduledAt?.toISOString() ?? null,
      interviewerName: item.interviewerName,
      outcome: item.outcome,
      score: item.score,
      feedback: item.feedback,
    })),
    offers: row.offers.map((item) => ({
      id: item.offerId,
      ctcAnnual: money(item.ctcAnnual),
      designation: item.designation,
      joiningDate: dateKey(item.joiningDate),
      status: item.status,
      sentAt: item.sentAt?.toISOString() ?? null,
      signedAt: item.signedAt?.toISOString() ?? null,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function applyEmployeeChange(
  change: Prisma.EmployeeChangeRequestGetPayload<{ include: { employee: true } }>,
  actorId: string,
) {
  const payload = (change.payload ?? {}) as Record<string, unknown>;
  const employeeId = change.employeeId;
  const kind = change.kind;

  if (kind === "SHIFT_CHANGE") {
    const shiftType = payload.shiftType === "NIGHT" ? ShiftType.NIGHT : ShiftType.DAY;
    const shiftStartMinutes = Number(payload.shiftStartMinutes ?? 540);
    const shiftEndMinutes = Number(payload.shiftEndMinutes ?? 1080);
    await prisma.employee.update({
      where: { employeeId },
      data: { shiftType, shiftStartMinutes, shiftEndMinutes },
    });
  } else if (kind === "SHIFT_SWAP") {
    const counterpartId = String(payload.counterpartEmployeeId ?? "");
    const workDate = new Date(String(payload.workDate ?? change.effectiveDate));
    if (!counterpartId) throw new HttpError(400, "Counterpart employee is required");
    if (counterpartId === employeeId) throw new HttpError(400, "Cannot swap shift with the same employee");
    const [self, other] = await Promise.all([
      prisma.employee.findUnique({ where: { employeeId } }),
      prisma.employee.findUnique({ where: { employeeId: counterpartId } }),
    ]);
    if (!self || !other) throw new HttpError(404, "Employee not found");
    // Day-scoped swap record only — do not rewrite permanent shift templates.
    await prisma.shiftSwapRequest.create({
      data: {
        employeeId,
        counterpartEmployeeId: counterpartId,
        workDate,
        reason: change.reason,
        status: "APPROVED",
        reviewedByUserId: actorId,
        reviewedAt: new Date(),
      },
    });
  } else if (kind === "PROMOTION" || kind === "DESIGNATION_CHANGE") {
    await prisma.employee.update({
      where: { employeeId },
      data: {
        designation: payload.designation ? String(payload.designation) : undefined,
        managerId: payload.managerId ? String(payload.managerId) : undefined,
        organizationLevel: payload.organizationLevel ? String(payload.organizationLevel) : undefined,
      },
    });
    if (payload.ctcAnnual != null) {
      await prisma.employeeCompensation.create({
        data: {
          employeeId,
          effectiveFrom: change.effectiveDate,
          ctcAnnual: new Prisma.Decimal(Number(payload.ctcAnnual)),
          basicMonthly:
            payload.basicMonthly != null ? new Prisma.Decimal(Number(payload.basicMonthly)) : null,
          notes: change.reason,
          createdByUserId: actorId,
        },
      });
    }
  } else if (kind === "DEPARTMENT_CHANGE") {
    await prisma.employee.update({
      where: { employeeId },
      data: { departmentId: payload.departmentId ? String(payload.departmentId) : null },
    });
  } else if (kind === "EMPLOYMENT_TYPE_CHANGE") {
    const next = String(payload.employmentType ?? "") as EmploymentType;
    if (!Object.values(EmploymentType).includes(next)) {
      throw new HttpError(400, "Invalid employment type");
    }
    await prisma.employee.update({ where: { employeeId }, data: { employmentType: next } });
  } else if (kind === "SALARY_CHANGE") {
    await prisma.employeeCompensation.create({
      data: {
        employeeId,
        effectiveFrom: change.effectiveDate,
        ctcAnnual: new Prisma.Decimal(Number(payload.ctcAnnual ?? 0)),
        basicMonthly:
          payload.basicMonthly != null ? new Prisma.Decimal(Number(payload.basicMonthly)) : null,
        notes: change.reason,
        createdByUserId: actorId,
      },
    });
  } else if (kind === "BRANCH_CHANGE") {
    await prisma.employee.update({
      where: { employeeId },
      data: { homeBranchId: payload.homeBranchId ? String(payload.homeBranchId) : null },
    });
  } else if (kind === "ADDRESS_CHANGE") {
    await prisma.employee.update({
      where: { employeeId },
      data: {
        presentAddress: payload.presentAddress ? String(payload.presentAddress) : undefined,
        presentCity: payload.presentCity ? String(payload.presentCity) : undefined,
        presentState: payload.presentState ? String(payload.presentState) : undefined,
        presentPincode: payload.presentPincode ? String(payload.presentPincode) : undefined,
        permanentAddress: payload.permanentAddress ? String(payload.permanentAddress) : undefined,
        permanentCity: payload.permanentCity ? String(payload.permanentCity) : undefined,
        permanentState: payload.permanentState ? String(payload.permanentState) : undefined,
        permanentPincode: payload.permanentPincode ? String(payload.permanentPincode) : undefined,
      },
    });
  } else if (kind === "MANAGER_CHANGE" || kind === "HIERARCHY_CHANGE") {
    const managerId = payload.managerId ? String(payload.managerId) : null;
    if (managerId) {
      const hierarchy = await prisma.employee.findMany({
        select: { employeeId: true, managerId: true },
      });
      const cycle = reportingHierarchyCycle(hierarchy, employeeId, managerId);
      if (cycle) throw new HttpError(400, "That manager change would create a reporting cycle");
    }
    await prisma.employee.update({
      where: { employeeId },
      data: {
        managerId,
        organizationLevel: payload.organizationLevel ? String(payload.organizationLevel) : undefined,
      },
    });
  } else if (kind === "RECURRING_ALLOWANCE") {
    await prisma.recurringAllowance.create({
      data: {
        employeeId,
        name: String(payload.name ?? "Allowance"),
        amountMonthly: new Prisma.Decimal(Number(payload.amountMonthly ?? 0)),
        effectiveFrom: change.effectiveDate,
        createdByUserId: actorId,
      },
    });
  } else if (kind === "ONE_TIME_PAYMENT") {
    await prisma.oneTimePayment.create({
      data: {
        employeeId,
        name: String(payload.name ?? "One-time payment"),
        amount: new Prisma.Decimal(Number(payload.amount ?? 0)),
        paymentDate: change.effectiveDate,
        reason: change.reason,
        status: "APPROVED",
        createdByUserId: actorId,
      },
    });
  }

  return prisma.employeeChangeRequest.update({
    where: { changeId: change.changeId },
    data: { status: "APPLIED", appliedAt: new Date(), hrApprovedById: actorId, hrApprovedAt: new Date() },
  });
}

export function registerLifecycleRoutes(app: Express) {
  const talentGate = requireRoles(...TALENT_ROLES);
  const opsGate = requireRoles(...PEOPLE_OPS);
  const changeGate = requireRoles(...CHANGE_ROLES);

  app.get(
    "/lifecycle/jobs",
    requireAuth,
    talentGate,
    asyncHandler(async (_req, res) => {
      const jobs = await prisma.recruitmentJob.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { candidates: true } } },
      });
      res.json(jobs.map(jobDto));
    }),
  );

  app.post(
    "/lifecycle/jobs",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().trim().min(2).max(160),
          departmentName: z.string().trim().max(120).optional(),
          description: z.string().max(8000).optional(),
          employmentType: z.string().max(24).optional(),
          openings: z.number().int().min(1).max(50).optional(),
        })
        .parse(req.body);
      const job = await prisma.recruitmentJob.create({
        data: {
          title: body.title,
          departmentName: body.departmentName,
          description: body.description,
          employmentType: body.employmentType,
          openings: body.openings ?? 1,
          createdByUserId: req.user!.id,
        },
        include: { _count: { select: { candidates: true } } },
      });
      await audit({
        action: "LIFECYCLE_JOB_CREATE",
        performedByUserId: req.user!.id,
        newValue: { jobId: job.jobId, title: job.title },
      });
      res.status(201).json(jobDto(job));
    }),
  );

  app.patch(
    "/lifecycle/jobs/:id",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().trim().min(2).max(160).optional(),
          departmentName: z.string().trim().max(120).nullable().optional(),
          description: z.string().max(8000).nullable().optional(),
          employmentType: z.string().max(24).nullable().optional(),
          openings: z.number().int().min(1).max(50).optional(),
          status: z.enum(["OPEN", "ON_HOLD", "CLOSED"]).optional(),
        })
        .parse(req.body);
      const job = await prisma.recruitmentJob.update({
        where: { jobId: routeParam(req, "id") },
        data: body,
        include: { _count: { select: { candidates: true } } },
      });
      res.json(jobDto(job));
    }),
  );

  app.get(
    "/lifecycle/candidates",
    requireAuth,
    talentGate,
    asyncHandler(async (req, res) => {
      const jobId = typeof req.query.jobId === "string" ? req.query.jobId : undefined;
      const stage = typeof req.query.stage === "string" ? req.query.stage : undefined;
      const rows = await prisma.candidate.findMany({
        where: { jobId, stage },
        orderBy: { updatedAt: "desc" },
        include: {
          job: true,
          interviews: { orderBy: { createdAt: "asc" } },
          offers: { orderBy: { createdAt: "desc" } },
          hiredEmployee: { select: { employeeId: true, name: true, employeeCode: true } },
        },
      });
      res.json(rows.map(candidateDto));
    }),
  );

  app.post(
    "/lifecycle/candidates",
    requireAuth,
    talentGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          jobId: z.string().min(1),
          name: z.string().trim().min(2).max(160),
          email: z.string().email().optional(),
          phone: z.string().max(24).optional(),
          source: z.string().max(80).optional(),
          notes: z.string().max(4000).optional(),
          currentCtc: z.number().nonnegative().optional(),
          expectedCtc: z.number().nonnegative().optional(),
          noticeDays: z.number().int().min(0).max(365).optional(),
        })
        .parse(req.body);
      const row = await prisma.candidate.create({
        data: {
          jobId: body.jobId,
          name: body.name,
          email: body.email,
          phone: body.phone,
          source: body.source,
          notes: body.notes,
          currentCtc: body.currentCtc,
          expectedCtc: body.expectedCtc,
          noticeDays: body.noticeDays,
        },
        include: {
          job: true,
          interviews: true,
          offers: true,
          hiredEmployee: { select: { employeeId: true, name: true, employeeCode: true } },
        },
      });
      res.status(201).json(candidateDto(row));
    }),
  );

  app.patch(
    "/lifecycle/candidates/:id",
    requireAuth,
    talentGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          stage: z
            .enum(["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED", "WITHDRAWN"])
            .optional(),
          notes: z.string().max(4000).nullable().optional(),
          hiredEmployeeId: z.string().nullable().optional(),
        })
        .parse(req.body);
      const row = await prisma.candidate.update({
        where: { candidateId: routeParam(req, "id") },
        data: body,
        include: {
          job: true,
          interviews: { orderBy: { createdAt: "asc" } },
          offers: { orderBy: { createdAt: "desc" } },
          hiredEmployee: { select: { employeeId: true, name: true, employeeCode: true } },
        },
      });
      if (body.hiredEmployeeId) {
        await prisma.employee.update({
          where: { employeeId: body.hiredEmployeeId },
          data: { lifecycleStage: "PRE_ONBOARDING" },
        });
      }
      res.json(candidateDto(row));
    }),
  );

  app.post(
    "/lifecycle/candidates/:id/hire",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          employeeId: z.string().min(1),
          startOnboarding: z.boolean().optional(),
          designation: z.string().max(120).optional(),
        })
        .parse(req.body);
      const candidateId = routeParam(req, "id");
      const employee = await prisma.employee.findUnique({ where: { employeeId: body.employeeId } });
      if (!employee) throw new HttpError(404, "Employee login not found — create the user login first");

      const row = await prisma.$transaction(async (tx) => {
        const candidate = await tx.candidate.update({
          where: { candidateId },
          data: {
            stage: "HIRED",
            hiredEmployeeId: body.employeeId,
          },
          include: {
            job: true,
            interviews: { orderBy: { createdAt: "asc" } },
            offers: { orderBy: { createdAt: "desc" } },
            hiredEmployee: { select: { employeeId: true, name: true, employeeCode: true } },
          },
        });
        await tx.employee.update({
          where: { employeeId: body.employeeId },
          data: {
            lifecycleStage: "PRE_ONBOARDING",
            designation: body.designation || employee.designation,
          },
        });
        await tx.offerLetter.updateMany({
          where: { candidateId, employeeId: null },
          data: { employeeId: body.employeeId },
        });
        return candidate;
      });

      let onboardingId: string | null = null;
      if (body.startOnboarding !== false) {
        const existing = await prisma.onboardingCase.findFirst({
          where: { employeeId: body.employeeId, status: { in: ["PRE_ONBOARDING", "ONBOARDING"] } },
        });
        if (existing) {
          onboardingId = existing.caseId;
        } else {
          const created = await prisma.$transaction(async (tx) => {
            const onboarding = await tx.onboardingCase.create({
              data: {
                employeeId: body.employeeId,
                candidateId,
                startedByUserId: req.user!.id,
                status: "PRE_ONBOARDING",
              },
            });
            await tx.onboardingDocument.createMany({
              data: ONBOARDING_DOC_TYPES.map((docType) => ({
                caseId: onboarding.caseId,
                docType,
                status: docType === "OFFER_LETTER" ? "SENT" : "PENDING",
              })),
            });
            await tx.newHireProfile.upsert({
              where: { employeeId: body.employeeId },
              create: { employeeId: body.employeeId, fullName: employee.name },
              update: {},
            });
            return onboarding;
          });
          onboardingId = created.caseId;
          await ensureChecklistInstance(body.employeeId, "ONBOARDING");
        }
      }

      await audit({
        action: "LIFECYCLE_CANDIDATE_HIRE",
        performedByUserId: req.user!.id,
        newValue: { candidateId, employeeId: body.employeeId, onboardingId },
      });
      res.json({ ...candidateDto(row), onboardingId });
    }),
  );

  app.post(
    "/lifecycle/candidates/:id/interviews",
    requireAuth,
    talentGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          roundName: z.string().trim().min(2).max(80),
          scheduledAt: z.string().datetime().optional(),
          interviewerName: z.string().max(120).optional(),
          outcome: z.enum(["SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"]).optional(),
          score: z.number().int().min(0).max(100).optional(),
          feedback: z.string().max(4000).optional(),
        })
        .parse(req.body);
      const interview = await prisma.candidateInterview.create({
        data: {
          candidateId: routeParam(req, "id"),
          roundName: body.roundName,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          interviewerName: body.interviewerName,
          interviewerUserId: req.user!.id,
          outcome: body.outcome ?? "SCHEDULED",
          score: body.score,
          feedback: body.feedback,
        },
      });
      await prisma.candidate.update({
        where: { candidateId: routeParam(req, "id") },
        data: { stage: "INTERVIEW" },
      });
      res.status(201).json({ id: interview.interviewId });
    }),
  );

  app.post(
    "/lifecycle/candidates/:id/offers",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          ctcAnnual: z.number().positive(),
          designation: z.string().max(120).optional(),
          joiningDate: z.string().optional(),
          body: z.string().max(12000).optional(),
          employeeId: z.string().optional(),
          send: z.boolean().optional(),
        })
        .parse(req.body);
      const offer = await prisma.offerLetter.create({
        data: {
          candidateId: routeParam(req, "id"),
          employeeId: body.employeeId,
          ctcAnnual: new Prisma.Decimal(body.ctcAnnual),
          designation: body.designation,
          joiningDate: body.joiningDate ? new Date(body.joiningDate) : null,
          body: body.body,
          status: body.send ? "SENT" : "DRAFT",
          sentAt: body.send ? new Date() : null,
          createdByUserId: req.user!.id,
        },
      });
      await prisma.candidate.update({
        where: { candidateId: routeParam(req, "id") },
        data: { stage: "OFFER" },
      });
      if (body.employeeId) {
        // Offer can link a future login, but onboarding starts only via Hire.
        await prisma.employee.update({
          where: { employeeId: body.employeeId },
          data: { designation: body.designation || undefined },
        });
      }
      await audit({
        action: "LIFECYCLE_OFFER_CREATE",
        performedByUserId: req.user!.id,
        newValue: { offerId: offer.offerId },
      });
      res.status(201).json({ id: offer.offerId, status: offer.status });
    }),
  );

  app.post(
    "/lifecycle/offers/:id/sign",
    requireAuth,
    asyncHandler(async (req, res) => {
      const offer = await prisma.offerLetter.findUnique({ where: { offerId: routeParam(req, "id") } });
      if (!offer) throw new HttpError(404, "Offer not found");
      const own =
        (offer.employeeId && offer.employeeId === req.user!.employeeId) || isPeopleOps(req.user!.role);
      if (!own) throw new HttpError(403, "You cannot sign this offer");
      const updated = await prisma.offerLetter.update({
        where: { offerId: offer.offerId },
        data: { status: "SIGNED", signedAt: new Date() },
      });
      await prisma.candidate.update({
        where: { candidateId: offer.candidateId },
        data: { stage: "ACCEPTED" },
      });
      res.json({ id: updated.offerId, status: updated.status });
    }),
  );

  app.get(
    "/lifecycle/onboarding",
    requireAuth,
    asyncHandler(async (req, res) => {
      const ownOnly = !isPeopleOps(req.user!.role) && req.user!.role !== Role.MANAGER;
      const team = req.user!.role === Role.MANAGER ? await teamIdsFor(req.user!) : [];
      const rows = await prisma.onboardingCase.findMany({
        where: ownOnly
          ? { employeeId: req.user!.employeeId ?? "__none__" }
          : req.user!.role === Role.MANAGER
            ? { employeeId: { in: [...team, req.user!.employeeId].filter(Boolean) as string[] } }
            : {},
        orderBy: { updatedAt: "desc" },
        include: {
          employee: { select: { employeeId: true, name: true, employeeCode: true, lifecycleStage: true } },
          documents: { orderBy: { docType: "asc" } },
        },
      });
      res.json(
        rows.map((row) => ({
          id: row.caseId,
          status: row.status,
          candidateId: row.candidateId,
          employeeId: row.employeeId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          lifecycleStage: row.employee.lifecycleStage,
          completedAt: row.completedAt?.toISOString() ?? null,
          documents: row.documents.map((doc) => ({
            id: doc.documentId,
            docType: doc.docType,
            status: doc.status,
            fileName: doc.fileName,
            fileKey: doc.storageKey,
            hasFile: Boolean(doc.storageKey),
            signedAt: doc.signedAt?.toISOString() ?? null,
            verifiedAt: doc.verifiedAt?.toISOString() ?? null,
          })),
          createdAt: row.createdAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/lifecycle/onboarding",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({ employeeId: z.string().min(1), candidateId: z.string().optional() })
        .parse(req.body);
      const existing = await prisma.onboardingCase.findFirst({
        where: { employeeId: body.employeeId, status: { in: ["PRE_ONBOARDING", "ONBOARDING"] } },
      });
      if (existing) {
        res.json({ id: existing.caseId, existing: true });
        return;
      }
      const created = await prisma.$transaction(async (tx) => {
        const onboarding = await tx.onboardingCase.create({
          data: {
            employeeId: body.employeeId,
            candidateId: body.candidateId,
            startedByUserId: req.user!.id,
            status: "PRE_ONBOARDING",
          },
        });
        await tx.onboardingDocument.createMany({
          data: ONBOARDING_DOC_TYPES.map((docType) => ({
            caseId: onboarding.caseId,
            docType,
            status: docType === "OFFER_LETTER" ? "SENT" : "PENDING",
          })),
        });
        await tx.employee.update({
          where: { employeeId: body.employeeId },
          data: { lifecycleStage: "PRE_ONBOARDING" },
        });
        await tx.newHireProfile.upsert({
          where: { employeeId: body.employeeId },
          create: { employeeId: body.employeeId },
          update: {},
        });
        return onboarding;
      });
      await ensureChecklistInstance(body.employeeId, "ONBOARDING");
      res.status(201).json({ id: created.caseId });
    }),
  );

  app.post(
    "/lifecycle/onboarding/documents/:id/sign",
    requireAuth,
    asyncHandler(async (req, res) => {
      const doc = await prisma.onboardingDocument.findUnique({
        where: { documentId: routeParam(req, "id") },
        include: { case: true },
      });
      if (!doc) throw new HttpError(404, "Document not found");
      await assertCanSeeEmployee(req.user!, doc.case.employeeId);
      const body = z.object({ file: filePayload, notes: z.string().max(2000).optional() }).parse(req.body);
      let fileName = doc.fileName;
      let storageKey = doc.storageKey;
      if (body.file) {
        const saved = await saveLifecycleFile("onboard", body.file.fileName, body.file.contentBase64, body.file.mimeType);
        fileName = saved.fileName;
        storageKey = saved.storageKey;
      }
      const isSign = ["OFFER_LETTER", "NDA", "HANDBOOK"].includes(doc.docType);
      const updated = await prisma.onboardingDocument.update({
        where: { documentId: doc.documentId },
        data: {
          fileName,
          storageKey,
          employeeNotes: body.notes,
          status: isSign ? "SIGNED" : "UPLOADED",
          signedAt: isSign ? new Date() : doc.signedAt,
        },
      });
      await prisma.onboardingCase.update({
        where: { caseId: doc.caseId },
        data: { status: "ONBOARDING" },
      });
      await prisma.employee.update({
        where: { employeeId: doc.case.employeeId },
        data: { lifecycleStage: "ONBOARDING" },
      });
      res.json({ id: updated.documentId, status: updated.status });
    }),
  );

  app.post(
    "/lifecycle/onboarding/documents/:id/verify",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z.object({ approved: z.boolean(), notes: z.string().max(2000).optional() }).parse(req.body);
      const doc = await prisma.onboardingDocument.update({
        where: { documentId: routeParam(req, "id") },
        data: {
          status: body.approved ? "VERIFIED" : "REJECTED",
          verifiedAt: new Date(),
          verifiedByUserId: req.user!.id,
          // Keep employee upload notes; only overwrite when HR supplies verify/reject notes.
          ...(body.notes !== undefined ? { employeeNotes: body.notes } : {}),
        },
        include: { case: { include: { documents: true } } },
      });
      const allVerified = doc.case.documents.every((item) => {
        const status = item.documentId === doc.documentId ? doc.status : item.status;
        return status === "VERIFIED";
      });
      if (body.approved && allVerified) {
        await prisma.onboardingCase.update({
          where: { caseId: doc.caseId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await prisma.employee.update({
          where: { employeeId: doc.case.employeeId },
          data: { lifecycleStage: "NHO" },
        });
      }
      res.json({ id: doc.documentId, status: doc.status, caseCompleted: body.approved && allVerified });
    }),
  );

  app.get(
    "/lifecycle/nho",
    requireAuth,
    asyncHandler(async (req, res) => {
      const ownOnly = !isPeopleOps(req.user!.role) && req.user!.role !== Role.MANAGER;
      const team = req.user!.role === Role.MANAGER ? await teamIdsFor(req.user!) : [];
      const rows = await prisma.newHireProfile.findMany({
        where: ownOnly
          ? { employeeId: req.user!.employeeId ?? "__none__" }
          : req.user!.role === Role.MANAGER
            ? { employeeId: { in: [...team, req.user!.employeeId].filter(Boolean) as string[] } }
            : {},
        include: { employee: { select: { name: true, employeeCode: true, lifecycleStage: true } } },
        orderBy: { updatedAt: "desc" },
      });
      res.json(
        rows.map((row) => ({
          id: row.profileId,
          employeeId: row.employeeId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          lifecycleStage: row.employee.lifecycleStage,
          status: row.status,
          fullName: row.fullName,
          fatherName: row.fatherName,
          dateOfBirth: dateKey(row.dateOfBirth),
          ageYears: row.ageYears,
          gender: row.gender,
          presentAddress: row.presentAddress,
          presentCity: row.presentCity,
          presentState: row.presentState,
          presentPincode: row.presentPincode,
          permanentAddress: row.permanentAddress,
          permanentCity: row.permanentCity,
          permanentState: row.permanentState,
          permanentPincode: row.permanentPincode,
          panNumber: isPeopleOps(req.user!.role) || req.user!.employeeId === row.employeeId ? row.panNumber : null,
          aadhaarLast4: row.aadhaarLast4,
          submittedAt: row.submittedAt?.toISOString() ?? null,
          verifiedAt: row.verifiedAt?.toISOString() ?? null,
          hrNotes: row.hrNotes,
        })),
      );
    }),
  );

  app.put(
    "/lifecycle/nho/:employeeId",
    requireAuth,
    asyncHandler(async (req, res) => {
      await assertCanSeeEmployee(req.user!, routeParam(req, "employeeId"));
      const body = z
        .object({
          fullName: z.string().max(160).optional(),
          fatherName: z.string().max(160).optional(),
          dateOfBirth: z.string().optional(),
          ageYears: z.number().int().min(16).max(80).optional(),
          gender: z.string().max(32).optional(),
          presentAddress: z.string().max(500).optional(),
          presentCity: z.string().max(80).optional(),
          presentState: z.string().max(80).optional(),
          presentPincode: z.string().max(12).optional(),
          permanentAddress: z.string().max(500).optional(),
          permanentCity: z.string().max(80).optional(),
          permanentState: z.string().max(80).optional(),
          permanentPincode: z.string().max(12).optional(),
          panNumber: z.string().max(12).optional(),
          aadhaarLast4: z.string().max(4).optional(),
          submit: z.boolean().optional(),
        })
        .parse(req.body);
      const { submit, dateOfBirth, ...fields } = body;
      const dob = dateOfBirth ? new Date(dateOfBirth) : undefined;
      const saved = await prisma.newHireProfile.upsert({
        where: { employeeId: routeParam(req, "employeeId") },
        create: {
          employeeId: routeParam(req, "employeeId"),
          ...fields,
          dateOfBirth: dob ?? null,
          status: submit ? "SUBMITTED" : "DRAFT",
          submittedAt: submit ? new Date() : null,
        },
        update: {
          ...fields,
          dateOfBirth: dob,
          status: submit ? "SUBMITTED" : undefined,
          submittedAt: submit ? new Date() : undefined,
        },
      });
      if (submit) {
        await prisma.employee.update({
          where: { employeeId: routeParam(req, "employeeId") },
          data: { lifecycleStage: "NHO" },
        });
      }
      res.json({ id: saved.profileId, status: saved.status });
    }),
  );

  app.post(
    "/lifecycle/nho/:employeeId/verify",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z.object({ approved: z.boolean(), hrNotes: z.string().max(2000).optional() }).parse(req.body);
      const employeeId = routeParam(req, "employeeId");
      const profile = await prisma.newHireProfile.findUnique({ where: { employeeId } });
      if (!profile) throw new HttpError(404, "New-hire form not found");
      if (body.approved) {
        if (profile.status !== "SUBMITTED" && profile.status !== "HR_VERIFIED") {
          throw new HttpError(400, "New-hire form must be submitted before HR verification");
        }
        const openCase = await prisma.onboardingCase.findFirst({
          where: { employeeId, status: { in: ["PRE_ONBOARDING", "ONBOARDING"] } },
          include: { documents: true },
        });
        if (openCase) {
          throw new HttpError(400, "Verify all onboarding documents before activating the hire");
        }
        const completed = await prisma.onboardingCase.findFirst({
          where: { employeeId, status: "COMPLETED" },
        });
        if (!completed) {
          throw new HttpError(400, "Complete onboarding documents before activating the hire");
        }
      }
      const updated = await prisma.newHireProfile.update({
        where: { employeeId },
        data: {
          status: body.approved ? "HR_VERIFIED" : "REJECTED",
          verifiedAt: new Date(),
          verifiedByUserId: req.user!.id,
          hrNotes: body.hrNotes,
        },
      });
      if (body.approved) {
        await prisma.employee.update({
          where: { employeeId },
          data: {
            name: profile.fullName || undefined,
            fatherName: profile.fatherName,
            dateOfBirth: profile.dateOfBirth,
            presentAddress: profile.presentAddress,
            presentCity: profile.presentCity,
            presentState: profile.presentState,
            presentPincode: profile.presentPincode,
            permanentAddress: profile.permanentAddress,
            permanentCity: profile.permanentCity,
            permanentState: profile.permanentState,
            permanentPincode: profile.permanentPincode,
            panNumberEncrypted: profile.panNumber ? encryptEmployeeField(profile.panNumber) : undefined,
            panNumberLast4: profile.panNumber ? lastFour(profile.panNumber) : undefined,
            lifecycleStage: "ACTIVE",
          },
        });
      }
      res.json({ id: updated.profileId, status: updated.status });
    }),
  );

  app.get(
    "/lifecycle/changes",
    requireAuth,
    changeGate,
    asyncHandler(async (req, res) => {
      const ownOnly = !isPeopleOps(req.user!.role) && req.user!.role !== Role.MANAGER;
      const team = req.user!.role === Role.MANAGER ? await teamIdsFor(req.user!) : [];
      const rows = await prisma.employeeChangeRequest.findMany({
        where: ownOnly
          ? { employeeId: req.user!.employeeId ?? "__none__" }
          : req.user!.role === Role.MANAGER
            ? { employeeId: { in: [...team, req.user!.employeeId].filter(Boolean) as string[] } }
            : {},
        include: { employee: { select: { name: true, employeeCode: true, designation: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      res.json(
        rows.map((row) => ({
          id: row.changeId,
          employeeId: row.employeeId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          designation: row.employee.designation,
          kind: row.kind,
          effectiveDate: dateKey(row.effectiveDate),
          payload: row.payload,
          reason: row.reason,
          status: row.status,
          hasHrLetter: Boolean(row.hrLetterStorageKey),
          hrLetterKey: row.hrLetterStorageKey,
          hrLetterFileName: row.hrLetterFileName,
          managerApprovedAt: row.managerApprovedAt?.toISOString() ?? null,
          hrApprovedAt: row.hrApprovedAt?.toISOString() ?? null,
          appliedAt: row.appliedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/lifecycle/changes",
    requireAuth,
    changeGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          employeeId: z.string().min(1),
          kind: z.enum(CHANGE_KINDS),
          effectiveDate: z.string().min(8),
          payload: z.record(z.unknown()),
          reason: z.string().max(2000).optional(),
        })
        .parse(req.body);
      await assertCanSeeEmployee(req.user!, body.employeeId);
      const kind = body.kind;
      const payload = body.payload ?? {};
      if (
        (kind === "PROMOTION" || kind === "DESIGNATION_CHANGE") &&
        !String(payload.designation ?? "").trim()
      ) {
        throw new HttpError(400, "Designation is required for this change");
      }
      if (kind === "SALARY_CHANGE" && !(Number(payload.ctcAnnual) > 0)) {
        throw new HttpError(400, "Annual CTC is required");
      }
      if (kind === "DEPARTMENT_CHANGE" && !payload.departmentId) {
        throw new HttpError(400, "Department is required");
      }
      if (kind === "BRANCH_CHANGE" && !payload.homeBranchId) {
        throw new HttpError(400, "Branch is required");
      }
      if (kind === "MANAGER_CHANGE" && !payload.managerId) {
        throw new HttpError(400, "Manager is required");
      }
      if (kind === "SHIFT_SWAP" && !payload.counterpartEmployeeId) {
        throw new HttpError(400, "Swap counterpart is required");
      }
      if (kind === "ADDRESS_CHANGE" && !String(payload.presentAddress ?? "").trim()) {
        throw new HttpError(400, "Address is required");
      }
      const created = await prisma.employeeChangeRequest.create({
        data: {
          employeeId: body.employeeId,
          kind: body.kind,
          effectiveDate: new Date(body.effectiveDate),
          payload: body.payload as Prisma.InputJsonValue,
          reason: body.reason,
          status: isPeopleOps(req.user!.role) ? "PENDING_HR" : "PENDING_MANAGER",
          requestedByUserId: req.user!.id,
        },
      });
      res.status(201).json({ id: created.changeId, status: created.status });
    }),
  );

  app.post(
    "/lifecycle/changes/:id/decide",
    requireAuth,
    changeGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          decision: z.enum(["APPROVE", "REJECT", "APPLY"]),
          hrLetter: filePayload,
        })
        .parse(req.body);
      const change = await prisma.employeeChangeRequest.findUnique({
        where: { changeId: routeParam(req, "id") },
        include: { employee: true },
      });
      if (!change) throw new HttpError(404, "Change request not found");
      await assertCanSeeEmployee(req.user!, change.employeeId);

      if (change.status === "APPLIED") {
        res.json({ id: change.changeId, status: change.status });
        return;
      }
      if (change.status === "REJECTED") {
        throw new HttpError(400, "This change request was already rejected");
      }

      if (body.decision === "REJECT") {
        if (!isPeopleOps(req.user!.role) && change.status !== "PENDING_MANAGER") {
          throw new HttpError(403, "Managers can only reject requests waiting for manager approval");
        }
        if (
          isPeopleOps(req.user!.role) &&
          !["PENDING_MANAGER", "PENDING_HR", "APPROVED"].includes(change.status)
        ) {
          throw new HttpError(400, "This change request cannot be rejected from its current status");
        }
        const updated = await prisma.employeeChangeRequest.update({
          where: { changeId: change.changeId },
          data: { status: "REJECTED" },
        });
        res.json({ id: updated.changeId, status: updated.status });
        return;
      }

      if (body.decision === "APPROVE" && !isPeopleOps(req.user!.role)) {
        if (change.status !== "PENDING_MANAGER") {
          throw new HttpError(400, "Only manager-pending requests can be approved here");
        }
        const updated = await prisma.employeeChangeRequest.update({
          where: { changeId: change.changeId },
          data: {
            status: "PENDING_HR",
            managerApprovedById: req.user!.id,
            managerApprovedAt: new Date(),
          },
        });
        res.json({ id: updated.changeId, status: updated.status });
        return;
      }

      if (!isPeopleOps(req.user!.role)) {
        throw new HttpError(403, "HR must apply employment changes");
      }
      if (change.status !== "PENDING_HR" && change.status !== "APPROVED" && change.status !== "PENDING_MANAGER") {
        throw new HttpError(400, "This change request cannot be applied from its current status");
      }
      let hrLetterFileName = change.hrLetterFileName;
      let hrLetterStorageKey = change.hrLetterStorageKey;
      if (body.hrLetter) {
        const saved = await saveLifecycleFile(
          "hr-letter",
          body.hrLetter.fileName,
          body.hrLetter.contentBase64,
          body.hrLetter.mimeType,
        );
        hrLetterFileName = saved.fileName;
        hrLetterStorageKey = saved.storageKey;
      }
      await prisma.employeeChangeRequest.update({
        where: { changeId: change.changeId },
        data: {
          hrLetterFileName,
          hrLetterStorageKey,
          status: "APPROVED",
          hrApprovedById: req.user!.id,
          hrApprovedAt: new Date(),
        },
      });
      try {
        const applied = await applyEmployeeChange(
          { ...change, hrLetterFileName, hrLetterStorageKey },
          req.user!.id,
        );
        await audit({
          action: "LIFECYCLE_CHANGE_APPLY",
          performedByUserId: req.user!.id,
          newValue: { changeId: change.changeId, kind: change.kind },
        });
        res.json({ id: applied.changeId, status: applied.status });
      } catch (error) {
        await prisma.employeeChangeRequest.update({
          where: { changeId: change.changeId },
          data: {
            status: change.status === "PENDING_MANAGER" ? "PENDING_MANAGER" : "PENDING_HR",
            hrLetterFileName: change.hrLetterFileName,
            hrLetterStorageKey: change.hrLetterStorageKey,
          },
        });
        throw error;
      }
    }),
  );

  app.get(
    "/lifecycle/performance/cycles",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const cycles = await prisma.appraisalCycle.findMany({
        orderBy: { startsOn: "desc" },
        include: { _count: { select: { reviews: true } } },
      });
      res.json(
        cycles.map((cycle) => ({
          id: cycle.cycleId,
          name: cycle.name,
          startsOn: dateKey(cycle.startsOn),
          endsOn: dateKey(cycle.endsOn),
          status: cycle.status,
          reviewCount: cycle._count.reviews,
        })),
      );
    }),
  );

  app.post(
    "/lifecycle/performance/cycles",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(120),
          startsOn: z.string().min(8),
          endsOn: z.string().min(8),
        })
        .parse(req.body);
      const cycle = await prisma.appraisalCycle.create({
        data: { name: body.name, startsOn: new Date(body.startsOn), endsOn: new Date(body.endsOn) },
      });
      res.status(201).json({ id: cycle.cycleId });
    }),
  );

  app.post(
    "/lifecycle/performance/cycles/:id/assign",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          employeeId: z.string().min(1),
          managerUserId: z.string().min(1).optional(),
          skipLevelUserId: z.string().optional(),
          goals: z
            .array(
              z.object({
                kra: z.string().min(2).max(160),
                kpi: z.string().min(2).max(500),
                targetPercent: z.number().min(0).max(200).optional(),
              }),
            )
            .min(1),
        })
        .parse(req.body);
      const employee = await prisma.employee.findUnique({
        where: { employeeId: body.employeeId },
        include: { manager: { include: { user: true } } },
      });
      if (!employee) throw new HttpError(404, "Employee not found");
      const managerUserId = employee.manager?.user?.id ?? body.managerUserId;
      if (!managerUserId) {
        throw new HttpError(400, "Assign a reporting manager login before creating this review");
      }
      let skipLevelUserId = body.skipLevelUserId;
      if (!skipLevelUserId && employee.manager?.managerId) {
        const skip = await prisma.employee.findUnique({
          where: { employeeId: employee.manager.managerId },
          include: { user: true },
        });
        skipLevelUserId = skip?.user?.id;
      }
      const review = await prisma.appraisalReview.upsert({
        where: { cycleId_employeeId: { cycleId: routeParam(req, "id"), employeeId: body.employeeId } },
        create: {
          cycleId: routeParam(req, "id"),
          employeeId: body.employeeId,
          managerUserId,
          skipLevelUserId,
          status: "DRAFT",
          goals: {
            create: body.goals.map((goal, index) => ({
              kra: goal.kra,
              kpi: goal.kpi,
              targetPercent: goal.targetPercent ?? 100,
              sortOrder: index,
            })),
          },
        },
        update: { managerUserId, skipLevelUserId },
      });
      const goalCount = await prisma.performanceGoal.count({ where: { reviewId: review.reviewId } });
      if (goalCount === 0) {
        await prisma.performanceGoal.createMany({
          data: body.goals.map((goal, index) => ({
            reviewId: review.reviewId,
            kra: goal.kra,
            kpi: goal.kpi,
            targetPercent: goal.targetPercent ?? 100,
            sortOrder: index,
          })),
        });
      } else {
        // Append any newly supplied goals when HR re-opens assign for the same review.
        const existing = await prisma.performanceGoal.findMany({
          where: { reviewId: review.reviewId },
          select: { kra: true, kpi: true },
        });
        const fresh = body.goals.filter(
          (goal) => !existing.some((row) => row.kra === goal.kra && row.kpi === goal.kpi),
        );
        if (fresh.length) {
          await prisma.performanceGoal.createMany({
            data: fresh.map((goal, index) => ({
              reviewId: review.reviewId,
              kra: goal.kra,
              kpi: goal.kpi,
              targetPercent: goal.targetPercent ?? 100,
              sortOrder: goalCount + index,
            })),
          });
        }
      }
      res.json({ id: review.reviewId });
    }),
  );

  app.get(
    "/lifecycle/performance/reviews",
    requireAuth,
    asyncHandler(async (req, res) => {
      const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : undefined;
      const ownOnly = !isPeopleOps(req.user!.role);
      const rows = await prisma.appraisalReview.findMany({
        where: {
          cycleId,
          ...(ownOnly
            ? {
                OR: [
                  { employeeId: req.user!.employeeId ?? "__none__" },
                  { managerUserId: req.user!.id },
                  { skipLevelUserId: req.user!.id },
                ],
              }
            : {}),
        },
        include: {
          cycle: true,
          employee: { select: { name: true, employeeCode: true, designation: true } },
          manager: { select: { name: true } },
          goals: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { updatedAt: "desc" },
      });
      res.json(
        rows.map((row) => ({
          id: row.reviewId,
          cycleId: row.cycleId,
          cycleName: row.cycle.name,
          employeeId: row.employeeId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          designation: row.employee.designation,
          managerUserId: row.managerUserId,
          managerName: row.manager.name,
          skipLevelUserId: row.skipLevelUserId,
          status: row.status,
          employeeComment: row.employeeComment,
          managerComment: row.managerComment,
          skipLevelComment: row.skipLevelComment,
          skipLevelApprovedAt: row.skipLevelApprovedAt?.toISOString() ?? null,
          signedOffAt: row.signedOffAt?.toISOString() ?? null,
          goals: row.goals.map((goal) => ({
            id: goal.goalId,
            kra: goal.kra,
            kpi: goal.kpi,
            targetPercent: money(goal.targetPercent),
            achievedPercent: money(goal.achievedPercent),
            employeeComment: goal.employeeComment,
            managerComment: goal.managerComment,
          })),
        })),
      );
    }),
  );

  app.patch(
    "/lifecycle/performance/reviews/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const review = await prisma.appraisalReview.findUnique({
        where: { reviewId: routeParam(req, "id") },
        include: { goals: true },
      });
      if (!review) throw new HttpError(404, "Review not found");
      const body = z
        .object({
          employeeComment: z.string().max(4000).optional(),
          managerComment: z.string().max(4000).optional(),
          skipLevelComment: z.string().max(4000).optional(),
          goals: z
            .array(
              z.object({
                id: z.string(),
                achievedPercent: z.number().min(0).max(200).optional(),
                employeeComment: z.string().max(2000).optional(),
                managerComment: z.string().max(2000).optional(),
              }),
            )
            .optional(),
          action: z
            .enum(["SAVE", "EMPLOYEE_SUBMIT", "MANAGER_SUBMIT", "SKIP_APPROVE", "SIGN_OFF"])
            .optional(),
        })
        .parse(req.body);

      const isEmployee = req.user!.employeeId === review.employeeId;
      const isManager = req.user!.id === review.managerUserId;
      const isSkip = req.user!.id === review.skipLevelUserId;
      if (!isEmployee && !isManager && !isSkip && !isPeopleOps(req.user!.role)) {
        throw new HttpError(403, "You cannot update this review");
      }

      if (body.goals) {
        for (const goal of body.goals) {
          await prisma.performanceGoal.update({
            where: { goalId: goal.id },
            data: {
              achievedPercent: goal.achievedPercent,
              employeeComment: isEmployee ? goal.employeeComment : undefined,
              managerComment: isManager || isPeopleOps(req.user!.role) ? goal.managerComment : undefined,
            },
          });
        }
      }

      let status = review.status;
      const action = body.action ?? "SAVE";
      if (action === "EMPLOYEE_SUBMIT" && (isEmployee || isPeopleOps(req.user!.role))) status = "EMPLOYEE_SUBMITTED";
      if (action === "MANAGER_SUBMIT" && (isManager || isPeopleOps(req.user!.role))) {
        status = review.skipLevelUserId ? "SKIP_LEVEL_PENDING" : "MANAGER_REVIEWED";
      }
      if (action === "SKIP_APPROVE" && (isSkip || isPeopleOps(req.user!.role))) {
        if (review.status !== "SKIP_LEVEL_PENDING" && !isPeopleOps(req.user!.role)) {
          throw new HttpError(400, "Review is not waiting for skip-level approval");
        }
        status = "MANAGER_REVIEWED";
      }
      if (action === "SIGN_OFF" && (isManager || isPeopleOps(req.user!.role) || isSkip)) {
        if (review.status === "SKIP_LEVEL_PENDING") {
          throw new HttpError(400, "Skip-level approval is still pending");
        }
        if (review.status !== "MANAGER_REVIEWED" && review.status !== "SIGNED_OFF") {
          throw new HttpError(400, "Manager review must finish before sign-off");
        }
        status = "SIGNED_OFF";
      }

      const updated = await prisma.appraisalReview.update({
        where: { reviewId: review.reviewId },
        data: {
          employeeComment: body.employeeComment,
          managerComment: body.managerComment,
          skipLevelComment: body.skipLevelComment,
          skipLevelApprovedAt: action === "SKIP_APPROVE" ? new Date() : undefined,
          signedOffAt: action === "SIGN_OFF" ? new Date() : undefined,
          signedOffByUserId: action === "SIGN_OFF" ? req.user!.id : undefined,
          submittedAt: action === "EMPLOYEE_SUBMIT" ? new Date() : undefined,
          status,
        },
      });
      res.json({ id: updated.reviewId, status: updated.status });
    }),
  );

  app.get(
    "/lifecycle/offboarding",
    requireAuth,
    opsGate,
    asyncHandler(async (_req, res) => {
      const rows = await prisma.offboardingCase.findMany({
        include: { employee: { select: { name: true, employeeCode: true, designation: true, status: true } } },
        orderBy: { updatedAt: "desc" },
      });
      res.json(
        rows.map((row) => ({
          id: row.caseId,
          employeeId: row.employeeId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          designation: row.employee.designation,
          employeeStatus: row.employee.status,
          reason: row.reason,
          endDate: dateKey(row.endDate),
          status: row.status,
          accessRemovedAt: row.accessRemovedAt?.toISOString() ?? null,
          assetsClearedAt: row.assetsClearedAt?.toISOString() ?? null,
          noDuesAt: row.noDuesAt?.toISOString() ?? null,
          hasResignationLetter: Boolean(row.resignationLetterKey),
          resignationLetterKey: row.resignationLetterKey,
          resignationLetterName: row.resignationLetterName,
          hasExperienceLetter: Boolean(row.experienceLetterKey),
          experienceLetterKey: row.experienceLetterKey,
          experienceLetterName: row.experienceLetterName,
          hasInternCertificate: Boolean(row.internCertificateKey),
          internCertificateKey: row.internCertificateKey,
          internCertificateName: row.internCertificateName,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/lifecycle/offboarding",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          employeeId: z.string().min(1),
          reason: z.enum(["RESIGNATION", "TERMINATION", "INTERN_COMPLETE", "ABSCONDING"]),
          endDate: z.string().min(8),
          notes: z.string().max(4000).optional(),
        })
        .parse(req.body);
      const created = await prisma.offboardingCase.create({
        data: {
          employeeId: body.employeeId,
          reason: body.reason,
          endDate: new Date(body.endDate),
          notes: body.notes,
          startedByUserId: req.user!.id,
        },
      });
      await prisma.employee.update({
        where: { employeeId: body.employeeId },
        data: { lifecycleStage: "OFFBOARDING" },
      });
      await ensureChecklistInstance(body.employeeId, "OFFBOARDING");
      res.status(201).json({ id: created.caseId });
    }),
  );

  app.post(
    "/lifecycle/offboarding/:id/advance",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          step: z.enum(["ACCESS_REMOVED", "ASSETS_CLEARED", "NO_DUES", "LETTERS_ISSUED", "CLOSED"]),
          letter: z
            .object({
              kind: z.enum(["RESIGNATION", "EXPERIENCE", "INTERN"]),
              file: z.object({
                fileName: z.string(),
                contentBase64: z.string(),
                mimeType: z.string(),
              }),
            })
            .optional(),
          notes: z.string().max(4000).optional(),
        })
        .parse(req.body);
      const current = await prisma.offboardingCase.findUnique({ where: { caseId: routeParam(req, "id") } });
      if (!current) throw new HttpError(404, "Offboarding case not found");
      const data: Prisma.OffboardingCaseUpdateInput = { status: body.step, notes: body.notes };
      if (body.step === "ACCESS_REMOVED") data.accessRemovedAt = new Date();
      if (body.step === "ASSETS_CLEARED") data.assetsClearedAt = new Date();
      if (body.step === "NO_DUES") data.noDuesAt = new Date();
      if (body.letter) {
        const saved = await saveLifecycleFile(
          body.letter.kind.toLowerCase(),
          body.letter.file.fileName,
          body.letter.file.contentBase64,
          body.letter.file.mimeType,
        );
        if (body.letter.kind === "RESIGNATION") {
          data.resignationLetterKey = saved.storageKey;
          data.resignationLetterName = saved.fileName;
        } else if (body.letter.kind === "EXPERIENCE") {
          data.experienceLetterKey = saved.storageKey;
          data.experienceLetterName = saved.fileName;
        } else {
          data.internCertificateKey = saved.storageKey;
          data.internCertificateName = saved.fileName;
        }
      }
      if (body.step === "ACCESS_REMOVED") {
        await prisma.$transaction([
          prisma.employee.update({
            where: { employeeId: current.employeeId },
            data: { lifecycleStage: "OFFBOARDING" },
          }),
          prisma.user.updateMany({
            where: { employeeId: current.employeeId },
            data: { status: UserStatus.INACTIVE, deactivatedAt: new Date(), sessionVersion: { increment: 1 } },
          }),
        ]);
      }
      if (body.step === "CLOSED") {
        await prisma.$transaction([
          prisma.employee.update({
            where: { employeeId: current.employeeId },
            data: {
              status: EmployeeStatus.TERMINATED,
              terminatedAt: new Date(),
              lifecycleStage: "EXITED",
            },
          }),
          prisma.user.updateMany({
            where: { employeeId: current.employeeId },
            data: { status: UserStatus.INACTIVE, deactivatedAt: new Date(), sessionVersion: { increment: 1 } },
          }),
        ]);
      }
      const updated = await prisma.offboardingCase.update({ where: { caseId: current.caseId }, data });
      await audit({
        action: "LIFECYCLE_OFFBOARD_STEP",
        performedByUserId: req.user!.id,
        newValue: { caseId: current.caseId, step: body.step },
      });
      res.json({ id: updated.caseId, status: updated.status });
    }),
  );

  app.get(
    "/lifecycle/lms",
    requireAuth,
    asyncHandler(async (req, res) => {
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const articles = await prisma.sopArticle.findMany({
        where: {
          ...(kind ? { kind } : {}),
          ...(isPeopleOps(req.user!.role) ? {} : { published: true }),
        },
        include: {
          author: { select: { name: true } },
          reads: req.user!.employeeId
            ? { where: { employeeId: req.user!.employeeId } }
            : false,
        },
        orderBy: { updatedAt: "desc" },
      });
      res.json(
        articles.map((article) => ({
          id: article.articleId,
          title: article.title,
          kind: article.kind,
          category: article.category,
          body: article.body,
          fileName: article.fileName,
          fileKey: article.storageKey,
          hasFile: Boolean(article.storageKey),
          published: article.published,
          authorName: article.author.name,
          read: Array.isArray(article.reads) ? article.reads.length > 0 : false,
          createdAt: article.createdAt.toISOString(),
          updatedAt: article.updatedAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/lifecycle/lms",
    requireAuth,
    opsGate,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().trim().min(2).max(160),
          kind: z.enum(["SOP", "TRAINING"]),
          category: z.string().max(80).optional(),
          body: z.string().max(20000),
          published: z.boolean().optional(),
          file: filePayload,
        })
        .parse(req.body);
      let fileName: string | undefined;
      let storageKey: string | undefined;
      if (body.file) {
        const saved = await saveLifecycleFile("lms", body.file.fileName, body.file.contentBase64, body.file.mimeType);
        fileName = saved.fileName;
        storageKey = saved.storageKey;
      }
      const article = await prisma.sopArticle.create({
        data: {
          title: body.title,
          kind: body.kind,
          category: body.category,
          body: body.body,
          published: body.published ?? false,
          fileName,
          storageKey,
          authorUserId: req.user!.id,
        },
      });
      res.status(201).json({ id: article.articleId });
    }),
  );

  app.post(
    "/lifecycle/lms/:id/read",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "An employee profile is required to mark training as read");
      await prisma.sopRead.upsert({
        where: { articleId_employeeId: { articleId: routeParam(req, "id"), employeeId: req.user!.employeeId } },
        create: { articleId: routeParam(req, "id"), employeeId: req.user!.employeeId },
        update: { readAt: new Date() },
      });
      res.json({ ok: true });
    }),
  );

  app.get(
    "/lifecycle/files/:key",
    requireAuth,
    asyncHandler(async (req, res) => {
      const key = path.basename(routeParam(req, "key"));
      const [doc, article, change, offboarding] = await Promise.all([
        prisma.onboardingDocument.findFirst({
          where: { storageKey: key },
          include: { case: true },
        }),
        prisma.sopArticle.findFirst({ where: { storageKey: key } }),
        prisma.employeeChangeRequest.findFirst({ where: { hrLetterStorageKey: key } }),
        prisma.offboardingCase.findFirst({
          where: {
            OR: [
              { resignationLetterKey: key },
              { experienceLetterKey: key },
              { internCertificateKey: key },
            ],
          },
        }),
      ]);
      if (doc) await assertCanSeeEmployee(req.user!, doc.case.employeeId);
      else if (article) {
        if (!article.published && !isPeopleOps(req.user!.role)) throw new HttpError(404, "File not found");
      } else if (change) await assertCanSeeEmployee(req.user!, change.employeeId);
      else if (offboarding) {
        if (!isPeopleOps(req.user!.role)) throw new HttpError(403, "You cannot download this letter");
      } else {
        throw new HttpError(404, "File not found");
      }
      const buffer = await readFile(path.join(filesDir, key));
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${key}"`);
      res.send(buffer);
    }),
  );
}
