"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { entryRemote } from "@/lib/data";
import { DeviceStore, eraseDeviceData, type OutboxItem } from "@/lib/local/device-store";
import { SyncEngine } from "@/lib/local/sync";
import { isConfigured, supabase } from "@/lib/supabase";
import { ToastProvider } from "./ui";

interface AppState {
  ready: boolean;
  session: Session | null;
  user: User | null;
  /** Per-account device storage; null until opened or if unavailable. */
  store: DeviceStore | null;
  engine: SyncEngine | null;
  /** Why device storage is unavailable (e.g. private browsing), if it is. */
  storeError: string | null;
  outbox: OutboxItem[];
  online: boolean;
  signOut: (opts?: { eraseDevice?: boolean }) => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <Providers>");
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>{children}</AppProvider>
    </ToastProvider>
  );
}

function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [store, setStore] = useState<DeviceStore | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const userId = session?.user.id ?? null;
  const storeRef = useRef<DeviceStore | null>(null);

  // Session ---------------------------------------------------------------
  useEffect(() => {
    if (!isConfigured) {
      setReady(true);
      return;
    }
    const client = supabase();
    let cancelled = false;
    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Connectivity -----------------------------------------------------------
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Device store + sync for exactly the signed-in account -----------------
  useEffect(() => {
    setStore(null);
    setEngine(null);
    setOutbox([]);
    setStoreError(null);
    if (!userId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    DeviceStore.open(userId)
      .then((opened) => {
        if (cancelled) {
          opened.close();
          return;
        }
        storeRef.current = opened;
        const eng = new SyncEngine(opened, entryRemote);
        unsubscribe = eng.subscribe(setOutbox);
        setStore(opened);
        setEngine(eng);
        void eng.sync();
      })
      .catch((e) => {
        if (!cancelled) setStoreError(e instanceof Error ? e.message : "This browser can’t store notes on the device.");
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
      storeRef.current?.close();
      storeRef.current = null;
    };
  }, [userId]);

  // Push waiting items when the connection returns, and periodically while any wait.
  useEffect(() => {
    if (!engine) return;
    const kick = () => void engine.sync();
    window.addEventListener("online", kick);
    const onVisible = () => document.visibilityState === "visible" && kick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [engine]);

  const waiting = outbox.some((i) => i.status === "pending" || i.status === "syncing");
  useEffect(() => {
    if (!engine || !waiting || !online) return;
    const t = setInterval(() => void engine.sync(), 15000);
    return () => clearInterval(t);
  }, [engine, waiting, online]);

  const signOut = useCallback(
    async (opts?: { eraseDevice?: boolean }) => {
      const id = userId;
      storeRef.current?.close();
      storeRef.current = null;
      setStore(null);
      setEngine(null);
      await supabase().auth.signOut({ scope: "local" });
      if (id && opts?.eraseDevice) await eraseDeviceData(id);
    },
    [userId],
  );

  const value = useMemo<AppState>(
    () => ({ ready, session, user: session?.user ?? null, store, engine, storeError, outbox, online, signOut }),
    [ready, session, store, engine, storeError, outbox, online, signOut],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
