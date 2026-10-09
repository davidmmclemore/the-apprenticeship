"use client";

import { useMemo, useState } from "react";
import {
  addCollectionMember,
  addWorkToSeason,
  deleteEdition,
  deleteWork,
  removeCollectionMember,
  removeWorkFromSeason,
  updateSeasonWork,
  updateWork,
} from "@/lib/data";
import { formatDay, formatOriginalYear, formatPosition, plural } from "@/lib/format";
import { SCOPES, SESSION_STATUS, WORK_TYPES } from "@/lib/labels";
import { finishedWorkIds, scopeProgress } from "@/lib/route";
import type { ApprenticeshipWork, ScopeLevel, Work } from "@/lib/types";
import { Cover } from "../cover";
import { BackIcon, PlusIcon, StarIcon } from "../icons";
import { ConfirmSheet, EmptyState } from "../ui";
import { AuthorPortrait } from "./author";
import { useSeason } from "./context";
import { ExternalLinks } from "./external-links";
import { ImportView } from "./import-view";
import { editionLabel, StartReadingSheet } from "./sessions";
import { EditionFormSheet, WorkFormSheet } from "./work-forms";

type Filter = "season" | ScopeLevel | "unselected";

export function WorksTab() {
  const { b, nav, go, workById } = useSeason();
  const [filter, setFilter] = useState<Filter>("season");
  const [adding, setAdding] = useState(false);

  const seasonWork = useMemo(() => new Map(b.seasonWorks.map((sw) => [sw.work_id, sw])), [b.seasonWorks]);
  const finished = useMemo(() => finishedWorkIds(b.sessions), [b.sessions]);
  const reading = useMemo(() => new Set(b.sessions.filter((s) => s.status === "reading").map((s) => s.work_id)), [b.sessions]);
  const progress = useMemo(() => scopeProgress(b.seasonWorks, b.sessions), [b.seasonWorks, b.sessions]);

  const list = useMemo(() => {
    const works = b.works.filter((w) => !w.archived_at);
    const filtered = works.filter((w) => {
      const sw = seasonWork.get(w.id);
      if (filter === "unselected") return !sw;
      if (filter === "season") return Boolean(sw);
      return sw?.scope === filter;
    });
    return filtered.sort((a, c) => (a.original_year ?? 99999) - (c.original_year ?? 99999) || a.title.localeCompare(c.title));
  }, [b.works, seasonWork, filter]);

  if (nav.view === "author") return <AuthorPortrait />;
  if (nav.view === "import") return <ImportView />;

  const selected = nav.work ? workById.get(nav.work) : null;
  const unselectedCount = b.works.filter((w) => !w.archived_at && !seasonWork.has(w.id)).length;
  const archivedWorks = b.works.filter((w) => w.archived_at);
  const welcome = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome");

  const listPane = (
    <div className="stack" style={{ ["--gap" as string]: "1rem" }}>
      {welcome && b.seasonWorks.length === 0 && (
        <p className="notice" role="status">
          Your season is ready. Start by adding the works you mean to read — manually, or by importing a list.
        </p>
      )}
      <div className="row row-between">
        <div>
          <h2 style={{ margin: 0 }}>Body of work</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {progress.essential.total + progress.optional.total > 0
              ? `${progress.essential.total} essential · ${progress.optional.total} optional · ${progress.outside} outside current scope`
              : "Choose what belongs to this season."}
          </p>
        </div>
        <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <PlusIcon /> Add a work
          </button>
          <button type="button" className="btn btn-sm" onClick={() => go({ view: "import" })}>
            Import
          </button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => go({ view: "author" })}>
            About {b.author.name}
          </button>
        </div>
      </div>

      <div className="row" role="group" aria-label="Show" style={{ ["--gap" as string]: "0.35rem" }}>
        {(
          [
            ["season", "This season"],
            ["essential", "Essential"],
            ["optional", "Optional"],
            ["outside", "Outside scope"],
            ["unselected", `Not in this season${unselectedCount ? ` (${unselectedCount})` : ""}`],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        filter === "season" ? (
          <EmptyState
            title="No works chosen yet"
            action={
              <div className="row" style={{ justifyContent: "center" }}>
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  Add a work
                </button>
                <button type="button" className="btn" onClick={() => go({ view: "import" })}>
                  Import a list
                </button>
              </div>
            }
          >
            <p>Books, essays, letters, poems, collections — whatever belongs to this season. Unknown dates and details are fine.</p>
          </EmptyState>
        ) : (
          <p className="muted">Nothing here.</p>
        )
      ) : (
        <ul className="list" aria-label="Works">
          {list.map((w) => {
            const sw = seasonWork.get(w.id);
            return (
              <li key={w.id}>
                <button type="button" className="list-button" aria-current={nav.work === w.id ? "true" : undefined} onClick={() => go({ work: w.id })}>
                  <Cover title={w.title} author={b.author.name} url={w.cover_url} width={44} />
                  <span className="grow">
                    <span className="serif" style={{ display: "block", fontSize: "1.05rem" }}>
                      <em>{w.title}</em>
                      {sw?.favorite && <StarIcon filled width={14} height={14} style={{ marginLeft: 6, color: "var(--gold)", verticalAlign: "-1px" }} />}
                    </span>
                    <span className="small muted">
                      {formatOriginalYear(w)} · {WORK_TYPES[w.work_type]}
                    </span>
                  </span>
                  <span className="stack" style={{ ["--gap" as string]: "0.25rem", textAlign: "right" }}>
                    {sw && <span className={sw.scope === "essential" ? "chip chip-accent" : "chip"}>{SCOPES[sw.scope].label.split(" ")[0]}</span>}
                    {finished.has(w.id) ? <span className="chip chip-green">Finished</span> : reading.has(w.id) ? <span className="chip chip-blue">Reading</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {archivedWorks.length > 0 && (
        <details className="disclosure small">
          <summary className="muted">Archived works ({archivedWorks.length})</summary>
          <ul className="list">
            {archivedWorks.map((w) => (
              <li key={w.id} className="list-item">
                <button type="button" className="link-button" onClick={() => go({ work: w.id })}>
                  {w.title}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <WorkFormSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );

  return (
    <div className="split split-sticky">
      <div className={selected ? "hide-on-mobile-when-detail" : undefined}>{listPane}</div>
      {selected ? (
        <WorkDetail work={selected} seasonWork={seasonWork.get(selected.id)} />
      ) : (
        <div className="card-quiet hide-below-split">
          <p className="muted" style={{ margin: 0 }}>
            Choose a work to see its editions, your readings of it, and the notes attached to it.
          </p>
        </div>
      )}
    </div>
  );
}

function WorkDetail({ work, seasonWork }: { work: Work; seasonWork?: ApprenticeshipWork }) {
  const { b, go, act, entries, workById } = useSeason();
  const [editing, setEditing] = useState(false);
  const [editionOpen, setEditionOpen] = useState<{ id: string | null } | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmEdition, setConfirmEdition] = useState<string | null>(null);
  const [memberPick, setMemberPick] = useState("");

  const editions = b.editions.filter((e) => e.work_id === work.id);
  const sessions = b.sessions.filter((s) => s.work_id === work.id).sort((a, c) => a.ordinal - c.ordinal || a.created_at.localeCompare(c.created_at));
  const notes = entries.filter((e) => e.work_id === work.id && !e.archived_at);
  const inCollections = b.collectionMembers.filter((c) => c.member_work_id === work.id).map((c) => workById.get(c.collection_work_id)).filter(Boolean) as Work[];
  const members = b.collectionMembers.filter((c) => c.collection_work_id === work.id).map((c) => workById.get(c.member_work_id)).filter(Boolean) as Work[];
  const links = b.externalLinks.filter((l) => l.work_id === work.id);
  const isReading = sessions.some((s) => s.status === "reading");
  const hasHistory = sessions.length > 0;

  return (
    <article className="card stack" aria-labelledby="work-title" style={{ ["--gap" as string]: "1.25rem" }}>
      <button type="button" className="btn btn-quiet btn-sm show-below-split" style={{ justifySelf: "start", marginLeft: "-0.5rem" }} onClick={() => go({ work: null })}>
        <BackIcon /> All works
      </button>
      <div className="row" style={{ alignItems: "flex-start", ["--gap" as string]: "1.1rem" }}>
        <Cover title={work.title} author={b.author.name} url={work.cover_url} width={110} />
        <div className="grow stack" style={{ ["--gap" as string]: "0.35rem" }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            {WORK_TYPES[work.work_type]}
            {work.genre && ` · ${work.genre}`}
          </p>
          <h2 id="work-title" style={{ margin: 0 }}>
            <em>{work.title}</em>
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {b.author.name} · first published <strong>{formatOriginalYear(work)}</strong>
            {work.original_year != null && work.year_note && ` (${work.year_note})`}
          </p>
          {work.archived_at && <span className="chip">Archived</span>}
          <div className="row" style={{ ["--gap" as string]: "0.4rem", marginTop: "0.4rem" }}>
            {seasonWork && !work.archived_at && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setStartOpen(true)} disabled={isReading}>
                {isReading ? "Reading now" : hasHistory ? "Begin a reread" : "Start reading"}
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              Edit details
            </button>
            {notes.length > 0 && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => go({ tab: "notebook", work: work.id })}>
                {plural(notes.length, "note")}
              </button>
            )}
          </div>
        </div>
      </div>

      {work.description && <p style={{ margin: 0 }}>{work.description}</p>}

      <section className="stack" style={{ ["--gap" as string]: "0.6rem" }} aria-labelledby="scope-h">
        <h3 id="scope-h" style={{ margin: 0 }}>
          In this season
        </h3>
        {seasonWork ? (
          <>
            <div className="segmented" role="radiogroup" aria-label="Scope">
              {(Object.keys(SCOPES) as ScopeLevel[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={seasonWork.scope === s}
                  onClick={() => seasonWork.scope !== s && act(() => updateSeasonWork(b.season.id, work.id, { scope: s }))}
                >
                  {SCOPES[s].label}
                </button>
              ))}
            </div>
            <InlineText
              label="Why this work belongs to the season"
              value={seasonWork.selection_note}
              onSave={(text) => act(() => updateSeasonWork(b.season.id, work.id, { selection_note: text }))}
            />
            <label className="checkbox">
              <input type="checkbox" checked={seasonWork.favorite} onChange={(e) => act(() => updateSeasonWork(b.season.id, work.id, { favorite: e.target.checked }))} />
              <span>One of my favorites this season</span>
            </label>
            {seasonWork.favorite && (
              <InlineText label="Why it’s a favorite" value={seasonWork.favorite_note} onSave={(text) => act(() => updateSeasonWork(b.season.id, work.id, { favorite_note: text }))} />
            )}
            <label className="checkbox">
              <input type="checkbox" checked={seasonWork.keep_for_guide} onChange={(e) => act(() => updateSeasonWork(b.season.id, work.id, { keep_for_guide: e.target.checked }))} />
              <span>Keep for my reader’s guide</span>
            </label>
          </>
        ) : (
          <div className="row">
            <span className="muted small">Not part of this season.</span>
            <button type="button" className="btn btn-sm" onClick={() => act(() => addWorkToSeason({ apprenticeship_id: b.season.id, work_id: work.id, scope: "optional" }), "Added to this season.")}>
              Add to this season
            </button>
          </div>
        )}
      </section>

      <section className="stack" style={{ ["--gap" as string]: "0.5rem" }} aria-labelledby="readings-h">
        <h3 id="readings-h" style={{ margin: 0 }}>
          My readings
        </h3>
        {sessions.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            Not read in this season yet.
          </p>
        ) : (
          <ol className="timeline">
            {sessions.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.ordinal > 1 ? `Reading ${s.ordinal}` : "First reading"}</strong> · <span className="chip">{SESSION_STATUS[s.status]}</span>
                </div>
                <div className="small muted">
                  {[s.started_on && `began ${formatDay(s.started_on)}`, s.finished_on && `${s.status === "set_aside" ? "set aside" : "finished"} ${formatDay(s.finished_on)}`]
                    .filter(Boolean)
                    .join(" · ") || "No dates recorded"}
                  {s.edition_id && b.editions.find((e) => e.id === s.edition_id) && ` · ${editionLabel(b.editions.find((e) => e.id === s.edition_id)!)}`}
                  {s.position_value && ` · ${formatPosition(s.position_kind, s.position_value)}`}
                </div>
                {s.reflection && <p className="small serif" style={{ margin: "0.25rem 0 0" }}>{s.reflection}</p>}
                <div className="small muted">{plural(entries.filter((e) => e.session_id === s.id).length, "note")} from this reading</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="stack" style={{ ["--gap" as string]: "0.5rem" }} aria-labelledby="editions-h">
        <div className="row row-between">
          <h3 id="editions-h" style={{ margin: 0 }}>
            Editions
          </h3>
          <button type="button" className="btn btn-sm" onClick={() => setEditionOpen({ id: null })}>
            Add edition
          </button>
        </div>
        {editions.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            None recorded. Borrowed, owned, audio or online — any will do, and none is required.
          </p>
        ) : (
          <ul className="list">
            {editions.map((e) => (
              <li key={e.id} className="list-item">
                <div className="grow">
                  <div>{editionLabel(e)}</div>
                  <div className="small muted">
                    {[e.isbn && `ISBN ${e.isbn}`, e.editor && `ed. ${e.editor}`, e.page_count && `${e.page_count} pp.`, e.abridged === true && "abridged", e.abridged === false && "complete"]
                      .filter(Boolean)
                      .join(" · ")}
                    {e.external_url && (
                      <>
                        {" · "}
                        <a href={e.external_url} target="_blank" rel="noopener noreferrer">
                          link
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditionOpen({ id: e.id })}>
                  Edit
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmEdition(e.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" style={{ ["--gap" as string]: "0.5rem" }} aria-labelledby="collections-h">
        <h3 id="collections-h" style={{ margin: 0 }}>
          Collections
        </h3>
        {inCollections.length > 0 && (
          <p className="small" style={{ margin: 0 }}>
            Included in{" "}
            {inCollections.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <button type="button" className="link-button" onClick={() => go({ work: c.id })}>
                  {c.title}
                </button>
              </span>
            ))}
          </p>
        )}
        {(work.work_type === "collection" || members.length > 0) && (
          <>
            {members.length > 0 && (
              <ul className="list">
                {members.map((m) => (
                  <li key={m.id} className="list-item" style={{ padding: "0.4rem 0" }}>
                    <button type="button" className="link-button grow" style={{ textAlign: "left" }} onClick={() => go({ work: m.id })}>
                      {m.title}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => act(() => removeCollectionMember(work.id, m.id))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
              <label className="visually-hidden" htmlFor="member-pick">
                Add a work this collection contains
              </label>
              <select id="member-pick" className="select grow" style={{ maxWidth: 320 }} value={memberPick} onChange={(e) => setMemberPick(e.target.value)}>
                <option value="">Contains another work…</option>
                {b.works
                  .filter((w) => w.id !== work.id && !members.some((m) => m.id === w.id))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!memberPick}
                onClick={async () => {
                  await act(() => addCollectionMember(work.id, memberPick, members.length));
                  setMemberPick("");
                }}
              >
                Add
              </button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Reading a collection doesn’t count as reading each work in it separately; mark the works you read on their own pages.
            </p>
          </>
        )}
        {inCollections.length === 0 && members.length === 0 && work.work_type !== "collection" && (
          <p className="muted small" style={{ margin: 0 }}>
            Not part of any collection you’ve recorded.
          </p>
        )}
      </section>

      {(work.sources || work.verification_note) && (
        <section className="stack" style={{ ["--gap" as string]: "0.35rem" }}>
          <h3 style={{ margin: 0 }}>Sources and certainty</h3>
          {work.sources && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{work.sources}</p>}
          {work.verification_note && <p className="small muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{work.verification_note}</p>}
        </section>
      )}

      <section className="stack" style={{ ["--gap" as string]: "0.35rem" }}>
        <h3 style={{ margin: 0 }}>Elsewhere</h3>
        <ExternalLinks target={{ work_id: work.id }} links={links} />
      </section>

      <details className="disclosure">
        <summary className="small muted">Remove or archive</summary>
        <div className="stack" style={{ marginTop: "0.75rem", ["--gap" as string]: "0.6rem" }}>
          {seasonWork &&
            (hasHistory ? (
              <p className="small muted" style={{ margin: 0 }}>
                This work has reading history in this season, so it can’t be removed from it. Mark it “Outside current scope” instead.
              </p>
            ) : (
              <button type="button" className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => act(() => removeWorkFromSeason(b.season.id, work.id), "Removed from this season.")}>
                Remove from this season
              </button>
            ))}
          <button
            type="button"
            className="btn btn-sm"
            style={{ justifySelf: "start" }}
            onClick={() => act(() => updateWork(work.id, { archived_at: work.archived_at ? null : new Date().toISOString() }), work.archived_at ? "Restored." : "Archived. Restore it any time.")}
          >
            {work.archived_at ? "Restore from archive" : "Archive this work"}
          </button>
          <button type="button" className="btn btn-sm btn-quiet" style={{ justifySelf: "start", color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>
            Delete permanently…
          </button>
        </div>
      </details>

      <WorkFormSheet open={editing} onClose={() => setEditing(false)} work={work} />
      {editionOpen && (
        <EditionFormSheet open onClose={() => setEditionOpen(null)} work={work} edition={editionOpen.id ? editions.find((e) => e.id === editionOpen.id) : null} />
      )}
      <StartReadingSheet work={work} open={startOpen} onClose={() => setStartOpen(false)} />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this work permanently?"
        danger
        confirmLabel="Delete permanently"
        requireText="delete"
        body={
          <p>
            This removes <em>{work.title}</em> and its editions from every season. Works with reading history can’t be deleted — archive them instead.
            Notes attached to it are kept but lose the link. This can’t be undone.
          </p>
        }
        onConfirm={async () => {
          const ok = await act(() => deleteWork(work.id), "Deleted.");
          if (ok !== undefined) go({ work: null });
        }}
      />
      <ConfirmSheet
        open={Boolean(confirmEdition)}
        onClose={() => setConfirmEdition(null)}
        title="Remove this edition?"
        confirmLabel="Remove edition"
        danger
        body={<p>Readings that used this edition keep their history but will no longer name the edition.</p>}
        onConfirm={async () => {
          if (confirmEdition) await act(() => deleteEdition(confirmEdition), "Edition removed.");
        }}
      />
    </article>
  );
}

/** A small "click to edit" text block for short notes. */
export function InlineText({ label, value, onSave, multiline = true }: { label: string; value: string | null; onSave: (text: string | null) => Promise<unknown>; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <div className="small">
        <span className="muted">{label}: </span>
        {value ? <span className="serif">{value}</span> : <span className="faint">—</span>}{" "}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setText(value ?? "");
            setEditing(true);
          }}
          aria-label={`Edit: ${label}`}
        >
          {value ? "Edit" : "Add"}
        </button>
      </div>
    );
  }
  return (
    <form
      className="stack"
      style={{ ["--gap" as string]: "0.4rem" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave(text.trim() || null);
        setBusy(false);
        setEditing(false);
      }}
    >
      <label className="field-label">{label}</label>
      {multiline ? (
        <textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label={label} />
      ) : (
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label={label} />
      )}
      <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          Save
        </button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
