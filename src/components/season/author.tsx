"use client";

import { useId, useMemo, useState } from "react";
import { createAuthorFact, deleteAuthorFact, updateAuthor, updateAuthorFact } from "@/lib/data";
import { formatOriginalYear } from "@/lib/format";
import { sanitizeHtml } from "@/lib/sanitize";
import type { AuthorFact, FactKind, Verification } from "@/lib/types";
import { BackIcon } from "../icons";
import { RichEditor, RichText } from "../rich-editor";
import { ConfirmSheet, Field, Sheet } from "../ui";
import { useSeason } from "./context";
import { ExternalLinks } from "./external-links";

const VERIFICATION: Record<Verification, { label: string; chip: string }> = {
  verified: { label: "Verified", chip: "chip chip-green" },
  uncertain: { label: "Uncertain", chip: "chip chip-gold" },
  unverified: { label: "Not yet verified", chip: "chip" },
};

/**
 * A modest author profile. The reader's own introduction is kept apart from
 * sourced biographical notes; nothing here is generated, and notes without a
 * source are visibly marked.
 */
export function AuthorPortrait() {
  const { b, go, act } = useSeason();
  const a = b.author;
  const [editingIntro, setEditingIntro] = useState(false);
  const [intro, setIntro] = useState(a.intro_notes_html ?? "");
  const [editingBasics, setEditingBasics] = useState(false);
  const [factOpen, setFactOpen] = useState<AuthorFact | "new" | null>(null);
  const [removeFact, setRemoveFact] = useState<string | null>(null);
  const ids = { name: useId(), dates: useId(), portrait: useId() };
  const [basics, setBasics] = useState({ name: a.name, life_dates: a.life_dates ?? "", portrait_url: a.portrait_url ?? "" });

  const timeline = useMemo(() => {
    type Item = { year: number; label: string; kind: "work" | "event"; approx?: boolean; id: string };
    const items: Item[] = [];
    for (const w of b.works) if (w.original_year != null && !w.archived_at) items.push({ year: w.original_year, label: w.title, kind: "work", approx: w.original_year_approximate, id: w.id });
    for (const f of b.authorFacts) if (f.year != null) items.push({ year: f.year, label: f.body, kind: "event", id: f.id });
    return items.sort((x, y) => x.year - y.year || (x.kind === "event" ? -1 : 1));
  }, [b.works, b.authorFacts]);
  const undated = b.works.filter((w) => w.original_year == null && !w.archived_at);

  return (
    <div className="stack" style={{ ["--gap" as string]: "1.5rem" }}>
      <button type="button" className="btn btn-quiet btn-sm" style={{ justifySelf: "start", marginLeft: "-0.5rem" }} onClick={() => go({ view: null })}>
        <BackIcon /> Works
      </button>

      <header className="row" style={{ alignItems: "flex-start", ["--gap" as string]: "1.25rem" }}>
        {a.portrait_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.portrait_url} alt={`Portrait of ${a.name}`} referrerPolicy="no-referrer" style={{ width: 120, height: 150, objectFit: "cover", borderRadius: 8, boxShadow: "var(--shadow)" }} />
        )}
        <div className="grow">
          <p className="eyebrow">Author</p>
          <h2 style={{ margin: 0 }}>{a.name}</h2>
          {a.life_dates && <p className="muted" style={{ margin: 0 }}>{a.life_dates}</p>}
          <button type="button" className="link-button small" onClick={() => setEditingBasics(true)}>
            Edit name, dates and portrait
          </button>
        </div>
      </header>

      <div className="split">
        <div className="stack" style={{ ["--gap" as string]: "1.5rem" }}>
          <section className="card stack" aria-labelledby="intro-h">
            <div className="row row-between">
              <div>
                <h3 id="intro-h" style={{ margin: 0 }}>
                  My introduction
                </h3>
                <p className="small muted" style={{ margin: 0 }}>
                  My words: impressions, reasons, how I came to this author.
                </p>
              </div>
              {!editingIntro && (
                <button type="button" className="btn btn-sm" onClick={() => setEditingIntro(true)}>
                  {a.intro_notes_html ? "Edit" : "Write"}
                </button>
              )}
            </div>
            {editingIntro ? (
              <>
                <RichEditor value={intro} onChange={setIntro} label="My introduction to this author" minHeight={160} autoFocus />
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-quiet" onClick={() => setEditingIntro(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={async () => {
                      const ok = await act(() => updateAuthor(a.id, { intro_notes_html: sanitizeHtml(intro) || null }), "Saved to account.");
                      if (ok) setEditingIntro(false);
                    }}
                  >
                    Save
                  </button>
                </div>
              </>
            ) : a.intro_notes_html ? (
              <RichText html={a.intro_notes_html} />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Nothing written yet.
              </p>
            )}
          </section>

          <section className="stack" aria-labelledby="facts-h">
            <div className="section-head">
              <h3 id="facts-h">Biographical notes and events</h3>
              <button type="button" className="btn btn-sm" onClick={() => setFactOpen("new")}>
                Add a note
              </button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Facts you’ve gathered, each with its source. Kept apart from your own interpretation.
            </p>
            {b.authorFacts.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ul className="list">
                {b.authorFacts.map((f) => (
                  <li key={f.id} className="list-item">
                    <div className="grow stack" style={{ ["--gap" as string]: "0.25rem" }}>
                      <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
                        {(f.date_text || f.year != null) && <span className="timeline-year">{f.date_text || f.year}</span>}
                        <span className={VERIFICATION[f.verification].chip}>{VERIFICATION[f.verification].label}</span>
                      </div>
                      <p style={{ margin: 0 }}>{f.body}</p>
                      {f.source_citation || f.source_url ? (
                        <p className="small muted" style={{ margin: 0 }}>
                          Source: {f.source_citation}
                          {f.source_url && (
                            <>
                              {f.source_citation ? " · " : ""}
                              <a href={f.source_url} target="_blank" rel="noopener noreferrer">
                                link
                              </a>
                            </>
                          )}
                        </p>
                      ) : (
                        <p className="small" style={{ margin: 0, color: "var(--danger)" }}>
                          No source recorded
                        </p>
                      )}
                    </div>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFactOpen(f)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRemoveFact(f.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="stack" style={{ ["--gap" as string]: "0.4rem" }}>
            <h3 style={{ margin: 0 }}>Elsewhere</h3>
            <ExternalLinks target={{ author_id: a.id }} links={b.externalLinks.filter((l) => l.author_id === a.id)} />
          </section>
        </div>

        <section className="card" aria-labelledby="timeline-h">
          <h3 id="timeline-h">Publication timeline</h3>
          <p className="small muted">From the original dates you’ve recorded for each work, alongside dated events.</p>
          {timeline.length === 0 ? (
            <p className="muted">Add original publication years to works to see them here.</p>
          ) : (
            <ol className="timeline" style={{ marginTop: "1rem" }}>
              {timeline.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <span className="timeline-year">
                    {item.approx ? "c. " : ""}
                    {item.year < 0 ? `${-item.year} BC` : item.year}
                  </span>{" "}
                  {item.kind === "work" ? (
                    <button type="button" className="link-button serif" onClick={() => go({ view: null, work: item.id })}>
                      <em>{item.label}</em>
                    </button>
                  ) : (
                    <span className="small">{item.label}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {undated.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p className="eyebrow">Original date unknown</p>
              <ul className="list small">
                {undated.map((w) => (
                  <li key={w.id} className="list-item" style={{ padding: "0.35rem 0" }}>
                    <em>{w.title}</em>
                    <span className="muted">{formatOriginalYear(w)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <Sheet open={editingBasics} onClose={() => setEditingBasics(false)} title="Author details">
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (basics.portrait_url.trim() && !/^https?:\/\//i.test(basics.portrait_url.trim())) return;
            const ok = await act(
              () => updateAuthor(a.id, { name: basics.name.trim() || a.name, life_dates: basics.life_dates.trim() || null, portrait_url: basics.portrait_url.trim() || null }),
              "Saved.",
            );
            if (ok) setEditingBasics(false);
          }}
        >
          <Field label="Name" htmlFor={ids.name}>
            <input id={ids.name} className="input" value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} />
          </Field>
          <Field label="Life dates (optional)" htmlFor={ids.dates} hint="As you’d like them shown, e.g. “1898–1963”.">
            <input id={ids.dates} className="input" value={basics.life_dates} onChange={(e) => setBasics({ ...basics, life_dates: e.target.value })} />
          </Field>
          <Field label="Portrait image link (optional)" htmlFor={ids.portrait}>
            <input id={ids.portrait} className="input" type="url" value={basics.portrait_url} onChange={(e) => setBasics({ ...basics, portrait_url: e.target.value })} />
          </Field>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </Sheet>

      <FactSheet fact={factOpen} onClose={() => setFactOpen(null)} />
      <ConfirmSheet
        open={Boolean(removeFact)}
        onClose={() => setRemoveFact(null)}
        title="Remove this note?"
        danger
        confirmLabel="Remove"
        body={<p>This biographical note will be deleted.</p>}
        onConfirm={async () => {
          if (removeFact) await act(() => deleteAuthorFact(removeFact), "Removed.");
        }}
      />
    </div>
  );
}

function FactSheet({ fact, onClose }: { fact: AuthorFact | "new" | null; onClose: () => void }) {
  const { b, act } = useSeason();
  const existing = fact && fact !== "new" ? fact : null;
  const [v, setV] = useState({ kind: "event" as FactKind, year: "", date_text: "", body: "", source_citation: "", source_url: "", verification: "unverified" as Verification });
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const [openFor, setOpenFor] = useState<AuthorFact | "new" | null>(null);
  if (fact !== openFor) {
    setOpenFor(fact);
    setError(null);
    setV(
      existing
        ? {
            kind: existing.kind,
            year: existing.year?.toString() ?? "",
            date_text: existing.date_text ?? "",
            body: existing.body,
            source_citation: existing.source_citation ?? "",
            source_url: existing.source_url ?? "",
            verification: existing.verification,
          }
        : { kind: "event", year: "", date_text: "", body: "", source_citation: "", source_url: "", verification: "unverified" },
    );
  }

  return (
    <Sheet open={Boolean(fact)} onClose={onClose} title={existing ? "Edit note" : "Add a biographical note"}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!v.body.trim()) return setError("Write the note itself.");
          if (v.year.trim() && !/^-?\d{1,4}$/.test(v.year.trim())) return setError("Use a year such as 1931, or leave it blank.");
          if (v.source_url.trim() && !/^https?:\/\//i.test(v.source_url.trim())) return setError("Source links must start with https://");
          const row = {
            kind: v.kind,
            year: v.year.trim() ? Number(v.year) : null,
            date_text: v.date_text.trim() || null,
            body: v.body.trim(),
            source_citation: v.source_citation.trim() || null,
            source_url: v.source_url.trim() || null,
            verification: v.verification,
          };
          const ok = await act(() => (existing ? updateAuthorFact(existing.id, row) : createAuthorFact({ ...row, author_id: b.author.id })), "Saved.");
          if (ok) onClose();
        }}
      >
        <div className="segmented" role="radiogroup" aria-label="Kind">
          {(["event", "biography"] as FactKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={v.kind === k} onClick={() => setV({ ...v, kind: k })}>
              {k === "event" ? "Event" : "Biographical note"}
            </button>
          ))}
        </div>
        <div className="grid-2">
          <Field label="Year (for the timeline)" htmlFor={`${uid}-y`}>
            <input id={`${uid}-y`} className="input" inputMode="numeric" value={v.year} onChange={(e) => setV({ ...v, year: e.target.value })} />
          </Field>
          <Field label="Date as written (optional)" htmlFor={`${uid}-d`} hint="e.g. “summer 1931”">
            <input id={`${uid}-d`} className="input" value={v.date_text} onChange={(e) => setV({ ...v, date_text: e.target.value })} />
          </Field>
        </div>
        <Field label="Note" htmlFor={`${uid}-b`}>
          <textarea id={`${uid}-b`} className="textarea" rows={3} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        </Field>
        <Field label="Source" htmlFor={`${uid}-s`} hint="Book, page, article or archive this comes from.">
          <input id={`${uid}-s`} className="input" value={v.source_citation} onChange={(e) => setV({ ...v, source_citation: e.target.value })} />
        </Field>
        <Field label="Source link (optional)" htmlFor={`${uid}-u`}>
          <input id={`${uid}-u`} className="input" type="url" value={v.source_url} onChange={(e) => setV({ ...v, source_url: e.target.value })} />
        </Field>
        <Field label="How sure is this?" htmlFor={`${uid}-v`}>
          <select id={`${uid}-v`} className="select" value={v.verification} onChange={(e) => setV({ ...v, verification: e.target.value as Verification })}>
            {(Object.keys(VERIFICATION) as Verification[]).map((k) => (
              <option key={k} value={k}>
                {VERIFICATION[k].label}
              </option>
            ))}
          </select>
        </Field>
        {error && <p className="field-error">{error}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary">
            Save note
          </button>
        </div>
      </form>
    </Sheet>
  );
}
