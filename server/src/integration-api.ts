import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import {
  AttendanceMode,
  CompanyEntity,
  EmployeeChangeType,
  EmployeeStatus,
  EmploymentType,
  Gender,
  IntegrationClientStatus,
  Prisma,
  ShiftType,
} from "@prisma/client";
import { z } from "zod";
import { audit } from "./audit.js";
import { asyncHandler, HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import { requireAuth, requireRoles } from "./rbac.js";
import { Role, UserStatus } from "@prisma/client";

export const INTEGRATION_SCOPES = [
  "employees:read",
  "employees:write",
  "employee-events:read",
] as const;

type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

declare global {
  namespace Express {
    interface Request {
      integrationClient?: {
        clientId: string;
        name: string;
        scopes: IntegrationScope[];
      };
    }
  }
}

const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.enum(INTEGRATION_SCOPES)).min(1),
  expiresAt: z.coerce.date().nullable().optional(),
});

const employeeCreateSchema = z.object({
  employeeCode: z.string().trim().min(1).max(40).optional(),
  externalReference: z.string().trim().min(1).max(191).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  companyPhone: z.string().trim().max(30).nullable().optional(),
  companyEntity: z.nativeEnum(CompanyEntity).optional(),
  departmentId: z.string().nullable().optional(),
  designation: z.string().trim().max(120).nullable().optional(),
  homeBranchId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  joiningDate: z.coerce.date().nullable().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  gender: z.nativeEnum(Gender).nullable().optional(),
  employmentType: z.nativeEnum(EmploymentType).nullable().optional(),
  organizationLevel: z.enum(["HEAD", "SENIOR", "JUNIOR", "MEMBER"]).optional(),
  attendanceMode: z.nativeEnum(AttendanceMode).optional(),
  attendanceRequired: z.boolean().optional(),
  isFieldEmployee: z.boolean().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  shiftType: z.nativeEnum(ShiftType).optional(),
  shiftStartMinutes: z.number().int().min(0).max(1439).optional(),
  shiftEndMinutes: z.number().int().min(0).max(1439).optional(),
});

const employeeUpdateSchema = employeeCreateSchema
  .omit({ employeeCode: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const employeeInclude = {
  department: { select: { departmentId: true, name: true } },
  homeBranch: { select: { branchId: true, branchName: true } },
  manager: { select: { employeeId: true, employeeCode: true, name: true } },
  user: { select: { id: true, status: true } },
} satisfies Prisma.EmployeeInclude;

type ExternalEmployee = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export function externalEmployeeDto(employee: ExternalEmployee) {
  return {
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode,
    externalReference: employee.externalReference,
    version: employee.version,
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    companyPhone: employee.companyPhone,
    status: employee.status,
    account: employee.user ? { userId: employee.user.id, status: employee.user.status } : null,
    organization: {
      departmentId: employee.departmentId,
      companyEntity: employee.companyEntity,
      parentCompanyName: "Royal Petro Park Private Limited",
      departmentName: employee.department?.name ?? null,
      designation: employee.designation,
      organizationLevel: employee.organizationLevel,
      homeBranchId: employee.homeBranchId,
      homeBranchName: employee.homeBranch?.branchName ?? null,
      managerId: employee.managerId,
      managerEmployeeCode: employee.manager?.employeeCode ?? null,
      managerName: employee.manager?.name ?? null,
    },
    employment: {
      joiningDate: employee.joiningDate?.toISOString().slice(0, 10) ?? null,
      dateOfBirth: employee.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      gender: employee.gender,
      employmentType: employee.employmentType,
      terminatedAt: employee.terminatedAt?.toISOString() ?? null,
    },
    attendance: {
      mode: employee.attendanceMode,
      required: employee.attendanceRequired,
      isFieldEmployee: employee.isFieldEmployee,
      shiftType: employee.shiftType,
      shiftStartMinutes: employee.shiftStartMinutes,
      shiftEndMinutes: employee.shiftEndMinutes,
    },
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  return value;
}

function requestFingerprint(req: Request) {
  return hash(
    JSON.stringify({
      method: req.method,
      path: req.path,
      ifMatch: req.header("if-match") ?? null,
      body: normalizeJson(req.body),
    }),
  );
}

function safeHashMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function requireIntegrationAuth(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const apiKey = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : req.header("x-api-key")?.trim();
  if (!apiKey || !apiKey.startsWith("atd_live_")) {
    return next(new HttpError(401, "A valid integration API key is required"));
  }

  const keyPrefix = apiKey.slice(0, 20);
  const client = await prisma.integrationClient.findUnique({ where: { keyPrefix } });
  if (
    !client ||
    client.status !== IntegrationClientStatus.ACTIVE ||
    (client.expiresAt && client.expiresAt.getTime() <= Date.now()) ||
    !safeHashMatch(hash(apiKey), client.secretHash)
  ) {
    return next(new HttpError(401, "Integration API key is invalid, expired, or revoked"));
  }

  const scopes = z.array(z.enum(INTEGRATION_SCOPES)).parse(client.scopes);
  req.integrationClient = { clientId: client.clientId, name: client.name, scopes };
  await prisma.integrationClient.update({
    where: { clientId: client.clientId },
    data: { lastUsedAt: new Date() },
  });
  return next();
}

function requireScope(scope: IntegrationScope) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.integrationClient?.scopes.includes(scope)) {
      return next(new HttpError(403, `Missing required scope: ${scope}`));
    }
    return next();
  };
}

async function replayIdempotentResponse(req: Request, res: Response) {
  const key = req.header("idempotency-key")?.trim();
  if (!key || key.length > 200) {
    throw new HttpError(400, "Idempotency-Key is required and must be at most 200 characters");
  }
  const clientId = req.integrationClient!.clientId;
  const existing = await prisma.integrationIdempotency.findUnique({
    where: { clientId_key: { clientId, key } },
  });
  if (!existing) return { key, fingerprint: requestFingerprint(req), replayed: false as const };
  if (existing.expiresAt.getTime() <= Date.now()) {
    await prisma.integrationIdempotency.delete({
      where: { idempotencyId: existing.idempotencyId },
    });
    return { key, fingerprint: requestFingerprint(req), replayed: false as const };
  }
  if (existing.requestHash !== requestFingerprint(req)) {
    throw new HttpError(409, "Idempotency-Key was already used for a different request");
  }
  res.setHeader("Idempotent-Replayed", "true");
  res.status(existing.responseCode).json(existing.responseBody);
  return { key, fingerprint: existing.requestHash, replayed: true as const };
}

function idempotencyData(
  clientId: string,
  key: string,
  requestHash: string,
  responseCode: number,
  responseBody: Prisma.InputJsonValue,
) {
  return {
    clientId,
    key,
    requestHash,
    responseCode,
    responseBody,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

function parseVersion(req: Request) {
  const raw = req.header("if-match")?.replaceAll('"', "").trim();
  const version = Number(raw);
  if (!raw || !Number.isInteger(version) || version < 1) {
    throw new HttpError(
      428,
      'If-Match with the current employee version is required, for example "3"',
    );
  }
  return version;
}

async function validateReferences(
  input: {
    departmentId?: string | null;
    homeBranchId?: string | null;
    managerId?: string | null;
  },
  employeeId?: string,
) {
  const [department, branch, manager] = await Promise.all([
    input.departmentId
      ? prisma.department.findUnique({ where: { departmentId: input.departmentId } })
      : null,
    input.homeBranchId
      ? prisma.branch.findUnique({ where: { branchId: input.homeBranchId } })
      : null,
    input.managerId ? prisma.employee.findUnique({ where: { employeeId: input.managerId } }) : null,
  ]);
  if (input.departmentId && !department) throw new HttpError(400, "departmentId does not exist");
  if (input.homeBranchId && !branch) throw new HttpError(400, "homeBranchId does not exist");
  if (input.managerId && (!manager || manager.status !== EmployeeStatus.ACTIVE)) {
    throw new HttpError(400, "managerId must reference an active employee");
  }
  if (employeeId && input.managerId === employeeId) {
    throw new HttpError(400, "Employee cannot be their own manager");
  }
}

async function nextEmployeeCode(tx: Prisma.TransactionClient) {
  const latest = await tx.employee.findFirst({
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });
  const current = Number(latest?.employeeCode.match(/\d+$/)?.[0] ?? "0");
  return `EMP-${String(current + 1).padStart(4, "0")}`;
}

export function registerIntegrationRoutes(app: Express) {
  app.get(
    "/integration-clients",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (_req, res) => {
      const clients = await prisma.integrationClient.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          clientId: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          status: true,
          expiresAt: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
        },
      });
      res.json(
        clients.map((client) => ({
          ...client,
          expiresAt: client.expiresAt?.toISOString() ?? null,
          lastUsedAt: client.lastUsedAt?.toISOString() ?? null,
          revokedAt: client.revokedAt?.toISOString() ?? null,
          createdAt: client.createdAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/integration-clients",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = clientSchema.parse(req.body);
      if (body.expiresAt && body.expiresAt.getTime() <= Date.now()) {
        throw new HttpError(400, "Expiry must be in the future");
      }
      const apiKey = `atd_live_${randomBytes(32).toString("base64url")}`;
      const client = await prisma.integrationClient.create({
        data: {
          name: body.name,
          keyPrefix: apiKey.slice(0, 20),
          secretHash: hash(apiKey),
          scopes: body.scopes,
          expiresAt: body.expiresAt ?? null,
          createdByUserId: req.user!.id,
        },
      });
      await audit({
        action: "integration client created",
        performedByUserId: req.user!.id,
        newValue: { clientId: client.clientId, name: client.name, scopes: body.scopes },
        ipAddress: req.ip,
      });
      res.status(201).json({
        clientId: client.clientId,
        name: client.name,
        keyPrefix: client.keyPrefix,
        scopes: body.scopes,
        expiresAt: client.expiresAt?.toISOString() ?? null,
        apiKey,
      });
    }),
  );

  app.delete(
    "/integration-clients/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const client = await prisma.integrationClient.update({
        where: { clientId: String(req.params.id) },
        data: { status: IntegrationClientStatus.REVOKED, revokedAt: new Date() },
      });
      await audit({
        action: "integration client revoked",
        performedByUserId: req.user!.id,
        newValue: { clientId: client.clientId, name: client.name },
        ipAddress: req.ip,
      });
      res.json({ clientId: client.clientId, status: client.status, revokedAt: client.revokedAt });
    }),
  );

  app.get("/api/v1", (_req, res) => {
    res.json({
      name: "Anytime Diesel Employee Integration API",
      version: "1.0.0",
      authentication: "Bearer API key",
      openapi: "/api/v1/openapi.yaml",
    });
  });

  app.get("/api/v1/openapi.yaml", (_req, res) => {
    res
      .type("application/yaml")
      .sendFile(resolve(process.cwd(), "docs", "openapi.employee-v1.yaml"));
  });

  app.get(
    "/api/v1/employees",
    requireIntegrationAuth,
    requireScope("employees:read"),
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const updatedSince =
        typeof req.query.updatedSince === "string" ? new Date(req.query.updatedSince) : undefined;
      if (updatedSince && Number.isNaN(updatedSince.getTime())) {
        throw new HttpError(400, "updatedSince must be a valid ISO-8601 date-time");
      }
      const status = req.query.status
        ? z.nativeEnum(EmployeeStatus).parse(req.query.status)
        : undefined;
      const rows = await prisma.employee.findMany({
        where: {
          status,
          updatedAt: updatedSince ? { gt: updatedSince } : undefined,
        },
        include: employeeInclude,
        orderBy: { employeeId: "asc" },
        ...(cursor ? { cursor: { employeeId: cursor }, skip: 1 } : {}),
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      res.json({
        data: page.map(externalEmployeeDto),
        page: {
          limit,
          hasMore,
          nextCursor: hasMore ? (page.at(-1)?.employeeId ?? null) : null,
        },
      });
    }),
  );

  app.get(
    "/api/v1/employees/:id",
    requireIntegrationAuth,
    requireScope("employees:read"),
    asyncHandler(async (req, res) => {
      const employee = await prisma.employee.findUniqueOrThrow({
        where: { employeeId: String(req.params.id) },
        include: employeeInclude,
      });
      res.setHeader("ETag", `"${employee.version}"`);
      res.json({ data: externalEmployeeDto(employee) });
    }),
  );

  app.post(
    "/api/v1/employees",
    requireIntegrationAuth,
    requireScope("employees:write"),
    asyncHandler(async (req, res) => {
      const cached = await replayIdempotentResponse(req, res);
      if (cached.replayed) return;
      const body = employeeCreateSchema.parse(req.body);
      await validateReferences(body);
      const response = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            ...body,
            employeeCode: body.employeeCode ?? (await nextEmployeeCode(tx)),
            email: body.email?.toLowerCase() ?? null,
            terminatedAt: body.status && body.status !== EmployeeStatus.ACTIVE ? new Date() : null,
          },
          include: employeeInclude,
        });
        const data = externalEmployeeDto(employee);
        await tx.employeeChangeEvent.create({
          data: {
            employeeId: employee.employeeId,
            eventType: EmployeeChangeType.CREATED,
            version: employee.version,
            payload: data,
          },
        });
        const result = { data } as Prisma.InputJsonObject;
        await tx.integrationIdempotency.create({
          data: idempotencyData(
            req.integrationClient!.clientId,
            cached.key,
            cached.fingerprint,
            201,
            result,
          ),
        });
        return result;
      });
      res.status(201).setHeader("ETag", '"1"').json(response);
    }),
  );

  app.patch(
    "/api/v1/employees/:id",
    requireIntegrationAuth,
    requireScope("employees:write"),
    asyncHandler(async (req, res) => {
      const cached = await replayIdempotentResponse(req, res);
      if (cached.replayed) return;
      const employeeId = String(req.params.id);
      const expectedVersion = parseVersion(req);
      const body = employeeUpdateSchema.parse(req.body);
      await validateReferences(body, employeeId);
      const existing = await prisma.employee.findUnique({
        where: { employeeId },
        include: { user: { select: { id: true } } },
      });
      if (!existing) throw new HttpError(404, "Employee not found");
      if (existing.user && body.email === null) {
        throw new HttpError(409, "Email cannot be removed while the employee has a login account");
      }

      const response = await prisma.$transaction(async (tx) => {
        const updated = await tx.employee.updateMany({
          where: { employeeId, version: expectedVersion },
          data: {
            ...body,
            email: body.email === undefined ? undefined : body.email?.toLowerCase(),
            version: { increment: 1 },
            terminatedAt:
              body.status && body.status !== EmployeeStatus.ACTIVE
                ? (existing.terminatedAt ?? new Date())
                : body.status === EmployeeStatus.ACTIVE
                  ? null
                  : undefined,
          },
        });
        if (updated.count !== 1) {
          throw new HttpError(409, "Employee version conflict; fetch the current record and retry");
        }
        if (existing.user) {
          await tx.user.update({
            where: { id: existing.user.id },
            data: {
              name: body.name,
              email: body.email === undefined ? undefined : body.email!.toLowerCase(),
              phone: body.phone,
              status:
                body.status && body.status !== EmployeeStatus.ACTIVE
                  ? UserStatus.INACTIVE
                  : body.status === EmployeeStatus.ACTIVE
                    ? UserStatus.ACTIVE
                    : undefined,
              deactivatedAt:
                body.status && body.status !== EmployeeStatus.ACTIVE
                  ? new Date()
                  : body.status === EmployeeStatus.ACTIVE
                    ? null
                    : undefined,
            },
          });
        }
        const employee = await tx.employee.findUniqueOrThrow({
          where: { employeeId },
          include: employeeInclude,
        });
        const data = externalEmployeeDto(employee);
        const statusChanged = body.status !== undefined && body.status !== existing.status;
        const eventType = statusChanged
          ? body.status !== EmployeeStatus.ACTIVE
            ? EmployeeChangeType.DEACTIVATED
            : EmployeeChangeType.REACTIVATED
          : EmployeeChangeType.UPDATED;
        await tx.employeeChangeEvent.create({
          data: { employeeId, eventType, version: employee.version, payload: data },
        });
        const result = { data } as Prisma.InputJsonObject;
        await tx.integrationIdempotency.create({
          data: idempotencyData(
            req.integrationClient!.clientId,
            cached.key,
            cached.fingerprint,
            200,
            result,
          ),
        });
        return result;
      });
      res.setHeader("ETag", `"${(response.data as { version: number }).version}"`);
      res.json(response);
    }),
  );

  app.delete(
    "/api/v1/employees/:id",
    requireIntegrationAuth,
    requireScope("employees:write"),
    asyncHandler(async (req, res) => {
      const cached = await replayIdempotentResponse(req, res);
      if (cached.replayed) return;
      const employeeId = String(req.params.id);
      const expectedVersion = parseVersion(req);
      const response = await prisma.$transaction(async (tx) => {
        const updated = await tx.employee.updateMany({
          where: { employeeId, version: expectedVersion },
          data: {
            status: EmployeeStatus.INACTIVE,
            terminatedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          const exists = await tx.employee.count({ where: { employeeId } });
          throw new HttpError(
            exists ? 409 : 404,
            exists
              ? "Employee version conflict; fetch the current record and retry"
              : "Employee not found",
          );
        }
        await tx.user.updateMany({
          where: { employeeId },
          data: { status: UserStatus.INACTIVE, deactivatedAt: new Date() },
        });
        const employee = await tx.employee.findUniqueOrThrow({
          where: { employeeId },
          include: employeeInclude,
        });
        const data = externalEmployeeDto(employee);
        await tx.employeeChangeEvent.create({
          data: {
            employeeId,
            eventType: EmployeeChangeType.DEACTIVATED,
            version: employee.version,
            payload: data,
          },
        });
        const result = { data } as Prisma.InputJsonObject;
        await tx.integrationIdempotency.create({
          data: idempotencyData(
            req.integrationClient!.clientId,
            cached.key,
            cached.fingerprint,
            200,
            result,
          ),
        });
        return result;
      });
      res.json(response);
    }),
  );

  app.get(
    "/api/v1/employee-events",
    requireIntegrationAuth,
    requireScope("employee-events:read"),
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
      let after = 0n;
      if (typeof req.query.after === "string") {
        try {
          after = BigInt(req.query.after);
        } catch {
          throw new HttpError(400, "after must be a non-negative event sequence");
        }
        if (after < 0n) throw new HttpError(400, "after must be a non-negative event sequence");
      }
      const events = await prisma.employeeChangeEvent.findMany({
        where: { sequence: { gt: after } },
        orderBy: { sequence: "asc" },
        take: limit + 1,
      });
      const hasMore = events.length > limit;
      const page = events.slice(0, limit);
      res.json({
        data: page.map((event) => ({
          sequence: event.sequence.toString(),
          eventId: event.eventId,
          employeeId: event.employeeId,
          type: event.eventType,
          version: event.version,
          employee: event.payload,
          occurredAt: event.occurredAt.toISOString(),
        })),
        page: {
          limit,
          hasMore,
          nextAfter: page.at(-1)?.sequence.toString() ?? after.toString(),
        },
      });
    }),
  );
}
