import { prisma } from "./prisma.js";
import { LEAVE_CODES } from "./leavePolicy.js";
import { publishNotificationChange } from "./notificationLive.js";
import { sendPushToUsers } from "./push.js";

/** Idempotent medical certificate reminders at 24h and 2h before deadline, plus overdue. */
export async function processMedicalCertificateReminders(now = new Date()) {
  const sickLeaves = await prisma.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "MANAGER_APPROVED", "HR_VERIFIED"] },
      medicalDocumentDueAt: { not: null },
      leaveType: { code: LEAVE_CODES.SICK },
      OR: [{ medicalDocumentUrl: null }, { medicalDocumentUrl: "" }],
    },
    include: {
      employee: { include: { user: { select: { id: true } }, manager: true } },
    },
  });

  let actions = 0;
  for (const leave of sickLeaves) {
    const due = leave.medicalDocumentDueAt!;
    const msLeft = due.getTime() - now.getTime();
    const userId = leave.employee.user?.id;

    if (msLeft <= 0 && !leave.medicalOverdueNotifiedAt) {
      await prisma.leaveRequest.update({
        where: { leaveRequestId: leave.leaveRequestId },
        data: { medicalOverdueNotifiedAt: now },
      });
      publishNotificationChange("medical-overdue", leave.leaveRequestId);
      if (userId) {
        await sendPushToUsers([userId], {
          title: "Medical certificate overdue",
          body: "Your Sick Leave medical certificate deadline has passed. Upload it from Leave History.",
          href: "/leave/history",
          tag: `medical-overdue-${leave.leaveRequestId}`,
        });
      }
      actions += 1;
      continue;
    }

    if (msLeft > 0 && msLeft <= 2 * 60 * 60 * 1000 && !leave.medicalReminder2hSentAt) {
      await prisma.leaveRequest.update({
        where: { leaveRequestId: leave.leaveRequestId },
        data: { medicalReminder2hSentAt: now },
      });
      publishNotificationChange("medical-reminder-2h", leave.leaveRequestId);
      if (userId) {
        await sendPushToUsers([userId], {
          title: "Medical certificate due in 2 hours",
          body: "Upload your Sick Leave medical certificate before the deadline.",
          href: "/leave/history",
          tag: `medical-2h-${leave.leaveRequestId}`,
        });
      }
      actions += 1;
      continue;
    }

    if (
      msLeft > 2 * 60 * 60 * 1000 &&
      msLeft <= 24 * 60 * 60 * 1000 &&
      !leave.medicalReminder24hSentAt
    ) {
      await prisma.leaveRequest.update({
        where: { leaveRequestId: leave.leaveRequestId },
        data: { medicalReminder24hSentAt: now },
      });
      publishNotificationChange("medical-reminder-24h", leave.leaveRequestId);
      if (userId) {
        await sendPushToUsers([userId], {
          title: "Medical certificate due in 24 hours",
          body: "Upload your Sick Leave medical certificate within 24 hours.",
          href: "/leave/history",
          tag: `medical-24h-${leave.leaveRequestId}`,
        });
      }
      actions += 1;
    }
  }
  return actions;
}
