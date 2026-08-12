import { createHash, createPrivateKey, sign } from "node:crypto";
import webPush from "web-push";
import { config } from "./config.js";
import { prisma } from "./prisma.js";

type PushPayload = {
  title: string;
  body: string;
  href?: string;
  tag?: string;
  priority?: string;
};

export function isWebPushConfigured() {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
}

export function isFcmConfigured() {
  return Boolean(config.fcmServerKey);
}

export function isApnsConfigured() {
  return Boolean(config.apnsKeyId && config.apnsTeamId && config.apnsKeyP8 && config.apnsBundleId);
}

export function isAnyPushConfigured() {
  return isWebPushConfigured() || isFcmConfigured() || isApnsConfigured();
}

function configureWebPush() {
  if (!isWebPushConfigured()) return false;
  webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  return true;
}

function nativeEndpoint(channel: "fcm" | "apns", token: string) {
  return `native://${channel}/${token}`;
}

export function hashPushEndpoint(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function nativeTokenEndpoint(channel: "fcm" | "apns", token: string) {
  return nativeEndpoint(channel, token);
}

async function sendFcm(token: string, payload: PushPayload) {
  if (!isFcmConfigured()) return false;
  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${config.fcmServerKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      priority: payload.priority === "URGENT" ? "high" : "normal",
      notification: {
        title: payload.title,
        body: payload.body,
        tag: payload.tag,
        click_action: payload.href ?? "/notifications",
      },
      data: {
        href: payload.href ?? "/notifications",
        title: payload.title,
        body: payload.body,
      },
    }),
  });
  if (response.status === 404 || response.status === 410) {
    const err = new Error("FCM token gone") as Error & { statusCode: number };
    err.statusCode = response.status;
    throw err;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FCM send failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return true;
}

function base64Url(input: Buffer | string) {
  const buffer = typeof input === "string" ? Buffer.from(input) : input;
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createApnsAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.apnsKeyId }));
  const claims = base64Url(JSON.stringify({ iss: config.apnsTeamId, iat: now }));
  const unsigned = `${header}.${claims}`;
  const key = createPrivateKey(config.apnsKeyP8.includes("BEGIN") ? config.apnsKeyP8 : Buffer.from(config.apnsKeyP8, "base64"));
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${base64Url(signature)}`;
}

async function sendApns(token: string, payload: PushPayload) {
  if (!isApnsConfigured()) return false;
  const host = config.apnsProduction ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const auth = createApnsAuthToken();
  const response = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${auth}`,
      "apns-topic": config.apnsBundleId,
      "apns-push-type": "alert",
      "apns-priority": payload.priority === "URGENT" ? "10" : "5",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
        "thread-id": payload.tag,
      },
      href: payload.href ?? "/notifications",
    }),
  });
  if (response.status === 410 || response.status === 404) {
    const err = new Error("APNs token gone") as Error & { statusCode: number };
    err.statusCode = response.status;
    throw err;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`APNs send failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return true;
}

async function sendPush(payload: PushPayload, userIds?: string[]) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: userIds ? { userId: { in: userIds } } : undefined,
  });
  let sent = 0;
  let removed = 0;
  const webReady = configureWebPush();

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        if (subscription.channel === "fcm") {
          if (!isFcmConfigured()) return;
          await sendFcm(subscription.endpoint.replace(/^native:\/\/fcm\//, ""), payload);
          sent += 1;
          return;
        }
        if (subscription.channel === "apns") {
          if (!isApnsConfigured()) return;
          await sendApns(subscription.endpoint.replace(/^native:\/\/apns\//, ""), payload);
          sent += 1;
          return;
        }
        if (!webReady) return;
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
            renotify: true,
            requireInteraction: payload.priority === "URGENT",
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

export function sendPushToAll(payload: Parameters<typeof sendPush>[0]) {
  return sendPush(payload);
}

export function sendPushToUsers(userIds: string[], payload: Parameters<typeof sendPush>[0]) {
  if (userIds.length === 0) return Promise.resolve({ sent: 0, removed: 0 });
  return sendPush(payload, userIds);
}
