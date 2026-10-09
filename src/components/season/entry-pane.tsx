"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  createCarry,
  createEntryLink,
  deleteCarry,
  deleteEntry,
  deleteEntryLink,
  listEntriesForSeasons,
  listEntryVersions,
  setEntryThemes,
} from "@/lib/data";
import { formatTimestamp, htmlToText, truncate } from "@/lib/format";
import { ENTRY_KINDS, LINK_RELATIONS, PROVENANCE, QUESTION_STATUS } from "@/lib/labels";
import { isBlankHtml } from "@/lib/sanitize";
import { describeError } from "@/lib/supabase";
import type { Entry, EntryKind, EntryVersion, EntryWrite, LinkRelation, Provenance, QuestionStatus } from "@/lib/types";
import { useApp } from "../providers";
import { BackIcon } from "../icons";
import { RichEditor, RichText } from "../rich-editor";
import { ConfirmSheet, Field, SaveBadge, useToast } from "../ui";
import { ThemePicker, useDeviceDraft } from "./capture";
import { useSeason } from "./context";
import { EntryBody, QuoteBlock } from "./entry-card";
import { editionLabel } from "./sessions";

export function EntryPane({ entry }: { entry: Entry }) {
  const { go, saveState, outboxItem, themesForEntry, themeById, workById, act, b } = useSeason();
  const { engine } = useApp();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const state = saveState(entry.id);
  const item = outboxItem(entry.id);
  const themes = themesForEntry(entry.id).map((id) => themeById.get(id)).filter(Boolean);
  const work = entry.work_id ? workById.get(entry.work_id) : null;
  const localOnly = item?.op === "create";

  useEffect(() => setEditing(false), [entry.id]);

  return (
    <article className="card stack" aria-label={`${ENTRY_KINDS[entry.kind].label}`} style={{ ["--gap" as string]: "1.1rem" }}>
      <div className="row row-between">
        <button type="button" className="btn btn-quiet btn-sm show-below-split" style={{ marginLeft: "-0.5rem" }} onClick={() => go({ entry: null })}>
          <BackIcon /> Notebook
        </button>
        <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
          <span className="chip">{ENTRY_KINDS[entry.kind].label}</span>
          <SaveBadge state={state} detail={item?.lastError} />
        </div>
      </div>

      {item?.status === "conflict" && <ConflictPanel entry={entry} />}
      {item?.status === "failed" && (
        <div className="notice notice-error row row-between" role="alert">
          <span>Couldn’t save to your account: {item.lastError}. It’s still kept on this device.</span>
          <button type="button" className="btn btn-sm" onClick={() => engine?.retry(entry.id)}>
            Try again
          </button>
        </div>
      )}

      {editing ? (
        <EntryEditor entry={entry} onDone={() => setEditing(false)} />
      ) : (
        <>
          <EntryBody entry={entry} />
          <div className="small muted">
            {formatTimestamp(entry.captured_at)}
            {work && (
              <>
                {" · "}
                <button type="button" className="link-button" onClick={() => go({ tab: "works", work: work.id })}>
                  {work.title}
                </button>
              </>
            )}
            {entry.session_id && b.sessions.find((s) => s.id === entry.session_id) && ` · reading ${b.sessions.find((s) => s.id === entry.session_id)!.ordinal}`}
            {entry.edition_id && b.editions.find((e) => e.id === entry.edition_id) && ` · ${editionLabel(b.editions.find((e) => e.id === entry.edition_id)!)}`}
          </div>
          {themes.length > 0 && (
            <div className="row" style={{ ["--gap" as string]: "0.35rem" }}>
              {themes.map((t) => (
                <button key={t!.id} type="button" className="chip chip-green" onClick={() => go({ theme: t!.id, entry: null, view: "themes" })}>
                  {t!.name}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(true)} disabled={item?.status === "conflict"}>
              Edit
            </button>
            {!localOnly && (
              <QuickToggles entry={entry} />
            )}
          </div>
        </>
      )}

      {entry.kind === "question" && !localOnly && <QuestionTools entry={entry} />}
      {!localOnly ? (
        <Connections entry={entry} />
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Connections and question tools become available once this note reaches your account.
        </p>
      )}
      {!localOnly && <EarlierWording entry={entry} />}

      <details className="disclosure">
        <summary className="small muted">Archive or delete</summary>
        <div className="row" style={{ marginTop: "0.6rem" }}>
          {!localOnly && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => act(() => saveArchive(entry), entry.archived_at ? "Restored." : "Archived. You can restore it from the notebook filters.")}
            >
              {entry.archived_at ? "Restore" : "Archive"}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-quiet" style={{ color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>
            Delete permanently…
          </button>
        </div>
      </details>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this note permanently?"
        danger
        requireText="delete"
        confirmLabel="Delete permanently"
        body={<p>This removes the note, its earlier wording and its connections. Archiving keeps it out of the way without losing it.</p>}
        onConfirm={async () => {
          if (localOnly) await engine?.discard(entry.id);
          else await act(() => deleteEntry(entry.id), "Deleted.");
          go({ entry: null });
        }}
      />
    </article>
  );

  function saveArchive(e: Entry) {
    return engine
      ? engine.enqueueUpdate(e, { archived_at: e.archived_at ? null : new Date().toISOString() }).then(() => engine.sync())
      : Promise.reject(new Error("Unavailable"));
  }
}

function QuickToggles({ entry }: { entry: Entry }) {
  const { saveEntry } = useSeason();
  const toast = useToast();
  const toggle = async (patch: Partial<EntryWrite>, msg: string) => {
    try {
      await saveEntry(entry, patch);
      toast(msg);
    } catch (e) {
      toast(describeError(e), { tone: "error" });
    }
  };
  return (
    <>
      <button type="button" className="btn btn-sm" aria-pressed={entry.keep_for_guide} onClick={() => toggle({ keep_for_guide: !entry.keep_for_guide }, entry.keep_for_guide ? "No longer kept for the guide." : "Kept for your reader’s guide.")}>
        {entry.keep_for_guide ? "Kept for guide ✓" : "Keep for my reader’s guide"}
      </button>
      <button type="button" className="btn btn-sm btn-quiet" aria-pressed={entry.favorite} onClick={() => toggle({ favorite: !entry.favorite }, entry.favorite ? "Unmarked." : "Marked as a favorite.")}>
        {entry.favorite ? "★ Favorite" : "☆ Favorite"}
      </button>
    </>
  );
}

interface EditDraft {
  kind: EntryKind;
  title: string;
  body: string;
  quote: string;
  locator: string;
  source: string;
  workId: string;
  sessionId: string;
  editionId: string;
  questionStatus: QuestionStatus;
  provenance: Provenance;
  provenanceNote: string;
  themes: string[];
}

function EntryEditor({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const { b, saveEntry, themesForEntry, workById } = useSeason();
  const toast = useToast();
  const currentThemes = themesForEntry(entry.id);
  const initial: EditDraft = useMemo(
    () => ({
      kind: entry.kind,
      title: entry.title ?? "",
      body: entry.body_html ?? "",
      quote: entry.quote_text ?? "",
      locator: entry.quote_locator ?? "",
      source: entry.quote_source ?? "",
      workId: entry.work_id ?? "",
      sessionId: entry.session_id ?? "",
      editionId: entry.edition_id ?? "",
      questionStatus: entry.question_status ?? "open",
      provenance: entry.provenance,
      provenanceNote: entry.provenance_note ?? "",
      themes: currentThemes,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry.id],
  );
  const draft = useDeviceDraft<EditDraft>(`edit:${entry.id}`, initial);
  const d = draft.value;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const set = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => draft.update((cur) => ({ ...cur, [k]: v }));

  const sessions = b.sessions.filter((s) => s.work_id === d.workId);
  const editions = b.editions.filter((e) => e.work_id === d.workId);
  const works = b.seasonWorks.map((sw) => workById.get(sw.work_id)).filter((w): w is NonNullable<typeof w> => Boolean(w));

  async function save() {
    if (d.kind === "quotation" && !d.quote.trim()) return setError("A quotation needs the author’s words.");
    if (d.kind !== "quotation" && isBlankHtml(d.body) && !d.title.trim()) return setError("Write something, or add a title.");
    setBusy(true);
    setError(null);
    try {
      const patch: Partial<EntryWrite> = {
        kind: d.kind,
        title: d.title.trim() || null,
        body_html: isBlankHtml(d.body) ? null : d.body,
        quote_text: d.kind === "quotation" ? d.quote.trim() : d.quote.trim() || null,
        quote_locator: d.locator.trim() || null,
        quote_source: d.source.trim() || null,
        work_id: d.workId || null,
        session_id: d.sessionId || null,
        edition_id: d.editionId || null,
        question_status: d.kind === "question" ? d.questionStatus : null,
        provenance: d.provenance,
        provenance_note: d.provenanceNote.trim() || null,
      };
      const added = d.themes.filter((t) => !currentThemes.includes(t));
      const removed = currentThemes.filter((t) => !d.themes.includes(t));
      await saveEntry(entry, patch, added);
      if (removed.length) await setEntryThemes(entry.id, b.season.id, d.themes, currentThemes);
      await draft.clear(initial);
      onDone();
    } catch (e) {
      setError(`Not saved: ${describeError(e)}`);
      toast("Your edit wasn’t saved. It’s still in the form.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {draft.recoveredAt && (
        <p className="notice notice-warm small row row-between" style={{ margin: 0 }}>
          <span>Recovered an unsaved edit from {formatTimestamp(draft.recoveredAt)}.</span>
          <button type="button" className="link-button" onClick={() => void draft.clear(initial)}>
            Discard it
          </button>
        </p>
      )}
      <div className="segmented" role="radiogroup" aria-label="Kind of note">
        {(Object.keys(ENTRY_KINDS) as EntryKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={d.kind === k} onClick={() => set("kind", k)}>
            {ENTRY_KINDS[k].label}
          </button>
        ))}
      </div>
      <Field label="Title (optional)" htmlFor={id("title")}>
        <input id={id("title")} className="input" value={d.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      {(d.kind === "quotation" || d.quote) && (
        <fieldset>
          <legend>The author’s words</legend>
          <div className="stack">
            <Field label="Quotation" htmlFor={id("quote")}>
              <textarea id={id("quote")} className="textarea textarea-quote" rows={4} value={d.quote} onChange={(e) => set("quote", e.target.value)} />
            </Field>
            <div className="grid-2">
              <Field label="Location" htmlFor={id("loc")} hint="Page, chapter, timestamp…">
                <input id={id("loc")} className="input" value={d.locator} onChange={(e) => set("locator", e.target.value)} />
              </Field>
              <Field label="Source details" htmlFor={id("src")} hint="Anything else needed to find it again.">
                <input id={id("src")} className="input" value={d.source} onChange={(e) => set("source", e.target.value)} />
              </Field>
            </div>
          </div>
        </fieldset>
      )}
      <div className="field">
        <span className="field-label">{d.kind === "quotation" ? "My note" : "My words"}</span>
        <RichEditor value={d.body} onChange={(html) => set("body", html)} label={d.kind === "quotation" ? "My note on this passage" : "My words"} minHeight={140} />
      </div>
      {d.kind === "question" && (
        <div className="field">
          <span className="field-label">Where this question stands</span>
          <div className="segmented" role="radiogroup" aria-label="Question status">
            {(Object.keys(QUESTION_STATUS) as QuestionStatus[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={d.questionStatus === s} onClick={() => set("questionStatus", s)}>
                {QUESTION_STATUS[s].label}
              </button>
            ))}
          </div>
          <div className="field-hint">Earlier wording is kept whenever you change it. Questions don’t need to be resolved.</div>
        </div>
      )}
      <div className="grid-2">
        <Field label="Work" htmlFor={id("work")}>
          <select id={id("work")} className="select" value={d.workId} onChange={(e) => draft.update((cur) => ({ ...cur, workId: e.target.value, sessionId: "", editionId: "" }))}>
            <option value="">No particular work</option>
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </Field>
        {sessions.length > 0 && (
          <Field label="Reading" htmlFor={id("session")}>
            <select id={id("session")} className="select" value={d.sessionId} onChange={(e) => set("sessionId", e.target.value)}>
              <option value="">Not tied to a reading</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ordinal > 1 ? `Reading ${s.ordinal}` : "First reading"}
                  {s.started_on ? ` (from ${s.started_on})` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        {editions.length > 0 && (
          <Field label="Edition" htmlFor={id("edition")}>
            <select id={id("edition")} className="select" value={d.editionId} onChange={(e) => set("editionId", e.target.value)}>
              <option value="">Not specified</option>
              {editions.map((ed) => (
                <option key={ed.id} value={ed.id}>
                  {editionLabel(ed)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div className="field">
        <span className="field-label">Themes</span>
        <ThemePicker selected={d.themes} onChange={(t) => set("themes", t)} />
      </div>
      <details className="disclosure">
        <summary className="small muted">Where this came from: {PROVENANCE[d.provenance]}</summary>
        <div className="grid-2" style={{ marginTop: "0.6rem" }}>
          <Field label="Origin" htmlFor={id("prov")}>
            <select id={id("prov")} className="select" value={d.provenance} onChange={(e) => set("provenance", e.target.value as Provenance)}>
              {(Object.keys(PROVENANCE) as Provenance[]).map((p) => (
                <option key={p} value={p}>
                  {PROVENANCE[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Origin note" htmlFor={id("provnote")} hint="e.g. where it was imported from.">
            <input id={id("provnote")} className="input" value={d.provenanceNote} onChange={(e) => set("provenanceNote", e.target.value)} />
          </Field>
        </div>
      </details>
      {error && (
        <p className="notice notice-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div className="row row-between">
        <span className="small muted">{draft.keptAt ? "Edit kept on this device until saved" : ""}</span>
        <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={async () => {
              await draft.clear(initial);
              onDone();
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ConflictPanel({ entry }: { entry: Entry }) {
  const { outboxItem } = useSeason();
  const { engine } = useApp();
  const item = outboxItem(entry.id);
  const server = item?.serverVersion;
  const [busy, setBusy] = useState(false);
  if (!item || !engine) return null;
  const resolve = async (choice: "mine" | "theirs" | "both") => {
    setBusy(true);
    await engine.resolveConflict(entry.id, choice);
    setBusy(false);
  };
  const mine = { ...(server ?? entry), ...(item.payload as Partial<Entry>) } as Entry;
  return (
    <section className="notice notice-warm stack" role="alert" aria-labelledby="conflict-h">
      <h3 id="conflict-h" style={{ margin: 0 }}>
        This note changed somewhere else
      </h3>
      <p className="small" style={{ margin: 0 }}>
        {server
          ? "Your account has a newer version than the one you edited here. Nothing has been overwritten — choose what to keep."
          : "This note no longer exists on your account (it may have been deleted elsewhere). Your edit is safe on this device."}
      </p>
      <div className="grid-2">
        <div className="card">
          <p className="eyebrow">My edit on this device</p>
          {mine.quote_text && <QuoteBlock entry={mine} clamp={400} />}
          <RichText html={mine.body_html} />
        </div>
        {server && (
          <div className="card">
            <p className="eyebrow">On my account · {formatTimestamp(server.updated_at)}</p>
            {server.quote_text && <QuoteBlock entry={server} clamp={400} />}
            <RichText html={server.body_html} />
          </div>
        )}
      </div>
      <div className="row">
        {server && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => resolve("mine")}>
            Keep my edit
          </button>
        )}
        {server && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => resolve("theirs")}>
            Keep the account’s version
          </button>
        )}
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => resolve(server ? "both" : "mine")}>
          {server ? "Keep both (save mine as a new note)" : "Save my edit as a new note"}
        </button>
      </div>
      {server && (
        <p className="small muted" style={{ margin: 0 }}>
          Whichever you choose, the version replaced is still kept in this note’s earlier wording.
        </p>
      )}
    </section>
  );
}

function QuestionTools({ entry }: { entry: Entry }) {
  const { b, workById, act, saveEntry, entries, go } = useSeason();
  const toast = useToast();
  const [workId, setWorkId] = useState("");
  const uid = useId();
  const carries = b.carries.filter((c) => c.question_entry_id === entry.id);
  const responses = b.links.filter((l) => l.to_entry_id === entry.id).map((l) => ({ link: l, from: entries.find((e) => e.id === l.from_entry_id) }));
  const works = b.seasonWorks.map((sw) => workById.get(sw.work_id)).filter((w): w is NonNullable<typeof w> => Boolean(w) && !carries.some((c) => c.work_id === w!.id));

  return (
    <section className="card-quiet stack" style={{ ["--gap" as string]: "0.75rem" }} aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} style={{ margin: 0 }}>
        A traveling question
      </h3>
      <div className="segmented" role="radiogroup" aria-label="Question status">
        {(Object.keys(QUESTION_STATUS) as QuestionStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={entry.question_status === s}
            title={QUESTION_STATUS[s].hint}
            onClick={async () => {
              if (entry.question_status === s) return;
              try {
                await saveEntry(entry, { question_status: s });
              } catch (e) {
                toast(describeError(e), { tone: "error" });
              }
            }}
          >
            {QUESTION_STATUS[s].label}
          </button>
        ))}
      </div>
      <div>
        <p className="small" style={{ margin: "0 0 0.4rem" }}>
          Carried into:
          {carries.length === 0 && <span className="muted"> not yet</span>}
        </p>
        {carries.length > 0 && (
          <ul className="list small">
            {carries.map((c) => (
              <li key={c.id} className="list-item" style={{ padding: "0.35rem 0" }}>
                <span className="grow">
                  {c.work_id ? <em>{workById.get(c.work_id)?.title ?? "A work"}</em> : "This season"}
                  {c.apprenticeship_id !== b.season.id && <span className="muted"> (another season)</span>}
                </span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => act(() => deleteCarry(c.id))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
          <label className="visually-hidden" htmlFor={`${uid}-w`}>
            Carry this question into a work
          </label>
          <select id={`${uid}-w`} className="select grow" style={{ maxWidth: 320 }} value={workId} onChange={(e) => setWorkId(e.target.value)}>
            <option value="">Carry it into another work…</option>
            {works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!workId}
            onClick={async () => {
              const ok = await act(() => createCarry({ question_entry_id: entry.id, apprenticeship_id: b.season.id, work_id: workId }), "This question will travel with you into that work.");
              if (ok) setWorkId("");
            }}
          >
            Carry
          </button>
        </div>
      </div>
      {responses.length > 0 && (
        <div>
          <p className="small" style={{ margin: "0 0 0.4rem" }}>
            Later observations:
          </p>
          <ul className="list small">
            {responses.map(({ link, from }) => (
              <li key={link.id} className="list-item" style={{ padding: "0.35rem 0" }}>
                <span className="chip chip-outline">{LINK_RELATIONS[link.relation].label}</span>
                {from ? (
                  <button type="button" className="link-button" style={{ textAlign: "left" }} onClick={() => go({ entry: from.id })}>
                    {truncate(from.title || from.quote_text || htmlToText(from.body_html), 120)}
                  </button>
                ) : (
                  <span className="muted">An entry from another season</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        To attach a later observation, open it and connect it to this question.
      </p>
    </section>
  );
}

function Connections({ entry }: { entry: Entry }) {
  const { b, entries, act, go } = useSeason();
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState("");
  const [relation, setRelation] = useState<LinkRelation>("related");
  const [note, setNote] = useState("");
  const [earlier, setEarlier] = useState<Entry[] | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const uid = useId();
  const all = useMemo(() => [...entries, ...(earlier ?? [])], [entries, earlier]);
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);
  const outgoing = b.links.filter((l) => l.from_entry_id === entry.id);
  const incoming = b.links.filter((l) => l.to_entry_id === entry.id);
  const label = (e: Entry | undefined) => (e ? truncate(e.title || e.quote_text || htmlToText(e.body_html) || ENTRY_KINDS[e.kind].label, 110) : "An entry not loaded here");
  const candidates = all.filter((e) => e.id !== entry.id && !e.archived_at && e.revision > 0);

  return (
    <section className="stack" style={{ ["--gap" as string]: "0.6rem" }} aria-labelledby={`${uid}-h`}>
      <div className="row row-between">
        <h3 id={`${uid}-h`} style={{ margin: 0 }}>
          Connections
        </h3>
        {!adding && (
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
            Connect to another note
          </button>
        )}
      </div>
      {outgoing.length + incoming.length === 0 && !adding && <p className="small muted" style={{ margin: 0 }}>No connections yet.</p>}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <ul className="list small">
          {outgoing.map((l) => (
            <li key={l.id} className="list-item" style={{ padding: "0.45rem 0" }}>
              <span className="grow">
                This <strong>{LINK_RELATIONS[l.relation].phrase}</strong>{" "}
                <button type="button" className="link-button" style={{ textAlign: "left" }} onClick={() => byId.get(l.to_entry_id) && go({ entry: l.to_entry_id })}>
                  {label(byId.get(l.to_entry_id))}
                </button>
                {l.note && <span className="muted"> — {l.note}</span>}
              </span>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => act(() => deleteEntryLink(l.id))}>
                Remove
              </button>
            </li>
          ))}
          {incoming.map((l) => (
            <li key={l.id} className="list-item" style={{ padding: "0.45rem 0" }}>
              <span className="grow">
                <button type="button" className="link-button" style={{ textAlign: "left" }} onClick={() => byId.get(l.from_entry_id) && go({ entry: l.from_entry_id })}>
                  {label(byId.get(l.from_entry_id))}
                </button>{" "}
                <strong>{LINK_RELATIONS[l.relation].phrase}</strong> this
                {l.note && <span className="muted"> — {l.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form
          className="card-quiet stack"
          style={{ ["--gap" as string]: "0.6rem" }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!target) return;
            const ok = await act(() => createEntryLink({ from_entry_id: entry.id, to_entry_id: target, relation, note: note.trim() || null }), "Connected.");
            if (ok) {
              setAdding(false);
              setTarget("");
              setNote("");
            }
          }}
        >
          <div className="grid-2">
            <Field label="This note…" htmlFor={`${uid}-rel`}>
              <select id={`${uid}-rel`} className="select" value={relation} onChange={(e) => setRelation(e.target.value as LinkRelation)}>
                {(Object.keys(LINK_RELATIONS) as LinkRelation[]).map((r) => (
                  <option key={r} value={r}>
                    {LINK_RELATIONS[r].phrase}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="…which note" htmlFor={`${uid}-to`}>
              <select id={`${uid}-to`} className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.apprenticeship_id !== b.season.id ? "[earlier season] " : ""}
                    {ENTRY_KINDS[c.kind].label}: {label(c)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Note on the connection (optional)" htmlFor={`${uid}-n`}>
            <input id={`${uid}-n`} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="row row-between">
            {b.siblingSeasons.length > 0 && !earlier ? (
              <button
                type="button"
                className="link-button small"
                disabled={loadingEarlier}
                onClick={async () => {
                  setLoadingEarlier(true);
                  try {
                    setEarlier(await listEntriesForSeasons(b.siblingSeasons.map((s) => s.id)));
                  } catch {
                    setEarlier([]);
                  }
                  setLoadingEarlier(false);
                }}
              >
                {loadingEarlier ? "Loading…" : "Include notes from earlier seasons"}
              </button>
            ) : (
              <span />
            )}
            <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={!target}>
                Connect
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

function EarlierWording({ entry }: { entry: Entry }) {
  const [versions, setVersions] = useState<EntryVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details
      className="disclosure"
      onToggle={async (e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open || versions) return;
        try {
          setVersions(await listEntryVersions(entry.id));
        } catch (err) {
          setError(describeError(err));
        }
      }}
    >
      <summary className="small muted">Earlier wording{entry.revision > 1 ? ` (${entry.revision - 1} ${entry.revision === 2 ? "change" : "changes"})` : ""}</summary>
      <div className="stack" style={{ marginTop: "0.6rem" }}>
        {error && <p className="field-error">{error}</p>}
        {versions && versions.length === 0 && <p className="small muted">This note hasn’t been reworded.</p>}
        {versions?.map((v) => (
          <div key={v.id} className="card-quiet">
            <p className="eyebrow">
              Version {v.revision} · replaced {formatTimestamp(v.recorded_at)}
              {v.question_status && ` · ${QUESTION_STATUS[v.question_status].label}`}
            </p>
            {v.title && <p className="serif" style={{ fontWeight: 500 }}>{v.title}</p>}
            {v.quote_text && <blockquote className="quote">{v.quote_text}</blockquote>}
            <RichText html={v.body_html} />
          </div>
        ))}
      </div>
    </details>
  );
}
