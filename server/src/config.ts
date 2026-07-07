import "dotenv/config";

export const config = {
  port: Number(process.env.BACKEND_PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  accessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me",
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
  sessionCookie: process.env.SESSION_COOKIE_NAME ?? "adh_session",
  refreshCookie: process.env.REFRESH_COOKIE_NAME ?? "adh_refresh",
  secureCookies: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  isProduction: process.env.NODE_ENV === "production",
};

export function assertSecureConfig() {
  if (!config.isProduction) return;
  if (config.frontendOrigin === "*" || config.frontendOrigin.trim() === "") {
    throw new Error("FRONTEND_ORIGIN must be explicit in production");
  }
  if (config.accessSecret.length < 32 || config.refreshSecret.length < 32) {
    throw new Error("JWT secrets must be at least 32 characters in production");
  }
}
