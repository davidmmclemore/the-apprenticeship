"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { SeasonBundle } from "@/lib/bundle";
import { entryRemote } from "@/lib/data";
import type { OutboxItem } from "@/lib/local/device-store";
import { applyPending, entryFromOutbox, saveStateOf, type SaveState } from "@/lib/local/sync";
import { loadSeasonBundle } from "@/lib/load-season";
import { describeError } from "@/lib/supabase";
import type { Edition, Entry, EntryWrite, ReadingSession, Theme, Work } from "@/lib/types";
import { useLoad } from "@/lib/use-load";
import { useApp } from "../providers";
import { useToast } from "../ui";

export type Tab = "desk" | "works" | "route" | "notebook" | "inheritance";
export const TABS: { id: Tab; label: string }[] = [
  { id: "desk", label: "Desk" },
  { id: "works", label: "Works" },
  { id: "route", label: "Route" },
  { id: "notebook", label: "Notebook" },
  { id: "inheritance", label: "Inheritance" },
];

export interface NavParams {
  tab: Tab;
  work: string | null;
  theme: string | null;
  entry: string | null;
  view: string | null;
}

interface SeasonCtx {
  b: SeasonBundle;
  reload: () => Promise<void>;
  offlineCopyFrom: string | null;
  workById: Map<string, Work>;
  editionById: Map<string, Edition>;
  themeById: Map<string, Theme>;
  sessionById: Map<string, ReadingSession>;
  /** Server entries merged with anything still waiting on this device. */
  entries: Entry[];
  saveState: (entryId: string) => SaveState;
  outboxItem: (entryId: string) => OutboxItem | undefined;
  themesForEntry: (entryId: string) => string[];
  nav: NavParams;
  go: (patch: Partial<NavParams>, opts?: { replace?: boolean }) => void;
  /** Capture a new entry. Resolves once it is durably stored (device or account). */
  capture: (payload: Partial<EntryWrite>, themeIds?: string[]) => Promise<{ id: string; state: SaveState }>;
  saveEntry: (entry: Entry, patch: Partial<EntryWrite>, themeIds?: string[]) => Promise<SaveState>;
  /** Run a change that needs the account; reports errors and reloads. */
  act: <T>(fn: () => Promise<T>, done?: string) => Promise<T | undefined>;
}

const Ctx = createContext<SeasonCtx | null>(null);

export function useSeason(): SeasonCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSeason outside SeasonProvider");
  return ctx;
}

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

export function SeasonProvider({ id, children, fallback }: { id: string; children: ReactNode; fallback: (state: { error: string | null; loading: boolean; reload: () => void }) => ReactNode }) {
  const { engine, outbox, user } = useApp();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: b, error, loading, reload, offlineCopyFrom, setData } = useLoad(`season:${id}`, () => loadSeasonBundle(id));

  // When a waiting note reaches the account, fold the saved copy in.
  useEffect(() => {
    if (!engine) return;
    return engine.onSynced((saved) => {
      if (saved.apprenticeship_id !== id) return;
      setData((cur) => ({ ...cur, entries: [saved, ...cur.entries.filter((e) => e.id !== saved.id)] }));
      void reload();
    });
  }, [engine, id, setData, reload]);

  const nav: NavParams = useMemo(() => {
    const tab = params.get("tab");
    return {
      tab: tab && TAB_IDS.has(tab) ? (tab as Tab) : "desk",
      work: params.get("work"),
      theme: params.get("theme"),
      entry: params.get("entry"),
      view: params.get("view"),
    };
  }, [params]);

  const go = useCallback(
    (patch: Partial<NavParams>, opts?: { replace?: boolean }) => {
      const next = new URLSearchParams(params.toString());
      next.set("id", id);
      next.delete("welcome");
      const merged = { ...nav, ...patch };
      if (patch.tab && patch.tab !== nav.tab) {
        // Changing destination clears its sub-views unless explicitly given.
        for (const k of ["work", "theme", "entry", "view"] as const) if (!(k in patch)) merged[k] = null;
      }
      for (const [k, v] of Object.entries(merged)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (merged.tab === "desk") next.delete("tab");
      const url = `${pathname}?${next.toString()}`;
      if (opts?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: patch.tab !== undefined && patch.tab !== nav.tab });
    },
    [params, id, nav, pathname, router],
  );

  const seasonOutbox = useMemo(() => outbox.filter((i) => i.apprenticeshipId === id), [outbox, id]);
  const outboxById = useMemo(() => new Map(seasonOutbox.map((i) => [i.id, i])), [seasonOutbox]);

  const entries = useMemo(() => {
    if (!b) return [];
    const serverIds = new Set(b.entries.map((e) => e.id));
    const merged = b.entries.map((e) => applyPending(e, outboxById.get(e.id)));
    const localOnly = seasonOutbox.filter((i) => i.op === "create" && !serverIds.has(i.id)).map((i) => entryFromOutbox(i, user?.id ?? ""));
    return [...localOnly, ...merged].sort((a, c) => c.captured_at.localeCompare(a.captured_at));
  }, [b, outboxById, seasonOutbox, user]);

  const pendingThemes = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of seasonOutbox) if (i.themeIds.length) m.set(i.id, i.themeIds);
    return m;
  }, [seasonOutbox]);

  const themesForEntry = useCallback(
    (entryId: string) => {
      const saved = b ? b.entryThemes.filter((et) => et.entry_id === entryId).map((et) => et.theme_id) : [];
      return [...new Set([...saved, ...(pendingThemes.get(entryId) ?? [])])];
    },
    [b, pendingThemes],
  );

  const capture = useCallback(
    async (payload: Partial<EntryWrite>, themeIds: string[] = []) => {
      if (engine) {
        const item = await engine.enqueueCreate(id, payload, themeIds);
        void engine.sync();
        return { id: item.id, state: "local" as SaveState };
      }
      // No device storage available (e.g. some private modes): save straight to the account.
      const entryId = crypto.randomUUID();
      const saved = await entryRemote.insert({ ...payload, id: entryId, apprenticeship_id: id });
      if (themeIds.length) await entryRemote.attachThemes(entryId, id, themeIds);
      setData((cur) => ({ ...cur, entries: [saved, ...cur.entries] }));
      void reload();
      return { id: entryId, state: "saved" as SaveState };
    },
    [engine, id, setData, reload],
  );

  const saveEntry = useCallback(
    async (entry: Entry, patch: Partial<EntryWrite>, themeIds: string[] = []) => {
      if (engine) {
        await engine.enqueueUpdate(entry, patch, themeIds);
        void engine.sync();
        return "local" as SaveState;
      }
      const saved = await entryRemote.updateIfRevision(entry.id, entry.revision, patch);
      if (!saved) throw new Error("This note was changed elsewhere. Reload to see the latest version before editing.");
      if (themeIds.length) await entryRemote.attachThemes(entry.id, id, themeIds);
      void reload();
      return "saved" as SaveState;
    },
    [engine, id, reload],
  );

  const act = useCallback(
    async <T,>(fn: () => Promise<T>, done?: string) => {
      try {
        const result = await fn();
        if (done) toast(done);
        await reload();
        return result;
      } catch (e) {
        toast(describeError(e), { tone: "error" });
        return undefined;
      }
    },
    [toast, reload],
  );

  const value = useMemo<SeasonCtx | null>(() => {
    if (!b) return null;
    return {
      b,
      reload,
      offlineCopyFrom,
      workById: new Map(b.works.map((w) => [w.id, w])),
      editionById: new Map(b.editions.map((e) => [e.id, e])),
      themeById: new Map(b.themes.map((t) => [t.id, t])),
      sessionById: new Map(b.sessions.map((s) => [s.id, s])),
      entries,
      saveState: (entryId: string) => saveStateOf(outboxById.get(entryId)),
      outboxItem: (entryId: string) => outboxById.get(entryId),
      themesForEntry,
      nav,
      go,
      capture,
      saveEntry,
      act,
    };
  }, [b, reload, offlineCopyFrom, entries, outboxById, themesForEntry, nav, go, capture, saveEntry, act]);

  if (!value) return <>{fallback({ error, loading, reload })}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function errorMessage(e: unknown) {
  return describeError(e);
}
