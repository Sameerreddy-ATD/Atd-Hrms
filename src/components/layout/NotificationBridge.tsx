import { useEffect, useRef } from "react";
import { notificationPreferencesApi, notificationsApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import {
  areDesktopAlertsEnabled,
  filterVisibleNotifications,
  getSeenNotificationIds,
  hydrateNotificationInbox,
  setSeenNotificationIds,
  showDesktopNotification,
  syncDesktopAlertsWithPermission,
  NOTIFICATION_COUNT_CHANGED_EVENT,
} from "@/lib/browser-notifications";
import { subscribeToNotificationChanges } from "@/lib/notification-live";

export function NotificationBridge() {
  const { user, loading } = useAuth();
  const initialized = useRef(false);

  useEffect(() => {
    // Wait for cookie restore so we never stampede /auth/refresh before the
    // session cookies are confirmed (that race was logging users out on reopen).
    if (loading || !user || user.mustChangePassword) return;
    initialized.current = false;

    let cancelled = false;

    async function hydrateInbox() {
      try {
        const pref = await notificationPreferencesApi.get();
        if (cancelled) return;
        hydrateNotificationInbox({ ids: pref.dismissedIds, at: pref.inboxClearedAt });
        window.dispatchEvent(new Event(NOTIFICATION_COUNT_CHANGED_EVENT));
      } catch {
        // Local dismiss state still applies if the server is unreachable.
      }
    }

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

    void hydrateInbox();
    void syncNotifications();
    // Prefer live SSE; slow fallback only when the tab is visible.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncNotifications();
    }, 180_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = subscribeToNotificationChanges(() => {
      window.dispatchEvent(new Event(NOTIFICATION_COUNT_CHANGED_EVENT));
      void syncNotifications();
    });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [user, loading]);

  return null;
}
