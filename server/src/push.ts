import webPush from "web-push";
import { config } from "./config.js";
import { prisma } from "./prisma.js";

export function isWebPushConfigured() {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
}

function configureWebPush() {
  if (!isWebPushConfigured()) return false;
  webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  return true;
}

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  href?: string;
  tag?: string;
}) {
  if (!configureWebPush()) return { sent: 0, removed: 0 };
  const subscriptions = await prisma.pushSubscription.findMany();
  let sent = 0;
  let removed = 0;

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: "/pwa-192.png",
            badge: "/pwa-192.png",
            tag: payload.tag,
            data: { href: payload.href ?? "/notifications" },
          }),
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({
            where: { subscriptionId: subscription.subscriptionId },
          });
          removed += 1;
        }
      }
    }),
  );

  return { sent, removed };
}
