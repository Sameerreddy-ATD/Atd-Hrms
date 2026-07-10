import type {
  AttendanceDailySummary,
  AttendanceEvent,
  BiometricDevice,
  BiometricEmployeeMapping,
  Branch,
  Employee,
  Holiday,
  User,
} from "@prisma/client";
import { roleToUi } from "./rbac.js";

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
    | "suspendedUntil"
    | "suspensionStartsAt"
  > & {
    employee?: Pick<
      Employee,
      | "homeBranchId"
      | "departmentId"
      | "designation"
      | "attendanceMode"
      | "isFieldEmployee"
      | "employeeCode"
      | "dateOfBirth"
      | "gender"
    > | null;
  },
) {
  return {
    id: user.id,
    employeeId: user.employeeId ?? undefined,
    name: user.name,
    email: user.email,
    phone: user.phone ?? undefined,
    role: roleToUi(user.role),
    active:
      user.status === "ACTIVE" &&
      (!user.suspendedUntil ||
        !user.suspensionStartsAt ||
        user.suspensionStartsAt.getTime() > Date.now() ||
        user.suspendedUntil.getTime() <= Date.now()),
    suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
    suspensionStartsAt: user.suspensionStartsAt ? user.suspensionStartsAt.toISOString() : null,
    homeBranchId: user.employee?.homeBranchId ?? undefined,
    department: user.employee?.departmentId ?? undefined,
    designation: user.employee?.designation ?? undefined,
    mustChangePassword: user.firstLoginPasswordChangeRequired,
    attendanceMode: user.employee?.attendanceMode ?? undefined,
    isFieldEmployee: user.employee?.isFieldEmployee ?? undefined,
    employeeCode: user.employee?.employeeCode ?? undefined,
    dateOfBirth: user.employee?.dateOfBirth?.toISOString().slice(0, 10),
    gender: user.employee?.gender ?? undefined,
  };
}

export function employeeDto(
  employee: Employee & {
    user?: Pick<User, "id" | "role" | "status"> | null;
    department?: { name: string } | null;
    homeBranch?: Branch | null;
    manager?: Pick<Employee, "employeeId" | "name"> | null;
  },
  reqUser?: { id: string; role: string; employeeId?: string | null },
) {
  const showFullDOB =
    !reqUser ||
    reqUser.role === "DEVELOPER_ADMIN" ||
    reqUser.role === "MAIN_ADMIN" ||
    reqUser.role === "HR" ||
    reqUser.employeeId === employee.employeeId;

  let dobString: string | undefined = undefined;
  if (employee.dateOfBirth) {
    if (showFullDOB) {
      dobString = employee.dateOfBirth.toISOString().slice(0, 10);
    } else {
      dobString = `1900${employee.dateOfBirth.toISOString().slice(4, 10)}`;
    }
  }

  return {
    id: employee.user?.id ?? employee.employeeId,
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode,
    name: employee.name,
    email: employee.email ?? "",
    phone: employee.phone ?? undefined,
    role: employee.user ? roleToUi(employee.user.role) : "employee",
    active: employee.status === "ACTIVE" && employee.user?.status !== "INACTIVE",
    status: employee.status,
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
    employmentType: employee.employmentType ?? undefined,
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
    return `${branchName} - mobile`;
  }
  if (eventSource === "MOBILE_GPS") {
    return "Field - mobile";
  }

  const upper = eventType.toUpperCase();
  if (upper === "OFFICE_IN" || upper === "OFFICE_OUT" || upper.includes("BRANCH")) {
    return `${branchName ?? "Branch"} - mobile`;
  }
  if (upper.includes("CLIENT") || upper.includes("FIELD") || upper.includes("BREAK")) {
    return "Field - mobile";
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
    officeHours: Number(summary.officeHours),
    fieldHours: Number(summary.fieldHours),
    clientVisitHours: Number(summary.clientVisitHours),
    punchIn: formatToIstTime(summary.firstCheckIn),
    punchOut: formatToIstTime(summary.lastCheckOut),
    status: summary.status,
    source:
      summary.attendanceSourceSummary === "MOBILE_GPS"
        ? "Mobile GPS"
        : summary.attendanceSourceSummary === "THUMB_SCANNER"
          ? "Thumb Scanner"
          : "System",
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
    branchId: holiday.branchId ?? undefined,
    type: holiday.type,
    status: holiday.status,
  };
}
