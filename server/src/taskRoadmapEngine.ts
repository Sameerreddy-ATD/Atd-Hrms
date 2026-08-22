import { TaskIssueType, type PrismaClient } from "@prisma/client";
import { computeEpicProgressBatch, type EpicProgress } from "./taskEpicProgress.js";
import { componentDto, componentsFromTaskLinks } from "./taskComponentEngine.js";
import { sprintSummaryForTask } from "./taskSprintEngine.js";

type Db = PrismaClient;

const epicInclude = {
  assignments: {
    include: {
      employee: {
        select: {
          employeeId: true,
          name: true,
          employeeCode: true,
          designation: true,
          department: { select: { name: true } },
        },
      },
    },
  },
  workflowStatus: {
    select: {
      statusId: true,
      name: true,
      category: true,
      color: true,
    },
  },
  componentLinks: {
    include: {
      component: {
        include: {
          leadEmployee: {
            select: {
              employeeId: true,
              name: true,
              employeeCode: true,
              designation: true,
            },
          },
        },
      },
    },
  },
} as const;

export type RoadmapEpicDto = {
  id: string;
  issueKey?: string;
  title: string;
  description?: string;
  startDate?: string;
  targetDate?: string;
  scheduled: boolean;
  workflowStatus?: {
    id: string;
    name: string;
    category: string;
    color: string;
  };
  assignees: Array<{
    id: string;
    name: string;
    employeeCode: string;
    designation?: string;
    department?: string;
  }>;
  components: ReturnType<typeof componentDto>[];
  progress: EpicProgress;
  archivedAt?: string;
};

export async function buildProjectRoadmap(db: Db, boardId: string, includeArchived = false) {
  const epics = await db.workTask.findMany({
    where: {
      boardId,
      issueType: TaskIssueType.EPIC,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    include: epicInclude,
    orderBy: [{ startDate: "asc" }, { dueDate: "asc" }, { issueNumber: "asc" }],
  });

  const progressMap = await computeEpicProgressBatch(
    db,
    epics.map((epic) => epic.taskId),
  );

  const items: RoadmapEpicDto[] = epics.map((epic) => {
    const startDate = epic.startDate?.toISOString().slice(0, 10);
    const targetDate = epic.dueDate?.toISOString().slice(0, 10);
    const scheduled = Boolean(startDate || targetDate);
    return {
      id: epic.taskId,
      issueKey: epic.issueKey ?? undefined,
      title: epic.title,
      description: epic.description ?? undefined,
      startDate,
      targetDate,
      scheduled,
      workflowStatus: epic.workflowStatus
        ? {
            id: epic.workflowStatus.statusId,
            name: epic.workflowStatus.name,
            category: epic.workflowStatus.category,
            color: epic.workflowStatus.color,
          }
        : undefined,
      assignees: epic.assignments.map(({ employee }) => ({
        id: employee.employeeId,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation ?? undefined,
        department: employee.department?.name,
      })),
      components: componentsFromTaskLinks(epic.componentLinks),
      progress: progressMap.get(epic.taskId) ?? {
        progressPercent: 0,
        doneCount: 0,
        totalCount: 0,
      },
      archivedAt: epic.archivedAt?.toISOString(),
    };
  });

  const scheduled = items.filter((item) => item.scheduled && !item.archivedAt);
  const unscheduled = items.filter((item) => !item.scheduled && !item.archivedAt);

  return { scheduled, unscheduled, all: items };
}

export async function listEpicChildren(db: Db, epicTaskId: string) {
  const children = await db.workTask.findMany({
    where: { parentTaskId: epicTaskId, archivedAt: null },
    include: {
      assignments: {
        include: {
          employee: {
            select: {
              employeeId: true,
              name: true,
              employeeCode: true,
              designation: true,
              department: { select: { name: true } },
            },
          },
        },
      },
      workflowStatus: {
        select: { statusId: true, name: true, category: true, color: true },
      },
      componentLinks: {
        include: {
          component: {
            include: {
              leadEmployee: {
                select: {
                  employeeId: true,
                  name: true,
                  employeeCode: true,
                  designation: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ rank: "asc" }, { issueNumber: "asc" }],
  });

  return Promise.all(
    children.map(async (child) => ({
      id: child.taskId,
      issueKey: child.issueKey ?? undefined,
      issueType: child.issueType,
      title: child.title,
      status: child.status,
      workflowStatus: child.workflowStatus
        ? {
            id: child.workflowStatus.statusId,
            name: child.workflowStatus.name,
            category: child.workflowStatus.category,
            color: child.workflowStatus.color,
          }
        : undefined,
      assignees: child.assignments.map(({ employee }) => ({
        id: employee.employeeId,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation ?? undefined,
        department: employee.department?.name,
      })),
      dueDate: child.dueDate?.toISOString().slice(0, 10),
      components: componentsFromTaskLinks(child.componentLinks),
      sprint: await sprintSummaryForTask(db, child.taskId),
    })),
  );
}
