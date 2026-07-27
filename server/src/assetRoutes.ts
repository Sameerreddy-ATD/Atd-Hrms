import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { Role } from "@prisma/client";
import { audit } from "./audit.js";
import {
  assignEmployeeToAsset,
  buildInvestmentSummary,
  recalculateActiveCostShares,
  resolveAssetStatus,
  returnAssetAssignment,
  syncAssetAssigneeDenorm,
} from "./assetRules.js";
import { asyncHandler, HttpError } from "./errors.js";
import {
  assetCatalogItemDto,
  companyAssetDto,
  employeeVisibleAssetDto,
} from "./mapper.js";
import { prisma } from "./prisma.js";
import { requireAuth, requireRoles } from "./rbac.js";
import {
  assetAssignManySchema,
  assetAssignSchema,
  assetCatalogItemSchema,
  assetCatalogItemUpdateSchema,
  assetReturnSchema,
  companyAssetSchema,
  companyAssetUpdateSchema,
} from "./schemas.js";

function listLimit(req: { query: Record<string, unknown> }, fallback = 100, max = 1000) {
  const requested = Number(req.query.limit);
  if (!Number.isFinite(requested) || requested <= 0) return fallback;
  return Math.min(Math.floor(requested), max);
}

function listOffset(req: { query: Record<string, unknown> }) {
  const requested = Number(req.query.offset);
  return Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 0;
}
const assetInclude = {
  assignedEmployee: true,
  branch: true,
  assignments: {
    where: { returnedAt: null },
    include: {
      employee: { select: { employeeId: true, name: true, employeeCode: true } },
    },
    orderBy: { assignedAt: "asc" as const },
  },
};

export function registerAssetRoutes(app: Express) {
  app.get(
    "/assets/mine",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(403, "Employee profile required");
      const rows = await prisma.assetAssignment.findMany({
        where: {
          employeeId: req.user!.employeeId,
          returnedAt: null,
          visibleToEmployee: true,
          asset: { status: { not: "RETIRED" } },
        },
        include: { asset: { include: { branch: true } } },
        orderBy: { assignedAt: "desc" },
      });
      res.json(rows.map(employeeVisibleAssetDto));
    }),
  );

  app.get(
    "/assets",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN, Role.CEO),
    asyncHandler(async (req, res) => {
      const query = String(req.query.q ?? "").trim();
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const assetType = typeof req.query.assetType === "string" ? req.query.assetType : undefined;
      const assignmentScope =
        typeof req.query.assignmentScope === "string" ? req.query.assignmentScope : undefined;
      const assets = await prisma.companyAsset.findMany({
        where: {
          ...(status && status !== "all" ? { status } : {}),
          ...(assetType && assetType !== "all"
            ? { assetType: assetType as "PHYSICAL" | "ONLINE" }
            : {}),
          ...(assignmentScope && assignmentScope !== "all"
            ? { assignmentScope: assignmentScope as "EMPLOYEE" | "COMPANY" }
            : {}),
          ...(query
            ? {
                OR: [
                  { assetCode: { contains: query } },
                  { name: { contains: query } },
                  { category: { contains: query } },
                  { serialNumber: { contains: query } },
                  { assignedEmployee: { name: { contains: query } } },
                  {
                    assignments: {
                      some: {
                        returnedAt: null,
                        employee: { name: { contains: query } },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        include: assetInclude,
        orderBy: [{ status: "asc" }, { name: "asc" }],
        skip: listOffset(req),
        take: listLimit(req, 500, 1000),
      });
      res.json(assets.map((asset) => companyAssetDto(asset)));
    }),
  );

  app.get(
    "/assets/investment-summary",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN, Role.CEO),
    asyncHandler(async (_req, res) => {
      const rows = await prisma.assetAssignment.findMany({
        include: {
          employee: { include: { department: true } },
          asset: { select: { assetType: true, status: true } },
        },
        orderBy: { assignedAt: "desc" },
      });
      res.json(buildInvestmentSummary(rows));
    }),
  );

  app.get(
    "/assets/catalog",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === "true";
      const items = await prisma.assetCatalogItem.findMany({
        where: includeInactive ? {} : { status: "ACTIVE" },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });
      res.json(items.map(assetCatalogItemDto));
    }),
  );

  app.post(
    "/assets/catalog",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = assetCatalogItemSchema.parse(req.body);
      const item = await prisma.assetCatalogItem.create({ data: body });
      await audit({
        action: "asset catalog item created",
        performedByUserId: req.user!.id,
        newValue: { catalogId: item.catalogId, name: item.name },
        ipAddress: req.ip,
      });
      res.status(201).json(assetCatalogItemDto(item));
    }),
  );

  app.patch(
    "/assets/catalog/:id",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = assetCatalogItemUpdateSchema.parse(req.body);
      const existing = await prisma.assetCatalogItem.findUniqueOrThrow({
        where: { catalogId: String(req.params.id) },
      });
      const item = await prisma.assetCatalogItem.update({
        where: { catalogId: existing.catalogId },
        data: body,
      });
      await audit({
        action: "asset catalog item updated",
        performedByUserId: req.user!.id,
        newValue: { catalogId: item.catalogId, name: item.name },
        ipAddress: req.ip,
      });
      res.json(assetCatalogItemDto(item));
    }),
  );

  app.delete(
    "/assets/catalog/:id",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const item = await prisma.assetCatalogItem.update({
        where: { catalogId: String(req.params.id) },
        data: { status: "INACTIVE" },
      });
      await audit({
        action: "asset catalog item deactivated",
        performedByUserId: req.user!.id,
        newValue: { catalogId: item.catalogId, status: item.status },
        ipAddress: req.ip,
      });
      res.json(assetCatalogItemDto(item));
    }),
  );

  app.post(
    "/assets",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = companyAssetSchema.parse(req.body);
      if (body.assetType !== "ONLINE" && !body.assetCode) {
        throw new HttpError(400, "Asset ID is required for physical assets");
      }
      const catalogItem = body.catalogId
        ? await prisma.assetCatalogItem.findFirst({
            where: { catalogId: body.catalogId, status: "ACTIVE" },
          })
        : undefined;
      if (body.catalogId && !catalogItem) {
        throw new HttpError(400, "Select an active item from Asset Catalog");
      }
      const assetType = body.assetType ?? "PHYSICAL";
      const assignmentScope = body.assignmentScope ?? "EMPLOYEE";
      const catalogType =
        catalogItem?.category === "Company Asset" ? "PHYSICAL" : catalogItem?.category;
      if (catalogType && catalogType !== assetType) {
        throw new HttpError(400, "Asset name does not match the selected asset type");
      }
      if (assignmentScope === "COMPANY" && body.assignedEmployeeId) {
        throw new HttpError(400, "Company-use assets cannot be assigned to an employee");
      }

      const {
        assignedEmployeeId,
        visibleToEmployee = true,
        catalogId,
        serialNumber,
        branchId,
        assetCode,
        name,
        purchaseValue,
        purchaseDate,
        costFrequency,
        renewalDate,
        location,
        notes,
        status: requestedStatus,
      } = body;

      let status: string;
      try {
        status = resolveAssetStatus({
          assignedEmployeeId: null,
          activeAssignmentCount: 0,
          requestedStatus: requestedStatus,
        });
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }

      const asset = await prisma.$transaction(async (tx) => {
        const created = await tx.companyAsset.create({
          data: {
            assetCode: assetCode ?? `ATD-ONL-${randomUUID().slice(0, 8).toUpperCase()}`,
            name: catalogItem?.name ?? name,
            category: assetType,
            assetType,
            assignmentScope,
            catalogId: catalogId || null,
            serialNumber: serialNumber || null,
            purchaseValue,
            purchaseDate: purchaseDate ?? null,
            costFrequency: costFrequency ?? "ONE_TIME",
            renewalDate: renewalDate ?? null,
            assignedEmployeeId: null,
            branchId: assetType === "ONLINE" ? null : branchId || null,
            location: location || null,
            notes: notes || null,
            status,
          },
        });
        if (assignedEmployeeId && assignmentScope === "EMPLOYEE") {
          return assignEmployeeToAsset(tx, {
            assetId: created.assetId,
            employeeId: assignedEmployeeId,
            visibleToEmployee,
            assetType,
            assignmentScope,
            purchaseValue: Number(created.purchaseValue),
            costFrequency: created.costFrequency,
          });
        }
        return tx.companyAsset.findUniqueOrThrow({
          where: { assetId: created.assetId },
          include: assetInclude,
        });
      });

      await audit({
        action: "company asset created",
        performedByUserId: req.user!.id,
        newValue: { assetId: asset.assetId, assetCode: asset.assetCode },
        ipAddress: req.ip,
      });
      res.status(201).json(companyAssetDto(asset));
    }),
  );

  app.patch(
    "/assets/:id",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = companyAssetUpdateSchema.parse(req.body);
      const existing = await prisma.companyAsset.findUniqueOrThrow({
        where: { assetId: String(req.params.id) },
      });
      const catalogItem = body.catalogId
        ? await prisma.assetCatalogItem.findFirst({
            where: { catalogId: body.catalogId, status: "ACTIVE" },
          })
        : body.catalogId === undefined && existing.catalogId
          ? await prisma.assetCatalogItem.findUnique({
              where: { catalogId: existing.catalogId },
            })
          : undefined;
      if (body.catalogId && !catalogItem) {
        throw new HttpError(400, "Select an active item from Asset Catalog");
      }

      const nextAssetType = body.assetType ?? existing.assetType;
      const nextAssignmentScope = body.assignmentScope ?? existing.assignmentScope;
      if (nextAssignmentScope === "COMPANY" && body.assignedEmployeeId) {
        throw new HttpError(400, "Company-use assets cannot be assigned to an employee");
      }

      const {
        assignedEmployeeId,
        visibleToEmployee,
        ...assetFields
      } = body;

      const asset = await prisma.$transaction(async (tx) => {
        await tx.companyAsset.update({
          where: { assetId: existing.assetId },
          data: {
            ...assetFields,
            name: catalogItem?.name ?? body.name ?? undefined,
            category: body.assetType ?? body.category ?? undefined,
            catalogId:
              body.catalogId === undefined ? undefined : body.catalogId || null,
            serialNumber:
              body.serialNumber === undefined ? undefined : body.serialNumber || null,
            branchId:
              nextAssetType === "ONLINE"
                ? null
                : body.branchId === undefined
                  ? undefined
                  : body.branchId || null,
            assignedEmployeeId: undefined,
          },
        });

        if (assignedEmployeeId !== undefined) {
          if (!assignedEmployeeId) {
            await returnAssetAssignment(tx, { assetId: existing.assetId });
          } else {
            const active = await tx.assetAssignment.findMany({
              where: { assetId: existing.assetId, returnedAt: null },
            });
            const already = active.find((row) => row.employeeId === assignedEmployeeId);
            if (!already) {
              if (nextAssetType === "PHYSICAL" && active.length) {
                await returnAssetAssignment(tx, { assetId: existing.assetId });
              }
              const latest = await tx.companyAsset.findUniqueOrThrow({
                where: { assetId: existing.assetId },
              });
              await assignEmployeeToAsset(tx, {
                assetId: existing.assetId,
                employeeId: assignedEmployeeId,
                visibleToEmployee: visibleToEmployee ?? true,
                assetType: latest.assetType,
                assignmentScope: latest.assignmentScope,
                purchaseValue: Number(latest.purchaseValue),
                costFrequency: latest.costFrequency,
              });
            } else if (visibleToEmployee !== undefined) {
              await tx.assetAssignment.update({
                where: { assignmentId: already.assignmentId },
                data: { visibleToEmployee },
              });
            }
          }
        } else if (visibleToEmployee !== undefined && existing.assignedEmployeeId) {
          await tx.assetAssignment.updateMany({
            where: {
              assetId: existing.assetId,
              employeeId: existing.assignedEmployeeId,
              returnedAt: null,
            },
            data: { visibleToEmployee },
          });
        }

        const latest = await tx.companyAsset.findUniqueOrThrow({
          where: { assetId: existing.assetId },
        });
        if (
          body.purchaseValue !== undefined ||
          body.costFrequency !== undefined
        ) {
          await recalculateActiveCostShares(tx, {
            assetId: latest.assetId,
            purchaseValue: Number(latest.purchaseValue),
            costFrequency: latest.costFrequency,
          });
        }
        return syncAssetAssigneeDenorm(tx, existing.assetId);
      });

      await audit({
        action: "company asset updated",
        performedByUserId: req.user!.id,
        newValue: { assetId: asset.assetId, status: asset.status },
        ipAddress: req.ip,
      });
      res.json(companyAssetDto(asset));
    }),
  );

  app.post(
    "/assets/:id/assign",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = assetAssignSchema.parse(req.body);
      const existing = await prisma.companyAsset.findUniqueOrThrow({
        where: { assetId: String(req.params.id) },
      });
      const employee = await prisma.employee.findFirst({
        where: { employeeId: body.employeeId, status: "ACTIVE" },
      });
      if (!employee) throw new HttpError(400, "Assigned employee must be active");
      try {
        const asset = await prisma.$transaction((tx) =>
          assignEmployeeToAsset(tx, {
            assetId: existing.assetId,
            employeeId: body.employeeId,
            visibleToEmployee: body.visibleToEmployee,
            assetType: existing.assetType,
            assignmentScope: existing.assignmentScope,
            purchaseValue: Number(existing.purchaseValue),
            costFrequency: existing.costFrequency,
          }),
        );
        await audit({
          action: "company asset assigned",
          performedByUserId: req.user!.id,
          newValue: {
            assetId: existing.assetId,
            employeeId: body.employeeId,
            visibleToEmployee: body.visibleToEmployee,
          },
          ipAddress: req.ip,
        });
        res.json(companyAssetDto(asset));
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
    }),
  );

  app.post(
    "/assets/:id/assign-many",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = assetAssignManySchema.parse(req.body);
      const existing = await prisma.companyAsset.findUniqueOrThrow({
        where: { assetId: String(req.params.id) },
      });
      if (existing.assetType !== "ONLINE") {
        throw new HttpError(400, "Bulk seat assignment is only for online assets");
      }
      if (existing.assignmentScope !== "EMPLOYEE") {
        throw new HttpError(400, "Company-use assets cannot be assigned to employees");
      }
      const asset = await prisma.$transaction(async (tx) => {
        for (const employeeId of body.employeeIds) {
          const employee = await tx.employee.findFirst({
            where: { employeeId, status: "ACTIVE" },
          });
          if (!employee) throw new HttpError(400, `Inactive or missing employee: ${employeeId}`);
          const already = await tx.assetAssignment.findFirst({
            where: { assetId: existing.assetId, employeeId, returnedAt: null },
          });
          if (already) continue;
          await assignEmployeeToAsset(tx, {
            assetId: existing.assetId,
            employeeId,
            visibleToEmployee: body.visibleToEmployee,
            assetType: existing.assetType,
            assignmentScope: existing.assignmentScope,
            purchaseValue: Number(existing.purchaseValue),
            costFrequency: existing.costFrequency,
          });
        }
        return syncAssetAssigneeDenorm(tx, existing.assetId);
      });
      await audit({
        action: "company asset seats assigned",
        performedByUserId: req.user!.id,
        newValue: {
          assetId: existing.assetId,
          employeeIds: body.employeeIds,
          visibleToEmployee: body.visibleToEmployee,
        },
        ipAddress: req.ip,
      });
      res.json(companyAssetDto(asset));
    }),
  );

  app.get(
    "/assets/returns/history",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (_req, res) => {
      const rows = await prisma.assetReturn.findMany({
        include: { asset: true, employee: true },
        orderBy: { returnedAt: "desc" },
        take: 500,
      });
      res.json(
        rows.map((row) => ({
          id: row.returnId,
          assetId: row.assetId,
          assetCode: row.asset.assetCode,
          assetName: row.asset.name,
          employeeId: row.employeeId,
          employeeCode: row.employee.employeeCode,
          employeeName: row.employee.name,
          condition: row.condition,
          accessoriesReturned: row.accessoriesReturned,
          chargerReturned: row.chargerReturned,
          dataBackedUp: row.dataBackedUp,
          dataWiped: row.dataWiped,
          physicalDamage: row.physicalDamage,
          damageNotes: row.damageNotes,
          remarks: row.remarks,
          returnedAt: row.returnedAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/assets/:id/return",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = assetReturnSchema.parse(req.body);
      const employeeId =
        typeof req.body.employeeId === "string" ? req.body.employeeId : undefined;
      const existing = await prisma.companyAsset.findUniqueOrThrow({
        where: { assetId: String(req.params.id) },
        include: {
          assignments: { where: { returnedAt: null } },
        },
      });
      const targetEmployeeId =
        employeeId ??
        existing.assignedEmployeeId ??
        (existing.assignments.length === 1 ? existing.assignments[0]!.employeeId : undefined);
      if (!targetEmployeeId) {
        throw new HttpError(400, "Select which employee seat to return for this asset");
      }
      const active = existing.assignments.find((row) => row.employeeId === targetEmployeeId);
      if (!active) throw new HttpError(409, "Only an assigned asset seat can be returned");

      const result = await prisma.$transaction(async (tx) => {
        await returnAssetAssignment(tx, {
          assetId: existing.assetId,
          employeeId: targetEmployeeId,
        });
        const returned = await tx.assetReturn.create({
          data: {
            assetId: existing.assetId,
            employeeId: targetEmployeeId,
            receivedByUserId: req.user!.id,
            ...body,
            damageNotes: body.damageNotes || null,
            remarks: body.remarks || null,
          },
          include: { asset: true, employee: true },
        });
        if (body.condition === "NOT_WORKING") {
          await tx.companyAsset.update({
            where: { assetId: existing.assetId },
            data: { status: "UNDER_REPAIR" },
          });
        }
        const asset = await syncAssetAssigneeDenorm(tx, existing.assetId);
        return { returned, asset };
      });

      await audit({
        action: "company asset returned",
        performedByUserId: req.user!.id,
        oldValue: { employeeId: targetEmployeeId, status: existing.status },
        newValue: { returnId: result.returned.returnId, condition: body.condition },
        ipAddress: req.ip,
      });
      res.status(201).json({
        asset: companyAssetDto(result.asset),
        returnId: result.returned.returnId,
      });
    }),
  );
}
