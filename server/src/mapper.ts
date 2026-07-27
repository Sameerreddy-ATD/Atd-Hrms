import type {
  AttendanceDailySummary,
  AttendanceEvent,
  BiometricDevice,
  BiometricEmployeeMapping,
  Branch,
  CompanyAsset,
  Employee,
  Holiday,
  User,
} from "@prisma/client";
import { roleToUi } from "./rbac.js";
import { decryptEmployeeField } from "./employeePrivateData.js";

export function userDto(
  user: Pick<
    User,
    | "id"
    | "employeeId"
    | "name"
    | "email"
    | "phone"
    | "role"
    | "status"
    | "firstLoginPasswordChangeRequired"
    | "failedLoginAttempts"
    | "suspendedUntil"
    | "suspensionStartsAt"
  > & {
    employee?: Pick<
      Employee,
      | "homeBranchId"
      | "companyEntity"
      | "companyPhone"
      | "departmentId"
      | "designation"
      | "attendanceMode"
      | "isFieldEmployee"
      | "employeeCode"
      | "dateOfBirth"
      | "gender"
      | "bloodGroup"
      | "employmentType"
      | "organizationLevel"
      | "joiningDate"
      | "shiftType"
      | "shiftStartMinutes"
      | "shiftEndMinutes"
    > | null;
    faceProfile?: {
      status: "PENDING" | "APPROVED" | "REJECTED" | "DISABLED";
      rejectionReason: string | null;
      submittedAt: Date;
      approvedAt: Date | null;
    } | null;
  },
) {
  const faceEnrollmentStatus =
    user.role === "DEVELOPER_ADMIN" ? "DISABLED" : (user.faceProfile?.status ?? "NOT_REGISTERED");
  return {
    id: user.id,
    employeeId: user.employeeId ?? undefined,
    name: user.name,
    email: user.email,
    phone: user.phone ?? undefined,
    role: roleToUi(user.role),
    status: user.status,
    failedLoginAttempts: user.failedLoginAttempts,
    active:
      user.status === "ACTIVE" &&
      (!user.suspendedUntil ||
        !user.suspensionStartsAt ||
        user.suspensionStartsAt.getTime() > Date.now() ||
        user.suspendedUntil.getTime() <= Date.now()),
    suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
    suspensionStartsAt: user.suspensionStartsAt ? user.suspensionStartsAt.toISOString() : null,
    homeBranchId: user.employee?.homeBranchId ?? undefined,
    companyEntity: user.employee?.companyEntity,
    companyPhone: user.employee?.companyPhone ?? undefined,
    department: user.employee?.departmentId ?? undefined,
    designation: user.employee?.designation ?? undefined,
    mustChangePassword: user.firstLoginPasswordChangeRequired,
    faceEnrollmentStatus,
    faceEnrollmentRequired: user.role !== "DEVELOPER_ADMIN" && faceEnrollmentStatus !== "APPROVED",
    faceEnrollmentReason: user.faceProfile?.rejectionReason ?? undefined,
    faceEnrollmentSubmittedAt: user.faceProfile?.submittedAt?.toISOString(),
    faceEnrollmentApprovedAt: user.faceProfile?.approvedAt?.toISOString(),
    attendanceMode: user.employee?.attendanceMode ?? undefined,
    isFieldEmployee: user.employee?.isFieldEmployee ?? undefined,
    employeeCode: user.employee?.employeeCode ?? undefined,
    dateOfBirth: user.employee?.dateOfBirth?.toISOString().slice(0, 10),
    gender: user.employee?.gender ?? undefined,
    bloodGroup: user.employee?.bloodGroup ?? undefined,
    employmentType: user.employee?.employmentType ?? undefined,
    organizationLevel: user.employee?.organizationLevel ?? undefined,
    joiningDate: user.employee?.joiningDate?.toISOString().slice(0, 10),
    shiftType: user.employee?.shiftType ?? undefined,
    shiftStartMinutes: user.employee?.shiftStartMinutes ?? undefined,
    shiftEndMinutes: user.employee?.shiftEndMinutes ?? undefined,
  };
}

export function employeeDto(
  employee: Employee & {
    user?: Pick<
      User,
      "id" | "role" | "status" | "failedLoginAttempts" | "suspensionStartsAt" | "suspendedUntil"
    > | null;
    department?: { name: string } | null;
    homeBranch?: Branch | null;
    manager?: Pick<Employee, "employeeId" | "name"> | null;
    emergencyContact?: {
      contactName: string;
      relationship: string;
      phone: string;
      alternatePhone: string | null;
      address: string | null;
      bloodGroup: string | null;
      medicalNotes: string | null;
    } | null;
  },
  reqUser?: { id: string; role: string; employeeId?: string | null },
  includePrivateDetails = false,
) {
  const showFullDOB =
    !reqUser ||
    reqUser.role === "DEVELOPER_ADMIN" ||
    reqUser.role === "MAIN_ADMIN" ||
    reqUser.role === "HR" ||
    reqUser.employeeId === employee.employeeId;
  const privateViewer =
    !reqUser ||
    reqUser.role === "DEVELOPER_ADMIN" ||
    reqUser.role === "MAIN_ADMIN" ||
    reqUser.role === "CEO" ||
    reqUser.role === "HR" ||
    reqUser.employeeId === employee.employeeId;
  const showPrivateDetails = includePrivateDetails && privateViewer;

  let dobString: string | undefined = undefined;
  if (employee.dateOfBirth) {
    if (showFullDOB) {
      dobString = employee.dateOfBirth.toISOString().slice(0, 10);
    } else {
      dobString = `1900${employee.dateOfBirth.toISOString().slice(4, 10)}`;
    }
  }

  const accountSuspended = Boolean(
    employee.user?.suspensionStartsAt &&
    employee.user.suspendedUntil &&
    employee.user.suspensionStartsAt.getTime() <= Date.now() &&
    employee.user.suspendedUntil.getTime() > Date.now(),
  );

  return {
    // Employee API identifiers are always employee identifiers. Consumers that
    // need the optional authentication account can use userId explicitly.
    id: employee.employeeId,
    userId: employee.user?.id ?? null,
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode,
    externalReference: employee.externalReference ?? null,
    version: employee.version,
    name: employee.name,
    email: employee.email ?? "",
    phone: employee.phone ?? undefined,
    companyPhone: employee.companyPhone ?? undefined,
    companyEntity: employee.companyEntity,
    role: employee.user ? roleToUi(employee.user.role) : "employee",
    active: employee.status === "ACTIVE" && employee.user?.status === "ACTIVE" && !accountSuspended,
    status: employee.status,
    accountStatus: accountSuspended ? "SUSPENDED" : (employee.user?.status ?? "INACTIVE"),
    failedLoginAttempts: employee.user?.failedLoginAttempts ?? 0,
    suspensionStartsAt: employee.user?.suspensionStartsAt?.toISOString() ?? null,
    suspendedUntil: employee.user?.suspendedUntil?.toISOString() ?? null,
    homeBranchId: employee.homeBranchId ?? undefined,
    homeBranchName: employee.homeBranch?.branchName,
    department: employee.department?.name ?? employee.departmentId ?? undefined,
    departmentId: employee.departmentId ?? undefined,
    designation: employee.designation ?? undefined,
    managerId: employee.managerId ?? undefined,
    managerName: employee.manager?.name,
    attendanceMode: employee.attendanceMode,
    isFieldEmployee: employee.isFieldEmployee,
    joiningDate: employee.joiningDate?.toISOString().slice(0, 10),
    dateOfBirth: dobString,
    gender: employee.gender ?? undefined,
    bloodGroup: employee.bloodGroup ?? undefined,
    employmentType: employee.employmentType ?? undefined,
    organizationLevel: employee.organizationLevel,
    bankAccountType: showPrivateDetails ? (employee.bankAccountType ?? undefined) : undefined,
    bankAccountHolderName: showPrivateDetails
      ? (employee.bankAccountHolderName ?? undefined)
      : undefined,
    bankIfscCode: showPrivateDetails ? (employee.bankIfscCode ?? undefined) : undefined,
    bankAccountNumber: showPrivateDetails
      ? decryptEmployeeField(employee.bankAccountNumberEncrypted)
      : undefined,
    bankAccountNumberLast4: showPrivateDetails
      ? (employee.bankAccountNumberLast4 ?? undefined)
      : undefined,
    panNumber: showPrivateDetails ? decryptEmployeeField(employee.panNumberEncrypted) : undefined,
    panNumberLast4: showPrivateDetails ? (employee.panNumberLast4 ?? undefined) : undefined,
    aadhaarNumber: showPrivateDetails
      ? decryptEmployeeField(employee.aadhaarNumberEncrypted)
      : undefined,
    aadhaarNumberLast4: showPrivateDetails ? (employee.aadhaarNumberLast4 ?? undefined) : undefined,
    uanNumber: showPrivateDetails ? decryptEmployeeField(employee.uanNumberEncrypted) : undefined,
    uanNumberLast4: showPrivateDetails ? (employee.uanNumberLast4 ?? undefined) : undefined,
    shiftType: employee.shiftType,
    shiftStartMinutes: employee.shiftStartMinutes,
    shiftEndMinutes: employee.shiftEndMinutes,
    terminatedAt: employee.terminatedAt?.toISOString() ?? null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
    emergencyContact:
      showPrivateDetails && employee.emergencyContact
        ? {
            contactName: employee.emergencyContact.contactName,
            relationship: employee.emergencyContact.relationship,
            phone: employee.emergencyContact.phone,
            alternatePhone: employee.emergencyContact.alternatePhone ?? undefined,
            address: employee.emergencyContact.address ?? undefined,
            bloodGroup: employee.emergencyContact.bloodGroup ?? undefined,
            medicalNotes: employee.emergencyContact.medicalNotes ?? undefined,
          }
        : showPrivateDetails
          ? null
          : undefined,
  };
}

export function departmentDto(department: {
  departmentId: string;
  name: string;
  headEmployeeId: string | null;
  parentDepartmentId: string | null;
  unitType: string;
  sortOrder: number;
  headEmployee?: Pick<Employee, "name"> | null;
}) {
  return {
    id: department.departmentId,
    name: department.name,
    headEmployeeId: department.headEmployeeId ?? undefined,
    head: department.headEmployee?.name,
    parentDepartmentId: department.parentDepartmentId ?? undefined,
    unitType: department.unitType,
    sortOrder: department.sortOrder,
  };
}

export function branchDto(branch: Branch) {
  return {
    id: branch.branchId,
    name: branch.branchName,
    code: branch.branchCode,
    address: branch.address,
    city: branch.city ?? undefined,
    status: branch.status,
    latitude: branch.latitude == null ? undefined : Number(branch.latitude),
    longitude: branch.longitude == null ? undefined : Number(branch.longitude),
    attendanceRadiusMeters: branch.attendanceRadiusMeters,
  };
}

export function deviceDto(device: BiometricDevice) {
  return {
    id: device.deviceId,
    name: device.deviceName,
    branchId: device.branchId,
    serial: device.deviceCode,
    deviceIp: device.deviceIp ?? undefined,
    port: device.port ?? undefined,
    location: device.location ?? undefined,
    status: device.status === "ACTIVE" ? "online" : "offline",
    rawStatus: device.status,
    lastSync: device.lastSyncTime?.toISOString() ?? "",
  };
}

export function biometricMappingDto(
  mapping: BiometricEmployeeMapping & {
    employee?: Pick<Employee, "employeeId" | "employeeCode" | "name" | "homeBranchId"> | null;
    device?: Pick<BiometricDevice, "deviceId" | "deviceName" | "deviceCode" | "branchId"> | null;
  },
) {
  return {
    id: mapping.mappingId,
    employeeId: mapping.employeeId,
    employeeCode: mapping.employee?.employeeCode,
    employeeName: mapping.employee?.name,
    homeBranchId: mapping.employee?.homeBranchId ?? undefined,
    biometricUserId: mapping.biometricUserId,
    deviceId: mapping.deviceId ?? undefined,
    deviceName: mapping.device?.deviceName,
    deviceCode: mapping.device?.deviceCode,
    deviceBranchId: mapping.device?.branchId,
    status: mapping.status,
  };
}

export function formatToIstTime(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const hh = String(istDate.getUTCHours()).padStart(2, "0");
  const mm = String(istDate.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function movementDirectionLabel(eventType: string) {
  const upper = eventType.toUpperCase();
  if (upper.endsWith("_IN") || upper === "BREAK_IN") return "In";
  if (upper.endsWith("_OUT") || upper === "BREAK_OUT") return "Out";
  return "";
}

function movementPlaceLabel(
  eventType: string,
  eventSource: string,
  branchName?: string | null,
): string {
  if (eventSource === "THUMB_SCANNER") {
    return `${branchName ?? "Branch"} - biometric`;
  }
  if (eventSource === "MOBILE_GPS" && branchName) {
    return `Mobile - ${branchName}`;
  }
  if (eventSource === "MOBILE_GPS") {
    return "Mobile";
  }

  const upper = eventType.toUpperCase();
  if (upper === "OFFICE_IN" || upper === "OFFICE_OUT" || upper.includes("BRANCH")) {
    return `Mobile - ${branchName ?? "Branch"}`;
  }
  if (upper.includes("CLIENT") || upper.includes("FIELD") || upper.includes("BREAK")) {
    return "Mobile";
  }

  return eventType.replaceAll("_", " ");
}

function movementLabel(event: AttendanceEvent & { branch?: Branch | null }) {
  const branchName = event.branch?.branchName;
  const source = movementPlaceLabel(event.eventType, event.eventSource, branchName);
  const direction = movementDirectionLabel(event.eventType);
  return direction ? `${direction} · ${source}` : source;
}

export function attendanceRecordDto(
  summary: AttendanceDailySummary & { employee: Employee; primaryBranch?: Branch | null },
) {
  const matchedBranchName = summary.primaryBranch?.branchName;
  const sourceLabel =
    summary.attendanceSourceSummary === "BRANCH_MOBILE" || summary.checkInSource === "BRANCH_MOBILE"
      ? matchedBranchName
        ? `Branch-Mobile · ${matchedBranchName}`
        : "Branch-Mobile"
      : summary.attendanceSourceSummary === "MOBILE" || summary.checkInSource === "MOBILE"
        ? "Mobile"
        : summary.attendanceSourceSummary === "THUMB_SCANNER" ||
            summary.checkInSource === "THUMB_SCANNER"
          ? "Thumb Scanner"
          : summary.attendanceSourceSummary === "MOBILE_GPS"
            ? summary.matchedBranchId || summary.primaryAttendedBranchId
              ? matchedBranchName
                ? `Branch-Mobile · ${matchedBranchName}`
                : "Branch-Mobile"
              : "Mobile"
            : "System";

  return {
    id: summary.attendanceId,
    employeeId: summary.employeeId,
    employeeName: summary.employee.name,
    date: summary.date.toISOString().slice(0, 10),
    homeBranchId: summary.homeBranchId ?? "",
    scheduledBranchId: summary.scheduledBranchId ?? undefined,
    actualBranchId: summary.primaryAttendedBranchId ?? undefined,
    visitedBranchIds: summary.visitedBranchIds,
    visitedLocations: summary.visitedLocations,
    branchMovementCount: summary.branchMovementCount,
    fieldVisitCount: summary.fieldVisitCount,
    clientVisitCount: summary.clientVisitCount,
    totalHours: Number(summary.totalHours),
    workedMinutes: Math.round(Number(summary.totalHours) * 60),
    hasMissingOutEvent: summary.hasMissingOutEvent,
    hasMissedCheckout: summary.hasMissedCheckout || summary.isMissedCheckout,
    isLate: summary.isLate,
    isLocked: summary.isLocked,
    attendanceResult: summary.attendanceResult,
    correctionDeadlineAt: summary.correctionDeadlineAt?.toISOString(),
    provisionalCheckOutAt: summary.provisionalCheckOutAt?.toISOString(),
    officeHours: Number(summary.officeHours),
    fieldHours: Number(summary.fieldHours),
    clientVisitHours: Number(summary.clientVisitHours),
    punchIn: formatToIstTime(summary.firstCheckIn),
    punchOut: formatToIstTime(summary.lastCheckOut),
    status: summary.status,
    source: sourceLabel,
    checkInSource: summary.checkInSource ?? undefined,
    checkOutSource: summary.checkOutSource ?? undefined,
    branchMismatch: summary.isBranchMismatch,
    fieldCheckInLatitude: summary.fieldCheckInLatitude
      ? Number(summary.fieldCheckInLatitude)
      : undefined,
    fieldCheckInLongitude: summary.fieldCheckInLongitude
      ? Number(summary.fieldCheckInLongitude)
      : undefined,
    fieldCheckOutLatitude: summary.fieldCheckOutLatitude
      ? Number(summary.fieldCheckOutLatitude)
      : undefined,
    fieldCheckOutLongitude: summary.fieldCheckOutLongitude
      ? Number(summary.fieldCheckOutLongitude)
      : undefined,
  };
}

export function eventDto(
  event: AttendanceEvent & {
    branch?: Branch | null;
    device?: BiometricDevice | null;
    employee?: Pick<Employee, "employeeId" | "name"> | null;
  },
) {
  return {
    employeeId: event.employee?.employeeId ?? event.employeeId,
    employeeName: event.employee?.name,
    date: event.eventDate.toISOString().slice(0, 10),
    time: event.eventTime.toISOString(),
    source: event.eventSource,
    type: event.eventType,
    branchName: event.branch?.branchName,
    deviceName: event.device?.deviceName,
    latitude: event.latitude ? Number(event.latitude) : undefined,
    longitude: event.longitude ? Number(event.longitude) : undefined,
    clientName: event.clientName ?? undefined,
    clientLocationName: event.clientLocationName ?? undefined,
    remarks: event.remarks ?? undefined,
    statusLabel: movementLabel(event),
    address: event.address ?? undefined,
    photoUrl: event.photoUrl ?? undefined,
  };
}

export function holidayDto(holiday: Holiday) {
  return {
    id: holiday.holidayId,
    name: holiday.name,
    date: holiday.date.toISOString().slice(0, 10),
    description: (holiday as { description?: string | null }).description ?? undefined,
    type: holiday.type,
    status: holiday.status,
  };
}

export function companyAssetDto(
  asset: CompanyAsset & {
    assignedEmployee?: Pick<Employee, "employeeId" | "employeeCode" | "name"> | null;
    branch?: Pick<Branch, "branchId" | "branchName"> | null;
    assignments?: Array<{
      assignmentId: string;
      employeeId: string;
      visibleToEmployee: boolean;
      assignedAt: Date;
      returnedAt: Date | null;
      costShareAmount: { toString(): string } | number;
      costShareFrequency: "ONE_TIME" | "MONTHLY" | "YEARLY";
      employee?: Pick<Employee, "employeeId" | "employeeCode" | "name"> | null;
    }>;
  },
  options?: { hideCosts?: boolean },
) {
  const purchaseValue = Number(asset.purchaseValue);
  const activeAssignments = (asset.assignments ?? []).filter((row) => !row.returnedAt);
  const seatCount = activeAssignments.length;
  const share =
    seatCount > 0
      ? Number(activeAssignments[0]?.costShareAmount ?? purchaseValue / seatCount)
      : purchaseValue;
  const assignments = activeAssignments.map((row) => ({
    id: row.assignmentId,
    employeeId: row.employeeId,
    employeeName: row.employee?.name,
    employeeCode: row.employee?.employeeCode,
    visibleToEmployee: row.visibleToEmployee,
    assignedAt: row.assignedAt.toISOString(),
    costShareAmount: Number(row.costShareAmount),
    costShareFrequency: row.costShareFrequency,
  }));
  const dto = {
    id: asset.assetId,
    assetCode: asset.assetCode,
    name: asset.name,
    category: asset.category,
    catalogId: asset.catalogId ?? undefined,
    serialNumber: asset.serialNumber ?? undefined,
    purchaseValue,
    purchaseDate: asset.purchaseDate?.toISOString().slice(0, 10),
    assetType: asset.assetType,
    assignmentScope: asset.assignmentScope,
    costFrequency: asset.costFrequency,
    renewalDate: asset.renewalDate?.toISOString().slice(0, 10),
    monthlyEquivalent:
      asset.costFrequency === "MONTHLY"
        ? purchaseValue
        : asset.costFrequency === "YEARLY"
          ? purchaseValue / 12
          : 0,
    annualRecurring:
      asset.costFrequency === "MONTHLY"
        ? purchaseValue * 12
        : asset.costFrequency === "YEARLY"
          ? purchaseValue
          : 0,
    status: asset.status,
    assignedEmployeeId: asset.assignedEmployeeId ?? undefined,
    assignedEmployeeName: asset.assignedEmployee?.name,
    assignedEmployeeCode: asset.assignedEmployee?.employeeCode,
    activeSeatCount: seatCount,
    costSharePerSeat: seatCount > 0 ? share : undefined,
    branchId: asset.branchId ?? undefined,
    branchName: asset.branch?.branchName,
    location: asset.location ?? undefined,
    notes: asset.notes ?? undefined,
    assignments,
  };
  if (options?.hideCosts) {
    return {
      ...dto,
      purchaseValue: undefined,
      monthlyEquivalent: undefined,
      annualRecurring: undefined,
      costSharePerSeat: undefined,
      assignments: assignments.map(({ costShareAmount: _a, costShareFrequency: _f, ...seat }) => seat),
    };
  }
  return dto;
}

export function employeeVisibleAssetDto(
  assignment: {
    assignmentId: string;
    assignedAt: Date;
    asset: CompanyAsset & { branch?: Pick<Branch, "branchName"> | null };
  },
) {
  return {
    id: assignment.assignmentId,
    assetId: assignment.asset.assetId,
    assetCode: assignment.asset.assetCode,
    name: assignment.asset.name,
    category: assignment.asset.category,
    serialNumber: assignment.asset.serialNumber ?? undefined,
    assetType: assignment.asset.assetType,
    assignmentScope: assignment.asset.assignmentScope,
    costFrequency: assignment.asset.costFrequency,
    renewalDate: assignment.asset.renewalDate?.toISOString().slice(0, 10),
    status: assignment.asset.status,
    location: assignment.asset.location ?? undefined,
    branchName: assignment.asset.branch?.branchName,
    assignedAt: assignment.assignedAt.toISOString(),
  };
}

export function assetCatalogItemDto(item: {
  catalogId: string;
  name: string;
  category: string;
  defaultValue: { toString(): string } | null;
  status: string;
}) {
  return {
    id: item.catalogId,
    name: item.name,
    category: item.category,
    defaultValue: item.defaultValue === null ? undefined : Number(item.defaultValue),
    status: item.status,
  };
}
