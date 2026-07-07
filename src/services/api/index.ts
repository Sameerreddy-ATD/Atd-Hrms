// -----------------------------------------------------------------------------
// Mock API layer for AnytimeDiesel HRMS.
//
// ⚠️ INTEGRATION NOTE
// All functions below return promises that resolve with in-memory mock data.
// Backend engineers should replace the bodies of these functions with real
// `fetch`/HTTP calls (e.g. `fetch('/api/employees')`) while keeping the
// function signatures intact so the UI does not need to change.
//
// Do NOT store JWTs in localStorage in production. Use secure HTTP-only
// cookies via the backend. The demo auth here uses localStorage ONLY for
// mock-mode persistence and must be removed at integration time.
// -----------------------------------------------------------------------------

import {
  attendanceRecords,
  auditLogs,
  biometricDevices,
  branches,
  departments,
  holidays,
  leaveRequests,
  myLeaveBalance,
  users,
} from "@/mock/data";
import type {
  AttendanceRecord,
  AuditLog,
  BiometricDevice,
  Branch,
  Department,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  Role,
  User,
} from "@/mock/types";

const delay = <T>(data: T, ms = 250) =>
  new Promise<T>((res) => setTimeout(() => res(data), ms));

// ---------------------------------------------------------------------------
// authApi
// ---------------------------------------------------------------------------
export const authApi = {
  login: (email: string, _password: string) => {
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return Promise.reject(new Error("Invalid credentials"));
    return delay({ user, token: "mock-token" });
  },
  loginAsRole: (role: Role) => {
    const user = users.find((u) => u.role === role);
    if (!user) return Promise.reject(new Error("No user for role"));
    return delay({ user, token: "mock-token" });
  },
  forgotPassword: (_email: string) => delay({ ok: true }),
  changePassword: (_old: string, _next: string) => delay({ ok: true }),
  logout: () => delay({ ok: true }, 50),
};

// ---------------------------------------------------------------------------
// usersApi
// ---------------------------------------------------------------------------
export const usersApi = {
  list: () => delay(users),
  create: (u: Omit<User, "id">) => delay({ ...u, id: `u${Date.now()}` } as User),
  update: (id: string, patch: Partial<User>) => delay({ id, ...patch }),
  deactivate: (id: string) => delay({ id, active: false }),
};

// ---------------------------------------------------------------------------
// employeesApi
// ---------------------------------------------------------------------------
export const employeesApi = {
  list: () => delay(users.filter((u) => !!u.employeeId)),
  get: (id: string) => delay(users.find((u) => u.id === id) || null),
};

// ---------------------------------------------------------------------------
// leaveApi
// ---------------------------------------------------------------------------
export const leaveApi = {
  list: () => delay(leaveRequests),
  myBalance: () => delay(myLeaveBalance),
  apply: (req: Omit<LeaveRequest, "id" | "status" | "appliedOn">) =>
    delay({
      ...req,
      id: `l${Date.now()}`,
      status: "Pending" as const,
      appliedOn: new Date().toISOString().slice(0, 10),
    }),
  approve: (id: string) => delay({ id, status: "Approved" as const }),
  reject: (id: string) => delay({ id, status: "Rejected" as const }),
};

// ---------------------------------------------------------------------------
// attendanceApi
// ---------------------------------------------------------------------------
export const attendanceApi = {
  list: () => delay(attendanceRecords),
  listMine: (employeeId: string) =>
    delay(attendanceRecords.filter((a) => a.employeeId === employeeId)),
  listField: () =>
    delay(attendanceRecords.filter((a) => a.source === "Mobile GPS")),
  listBranch: () =>
    delay(attendanceRecords.filter((a) => a.source === "Thumb Scanner")),
  checkIn: (payload: {
    employeeId: string;
    latitude?: number;
    longitude?: number;
  }) => delay({ ...payload, id: `att${Date.now()}` }),
  checkOut: (id: string) => delay({ id, punchOut: new Date().toISOString() }),
  requestCorrection: (payload: unknown) => delay({ ok: true, payload }),
};

// ---------------------------------------------------------------------------
// branchesApi
// ---------------------------------------------------------------------------
export const branchesApi = {
  list: () => delay<Branch[]>(branches),
  departments: () => delay<Department[]>(departments),
};

// ---------------------------------------------------------------------------
// biometricApi
// ---------------------------------------------------------------------------
export const biometricApi = {
  list: () => delay<BiometricDevice[]>(biometricDevices),
};

// ---------------------------------------------------------------------------
// reportsApi
// ---------------------------------------------------------------------------
export const reportsApi = {
  attendanceSummary: () =>
    delay({
      totalEmployees: users.filter((u) => !!u.employeeId).length,
      present: attendanceRecords.filter((r) => r.status.startsWith("Present")).length,
      absent: attendanceRecords.filter((r) => r.status === "Absent").length,
      onLeave: attendanceRecords.filter((r) => r.status.includes("Leave")).length,
    }),
  holidays: () => delay<Holiday[]>(holidays),
  leaveBalances: () => delay<LeaveBalance[]>(myLeaveBalance),
};

// ---------------------------------------------------------------------------
// auditApi
// ---------------------------------------------------------------------------
export const auditApi = {
  list: () => delay<AuditLog[]>(auditLogs),
};