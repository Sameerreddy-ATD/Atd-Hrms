import type { Role } from "@/types/domain";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BellRing,
  Building2,
  CalendarCheck,
  FileClock,
  FileText,
  HandCoins,
  IdCard,
  ListTodo,
  MapPin,
  Megaphone,
  PlaneTakeoff,
  ScanFace,
  ScrollText,
  Settings,
  UserCog,
  Users,
} from "lucide-react";

export interface RoleShortcut {
  label: string;
  to: string;
  description: string;
  icon: LucideIcon;
}

/** Primary actions each role needs after sign-in, ordered for everyday use. */
export function shortcutsForRole(
  role: Role,
  options?: { isReportingManager?: boolean },
): RoleShortcut[] {
  const attendance: RoleShortcut = {
    label: "Mark attendance",
    to: "/dashboard",
    description: "Check in or out for today",
    icon: CalendarCheck,
  };
  const myAttendance: RoleShortcut = {
    label: "My attendance",
    to: "/attendance/mine",
    description: "History and missed punches",
    icon: CalendarCheck,
  };
  const applyLeave: RoleShortcut = {
    label: "Apply leave",
    to: "/leave/apply",
    description: "Request leave or weekly off",
    icon: PlaneTakeoff,
  };
  const announcements: RoleShortcut = {
    label: "Announcements",
    to: "/announcements",
    description: "Company updates",
    icon: Megaphone,
  };
  const notifications: RoleShortcut = {
    label: "Notifications",
    to: "/notifications",
    description: "Alerts and reminders",
    icon: BellRing,
  };
  const profile: RoleShortcut = {
    label: "My profile",
    to: "/profile",
    description: "Personal details",
    icon: UserCog,
  };
  const idCard: RoleShortcut = {
    label: "ID card",
    to: "/id-card",
    description: "Digital employee ID",
    icon: IdCard,
  };
  const tasks: RoleShortcut = {
    label: "Work planner",
    to: "/tasks",
    description: "Boards and assignments",
    icon: ListTodo,
  };
  const requests: RoleShortcut = {
    label: "Requests",
    to: "/employee-services",
    description: "Expenses and certificates",
    icon: HandCoins,
  };

  switch (role) {
    case "driver":
      return [attendance, myAttendance, profile];
    case "employee":
    case "sales":
    case "field_staff":
      return [
        attendance,
        myAttendance,
        ...(options?.isReportingManager
          ? [
              {
                label: "Team daily logs",
                to: "/attendance/locations",
                description: "Track your team's attendance",
                icon: MapPin,
              } satisfies RoleShortcut,
              {
                label: "Leave approvals",
                to: "/leave/approvals",
                description: "Approve unit leave",
                icon: BadgeCheck,
              } satisfies RoleShortcut,
            ]
          : []),
        applyLeave,
        announcements,
        tasks,
        requests,
        idCard,
        notifications,
      ];
    case "manager":
      return [
        attendance,
        myAttendance,
        {
          label: "Team daily logs",
          to: "/attendance/locations",
          description: "Track your team's attendance",
          icon: MapPin,
        },
        ...(options?.isReportingManager
          ? [
              {
                label: "Leave approvals",
                to: "/leave/approvals",
                description: "Approve team leave",
                icon: BadgeCheck,
              } satisfies RoleShortcut,
            ]
          : []),
        applyLeave,
        tasks,
        announcements,
        requests,
        profile,
      ];
    case "hr":
      return [
        {
          label: "Employees",
          to: "/employees",
          description: "People directory",
          icon: Users,
        },
        {
          label: "Daily Logs",
          to: "/attendance/locations",
          description: "Track team attendance by day",
          icon: MapPin,
        },
        {
          label: "Leave tracking",
          to: "/leave/reports",
          description: "Organization leave status",
          icon: FileText,
        },
        ...(options?.isReportingManager
          ? [
              {
                label: "Leave approvals",
                to: "/leave/approvals",
                description: "Approve unit leave",
                icon: BadgeCheck,
              } satisfies RoleShortcut,
            ]
          : []),
        {
          label: "Corrections",
          to: "/attendance/corrections",
          description: "Missed punch reviews",
          icon: FileClock,
        },
        announcements,
        {
          label: "Holidays",
          to: "/holidays",
          description: "Company holiday calendar",
          icon: CalendarCheck,
        },
        requests,
        tasks,
        profile,
      ];
    case "ceo":
      return [
        {
          label: "Workforce",
          to: "/employees",
          description: "Company headcount",
          icon: Users,
        },
        {
          label: "Attendance overview",
          to: "/attendance/locations",
          description: "Daily Logs and movement",
          icon: MapPin,
        },
        {
          label: "Leave overview",
          to: "/leave/reports",
          description: "Leave status company-wide",
          icon: FileText,
        },
        tasks,
        {
          label: "Leave approvals",
          to: "/leave/approvals",
          description: "Approve unit leave",
          icon: BadgeCheck,
        },
        announcements,
        notifications,
      ];
    case "chief_of_staff":
      return [
        {
          label: "Workforce",
          to: "/employees",
          description: "Company headcount",
          icon: Users,
        },
        {
          label: "Attendance overview",
          to: "/attendance/locations",
          description: "Daily Logs and movement",
          icon: MapPin,
        },
        {
          label: "Leave overview",
          to: "/leave/reports",
          description: "Leave status company-wide",
          icon: FileText,
        },
        {
          label: "Leave approvals",
          to: "/leave/approvals",
          description: "Approve unit leave",
          icon: BadgeCheck,
        },
        tasks,
        announcements,
        notifications,
      ];
    case "main_admin":
      return [
        {
          label: "Employees",
          to: "/employees",
          description: "People directory",
          icon: Users,
        },
        {
          label: "Daily Logs",
          to: "/attendance/locations",
          description: "Attendance operations",
          icon: MapPin,
        },
        {
          label: "Leave tracking",
          to: "/leave/reports",
          description: "Leave status",
          icon: FileText,
        },
        ...(options?.isReportingManager
          ? [
              {
                label: "Leave approvals",
                to: "/leave/approvals",
                description: "Approve unit leave",
                icon: BadgeCheck,
              } satisfies RoleShortcut,
            ]
          : []),
        {
          label: "Branches",
          to: "/branches",
          description: "Locations and geofences",
          icon: Building2,
        },
        {
          label: "System settings",
          to: "/settings",
          description: "Health and inventory",
          icon: Settings,
        },
        announcements,
        {
          label: "Audit logs",
          to: "/audit",
          description: "Security and change history",
          icon: ScrollText,
        },
      ];
    case "developer_admin":
      return [
        {
          label: "User logins",
          to: "/users",
          description: "Create and manage accounts",
          icon: UserCog,
        },
        {
          label: "Daily Logs",
          to: "/attendance/locations",
          description: "Track team attendance by day",
          icon: MapPin,
        },
        {
          label: "Leave tracking",
          to: "/leave/reports",
          description: "All leave requests and status",
          icon: FileText,
        },
        {
          label: "Face security",
          to: "/face-security",
          description: "Approve face enrollments",
          icon: ScanFace,
        },
        {
          label: "System settings",
          to: "/settings",
          description: "Modules, API, reset",
          icon: Settings,
        },
        {
          label: "Employees",
          to: "/employees",
          description: "People directory",
          icon: Users,
        },
        announcements,
        {
          label: "Audit logs",
          to: "/audit",
          description: "Full change history",
          icon: ScrollText,
        },
      ];
    default:
      return [announcements, notifications, profile];
  }
}
