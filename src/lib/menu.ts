import type { Role } from "@/mock/types";
import {
  LayoutDashboard,
  Users,
  Building2,
  Fingerprint,
  Settings,
  ScrollText,
  UserCog,
  FileText,
  CalendarCheck,
  MapPin,
  PlaneTakeoff,
  BadgeCheck,
  IdCard,
  BellRing,
  History,
  Briefcase,
  Package,
  ListTodo,
  FileClock,
} from "lucide-react";
import type { ComponentType } from "react";

export interface MenuItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
  requiresReportingManager?: boolean;
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
    items: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: ALL }],
  },
  {
    label: "People",
    items: [
      {
        label: "Employees",
        to: "/employees",
        icon: Users,
        roles: ["developer_admin", "main_admin", "hr", "manager"],
      },
      {
        label: "User Logins",
        to: "/users",
        icon: UserCog,
        roles: ["developer_admin"],
      },
      {
        label: "Departments",
        to: "/departments",
        icon: Briefcase,
        roles: ["developer_admin"],
      },
    ],
  },
  {
    label: "Attendance",
    items: [
      {
        label: "My Attendance",
        to: "/attendance/mine",
        icon: CalendarCheck,
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"],
      },
      {
        label: "Day Logs",
        to: "/attendance/locations",
        icon: MapPin,
        roles: ["manager", "hr", "main_admin", "ceo"],
      },
      {
        label: "Attendance Corrections",
        to: "/attendance/corrections",
        icon: FileClock,
        roles: ["hr", "main_admin", "developer_admin"],
      },
    ],
  },
  {
    label: "Work",
    items: [{ label: "Tasks & Daily Logs", to: "/tasks", icon: ListTodo, roles: ALL }],
  },
  {
    label: "Leave",
    items: [
      {
        label: "Apply Leave",
        to: "/leave/apply",
        icon: PlaneTakeoff,
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"],
      },
      {
        label: "Leave History",
        to: "/leave/history",
        icon: History,
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"],
      },
      {
        label: "Leave Approvals",
        to: "/leave/approvals",
        icon: BadgeCheck,
        roles: [],
        requiresReportingManager: true,
      },
      {
        label: "Leave Tracking",
        to: "/leave/reports",
        icon: FileText,
        roles: ["hr", "ceo", "main_admin"],
      },
      {
        label: "Leave Types",
        to: "/leave/policy",
        icon: Settings,
        roles: ["hr", "developer_admin", "main_admin"],
      },
    ],
  },
  {
    label: "Company",
    items: [
      {
        label: "Branches",
        to: "/branches",
        icon: Building2,
        roles: ["developer_admin", "main_admin", "hr"],
      },
      {
        label: "Biometric Devices",
        to: "/devices",
        icon: Fingerprint,
        roles: ["developer_admin", "main_admin", "hr"],
      },
      {
        label: "Holidays",
        to: "/holidays",
        icon: CalendarCheck,
        roles: ["hr", "main_admin", "developer_admin"],
      },
      {
        label: "Asset Management",
        to: "/assets",
        icon: Package,
        roles: ["hr", "developer_admin"],
      },
    ],
  },
  {
    label: "Me",
    items: [
      { label: "My Profile", to: "/profile", icon: UserCog, roles: ALL },
      {
        label: "ID Card",
        to: "/id-card",
        icon: IdCard,
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"],
      },
      { label: "Notifications", to: "/notifications", icon: BellRing, roles: ALL },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "System Settings",
        to: "/settings",
        icon: Settings,
        roles: ["developer_admin", "main_admin"],
      },
      {
        label: "Audit Logs",
        to: "/audit",
        icon: ScrollText,
        roles: ["developer_admin", "main_admin"],
      },
    ],
  },
];

export function menuForRole(role: Role, options?: { isReportingManager?: boolean }): MenuGroup[] {
  return menuGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => {
        if (i.requiresReportingManager) {
          return options?.isReportingManager === true;
        }
        return i.roles.includes(role);
      }),
    }))
    .filter((g) => g.items.length > 0);
}
