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
  UserStatus,
} from "@prisma/client";
import { roleToUi } from "./rbac.js";
import { decryptEmployeeField } from "./employeePrivateData.js";
import { isPhonePlaceholderEmail } from "./phone.js";
import { isLaptopAssetName } from "./laptopAsset.js";
import {
  branchMobileSourceLabel,
  formatLocationPlaceName,
  locationSourceLabel,
} from "./attendancePolicy.js";

/** Account activation lifecycle shown in User Logins / Employees. */
export type LoginLifecycle =
  "CREATED" | "PASSWORD_CHANGE" | "ACTIVE" | "INACTIVE" | "LOCKED" | "SUSPENDED";

export function resolveLoginLifecycle(user: {
  status: UserStatus;
  firstLoginPasswordChangeRequired: boolean;
  lastLoginAt: Date | null | undefined;
  suspensionStartsAt?: Date | null;
  suspendedUntil?: Date | null;
}): LoginLifecycle {
  const suspended = Boolean(
    user.suspensionStartsAt &&
    user.suspendedUntil &&
    user.suspensionStartsAt.getTime() <= Date.now() &&
    user.suspendedUntil.getTime() > Date.now(),
  );
  if (user.status === "LOCKED") return "LOCKED";
  if (user.status === "INACTIVE") return "INACTIVE";
  if (suspended) return "SUSPENDED";
  if (!user.lastLoginAt) return "CREATED";
  if (user.firstLoginPasswordChangeRequired) return "PASSWORD_CHANGE";
  return "ACTIVE";
}

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
    | "lastLoginAt"
    | "createdAt"
    | "suspendedUntil"
    | "suspensionStartsAt"
    | "deactivatedAt"
  > & {
    employee?: Pick<
      Employee,
      | "homeBranchId"
      | "companyEntity"
      | "companyPhone"
      | "departmentId"
      | "designation"
      | "attendanceMode"
      | "attendanceRequired"
      | "isFieldEmployee"
      | "weeklyOffPolicy"
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
      | "status"
      | "profileVerified"
      | "email"
      | "personalEmail"
      | "maritalStatus"
      | "fatherName"
      | "husbandName"
      | "presentDoorNo"
      | "presentFlatName"
      | "presentStreetName"
      | "presentAddress"
      | "presentCity"
      | "presentState"
      | "presentPincode"
      | "permanentDoorNo"
      | "permanentFlatName"
      | "permanentStreetName"
      | "permanentSameAsPresent"
      | "permanentAddress"
      | "permanentCity"
      | "permanentState"
      | "permanentPincode"
      | "bankAccountType"
      | "bankAccountHolderName"
      | "bankIfscCode"
      | "bankAccountNumberEncrypted"
      | "bankAccountNumberLast4"
      | "panNumberEncrypted"
      | "panNumberLast4"
      | "aadhaarNumberEncrypted"
      | "aadhaarNumberLast4"
      | "uanNumberEncrypted"
      | "uanNumberLast4"
    > & {
      department?: { name: string } | null;
      emergencyContact?: {
        contactName: string;
        relationship: string;
        phone: string;
        alternatePhone: string | null;
        address: string | null;
        bloodGroup: string | null;
        medicalNotes: string | null;
      } | null;
    } | null;
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
  const loginLifecycle = resolveLoginLifecycle(user);
  return {
    id: user.id,
    employeeId: user.employeeId ?? undefined,
    name: user.name,
    email: isPhonePlaceholderEmail(user.email) ? (user.phone ?? user.email) : user.email,
    phone: user.phone ?? undefined,
    role: roleToUi(user.role),
    status: user.status,
    loginLifecycle,
    deactivatedAt: user.deactivatedAt ? user.deactivatedAt.toISOString() : null,
    employeeStatus: user.employee?.status ?? undefined,
    active:
      user.status === "ACTIVE" &&
      (!user.suspendedUntil ||
        !user.suspensionStartsAt ||
        user.suspensionStartsAt.getTime() > Date.now() ||
        user.suspendedUntil.getTime() <= Date.now()),
    suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
    suspensionStartsAt: user.suspensionStartsAt ? user.suspensionStartsAt.toISOString() : null,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    homeBranchId: user.employee?.homeBranchId ?? undefined,
    companyEntity: user.employee?.companyEntity,
    companyPhone: user.employee?.companyPhone ?? undefined,
    departmentId: user.employee?.departmentId ?? undefined,
    department: user.employee?.departmentId ?? undefined,
    designation: user.employee?.designation ?? undefined,
    mustChangePassword: user.firstLoginPasswordChangeRequired,
    faceEnrollmentStatus,
    faceEnrollmentRequired:
      // Authoritative gate is GET /face/status (respects pause). This flag is a coarse UI hint.
      user.role !== "DEVELOPER_ADMIN" && faceEnrollmentStatus !== "APPROVED",
    faceEnrollmentReason: user.faceProfile?.rejectionReason ?? undefined,
    faceEnrollmentSubmittedAt: user.faceProfile?.submittedAt?.toISOString(),
    faceEnrollmentApprovedAt: user.faceProfile?.approvedAt?.toISOString(),
    attendanceMode: user.employee?.attendanceMode ?? undefined,
    attendanceRequired: user.employee?.attendanceRequired ?? undefined,
    isFieldEmployee: user.employee?.isFieldEmployee ?? undefined,
    weeklyOffPolicy: user.employee?.weeklyOffPolicy ?? undefined,
    profileVerified: user.employee?.profileVerified ?? false,
    /** Set by auth handlers from the active Dev Admin policy. Defaults off. */
    profileVerificationRequired: false,
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
    companyEmail:
      user.employee?.email ??
      (isPhonePlaceholderEmail(user.email) ? undefined : user.email),
    personalEmail: user.employee?.personalEmail ?? undefined,
    maritalStatus: user.employee?.maritalStatus ?? undefined,
    fatherName: user.employee?.fatherName ?? undefined,
    husbandName: user.employee?.husbandName ?? undefined,
    presentDoorNo: user.employee?.presentDoorNo ?? undefined,
    presentFlatName: user.employee?.presentFlatName ?? undefined,
    presentStreetName:
      user.employee?.presentStreetName ?? user.employee?.presentAddress ?? undefined,
    presentCity: user.employee?.presentCity ?? undefined,
    presentState: user.employee?.presentState ?? undefined,
    presentPincode: user.employee?.presentPincode ?? undefined,
    permanentSameAsPresent: user.employee?.permanentSameAsPresent ?? false,
    permanentDoorNo: user.employee?.permanentDoorNo ?? undefined,
    permanentFlatName: user.employee?.permanentFlatName ?? undefined,
    permanentStreetName:
      user.employee?.permanentStreetName ?? user.employee?.permanentAddress ?? undefined,
    permanentCity: user.employee?.permanentCity ?? undefined,
    permanentState: user.employee?.permanentState ?? undefined,
    permanentPincode: user.employee?.permanentPincode ?? undefined,
    departmentName: user.employee?.department?.name ?? undefined,
    bankAccountType: user.employee?.bankAccountType ?? undefined,
    bankAccountHolderName: user.employee?.bankAccountHolderName ?? undefined,
    bankIfscCode: user.employee?.bankIfscCode ?? undefined,
    bankAccountNumber: user.employee?.bankAccountNumberEncrypted
      ? decryptEmployeeField(user.employee.bankAccountNumberEncrypted)
      : undefined,
    bankAccountNumberLast4: user.employee?.bankAccountNumberLast4 ?? undefined,
    panNumber: user.employee?.panNumberEncrypted
      ? decryptEmployeeField(user.employee.panNumberEncrypted)
      : undefined,
    panNumberLast4: user.employee?.panNumberLast4 ?? undefined,
    aadhaarNumber: user.employee?.aadhaarNumberEncrypted
      ? decryptEmployeeField(user.employee.aadhaarNumberEncrypted)
      : undefined,
    aadhaarNumberLast4: user.employee?.aadhaarNumberLast4 ?? undefined,
    uanNumber: user.employee?.uanNumberEncrypted
      ? decryptEmployeeField(user.employee.uanNumberEncrypted)
      : undefined,
    uanNumberLast4: user.employee?.uanNumberLast4 ?? undefined,
    emergencyContact: user.employee?.emergencyContact
      ? {
          contactName: user.employee.emergencyContact.contactName,
          relationship: user.employee.emergencyContact.relationship,
          phone: user.employee.emergencyContact.phone,
          alternatePhone: user.employee.emergencyContact.alternatePhone ?? undefined,
          address: user.employee.emergencyContact.address ?? undefined,
          bloodGroup: user.employee.emergencyContact.bloodGroup ?? undefined,
          medicalNotes: user.employee.emergencyContact.medicalNotes ?? undefined,
        }
      : undefined,
  };
}

export function employeeDto(
  employee: Employee & {
    user?: Pick<
      User,
      | "id"
      | "role"
      | "status"
      | "failedLoginAttempts"
      | "firstLoginPasswordChangeRequired"
      | "lastLoginAt"
      | "suspensionStartsAt"
      | "suspendedUntil"
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
  extras?: {
    headedDepartments?: Array<{ id: string; name: string }>;
  },
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
  const loginLifecycle = employee.user
    ? resolveLoginLifecycle({
        status: employee.user.status,
        firstLoginPasswordChangeRequired: employee.user.firstLoginPasswordChangeRequired,
        lastLoginAt: employee.user.lastLoginAt,
        suspensionStartsAt: employee.user.suspensionStartsAt,
        suspendedUntil: employee.user.suspendedUntil,
      })
    : ("INACTIVE" as const);

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
    loginLifecycle,
    mustChangePassword: employee.user?.firstLoginPasswordChangeRequired ?? false,
    lastLoginAt: employee.user?.lastLoginAt ? employee.user.lastLoginAt.toISOString() : null,
    failedLoginAttempts: employee.user?.failedLoginAttempts ?? 0,
    suspensionStartsAt: employee.user?.suspensionStartsAt?.toISOString() ?? null,
    suspendedUntil: employee.user?.suspendedUntil?.toISOString() ?? null,
    homeBranchId: employee.homeBranchId ?? undefined,
    homeBranchName: employee.homeBranch
      ? formatLocationPlaceName(employee.homeBranch.branchName, employee.homeBranch.isHub) ||
        undefined
      : undefined,
    department: employee.department?.name ?? employee.departmentId ?? undefined,
    departmentId: employee.departmentId ?? undefined,
    headedDepartments: extras?.headedDepartments,
    designation: employee.designation ?? undefined,
    managerId: employee.managerId ?? undefined,
    managerName: employee.manager?.name,
    attendanceMode: employee.attendanceMode,
    attendanceRequired: employee.attendanceRequired,
    isFieldEmployee: employee.isFieldEmployee,
    weeklyOffPolicy: employee.weeklyOffPolicy,
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
    fatherName: showPrivateDetails ? (employee.fatherName ?? undefined) : undefined,
    husbandName: showPrivateDetails ? (employee.husbandName ?? undefined) : undefined,
    maritalStatus: showPrivateDetails ? (employee.maritalStatus ?? undefined) : undefined,
    personalEmail: showPrivateDetails ? (employee.personalEmail ?? undefined) : undefined,
    companyEmail: showPrivateDetails ? (employee.email ?? undefined) : undefined,
    presentDoorNo: showPrivateDetails ? (employee.presentDoorNo ?? undefined) : undefined,
    presentFlatName: showPrivateDetails ? (employee.presentFlatName ?? undefined) : undefined,
    presentStreetName: showPrivateDetails
      ? (employee.presentStreetName ?? employee.presentAddress ?? undefined)
      : undefined,
    presentAddress: showPrivateDetails ? (employee.presentAddress ?? undefined) : undefined,
    presentCity: showPrivateDetails ? (employee.presentCity ?? undefined) : undefined,
    presentState: showPrivateDetails ? (employee.presentState ?? undefined) : undefined,
    presentPincode: showPrivateDetails ? (employee.presentPincode ?? undefined) : undefined,
    permanentSameAsPresent: showPrivateDetails
      ? (employee.permanentSameAsPresent ?? undefined)
      : undefined,
    permanentDoorNo: showPrivateDetails ? (employee.permanentDoorNo ?? undefined) : undefined,
    permanentFlatName: showPrivateDetails ? (employee.permanentFlatName ?? undefined) : undefined,
    permanentStreetName: showPrivateDetails
      ? (employee.permanentStreetName ?? employee.permanentAddress ?? undefined)
      : undefined,
    permanentAddress: showPrivateDetails ? (employee.permanentAddress ?? undefined) : undefined,
    permanentCity: showPrivateDetails ? (employee.permanentCity ?? undefined) : undefined,
    permanentState: showPrivateDetails ? (employee.permanentState ?? undefined) : undefined,
    permanentPincode: showPrivateDetails ? (employee.permanentPincode ?? undefined) : undefined,
    profileVerified: employee.profileVerified ?? false,
    lifecycleStage: employee.lifecycleStage,
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
  unitCode?: string;
  description?: string | null;
  active?: boolean;
  headEmployeeId: string | null;
  parentDepartmentId: string | null;
  unitType: string;
  sortOrder: number;
  faceVerificationEnabled?: boolean;
  headEmployee?: Pick<Employee, "name"> | null;
  headAssignments?: Array<{
    employeeId: string;
    sortOrder: number;
    isPrimary?: boolean;
    employee?: Pick<Employee, "name"> | null;
  }>;
  viewerAssignments?: Array<{
    employeeId: string;
    sortOrder: number;
    employee?: Pick<Employee, "name"> | null;
  }>;
}) {
  const assignmentHeads = [...(department.headAssignments ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.employeeId.localeCompare(b.employeeId),
  );
  const headEmployeeIds =
    assignmentHeads.length > 0
      ? assignmentHeads.map((row) => row.employeeId)
      : department.headEmployeeId
        ? [department.headEmployeeId]
        : [];
  const heads =
    assignmentHeads.length > 0
      ? assignmentHeads
          .map((row) => row.employee?.name)
          .filter((name): name is string => Boolean(name))
      : department.headEmployee?.name
        ? [department.headEmployee.name]
        : [];
  const assignmentViewers = [...(department.viewerAssignments ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.employeeId.localeCompare(b.employeeId),
  );
  return {
    id: department.departmentId,
    name: department.name,
    unitCode: department.unitCode,
    description: department.description ?? undefined,
    active: department.active ?? true,
    headEmployeeId: headEmployeeIds[0] ?? undefined,
    primaryHeadEmployeeId: headEmployeeIds[0] ?? undefined,
    head: heads[0],
    headEmployeeIds,
    heads,
    viewerEmployeeIds: assignmentViewers.map((row) => row.employeeId),
    viewers: assignmentViewers
      .map((row) => row.employee?.name)
      .filter((name): name is string => Boolean(name)),
    parentDepartmentId: department.parentDepartmentId ?? undefined,
    unitType: department.unitType,
    sortOrder: department.sortOrder,
    faceVerificationEnabled: department.faceVerificationEnabled ?? true,
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
    isHub: Boolean(branch.isHub),
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
  isHub?: boolean | null,
): string {
  if (eventSource === "THUMB_SCANNER") {
    return locationSourceLabel("THUMB_SCANNER", branchName, isHub);
  }
  if (eventSource === "MOBILE_GPS" && branchName) {
    return branchMobileSourceLabel(branchName, isHub);
  }
  if (eventSource === "MOBILE_GPS") {
    return "Mobile";
  }

  const upper = eventType.toUpperCase();
  if (upper === "OFFICE_IN" || upper === "OFFICE_OUT" || upper.includes("BRANCH")) {
    return branchMobileSourceLabel(branchName, isHub);
  }
  if (upper.includes("CLIENT") || upper.includes("FIELD") || upper.includes("BREAK")) {
    return "Mobile";
  }

  return eventType.replaceAll("_", " ");
}

function movementLabel(event: AttendanceEvent & { branch?: Branch | null }) {
  const branchName = event.branch?.branchName;
  const isHub = event.branch?.isHub;
  const source = movementPlaceLabel(event.eventType, event.eventSource, branchName, isHub);
  const direction = movementDirectionLabel(event.eventType);
  return direction ? `${direction} · ${source}` : source;
}

export type BranchLabelMeta = { name: string; isHub: boolean };

export function attendanceRecordDto(
  summary: AttendanceDailySummary & { employee: Employee; primaryBranch?: Branch | null },
  options?: {
    branchNameById?: Record<string, string>;
    branchMetaById?: Record<string, BranchLabelMeta>;
  },
) {
  const branchId =
    summary.matchedBranchId ?? summary.primaryAttendedBranchId ?? summary.homeBranchId ?? undefined;
  const matchedMeta =
    (summary.primaryBranch
      ? {
          name: summary.primaryBranch.branchName,
          isHub: Boolean(summary.primaryBranch.isHub),
        }
      : undefined) ?? (branchId ? options?.branchMetaById?.[branchId] : undefined);
  const matchedBranchName =
    matchedMeta?.name ??
    summary.primaryBranch?.branchName ??
    (branchId ? options?.branchNameById?.[branchId] : undefined);
  const matchedIsHub = matchedMeta?.isHub ?? Boolean(summary.primaryBranch?.isHub);
  const sourceLabel =
    summary.attendanceSourceSummary === "BRANCH_MOBILE" || summary.checkInSource === "BRANCH_MOBILE"
      ? branchMobileSourceLabel(matchedBranchName, matchedIsHub)
      : summary.attendanceSourceSummary === "MOBILE" || summary.checkInSource === "MOBILE"
        ? "Mobile"
        : summary.attendanceSourceSummary === "THUMB_SCANNER" ||
            summary.checkInSource === "THUMB_SCANNER"
          ? locationSourceLabel("THUMB_SCANNER", matchedBranchName, matchedIsHub)
          : summary.attendanceSourceSummary === "MOBILE_GPS"
            ? summary.matchedBranchId || summary.primaryAttendedBranchId
              ? branchMobileSourceLabel(matchedBranchName, matchedIsHub)
              : "Mobile"
            : "System";

  return {
    id: summary.attendanceId,
    employeeId: summary.employeeId,
    employeeCode: summary.employee.employeeCode,
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
    branchName: event.branch
      ? formatLocationPlaceName(event.branch.branchName, event.branch.isHub) ||
        event.branch.branchName
      : undefined,
    isHub: event.branch ? Boolean(event.branch.isHub) : undefined,
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
    laptopName: asset.laptopName ?? undefined,
    deviceId: asset.deviceId ?? undefined,
    productId: asset.productId ?? undefined,
    processor: asset.processor ?? undefined,
    ram: asset.ram ?? undefined,
    ssd: asset.ssd ?? undefined,
    windowsVersion: asset.windowsVersion ?? undefined,
    macAddress: asset.macAddress ?? undefined,
    userPassword: isLaptopAssetName(asset.name)
      ? decryptEmployeeField(asset.userPasswordEncrypted)
      : undefined,
    adminPassword: isLaptopAssetName(asset.name)
      ? decryptEmployeeField(asset.adminPasswordEncrypted)
      : undefined,
    warrantyUntil: asset.warrantyUntil?.toISOString().slice(0, 10),
    assignments,
  };
  if (options?.hideCosts) {
    return {
      ...dto,
      purchaseValue: undefined,
      monthlyEquivalent: undefined,
      annualRecurring: undefined,
      costSharePerSeat: undefined,
      userPassword: undefined,
      adminPassword: undefined,
      assignments: assignments.map(
        ({ costShareAmount: _a, costShareFrequency: _f, ...seat }) => seat,
      ),
    };
  }
  return dto;
}

export function employeeVisibleAssetDto(assignment: {
  assignmentId: string;
  assignedAt: Date;
  asset: CompanyAsset & { branch?: Pick<Branch, "branchName"> | null };
}) {
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
