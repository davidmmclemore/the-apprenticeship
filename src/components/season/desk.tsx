"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { setPrimarySession, updateSeason } from "@/lib/data";
import { formatMonth, formatOriginalYear, formatPosition, htmlToText, relativeTime, truncate } from "@/lib/format";
import { ENTRY_KINDS } from "@/lib/labels";
import { buildOrientation } from "@/lib/orientation";
import { currentSessions, nextSuggestedStep, scopeProgress } from "@/lib/route";
import type { ReadingSession, ScopeLevel, Work } from "@/lib/types";
import { Cover } from "../cover";
import { RichText } from "../rich-editor";
import { EmptyState } from "../ui";
import { QuickCapture } from "./capture";
import { useSeason } from "./context";
import { EntryProvenance } from "./notebook";
import { editionLabel, FinishSheet, StartReadingSheet, UpdatePlaceSheet } from "./sessions";

export function Desk({ onCapture }: { onCapture: () => void }) {
  const { b, entries, workById, editionById, themeById, go, act } = useSeason();
  const [placeFor, setPlaceFor] = useState<ReadingSession | null>(null);
  const [finishFor, setFinishFor] = useState<{ session: ReadingSession; mode: "finish" | "set_aside" | "pause" } | null>(null);
  const [startWork, setStartWork] = useState<Work | null>(null);

  const current = useMemo(() => currentSessions(b.sessions), [b.sessions]);
  const primary = current[0] ?? null;
  const scope = useMemo(() => new Map<string, ScopeLevel>(b.seasonWorks.map((sw) => [sw.work_id, sw.scope])), [b.seasonWorks]);
  const next = useMemo(() => nextSuggestedStep(b.steps, b.sessions, scope), [b.steps, b.sessions, scope]);
  const progress = useMemo(() => scopeProgress(b.seasonWorks, b.sessions), [b.seasonWorks, b.sessions]);
  const orientation = useMemo(
    () => buildOrientation({ primarySession: primary, works: workById, entries, entryThemes: b.entryThemes, themes: themeById }),
    [primary, workById, entries, b.entryThemes, themeById],
  );
  const live = entries.filter((e) => !e.archived_at);
  const latest = live.find((e) => e.kind !== "question") ?? null;
  const carriedHere = primary
    ? b.carries
        .filter((c) => c.apprenticeship_id === b.season.id && c.work_id === primary.work_id)
        .map((c) => entries.find((e) => e.id === c.question_entry_id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e) && e!.question_status !== "resolved")
    : [];
  const stepFor = (workId: string) => b.steps.find((s) => s.work_id === workId);
  const intention = b.intentions.find((i) => i.month.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const welcome = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome");

  if (b.season.status === "planned" && !current.length) {
    return (
      <div className="stack">
        <EmptyState
          title="This season hasn’t begun"
          action={
            <div className="row" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => act(() => updateSeason(b.season.id, { status: "active", start_date: b.season.start_date ?? new Date().toISOString().slice(0, 10) }), "Season begun.")}
              >
                Begin the season
              </button>
              <button type="button" className="btn" onClick={() => go({ tab: "works" })}>
                Choose works
              </button>
            </div>
          }
        >
          <p>Gather the works you mean to read and sketch a route whenever you’re ready. Nothing here is on a clock.</p>
        </EmptyState>
        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Capture a thought</h2>
          <QuickCapture compact />
        </section>
      </div>
    );
  }

  return (
    <div className="split">
      <div className="stack" style={{ ["--gap" as string]: "1.5rem" }}>
        {orientation.length > 0 && !welcome && (
          <section aria-label="Where you left off">
            <p className="eyebrow">Where you left off</p>
            <p className="orientation">
              {orientation.map((part, i) => {
                const lead = i === 0 ? "You were " : i === orientation.length - 1 ? ", and " : ", ";
                if (part.kind === "reading")
                  return (
                    <span key={i}>
                      {lead}reading <em>{part.workTitle}</em>
                      {part.position && ` (${part.position}${part.when ? `, ${part.when}` : ""})`}
                    </span>
                  );
                if (part.kind === "theme")
                  return (
                    <span key={i}>
                      {lead}
                      exploring <strong>{part.name}</strong>
                    </span>
                  );
                return (
                  <span key={i}>
                    {lead}
                    asking{" "}
                    <button type="button" className="link-button serif" onClick={() => go({ tab: "notebook", entry: part.entryId })}>
                      “{part.text}”
                    </button>
                  </span>
                );
              })}
              .
            </p>
          </section>
        )}

        {primary ? (
          <CurrentWork
            session={primary}
            work={workById.get(primary.work_id)}
            primary
            editionText={primary.edition_id && editionById.get(primary.edition_id) ? editionLabel(editionById.get(primary.edition_id)!) : null}
            rationale={stepFor(primary.work_id)?.rationale ?? b.seasonWorks.find((sw) => sw.work_id === primary.work_id)?.selection_note ?? null}
            authorName={b.author.name}
            onPlace={() => setPlaceFor(primary)}
            onNotes={() => go({ tab: "notebook", work: primary.work_id })}
            onFinish={(mode) => setFinishFor({ session: primary, mode })}
            onCapture={onCapture}
          />
        ) : (
          <EmptyState
            title="Nothing on your desk"
            action={
              next ? (
                <button type="button" className="btn btn-primary" onClick={() => setStartWork(workById.get(next.work_id) ?? null)}>
                  Start {workById.get(next.work_id)?.title}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => go({ tab: "works" })}>
                  Choose a work to read
                </button>
              )
            }
          >
            <p>When you begin reading a work it will sit here, ready to pick up.</p>
          </EmptyState>
        )}

        {current.length > 1 && (
          <section aria-labelledby="also-reading">
            <h2 id="also-reading" style={{ fontSize: "1.15rem" }}>
              Also reading
            </h2>
            <ul className="list">
              {current.slice(1).map((s) => {
                const w = workById.get(s.work_id);
                return (
                  <li key={s.id} className="list-item">
                    <Cover title={w?.title ?? ""} author={b.author.name} url={w?.cover_url} width={44} />
                    <div className="grow">
                      <div className="serif">
                        <em>{w?.title}</em>
                      </div>
                      <div className="small muted">{formatPosition(s.position_kind, s.position_value) || "No place recorded"}</div>
                    </div>
                    <div className="row" style={{ ["--gap" as string]: "0.25rem" }}>
                      <button type="button" className="btn btn-sm" onClick={() => setPlaceFor(s)}>
                        Update place
                      </button>
                      <button type="button" className="btn btn-sm btn-quiet" onClick={() => act(() => setPrimarySession(s.id), "Now your primary reading.")}>
                        Make primary
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {carriedHere.length > 0 && (
          <section className="card-quiet" aria-labelledby="carried">
            <p className="eyebrow" id="carried">
              Questions you brought to this work
            </p>
            <ul className="list">
              {carriedHere.map((q) => (
                <li key={q.id} className="list-item">
                  <button type="button" className="link-button serif" style={{ textAlign: "left" }} onClick={() => go({ tab: "notebook", entry: q.id })}>
                    {truncate(q.title || htmlToText(q.body_html), 160)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="next-step">
          <div className="section-head">
            <h2 id="next-step" style={{ fontSize: "1.2rem" }}>
              Next step
            </h2>
            <button type="button" className="link-button small" onClick={() => go({ tab: "route" })}>
              View the route
            </button>
          </div>
          {next ? (
            <div className="row" style={{ alignItems: "flex-start" }}>
              <Cover title={workById.get(next.work_id)?.title ?? ""} author={b.author.name} url={workById.get(next.work_id)?.cover_url} width={56} />
              <div className="grow">
                <div className="serif" style={{ fontSize: "1.1rem" }}>
                  <em>{workById.get(next.work_id)?.title}</em>
                </div>
                {next.rationale && <p className="small" style={{ margin: "0.2rem 0" }}>{next.rationale}</p>}
                {next.target_month && <p className="small muted" style={{ margin: 0 }}>Planned for {formatMonth(next.target_month)}</p>}
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setStartWork(workById.get(next.work_id) ?? null)}>
                Start reading
              </button>
            </div>
          ) : b.steps.length ? (
            <p className="muted">You’ve reached the end of your route as it stands. Add more, revisit, or let the season close when it’s ready.</p>
          ) : (
            <p className="muted">
              No route yet.{" "}
              <button type="button" className="link-button" onClick={() => go({ tab: "route" })}>
                Arrange one
              </button>{" "}
              when you’d like a sense of what comes next.
            </p>
          )}
        </section>

        {(progress.essential.total > 0 || progress.optional.total > 0) && (
          <section aria-label="Progress within this season’s scope" className="small muted">
            <p style={{ margin: 0 }}>
              Within this season’s selection: {progress.essential.finished} of {progress.essential.total} essential
              {progress.optional.total > 0 && `, ${progress.optional.finished} of ${progress.optional.total} optional`} works finished.
            </p>
          </section>
        )}

        {b.siblingSeasons.length > 0 && (
          <section className="small" aria-label="Other seasons with this author">
            <p className="muted" style={{ margin: 0 }}>
              Other seasons with {b.author.name}:{" "}
              {b.siblingSeasons.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && " · "}
                  <Link href={`/season?id=${s.id}`}>{s.title}</Link>
                </span>
              ))}
            </p>
          </section>
        )}
      </div>

      <div className="stack" style={{ ["--gap" as string]: "1.25rem" }}>
        <section className="card" aria-labelledby="capture-heading">
          <h2 id="capture-heading" style={{ fontSize: "1.2rem" }}>
            Capture a thought
          </h2>
          <QuickCapture compact />
        </section>

        {intention && (
          <section className="card-quiet">
            <p className="eyebrow">This month’s intention</p>
            <p className="serif" style={{ margin: 0 }}>{intention.intention}</p>
          </section>
        )}

        {latest && (
          <section className="card-quiet" aria-labelledby="latest-note">
            <div className="row row-between">
              <p className="eyebrow" id="latest-note" style={{ margin: 0 }}>
                Latest {ENTRY_KINDS[latest.kind].label.toLowerCase()} · {relativeTime(latest.captured_at)}
              </p>
              <button type="button" className="link-button small" onClick={() => go({ tab: "notebook", entry: latest.id })}>
                Open
              </button>
            </div>
            {latest.quote_text && <blockquote className="quote" style={{ marginTop: "0.6rem" }}>{truncate(latest.quote_text, 300)}</blockquote>}
            {latest.body_html && (
              <div style={{ marginTop: "0.5rem" }}>
                <RichText html={latest.body_html} />
              </div>
            )}
            <EntryProvenance entry={latest} />
          </section>
        )}
      </div>

      <UpdatePlaceSheet session={placeFor} open={Boolean(placeFor)} onClose={() => setPlaceFor(null)} />
      <FinishSheet session={finishFor?.session ?? null} mode={finishFor?.mode ?? "finish"} open={Boolean(finishFor)} onClose={() => setFinishFor(null)} />
      <StartReadingSheet work={startWork} open={Boolean(startWork)} onClose={() => setStartWork(null)} />
    </div>
  );
}

function CurrentWork({
  session,
  work,
  editionText,
  rationale,
  authorName,
  onPlace,
  onNotes,
  onFinish,
  onCapture,
}: {
  session: ReadingSession;
  work?: Work;
  primary?: boolean;
  editionText: string | null;
  rationale: string | null;
  authorName: string;
  onPlace: () => void;
  onNotes: () => void;
  onFinish: (mode: "finish" | "set_aside" | "pause") => void;
  onCapture: () => void;
}) {
  if (!work) return null;
  const position = formatPosition(session.position_kind, session.position_value);
  return (
    <section className="card" aria-labelledby="current-work">
      <p className="eyebrow">Now reading{session.ordinal > 1 ? ` · reading ${session.ordinal}` : ""}</p>
      <div className="desk-current">
        <Cover title={work.title} author={authorName} url={work.cover_url} width={120} />
        <div className="grow stack" style={{ ["--gap" as string]: "0.4rem" }}>
          <h2 id="current-work" style={{ margin: 0 }}>
            <em>{work.title}</em>
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            {authorName} · {formatOriginalYear(work)}
          </p>
          {editionText && <p className="small" style={{ margin: 0 }}>{editionText}</p>}
          <p className="small" style={{ margin: 0 }}>
            {position ? (
              <>
                <strong>{position}</strong>
                {session.position_updated_at && <span className="muted"> · noted {relativeTime(session.position_updated_at)}</span>}
              </>
            ) : (
              <span className="muted">No place recorded — that’s fine.</span>
            )}
          </p>
          {rationale && (
            <p className="small serif" style={{ margin: "0.3rem 0 0", fontStyle: "italic" }}>
              Why now: {rationale}
            </p>
          )}
        </div>
      </div>
      <div className="action-grid" style={{ marginTop: "1.1rem" }}>
        <button type="button" className="btn btn-primary" onClick={onCapture}>
          Capture a thought
        </button>
        <button type="button" className="btn" onClick={onPlace}>
          Update my place
        </button>
        <button type="button" className="btn" onClick={onNotes}>
          This work’s notes
        </button>
        <button type="button" className="btn" onClick={() => onFinish("finish")}>
          Finish
        </button>
      </div>
      <div className="row" style={{ marginTop: "0.5rem", ["--gap" as string]: "0.25rem" }}>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onFinish("pause")}>
          Pause
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onFinish("set_aside")}>
          Set aside
        </button>
      </div>
    </section>
  );
}
