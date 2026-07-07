import type {
  AttendanceDailySummary,
  AttendanceEvent,
  BiometricDevice,
  Branch,
  Employee,
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
  > & { employee?: Pick<Employee, "homeBranchId" | "departmentId" | "designation"> | null },
) {
  return {
    id: user.id,
    employeeId: user.employeeId ?? undefined,
    name: user.name,
    email: user.email,
    phone: user.phone ?? undefined,
    role: roleToUi(user.role),
    active: user.status === "ACTIVE",
    homeBranchId: user.employee?.homeBranchId ?? undefined,
    department: user.employee?.departmentId ?? undefined,
    designation: user.employee?.designation ?? undefined,
    mustChangePassword: user.firstLoginPasswordChangeRequired,
  };
}

export function branchDto(branch: Branch) {
  return {
    id: branch.branchId,
    name: branch.branchName,
    code: branch.branchCode,
    address: branch.address,
  };
}

export function deviceDto(device: BiometricDevice) {
  return {
    id: device.deviceId,
    name: device.deviceName,
    branchId: device.branchId,
    serial: device.deviceCode,
    status: device.status === "ACTIVE" ? "online" : "offline",
    lastSync: device.lastSyncTime?.toISOString() ?? "",
  };
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
    punchIn: summary.firstCheckIn?.toISOString().slice(11, 16),
    punchOut: summary.lastCheckOut?.toISOString().slice(11, 16),
    status: summary.status,
    source:
      summary.attendanceSourceSummary === "MOBILE_GPS"
        ? "Mobile GPS"
        : summary.attendanceSourceSummary === "THUMB_SCANNER"
          ? "Thumb Scanner"
          : "System",
    branchMismatch: summary.isBranchMismatch,
  };
}

export function eventDto(
  event: AttendanceEvent & { branch?: Branch | null; device?: BiometricDevice | null },
) {
  return {
    time: event.eventTime.toISOString(),
    source: event.eventSource,
    type: event.eventType,
    branchName: event.branch?.branchName,
    deviceName: event.device?.deviceName,
    latitude: event.latitude ? Number(event.latitude) : undefined,
    longitude: event.longitude ? Number(event.longitude) : undefined,
    clientName: event.clientName ?? undefined,
    remarks: event.remarks ?? undefined,
    statusLabel: event.eventType.replaceAll("_", " "),
  };
}
