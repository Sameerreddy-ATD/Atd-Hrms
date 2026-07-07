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
  homeBranchId?: string;
  department?: string;
  designation?: string;
  phone?: string;
  active: boolean;
  mustChangePassword?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  code: string;
}

export interface Department {
  id: string;
  name: string;
  head?: string;
}

export interface BiometricDevice {
  id: string;
  name: string;
  branchId: string;
  serial: string;
  status: "online" | "offline";
  lastSync: string;
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
  address?: string;
  branchMismatch?: boolean;
}

export type LeaveType =
  | "Paid Leave"
  | "Sick Leave"
  | "Casual Leave"
  | "Half-Day Leave"
  | "Unpaid Leave"
  | "Emergency Leave"
  | "Comp Off";

export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
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

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
  address?: string;
}
