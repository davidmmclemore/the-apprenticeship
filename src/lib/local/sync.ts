import type { Entry, EntryWrite } from "../types";
import type { DeviceStore, OutboxItem } from "./device-store";

/**
 * Offline-safe saving for notebook entries.
 *
 *  1. A capture is written to this device first (IndexedDB). Only after that
 *     write resolves may the UI say "Saved on this device".
 *  2. The outbox is then pushed to the account. Entry ids are generated on the
 *     client, so a retried insert can never create a duplicate: the second
 *     attempt hits the primary key and is recognised as already saved.
 *  3. Edits carry the revision they were based on. If the server copy has
 *     moved on, nothing is overwritten; the item becomes a conflict holding
 *     both versions until the reader chooses.
 *  Only when the server confirms does the item leave the outbox ("Saved to
 *  account").
 */

export class RemoteError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly network: boolean,
  ) {
    super(message);
  }
}

export interface EntryRemote {
  /** Insert with a client id. Must throw RemoteError with code '23505' on duplicate id. */
  insert(row: Partial<EntryWrite> & { id: string; apprenticeship_id: string }): Promise<Entry>;
  /** Fetch by id; null if not visible / not found. */
  fetch(id: string): Promise<Entry | null>;
  /** Update only if the stored revision still equals baseRevision; null if no row matched. */
  updateIfRevision(id: string, baseRevision: number, patch: Partial<EntryWrite>): Promise<Entry | null>;
  /** Attach themes; must ignore links that already exist. */
  attachThemes(entryId: string, apprenticeshipId: string, themeIds: string[]): Promise<void>;
}

export type SyncListener = (items: OutboxItem[]) => void;
export type SyncedListener = (entry: Entry, item: OutboxItem) => void;

export type SaveState = "local" | "syncing" | "saved" | "failed" | "conflict";

export function saveStateOf(item: OutboxItem | undefined): SaveState {
  if (!item) return "saved";
  if (item.status === "syncing") return "syncing";
  if (item.status === "failed") return "failed";
  if (item.status === "conflict") return "conflict";
  return "local";
}

export class SyncEngine {
  private listeners = new Set<SyncListener>();
  private syncedListeners = new Set<SyncedListener>();
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    readonly store: DeviceStore,
    private readonly remote: EntryRemote,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  subscribe(fn: SyncListener): () => void {
    this.listeners.add(fn);
    void this.store.allOutbox().then(fn);
    return () => this.listeners.delete(fn);
  }

  onSynced(fn: SyncedListener): () => void {
    this.syncedListeners.add(fn);
    return () => this.syncedListeners.delete(fn);
  }

  private async emit() {
    const items = await this.store.allOutbox();
    for (const fn of this.listeners) fn(items);
  }

  /** Record a new entry on this device. Resolves once it is durably stored locally. */
  async enqueueCreate(
    apprenticeshipId: string,
    payload: Partial<EntryWrite>,
    themeIds: string[] = [],
    id: string = this.newId(),
  ): Promise<OutboxItem> {
    const now = new Date().toISOString();
    const item: OutboxItem = {
      id,
      op: "create",
      apprenticeshipId,
      payload: { ...payload, apprenticeship_id: apprenticeshipId, captured_at: payload.captured_at ?? now },
      themeIds: [...new Set(themeIds)],
      baseRevision: null,
      status: "pending",
      attempts: 0,
      lastError: null,
      serverVersion: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.putOutbox(item);
    await this.emit();
    return item;
  }

  /** Record an edit to an existing entry. Merges with any edit still waiting. */
  async enqueueUpdate(entry: Pick<Entry, "id" | "apprenticeship_id" | "revision">, patch: Partial<EntryWrite>, themeIds: string[] = []): Promise<OutboxItem> {
    const now = new Date().toISOString();
    const existing = await this.store.getOutbox(entry.id);
    let item: OutboxItem;
    if (existing && existing.status !== "conflict") {
      item = {
        ...existing,
        payload: { ...existing.payload, ...patch },
        themeIds: [...new Set([...existing.themeIds, ...themeIds])],
        status: existing.status === "syncing" ? "syncing" : "pending",
        updatedAt: now,
      };
    } else if (existing && existing.status === "conflict") {
      // Still unresolved: keep refining "my" side of the conflict.
      item = { ...existing, payload: { ...existing.payload, ...patch }, updatedAt: now };
    } else {
      item = {
        id: entry.id,
        op: "update",
        apprenticeshipId: entry.apprenticeship_id,
        payload: patch,
        themeIds: [...new Set(themeIds)],
        baseRevision: entry.revision,
        status: "pending",
        attempts: 0,
        lastError: null,
        serverVersion: null,
        createdAt: now,
        updatedAt: now,
      };
    }
    await this.store.putOutbox(item);
    await this.emit();
    return item;
  }

  /** Push everything waiting. Safe to call often; runs are serialised. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          const items = await this.store.allOutbox();
          for (const item of items) {
            if (item.status === "conflict") continue;
            const stop = await this.syncOne(item);
            if (stop) return; // offline: try again later
          }
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Returns true when the network is unavailable and syncing should pause. */
  private async syncOne(item: OutboxItem): Promise<boolean> {
    const working: OutboxItem = { ...item, status: "syncing", attempts: item.attempts + 1, updatedAt: new Date().toISOString() };
    await this.store.putOutbox(working);
    await this.emit();

    try {
      let saved: Entry;
      if (item.op === "create") {
        try {
          saved = await this.remote.insert({ ...item.payload, id: item.id, apprenticeship_id: item.apprenticeshipId });
        } catch (error) {
          if (error instanceof RemoteError && error.code === "23505") {
            // Already saved by an earlier attempt whose reply was lost.
            const existing = await this.remote.fetch(item.id);
            if (!existing) throw error;
            saved = existing;
          } else {
            throw error;
          }
        }
      } else {
        const updated = await this.remote.updateIfRevision(item.id, item.baseRevision ?? 0, item.payload);
        if (!updated) {
          const server = await this.remote.fetch(item.id);
          await this.finishWith(item.id, (latest) => ({
            ...latest,
            status: "conflict",
            serverVersion: server,
            lastError: server ? "This note was changed elsewhere." : "This note no longer exists on your account.",
          }));
          return false;
        }
        saved = updated;
      }

      if (item.themeIds.length) await this.remote.attachThemes(item.id, item.apprenticeshipId, item.themeIds);

      // If the reader kept editing while this was in flight, keep the newer edit queued.
      const latest = await this.store.getOutbox(item.id);
      if (latest && latest.updatedAt !== working.updatedAt) {
        await this.store.putOutbox({ ...latest, op: "update", baseRevision: saved.revision, status: "pending" });
        this.again = true;
      } else {
        await this.store.deleteOutbox(item.id);
      }
      await this.emit();
      for (const fn of this.syncedListeners) fn(saved, item);
      return false;
    } catch (error) {
      const network = error instanceof RemoteError ? error.network : true;
      await this.finishWith(item.id, (latest) => ({
        ...latest,
        status: network ? "pending" : "failed",
        lastError: error instanceof Error ? error.message : String(error),
      }));
      return network;
    }
  }

  private async finishWith(id: string, change: (latest: OutboxItem) => OutboxItem) {
    const latest = await this.store.getOutbox(id);
    if (latest) await this.store.putOutbox({ ...change(latest), updatedAt: new Date().toISOString() });
    await this.emit();
  }

  /** Retry an item that failed for a non-network reason. */
  async retry(id: string) {
    const item = await this.store.getOutbox(id);
    if (!item) return;
    await this.store.putOutbox({ ...item, status: "pending", lastError: null });
    await this.emit();
    await this.sync();
  }

  /**
   * Resolve a conflict without losing either version.
   *  - "mine":   apply my version over the current one (the earlier wording
   *              is still kept in the entry's history on the server).
   *  - "theirs": keep the account's version; my edit is discarded.
   *  - "both":   keep the account's version and save mine as a new entry.
   */
  async resolveConflict(id: string, choice: "mine" | "theirs" | "both") {
    const item = await this.store.getOutbox(id);
    if (!item || item.status !== "conflict") return;
    const server = item.serverVersion;
    if (choice === "theirs") {
      await this.store.deleteOutbox(id);
    } else if (choice === "mine" && server) {
      await this.store.putOutbox({ ...item, status: "pending", baseRevision: server.revision, serverVersion: null, lastError: null });
    } else {
      // "both", or "mine" when the server copy no longer exists.
      const base = server ? pickWritable(server) : {};
      const copy: Partial<EntryWrite> = { ...base, ...item.payload, apprenticeship_id: item.apprenticeshipId };
      await this.store.deleteOutbox(id);
      const newId = server || choice === "both" ? this.newId() : id;
      await this.store.putOutbox({
        ...item,
        id: newId,
        op: "create",
        payload: copy,
        baseRevision: null,
        status: "pending",
        serverVersion: null,
        lastError: null,
        attempts: 0,
        updatedAt: new Date().toISOString(),
      });
    }
    await this.emit();
    await this.sync();
  }

  /** Discard a waiting item (used for an unsynced capture the reader deletes). */
  async discard(id: string) {
    await this.store.deleteOutbox(id);
    await this.emit();
  }
}

const WRITABLE: (keyof EntryWrite)[] = [
  "apprenticeship_id",
  "work_id",
  "session_id",
  "edition_id",
  "kind",
  "title",
  "body_html",
  "quote_text",
  "quote_locator",
  "quote_source",
  "provenance",
  "provenance_note",
  "question_status",
  "prompt",
  "keep_for_guide",
  "favorite",
  "captured_at",
  "archived_at",
];

export function pickWritable(entry: Partial<Entry>): Partial<EntryWrite> {
  const out: Partial<EntryWrite> = {};
  for (const key of WRITABLE) {
    if (key in entry) (out as Record<string, unknown>)[key] = (entry as Record<string, unknown>)[key];
  }
  return out;
}

/** Overlay an entry with any unsynced local edit, for display. */
export function applyPending(entry: Entry, item: OutboxItem | undefined): Entry {
  if (!item) return entry;
  return { ...entry, ...(item.payload as Partial<Entry>) };
}

/** Build a display entry for a capture that exists only on this device. */
export function entryFromOutbox(item: OutboxItem, ownerId: string): Entry {
  const p = item.payload;
  return {
    id: item.id,
    owner_id: ownerId,
    apprenticeship_id: item.apprenticeshipId,
    work_id: p.work_id ?? null,
    session_id: p.session_id ?? null,
    edition_id: p.edition_id ?? null,
    kind: p.kind ?? "reflection",
    title: p.title ?? null,
    body_html: p.body_html ?? null,
    quote_text: p.quote_text ?? null,
    quote_locator: p.quote_locator ?? null,
    quote_source: p.quote_source ?? null,
    provenance: p.provenance ?? "mine",
    provenance_note: p.provenance_note ?? null,
    question_status: p.question_status ?? null,
    prompt: p.prompt ?? null,
    keep_for_guide: p.keep_for_guide ?? false,
    favorite: p.favorite ?? false,
    revision: 0,
    captured_at: p.captured_at ?? item.createdAt,
    archived_at: p.archived_at ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}
