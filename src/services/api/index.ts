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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !window.location.pathname.includes("/login")
  ) {
    window.location.assign("/login");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>("/auth/me"),
  loginAsRole: (_role: Role) => Promise.reject(new Error("Demo role login is disabled")),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  changePassword: (oldPassword: string, nextPassword: string) =>
    request<{ ok: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, nextPassword }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
};

export const usersApi = {
  list: () => request<User[]>("/users"),
  create: (u: Omit<User, "id"> & { password?: string }) =>
    request<User>("/users", {
      method: "POST",
      body: JSON.stringify({
        ...u,
        role: u.role.toUpperCase(),
        password: u.password ?? "ChangeMe@12345",
      }),
    }),
  update: (id: string, patch: Partial<User>) =>
    request<{ id: string }>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deactivate: (id: string) =>
    request<{ id: string; active: boolean }>(`/users/${id}/deactivate`, { method: "POST" }),
};

export const employeesApi = {
  list: () => request<User[]>("/employees"),
  get: (id: string) => request<User | null>(`/employees/${id}`),
};

export const leaveApi = {
  list: () => request<LeaveRequest[]>("/leave/requests"),
  myBalance: () => request<LeaveBalance[]>("/leave/balances/me"),
  apply: (req: Omit<LeaveRequest, "id" | "status" | "appliedOn">) =>
    request<LeaveRequest>("/leave/requests", { method: "POST", body: JSON.stringify(req) }),
  approve: (id: string) =>
    request<LeaveRequest>(`/leave/requests/${id}/approve`, { method: "POST" }),
  reject: (id: string) => request<LeaveRequest>(`/leave/requests/${id}/reject`, { method: "POST" }),
};

export const attendanceApi = {
  list: () => request<AttendanceRecord[]>("/attendance/hr/daily"),
  listMine: (_employeeId: string) => request<AttendanceRecord[]>("/attendance/my/report"),
  listField: () => request<AttendanceRecord[]>("/attendance/hr/field"),
  listBranch: () => request<AttendanceRecord[]>("/attendance/hr/branch-wise"),
  myTimeline: (date?: string) =>
    request<Array<Record<string, unknown>>>(
      `/attendance/my/timeline${date ? `?date=${date}` : ""}`,
    ),
  checkIn: (payload: {
    employeeId: string;
    latitude?: number;
    longitude?: number;
    mobileDeviceId?: string;
  }) =>
    request<{ eventId: string }>("/attendance/mobile/check-in", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        mobileDeviceId: payload.mobileDeviceId ?? navigator.userAgent.slice(0, 120),
      }),
    }),
  checkOut: (_id: string) =>
    request<{ eventId: string }>("/attendance/mobile/check-out", {
      method: "POST",
      body: JSON.stringify({
        latitude: 0,
        longitude: 0,
        mobileDeviceId: navigator.userAgent.slice(0, 120),
      }),
    }),
  requestCorrection: (payload: unknown) =>
    request<{ ok: boolean }>("/attendance/correction-request", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const branchesApi = {
  list: () => request<Branch[]>("/branches"),
  departments: () => request<Department[]>("/departments"),
};

export const biometricApi = {
  list: () => request<BiometricDevice[]>("/biometric/devices"),
};

export const reportsApi = {
  attendanceSummary: () =>
    request<{ totalEmployees: number; present: number; absent: number; onLeave: number }>(
      "/reports/attendance",
    ),
  holidays: () => request<Holiday[]>("/holidays"),
  leaveBalances: () => request<LeaveBalance[]>("/leave/balances/me"),
};

export const auditApi = {
  list: () => request<AuditLog[]>("/audit-logs"),
};
