import type {
  AttendanceRecord,
  AttendanceTimelineEvent,
  AuditLog,
  AssetCatalogItem,
  BiometricMapping,
  CompanyAsset,
  BiometricDevice,
  Branch,
  Department,
  EmployeeAssetInvestment,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  LeaveTypeOption,
  NotificationItem,
  Announcement,
  Role,
  TaskAssignee,
  TaskPriority,
  TaskStatus,
  User,
  WorkTask,
} from "@/mock/types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 20000);
let refreshRequest: Promise<boolean> | null = null;

async function refreshSession() {
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    const fetchOptions: RequestInit = {
      ...options,
      credentials: "include",
      headers,
      signal: controller.signal,
    };
    res = await fetch(`${API_BASE}${path}`, fetchOptions);
    if (
      res.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/refresh" &&
      path !== "/auth/restore"
    ) {
      const refreshed = await refreshSession();
      if (refreshed) res = await fetch(`${API_BASE}${path}`, fetchOptions);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw new Error("Unable to reach the server. Please check your connection.");
  } finally {
    globalThis.clearTimeout(timeout);
  }
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

function toQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== "all") query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const authApi = {
  restore: () => request<{ user: User }>("/auth/restore", { method: "POST" }),
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
    request<{ ok: boolean; user: User }>("/auth/change-password", {
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
        role: u.role ? u.role.toUpperCase() : undefined,
        password: u.password,
      }),
    }),
  update: (
    id: string,
    patch: Omit<Partial<User>, "phone" | "suspendedUntil" | "suspensionStartsAt"> & {
      phone?: string | null;
      suspendedUntil?: string | null;
      suspensionStartsAt?: string | null;
    },
  ) => request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deactivate: (id: string) => request<User>(`/users/${id}/deactivate`, { method: "POST" }),
  suspend: (id: string, suspensionStartsAt: string, suspendedUntil: string) =>
    request<User>(`/users/${id}/suspend`, {
      method: "POST",
      body: JSON.stringify({ suspensionStartsAt, suspendedUntil }),
    }),
  delete: (id: string) => request<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),
  resetPassword: (id: string, password: string) =>
    request<User>(`/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
};

export const employeesApi = {
  list: () => request<User[]>("/employees"),
  isReportingManager: () =>
    request<{ isReportingManager: boolean; teamCount: number }>(
      "/employees/me/is-reporting-manager",
    ),
  get: (id: string) => request<User | null>(`/employees/${id}`),
  update: (id: string, patch: Partial<User>) =>
    request<User>(`/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...patch,
        attendanceMode: patch.attendanceMode,
        managerId: patch.managerId || null,
      }),
    }),
  birthdays: () =>
    request<
      Array<{
        employeeId: string;
        name: string;
        designation?: string;
        department?: string;
        dateOfBirth: string;
        isToday: boolean;
        daysUntil: number;
        age: number;
        message: string;
      }>
    >("/employees/birthdays"),
};

export const leaveApi = {
  list: (filters: { status?: string } = {}) =>
    request<LeaveRequest[]>(`/leave/requests${toQuery(filters)}`),
  mine: () => request<LeaveRequest[]>("/leave/requests?mine=true"),
  assignedApprovals: (status?: string) =>
    request<LeaveRequest[]>(`/leave/requests${toQuery({ assignedApprovals: "true", status })}`),
  approver: () => request<{ approverName: string | null; canApply: boolean }>("/leave/approver"),
  types: () => request<LeaveTypeOption[]>("/leave/types"),
  createType: (payload: { name: string; paid: boolean }) =>
    request<LeaveTypeOption>("/leave/types", { method: "POST", body: JSON.stringify(payload) }),
  updateType: (id: string, payload: Partial<{ name: string; paid: boolean }>) =>
    request<LeaveTypeOption>(`/leave/types/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteType: (id: string) => request<LeaveTypeOption>(`/leave/types/${id}`, { method: "DELETE" }),
  myBalance: () => request<LeaveBalance[]>("/leave/balances/me"),
  listAllBalances: () =>
    request<
      Array<{
        id: string;
        employeeId: string;
        employeeCode: string;
        employeeName: string;
        department: string;
        leaveType: string;
        entitled: number;
        used: number;
        balance: number;
      }>
    >("/leave/balances"),
  apply: (req: {
    leaveTypeId: string;
    fromDate: string;
    toDate: string;
    days: number;
    reason: string;
  }) => request<LeaveRequest>("/leave/requests", { method: "POST", body: JSON.stringify(req) }),
  approve: (id: string) =>
    request<LeaveRequest>(`/leave/requests/${id}/approve`, { method: "POST" }),
  reject: (id: string) => request<LeaveRequest>(`/leave/requests/${id}/reject`, { method: "POST" }),
  cancel: (id: string) => request<LeaveRequest>(`/leave/requests/${id}/cancel`, { method: "POST" }),
};

export const attendanceApi = {
  list: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/attendance/hr/daily${toQuery(filters)}`),
  listMine: (_employeeId: string) => request<AttendanceRecord[]>("/attendance/my/report"),
  listField: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/attendance/hr/field${toQuery(filters)}`),
  listBranch: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/attendance/hr/branch-wise${toQuery(filters)}`),
  myTimeline: (date?: string) =>
    request<AttendanceTimelineEvent[]>(`/attendance/my/timeline${date ? `?date=${date}` : ""}`),
  teamTimeline: (employeeId: string, date?: string) =>
    request<AttendanceTimelineEvent[]>(`/attendance/team/timeline${toQuery({ employeeId, date })}`),
  checkIn: (payload: {
    employeeId: string;
    latitude?: number;
    longitude?: number;
    mobileDeviceId?: string;
    confirmLeaveCancellation?: boolean;
  }) =>
    request<{ eventId: string }>("/attendance/mobile/check-in", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        mobileDeviceId: payload.mobileDeviceId ?? navigator.userAgent.slice(0, 120),
      }),
    }),
  checkOut: (payload: { latitude?: number; longitude?: number }) =>
    request<{ eventId: string }>("/attendance/mobile/check-out", {
      method: "POST",
      body: JSON.stringify({
        latitude: payload.latitude ?? 0,
        longitude: payload.longitude ?? 0,
        mobileDeviceId: navigator.userAgent.slice(0, 120),
      }),
    }),
  requestCorrection: (payload: {
    employeeId: string;
    date: Date;
    punchTime: Date;
    eventType: string;
    remarks: string;
  }) =>
    request<{ ok: boolean; requestId: string; status: string }>("/attendance/correction-request", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  hrPunchCorrection: (payload: {
    employeeId: string;
    date: Date;
    punchTime: Date;
    eventType: string;
    remarks: string;
  }) =>
    request<{ ok: boolean }>("/attendance/hr-punch-correction", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listCorrectionRequests: () =>
    request<
      Array<{
        id: string;
        employeeId: string;
        employeeName: string;
        employeeCode?: string;
        date: string;
        punchTime: string;
        eventType: string;
        remarks: string;
        status: string;
        createdAt: string;
      }>
    >("/attendance/correction-requests"),
  approveCorrectionRequest: (id: string) =>
    request<{ ok: boolean; status: string }>(`/attendance/correction-requests/${id}/approve`, {
      method: "POST",
    }),
  rejectCorrectionRequest: (id: string) =>
    request<{ ok: boolean; status: string }>(`/attendance/correction-requests/${id}/reject`, {
      method: "POST",
    }),
  recalculate: (employeeId: string, date: string) =>
    request<AttendanceRecord>(`/attendance/recalculate/${employeeId}/${date}`, { method: "POST" }),
  verifyIdCard: (employeeId: string) =>
    request<{
      verified: boolean;
      name: string;
      employeeCode: string;
      designation: string;
      department: string;
      branch: string;
      email: string;
      status: string;
    }>(`/verify-id-card/${employeeId}`),
};

export const branchesApi = {
  list: () => request<Branch[]>("/branches"),
  create: (branch: Omit<Branch, "id">) =>
    request<Branch>("/branches", { method: "POST", body: JSON.stringify(branch) }),
  update: (id: string, patch: Partial<Branch>) =>
    request<Branch>(`/branches/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  delete: (id: string) => request<Branch>(`/branches/${id}`, { method: "DELETE" }),
  departments: () => request<Department[]>("/departments"),
  createDepartment: (
    department: Omit<Department, "id" | "headEmployeeId" | "head" | "parentDepartmentId"> & {
      headEmployeeId?: string | null;
      parentDepartmentId?: string | null;
    },
  ) => request<Department>("/departments", { method: "POST", body: JSON.stringify(department) }),
  updateDepartment: (
    id: string,
    patch: Omit<Partial<Department>, "headEmployeeId" | "parentDepartmentId"> & {
      headEmployeeId?: string | null;
      parentDepartmentId?: string | null;
    },
  ) => request<Department>(`/departments/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteDepartment: (id: string) => request<Department>(`/departments/${id}`, { method: "DELETE" }),
};

type CompanyAssetPayload = Omit<
  CompanyAsset,
  | "id"
  | "assignedEmployeeName"
  | "assignedEmployeeCode"
  | "branchName"
  | "serialNumber"
  | "purchaseDate"
  | "renewalDate"
  | "monthlyEquivalent"
  | "annualRecurring"
  | "assignedEmployeeId"
  | "branchId"
  | "location"
  | "notes"
  | "catalogId"
  | "assetCode"
  | "status"
> & {
  assetCode?: string;
  status?: CompanyAsset["status"];
  catalogId?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  renewalDate?: string | null;
  assignedEmployeeId?: string | null;
  branchId?: string | null;
  location?: string | null;
  notes?: string | null;
};

export const assetsApi = {
  list: (filters: Record<string, string | undefined> = {}) =>
    request<CompanyAsset[]>(`/assets${toQuery(filters)}`),
  investmentSummary: () => request<EmployeeAssetInvestment[]>("/assets/investment-summary"),
  create: (asset: CompanyAssetPayload) =>
    request<CompanyAsset>("/assets", { method: "POST", body: JSON.stringify(asset) }),
  update: (id: string, asset: Partial<CompanyAssetPayload>) =>
    request<CompanyAsset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(asset) }),
  catalog: (includeInactive = false) =>
    request<AssetCatalogItem[]>(`/assets/catalog${includeInactive ? "?includeInactive=true" : ""}`),
  createCatalogItem: (item: Omit<AssetCatalogItem, "id" | "status">) =>
    request<AssetCatalogItem>("/assets/catalog", {
      method: "POST",
      body: JSON.stringify(item),
    }),
  updateCatalogItem: (id: string, item: Partial<Omit<AssetCatalogItem, "id" | "status">>) =>
    request<AssetCatalogItem>(`/assets/catalog/${id}`, {
      method: "PATCH",
      body: JSON.stringify(item),
    }),
  deactivateCatalogItem: (id: string) =>
    request<AssetCatalogItem>(`/assets/catalog/${id}`, { method: "DELETE" }),
};

export const biometricApi = {
  list: () => request<BiometricDevice[]>("/biometric/devices"),
  createDevice: (device: {
    name: string;
    code: string;
    branchId: string;
    deviceIp?: string;
    port?: number;
    location?: string;
    status?: string;
  }) =>
    request<BiometricDevice>("/biometric/devices", {
      method: "POST",
      body: JSON.stringify(device),
    }),
  updateDevice: (
    id: string,
    patch: Omit<Partial<BiometricDevice>, "status"> & { code?: string; status?: string },
  ) =>
    request<BiometricDevice>(`/biometric/devices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deactivateDevice: (id: string) =>
    request<BiometricDevice>(`/biometric/devices/${id}`, { method: "DELETE" }),
  mappings: () => request<BiometricMapping[]>("/biometric/mappings"),
  saveMapping: (mapping: {
    employeeId: string;
    biometricUserId: string;
    deviceId?: string;
    status?: string;
  }) =>
    request<BiometricMapping>("/biometric/mappings", {
      method: "POST",
      body: JSON.stringify(mapping),
    }),
  updateMapping: (id: string, patch: Partial<BiometricMapping>) =>
    request<BiometricMapping>(`/biometric/mappings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deactivateMapping: (id: string) =>
    request<BiometricMapping>(`/biometric/mappings/${id}`, { method: "DELETE" }),
};

export const reportsApi = {
  attendanceSummary: () =>
    request<{ totalEmployees: number; present: number; absent: number; onLeave: number }>(
      "/reports/attendance",
    ),
  holidays: () => request<Holiday[]>("/holidays"),
  createHoliday: (holiday: Omit<Holiday, "id">) =>
    request<Holiday>("/holidays", { method: "POST", body: JSON.stringify(holiday) }),
  updateHoliday: (id: string, patch: Partial<Holiday>) =>
    request<Holiday>(`/holidays/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteHoliday: (id: string) => request<Holiday>(`/holidays/${id}`, { method: "DELETE" }),
  leaveBalances: () => request<LeaveBalance[]>("/leave/balances/me"),
  employeeAttendance: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/reports/employee-attendance${toQuery(filters)}`),
  multiBranch: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/reports/multi-branch${toQuery(filters)}`),
  field: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/reports/field${toQuery(filters)}`),
  clientVisits: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/reports/client-visits${toQuery(filters)}`),
  leave: (filters: Record<string, string | undefined> = {}) =>
    request<LeaveRequest[]>(`/reports/leave${toQuery(filters)}`),
  payroll: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/reports/payroll${toQuery(filters)}`),
  timeline: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceTimelineEvent[]>(`/reports/timeline${toQuery(filters)}`),
};

export const auditApi = {
  list: () => request<AuditLog[]>("/audit-logs"),
  summary: () =>
    request<{ count: number; oldest?: string; latest?: string }>("/audit-logs/summary"),
};

export interface SystemHealth {
  status: "HEALTHY" | "DEGRADED";
  checkedAt: string;
  backendStartedAt: string;
  uptimeSeconds: number;
  database: { reachable: boolean; latencyMs: number; error?: string };
  memory: { usedPercent: number; processRssMb: number };
  loadAverage: number;
  nodeVersion: string;
}

export const systemApi = {
  health: () => request<SystemHealth>("/system/health"),
};

export const notificationsApi = {
  list: () => request<NotificationItem[]>("/notifications"),
};

export const announcementsApi = {
  list: (includeInactive = false) =>
    request<Announcement[]>(
      `/announcements${toQuery({ includeInactive: String(includeInactive) })}`,
    ),
  create: (payload: {
    title: string;
    message: string;
    priority: Announcement["priority"];
    publishAt?: string;
    expiresAt?: string | null;
  }) =>
    request<Announcement>("/announcements", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Partial<Announcement>) =>
    request<Announcement>(`/announcements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deactivate: (id: string) => request<Announcement>(`/announcements/${id}`, { method: "DELETE" }),
};

export const pushApi = {
  publicKey: () => request<{ publicKey: string | null }>("/push/public-key"),
  subscribe: (subscription: PushSubscriptionJSON) =>
    request<{ ok: true }>("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscription),
    }),
  unsubscribe: (endpoint: string) =>
    request<{ ok: true }>("/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),
};

export const tasksApi = {
  list: (scope: "mine" | "team" = "team") => request<WorkTask[]>(`/tasks${toQuery({ scope })}`),
  assignees: () => request<TaskAssignee[]>("/tasks/assignees"),
  create: (payload: {
    title: string;
    description?: string | null;
    assigneeEmployeeIds: string[];
    parentTaskId?: string | null;
    priority: TaskPriority;
    startDate?: string | null;
    dueDate?: string | null;
  }) => request<WorkTask>("/tasks", { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: Partial<{
      title: string;
      description: string | null;
      assigneeEmployeeIds: string[];
      priority: TaskPriority;
      status: TaskStatus;
      progress: number;
      startDate: string | null;
      dueDate: string | null;
    }>,
  ) => request<WorkTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  addLog: (
    id: string,
    payload: {
      message: string;
      progress?: number;
      status?: TaskStatus;
      minutesWorked?: number;
    },
  ) => request<WorkTask>(`/tasks/${id}/logs`, { method: "POST", body: JSON.stringify(payload) }),
};
