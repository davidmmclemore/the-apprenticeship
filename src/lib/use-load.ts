"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import { describeError } from "./supabase";

export interface LoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Set when showing this device's last saved copy because the account couldn't be reached. */
  offlineCopyFrom: string | null;
  reload: () => Promise<void>;
  setData: (update: (current: T) => T) => void;
}

/**
 * Load data from the account; remember the last good copy on this device
 * (per account) so the page can still be read offline, clearly labelled.
 */
export function useLoad<T>(cacheKey: string | null, loader: () => Promise<T>): LoadState<T> {
  const { store } = useApp();
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineCopyFrom, setOfflineCopyFrom] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; });
  const generation = useRef(0);
  const current = useRef<{ data: T | null; loadedAt: string | null }>({ data: null, loadedAt: null });

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Offline");
      const result = await loaderRef.current();
      if (gen !== generation.current) return;
      current.current = { data: result, loadedAt: new Date().toISOString() };
      setDataState(result);
      setError(null);
      setOfflineCopyFrom(null);
      if (store && cacheKey) void store.putCache(cacheKey, result).catch(() => {});
    } catch (e) {
      if (gen !== generation.current) return;
      if (current.current.data != null) {
        // Keep what is already on screen rather than swapping in an older copy.
        setOfflineCopyFrom(current.current.loadedAt);
        return;
      }
      const cached = store && cacheKey ? await store.getCache(cacheKey).catch(() => undefined) : undefined;
      if (cached) {
        setDataState(cached.data as T);
        setOfflineCopyFrom(cached.savedAt);
        setError(null);
      } else {
        setError(describeError(e));
      }
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [store, cacheKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Start the account load when its key or store changes.
    void reload();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- This is a request counter, not a DOM ref; invalidate the latest pending request.
      generation.current++;
    };
  }, [reload]);

  const setData = useCallback((update: (value: T) => T) => {
    setDataState((value) => {
      if (value == null) return value;
      const next = update(value);
      current.current = { ...current.current, data: next };
      return next;
    });
  }, []);

  return { data, error, loading, offlineCopyFrom, reload, setData };
}
