const DB_NAME = "atd-offline-punch";
const STORE = "queue";
const TICKET_KEY = "atd.punch.ticket";

export type PunchKind = "check-in" | "check-out";

export type OfflinePunchPayload = {
  employeeId?: string;
  latitude: number;
  longitude: number;
  locationAccuracy: number;
  mobileDeviceId?: string;
  confirmLeaveCancellation?: boolean;
  eventTime: string;
  faceVerification?: unknown;
};

type StoredPunch = {
  id: string;
  employeeId: string;
  kind: PunchKind;
  createdAt: string;
  ticket: string;
  nonce: string;
  iv: string;
  ciphertext: string;
};

export type QueuedPunch = StoredPunch & { payload: OfflinePunchPayload };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function punchKey(ticket: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`atd-punch:${ticket}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptPayload(ticket: string, payload: OfflinePunchPayload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await punchKey(ticket);
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(bytes))),
  };
}

async function decryptPayload(ticket: string, iv: string, ciphertext: string): Promise<OfflinePunchPayload | null> {
  try {
    const key = await punchKey(ticket);
    const ivBytes = Uint8Array.from(atob(iv), (char) => char.charCodeAt(0));
    const data = Uint8Array.from(atob(ciphertext), (char) => char.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, data);
    return JSON.parse(new TextDecoder().decode(plain)) as OfflinePunchPayload;
  } catch {
    return null;
  }
}

export function readPunchTicket() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TICKET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ticket: string; expiresAt: string };
    if (!parsed.ticket || Date.parse(parsed.expiresAt) < Date.now() + 60_000) return null;
    return parsed.ticket;
  } catch {
    return null;
  }
}

export function writePunchTicket(ticket: string, expiresAt: string) {
  sessionStorage.setItem(TICKET_KEY, JSON.stringify({ ticket, expiresAt }));
}

export function clearPunchTicket() {
  sessionStorage.removeItem(TICKET_KEY);
}

export async function enqueueOfflinePunch(input: {
  kind: PunchKind;
  employeeId: string;
  payload: OfflinePunchPayload;
}) {
  const ticket = readPunchTicket();
  if (!ticket) {
    throw new Error("Reconnect to get a secure punch ticket, then try again.");
  }
  const nonce = crypto.randomUUID();
  const sealed = await encryptPayload(ticket, input.payload);
  const entry: StoredPunch = {
    id: crypto.randomUUID(),
    employeeId: input.employeeId,
    kind: input.kind,
    createdAt: input.payload.eventTime,
    ticket,
    nonce,
    ...sealed,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to queue punch"));
  });
  db.close();
  return entry;
}

export async function listOfflinePunches(employeeId?: string): Promise<QueuedPunch[]> {
  const db = await openDb();
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as unknown[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error("Failed to read punch queue"));
  });
  db.close();
  const queued: QueuedPunch[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Partial<StoredPunch> & { payload?: OfflinePunchPayload };
    if (!item.id || !item.kind || !item.ciphertext || !item.ticket || !item.iv) continue;
    if (employeeId && item.employeeId && item.employeeId !== employeeId) continue;
    const payload = await decryptPayload(item.ticket, item.iv, item.ciphertext);
    if (!payload) continue;
    queued.push({
      id: item.id,
      employeeId: item.employeeId ?? payload.employeeId ?? "",
      kind: item.kind,
      createdAt: item.createdAt ?? payload.eventTime,
      ticket: item.ticket,
      nonce: item.nonce ?? crypto.randomUUID(),
      iv: item.iv,
      ciphertext: item.ciphertext,
      payload,
    });
  }
  return queued.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflinePunch(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to remove queued punch"));
  });
  db.close();
}

export function isLikelyNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /failed to fetch|networkerror|network request failed|load failed|offline|timeout|timed out/i.test(
      message,
    ) || (typeof navigator !== "undefined" && !navigator.onLine)
  );
}
