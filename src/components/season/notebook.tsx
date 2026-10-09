"use client";

import { useEffect, useMemo, useState } from "react";
import { searchSeason } from "@/lib/data";
import { htmlToText, truncate } from "@/lib/format";
import { ENTRY_KINDS } from "@/lib/labels";
import type { EntryKind, SearchResult } from "@/lib/types";
import { SearchIcon } from "../icons";
import { EmptyState } from "../ui";
import { useSeason } from "./context";
import { EntrySummary } from "./entry-card";
import { EntryPane } from "./entry-pane";
import { QuestionsView, ThemePage, ThemesView } from "./themes";

export { EntryProvenance } from "./entry-card";

type KindFilter = EntryKind | "all";

export function NotebookTab() {
  const { nav, go, entries, b } = useSeason();
  const view = nav.view === "themes" || nav.theme ? "themes" : nav.view === "questions" ? "questions" : "entries";

  return (
    <div className="stack" style={{ ["--gap" as string]: "1rem" }}>
      <div className="row row-between">
        <h2 style={{ margin: 0 }}>Notebook</h2>
        <div className="segmented" role="tablist" aria-label="Notebook views">
          {(
            [
              ["entries", `Entries${entries.length ? ` (${entries.filter((e) => !e.archived_at).length})` : ""}`],
              ["themes", `Themes${b.themes.length ? ` (${b.themes.filter((t) => !t.archived_at).length})` : ""}`],
              ["questions", "Questions"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => go({ view: v === "entries" ? null : v, theme: null, entry: null })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === "entries" && <EntriesView />}
      {view === "themes" && (nav.theme ? <ThemePage themeId={nav.theme} /> : <ThemesView />)}
      {view === "questions" && <QuestionsView />}
    </div>
  );
}

function EntriesView() {
  const { b, nav, go, entries, workById, themesForEntry } = useSeason();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [themeId, setThemeId] = useState("");
  const [kept, setKept] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchOffline, setSearchOffline] = useState(false);
  const workFilter = nav.work ?? "";

  // Server-side search (titles, notes, questions, themes, works, inheritance).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset local state when the external session or dialog changes.
      setResults(null);
      setSearchOffline(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchSeason(b.season.id, q);
        if (!cancelled) {
          setResults(r);
          setSearchOffline(false);
        }
      } catch {
        if (!cancelled) {
          setResults(null);
          setSearchOffline(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, b.season.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedIds = results ? new Set(results.filter((r) => r.result_type === "entry").map((r) => r.id)) : null;
    return entries.filter((e) => {
      if (!showArchived && e.archived_at) return false;
      if (showArchived && !e.archived_at) return false;
      if (kind !== "all" && e.kind !== kind) return false;
      if (workFilter && e.work_id !== workFilter) return false;
      if (themeId && !themesForEntry(e.id).includes(themeId)) return false;
      if (kept && !e.keep_for_guide) return false;
      if (q.length >= 2) {
        if (matchedIds && e.revision > 0) return matchedIds.has(e.id);
        // Offline, or a note not yet on the account: search what's here.
        const hay = `${e.title ?? ""} ${e.quote_text ?? ""} ${htmlToText(e.body_html)} ${e.quote_source ?? ""}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [entries, kind, workFilter, themeId, kept, showArchived, query, results, themesForEntry]);

  const otherResults = (results ?? []).filter((r) => r.result_type !== "entry");
  const selected = nav.entry ? entries.find((e) => e.id === nav.entry) : null;
  const works = b.seasonWorks.map((sw) => workById.get(sw.work_id)).filter((w): w is NonNullable<typeof w> => Boolean(w)).sort((a, c) => a.title.localeCompare(c.title));
  const anyFilter = kind !== "all" || workFilter || themeId || kept || showArchived || query.trim();

  const list = (
    <div className="stack" style={{ ["--gap" as string]: "0.85rem" }}>
      <div className="field">
        <label htmlFor="notebook-search" className="visually-hidden">
          Search the notebook
        </label>
        <div style={{ position: "relative" }}>
          <SearchIcon style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }} />
          <input
            id="notebook-search"
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, quotations, questions, themes…"
            style={{ paddingLeft: 40 }}
          />
        </div>
        {searching && <span className="field-hint">Searching…</span>}
        {searchOffline && <span className="field-hint">Searching only what’s loaded on this device.</span>}
      </div>

      <div className="row" style={{ ["--gap" as string]: "0.35rem" }} role="group" aria-label="Kind">
        <button type="button" className="chip" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
          All
        </button>
        {(Object.keys(ENTRY_KINDS) as EntryKind[]).map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {ENTRY_KINDS[k].plural}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="nb-work" className="small">
            Work
          </label>
          <select id="nb-work" className="select" value={workFilter} onChange={(e) => go({ work: e.target.value || null, entry: null }, { replace: true })}>
            <option value="">All works</option>
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nb-theme" className="small">
            Theme
          </label>
          <select id="nb-theme" className="select" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            <option value="">All themes</option>
            {b.themes
              .filter((t) => !t.archived_at)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="row small" style={{ ["--gap" as string]: "1rem" }}>
        <label className="checkbox">
          <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} /> Kept for my guide
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived
        </label>
      </div>

      {otherResults.length > 0 && (
        <section className="card-quiet" aria-label="Other matches">
          <p className="eyebrow">Also matching</p>
          <ul className="list small">
            {otherResults.slice(0, 8).map((r) => (
              <li key={`${r.result_type}-${r.id}`} className="list-item" style={{ padding: "0.4rem 0" }}>
                <span className="chip">{r.result_type === "theme" ? "Theme" : r.result_type === "work" ? "Work" : "Inheritance"}</span>
                <button
                  type="button"
                  className="link-button"
                  style={{ textAlign: "left" }}
                  onClick={() =>
                    r.result_type === "theme"
                      ? go({ view: "themes", theme: r.id, entry: null })
                      : r.result_type === "work"
                        ? go({ tab: "works", work: r.id })
                        : go({ tab: "inheritance" })
                  }
                >
                  {r.title}
                </button>
                {r.snippet && <span className="muted">{truncate(r.snippet, 80)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length === 0 ? (
        <EmptyState title="The notebook is open">
          <p>Quotations, reflections, questions and observations gather here as you read. Capture one whenever something strikes you.</p>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <p className="muted">
          Nothing matches.{" "}
          {anyFilter && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setQuery("");
                setKind("all");
                setThemeId("");
                setKept(false);
                setShowArchived(false);
                go({ work: null }, { replace: true });
              }}
            >
              Clear filters
            </button>
          )}
        </p>
      ) : (
        <ul className="list" aria-label="Entries">
          {filtered.map((e) => (
            <li key={e.id}>
              <EntrySummary entry={e} selected={e.id === nav.entry} onOpen={() => go({ entry: e.id })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="split split-sticky">
      <div className={selected ? "hide-on-mobile-when-detail" : undefined}>{list}</div>
      {selected ? (
        <EntryPane entry={selected} />
      ) : (
        <div className="card-quiet hide-below-split">
          <p className="muted" style={{ margin: 0 }}>
            Choose an entry to read it in full, edit it, or connect it to others.
          </p>
        </div>
      )}
    </div>
  );
}
