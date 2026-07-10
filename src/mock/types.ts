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
  main_admin: "Main Admin",
  ceo: "CEO / Management",
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
}

export interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: "leave" | "holiday" | "system" | "birthday";
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
  address?: string;
}
