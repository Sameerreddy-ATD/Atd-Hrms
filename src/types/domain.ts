// Shared frontend domain contracts returned by the application API.
// Keep these aligned with server mappers, validators, and the versioned integration contract.

export type Role =
  | "developer_admin"
  | "main_admin"
  | "ceo"
  | "hr"
  | "manager"
  | "employee"
  | "sales"
  | "driver"
  | "field_staff";

export type ModuleKey =
  | "DASHBOARD"
  | "PEOPLE"
  | "ATTENDANCE"
  | "TASKS"
  | "EMPLOYEE_REQUESTS"
  | "LEAVE"
  | "COMPANY"
  | "PROFILE"
  | "COMMUNICATIONS"
  | "SYSTEM";

export type IntegrationScope = "employees:read" | "employees:write" | "employee-events:read";

export interface IntegrationClient {
  clientId: string;
  name: string;
  keyPrefix: string;
  scopes: IntegrationScope[];
  status: "ACTIVE" | "REVOKED";
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  developer_admin: "Developer Admin",
  main_admin: "Admin",
  ceo: "CEO",
  hr: "HR",
  manager: "Manager",
  employee: "Employee",
  sales: "Sales Team",
  driver: "Driver",
  field_staff: "Field Staff",
};

export type CompanyEntity =
  "ROYAL_PETRO_PARK_PRIVATE_LIMITED" | "ANYTIME_DIESEL" | "FUELISTIC_INNOVATIONS_PRIVATE_LIMITED";

export type BankAccountType = "SAVINGS" | "CURRENT" | "SALARY" | "NRE" | "NRO" | "OTHER";

export const COMPANY_LABELS: Record<CompanyEntity, string> = {
  ROYAL_PETRO_PARK_PRIVATE_LIMITED: "Royal Petro Park Private Limited",
  ANYTIME_DIESEL: "Anytime Diesel",
  FUELISTIC_INNOVATIONS_PRIVATE_LIMITED: "Fuelistic Innovations Private Limited",
};

export const PARENT_COMPANY_NAME = "Royal Petro Park Private Limited";

export interface User {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  role: Role;
  employeeId?: string;
  employeeCode?: string;
  externalReference?: string | null;
  version?: number;
  homeBranchId?: string;
  homeBranchName?: string;
  department?: string;
  departmentId?: string;
  designation?: string;
  phone?: string;
  companyPhone?: string;
  companyEntity?: CompanyEntity;
  active: boolean;
  status?: string;
  accountStatus?: "ACTIVE" | "INACTIVE" | "LOCKED" | "SUSPENDED";
  failedLoginAttempts?: number;
  suspendedUntil?: string;
  suspensionStartsAt?: string;
  managerId?: string;
  managerName?: string;
  attendanceMode?: "THUMB_ONLY" | "MOBILE_GPS_ONLY" | "BOTH";
  isFieldEmployee?: boolean;
  joiningDate?: string;
  dateOfBirth?: string;
  gender?: "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY";
  bloodGroup?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  employmentType?: "FULL_TIME" | "PART_TIME" | "INTERN";
  organizationLevel?: "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER";
  bankAccountType?: BankAccountType;
  bankAccountHolderName?: string;
  bankIfscCode?: string;
  bankAccountNumber?: string;
  bankAccountNumberLast4?: string;
  panNumber?: string;
  panNumberLast4?: string;
  aadhaarNumber?: string;
  aadhaarNumberLast4?: string;
  uanNumber?: string;
  uanNumberLast4?: string;
  shiftType?: "DAY" | "NIGHT";
  shiftStartMinutes?: number;
  shiftEndMinutes?: number;
  mustChangePassword?: boolean;
  faceEnrollmentStatus?: FaceEnrollmentStatus;
  faceEnrollmentRequired?: boolean;
  faceEnrollmentReason?: string;
  faceEnrollmentSubmittedAt?: string;
  faceEnrollmentApprovedAt?: string;
  terminatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type FaceEnrollmentStatus =
  "NOT_REGISTERED" | "PENDING" | "APPROVED" | "REJECTED" | "DISABLED";

export type FaceVerificationPurpose = "ENROLLMENT" | "ATTENDANCE_CHECK_IN" | "ATTENDANCE_CHECK_OUT";

export type FaceChallenge = "BLINK" | "TURN_LEFT" | "TURN_RIGHT";

export interface FaceCapturePayload {
  sessionId: string;
  nonce: string;
  descriptor: number[];
  descriptorSamples?: number[][];
  imageData: string;
  faceConfidence: number;
  livenessScore: number;
  antiSpoofScore: number;
  challengeCompleted: true;
}

export interface FaceVerificationSession {
  sessionId: string;
  nonce: string;
  challenge: FaceChallenge;
  expiresAt: string;
  settings: {
    minFaceConfidence: number;
    minLivenessScore: number;
    minAntiSpoofScore: number;
    maxGpsAccuracyMeters: number;
  };
}

export interface FaceAdminProfile {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  role: string;
  status: FaceEnrollmentStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  latestAlert: {
    evidenceId: string;
    capturedAt: string;
    failureReason: string | null;
  } | null;
  latestEvidence: {
    evidenceId: string;
    outcome: "CREATED" | "PASSED" | "FAILED" | "EXPIRED";
    capturedAt: string;
    expiresAt: string;
    imageAvailable: boolean;
    faceConfidence: number;
    livenessScore: number;
    antiSpoofScore: number;
    similarityScore: number | null;
    failureReason: string | null;
  } | null;
}

export interface FaceEvidenceRecord {
  evidenceId: string;
  purpose: FaceVerificationPurpose;
  outcome: "CREATED" | "PASSED" | "FAILED" | "EXPIRED";
  capturedAt: string;
  expiresAt: string;
  imageAvailable: boolean;
  faceConfidence: number;
  livenessScore: number;
  antiSpoofScore: number;
  similarityScore: number | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  failureReason: string | null;
}

export interface FaceSettings {
  verificationEnabled: boolean;
  retentionDays: number;
  matchThreshold: number;
  minFaceConfidence: number;
  minLivenessScore: number;
  minAntiSpoofScore: number;
  maxGpsAccuracyMeters: number;
  sessionTtlSeconds: number;
}

/** Employee directory/profile response. Its id is always the employeeId. */
export interface EmployeeProfile extends Omit<User, "id"> {
  id: string;
  employeeId: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  code: string;
  city?: string;
  status?: string;
  latitude?: number | null;
  longitude?: number | null;
  attendanceRadiusMeters?: number;
}

export interface Department {
  id: string;
  name: string;
  headEmployeeId?: string;
  head?: string;
  parentDepartmentId?: string;
  unitType?: "TEAM" | "SUBTEAM" | "FUNCTION";
  sortOrder?: number;
}

export interface BiometricDevice {
  id: string;
  name: string;
  branchId: string;
  serial: string;
  deviceIp?: string;
  port?: number;
  location?: string;
  status: "online" | "offline";
  rawStatus?: string;
  lastSync: string;
}

export interface BiometricMapping {
  id: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  homeBranchId?: string;
  biometricUserId: string;
  deviceId?: string;
  deviceName?: string;
  deviceCode?: string;
  deviceBranchId?: string;
  status: string;
}

export interface CompanyAsset {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  catalogId?: string;
  serialNumber?: string;
  purchaseValue: number;
  purchaseDate?: string;
  assetType: "PHYSICAL" | "ONLINE";
  assignmentScope: "EMPLOYEE" | "COMPANY";
  costFrequency: "ONE_TIME" | "MONTHLY" | "YEARLY";
  renewalDate?: string;
  monthlyEquivalent: number;
  annualRecurring: number;
  status: "AVAILABLE" | "ASSIGNED" | "UNDER_REPAIR" | "RETIRED";
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedEmployeeCode?: string;
  branchId?: string;
  branchName?: string;
  location?: string;
  notes?: string;
}

export interface EmployeeAssetInvestment {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department?: string;
  physicalAssets: number;
  onlineAssets: number;
  oneTimeInvestment: number;
  monthlyRecurring: number;
  annualRecurring: number;
  firstYearInvestment: number;
}

export interface AssetCatalogItem {
  id: string;
  name: string;
  category: string;
  defaultValue?: number;
  status: string;
}

export interface AssetReturnRecord {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  condition: "GOOD" | "FAIR" | "DAMAGED" | "NOT_WORKING";
  accessoriesReturned: boolean;
  chargerReturned: boolean;
  dataBackedUp: boolean;
  dataWiped: boolean;
  physicalDamage: boolean;
  damageNotes?: string;
  remarks?: string;
  returnedAt: string;
}

export interface ExpenseClaim {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  claimType: "ADVANCE" | "EXPENSE" | "TRAVEL" | "FUEL" | "FIELD";
  title?: string;
  amount: number;
  expenseDate?: string;
  description?: string;
  remark?: string;
  receiptUrl?: string;
  receiptAccessConfirmed?: boolean;
  status: "PENDING" | "UNPAID" | "REJECTED" | "PAID";
  reviewNotes?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CertificateRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  certificateType: string;
  purpose: string;
  deliveryMode: "DIGITAL" | "PRINTED";
  requiredBy?: string;
  status: "PENDING" | "IN_PROGRESS" | "READY" | "REJECTED" | "COLLECTED";
  hrNotes?: string;
  documentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus =
  | "Present"
  | "Present - Home Branch"
  | "Present - Other Branch"
  | "Present - Scheduled Branch"
  | "Present - Branch Mismatch"
  | "Present - Field"
  | "Present - Office + Field"
  | "Late"
  | "Early Exit"
  | "Half Day"
  | "Absent"
  | "On Leave"
  | "Paid Leave"
  | "Unpaid Leave"
  | "Holiday"
  | "Week Off"
  | "Missed Punch"
  | "Missed Checkout"
  | "Manual Correction"
  | "Location Flagged"
  | "Pending Approval"
  | "Rejected Attendance";

export type AttendanceSource = "Thumb Scanner" | "Mobile GPS" | "Manual Entry" | "System";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  homeBranchId: string;
  scheduledBranchId?: string;
  actualBranchId?: string;
  deviceName?: string;
  punchIn?: string;
  punchOut?: string;
  punchInSource?: AttendanceSource;
  punchInBranchId?: string;
  punchOutSource?: AttendanceSource;
  punchOutBranchId?: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  latitude?: number;
  longitude?: number;
  fieldCheckInLatitude?: number;
  fieldCheckInLongitude?: number;
  fieldCheckOutLatitude?: number;
  fieldCheckOutLongitude?: number;
  address?: string;
  branchMismatch?: boolean;
  visitedBranchIds?: string[];
  visitedLocations?: Array<Record<string, unknown>>;
  branchMovementCount?: number;
  fieldVisitCount?: number;
  clientVisitCount?: number;
  totalHours?: number;
  workedMinutes?: number;
  hasMissingOutEvent?: boolean;
  hasMissedCheckout?: boolean;
  latestOpenPunchAt?: string;
  officeHours?: number;
  fieldHours?: number;
  clientVisitHours?: number;
}

export type LeaveType =
  | "Paid Leave"
  | "Sick Leave"
  | "Casual Leave"
  | "Half-Day Leave"
  | "Unpaid Leave"
  | "Emergency Leave"
  | "Comp Off"
  | string;

export interface LeaveTypeOption {
  id: string;
  name: string;
  paid: boolean;
  code: "CASUAL" | "SICK" | "LOP" | "COMP_OFF" | string;
  active: boolean;
  annualAllowance?: number;
  monthlyCredit?: number;
  maxPerMonth?: number;
  carryForward: boolean;
  requiresMedicalDocument: boolean;
  approvalRequired: boolean;
  description: string;
}

export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  managerName?: string;
  approverId?: string;
  type: LeaveType;
  leaveCode?: string;
  paid?: boolean;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  workflowStatus?: string;
  appliedOn: string;
  updatedOn?: string;
  approverName?: string;
  cancelledDates?: string[];
  cancelledDays?: number;
  medicalDocumentUrl?: string;
  medicalDocumentDueAt?: string;
  medicalDocumentVerifiedAt?: string;
  reviewerName?: string;
  reviewedAt?: string;
  decisionNote?: string;
  availableBalance?: number | null;
  requestedDays?: number;
  projectedBalance?: number | null;
  leaveBalances?: Array<{
    type: LeaveType;
    code?: string;
    entitled: number;
    used: number;
    balance: number;
  }>;
  otherPendingCount?: number;
  otherPendingDays?: number;
  sameTypeOtherPendingDays?: number;
}

export interface LeaveBalance {
  type: LeaveType;
  entitled: number;
  used: number;
  balance: number;
  code?: string;
  manualAdjustment?: number;
  description?: string;
}

export interface WeeklyOffRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reason?: string;
  approverId: string;
  assignedApproverName?: string;
  reviewedByName?: string;
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  branchId?: string;
  type: "Public" | "Optional" | "Restricted";
  status?: string;
}

export interface AttendanceTimelineEvent {
  employeeId?: string;
  employeeName?: string;
  date?: string;
  time: string;
  source: string;
  type: string;
  branchName?: string;
  deviceName?: string;
  latitude?: number;
  longitude?: number;
  clientName?: string;
  clientLocationName?: string;
  remarks?: string;
  address?: string;
  photoUrl?: string;
  statusLabel: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  role: Role;
  action: string;
  target: string;
  timestamp: string;
  ipAddress?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: "leave" | "holiday" | "system" | "birthday" | "task" | "announcement" | "attendance";
  priority?: "NORMAL" | "IMPORTANT" | "URGENT";
  authorName?: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: "NORMAL" | "IMPORTANT" | "URGENT";
  publishAt: string;
  expiresAt?: string;
  isActive: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskActivityType =
  | "CREATED"
  | "COMMENT"
  | "STATUS_CHANGED"
  | "PROGRESS_UPDATED"
  | "ASSIGNEES_CHANGED"
  | "DETAILS_UPDATED";

export interface TaskUpdate {
  id: string;
  authorName: string;
  activityType: TaskActivityType;
  message: string;
  metadata?: Record<string, unknown>;
  progress?: number;
  status?: TaskStatus;
  minutesWorked?: number;
  createdAt: string;
}

export interface WorkTask {
  id: string;
  title: string;
  description?: string;
  assignees: TaskAssignee[];
  createdByUserId: string;
  createdByName: string;
  parentTaskId?: string;
  boardId?: string;
  boardName?: string;
  stageId?: string;
  stage?: TaskStage;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  version: number;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  archivedAt?: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  subtaskCount: number;
  updateCount: number;
  customFields?: Record<string, unknown>;
  updates: TaskUpdate[];
}

export interface TaskStage {
  id: string;
  name: string;
  color: "SLATE" | "BLUE" | "AMBER" | "VIOLET" | "EMERALD" | "RED";
  sortOrder: number;
  isCompleted: boolean;
  status: TaskStatus;
}

export interface TaskBoard {
  id: string;
  createdByUserId: string;
  name: string;
  description?: string;
  accessType: "OPEN" | "ROLE_GATED" | "MEMBER_GATED";
  archived: boolean;
  version: number;
  allowedRoles: string[];
  memberEmployeeIds: string[];
  stages: TaskStage[];
  taskCount: number;
  openTaskCount: number;
  customFieldDefs?: Array<{ key: string; label: string; type: "text" | "number" | "select" }>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAssignee {
  id: string;
  name: string;
  employeeCode: string;
  designation?: string;
  department?: string;
  role?: string;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
  address?: string;
}
