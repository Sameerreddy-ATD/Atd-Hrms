import "dotenv/config";

export function parseTrustProxy(value?: string): string | number | boolean {
  const normalized = value?.trim();
  if (!normalized) return "loopback";
  if (normalized === "false") return false;
  if (normalized === "true") return true;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

const DEFAULT_ACCESS_SECRET = "dev-access-secret-change-me";
const DEFAULT_REFRESH_SECRET = "dev-refresh-secret-change-me";
const DEFAULT_EMPLOYEE_DATA_KEY = "dev-employee-data-encryption-key-change-me";

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
  verifyIdRateLimitWindowMs: Number(process.env.VERIFY_ID_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  verifyIdRateLimitMax: Number(process.env.VERIFY_ID_RATE_LIMIT_MAX ?? 60),
  uploadRateLimitWindowMs: Number(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  uploadRateLimitMax: Number(process.env.UPLOAD_RATE_LIMIT_MAX ?? 40),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  accessSecret: process.env.JWT_ACCESS_SECRET ?? DEFAULT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? DEFAULT_REFRESH_SECRET,
  // Never silently reuse the refresh JWT secret for field encryption.
  employeeDataEncryptionKey: process.env.EMPLOYEE_DATA_ENCRYPTION_KEY ?? DEFAULT_EMPLOYEE_DATA_KEY,
  faceEvidenceDir: process.env.FACE_EVIDENCE_DIR ?? ".face-evidence",
  sessionCookie: process.env.SESSION_COOKIE_NAME ?? "adh_session",
  refreshCookie: process.env.REFRESH_COOKIE_NAME ?? "adh_refresh",
  secureCookies: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  allowInsecureDevSecrets: process.env.ALLOW_INSECURE_DEV_SECRETS === "true",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:hrms@example.com",
  /** Legacy FCM server key (optional fallback). Prefer FCM_SERVICE_ACCOUNT_JSON (HTTP v1). */
  fcmServerKey: process.env.FCM_SERVER_KEY ?? "",
  /** Firebase service account JSON string for FCM HTTP v1. */
  fcmServiceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON ?? "",
  fcmProjectId: process.env.FCM_PROJECT_ID ?? "",
  /** APNs key material for iOS native push (PEM contents or path handled by ops). */
  apnsKeyId: process.env.APNS_KEY_ID ?? "",
  apnsTeamId: process.env.APNS_TEAM_ID ?? "",
  apnsBundleId: process.env.APNS_BUNDLE_ID ?? "com.anytimediesel.workforce",
  apnsKeyP8: process.env.APNS_KEY_P8 ?? "",
  apnsProduction: process.env.APNS_PRODUCTION !== "false",
};

function isDefaultSecret(value: string, defaults: string[]) {
  return defaults.includes(value);
}

/**
 * Refuse to boot with known-default secrets unless explicitly allowed for local/test.
 * Production always requires strong unique secrets.
 */
export function assertSecureConfig() {
  const usingDefaults =
    isDefaultSecret(config.accessSecret, [DEFAULT_ACCESS_SECRET]) ||
    isDefaultSecret(config.refreshSecret, [DEFAULT_REFRESH_SECRET]) ||
    isDefaultSecret(config.employeeDataEncryptionKey, [DEFAULT_EMPLOYEE_DATA_KEY]) ||
    config.accessSecret === config.refreshSecret ||
    config.employeeDataEncryptionKey === config.accessSecret ||
    config.employeeDataEncryptionKey === config.refreshSecret;

  if (config.isProduction) {
    if (config.frontendOrigin === "*" || config.frontendOrigin.trim() === "") {
      throw new Error("FRONTEND_ORIGIN must be explicit in production");
    }
    if (config.accessSecret.length < 32 || config.refreshSecret.length < 32) {
      throw new Error("JWT secrets must be at least 32 characters in production");
    }
    if (config.employeeDataEncryptionKey.length < 32) {
      throw new Error("EMPLOYEE_DATA_ENCRYPTION_KEY must be at least 32 characters in production");
    }
    if (usingDefaults) {
      throw new Error("Default or shared JWT/encryption secrets are not allowed in production");
    }
    if (config.trustProxy === true) {
      throw new Error(
        "TRUST_PROXY=true is unsafe in production; use an exact proxy hop count or trusted subnet",
      );
    }
    return;
  }

  if (config.isTest) return;

  if (usingDefaults && !config.allowInsecureDevSecrets) {
    throw new Error(
      "Refusing to start with default JWT/encryption secrets. Set real secrets in .env, or set ALLOW_INSECURE_DEV_SECRETS=true for local development only.",
    );
  }
  if (config.accessSecret.length < 32 || config.refreshSecret.length < 32) {
    if (!config.allowInsecureDevSecrets) {
      throw new Error("JWT secrets must be at least 32 characters (or set ALLOW_INSECURE_DEV_SECRETS=true)");
    }
  }
  if (config.employeeDataEncryptionKey.length < 32 && !config.allowInsecureDevSecrets) {
    throw new Error(
      "EMPLOYEE_DATA_ENCRYPTION_KEY must be at least 32 characters (or set ALLOW_INSECURE_DEV_SECRETS=true)",
    );
  }
}
