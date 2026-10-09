"use client";

import { useEffect, useId, useState } from "react";
import { createInheritance, createInheritanceLink, createSession, setPrimarySession, updateSession } from "@/lib/data";
import { formatOriginalYear, todayISO } from "@/lib/format";
import { EDITION_FORMATS, FINISH_PROMPTS, POSITION_KINDS } from "@/lib/labels";
import { textToHtml } from "@/lib/sanitize";
import type { Edition, PositionKind, ReadingSession, Work } from "@/lib/types";
import { Field, Sheet, useToast } from "../ui";
import { useSeason } from "./context";

export function editionLabel(e: Edition): string {
  const parts = [e.edition_title, e.publisher, e.publication_year, e.format && EDITION_FORMATS[e.format], e.translator && `tr. ${e.translator}`];
  return parts.filter(Boolean).join(" · ") || "Edition (no details yet)";
}

export function StartReadingSheet({ work, open, onClose }: { work: Work | null; open: boolean; onClose: () => void }) {
  const { b, act } = useSeason();
  const [editionId, setEditionId] = useState("");
  const [startedOn, setStartedOn] = useState(todayISO());
  const [primary, setPrimary] = useState(true);
  const ids = { edition: useId(), date: useId() };
  const editions = work ? b.editions.filter((e) => e.work_id === work.id) : [];
  const previous = work ? b.sessions.filter((s) => s.work_id === work.id) : [];
  const isReread = previous.some((s) => s.status === "finished" || s.status === "set_aside" || s.started_on);
  const hasPrimary = b.sessions.some((s) => s.is_primary && s.status === "reading");

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset local state when the external session or dialog changes.
      setEditionId(editions.length === 1 ? editions[0].id : "");
      setStartedOn(todayISO());
      setPrimary(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, work?.id]);

  if (!work) return null;

  return (
    <Sheet open={open} onClose={onClose} title={isReread ? "Begin a reread" : "Start reading"} description={<em>{work.title}</em>}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(async () => {
            // An untouched "not started" session is reused rather than duplicated.
            const fresh = previous.find((s) => s.status === "not_started" && !s.started_on);
            const session = fresh
              ? await updateSession(fresh.id, { status: "reading", started_on: startedOn || null, edition_id: editionId || null })
              : await createSession({
                  apprenticeship_id: b.season.id,
                  work_id: work.id,
                  edition_id: editionId || null,
                  status: "reading",
                  started_on: startedOn || null,
                  ordinal: previous.length + 1,
                });
            if (primary || !hasPrimary) await setPrimarySession(session.id);
            return true;
          }, isReread ? "Reread begun. Your earlier reading and notes are kept as they were." : "Happy reading.");
          if (ok) onClose();
        }}
      >
        {isReread && (
          <p className="notice" style={{ margin: 0 }}>
            This starts a new reading session. Earlier sessions, positions and notes stay attached to the reading they came from.
          </p>
        )}
        <Field label="Edition" htmlFor={ids.edition} hint={editions.length ? undefined : "No editions recorded yet. You can add one from the work’s page; it’s optional."}>
          <select id={ids.edition} className="select" value={editionId} onChange={(e) => setEditionId(e.target.value)}>
            <option value="">Not specified</option>
            {editions.map((ed) => (
              <option key={ed.id} value={ed.id}>
                {editionLabel(ed)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Started" htmlFor={ids.date}>
          <input id={ids.date} type="date" className="input" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </Field>
        {hasPrimary && (
          <label className="checkbox">
            <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
            <span>Make this my primary reading on the Desk</span>
          </label>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {isReread ? "Begin reread" : "Start reading"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function UpdatePlaceSheet({ session, open, onClose }: { session: ReadingSession | null; open: boolean; onClose: () => void }) {
  const { workById, act } = useSeason();
  const [kind, setKind] = useState<PositionKind>("page");
  const [value, setValue] = useState("");
  const ids = { kind: useId(), value: useId() };

  useEffect(() => {
    if (open && session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset local state when the external session or dialog changes.
      setKind(session.position_kind ?? "page");
      setValue(session.position_value ?? "");
    }
  }, [open, session]);

  if (!session) return null;
  const work = workById.get(session.work_id);
  return (
    <Sheet open={open} onClose={onClose} title="Update my place" description={work && <em>{work.title}</em>}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(
            () =>
              updateSession(session.id, {
                position_kind: value.trim() ? kind : null,
                position_value: value.trim() || null,
                position_updated_at: new Date().toISOString(),
              }),
            "Place saved.",
          );
          if (ok) onClose();
        }}
      >
        <p className="small muted" style={{ margin: 0 }}>
          Entirely optional. Record it whenever it helps you pick up again.
        </p>
        <div className="grid-2">
          <Field label="Measured by" htmlFor={ids.kind}>
            <select id={ids.kind} className="select" value={kind} onChange={(e) => setKind(e.target.value as PositionKind)}>
              {(Object.keys(POSITION_KINDS) as PositionKind[]).map((k) => (
                <option key={k} value={k}>
                  {POSITION_KINDS[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where I am" htmlFor={ids.value}>
            <input id={ids.value} className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={POSITION_KINDS[kind].placeholder} autoFocus />
          </Field>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {session.position_value && (
            <button type="button" className="btn btn-quiet" onClick={() => setValue("")}>
              Clear place
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            Save place
          </button>
        </div>
      </form>
    </Sheet>
  );
}

type FinishMode = "finish" | "set_aside" | "pause";

export function FinishSheet({ session, mode, open, onClose }: { session: ReadingSession | null; mode: FinishMode; open: boolean; onClose: () => void }) {
  const { b, workById, act, capture } = useSeason();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"status" | "prompts">("status");
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [inherit, setInherit] = useState(true);
  const [busy, setBusy] = useState(false);
  const ids = { date: useId(), note: useId(), p0: useId(), p1: useId(), p2: useId() };

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset local state when the external session or dialog changes.
      setDate(todayISO());
      setNote(session?.reflection ?? "");
      setStep("status");
      setAnswers(["", "", ""]);
      setInherit(true);
    }
  }, [open, session]);

  if (!session) return null;
  const work = workById.get(session.work_id);
  const title = mode === "finish" ? "Finish this reading" : mode === "set_aside" ? "Set this aside" : "Pause this reading";

  async function saveStatus() {
    const ok = await act(async () => {
      await updateSession(session!.id, {
        status: mode === "finish" ? "finished" : mode === "set_aside" ? "set_aside" : "paused",
        finished_on: mode === "pause" ? session!.finished_on : date || null,
        reflection: note.trim() || null,
        is_primary: mode === "pause" ? session!.is_primary : false,
      });
      return true;
    });
    if (!ok) return;
    if (mode === "finish") setStep("prompts");
    else {
      toast(mode === "set_aside" ? "Set aside. It stays in your reading history." : "Paused. Pick it up whenever you like.");
      onClose();
    }
  }

  async function savePrompts() {
    setBusy(true);
    try {
      for (let i = 0; i < FINISH_PROMPTS.length; i++) {
        const text = answers[i].trim();
        if (!text) continue;
        await capture({
          kind: "reflection",
          prompt: FINISH_PROMPTS[i],
          body_html: textToHtml(text),
          work_id: session!.work_id,
          session_id: session!.id,
          edition_id: session!.edition_id,
          provenance: "mine",
        });
      }
      const staying = answers[2].trim();
      if (staying && inherit) {
        await act(async () => {
          const item = await createInheritance({
            apprenticeship_id: b.season.id,
            title: staying.length > 80 ? `${staying.slice(0, 77).trimEnd()}…` : staying,
            takeaway_html: textToHtml(staying),
            category: "reading",
          });
          await createInheritanceLink({ inheritance_id: item.id, work_id: session!.work_id });
        });
      }
      toast(answers.some((a) => a.trim()) ? "Saved. These reflections are in your notebook." : "Finished.");
      onClose();
    } catch {
      toast("Some reflections didn’t save. Your answers are still here.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={step === "prompts" ? "Before you move on" : title} description={work && <em>{work.title}{work.original_year ? ` (${formatOriginalYear(work)})` : ""}</em>}>
      {step === "status" ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void saveStatus();
          }}
        >
          {mode !== "pause" && (
            <Field label={mode === "finish" ? "Finished on" : "Set aside on"} htmlFor={ids.date}>
              <input id={ids.date} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
          <Field label="A brief note on this reading (optional)" htmlFor={ids.note}>
            <textarea id={ids.note} className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {mode === "set_aside" && (
            <p className="small muted" style={{ margin: 0 }}>
              Setting a work aside is a perfectly good outcome. It stays in your history and you can return to it later.
            </p>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {mode === "finish" ? "Mark finished" : mode === "set_aside" ? "Set aside" : "Pause"}
            </button>
          </div>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void savePrompts();
          }}
        >
          <p className="muted" style={{ margin: 0 }}>
            One sentence is plenty. Leave any of these blank.
          </p>
          {FINISH_PROMPTS.map((p, i) => (
            <Field key={p} label={p} htmlFor={[ids.p0, ids.p1, ids.p2][i]}>
              <textarea
                id={[ids.p0, ids.p1, ids.p2][i]}
                className="textarea textarea-quote"
                rows={2}
                value={answers[i]}
                onChange={(e) => setAnswers((cur) => cur.map((a, j) => (j === i ? e.target.value : a)))}
              />
            </Field>
          ))}
          {answers[2].trim() && (
            <label className="checkbox">
              <input type="checkbox" checked={inherit} onChange={(e) => setInherit(e.target.checked)} />
              <span>Also keep “what will stay with me” in my Inheritance</span>
            </label>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Skip
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save reflections"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
