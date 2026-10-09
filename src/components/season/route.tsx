"use client";

import { useId, useMemo, useState } from "react";
import {
  createIntention,
  createSection,
  createSteps,
  deleteIntention,
  deleteSection,
  deleteStep,
  reorderRoute,
  updateIntention,
  updateSection,
  updateStep,
} from "@/lib/data";
import { formatMonth, formatOriginalYear, monthStart } from "@/lib/format";
import { SCOPES } from "@/lib/labels";
import { finishedWorkIds, moveItem, publicationOrder, shiftRemainingTargets } from "@/lib/route";
import type { RouteSection, RouteStep } from "@/lib/types";
import { DownIcon, UpIcon } from "../icons";
import { ConfirmSheet, EmptyState, Field, Sheet, useToast } from "../ui";
import { useSeason } from "./context";

const ORIGIN_LABEL: Record<RouteStep["origin"], string | null> = {
  mine: null,
  publication_order: "Arranged by publication date",
  imported: "Imported order",
};

/** Steps in the order the reader sees them: unsectioned first, then each section in turn. */
function displayOrder(steps: RouteStep[], sections: RouteSection[]): RouteStep[] {
  const byPos = (a: RouteStep, c: RouteStep) => a.position - c.position || a.created_at.localeCompare(c.created_at);
  const sectionIds = new Set(sections.map((s) => s.id));
  const loose = steps.filter((s) => !s.section_id || !sectionIds.has(s.section_id)).sort(byPos);
  const grouped = [...sections].sort((a, c) => a.position - c.position).flatMap((sec) => steps.filter((s) => s.section_id === sec.id).sort(byPos));
  return [...loose, ...grouped];
}

export function RouteTab() {
  const { b, workById, act, go } = useSeason();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState<RouteSection | "new" | null>(null);
  const [removeSection, setRemoveSection] = useState<RouteSection | null>(null);
  const [shiftBy, setShiftBy] = useState(1);
  const [clearOpen, setClearOpen] = useState(false);

  const ordered = useMemo(() => displayOrder(b.steps, b.sections), [b.steps, b.sections]);
  const finished = useMemo(() => finishedWorkIds(b.sessions), [b.sessions]);
  const reading = useMemo(() => new Set(b.sessions.filter((s) => s.status === "reading").map((s) => s.work_id)), [b.sessions]);
  const scopeOf = useMemo(() => new Map(b.seasonWorks.map((sw) => [sw.work_id, sw.scope])), [b.seasonWorks]);
  const notInRoute = b.seasonWorks.filter((sw) => !b.steps.some((s) => s.work_id === sw.work_id));
  const sections = [...b.sections].sort((a, c) => a.position - c.position);
  const hasTargets = b.steps.some((s) => s.target_month);

  async function applyOrder(next: RouteStep[], movedId?: string) {
    await act(async () => {
      await reorderRoute(b.season.id, next.map((s) => s.id));
      if (movedId) {
        const moved = b.steps.find((s) => s.id === movedId);
        if (moved && moved.origin !== "mine") await updateStep(movedId, { origin: "mine" });
      }
    });
  }

  const move = (index: number, to: number) => applyOrder(moveItem(ordered, index, to), ordered[index].id);

  return (
    <div className="split">
      <div className="stack" style={{ ["--gap" as string]: "1.25rem" }}>
        <div className="row row-between">
          <div>
            <h2 style={{ margin: 0 }}>Route</h2>
            <p className="small muted" style={{ margin: 0 }}>
              The order you mean to read in, and why. Change it whenever the season asks.
            </p>
          </div>
          <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={notInRoute.length === 0} onClick={() => setAddOpen(true)}>
              Add works
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSectionOpen("new")}>
              Add section
            </button>
            <button type="button" className="btn btn-sm btn-quiet" disabled={b.seasonWorks.length === 0} onClick={() => setPubOpen(true)}>
              Publication order…
            </button>
          </div>
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            title="No route yet"
            action={
              b.seasonWorks.length ? (
                <div className="row" style={{ justifyContent: "center" }}>
                  <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
                    Add works to the route
                  </button>
                  <button type="button" className="btn" onClick={() => setPubOpen(true)}>
                    Start from publication order
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => go({ tab: "works" })}>
                  Choose works first
                </button>
              )
            }
          >
            <p>A route is optional. It simply helps you see what comes next and remember why.</p>
          </EmptyState>
        ) : (
          <>
            {[null, ...sections].map((section) => {
              const steps = ordered.filter((s) => (section ? s.section_id === section.id : !s.section_id || !sections.some((x) => x.id === s.section_id)));
              if (!section && steps.length === 0) return null;
              return (
                <section key={section?.id ?? "loose"} aria-label={section?.title ?? "Route"}>
                  {section && (
                    <div className="section-head">
                      <div>
                        <h3>{section.title}</h3>
                        {section.description && <p className="small muted" style={{ margin: 0 }}>{section.description}</p>}
                      </div>
                      <div className="row" style={{ ["--gap" as string]: "0.25rem" }}>
                        <SectionMover section={section} sections={sections} />
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSectionOpen(section)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRemoveSection(section)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                  {steps.length === 0 ? (
                    <p className="small muted">No works in this section yet. Choose it from a step’s “Section” menu.</p>
                  ) : (
                    <ol className="list" style={{ listStyle: "none" }}>
                      {steps.map((step) => {
                        const index = ordered.indexOf(step);
                        const work = workById.get(step.work_id);
                        const done = finished.has(step.work_id);
                        const current = reading.has(step.work_id);
                        return (
                          <li key={step.id} className={`route-step${done ? " is-done" : ""}${current ? " is-current" : ""}`}>
                            <span className="route-num" aria-hidden>
                              {index + 1}
                            </span>
                            <div className="grow stack" style={{ ["--gap" as string]: "0.3rem" }}>
                              <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
                                <button type="button" className="link-button serif route-title" style={{ color: "inherit", textDecoration: "none", fontSize: "1.08rem" }} onClick={() => go({ tab: "works", work: step.work_id })}>
                                  <em>{work?.title}</em>
                                </button>
                                <span className="small muted">{work && formatOriginalYear(work)}</span>
                              </div>
                              <div className="row" style={{ ["--gap" as string]: "0.35rem" }}>
                                {scopeOf.get(step.work_id) && (
                                  <span className={scopeOf.get(step.work_id) === "essential" ? "chip chip-accent" : "chip"}>{SCOPES[scopeOf.get(step.work_id)!].label}</span>
                                )}
                                {done && <span className="chip chip-green">Finished</span>}
                                {current && <span className="chip chip-blue">Reading</span>}
                                {ORIGIN_LABEL[step.origin] && <span className="chip chip-outline">{ORIGIN_LABEL[step.origin]}</span>}
                                {step.target_month && <span className="chip chip-outline">{formatMonth(step.target_month)}</span>}
                              </div>
                              <StepDetails step={step} sections={sections} />
                            </div>
                            <div className="reorder" role="group" aria-label={`Move ${work?.title ?? "step"}`}>
                              <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label="Move earlier" disabled={index === 0} onClick={() => move(index, index - 1)}>
                                <UpIcon />
                              </button>
                              <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label="Move later" disabled={index === ordered.length - 1} onClick={() => move(index, index + 1)}>
                                <DownIcon />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>

      <aside className="stack" style={{ ["--gap" as string]: "1.25rem" }} aria-label="Pacing">
        <Intentions />
        <section className="card-quiet stack" style={{ ["--gap" as string]: "0.6rem" }}>
          <h3 style={{ margin: 0 }}>When plans change</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Your reading history always stays as it happened. Target months are only intentions; nothing is ever marked late.
          </p>
          <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
            <label className="visually-hidden" htmlFor="shift-by">
              Months to move remaining targets
            </label>
            <select id="shift-by" className="select" style={{ width: "auto" }} value={shiftBy} onChange={(e) => setShiftBy(Number(e.target.value))}>
              {[1, 2, 3, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "month" : "months"}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!hasTargets}
              onClick={async () => {
                const updates = shiftRemainingTargets(b.steps, b.sessions, shiftBy);
                if (!updates.length) return toast("No unfinished steps have target months.");
                await act(async () => {
                  for (const u of updates) await updateStep(u.id, { target_month: u.target_month });
                }, `Moved ${updates.length} remaining ${updates.length === 1 ? "target" : "targets"} later.`);
              }}
            >
              Move remaining targets later
            </button>
          </div>
          <button type="button" className="btn btn-sm btn-quiet" style={{ justifySelf: "start" }} disabled={!hasTargets} onClick={() => setClearOpen(true)}>
            Remove all target months
          </button>
        </section>
      </aside>

      <AddStepsSheet open={addOpen} onClose={() => setAddOpen(false)} startAt={ordered.length} />
      <PublicationOrderSheet open={pubOpen} onClose={() => setPubOpen(false)} />
      <SectionSheet section={sectionOpen} onClose={() => setSectionOpen(null)} />
      <ConfirmSheet
        open={Boolean(removeSection)}
        onClose={() => setRemoveSection(null)}
        title="Remove this section?"
        confirmLabel="Remove section"
        body={<p>The works in “{removeSection?.title}” stay in the route; only the section heading is removed.</p>}
        onConfirm={async () => {
          if (removeSection) await act(() => deleteSection(removeSection.id), "Section removed.");
        }}
      />
      <ConfirmSheet
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Remove all target months?"
        confirmLabel="Remove target months"
        body={<p>Your route order and reading history stay exactly as they are.</p>}
        onConfirm={async () => {
          await act(async () => {
            for (const s of b.steps.filter((x) => x.target_month)) await updateStep(s.id, { target_month: null });
          }, "Target months removed.");
        }}
      />
    </div>
  );
}

function StepDetails({ step, sections }: { step: RouteStep; sections: RouteSection[] }) {
  const { act } = useSeason();
  const [editing, setEditing] = useState(false);
  const [rationale, setRationale] = useState(step.rationale ?? "");
  const [month, setMonth] = useState(step.target_month?.slice(0, 7) ?? "");
  const [sectionId, setSectionId] = useState(step.section_id ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const uid = useId();

  if (!editing) {
    return (
      <div className="small">
        {step.rationale ? <p className="serif" style={{ margin: 0, fontStyle: "italic" }}>{step.rationale}</p> : <span className="faint">Why this comes next — not written yet. </span>}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setRationale(step.rationale ?? "");
            setMonth(step.target_month?.slice(0, 7) ?? "");
            setSectionId(step.section_id ?? "");
            setEditing(true);
          }}
        >
          Edit step
        </button>
      </div>
    );
  }

  return (
    <form
      className="stack card-quiet"
      style={{ ["--gap" as string]: "0.6rem" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await act(() =>
          updateStep(step.id, {
            rationale: rationale.trim() || null,
            target_month: month ? monthStart(month) : null,
            section_id: sectionId || null,
            origin: "mine",
          }),
        );
        if (ok) setEditing(false);
      }}
    >
      <Field label="Why this comes next" htmlFor={`${uid}-r`}>
        <textarea id={`${uid}-r`} className="textarea" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} autoFocus />
      </Field>
      <div className="grid-2">
        <Field label="Target month (optional)" htmlFor={`${uid}-m`}>
          <input id={`${uid}-m`} className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Section" htmlFor={`${uid}-s`}>
          <select id={`${uid}-s`} className="select" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">No section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row row-between">
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmRemove(true)}>
          Remove from route
        </button>
        <div className="row" style={{ ["--gap" as string]: "0.4rem" }}>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm">
            Save step
          </button>
        </div>
      </div>
      <ConfirmSheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove from the route?"
        confirmLabel="Remove step"
        body={<p>The work stays in this season’s body of work, with any reading history and notes.</p>}
        onConfirm={async () => {
          await act(() => deleteStep(step.id), "Removed from the route.");
        }}
      />
    </form>
  );
}

function SectionMover({ section, sections }: { section: RouteSection; sections: RouteSection[] }) {
  const { act } = useSeason();
  const i = sections.findIndex((s) => s.id === section.id);
  const swap = (j: number) =>
    act(async () => {
      const next = moveItem(sections, i, j);
      for (let k = 0; k < next.length; k++) if (next[k].position !== k) await updateSection(next[k].id, { position: k });
    });
  return (
    <>
      <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={`Move section ${section.title} earlier`} disabled={i === 0} onClick={() => swap(i - 1)}>
        <UpIcon />
      </button>
      <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={`Move section ${section.title} later`} disabled={i === sections.length - 1} onClick={() => swap(i + 1)}>
        <DownIcon />
      </button>
    </>
  );
}

function SectionSheet({ section, onClose }: { section: RouteSection | "new" | null; onClose: () => void }) {
  const { b, act } = useSeason();
  const existing = section && section !== "new" ? section : null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [openFor, setOpenFor] = useState<typeof section>(null);
  const uid = useId();
  if (section !== openFor) {
    setOpenFor(section);
    setTitle(existing?.title ?? "");
    setDescription(existing?.description ?? "");
  }
  return (
    <Sheet open={Boolean(section)} onClose={onClose} title={existing ? "Edit section" : "Add a section"} description="Group the route by theme, period or purpose.">
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const ok = await act(() =>
            existing
              ? updateSection(existing.id, { title: title.trim(), description: description.trim() || null })
              : createSection({ apprenticeship_id: b.season.id, title: title.trim(), description: description.trim() || null, position: b.sections.length }),
          );
          if (ok) onClose();
        }}
      >
        <Field label="Title" htmlFor={`${uid}-t`}>
          <input id={`${uid}-t`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="e.g. The early apologetics" />
        </Field>
        <Field label="Purpose (optional)" htmlFor={`${uid}-d`}>
          <textarea id={`${uid}-d`} className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
            Save section
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function AddStepsSheet({ open, onClose, startAt }: { open: boolean; onClose: () => void; startAt: number }) {
  const { b, workById, act } = useSeason();
  const [picked, setPicked] = useState<string[]>([]);
  const candidates = b.seasonWorks
    .filter((sw) => !b.steps.some((s) => s.work_id === sw.work_id))
    .map((sw) => ({ sw, work: workById.get(sw.work_id)! }))
    .filter((x) => x.work)
    .sort((a, c) => a.work.title.localeCompare(c.work.title));
  return (
    <Sheet open={open} onClose={onClose} title="Add works to the route">
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(
            () => createSteps(picked.map((work_id, i) => ({ apprenticeship_id: b.season.id, work_id, position: startAt + i, origin: "mine" as const }))),
            "Added to the route.",
          );
          if (ok) {
            setPicked([]);
            onClose();
          }
        }}
      >
        {candidates.length === 0 ? (
          <p className="muted">Every work in this season is already on the route.</p>
        ) : (
          <fieldset>
            <legend>Works in this season</legend>
            <div className="stack" style={{ ["--gap" as string]: "0.5rem" }}>
              {candidates.map(({ sw, work }) => (
                <label key={work.id} className="checkbox">
                  <input type="checkbox" checked={picked.includes(work.id)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, work.id] : cur.filter((x) => x !== work.id)))} />
                  <span>
                    <em>{work.title}</em> <span className="muted small">· {formatOriginalYear(work)} · {SCOPES[sw.scope].label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={picked.length === 0}>
            Add {picked.length || ""} to route
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function PublicationOrderSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { b, workById, act } = useSeason();
  const [includeOptional, setIncludeOptional] = useState(true);
  const eligible = b.seasonWorks
    .filter((sw) => sw.scope === "essential" || (includeOptional && sw.scope === "optional") || b.steps.some((s) => s.work_id === sw.work_id))
    .map((sw) => workById.get(sw.work_id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  const { known, unknown } = publicationOrder(eligible);
  const sequence = [...known, ...unknown];

  return (
    <Sheet open={open} onClose={onClose} title="Arrange by publication order" description="A suggestion from the original dates you’ve recorded — review it before applying." wide>
      <div className="stack">
        <label className="checkbox">
          <input type="checkbox" checked={includeOptional} onChange={(e) => setIncludeOptional(e.target.checked)} />
          <span>Include optional works</span>
        </label>
        <ol className="stack small" style={{ ["--gap" as string]: "0.3rem", paddingLeft: "1.4rem" }}>
          {known.map((w) => (
            <li key={w.id}>
              <em>{w.title}</em> <span className="muted">· {formatOriginalYear(w)}</span>
            </li>
          ))}
        </ol>
        {unknown.length > 0 && (
          <div className="notice notice-warm small">
            <strong>Original date unknown ({unknown.length}):</strong> {unknown.map((w) => w.title).join(", ")}. These will be placed at the end — move them
            wherever they belong.
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          Applying replaces the current order (sections and notes on each step are kept). Steps arranged this way are labelled until you adjust them.
          Your reading history is unaffected.
        </p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={sequence.length === 0}
            onClick={async () => {
              const ok = await act(async () => {
                const existing = new Map(b.steps.map((s) => [s.work_id, s]));
                const missing = sequence.filter((w) => !existing.has(w.id));
                const created = await createSteps(missing.map((w) => ({ apprenticeship_id: b.season.id, work_id: w.id, position: 0, origin: "publication_order" as const })));
                for (const s of created) existing.set(s.work_id, s);
                const ids = sequence.map((w) => existing.get(w.id)!.id);
                const rest = b.steps.filter((s) => !sequence.some((w) => w.id === s.work_id)).map((s) => s.id);
                await reorderRoute(b.season.id, [...ids, ...rest]);
                for (const w of sequence) {
                  const step = existing.get(w.id)!;
                  if (step.origin !== "publication_order") await updateStep(step.id, { origin: "publication_order" });
                }
                return true;
              }, "Route arranged by publication date.");
              if (ok) onClose();
            }}
          >
            Apply this order
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function Intentions() {
  const { b, act } = useSeason();
  const [month, setMonth] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const uid = useId();
  const intentions = [...b.intentions].sort((a, c) => a.month.localeCompare(c.month));
  return (
    <section className="card stack" style={{ ["--gap" as string]: "0.75rem" }} aria-labelledby={`${uid}-h`}>
      <div>
        <h3 id={`${uid}-h`} style={{ margin: 0 }}>
          Monthly intentions
        </h3>
        <p className="small muted" style={{ margin: 0 }}>
          Optional. A sentence about what you hope a month holds — never a schedule.
        </p>
      </div>
      {intentions.length > 0 && (
        <ul className="list">
          {intentions.map((i) => (
            <li key={i.id} className="list-item" style={{ alignItems: "flex-start" }}>
              <div className="grow">
                <div className="eyebrow" style={{ margin: 0 }}>
                  {formatMonth(i.month)}
                </div>
                {editing === i.id ? (
                  <form
                    className="row"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!editText.trim()) return;
                      const ok = await act(() => updateIntention(i.id, { intention: editText.trim() }));
                      if (ok) setEditing(null);
                    }}
                  >
                    <input className="input grow" value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Intention" autoFocus />
                    <button type="submit" className="btn btn-sm btn-primary">
                      Save
                    </button>
                  </form>
                ) : (
                  <p className="serif" style={{ margin: 0 }}>{i.intention}</p>
                )}
              </div>
              {editing !== i.id && (
                <>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setEditing(i.id);
                      setEditText(i.intention);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => act(() => deleteIntention(i.id))}>
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="stack"
        style={{ ["--gap" as string]: "0.5rem" }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!month || !text.trim()) return;
          const exists = b.intentions.find((x) => x.month.slice(0, 7) === month);
          const ok = await act(() => (exists ? updateIntention(exists.id, { intention: text.trim() }) : createIntention({ apprenticeship_id: b.season.id, month: monthStart(month), intention: text.trim() })));
          if (ok) {
            setText("");
            setMonth("");
          }
        }}
      >
        <div className="grid-2">
          <div className="field">
            <label htmlFor={`${uid}-m`}>Month</label>
            <input id={`${uid}-m`} className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-t`}>Intention</label>
            <input id={`${uid}-t`} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Finish the Narnia letters slowly" />
          </div>
        </div>
        <button type="submit" className="btn btn-sm" style={{ justifySelf: "start" }} disabled={!month || !text.trim()}>
          Add intention
        </button>
      </form>
    </section>
  );
}
