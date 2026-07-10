import { useEffect, useRef } from "react";
import { notificationsApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import {
  areDesktopAlertsEnabled,
  filterVisibleNotifications,
  getSeenNotificationIds,
  setSeenNotificationIds,
  showDesktopNotification,
  syncDesktopAlertsWithPermission,
} from "@/lib/browser-notifications";

export function NotificationBridge() {
  const { user } = useAuth();
  const initialized = useRef(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function syncNotifications() {
      syncDesktopAlertsWithPermission();
      if (!areDesktopAlertsEnabled()) return;

      const items = filterVisibleNotifications(await notificationsApi.list());
      if (cancelled) return;

      const seenIds = new Set(getSeenNotificationIds());
      if (!initialized.current) {
        setSeenNotificationIds(items.map((item) => item.id));
        initialized.current = true;
        return;
      }

      const newItems = items.filter((item) => !seenIds.has(item.id));
      for (const item of newItems) {
        await showDesktopNotification(item);
      }
      if (newItems.length > 0) {
        setSeenNotificationIds([...seenIds, ...newItems.map((item) => item.id)]);
      }
    }

    void syncNotifications();
    const intervalId = window.setInterval(() => {
      void syncNotifications();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user]);

  return null;
}
