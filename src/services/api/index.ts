import type {
  AttendanceRecord,
  AttendanceTimelineEvent,
  AuditLog,
  AssetCatalogItem,
  AssetReturnRecord,
  BiometricMapping,
  CompanyAsset,
  CompanyEntity,
  CertificateRequest,
  ExpenseClaim,
  BiometricDevice,
  Branch,
  Department,
  EmployeeAssetInvestment,
  EmployeeProfile,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  LeaveTypeOption,
  MyAssignedAsset,
  NotificationItem,
  Announcement,
  Role,
  TaskAssignee,
  TaskBoard,
  TaskIssueType,
  TaskPriority,
  TaskStatus,
  TaskStage,
  User,
  WorkTask,
  ModuleKey,
  IntegrationClient,
  IntegrationScope,
  FaceAdminProfile,
  FaceCapturePayload,
  FaceSettings,
  FaceVerificationPurpose,
  FaceVerificationSession,
  FaceEvidenceRecord,
} from "@/types/domain";
import { isNativeApp } from "@/lib/native-app";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 20000);
let refreshRequest: Promise<boolean> | null = null;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const warmedResponses = new Map<string, { expiresAt: number; value: unknown }>();
const pendingRequests = new Map<string, Promise<unknown>>();

function cacheDuration(path: string) {
  const pathname = path.split("?")[0];
  if (["/branches", "/departments", "/leave/types", "/holidays"].includes(pathname)) {
    return 60_000;
  }
  if (["/employees", "/users"].includes(pathname)) return 15_000;
  if (pathname === "/employees/birthdays") return 60_000;
  if (pathname === "/assets/catalog") return 30_000;
  return 0;
}

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

type ApiRequestOptions = RequestInit & { timeoutMs?: number };

async function requestNetwork<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs, ...fetchInit } = options;
  const headers = new Headers(fetchInit.headers);
  if (fetchInit.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs ?? REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    const fetchOptions: RequestInit = {
      ...fetchInit,
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
    !window.location.pathname.includes("/login") &&
    path !== "/auth/restore" &&
    path !== "/auth/refresh"
  ) {
    window.location.assign("/login");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    const details = body.details?.fieldErrors as Record<string, string[]> | undefined;
    const fieldMessage = details
      ? Object.entries(details)
          .flatMap(([field, messages]) =>
            (messages ?? []).map((message) => (field ? `${field}: ${message}` : message)),
          )
          .find(Boolean)
      : undefined;
    throw new Error(fieldMessage || body.error || "Request failed");
  }
  return res.json() as Promise<T>;
}

/** Authenticated binary fetch with the same cookie + refresh behaviour as JSON APIs. */
export async function fetchAuthenticatedBlob(path: string): Promise<Blob> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const fetchOptions: RequestInit = {
    credentials: "include",
    cache: "no-store",
    signal: controller.signal,
  };
  try {
    let res = await fetch(`${API_BASE}${path}`, fetchOptions);
    if (res.status === 401) {
      const refreshed = await refreshSession();
      if (refreshed) res = await fetch(`${API_BASE}${path}`, fetchOptions);
    }
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err instanceof Error ? err : new Error("Unable to load file.");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    responseCache.clear();
    warmedResponses.clear();
    return requestNetwork<T>(path, options);
  }

  const warmed = warmedResponses.get(path);
  if (warmed && warmed.expiresAt > Date.now()) {
    warmedResponses.delete(path);
    return warmed.value as T;
  }

  const duration = cacheDuration(path);
  const cached = responseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const pending = pendingRequests.get(path);
  if (pending) return pending as Promise<T>;
  const next = requestNetwork<T>(path, options)
    .then((value) => {
      if (duration) responseCache.set(path, { value, expiresAt: Date.now() + duration });
      return value;
    })
    .finally(() => pendingRequests.delete(path));
  pendingRequests.set(path, next);
  return next;
}

async function warmPath<T>(path: string) {
  const value = await request<T>(path);
  warmedResponses.set(path, { value, expiresAt: Date.now() + 10_000 });
}

export async function warmAuthenticatedWorkspace(user: User) {
  if (
    user.mustChangePassword ||
    (user.role !== "developer_admin" && user.faceEnrollmentStatus !== "APPROVED")
  )
    return;
  const ownAttendance = ["employee", "sales", "driver", "field_staff"].includes(user.role);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const attendanceQuery = toQuery({ from: today, to: today });
  // On native (especially Samsung), avoid stampeding the WebView with large
  // parallel JSON payloads right after login — that correlates with process death.
  const native = isNativeApp();
  const paths = native
    ? [
        ownAttendance
          ? `/attendance/my/today`
          : `/attendance/hr/daily${attendanceQuery}`,
        "/branches",
        "/employees/birthdays",
      ]
    : [
        ownAttendance
          ? `/attendance/my/report${attendanceQuery}`
          : `/attendance/hr/daily${attendanceQuery}`,
        "/branches",
        user.role === "developer_admin" ? "/users" : "/employees",
        "/employees/birthdays",
        "/leave/requests",
      ];
  if (!native && user.employeeId && !["ceo", "developer_admin"].includes(user.role)) {
    paths.push("/attendance/my/timeline");
  }
  if (user.employeeId) {
    void attendanceApi
      .punchTicket()
      .then(({ ticket, expiresAt }) => {
        void import("@/lib/offline-punch-queue").then(({ writePunchTicket }) => {
          writePunchTicket(ticket, expiresAt);
        });
      })
      .catch(() => undefined);
  }
  const warmup = Promise.allSettled(paths.map((path) => warmPath(path)));
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    warmup,
    new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, native ? 2_000 : 3_500);
    }),
  ]);
  if (timeoutId) clearTimeout(timeoutId);
}

function toQuery(params: Record<string, string | number | boolean | undefined>) {
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
  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  me: () => request<{ user: User }>("/auth/me"),
  loginAsRole: (_role: Role) => Promise.reject(new Error("Demo role login is disabled")),
  changePassword: (oldPassword: string, nextPassword: string) =>
    request<{ ok: boolean; user: User }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: oldPassword || undefined, nextPassword }),
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
  ) =>
    request<User>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...patch,
        role: patch.role ? String(patch.role).toUpperCase() : undefined,
      }),
    }),
  deactivate: (id: string) => request<User>(`/users/${id}/deactivate`, { method: "POST" }),
  suspend: (id: string, suspensionStartsAt: string, suspendedUntil: string) =>
    request<User>(`/users/${id}/suspend`, {
      method: "POST",
      body: JSON.stringify({ suspensionStartsAt, suspendedUntil }),
    }),
  delete: (id: string, confirmation: string) =>
    request<{ ok: boolean; user: User; dataRetained: boolean }>(`/users/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation }),
    }),
  resetPassword: (id: string, password: string) =>
    request<User>(`/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
};

export const employeesApi = {
  list: (filters: Record<string, string | number | undefined> = {}) =>
    request<EmployeeProfile[]>(`/employees${toQuery(filters)}`),
  isReportingManager: () =>
    request<{ isReportingManager: boolean; teamCount: number }>(
      "/employees/me/is-reporting-manager",
    ),
  get: (id: string) => request<EmployeeProfile | null>(`/employees/${id}`),
  idCard: (id: string) =>
    request<{
      companyEntity: CompanyEntity;
      parentCompanyName: string;
      employeeName: string;
      employeeCode: string;
      department?: string;
      designation?: string;
      companyPhone?: string;
      personalPhone?: string;
      email?: string;
      joiningDate?: string;
      bloodGroup?: string;
      status: string;
      verificationToken?: string;
      verificationExpiresAt?: string;
      emergencyContact?: {
        contactName: string;
        relationship: string;
        phone: string;
        alternatePhone?: string | null;
        address?: string | null;
        bloodGroup?: string | null;
        medicalNotes?: string | null;
      } | null;
    }>(`/id-card/${id}`),
  update: (id: string, patch: Partial<EmployeeProfile>) =>
    request<EmployeeProfile>(`/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...patch,
        attendanceMode: patch.attendanceMode,
        ...(patch.managerId !== undefined ? { managerId: patch.managerId || null } : {}),
      }),
    }),
  upsertEmergencyContact: (
    id: string,
    body: {
      contactName: string;
      relationship: string;
      phone: string;
      alternatePhone?: string | null;
      address?: string | null;
      bloodGroup?: string | null;
      medicalNotes?: string | null;
    },
  ) =>
    request<EmployeeProfile["emergencyContact"]>(`/employees/${id}/emergency-contact`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  birthdays: () =>
    request<
      Array<{
        employeeId: string;
        name: string;
        designation?: string;
        department?: string;
        dateOfBirth?: string;
        isToday: boolean;
        daysUntil: number;
        age?: number;
        message?: string;
      }>
    >("/employees/birthdays"),
  getShiftAssignment: (id: string) =>
    request<{
      id: string;
      employeeId: string;
      shiftId: string;
      shiftName: string;
      shiftType: string;
      startMinutes: number;
      endMinutes: number;
      effectiveFrom: string;
      effectiveTo: string | null;
    }>(`/employees/${id}/shift-assignment`),
  assignShift: (
    id: string,
    body: { shiftId: string; effectiveFrom: string; effectiveTo?: string | null },
  ) =>
    request<{
      id: string;
      employeeId: string;
      shiftId: string;
      shiftName: string;
      effectiveFrom: string;
      effectiveTo: string | null;
    }>(`/employees/${id}/shift-assignment`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const shiftsApi = {
  list: (includeInactive = false) =>
    request<
      Array<{
        id: string;
        name: string;
        code: string;
        shiftType: "DAY" | "NIGHT";
        startMinutes: number;
        endMinutes: number;
        active: boolean;
      }>
    >(`/shifts${toQuery({ includeInactive: includeInactive ? "true" : undefined })}`),
  create: (body: {
    name: string;
    code: string;
    shiftType: "DAY" | "NIGHT";
    startMinutes: number;
    endMinutes: number;
    active?: boolean;
  }) =>
    request<{
      id: string;
      name: string;
      code: string;
      shiftType: "DAY" | "NIGHT";
      startMinutes: number;
      endMinutes: number;
      active: boolean;
    }>("/shifts", { method: "POST", body: JSON.stringify(body) }),
};

export const faceApi = {
  status: () =>
    request<{
      status: User["faceEnrollmentStatus"];
      required: boolean;
      verificationEnabled: boolean;
      rejectionReason: string | null;
      submittedAt: string | null;
      approvedAt: string | null;
      maxGpsAccuracyMeters: number;
      consent: { version: string; text: string };
    }>("/face/status"),
  createSession: (purpose: FaceVerificationPurpose, deviceId?: string) =>
    request<FaceVerificationSession>("/face/session", {
      method: "POST",
      body: JSON.stringify({ purpose, deviceId }),
    }),
  enroll: (
    capture: FaceCapturePayload & {
      consentAccepted: true;
      consentVersion: string;
    },
  ) =>
    request<{ status: User["faceEnrollmentStatus"]; autoApproved: boolean }>("/face/enrollment", {
      method: "POST",
      body: JSON.stringify(capture),
    }),
  admin: {
    profiles: () => request<FaceAdminProfile[]>("/face/admin/profiles"),
    approve: (userId: string) =>
      request<{ status: User["faceEnrollmentStatus"] }>(`/face/admin/profiles/${userId}/approve`, {
        method: "PATCH",
      }),
    reject: (userId: string, reason: string) =>
      request<{ status: User["faceEnrollmentStatus"]; rejectionReason: string }>(
        `/face/admin/profiles/${userId}/reject`,
        { method: "PATCH", body: JSON.stringify({ reason }) },
      ),
    reset: (userId: string) =>
      request<{ status: User["faceEnrollmentStatus"] }>(`/face/admin/profiles/${userId}`, {
        method: "DELETE",
      }),
    settings: () => request<FaceSettings>("/face/admin/settings"),
    evidence: (userId: string) =>
      request<FaceEvidenceRecord[]>(`/face/admin/evidence${toQuery({ userId })}`),
    updateSettings: (settings: FaceSettings) =>
      request<FaceSettings>("/face/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      }),
    evidenceImageUrl: (evidenceId: string) =>
      `${API_BASE}/face/admin/evidence/${encodeURIComponent(evidenceId)}/image`,
    evidenceImagePath: (evidenceId: string) =>
      `/face/admin/evidence/${encodeURIComponent(evidenceId)}/image`,
  },
};

export const leaveApi = {
  list: (filters: { status?: string } = {}) =>
    request<LeaveRequest[]>(`/leave/requests${toQuery(filters)}`),
  mine: () => request<LeaveRequest[]>("/leave/requests?mine=true"),
  assignedApprovals: (status?: string) =>
    request<LeaveRequest[]>(`/leave/requests${toQuery({ assignedApprovals: "true", status })}`),
  approver: () => request<{ approverName: string | null; canApply: boolean }>("/leave/approver"),
  types: (all = false) =>
    request<LeaveTypeOption[]>(`/leave/types${all ? "?all=true" : ""}`),
  createType: (payload: {
    name: string;
    paid?: boolean;
    code?: string;
    active?: boolean;
    annualAllowance?: number | null;
    monthlyCredit?: number | null;
    maxPerMonth?: number | null;
    carryForward?: boolean;
    requiresMedicalDocument?: boolean;
    approvalRequired?: boolean;
  }) => request<LeaveTypeOption>("/leave/types", { method: "POST", body: JSON.stringify(payload) }),
  updateType: (
    id: string,
    payload: Partial<{
      name: string;
      paid: boolean;
      active: boolean;
      annualAllowance: number | null;
      monthlyCredit: number | null;
      maxPerMonth: number | null;
      carryForward: boolean;
      requiresMedicalDocument: boolean;
      approvalRequired: boolean;
    }>,
  ) =>
    request<LeaveTypeOption>(`/leave/types/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteType: (id: string) => request<LeaveTypeOption>(`/leave/types/${id}`, { method: "DELETE" }),
  myBalance: () => request<LeaveBalance[]>("/leave/balances/me"),
  myCompOffCredits: () =>
    request<
      Array<{
        id: string;
        earnedDate: string;
        status: "AVAILABLE" | "USED" | "EXPIRED" | "REVOKED";
        consumedByLeaveRequestId?: string;
        expiredAt?: string;
        revokeReason?: string;
      }>
    >("/leave/comp-off-credits?mine=true"),
  compOffCredits: (employeeId: string) =>
    request<
      Array<{
        id: string;
        earnedDate: string;
        status: "AVAILABLE" | "USED" | "EXPIRED" | "REVOKED";
        consumedByLeaveRequestId?: string;
        expiredAt?: string;
        revokeReason?: string;
      }>
    >(`/leave/comp-off-credits${toQuery({ employeeId })}`),
  listAllBalances: (employeeId?: string) =>
    request<
      Array<{
        id: string;
        employeeId: string;
        employeeCode: string;
        employeeName: string;
        department: string;
        leaveType: string;
        leaveTypeId: string;
        entitled: number;
        used: number;
        balance: number;
        code: string;
        manualAdjustment: number;
      }>
    >(`/leave/balances${toQuery({ employeeId })}`),
  apply: (req: {
    leaveTypeId: string;
    fromDate: string;
    toDate: string;
    days: number;
    session?: "FULL";
    reason: string;
    medicalDocumentUrl?: string;
  }) => request<LeaveRequest>("/leave/requests", { method: "POST", body: JSON.stringify(req) }),
  approve: (id: string) =>
    request<LeaveRequest>(`/leave/requests/${id}/approve`, { method: "POST" }),
  reject: (id: string) => request<LeaveRequest>(`/leave/requests/${id}/reject`, { method: "POST" }),
  cancel: (id: string) => request<LeaveRequest>(`/leave/requests/${id}/cancel`, { method: "POST" }),
  updateMedicalDocument: (id: string, url: string) =>
    request<LeaveRequest>(`/leave/requests/${id}/medical-document`, {
      method: "PATCH",
      body: JSON.stringify({ url }),
    }),
  uploadMedicalFile: (payload: { fileName: string; mimeType: string; contentBase64: string }) =>
    request<{ url: string; fileName: string }>("/leave/medical-files", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  medicalFileUrl: (path: string) =>
    path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`,
  verifyMedicalDocument: (id: string) =>
    request<LeaveRequest>(`/leave/requests/${id}/medical-document/verify`, {
      method: "POST",
    }),
  adjustBalance: (employeeId: string, leaveTypeId: string, adjustment: number, reason: string) =>
    request(`/leave/balances/${employeeId}/${leaveTypeId}`, {
      method: "PATCH",
      body: JSON.stringify({ adjustment, reason }),
    }),
  weeklyOffs: (assignedApprovals = false, all = false) =>
    request<import("@/types/domain").WeeklyOffRequest[]>(
      `/weekly-offs${toQuery({ assignedApprovals: assignedApprovals ? "true" : undefined, all: all ? "true" : undefined })}`,
    ),
  requestWeeklyOff: (date: string, reason?: string) =>
    request<import("@/types/domain").WeeklyOffRequest>("/weekly-offs", {
      method: "POST",
      body: JSON.stringify({ date, reason }),
    }),
  approveWeeklyOff: (id: string) =>
    request<import("@/types/domain").WeeklyOffRequest>(`/weekly-offs/${id}/approve`, {
      method: "POST",
    }),
  rejectWeeklyOff: (id: string) =>
    request<import("@/types/domain").WeeklyOffRequest>(`/weekly-offs/${id}/reject`, {
      method: "POST",
    }),
  cancelWeeklyOff: (id: string) =>
    request<import("@/types/domain").WeeklyOffRequest>(`/weekly-offs/${id}/cancel`, {
      method: "POST",
    }),
};

export const attendanceApi = {
  today: () => request<AttendanceRecord | null>("/attendance/my/today"),
  list: (filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/attendance/hr/daily${toQuery(filters)}`),
  listMine: (_employeeId: string, filters: Record<string, string | undefined> = {}) =>
    request<AttendanceRecord[]>(`/attendance/my/report${toQuery(filters)}`),
  myTimeline: (date?: string) =>
    request<AttendanceTimelineEvent[]>(`/attendance/my/timeline${date ? `?date=${date}` : ""}`),
  teamTimeline: (employeeId: string, date?: string) =>
    request<AttendanceTimelineEvent[]>(`/attendance/team/timeline${toQuery({ employeeId, date })}`),
  punchTicket: () => request<{ ticket: string; expiresAt: string }>("/attendance/punch-ticket"),
  checkIn: (payload: {
    employeeId: string;
    latitude: number;
    longitude: number;
    locationAccuracy: number;
    mobileDeviceId?: string;
    confirmLeaveCancellation?: boolean;
    eventTime?: string;
    faceVerification?: FaceCapturePayload;
    punchTicket?: string;
    captureNonce?: string;
    deferred?: boolean;
  }) =>
    request<{ eventId: string }>("/attendance/mobile/check-in", {
      method: "POST",
      timeoutMs: 5000,
      body: JSON.stringify({
        ...payload,
        mobileDeviceId: payload.mobileDeviceId ?? navigator.userAgent.slice(0, 120),
      }),
    }),
  checkOut: (payload: {
    latitude: number;
    longitude: number;
    locationAccuracy: number;
    eventTime?: string;
    punchTicket?: string;
    captureNonce?: string;
    deferred?: boolean;
  }) =>
    request<{ eventId: string }>("/attendance/mobile/check-out", {
      method: "POST",
      timeoutMs: 5000,
      body: JSON.stringify({
        ...payload,
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
        canReview: boolean;
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
  verifyIdCard: (token: string) =>
    request<{
      verified: boolean;
      name: string;
      employeeCode: string;
      designation?: string;
      department: string;
      companyEntity: CompanyEntity;
      status: string;
    }>(`/verify-id-card/${encodeURIComponent(token)}`),
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
    department: Omit<
      Department,
      "id" | "headEmployeeId" | "head" | "headEmployeeIds" | "heads" | "parentDepartmentId"
    > & {
      headEmployeeId?: string | null;
      headEmployeeIds?: string[];
      parentDepartmentId?: string | null;
    },
  ) => request<Department>("/departments", { method: "POST", body: JSON.stringify(department) }),
  updateDepartment: (
    id: string,
    patch: Omit<Partial<Department>, "headEmployeeId" | "parentDepartmentId"> & {
      headEmployeeId?: string | null;
      headEmployeeIds?: string[];
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
  | "warrantyUntil"
  | "monthlyEquivalent"
  | "annualRecurring"
  | "assignedEmployeeId"
  | "branchId"
  | "location"
  | "notes"
  | "catalogId"
  | "assetCode"
  | "status"
  | "activeSeatCount"
  | "costSharePerSeat"
  | "assignments"
  | "laptopName"
  | "deviceId"
  | "productId"
  | "processor"
  | "ram"
  | "ssd"
  | "windowsVersion"
  | "macAddress"
  | "userPassword"
  | "adminPassword"
> & {
  assetCode?: string;
  status?: CompanyAsset["status"];
  catalogId?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  renewalDate?: string | null;
  warrantyUntil?: string | null;
  assignedEmployeeId?: string | null;
  visibleToEmployee?: boolean;
  branchId?: string | null;
  location?: string | null;
  notes?: string | null;
  laptopName?: string | null;
  deviceId?: string | null;
  productId?: string | null;
  processor?: string | null;
  ram?: string | null;
  ssd?: string | null;
  windowsVersion?: string | null;
  macAddress?: string | null;
  userPassword?: string | null;
  adminPassword?: string | null;
};

export const assetsApi = {
  list: (filters: Record<string, string | number | undefined> = {}) =>
    request<CompanyAsset[]>(`/assets${toQuery(filters)}`),
  mine: () => request<MyAssignedAsset[]>("/assets/mine"),
  investmentSummary: () => request<EmployeeAssetInvestment[]>("/assets/investment-summary"),
  create: (asset: CompanyAssetPayload) =>
    request<CompanyAsset>("/assets", { method: "POST", body: JSON.stringify(asset) }),
  update: (id: string, asset: Partial<CompanyAssetPayload>) =>
    request<CompanyAsset>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(asset) }),
  assign: (id: string, body: { employeeId: string; visibleToEmployee?: boolean }) =>
    request<CompanyAsset>(`/assets/${id}/assign`, { method: "POST", body: JSON.stringify(body) }),
  assignMany: (id: string, body: { employeeIds: string[]; visibleToEmployee?: boolean }) =>
    request<CompanyAsset>(`/assets/${id}/assign-many`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  returnHistory: () => request<AssetReturnRecord[]>("/assets/returns/history"),
  returnAsset: (
    id: string,
    checklist: {
      employeeId?: string;
      condition: AssetReturnRecord["condition"];
      accessoriesReturned: boolean;
      chargerReturned: boolean;
      dataBackedUp: boolean;
      dataWiped: boolean;
      physicalDamage: boolean;
      damageNotes?: string | null;
      remarks?: string | null;
    },
  ) =>
    request<{ asset: CompanyAsset; returnId: string }>(`/assets/${id}/return`, {
      method: "POST",
      body: JSON.stringify(checklist),
    }),
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

export const employeeServicesApi = {
  expenseClaims: () => request<ExpenseClaim[]>("/expense-claims"),
  submitExpense: (claim: {
    claimType: "ADVANCE" | "EXPENSE" | "FIELD";
    employeeId?: string;
    title?: string | null;
    amount: number;
    expenseDate?: string | null;
    description?: string | null;
    remark?: string | null;
    claimMeta?: {
      fromLocation?: string;
      toLocation?: string;
    } | null;
    receiptUrl?: string | null;
    receiptAccessConfirmed?: boolean;
  }) =>
    request<{ id: string; status: string }>("/expense-claims", {
      method: "POST",
      body: JSON.stringify(claim),
    }),
  reviewExpense: (id: string, status: "UNPAID" | "REJECTED" | "PAID", reviewNotes?: string) =>
    request<{ id: string; status: string }>(`/expense-claims/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ status, reviewNotes }),
    }),
  uploadReceipt: (payload: { fileName: string; mimeType: string; contentBase64: string }) =>
    request<{ url: string; fileName: string }>("/expense-claims/receipts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  receiptUrl: (path: string) =>
    path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`,
  certificateRequests: () => request<CertificateRequest[]>("/certificate-requests"),
  submitCertificate: (requestBody: {
    certificateType: string;
    purpose: string;
    deliveryMode: "DIGITAL" | "PRINTED";
    requiredBy?: string | null;
    employeeId?: string;
  }) =>
    request<{ id: string; status: string }>("/certificate-requests", {
      method: "POST",
      body: JSON.stringify(requestBody),
    }),
  reviewCertificate: (
    id: string,
    status: "IN_PROGRESS" | "READY" | "REJECTED" | "COLLECTED",
    hrNotes?: string | null,
    documentUrl?: string | null,
  ) =>
    request<{ id: string; status: string }>(`/certificate-requests/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        hrNotes: hrNotes ?? null,
        documentUrl: documentUrl ?? null,
      }),
    }),
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
  backup?: {
    available: boolean;
    ok: boolean;
    finishedAt: string | null;
    fileName: string | null;
    remotePath: string | null;
    bytes: number | null;
    faceEvidenceFileName: string | null;
    stale: boolean;
  };
}

export const systemApi = {
  health: () => request<SystemHealth>("/system/health"),
  resetTestData: (payload: { confirmation: string; password: string }) =>
    request<{
      ok: true;
      deletedUsers: number;
      deletedEmployees: number;
      preserved: {
        developerAdminUserId: string;
        branches: number;
        departments: number;
        leaveTypes: number;
      };
    }>("/system/reset-test-data", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  supportPasswordStatus: () =>
    request<{ enabled: boolean; updatedAt: string | null; expiresAt: string | null }>(
      "/system/support-password",
    ),
  setSupportPassword: (password: string | null, ttlHours?: number) =>
    request<{ enabled: boolean; updatedAt: string | null; expiresAt: string | null }>(
      "/system/support-password",
      {
        method: "PUT",
        body: JSON.stringify({ password, ttlHours }),
      },
    ),
};

export const notificationsApi = {
  list: () => request<NotificationItem[]>("/notifications"),
  clear: (ids: string[]) =>
    request<{ ok: boolean; dismissedIds: string[]; inboxClearedAt: string | null }>(
      "/notifications/clear",
      { method: "POST", body: JSON.stringify({ ids }) },
    ),
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
  deletePermanently: (id: string, confirmation: string) =>
    request<{ ok: true }>(`/announcements/${id}/permanent`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation }),
    }),
};

export const pushApi = {
  publicKey: () =>
    request<{ publicKey: string | null; nativePushAvailable?: boolean }>("/push/public-key"),
  subscribe: (subscription: PushSubscriptionJSON) =>
    request<{ ok: true; channel?: string }>("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscription),
    }),
  subscribeNative: (channel: "fcm" | "apns", token: string) =>
    request<{ ok: true; channel?: string }>("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify({ channel, token }),
    }),
  unsubscribe: (endpoint: string) =>
    request<{ ok: true }>("/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),
  unsubscribeNative: (channel: "fcm" | "apns", token: string) =>
    request<{ ok: true }>("/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ channel, token }),
    }),
};

export const tasksApi = {
  list: (
    scope: "mine" | "team" = "team",
    filters: {
      limit?: number;
      offset?: number;
      boardId?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      q?: string;
      due?: "today" | "overdue" | "none";
      detail?: "summary" | "full";
      stageId?: string;
      assigneeEmployeeId?: string;
      parentTaskId?: string;
      includeArchived?: boolean;
    } = {},
  ) =>
    request<WorkTask[]>(
      `/tasks${toQuery({ scope, ...filters } as Record<string, string | number | boolean | undefined>)}`,
    ),
  get: (id: string) => request<WorkTask>(`/tasks/${id}`),
  assignees: (boardId?: string) =>
    request<TaskAssignee[]>(`/tasks/assignees${toQuery({ boardId })}`),
  create: (payload: {
    title: string;
    description?: string | null;
    assigneeEmployeeIds: string[];
    parentTaskId?: string | null;
    boardId?: string | null;
    stageId?: string | null;
    issueType?: TaskIssueType;
    priority: TaskPriority;
    startDate?: string | null;
    dueDate?: string | null;
  }) => request<WorkTask>("/tasks", { method: "POST", body: JSON.stringify(payload) }),
  update: (
    id: string,
    payload: { version: number } & Partial<{
      title: string;
      description: string | null;
      assigneeEmployeeIds: string[];
      issueType: TaskIssueType;
      priority: TaskPriority;
      status: TaskStatus;
      progress: number;
      startDate: string | null;
      dueDate: string | null;
      stageId: string | null;
      boardId: string | null;
      parentTaskId: string | null;
      rank: number;
      rankBeforeTaskId: string;
      rankAfterTaskId: string;
      customFields: Record<string, string | number | boolean | null>;
    }>,
  ) => request<WorkTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  addLog: (
    id: string,
    payload: {
      version: number;
      message: string;
      progress?: number;
      status?: TaskStatus;
      minutesWorked?: number;
    },
  ) => request<WorkTask>(`/tasks/${id}/logs`, { method: "POST", body: JSON.stringify(payload) }),
  boards: (archived = false) =>
    request<TaskBoard[]>(`/task-boards${archived ? "?archived=true" : ""}`),
  createBoard: (payload: {
    name: string;
    keyPrefix?: string;
    description?: string | null;
    accessType: TaskBoard["accessType"];
    allowedRoles: string[];
    memberEmployeeIds: string[];
    stages: Array<{ id?: string; name: string; color: TaskStage["color"]; status: TaskStatus }>;
    customFieldDefs?: NonNullable<TaskBoard["customFieldDefs"]>;
  }) => request<TaskBoard>("/task-boards", { method: "POST", body: JSON.stringify(payload) }),
  updateBoard: (
    id: string,
    payload: {
      version: number;
      name: string;
      keyPrefix?: string;
      description?: string | null;
      accessType: TaskBoard["accessType"];
      allowedRoles: string[];
      memberEmployeeIds: string[];
      stages: Array<{
        id?: string;
        name: string;
        color: TaskStage["color"];
        status: TaskStatus;
      }>;
      customFieldDefs?: NonNullable<TaskBoard["customFieldDefs"]>;
    },
  ) =>
    request<TaskBoard>(`/task-boards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  archiveBoard: (id: string, version: number, archived: boolean) =>
    request<TaskBoard>(`/task-boards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ version, archived }),
    }),
  archiveTask: (id: string, version: number, archived: boolean) =>
    request<{ id: string; archivedAt: string | null; version: number }>(`/tasks/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ version, archived }),
    }),
  listAttachments: (id: string) =>
    request<
      Array<{
        id: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        createdAt: string;
      }>
    >(`/tasks/${id}/attachments`),
  addAttachment: (
    id: string,
    payload: { fileName: string; mimeType: string; contentBase64: string },
  ) =>
    request<{ id: string; fileName: string }>(`/tasks/${id}/attachments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const moduleAccessApi = {
  mine: () => request<{ modules: ModuleKey[] }>("/module-access/me"),
  matrix: () =>
    request<{
      modules: ModuleKey[];
      matrix: Record<string, ModuleKey[]>;
      defaults: Record<string, ModuleKey[]>;
    }>("/module-access/matrix"),
  update: (matrix: Record<string, ModuleKey[]>) =>
    request<{ modules: ModuleKey[]; matrix: Record<string, ModuleKey[]> }>(
      "/module-access/matrix",
      { method: "PUT", body: JSON.stringify({ matrix }) },
    ),
};

export const integrationClientsApi = {
  list: () => request<IntegrationClient[]>("/integration-clients"),
  create: (payload: { name: string; scopes: IntegrationScope[]; expiresAt?: string | null }) =>
    request<
      Pick<IntegrationClient, "clientId" | "name" | "keyPrefix" | "scopes" | "expiresAt"> & {
        apiKey: string;
      }
    >("/integration-clients", { method: "POST", body: JSON.stringify(payload) }),
  revoke: (clientId: string) =>
    request<{ clientId: string; status: "REVOKED"; revokedAt: string }>(
      `/integration-clients/${clientId}`,
      { method: "DELETE" },
    ),
};

export const searchApi = {
  query: (q: string) =>
    request<{
      employees: Array<{
        id: string;
        type: string;
        title: string;
        subtitle?: string;
        href: string;
      }>;
      boards: Array<{ id: string; type: string; title: string; href: string }>;
      tasks: Array<{ id: string; type: string; title: string; href: string }>;
      announcements: Array<{
        id: string;
        type: string;
        title: string;
        subtitle?: string;
        href: string;
      }>;
    }>(`/search${toQuery({ q })}`),
};

export const notificationPreferencesApi = {
  get: () =>
    request<{
      digestMode: string;
      categories: Record<string, boolean>;
      dismissedIds?: string[];
      inboxClearedAt?: string | null;
    }>("/notification-preferences"),
  save: (payload: { digestMode: string; categories: Record<string, boolean> }) =>
    request<{ digestMode: string; categories: Record<string, boolean> }>(
      "/notification-preferences",
      { method: "PUT", body: JSON.stringify(payload) },
    ),
};

export const checklistsApi = {
  list: (filters: { status?: string; kind?: string } = {}) =>
    request<
      Array<{
        id: string;
        kind: string;
        status: string;
        templateName: string;
        employeeId: string;
        employeeName: string;
        employeeCode: string;
        createdAt: string;
        updatedAt: string;
        completedCount: number;
        totalCount: number;
        items: Array<{
          id: string;
          title: string;
          linkPath?: string | null;
          completed: boolean;
          completedAt?: string | null;
          sortOrder: number;
        }>;
      }>
    >(`/checklists${toQuery(filters)}`),
  start: (employeeId: string, kind: "ONBOARDING" | "OFFBOARDING") =>
    request<{ id: string }>("/checklists/start", {
      method: "POST",
      body: JSON.stringify({ employeeId, kind }),
    }),
  toggleItem: (id: string, completed: boolean) =>
    request<{ id: string; completed: boolean; instanceStatus: string }>(`/checklists/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
    }),
  setStatus: (id: string, status: "OPEN" | "COMPLETED" | "CANCELLED") =>
    request<{ id: string; status: string }>(`/checklists/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  templates: () =>
    request<
      Array<{
        id: string;
        name: string;
        kind: string;
        isActive: boolean;
        instanceCount: number;
        items: Array<{ id: string; title: string; linkPath?: string | null; sortOrder: number }>;
      }>
    >("/checklists/templates"),
  createTemplate: (payload: {
    name: string;
    kind: "ONBOARDING" | "OFFBOARDING";
    isActive: boolean;
    items: Array<{ title: string; linkPath?: string | null }>;
  }) =>
    request<{ id: string; ok: boolean }>("/checklists/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  saveTemplate: (
    id: string,
    payload: {
      name: string;
      isActive: boolean;
      items: Array<{ title: string; linkPath?: string | null }>;
    },
  ) =>
    request<{ id: string; ok: boolean }>(`/checklists/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTemplate: (id: string) =>
    request<{ id: string; ok: boolean; deleted?: boolean; deactivated?: boolean }>(
      `/checklists/templates/${id}`,
      { method: "DELETE" },
    ),
};

type LifecycleFile = { fileName: string; contentBase64: string; mimeType: string };

export const lifecycleApi = {
  jobs: () => request<Array<Record<string, unknown>>>("/lifecycle/jobs"),
  createJob: (payload: Record<string, unknown>) =>
    request("/lifecycle/jobs", { method: "POST", body: JSON.stringify(payload) }),
  updateJob: (id: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/jobs/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  candidates: (filters: { jobId?: string; stage?: string } = {}) =>
    request<Array<Record<string, unknown>>>(`/lifecycle/candidates${toQuery(filters)}`),
  createCandidate: (payload: Record<string, unknown>) =>
    request("/lifecycle/candidates", { method: "POST", body: JSON.stringify(payload) }),
  updateCandidate: (id: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/candidates/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  addInterview: (id: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/candidates/${id}/interviews`, { method: "POST", body: JSON.stringify(payload) }),
  createOffer: (id: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/candidates/${id}/offers`, { method: "POST", body: JSON.stringify(payload) }),
  hireCandidate: (id: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/candidates/${id}/hire`, { method: "POST", body: JSON.stringify(payload) }),
  signOffer: (id: string) => request(`/lifecycle/offers/${id}/sign`, { method: "POST", body: "{}" }),
  onboarding: () => request<Array<Record<string, unknown>>>("/lifecycle/onboarding"),
  startOnboarding: (payload: { employeeId: string; candidateId?: string }) =>
    request("/lifecycle/onboarding", { method: "POST", body: JSON.stringify(payload) }),
  signOnboardingDoc: (id: string, payload: { file?: LifecycleFile; notes?: string }) =>
    request(`/lifecycle/onboarding/documents/${id}/sign`, { method: "POST", body: JSON.stringify(payload) }),
  verifyOnboardingDoc: (id: string, payload: { approved: boolean; notes?: string }) =>
    request(`/lifecycle/onboarding/documents/${id}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  nho: () => request<Array<Record<string, unknown>>>("/lifecycle/nho"),
  saveNho: (employeeId: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/nho/${employeeId}`, { method: "PUT", body: JSON.stringify(payload) }),
  verifyNho: (employeeId: string, payload: { approved: boolean; hrNotes?: string }) =>
    request(`/lifecycle/nho/${employeeId}/verify`, { method: "POST", body: JSON.stringify(payload) }),
  changes: () => request<Array<Record<string, unknown>>>("/lifecycle/changes"),
  createChange: (payload: Record<string, unknown>) =>
    request("/lifecycle/changes", { method: "POST", body: JSON.stringify(payload) }),
  decideChange: (id: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/changes/${id}/decide`, { method: "POST", body: JSON.stringify(payload) }),
  cycles: () => request<Array<Record<string, unknown>>>("/lifecycle/performance/cycles"),
  createCycle: (payload: Record<string, unknown>) =>
    request("/lifecycle/performance/cycles", { method: "POST", body: JSON.stringify(payload) }),
  assignReview: (cycleId: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/performance/cycles/${cycleId}/assign`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reviews: (cycleId?: string) =>
    request<Array<Record<string, unknown>>>(`/lifecycle/performance/reviews${toQuery({ cycleId })}`),
  updateReview: (id: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/performance/reviews/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  offboarding: () => request<Array<Record<string, unknown>>>("/lifecycle/offboarding"),
  startOffboarding: (payload: Record<string, unknown>) =>
    request("/lifecycle/offboarding", { method: "POST", body: JSON.stringify(payload) }),
  advanceOffboarding: (id: string, payload: Record<string, unknown>) =>
    request(`/lifecycle/offboarding/${id}/advance`, { method: "POST", body: JSON.stringify(payload) }),
  lms: (kind?: string) => request<Array<Record<string, unknown>>>(`/lifecycle/lms${toQuery({ kind })}`),
  createLms: (payload: Record<string, unknown>) =>
    request("/lifecycle/lms", { method: "POST", body: JSON.stringify(payload) }),
  markLmsRead: (id: string) => request(`/lifecycle/lms/${id}/read`, { method: "POST", body: "{}" }),
  downloadFile: async (key: string, fileName = "download") => {
    const blob = await fetchAuthenticatedBlob(`/lifecycle/files/${encodeURIComponent(key)}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
