import type { ModuleKey, Role } from "@/types/domain";
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
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
  Package,
  ListTodo,
  FileClock,
  Megaphone,
  HandCoins,
  ScanFace,
  ListChecks,
} from "lucide-react";
import type { ComponentType } from "react";

export interface MenuItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
  requiresReportingManager?: boolean;
  allowReportingManager?: boolean;
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
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: ALL },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Employees",
        to: "/employees",
        icon: Users,
        roles: ["developer_admin", "main_admin", "ceo", "hr", "manager"],
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
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff", "ceo"],
      },
      {
        label: "Day Logs",
        to: "/attendance/locations",
        icon: MapPin,
        roles: ["manager", "hr", "main_admin", "ceo", "developer_admin"],
      },
      {
        label: "Field Attendance",
        to: "/attendance/field",
        icon: MapPin,
        roles: ["manager", "hr", "main_admin", "ceo", "developer_admin"],
      },
      {
        label: "Branch Attendance",
        to: "/attendance/branch",
        icon: Building2,
        roles: ["manager", "hr", "main_admin", "ceo", "developer_admin"],
      },
      {
        label: "Attendance Corrections",
        to: "/attendance/corrections",
        icon: FileClock,
        roles: ["hr", "main_admin", "developer_admin"],
        allowReportingManager: true,
      },
    ],
  },
  {
    label: "Work",
    items: [
      { label: "Work Planner", to: "/tasks", icon: ListTodo, roles: ALL },
      {
        label: "Employee Requests",
        to: "/employee-services",
        icon: HandCoins,
        roles: [
          "developer_admin",
          "ceo",
          "hr",
          "manager",
          "employee",
          "sales",
          "driver",
          "field_staff",
        ],
      },
      {
        label: "Checklists",
        to: "/checklists",
        icon: ListChecks,
        roles: ["developer_admin", "hr"],
      },
    ],
  },
  {
    label: "Leave",
    items: [
      {
        label: "Apply Leave",
        to: "/leave/apply",
        icon: PlaneTakeoff,
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff", "ceo"],
      },
      {
        label: "Leave History",
        to: "/leave/history",
        icon: History,
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff", "ceo"],
      },
      {
        label: "My Leave Balance",
        to: "/leave/balance",
        icon: CalendarCheck,
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff", "ceo"],
      },
      {
        label: "Leave Approvals",
        to: "/leave/approvals",
        icon: BadgeCheck,
        roles: ["manager"],
        requiresReportingManager: true,
      },
      {
        label: "Leave Tracking",
        to: "/leave/reports",
        icon: FileText,
        roles: ["hr", "ceo", "main_admin", "developer_admin"],
      },
      {
        label: "Leave Policies",
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
        roles: ["hr", "developer_admin", "ceo"],
      },
    ],
  },
  {
    label: "Me",
    items: [
      { label: "Announcements", to: "/announcements", icon: Megaphone, roles: ALL },
      { label: "Notifications", to: "/notifications", icon: BellRing, roles: ALL },
      { label: "My Assets", to: "/my-assets", icon: Package, roles: ALL },
      { label: "My Profile", to: "/profile", icon: UserCog, roles: ALL },
      {
        label: "ID Card",
        to: "/id-card",
        icon: IdCard,
        roles: ["employee", "manager", "hr", "sales", "driver", "field_staff"],
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Face Security",
        to: "/face-security",
        icon: ScanFace,
        roles: ["developer_admin"],
      },
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

export function menuForRole(
  role: Role,
  options?: { isReportingManager?: boolean; allowedModules?: ModuleKey[] },
): MenuGroup[] {
  const groupOrder = groupOrderForRole(role);
  const itemOrder = itemOrderForRole(role);
  return menuGroups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => {
          const roleAllowed = i.requiresReportingManager
            ? options?.isReportingManager === true
            : i.roles.includes(role) || (i.allowReportingManager && options?.isReportingManager);
          const module = moduleForRoute(i.to);
          const moduleAllowed = !options?.allowedModules || options.allowedModules.includes(module);
          return roleAllowed && moduleAllowed;
        })
        .map((item) => {
          if (role !== "ceo") return item;
          const executiveLabels: Record<string, string> = {
            "/employees": "Workforce",
            "/attendance/locations": "Attendance Overview",
            "/tasks": "Work Planner",
            "/leave/reports": "Leave Overview",
            "/assets": "Asset Management",
          };
          return { ...item, label: executiveLabels[item.to] ?? item.label };
        })
        .sort((a, b) => {
          const aIndex = itemOrder.indexOf(a.to);
          const bIndex = itemOrder.indexOf(b.to);
          return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        }),
    }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => {
      const aIndex = groupOrder.indexOf(a.label);
      const bIndex = groupOrder.indexOf(b.label);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
}

/** Sidebar section order for each login role — daily work first. */
function groupOrderForRole(role: Role): string[] {
  switch (role) {
    case "employee":
    case "sales":
    case "driver":
    case "field_staff":
      return ["Overview", "Attendance", "Leave", "Work", "Me", "Company", "People", "System"];
    case "manager":
      return ["Overview", "Attendance", "Leave", "Work", "People", "Me", "Company", "System"];
    case "hr":
      return ["Overview", "People", "Leave", "Attendance", "Work", "Company", "Me", "System"];
    case "ceo":
      return ["Overview", "People", "Attendance", "Leave", "Work", "Company", "Me", "System"];
    case "main_admin":
      return ["Overview", "People", "Attendance", "Leave", "Company", "System", "Work", "Me"];
    case "developer_admin":
      return ["Overview", "People", "System", "Company", "Attendance", "Leave", "Work", "Me"];
    default:
      return ["Overview", "Attendance", "Leave", "Work", "People", "Company", "Me", "System"];
  }
}

/** Item order within sections for each login role — matches everyday shortcuts. */
function itemOrderForRole(role: Role): string[] {
  switch (role) {
    case "employee":
    case "sales":
    case "driver":
    case "field_staff":
      return [
        "/dashboard",
        "/attendance/mine",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/tasks",
        "/employee-services",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/id-card",
      ];
    case "manager":
      return [
        "/dashboard",
        "/attendance/mine",
        "/attendance/locations",
        "/attendance/field",
        "/attendance/branch",
        "/attendance/corrections",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/leave/approvals",
        "/tasks",
        "/employee-services",
        "/employees",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/id-card",
      ];
    case "hr":
      return [
        "/dashboard",
        "/employees",
        "/checklists",
        "/leave/reports",
        "/leave/policy",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/attendance/mine",
        "/attendance/locations",
        "/attendance/field",
        "/attendance/branch",
        "/attendance/corrections",
        "/tasks",
        "/employee-services",
        "/branches",
        "/devices",
        "/holidays",
        "/assets",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/id-card",
      ];
    case "ceo":
      return [
        "/dashboard",
        "/employees",
        "/attendance/mine",
        "/attendance/locations",
        "/attendance/field",
        "/attendance/branch",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/leave/reports",
        "/tasks",
        "/employee-services",
        "/assets",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
      ];
    case "main_admin":
      return [
        "/dashboard",
        "/employees",
        "/attendance/locations",
        "/attendance/field",
        "/attendance/branch",
        "/attendance/corrections",
        "/leave/approvals",
        "/leave/reports",
        "/leave/policy",
        "/branches",
        "/devices",
        "/holidays",
        "/settings",
        "/audit",
        "/tasks",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
      ];
    case "developer_admin":
      return [
        "/dashboard",
        "/users",
        "/employees",
        "/departments",
        "/checklists",
        "/face-security",
        "/settings",
        "/audit",
        "/branches",
        "/devices",
        "/holidays",
        "/assets",
        "/attendance/locations",
        "/attendance/field",
        "/attendance/branch",
        "/attendance/corrections",
        "/leave/approvals",
        "/leave/policy",
        "/tasks",
        "/employee-services",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
      ];
    default:
      return [];
  }
}

export function moduleForRoute(path: string): ModuleKey {
  if (path === "/dashboard") return "DASHBOARD";
  if (
    ["/employees", "/users", "/departments", "/checklists"].some(
      (entry) => path === entry || path.startsWith(`${entry}/`),
    )
  )
    return "PEOPLE";
  if (path.startsWith("/attendance") || path === "/devices") return "ATTENDANCE";
  if (path === "/tasks" || path.startsWith("/tasks/")) return "TASKS";
  if (path === "/employee-services") return "EMPLOYEE_REQUESTS";
  if (path.startsWith("/leave")) return "LEAVE";
  if (["/branches", "/holidays", "/assets"].includes(path)) return "COMPANY";
  if (["/profile", "/id-card", "/my-assets"].includes(path)) return "PROFILE";
  if (["/notifications", "/announcements"].includes(path)) return "COMMUNICATIONS";
  return "SYSTEM";
}
