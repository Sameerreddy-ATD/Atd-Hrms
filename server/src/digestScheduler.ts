import { prisma } from "./prisma.js";

/**
 * Daily digest placeholder. When SMTP is configured in a later release, this will email
 * managers with pending leave/OT/claim counts. Until then it only refreshes preference rows.
 */
export function startManagerDigestScheduler() {
  const hourMs = 60 * 60 * 1000;
  const tick = async () => {
    try {
      const daily = await prisma.notificationPreference.count({
        where: { digestMode: "daily" },
      });
      if (daily === 0) return;
      // SMTP transport is intentionally not wired yet (no nodemailer dependency).
      console.info(`[digest] ${daily} users prefer daily digests; SMTP delivery not configured`);
    } catch (error) {
      console.error("[digest] scheduler failed", error);
    }
  };
  void tick();
  setInterval(() => void tick(), hourMs).unref();
}
