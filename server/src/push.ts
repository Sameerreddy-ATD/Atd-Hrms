import { createHash, createPrivateKey, createSign, sign } from "node:crypto";
import webPush from "web-push";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { assertSafeWebPushEndpoint } from "./webPushEndpoint.js";

type PushPayload = {
  title: string;
  body: string;
  href?: string;
  tag?: string;
  priority?: string;
};

type ServiceAccount = {
  project_id?: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cachedFcmToken: { value: string; expiresAt: number } | null = null;

export function isWebPushConfigured() {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
}

export function isFcmConfigured() {
  return Boolean(config.fcmServiceAccountJson || config.fcmServerKey);
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

function base64Url(input: Buffer | string) {
  const buffer = typeof input === "string" ? Buffer.from(input) : input;
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function readServiceAccount(): ServiceAccount | null {
  if (!config.fcmServiceAccountJson) return null;
  try {
    return JSON.parse(config.fcmServiceAccountJson) as ServiceAccount;
  } catch {
    return null;
  }
}

async function getFcmAccessToken() {
  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) {
    return cachedFcmToken.value;
  }
  const sa = readServiceAccount();
  if (!sa?.client_email || !sa.private_key) {
    throw new Error("FCM service account JSON is missing client_email/private_key");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64Url(signer.sign(sa.private_key));
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`FCM OAuth failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("FCM OAuth response missing access_token");
  cachedFcmToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in ?? 3600)) * 1000,
  };
  return body.access_token;
}

async function sendFcmHttpV1(token: string, payload: PushPayload) {
  const sa = readServiceAccount();
  const projectId = config.fcmProjectId || sa?.project_id;
  if (!projectId) throw new Error("FCM_PROJECT_ID or service account project_id is required");
  const accessToken = await getFcmAccessToken();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            href: payload.href ?? "/notifications",
            title: payload.title,
            body: payload.body,
            tag: payload.tag ?? "",
          },
          android: {
            priority: payload.priority === "URGENT" || payload.priority === "IMPORTANT" ? "HIGH" : "NORMAL",
            notification: {
              channelId: "anytime_workforce",
              tag: payload.tag,
              icon: "ic_stat_notify",
              color: "#DC2F20",
              sound: "default",
              defaultSound: true,
              notificationPriority:
                payload.priority === "URGENT" || payload.priority === "IMPORTANT"
                  ? "PRIORITY_HIGH"
                  : "PRIORITY_DEFAULT",
            },
          },
        },
      }),
    },
  );
  if (response.status === 404 || response.status === 410) {
    const err = new Error("FCM token gone") as Error & { statusCode: number };
    err.statusCode = response.status;
    throw err;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // UNREGISTERED tokens
    if (text.includes("UNREGISTERED") || text.includes("NOT_FOUND")) {
      const err = new Error("FCM token gone") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    throw new Error(`FCM v1 send failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return true;
}

async function sendFcmLegacy(token: string, payload: PushPayload) {
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
    throw new Error(`FCM legacy send failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return true;
}

async function sendFcm(token: string, payload: PushPayload) {
  if (!isFcmConfigured()) return false;
  if (config.fcmServiceAccountJson) return sendFcmHttpV1(token, payload);
  return sendFcmLegacy(token, payload);
}

function createApnsAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.apnsKeyId }));
  const claims = base64Url(JSON.stringify({ iss: config.apnsTeamId, iat: now }));
  const unsigned = `${header}.${claims}`;
  const key = createPrivateKey(
    config.apnsKeyP8.includes("BEGIN") ? config.apnsKeyP8 : Buffer.from(config.apnsKeyP8, "base64"),
  );
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
        try {
          await assertSafeWebPushEndpoint(subscription.endpoint);
        } catch {
          await prisma.pushSubscription.delete({
            where: { subscriptionId: subscription.subscriptionId },
          });
          removed += 1;
          return;
        }
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
