// Shared types used across mock data and UI. Backend team can align real
// models to these interfaces or replace as needed.

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

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeId?: string;
  employeeCode?: string;
  homeBranchId?: string;
  homeBranchName?: string;
  department?: string;
  departmentId?: string;
  designation?: string;
  phone?: string;
  active: boolean;
  status?: string;
  suspendedUntil?: string;
  suspensionStartsAt?: string;
  managerId?: string;
  managerName?: string;
  attendanceMode?: "THUMB_ONLY" | "MOBILE_GPS_ONLY" | "BOTH";
  isFieldEmployee?: boolean;
  joiningDate?: string;
  dateOfBirth?: string;
  gender?: "FEMALE" | "MALE" | "PREFER_NOT_TO_SAY";
  employmentType?: "FULL_TIME" | "PART_TIME" | "INTERN";
  organizationLevel?: "HEAD" | "SENIOR" | "JUNIOR" | "MEMBER";
  weeklyOffDays?: string[];
  mustChangePassword?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  code: string;
  city?: string;
  status?: string;
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
}

export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  managerName?: string;
  type: LeaveType;
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
}

export interface LeaveBalance {
  type: LeaveType;
  entitled: number;
  used: number;
  balance: number;
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
  type: "leave" | "holiday" | "system" | "birthday" | "task";
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TaskUpdate {
  id: string;
  authorName: string;
  message: string;
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
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  subtaskCount: number;
  updateCount: number;
  updates: TaskUpdate[];
}

export interface TaskAssignee {
  id: string;
  name: string;
  employeeCode: string;
  designation?: string;
  department?: string;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
  address?: string;
}
