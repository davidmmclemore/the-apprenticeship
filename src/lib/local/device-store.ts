import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EntryWrite, Entry } from "../types";

/**
 * Per-account storage on this device. Each signed-in user gets their own
 * IndexedDB database (named with their user id), so one account can never
 * read another's drafts, pending notes or cached pages. The app only opens
 * the database for the user whose session is active.
 */

export interface DraftRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export type OutboxStatus = "pending" | "syncing" | "failed" | "conflict";

export interface OutboxItem {
  /** The entry id; generated on the client so retries are idempotent. */
  id: string;
  op: "create" | "update";
  apprenticeshipId: string;
  payload: Partial<EntryWrite>;
  /** Theme ids to attach once the entry exists on the server. */
  themeIds: string[];
  /** For updates: the revision this edit was based on. */
  baseRevision: number | null;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  /** For conflicts: the version currently saved to the account. */
  serverVersion: Entry | null;
  createdAt: string;
  updatedAt: string;
}

export interface CacheRecord {
  key: string;
  data: unknown;
  savedAt: string;
}

interface DeviceSchema extends DBSchema {
  drafts: { key: string; value: DraftRecord };
  outbox: { key: string; value: OutboxItem; indexes: { byApprenticeship: string } };
  cache: { key: string; value: CacheRecord };
}

const DB_PREFIX = "the-apprenticeship:";
const VERSION = 1;

export function deviceDbName(userId: string): string {
  return `${DB_PREFIX}${userId}`;
}

export class DeviceStore {
  private constructor(
    readonly userId: string,
    private readonly db: IDBPDatabase<DeviceSchema>,
  ) {}

  static async open(userId: string): Promise<DeviceStore> {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid user id for device store");
    const db = await openDB<DeviceSchema>(deviceDbName(userId), VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("drafts")) database.createObjectStore("drafts", { keyPath: "key" });
        if (!database.objectStoreNames.contains("outbox")) {
          const outbox = database.createObjectStore("outbox", { keyPath: "id" });
          outbox.createIndex("byApprenticeship", "apprenticeshipId");
        }
        if (!database.objectStoreNames.contains("cache")) database.createObjectStore("cache", { keyPath: "key" });
      },
    });
    return new DeviceStore(userId, db);
  }

  close() {
    this.db.close();
  }

  // Drafts ------------------------------------------------------------------
  async putDraft(key: string, value: unknown): Promise<DraftRecord> {
    const record = { key, value, updatedAt: new Date().toISOString() };
    await this.db.put("drafts", record);
    return record;
  }
  getDraft(key: string) {
    return this.db.get("drafts", key);
  }
  deleteDraft(key: string) {
    return this.db.delete("drafts", key);
  }

  // Outbox ------------------------------------------------------------------
  putOutbox(item: OutboxItem) {
    return this.db.put("outbox", item);
  }
  getOutbox(id: string) {
    return this.db.get("outbox", id);
  }
  allOutbox() {
    return this.db.getAll("outbox");
  }
  outboxFor(apprenticeshipId: string) {
    return this.db.getAllFromIndex("outbox", "byApprenticeship", apprenticeshipId);
  }
  deleteOutbox(id: string) {
    return this.db.delete("outbox", id);
  }

  // Cache of the last-loaded pages, for reading offline -----------------------
  async putCache(key: string, data: unknown) {
    await this.db.put("cache", { key, data, savedAt: new Date().toISOString() });
  }
  getCache(key: string) {
    return this.db.get("cache", key);
  }
}

/** Remove everything this app stored on this device for one account. */
export async function eraseDeviceData(userId: string) {
  await deleteDB(deviceDbName(userId));
}
