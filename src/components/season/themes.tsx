"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createTheme, deleteTheme, listThemesForSeasons, updateTheme } from "@/lib/data";
import { formatOriginalYear, formatTimestamp, htmlToText, plural, truncate } from "@/lib/format";
import { QUESTION_STATUS } from "@/lib/labels";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Entry, QuestionStatus, Theme } from "@/lib/types";
import { BackIcon } from "../icons";
import { RichEditor, RichText } from "../rich-editor";
import { ConfirmSheet, EmptyState, useToast } from "../ui";
import { useSeason } from "./context";
import { EntrySummary } from "./entry-card";

export function ThemesView() {
  const { b, go, act } = useSeason();
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const uid = useId();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const et of b.entryThemes) m.set(et.theme_id, (m.get(et.theme_id) ?? 0) + 1);
    return m;
  }, [b.entryThemes]);
  const themes = b.themes.filter((t) => (showArchived ? t.archived_at : !t.archived_at));

  return (
    <div className="stack">
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (b.themes.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) return;
          const created = await act(() => createTheme({ apprenticeship_id: b.season.id, name: name.trim() }));
          if (created) {
            setName("");
            go({ theme: created.id });
          }
        }}
      >
        <label htmlFor={`${uid}-n`} className="visually-hidden">
          New theme
        </label>
        <input id={`${uid}-n`} className="input grow" style={{ maxWidth: 360 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name a theme, e.g. Joy, Desire, Myth" />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          Add theme
        </button>
      </form>
      {themes.length === 0 ? (
        <EmptyState title={showArchived ? "No archived themes" : "No themes yet"}>
          <p>Themes gather what keeps returning across works. Name one when you notice it, then attach notes to it.</p>
        </EmptyState>
      ) : (
        <div className="grid-2">
          {themes.map((t) => (
            <button key={t.id} type="button" className="card list-button" style={{ display: "block", textAlign: "left" }} onClick={() => go({ theme: t.id })}>
              <span className="serif" style={{ fontSize: "1.25rem", display: "block" }}>
                {t.name}
              </span>
              <span className="small muted" style={{ display: "block" }}>
                {plural(counts.get(t.id) ?? 0, "note")}
                {t.keep_for_guide && " · kept for guide"}
              </span>
              {t.description_html && (
                <span className="small" style={{ display: "block", marginTop: "0.4rem" }}>
                  {truncate(htmlToText(t.description_html), 140)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <label className="checkbox small">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived themes
      </label>
    </div>
  );
}

export function ThemePage({ themeId }: { themeId: string }) {
  const { b, entries, go, act, themeById, workById, themesForEntry, nav } = useSeason();
  const toast = useToast();
  const theme = themeById.get(themeId);
  const [order, setOrder] = useState<"reading" | "publication">("reading");
  const [editing, setEditing] = useState<"description" | "synthesis" | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [earlierThemes, setEarlierThemes] = useState<Theme[] | null>(null);

  useEffect(() => {
    if (!b.siblingSeasons.length) return;
    listThemesForSeasons(b.siblingSeasons.map((s) => s.id))
      .then(setEarlierThemes)
      .catch(() => setEarlierThemes([]));
  }, [b.siblingSeasons]);

  const related = useMemo(() => entries.filter((e) => !e.archived_at && themesForEntry(e.id).includes(themeId)), [entries, themesForEntry, themeId]);
  const sorted = useMemo(() => {
    if (order === "reading") return [...related].sort((a, c) => a.captured_at.localeCompare(c.captured_at));
    const year = (e: Entry) => (e.work_id ? workById.get(e.work_id)?.original_year ?? null : null);
    return [...related].sort((a, c) => {
      const ya = year(a);
      const yc = year(c);
      if (ya == null && yc == null) return a.captured_at.localeCompare(c.captured_at);
      if (ya == null) return 1;
      if (yc == null) return -1;
      return ya - yc || a.captured_at.localeCompare(c.captured_at);
    });
  }, [related, order, workById]);
  const questions = related.filter((e) => e.kind === "question" && e.question_status !== "resolved");
  const selectedEntry = nav.entry ? entries.find((e) => e.id === nav.entry) : null;

  if (!theme) {
    return (
      <p className="muted">
        This theme isn’t here anymore.{" "}
        <button type="button" className="link-button" onClick={() => go({ theme: null })}>
          Back to themes
        </button>
      </p>
    );
  }

  const continues = theme.continues_theme_id ? earlierThemes?.find((t) => t.id === theme.continues_theme_id) : null;
  const seasonTitle = (id: string) => b.siblingSeasons.find((s) => s.id === id)?.title ?? "an earlier season";

  async function saveText(field: "description_html" | "synthesis_html") {
    const ok = await act(() => updateTheme(theme!.id, { [field]: sanitizeHtml(draft) || null }), "Saved to account.");
    if (ok) setEditing(null);
  }

  const block = (field: "description" | "synthesis", title: string, hint: string, html: string | null) => (
    <section className="card stack" style={{ ["--gap" as string]: "0.6rem" }}>
      <div className="row row-between">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {hint}
          </p>
        </div>
        {editing !== field && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setDraft(html ?? "");
              setEditing(field);
            }}
          >
            {html ? "Edit" : "Write"}
          </button>
        )}
      </div>
      {editing === field ? (
        <>
          <RichEditor value={draft} onChange={setDraft} label={title} minHeight={140} autoFocus />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => saveText(field === "description" ? "description_html" : "synthesis_html")}>
              Save
            </button>
          </div>
        </>
      ) : html ? (
        <RichText html={html} />
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Nothing written yet.
        </p>
      )}
    </section>
  );

  return (
    <div className="stack" style={{ ["--gap" as string]: "1.25rem" }}>
      <button type="button" className="btn btn-quiet btn-sm" style={{ justifySelf: "start", marginLeft: "-0.5rem" }} onClick={() => go({ theme: null, entry: null })}>
        <BackIcon /> Themes
      </button>
      <header className="row row-between">
        <div>
          <p className="eyebrow">Theme</p>
          <h2 style={{ margin: 0 }}>{theme.name}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {plural(related.length, "note")} across {plural(new Set(related.map((e) => e.work_id).filter(Boolean)).size, "work")}
          </p>
        </div>
        <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={theme.keep_for_guide}
            onClick={() => act(() => updateTheme(theme.id, { keep_for_guide: !theme.keep_for_guide }), theme.keep_for_guide ? "Removed from your guide." : "Kept for your reader’s guide.")}
          >
            {theme.keep_for_guide ? "Kept for guide ✓" : "Keep for my reader’s guide"}
          </button>
        </div>
      </header>

      {(continues || (earlierThemes && earlierThemes.length > 0)) && (
        <section className="card-quiet small">
          {continues ? (
            <p style={{ margin: 0 }}>
              Continues <strong>{continues.name}</strong> from <em>{seasonTitle(continues.apprenticeship_id)}</em>.{" "}
              <a href={`/season?id=${continues.apprenticeship_id}&tab=notebook&view=themes&theme=${continues.id}`}>Open that theme</a> (it stays as you left it).{" "}
              <button type="button" className="link-button" onClick={() => act(() => updateTheme(theme.id, { continues_theme_id: null }))}>
                Unlink
              </button>
            </p>
          ) : (
            <label className="row" style={{ ["--gap" as string]: "0.5rem" }}>
              <span>Continue a theme from an earlier season:</span>
              <select
                className="select"
                style={{ width: "auto" }}
                value=""
                onChange={(e) => e.target.value && act(() => updateTheme(theme.id, { continues_theme_id: e.target.value }), "Linked to the earlier theme.")}
              >
                <option value="">Choose…</option>
                {earlierThemes!.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {seasonTitle(t.apprenticeship_id)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}

      <div className="split split-sticky">
        <div className="stack" style={{ ["--gap" as string]: "1.25rem" }}>
          {block("description", "My description", "What I mean by this theme.", theme.description_html)}
          {questions.length > 0 && (
            <section className="card-quiet">
              <p className="eyebrow">Open questions here</p>
              <ul className="list">
                {questions.map((q) => (
                  <li key={q.id}>
                    <EntrySummary entry={q} onOpen={() => go({ entry: q.id })} selected={nav.entry === q.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {block("synthesis", "My synthesis", "What I’m coming to think. Revise as often as you like; it can stay unfinished.", theme.synthesis_html)}
          <details className="disclosure">
            <summary className="small muted">Archive or delete</summary>
            <div className="row" style={{ marginTop: "0.6rem" }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => act(() => updateTheme(theme.id, { archived_at: theme.archived_at ? null : new Date().toISOString() }), theme.archived_at ? "Restored." : "Archived.")}
              >
                {theme.archived_at ? "Restore theme" : "Archive theme"}
              </button>
              <button type="button" className="btn btn-sm btn-quiet" style={{ color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>
                Delete permanently…
              </button>
            </div>
          </details>
        </div>

        <section className="stack" aria-labelledby="related-h">
          <div className="row row-between">
            <h3 id="related-h" style={{ margin: 0 }}>
              Related passages and notes
            </h3>
            <div className="segmented" role="radiogroup" aria-label="Order">
              <button type="button" role="radio" aria-checked={order === "reading"} onClick={() => setOrder("reading")}>
                Reading order
              </button>
              <button type="button" role="radio" aria-checked={order === "publication"} onClick={() => setOrder("publication")}>
                Publication order
              </button>
            </div>
          </div>
          {selectedEntry ? (
            <div className="card stack">
              <button type="button" className="btn btn-quiet btn-sm" style={{ justifySelf: "start" }} onClick={() => go({ entry: null })}>
                <BackIcon /> All related notes
              </button>
              <EntrySummary entry={selectedEntry} onOpen={() => go({ view: null, theme: null, entry: selectedEntry.id })} />
              <button type="button" className="link-button small" style={{ justifySelf: "start" }} onClick={() => go({ view: null, theme: null, entry: selectedEntry.id })}>
                Open in the notebook to edit or connect
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <p className="muted">No notes carry this theme yet. Add it from any note’s Themes.</p>
          ) : (
            <ol className="list" style={{ listStyle: "none" }}>
              {sorted.map((e, i) => {
                const work = e.work_id ? workById.get(e.work_id) : null;
                const prev = sorted[i - 1];
                const prevWork = prev?.work_id ? workById.get(prev.work_id) : null;
                const header =
                  order === "publication"
                    ? work?.id !== prevWork?.id || i === 0
                      ? work
                        ? `${work.title} · ${formatOriginalYear(work)}`
                        : "Not tied to a work"
                      : null
                    : null;
                return (
                  <li key={e.id}>
                    {header && <p className="eyebrow" style={{ marginTop: i ? "1rem" : 0 }}>{header}</p>}
                    <EntrySummary entry={e} onOpen={() => go({ entry: e.id })} />
                    {order === "reading" && <span className="small faint" style={{ paddingLeft: "0.6rem" }}>{formatTimestamp(e.captured_at)}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${theme.name}” permanently?`}
        danger
        requireText="delete"
        confirmLabel="Delete theme"
        body={<p>Your notes stay; they simply lose this theme. Your description and synthesis are deleted. Archiving keeps everything.</p>}
        onConfirm={async () => {
          await act(() => deleteTheme(theme.id), "Theme deleted.");
          go({ theme: null });
          toast("Theme deleted.");
        }}
      />
    </div>
  );
}

export function QuestionsView() {
  const { entries, go, b, workById } = useSeason();
  const questions = entries.filter((e) => e.kind === "question" && !e.archived_at);
  const groups: QuestionStatus[] = ["open", "developing", "resolved"];
  if (!questions.length) {
    return (
      <EmptyState title="No questions yet">
        <p>Questions can stay open for a long time. Capture one when it arises; carry it into other works and see how it develops.</p>
      </EmptyState>
    );
  }
  return (
    <div className="stack" style={{ ["--gap" as string]: "1.5rem" }}>
      {groups.map((g) => {
        const list = questions.filter((q) => (q.question_status ?? "open") === g);
        if (!list.length) return null;
        return (
          <section key={g} aria-labelledby={`q-${g}`}>
            <div className="section-head">
              <h3 id={`q-${g}`}>{QUESTION_STATUS[g].label}</h3>
              <span className="small muted">{QUESTION_STATUS[g].hint}</span>
            </div>
            <ul className="list">
              {list.map((q) => {
                const carried = b.carries.filter((c) => c.question_entry_id === q.id && c.work_id).map((c) => workById.get(c.work_id!)?.title).filter(Boolean);
                const responses = b.links.filter((l) => l.to_entry_id === q.id).length;
                return (
                  <li key={q.id}>
                    <EntrySummary entry={q} onOpen={() => go({ view: null, entry: q.id })} />
                    {(carried.length > 0 || responses > 0) && (
                      <p className="small muted" style={{ margin: "0 0 0.5rem 0.6rem" }}>
                        {carried.length > 0 && <>Carried into {carried.map((t) => `“${t}”`).join(", ")}. </>}
                        {responses > 0 && plural(responses, "later observation")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
