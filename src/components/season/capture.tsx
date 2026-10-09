"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createTheme } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";
import { ENTRY_KINDS } from "@/lib/labels";
import { currentSessions } from "@/lib/route";
import { isBlankHtml } from "@/lib/sanitize";
import { describeError } from "@/lib/supabase";
import type { EntryKind, EntryWrite } from "@/lib/types";
import { useApp } from "../providers";
import { RichEditor } from "../rich-editor";
import { SaveBadge, Sheet, useToast } from "../ui";
import { useSeason } from "./context";

interface CaptureDraft {
  kind: EntryKind;
  body: string;
  quote: string;
  locator: string;
  workId: string;
}

const EMPTY: CaptureDraft = { kind: "reflection", body: "", quote: "", locator: "", workId: "" };

function isEmptyDraft(d: CaptureDraft) {
  return isBlankHtml(d.body) && !d.quote.trim() && !d.locator.trim();
}

/** Keeps a draft on this device as it is typed, and offers it back after a reload. */
export function useDeviceDraft<T>(key: string, initial: T) {
  const { store } = useApp();
  const [value, setValue] = useState<T>(initial);
  const [recoveredAt, setRecoveredAt] = useState<string | null>(null);
  const [keptAt, setKeptAt] = useState<string | null>(null);
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loaded.current = false;
    if (!store) {
      loaded.current = true;
      return;
    }
    let cancelled = false;
    store
      .getDraft(key)
      .then((rec) => {
        if (cancelled) return;
        if (rec) {
          setValue(rec.value as T);
          setRecoveredAt(rec.updatedAt);
        }
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [store, key]);

  const update = useCallback(
    (next: T | ((cur: T) => T)) => {
      setValue((cur) => {
        const resolved = typeof next === "function" ? (next as (c: T) => T)(cur) : next;
        if (store && loaded.current) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            store
              .putDraft(key, resolved)
              .then((rec) => setKeptAt(rec.updatedAt))
              .catch(() => setKeptAt(null));
          }, 350);
        }
        return resolved;
      });
    },
    [store, key],
  );

  const clear = useCallback(
    async (reset: T) => {
      if (timer.current) clearTimeout(timer.current);
      setValue(reset);
      setRecoveredAt(null);
      setKeptAt(null);
      if (store) await store.deleteDraft(key).catch(() => {});
    },
    [store, key],
  );

  // Flush pending writes when leaving the page.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { value, update, clear, recoveredAt, keptAt, canKeep: Boolean(store) };
}

export function QuickCapture({
  compact,
  onSaved,
  autoFocus,
  draftSlot = "desk",
}: {
  compact?: boolean;
  onSaved?: (id: string) => void;
  autoFocus?: boolean;
  /** Separate surfaces keep separate drafts so they never overwrite each other. */
  draftSlot?: string;
}) {
  const { b, capture, saveState, workById, go } = useSeason();
  const toast = useToast();
  const draft = useDeviceDraft<CaptureDraft>(`capture:${b.season.id}:${draftSlot}`, EMPTY);
  const d = draft.value;
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { quote: useId(), locator: useId(), work: useId(), kind: useId() };

  const current = useMemo(() => currentSessions(b.sessions), [b.sessions]);
  const defaultWork = current[0]?.work_id ?? "";
  const workId = d.workId || defaultWork;
  const seasonWorks = useMemo(
    () => b.seasonWorks.map((sw) => workById.get(sw.work_id)).filter((w): w is NonNullable<typeof w> => Boolean(w)).sort((a, c) => a.title.localeCompare(c.title)),
    [b.seasonWorks, workById],
  );

  const canSave = d.kind === "quotation" ? d.quote.trim().length > 0 : !isBlankHtml(d.body);

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = current.find((s) => s.work_id === workId);
      const payload: Partial<EntryWrite> = {
        kind: d.kind,
        body_html: isBlankHtml(d.body) ? null : d.body,
        quote_text: d.kind === "quotation" ? d.quote.trim() : null,
        quote_locator: d.locator.trim() || null,
        work_id: workId || null,
        session_id: session?.id ?? null,
        edition_id: session?.edition_id ?? null,
        question_status: d.kind === "question" ? "open" : null,
        provenance: "mine",
      };
      const result = await capture(payload);
      // Only now is the note durably stored, so the draft can go.
      await draft.clear({ ...EMPTY, kind: d.kind, workId: d.workId });
      setSavedId(result.id);
      onSaved?.(result.id);
    } catch (e) {
      setError(`Not saved: ${describeError(e)} Your text is still here.`);
      toast("That note wasn’t saved. Your text is still in the box.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const liveState = savedId ? saveState(savedId) : null;

  return (
    <form
      className="stack"
      style={{ ["--gap" as string]: "0.85rem" }}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="segmented" role="radiogroup" aria-label="Kind of note" id={ids.kind}>
        {(Object.keys(ENTRY_KINDS) as EntryKind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={d.kind === k}
            onClick={() => draft.update((cur) => ({ ...cur, kind: k }))}
          >
            {ENTRY_KINDS[k].label}
          </button>
        ))}
      </div>

      {draft.recoveredAt && !isEmptyDraft(d) && (
        <p className="notice notice-warm small row row-between" role="status" style={{ margin: 0 }}>
          <span>Recovered your unsaved draft from {formatTimestamp(draft.recoveredAt)}.</span>
          <button type="button" className="link-button" onClick={() => void draft.clear(EMPTY)}>
            Discard it
          </button>
        </p>
      )}

      {d.kind === "quotation" && (
        <div className="field">
          <label htmlFor={ids.quote}>The author’s words</label>
          <textarea
            id={ids.quote}
            className="textarea textarea-quote"
            rows={compact ? 3 : 4}
            value={d.quote}
            autoFocus={autoFocus}
            onChange={(e) => draft.update((cur) => ({ ...cur, quote: e.target.value }))}
            placeholder="Copy the passage exactly as written"
          />
        </div>
      )}

      <div className="field">
        <span className="field-label" id={`${ids.kind}-mine`}>
          {d.kind === "quotation" ? "My note (optional)" : d.kind === "question" ? "My question" : "My words"}
        </span>
        <RichEditor
          value={d.body}
          onChange={(html) => draft.update((cur) => ({ ...cur, body: html }))}
          label={d.kind === "quotation" ? "My note on this passage" : ENTRY_KINDS[d.kind].label}
          placeholder={
            d.kind === "question"
              ? "What are you asking?"
              : d.kind === "observation"
                ? "What did you notice?"
                : d.kind === "quotation"
                  ? "Why this passage?"
                  : "What are you thinking?"
          }
          minHeight={compact ? 90 : 130}
          autoFocus={autoFocus && d.kind !== "quotation"}
        />
      </div>

      <details className="disclosure">
        <summary className="small muted">
          {workId && workById.get(workId) ? (
            <>
              About <em>{workById.get(workId)!.title}</em>
              {d.locator && ` · ${d.locator}`}
            </>
          ) : (
            "Work and location"
          )}
        </summary>
        <div className="grid-2" style={{ marginTop: "0.75rem" }}>
          <div className="field">
            <label htmlFor={ids.work}>Work</label>
            <select id={ids.work} className="select" value={workId} onChange={(e) => draft.update((cur) => ({ ...cur, workId: e.target.value }))}>
              <option value="">No particular work</option>
              {seasonWorks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids.locator}>Where (optional)</label>
            <input
              id={ids.locator}
              className="input"
              value={d.locator}
              onChange={(e) => draft.update((cur) => ({ ...cur, locator: e.target.value }))}
              placeholder="p. 42, ch. 3, 1:12:05…"
            />
          </div>
        </div>
      </details>

      {error && (
        <p className="notice notice-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      <div className="row row-between">
        <div className="small muted">
          {liveState ? (
            <span className="row" style={{ ["--gap" as string]: "0.5rem" }}>
              <SaveBadge state={liveState} />
              <button type="button" className="link-button small" onClick={() => go({ tab: "notebook", entry: savedId })}>
                Add themes or details
              </button>
            </span>
          ) : draft.keptAt && !isEmptyDraft(d) ? (
            <span>Draft kept on this device</span>
          ) : !draft.canKeep ? (
            <span>Drafts can’t be kept in this browser</span>
          ) : null}
        </div>
        <button type="submit" className="btn btn-primary" disabled={!canSave || busy} aria-keyshortcuts="Control+Enter Meta+Enter">
          {busy ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
}

export function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Capture a thought" description="Save it now; add themes and details whenever you like.">
      <QuickCapture autoFocus draftSlot="sheet" />
    </Sheet>
  );
}

/** Choose themes for an entry, creating a new one inline if needed. */
export function ThemePicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { b, act } = useSeason();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const themes = b.themes.filter((t) => !t.archived_at);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = themes.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (!selected.includes(existing.id)) onChange([...selected, existing.id]);
      setName("");
      return;
    }
    setBusy(true);
    const created = await act(() => createTheme({ apprenticeship_id: b.season.id, name: trimmed }));
    setBusy(false);
    if (created) {
      onChange([...selected, created.id]);
      setName("");
    }
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "0.5rem" }}>
      {themes.length > 0 && (
        <div className="row" style={{ ["--gap" as string]: "0.4rem" }} role="group" aria-label="Themes">
          {themes.map((t) => (
            <button key={t.id} type="button" className="chip" aria-pressed={selected.includes(t.id)} onClick={() => toggle(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
        <label htmlFor={inputId} className="visually-hidden">
          New theme
        </label>
        <input
          id={inputId}
          className="input grow"
          style={{ maxWidth: 260 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New theme…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
        />
        <button type="button" className="btn btn-sm" onClick={() => void add()} disabled={!name.trim() || busy}>
          Add theme
        </button>
      </div>
    </div>
  );
}
