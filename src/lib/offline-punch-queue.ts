const DB_NAME = "atd-offline-punch";
const STORE = "queue";

export type OfflinePunch =
  | {
      id: string;
      kind: "check-in";
      createdAt: string;
      payload: {
        employeeId: string;
        latitude: number;
        longitude: number;
        locationAccuracy: number;
        mobileDeviceId?: string;
        confirmLeaveCancellation?: boolean;
        faceVerification?: unknown;
      };
    }
  | {
      id: string;
      kind: "check-out";
      createdAt: string;
      payload: {
        latitude: number;
        longitude: number;
        locationAccuracy: number;
        mobileDeviceId?: string;
      };
    };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

export async function enqueueOfflinePunch(entry: OfflinePunch) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to queue punch"));
  });
  db.close();
}

export async function listOfflinePunches(): Promise<OfflinePunch[]> {
  const db = await openDb();
  const rows = await new Promise<OfflinePunch[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as OfflinePunch[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error("Failed to read punch queue"));
  });
  db.close();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
    /failed to fetch|networkerror|network request failed|load failed|offline|timeout/i.test(
      message,
    ) || !navigator.onLine
  );
}
