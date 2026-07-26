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
  BarChart3,
  CalendarRange,
  ListChecks,
  FolderOpen,
  Star,
  BookOpen,
  UserPlus,
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
      {
        label: "Operations Reports",
        to: "/reports",
        icon: BarChart3,
        roles: ["developer_admin", "main_admin", "ceo", "hr", "manager"],
      },
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
        label: "Shift Roster",
        to: "/roster",
        icon: CalendarRange,
        roles: ALL,
      },
      {
        label: "Checklists",
        to: "/checklists",
        icon: ListChecks,
        roles: ALL,
      },
      {
        label: "Appraisals",
        to: "/appraisals",
        icon: Star,
        roles: ["developer_admin", "main_admin", "hr", "manager", "ceo"],
      },
      {
        label: "Recruitment",
        to: "/recruitment",
        icon: UserPlus,
        roles: ["developer_admin", "main_admin", "hr"],
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
        roles: ["hr", "developer_admin", "main_admin"],
        requiresReportingManager: true,
      },
      {
        label: "Leave Tracking",
        to: "/leave/reports",
        icon: FileText,
        roles: ["developer_admin", "hr", "ceo", "main_admin"],
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
      {
        label: "Document Vault",
        to: "/documents",
        icon: FolderOpen,
        roles: ALL,
      },
      {
        label: "SOP Library",
        to: "/sop",
        icon: BookOpen,
        roles: ALL,
      },
    ],
  },
  {
    label: "Me",
    items: [
      { label: "Announcements", to: "/announcements", icon: Megaphone, roles: ALL },
      { label: "Notifications", to: "/notifications", icon: BellRing, roles: ALL },
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
  return menuGroups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => {
          const roleAllowed = i.requiresReportingManager
            ? options?.isReportingManager === true || i.roles.includes(role)
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
        }),
    }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => {
      const aIndex = groupOrder.indexOf(a.label);
      const bIndex = groupOrder.indexOf(b.label);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
}

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
      return ["Overview", "People", "Leave", "Attendance", "Company", "Work", "Me", "System"];
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

export function moduleForRoute(path: string): ModuleKey {
  if (path === "/dashboard" || path.startsWith("/reports")) return "DASHBOARD";
  if (
    ["/employees", "/users", "/departments", "/checklists", "/appraisals", "/recruitment"].some(
      (entry) => path === entry || path.startsWith(`${entry}/`),
    )
  )
    return "PEOPLE";
  if (path.startsWith("/attendance") || path === "/devices" || path.startsWith("/roster"))
    return "ATTENDANCE";
  if (path === "/tasks" || path.startsWith("/tasks/")) return "TASKS";
  if (path === "/employee-services") return "EMPLOYEE_REQUESTS";
  if (path.startsWith("/leave")) return "LEAVE";
  if (["/branches", "/holidays", "/assets", "/documents"].includes(path)) return "COMPANY";
  if (["/profile", "/id-card"].includes(path)) return "PROFILE";
  if (["/notifications", "/announcements", "/sop"].includes(path)) return "COMMUNICATIONS";
  return "SYSTEM";
}
