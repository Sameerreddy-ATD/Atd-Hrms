import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./errors.js";

/** Browser push endpoints we accept for Web Push (rejects arbitrary SSRF targets). */
const ALLOWED_HOST_SUFFIXES = [
  ".googleapis.com",
  ".google.com",
  ".mozilla.com",
  ".mozilla.org",
  ".mozilla.net",
  ".firefox.com",
  ".push.apple.com",
  ".windows.com",
  ".microsoft.com",
  ".msn.com",
  ".live.com",
  ".wpush.windows.com",
];

const ALLOWED_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "wns2-*.notify.windows.com",
]);

function hostAllowed(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (ALLOWED_HOSTS.has(host)) return true;
  if (host.endsWith(".notify.windows.com")) return true;
  if (host.endsWith(".push.apple.com")) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

function isPrivateIp(ip: string) {
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const v4 = ip.includes(".") ? ip : null;
  if (!v4) return false;
  const parts = v4.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Validate a Web Push subscription endpoint before storing/sending.
 * Only HTTPS public push-provider hosts are allowed.
 */
export async function assertSafeWebPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new HttpError(400, "Invalid push endpoint URL");
  }
  if (url.protocol !== "https:") {
    throw new HttpError(400, "Push endpoint must use HTTPS");
  }
  if (url.username || url.password) {
    throw new HttpError(400, "Push endpoint must not include credentials");
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || isIP(hostname)) {
    throw new HttpError(400, "Push endpoint host is not allowed");
  }
  if (!hostAllowed(hostname)) {
    throw new HttpError(400, "Push endpoint host is not an allowed push provider");
  }

  let addresses: string[] = [];
  try {
    const result = await lookup(hostname, { all: true });
    addresses = result.map((row) => row.address);
  } catch {
    throw new HttpError(400, "Push endpoint host could not be resolved");
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new HttpError(400, "Push endpoint resolves to a disallowed address");
  }
}
