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
import { NOTIFICATION_COUNT_CHANGED_EVENT } from "@/lib/browser-notifications";
import { subscribeToNotificationChanges } from "@/lib/notification-live";

export function NotificationBridge() {
  const { user } = useAuth();
  const initialized = useRef(false);

  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    initialized.current = false;

    let cancelled = false;

    async function syncNotifications() {
      syncDesktopAlertsWithPermission();
      if (!areDesktopAlertsEnabled()) return;

      let items;
      try {
        items = filterVisibleNotifications(await notificationsApi.list());
      } catch {
        return;
      }
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
    const unsubscribe = subscribeToNotificationChanges(() => {
      window.dispatchEvent(new Event(NOTIFICATION_COUNT_CHANGED_EVENT));
      void syncNotifications();
    });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [user]);

  return null;
}
