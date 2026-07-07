import type { Role } from "@/mock/types";
import {
  LayoutDashboard,
  Users,
  Building2,
  Fingerprint,
  Shield,
  Settings,
  ScrollText,
  UserCog,
  FileText,
  CalendarCheck,
  MapPin,
  ClipboardList,
  PlaneTakeoff,
  BadgeCheck,
  IdCard,
  BellRing,
  Phone,
  UserPlus,
  ClipboardCheck,
  History,
  Wallet,
  Building,
  AlertTriangle,
  Briefcase,
  Download,
} from "lucide-react";
import type { ComponentType } from "react";

export interface MenuItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const ALL: Role[] = [
  "developer_admin",
  "main_admin",
  "ceo",
  "hr",
  "manager",
  "employee",
  "sales",
  "driver",
  "field_staff",
];

export const menuGroups: MenuGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/app/dashboard", icon: LayoutDashboard, roles: ALL },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Employees", to: "/app/employees", icon: Users, roles: ["developer_admin", "main_admin", "hr", "manager"] },
      { label: "User Logins", to: "/app/users", icon: UserCog, roles: ["developer_admin", "main_admin", "hr"] },
      { label: "Create Login", to: "/app/users/new", icon: UserPlus, roles: ["developer_admin", "main_admin", "hr"] },
      { label: "Roles & Permissions", to: "/app/roles", icon: Shield, roles: ["developer_admin", "main_admin"] },
      { label: "Departments", to: "/app/departments", icon: Briefcase, roles: ["developer_admin", "main_admin", "hr"] },
    ],
  },
  {
    label: "Attendance",
    items: [
      { label: "My Attendance", to: "/app/attendance/mine", icon: CalendarCheck, roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"] },
      { label: "Attendance Logs", to: "/app/attendance", icon: ClipboardList, roles: ["developer_admin", "main_admin", "hr", "manager", "ceo"] },
      { label: "Branch Attendance", to: "/app/attendance/branch", icon: Building, roles: ["hr", "manager", "ceo", "main_admin"] },
      { label: "Field Attendance", to: "/app/attendance/field", icon: MapPin, roles: ["hr", "manager", "ceo", "main_admin"] },
      { label: "Field Staff Location", to: "/app/attendance/locations", icon: MapPin, roles: ["manager"] },
      { label: "Attendance Corrections", to: "/app/attendance/corrections", icon: ClipboardCheck, roles: ["manager", "hr"] },
      { label: "Branch Mismatch Alerts", to: "/app/attendance/mismatch", icon: AlertTriangle, roles: ["manager", "hr"] },
      { label: "Missed Punch Request", to: "/app/attendance/missed-punch", icon: ClipboardCheck, roles: ["employee", "sales", "driver", "field_staff"] },
    ],
  },
  {
    label: "Leave",
    items: [
      { label: "Apply Leave", to: "/app/leave/apply", icon: PlaneTakeoff, roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"] },
      { label: "Leave History", to: "/app/leave/history", icon: History, roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"] },
      { label: "Leave Balance", to: "/app/leave/balance", icon: Wallet, roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"] },
      { label: "Leave Approvals", to: "/app/leave/approvals", icon: BadgeCheck, roles: ["manager", "hr"] },
      { label: "Leave Reports", to: "/app/leave/reports", icon: FileText, roles: ["hr", "ceo", "main_admin"] },
      { label: "Leave Policy", to: "/app/leave/policy", icon: Settings, roles: ["hr", "developer_admin", "main_admin"] },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "Branches", to: "/app/branches", icon: Building2, roles: ["developer_admin", "main_admin", "hr"] },
      { label: "Biometric Devices", to: "/app/devices", icon: Fingerprint, roles: ["developer_admin", "main_admin", "hr"] },
      { label: "Biometric Mapping", to: "/app/devices/mapping", icon: Fingerprint, roles: ["hr", "developer_admin"] },
      { label: "Holidays", to: "/app/holidays", icon: CalendarCheck, roles: ["hr", "main_admin", "developer_admin"] },
      { label: "Company Setup", to: "/app/company-setup", icon: Building2, roles: ["developer_admin"] },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports", to: "/app/reports", icon: FileText, roles: ["ceo", "hr", "main_admin", "manager"] },
      { label: "Payroll Export", to: "/app/reports/payroll", icon: Download, roles: ["hr", "ceo"] },
      { label: "Audit Logs", to: "/app/audit", icon: ScrollText, roles: ["developer_admin", "main_admin", "hr"] },
    ],
  },
  {
    label: "Me",
    items: [
      { label: "My Profile", to: "/app/profile", icon: UserCog, roles: ALL },
      { label: "ID Card", to: "/app/id-card", icon: IdCard, roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"] },
      { label: "Emergency Contact", to: "/app/emergency-contact", icon: Phone, roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"] },
      { label: "Notifications", to: "/app/notifications", icon: BellRing, roles: ALL },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Device Settings", to: "/app/settings/devices", icon: Fingerprint, roles: ["developer_admin"] },
      { label: "System Settings", to: "/app/settings", icon: Settings, roles: ["developer_admin", "main_admin"] },
    ],
  },
];

export function menuForRole(role: Role): MenuGroup[] {
  return menuGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
}