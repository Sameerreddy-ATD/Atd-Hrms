// Shared frontend domain contracts returned by the application API.
// Keep these aligned with server mappers, validators, and the versioned integration contract.

export type Role =
  | "developer_admin"
  | "main_admin"
  | "ceo"
  | "chief_of_staff"
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
  | "SYSTEM"
  | "TALENT"
  | "LIFECYCLE"
  | "PERFORMANCE"
  | "LMS";

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
  chief_of_staff: "Chief of Staff",
  hr: "HR",
  manager: "Manager",
  employee: "Team Member",
  sales: "Sales Team",
  driver: "Bowser Pilot",
  field_staff: "Field Staff",
};

export type CompanyEntity =
  "ROYAL_PETRO_PARK_PRIVATE_LIMITED" | "ANYTIME_DIESEL" | "FUELISTIC_INNOVATIONS_PRIVATE_LIMITED";

export type BankAccountType = "SAVINGS" | "CURRENT" | "SALARY" | "NRE" | "NRO" | "OTHER";

export type WeeklyOffPolicy = "SUNDAY_FIXED" | "SELECTABLE";

export const WEEKLY_OFF_POLICY_LABELS: Record<WeeklyOffPolicy, string> = {
  SUNDAY_FIXED: "Sunday fixed",
  SELECTABLE: "Selectable (approval)",
};

export const COMPANY_LABELS: Record<CompanyEntity, string> = {
  ROYAL_PETRO_PARK_PRIVATE_LIMITED: "Royal Petro Park Private Limited",
  ANYTIME_DIESEL: "Anytime Diesel",
  FUELISTIC_INNOVATIONS_PRIVATE_LIMITED: "Fuelistic Innovations Private Limited",
};

export const PARENT_COMPANY_NAME = "Royal Petro Park Private Limited";

/** One signed-in device, shown in the Developer Admin account panel. */
export interface UserSessionEntry {
  sessionId: string;
  platform: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  signedInAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrentDevice: boolean;
}

export interface UserSessionList {
  userId: string;
  name: string;
  email: string;
  activeDeviceCount: number;
  sessions: UserSessionEntry[];
}

export interface User {
  id: string;
  userId?: string | null;
  /** Devices currently signed in. Present only on the Developer Admin list. */
  activeDeviceCount?: number;
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
  /** Units this person currently heads (from Departments chart). */
  headedDepartments?: Array<{ id: string; name: string }>;
  designation?: string;
  phone?: string;
  companyPhone?: string;
  companyEntity?: CompanyEntity;
  active: boolean;
  status?: string;
  accountStatus?: "ACTIVE" | "INACTIVE" | "LOCKED" | "SUSPENDED";
  /** Account activation lifecycle from create → first login → password set. */
  loginLifecycle?: "CREATED" | "PASSWORD_CHANGE" | "ACTIVE" | "INACTIVE" | "LOCKED" | "SUSPENDED";
  failedLoginAttempts?: number;
  deactivatedAt?: string | null;
  employeeStatus?: "ACTIVE" | "INACTIVE" | "TERMINATED";
  suspendedUntil?: string;
  suspensionStartsAt?: string;
  lastLoginAt?: string | null;
  managerId?: string;
  managerName?: string;
  attendanceMode?: "THUMB_ONLY" | "MOBILE_GPS_ONLY" | "BOTH";
  /** When false, this person is excused from attendance and leave. */
  attendanceRequired?: boolean;
  isFieldEmployee?: boolean;
  weeklyOffPolicy?: WeeklyOffPolicy;
  profileVerified?: boolean;
  /** True only when Dev Admin policy is on and this user's role is targeted. */
  profileVerificationRequired?: boolean;
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
  fatherName?: string;
  husbandName?: string;
  maritalStatus?: "SINGLE" | "MARRIED";
  companyEmail?: string;
  personalEmail?: string;
  presentDoorNo?: string;
  presentFlatName?: string;
  presentStreetName?: string;
  presentAddress?: string;
  presentCity?: string;
  presentState?: string;
  presentPincode?: string;
  permanentSameAsPresent?: boolean;
  permanentDoorNo?: string;
  permanentFlatName?: string;
  permanentStreetName?: string;
  permanentAddress?: string;
  permanentCity?: string;
  permanentState?: string;
  permanentPincode?: string;
  departmentName?: string;
  lifecycleStage?: string;
  shiftType?: "DAY" | "NIGHT";
  shiftStartMinutes?: number;
  shiftEndMinutes?: number;
  emergencyContact?: EmergencyContact | null;
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

export type FaceChallenge = "FACE" | "BLINK" | "TURN_LEFT" | "TURN_RIGHT";

export interface FaceCapturePayload {
  sessionId: string;
  nonce: string;
  descriptor: number[];
  descriptorSamples?: number[][];
  /** Required for enrollment; omitted on attendance verify (photo is not stored). */
  imageData?: string;
  enrollmentViews?: Array<{
    direction: "FRONT" | "EYES_OPEN" | "EYES_CLOSED";
    imageData: string;
    descriptor: number[];
  }>;
  faceConfidence: number;
  livenessScore: number;
  antiSpoofScore: number;
  challengeCompleted: true;
}

export interface FaceVerificationSession {
  sessionId: string;
  nonce: string;
  challenge: FaceChallenge;
  purpose: FaceVerificationPurpose;
  expiresAt: string;
  settings: {
    minFaceConfidence: number;
    minLivenessScore: number;
    minAntiSpoofScore: number;
    maxGpsAccuracyMeters: number;
  };
}

export interface FaceEvidenceSummary {
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
  /** 1-based registration angle order: 1 centre, 2 left, 3 right */
  photoIndex: number;
  label: string;
}

export interface FaceAdminProfile {
  userId: string;
  employeeId: string | null;
  employeeCode?: string | null;
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
  /** @deprecated Prefer enrollmentEvidence — kept for older clients */
  latestEvidence: FaceEvidenceSummary | null;
  /** First 3 registration photos (centre, left, right) from the latest enrollment */
  enrollmentEvidence: FaceEvidenceSummary[];
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
  registrationApprovalMode: "MANUAL" | "AUTOMATIC";
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
  locationCode?: string;
  locationType?: string;
  locationTypeLabel?: string;
  addressLine1?: string;
  addressLine2?: string;
  locality?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  status?: string;
  active?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  attendanceRadiusMeters?: number;
  timezone?: string;
  description?: string;
  sortOrder?: number;
  employeeCount?: number;
  /** Parking hub — compatibility mirror of locationType === PARKING_HUB. */
  isHub?: boolean;
  basedEmployees?: Array<{
    employeeId: string;
    name: string;
    employeeCode: string;
    designation?: string | null;
  }>;
}

export interface Department {
  id: string;
  name: string;
  unitCode?: string;
  description?: string;
  active?: boolean;
  /** First / primary head (compat). */
  headEmployeeId?: string;
  primaryHeadEmployeeId?: string;
  head?: string;
  /** All organization heads for this unit. */
  headEmployeeIds?: string[];
  heads?: string[];
  /** People with view-only access to this unit's attendance, leave, and team records. */
  viewerEmployeeIds?: string[];
  viewers?: string[];
  parentDepartmentId?: string;
  unitType?: "TEAM" | "SUBTEAM" | "FUNCTION";
  sortOrder?: number;
  /** When false, people in this unit skip face enrollment and check-in camera. */
  faceVerificationEnabled?: boolean;
  /** Active employees assigned directly to this unit (excludes left/terminated). */
  memberCount?: number;
  directEmployeeCount?: number;
  totalDescendantEmployeeCount?: number;
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
  activeSeatCount?: number;
  costSharePerSeat?: number;
  branchId?: string;
  branchName?: string;
  location?: string;
  notes?: string;
  laptopName?: string;
  deviceId?: string;
  productId?: string;
  processor?: string;
  ram?: string;
  ssd?: string;
  windowsVersion?: string;
  macAddress?: string;
  userPassword?: string;
  adminPassword?: string;
  warrantyUntil?: string;
  assignments?: AssetSeat[];
}

export interface AssetSeat {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  visibleToEmployee: boolean;
  assignedAt: string;
  costShareAmount?: number;
  costShareFrequency?: "ONE_TIME" | "MONTHLY" | "YEARLY";
}

export interface MyAssignedAsset {
  id: string;
  assetId: string;
  assetCode: string;
  name: string;
  category: string;
  serialNumber?: string;
  assetType: "PHYSICAL" | "ONLINE";
  assignmentScope: "EMPLOYEE" | "COMPANY";
  costFrequency: "ONE_TIME" | "MONTHLY" | "YEARLY";
  renewalDate?: string;
  status: string;
  location?: string;
  branchName?: string;
  assignedAt: string;
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
  lifetimeInvestment: number;
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
  claimType: "ADVANCE" | "EXPENSE" | "FIELD";
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
  | "Full Day"
  | "Present"
  | "Absent"
  | "Holiday"
  | "Week Off"
  | "Paid Leave"
  | "Unpaid Leave"
  | "Unpaid Leave / LOP"
  | "Missed Checkout"
  | "Pending attendance"
  | "Present"
  | "Present - Home Branch"
  | "Present - Other Branch"
  | "Present - Scheduled Branch"
  | "Present - Branch Mismatch"
  | "Present - Field"
  | "Present - Office + Field"
  | "Early Exit"
  | "On Leave"
  | "Missed Punch"
  | "Manual Correction"
  | "Location Flagged"
  | "Pending Approval"
  | "Rejected Attendance"
  | string;

export type AttendanceSource =
  "Branch-Mobile" | "Mobile" | "Thumb Scanner" | "Manual Entry" | "System" | string;

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode?: string;
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
  attendanceResult?: string;
  source: AttendanceSource;
  checkInSource?: string;
  checkOutSource?: string;
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
  isLate?: boolean;
  isLocked?: boolean;
  correctionDeadlineAt?: string;
  provisionalCheckOutAt?: string;
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
  employeeCode?: string;
  managerName?: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  session?: "FULL" | "FIRST_HALF" | "SECOND_HALF";
  reason: string;
  status: LeaveStatus;
  workflowStatus?: string;
  appliedOn: string;
  updatedOn?: string;
  approverName?: string;
  reviewedByName?: string;
  cancelledDates?: string[];
  cancelledDays?: number;
  medicalDocumentUrl?: string;
  medicalDocumentDueAt?: string;
  medicalDocumentVerifiedAt?: string;
  availableBalance?: number;
  requestedDays?: number;
  projectedBalance?: number;
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
  /** Organization heads can decide; view-access people see the request only. */
  canReview?: boolean;
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
  /** Organization heads can decide; view-access people see the request only. */
  canReview?: boolean;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  description?: string;
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
  isHub?: boolean;
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

export type ProfileSelfEditFieldKey =
  | "name"
  | "phone"
  | "companyPhone"
  | "dateOfBirth"
  | "bloodGroup"
  | "bankAccountHolderName"
  | "bankAccountNumber"
  | "bankIfscCode"
  | "panNumber"
  | "aadhaarNumber"
  | "uanNumber"
  | "emergencyContact";

export interface ProfileSelfEditPolicy {
  enabled: boolean;
  allowedFields: ProfileSelfEditFieldKey[];
  availableFields: { key: ProfileSelfEditFieldKey; label: string; group: string }[];
}

export type ProfileVerificationTargetRole =
  | "employee"
  | "sales"
  | "field_staff"
  | "manager"
  | "hr"
  | "main_admin";

export interface ProfileVerificationPolicy {
  enabled: boolean;
  /** Prisma Role enum values (EMPLOYEE, SALES, …). */
  targetRoles: string[];
  availableRoles: { key: string; label: string }[];
}

export interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: "leave" | "holiday" | "system" | "birthday" | "task" | "announcement" | "attendance";
  priority?: "NORMAL" | "IMPORTANT" | "URGENT";
  authorName?: string;
  href?: string;
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
export type TaskIssueType = "TASK" | "BUG" | "STORY" | "EPIC";
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
  issueKey?: string;
  issueNumber?: number;
  issueType?: TaskIssueType;
  rank?: number;
  assignees: TaskAssignee[];
  createdByUserId: string;
  createdByName: string;
  parentTaskId?: string;
  boardId?: string;
  boardName?: string;
  boardKeyPrefix?: string;
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
  keyPrefix?: string;
  nextIssueNumber?: number;
  description?: string;
  accessType: "OPEN" | "DEPARTMENT_GATED" | "MEMBER_GATED";
  archived: boolean;
  version: number;
  allowedDepartmentIds: string[];
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
  departmentId?: string;
  role?: string;
}

export interface EmergencyContact {
  contactName: string;
  relationship: string;
  phone: string;
  alternatePhone?: string;
  address?: string;
  bloodGroup?: string;
  medicalNotes?: string;
}

export type ResolvedShiftSource =
  | "DAY_OVERRIDE"
  | "ROSTER"
  | "DEFAULT"
  | "COMPANY_DEFAULT"
  | "NONE";

export type ResolvedDefaultScope = "EMPLOYEE" | "COMPANY" | null;

export interface ShiftSegmentDto {
  id?: string;
  sequence: number;
  startMinute: number;
  endMinute: number;
  endDayOffset: number;
  startLabel?: string;
  endLabel?: string;
  ends?: "SAME_DAY" | "NEXT_DAY";
}

export interface ShiftTemplate {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  timezone: string;
  graceInMinutes: number;
  graceOutMinutes: number;
  expectedWorkMinutes: number;
  expectedWorkLabel?: string;
  colorToken?: string | null;
  active: boolean;
  isCompanyDefault?: boolean;
  shiftType?: "DAY" | "NIGHT";
  startMinutes?: number;
  endMinutes?: number;
  segments: ShiftSegmentDto[];
  assignedEmployees?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RosterDayCell {
  source: ResolvedShiftSource;
  shiftId: string | null;
  shiftName: string | null;
  code: string | null;
  explicitNoShift: boolean;
}

export interface RosterWeekEmployee {
  employeeId: string;
  name: string;
  employeeCode: string;
  days: Record<string, RosterDayCell>;
}

export interface RosterWeek {
  weekStart: string;
  weekEnd: string;
  employees: RosterWeekEmployee[];
}

export interface ResolvedEmployeeShift {
  employeeId: string;
  workDate: string;
  source: ResolvedShiftSource;
  defaultScope?: ResolvedDefaultScope;
  explicitNoShift: boolean;
  timezone: string;
  shiftTemplate: null | {
    id: string;
    code: string;
    name: string;
    active: boolean;
    shiftType: "DAY" | "NIGHT";
    graceInMinutes: number;
    graceOutMinutes: number;
    expectedWorkMinutes: number;
  };
  segments: Array<{
    sequence: number;
    startMinute: number;
    endMinute: number;
    endDayOffset: number;
    absoluteStartMinute: number;
    absoluteEndMinute: number;
    crossesMidnight: boolean;
  }>;
  expectedWorkMinutes: number;
  firstSegmentStartMinute: number | null;
  finalSegmentEndMinute: number | null;
  finalSegmentEndDayOffset: number | null;
  crossesMidnight: boolean;
}
