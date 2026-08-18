import type { ComponentType } from "react";
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
  UserPlus,
  ClipboardPen,
  ArrowLeftRight,
  Target,
  DoorOpen,
  GraduationCap,
  Languages,
} from "lucide-react";

export interface MenuItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
  requiresReportingManager?: boolean;
  allowReportingManager?: boolean;
  /** Hide unless the signed-in user has an employee profile (can punch / own attendance). */
  requiresEmployeeId?: boolean;
  /** Hide personal attendance / leave items when this account is excused from time tracking. */
  requiresAttendance?: boolean;
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const ALL: Role[] = [
  "developer_admin",
  "main_admin",
  "ceo",
  "chief_of_staff",
  "hr",
  "manager",
  "employee",
  "sales",
  "driver",
  "field_staff",
];

/** Drivers only need attendance + profile; birthdays show on the dashboard. */
const DRIVER_ROUTES = new Set(["/dashboard", "/attendance/mine", "/profile", "/preferences"]);

/** HR / admin / CEO — run hire-to-exit operations. */
const PEOPLE_OPS: Role[] = ["developer_admin", "main_admin", "ceo", "hr"];
/** People ops plus managers / CoS who approve team changes and see joining. */
const PEOPLE_LEADERS: Role[] = [...PEOPLE_OPS, "manager", "chief_of_staff"];

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
        roles: ["developer_admin", "main_admin", "ceo", "hr", "manager", "chief_of_staff"],
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
    label: "Hire",
    items: [
      {
        label: "Talent Acquisition",
        to: "/talent",
        icon: UserPlus,
        roles: ["developer_admin", "main_admin", "ceo", "hr", "manager", "chief_of_staff"],
      },
      {
        label: "Onboarding",
        to: "/onboarding",
        icon: ClipboardPen,
        roles: ALL.filter((r) => r !== "driver"),
      },
    ],
  },
  {
    label: "Career",
    items: [
      {
        label: "People Changes",
        to: "/people-changes",
        icon: ArrowLeftRight,
        roles: PEOPLE_LEADERS,
      },
      {
        label: "Performance",
        to: "/performance",
        icon: Target,
        roles: ALL.filter((r) => r !== "driver"),
      },
      {
        label: "Offboarding",
        to: "/offboarding",
        icon: DoorOpen,
        roles: ["developer_admin", "main_admin", "ceo", "hr"],
      },
      {
        label: "Learning",
        to: "/lms",
        icon: GraduationCap,
        roles: ALL.filter((r) => r !== "driver"),
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
        // Punch-capable roles only — CEO does not mark attendance.
        roles: ["employee", "manager", "chief_of_staff", "hr", "sales", "driver", "field_staff", "main_admin"],
        requiresEmployeeId: true,
        requiresAttendance: true,
      },
      {
        label: "Daily Logs",
        to: "/attendance/locations",
        icon: MapPin,
        // Org-wide for HR/admin/CEO; team heads (any role) via allowReportingManager.
        roles: ["manager", "chief_of_staff", "hr", "main_admin", "ceo", "developer_admin"],
        allowReportingManager: true,
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
      { label: "Work Planner", to: "/tasks", icon: ListTodo, roles: ALL.filter((r) => r !== "driver") },
      {
        label: "Employee Requests",
        to: "/employee-services",
        icon: HandCoins,
        roles: [
          "developer_admin",
          "ceo",
          "hr",
          "manager", "chief_of_staff",
          "employee",
          "sales",
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
        roles: ["employee", "manager", "chief_of_staff", "hr", "sales", "field_staff", "main_admin"],
        requiresAttendance: true,
      },
      {
        label: "Leave History",
        to: "/leave/history",
        icon: History,
        roles: ["employee", "manager", "chief_of_staff", "hr", "sales", "field_staff", "main_admin"],
        requiresAttendance: true,
      },
      {
        label: "My Leave Balance",
        to: "/leave/balance",
        icon: CalendarCheck,
        roles: ["employee", "manager", "chief_of_staff", "hr", "sales", "field_staff", "main_admin"],
        requiresAttendance: true,
      },
      {
        label: "Leave Approvals",
        to: "/leave/approvals",
        icon: BadgeCheck,
        // HR/CEO/Admin always; department heads via allowReportingManager.
        roles: ["hr", "ceo", "main_admin", "developer_admin"],
        allowReportingManager: true,
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
      {
        label: "Holidays",
        to: "/holidays",
        icon: CalendarCheck,
        roles: ALL.filter((r) => r !== "driver"),
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
        label: "Asset Management",
        to: "/assets",
        icon: Package,
        roles: ["hr", "developer_admin", "ceo", "main_admin"],
      },
    ],
  },
  {
    label: "Me",
    items: [
      { label: "Announcements", to: "/announcements", icon: Megaphone, roles: ALL.filter((r) => r !== "driver") },
      { label: "Notifications", to: "/notifications", icon: BellRing, roles: ALL.filter((r) => r !== "driver") },
      { label: "My Assets", to: "/my-assets", icon: Package, roles: ALL.filter((r) => r !== "driver") },
      { label: "My Profile", to: "/profile", icon: UserCog, roles: ALL },
      {
        label: "Preferences",
        to: "/preferences",
        icon: Languages,
        roles: ALL,
      },
      {
        label: "ID Card",
        to: "/id-card",
        icon: IdCard,
        roles: ["employee", "manager", "chief_of_staff", "hr", "sales", "field_staff"],
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
  options?: {
    isReportingManager?: boolean;
    allowedModules?: ModuleKey[];
    hasEmployeeId?: boolean;
    attendanceRequired?: boolean;
  },
): MenuGroup[] {
  const groupOrder = groupOrderForRole(role);
  const itemOrder = itemOrderForRole(role);
  const attendanceOn = options?.attendanceRequired !== false;
  return menuGroups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => {
          // Developer Admin has full product visibility (all screens, all modules).
          if (role === "developer_admin") {
            if (i.requiresEmployeeId && !options?.hasEmployeeId) return false;
            if (i.requiresAttendance && !attendanceOn) return false;
            return true;
          }
          if (role === "driver") {
            if (!DRIVER_ROUTES.has(i.to)) return false;
            if (i.requiresEmployeeId && !options?.hasEmployeeId) return false;
            if (i.requiresAttendance && !attendanceOn) return false;
            return true;
          }
          if (i.requiresEmployeeId && !options?.hasEmployeeId) return false;
          if (i.requiresAttendance && !attendanceOn) return false;
          const roleOk = i.roles.includes(role);
          const reportingOk =
            i.requiresReportingManager || i.allowReportingManager
              ? options?.isReportingManager === true
              : false;
          const roleAllowed = i.requiresReportingManager
            ? roleOk && reportingOk
            : roleOk || (i.allowReportingManager && reportingOk);
          const module = moduleForRoute(i.to);
          const moduleAllowed = !options?.allowedModules || options.allowedModules.includes(module);
          return roleAllowed && moduleAllowed;
        })
        .map((item) => {
          if (role !== "ceo") return item;
          const executiveLabels: Record<string, string> = {
            "/employees": "Workforce",
            "/attendance/locations": "Daily Logs",
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
    case "driver":
      return ["Overview", "Attendance", "Me"];
    case "employee":
    case "sales":
    case "field_staff":
      return [
        "Overview",
        "Attendance",
        "Leave",
        "Work",
        "Hire",
        "Career",
        "Me",
        "Company",
        "People",
        "System",
      ];
    case "manager":
      return [
        "Overview",
        "Attendance",
        "Leave",
        "Work",
        "Hire",
        "Career",
        "People",
        "Me",
        "Company",
        "System",
      ];
    case "hr":
      return [
        "Overview",
        "People",
        "Hire",
        "Career",
        "Leave",
        "Attendance",
        "Work",
        "Company",
        "Me",
        "System",
      ];
    case "ceo":
      return [
        "Overview",
        "People",
        "Hire",
        "Career",
        "Attendance",
        "Leave",
        "Work",
        "Company",
        "Me",
        "System",
      ];
    case "chief_of_staff":
      return [
        "Overview",
        "People",
        "Hire",
        "Career",
        "Attendance",
        "Leave",
        "Work",
        "Company",
        "Me",
        "System",
      ];
    case "main_admin":
      return [
        "Overview",
        "People",
        "Hire",
        "Career",
        "Attendance",
        "Leave",
        "Company",
        "System",
        "Work",
        "Me",
      ];
    case "developer_admin":
      return [
        "Overview",
        "People",
        "Hire",
        "Career",
        "Attendance",
        "Leave",
        "Work",
        "Company",
        "System",
        "Me",
      ];
    default:
      return [
        "Overview",
        "Attendance",
        "Leave",
        "Work",
        "Hire",
        "Career",
        "People",
        "Company",
        "Me",
        "System",
      ];
  }
}

/** Item order within sections for each login role — matches everyday shortcuts. */
function itemOrderForRole(role: Role): string[] {
  switch (role) {
    case "driver":
      return ["/dashboard", "/attendance/mine", "/profile", "/preferences"];
    case "employee":
    case "sales":
    case "field_staff":
      return [
        "/dashboard",
        "/attendance/mine",
        "/attendance/locations",
        "/attendance/corrections",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/leave/approvals",
        "/holidays",
        "/tasks",
        "/employee-services",
        "/onboarding",
        "/performance",
        "/lms",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/preferences",
        "/id-card",
      ];
    case "manager":
      return [
        "/dashboard",
        "/attendance/mine",
        "/attendance/locations",
        "/attendance/corrections",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/leave/approvals",
        "/holidays",
        "/tasks",
        "/employee-services",
        "/talent",
        "/onboarding",
        "/people-changes",
        "/performance",
        "/lms",
        "/employees",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/preferences",
        "/id-card",
      ];
    case "hr":
      return [
        "/dashboard",
        "/employees",
        "/talent",
        "/onboarding",
        "/people-changes",
        "/performance",
        "/offboarding",
        "/lms",
        "/checklists",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/leave/approvals",
        "/leave/reports",
        "/leave/policy",
        "/holidays",
        "/attendance/mine",
        "/attendance/locations",
        "/attendance/corrections",
        "/tasks",
        "/employee-services",
        "/branches",
        "/devices",
        "/assets",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/preferences",
        "/id-card",
      ];
    case "ceo":
      return [
        "/dashboard",
        "/employees",
        "/talent",
        "/onboarding",
        "/people-changes",
        "/performance",
        "/offboarding",
        "/lms",
        "/attendance/locations",
        "/leave/approvals",
        "/leave/reports",
        "/holidays",
        "/tasks",
        "/employee-services",
        "/assets",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/preferences",
      ];
    case "chief_of_staff":
      return [
        "/dashboard",
        "/employees",
        "/talent",
        "/onboarding",
        "/people-changes",
        "/performance",
        "/offboarding",
        "/lms",
        "/attendance/locations",
        "/leave/approvals",
        "/leave/reports",
        "/holidays",
        "/tasks",
        "/employee-services",
        "/assets",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/preferences",
      ];
    case "main_admin":
      return [
        "/dashboard",
        "/employees",
        "/talent",
        "/onboarding",
        "/people-changes",
        "/performance",
        "/offboarding",
        "/lms",
        "/attendance/mine",
        "/attendance/locations",
        "/attendance/corrections",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/leave/approvals",
        "/leave/reports",
        "/leave/policy",
        "/holidays",
        "/branches",
        "/devices",
        "/settings",
        "/audit",
        "/tasks",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/preferences",
      ];
    case "developer_admin":
      return [
        "/dashboard",
        "/users",
        "/employees",
        "/departments",
        "/talent",
        "/onboarding",
        "/people-changes",
        "/performance",
        "/offboarding",
        "/lms",
        "/attendance/mine",
        "/attendance/locations",
        "/attendance/corrections",
        "/leave/apply",
        "/leave/history",
        "/leave/balance",
        "/leave/approvals",
        "/leave/reports",
        "/leave/policy",
        "/holidays",
        "/checklists",
        "/face-security",
        "/settings",
        "/audit",
        "/branches",
        "/devices",
        "/assets",
        "/tasks",
        "/employee-services",
        "/announcements",
        "/notifications",
        "/my-assets",
        "/profile",
        "/preferences",
        "/id-card",
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
  if (path === "/talent" || path.startsWith("/talent/")) return "TALENT";
  if (
    ["/onboarding", "/people-changes", "/offboarding"].some(
      (entry) => path === entry || path.startsWith(`${entry}/`),
    )
  )
    return "LIFECYCLE";
  if (path === "/performance" || path.startsWith("/performance/")) return "PERFORMANCE";
  if (path === "/lms" || path.startsWith("/lms/")) return "LMS";
  if (path === "/attendance" || path.startsWith("/attendance/") || path === "/devices")
    return "ATTENDANCE";
  if (path === "/tasks" || path.startsWith("/tasks/")) return "TASKS";
  if (path === "/employee-services") return "EMPLOYEE_REQUESTS";
  if (path.startsWith("/leave") || path === "/holidays") return "LEAVE";
  if (["/branches", "/assets"].includes(path)) return "COMPANY";
  if (["/profile", "/id-card", "/my-assets", "/preferences"].includes(path)) return "PROFILE";
  if (["/notifications", "/announcements"].includes(path)) return "COMMUNICATIONS";
  return "SYSTEM";
}
