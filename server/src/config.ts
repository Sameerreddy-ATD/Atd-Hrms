import "dotenv/config";

export function parseTrustProxy(value?: string): string | number | boolean {
  const normalized = value?.trim();
  if (!normalized) return "loopback";
  if (normalized === "false") return false;
  if (normalized === "true") return true;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

export const config = {
  port: Number(process.env.BACKEND_PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30000),
  generalRateLimitWindowMs: Number(process.env.GENERAL_RATE_LIMIT_WINDOW_MS ?? 60 * 1000),
  // Employees commonly share one office IP. Authentication has a separate,
  // stricter limiter while regular dashboard traffic can tolerate shared NAT.
  generalRateLimitMax: Number(process.env.GENERAL_RATE_LIMIT_MAX ?? 12000),
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 50),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  accessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me",
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
  employeeDataEncryptionKey:
    process.env.EMPLOYEE_DATA_ENCRYPTION_KEY ??
    process.env.JWT_REFRESH_SECRET ??
    "dev-employee-data-encryption-key-change-me",
  faceEvidenceDir: process.env.FACE_EVIDENCE_DIR ?? ".face-evidence",
  sessionCookie: process.env.SESSION_COOKIE_NAME ?? "adh_session",
  refreshCookie: process.env.REFRESH_COOKIE_NAME ?? "adh_refresh",
  secureCookies: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  isProduction: process.env.NODE_ENV === "production",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:hrms@example.com",
  /** Legacy FCM server key (Android native push). Optional until Play push is enabled. */
  fcmServerKey: process.env.FCM_SERVER_KEY ?? "",
  /** APNs key material for iOS native push (PEM contents or path handled by ops). */
  apnsKeyId: process.env.APNS_KEY_ID ?? "",
  apnsTeamId: process.env.APNS_TEAM_ID ?? "",
  apnsBundleId: process.env.APNS_BUNDLE_ID ?? "com.anytimediesel.workforce",
  apnsKeyP8: process.env.APNS_KEY_P8 ?? "",
  apnsProduction: process.env.APNS_PRODUCTION !== "false",
};

export function assertSecureConfig() {
  if (!config.isProduction) return;
  if (config.frontendOrigin === "*" || config.frontendOrigin.trim() === "") {
    throw new Error("FRONTEND_ORIGIN must be explicit in production");
  }
  if (config.accessSecret.length < 32 || config.refreshSecret.length < 32) {
    throw new Error("JWT secrets must be at least 32 characters in production");
  }
  if (config.employeeDataEncryptionKey.length < 32) {
    throw new Error("EMPLOYEE_DATA_ENCRYPTION_KEY must be at least 32 characters in production");
  }
  if (config.trustProxy === true) {
    throw new Error(
      "TRUST_PROXY=true is unsafe in production; use an exact proxy hop count or trusted subnet",
    );
  }
}
