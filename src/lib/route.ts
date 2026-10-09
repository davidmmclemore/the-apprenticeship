import { addMonths } from "./format";
import type { ApprenticeshipWork, ReadingSession, RouteStep, ScopeLevel, Work } from "./types";

/**
 * Publication order using known original dates only. Works without a known
 * original year are returned separately so the interface can show them
 * visibly rather than guessing (and never using an edition's date).
 */
export function publicationOrder<W extends Pick<Work, "id" | "title" | "original_year">>(works: W[]) {
  const known = works
    .filter((w) => w.original_year != null)
    .sort((a, b) => (a.original_year! - b.original_year!) || a.title.localeCompare(b.title));
  const unknown = works.filter((w) => w.original_year == null).sort((a, b) => a.title.localeCompare(b.title));
  return { known, unknown };
}

/** Work ids with at least one finished reading session. */
export function finishedWorkIds(sessions: Pick<ReadingSession, "work_id" | "status">[]): Set<string> {
  return new Set(sessions.filter((s) => s.status === "finished").map((s) => s.work_id));
}

export function currentSessions<S extends Pick<ReadingSession, "status" | "is_primary" | "updated_at">>(sessions: S[]): S[] {
  return sessions
    .filter((s) => s.status === "reading")
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || b.updated_at.localeCompare(a.updated_at));
}

/**
 * The next step to suggest: the first step in route order whose work is not
 * finished, not currently being read, and not set outside the season's scope.
 */
export function nextSuggestedStep(
  steps: RouteStep[],
  sessions: Pick<ReadingSession, "work_id" | "status">[],
  scope: Map<string, ScopeLevel>,
): RouteStep | null {
  const finished = finishedWorkIds(sessions);
  const reading = new Set(sessions.filter((s) => s.status === "reading").map((s) => s.work_id));
  const ordered = [...steps].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return (
    ordered.find((s) => !finished.has(s.work_id) && !reading.has(s.work_id) && scope.get(s.work_id) !== "outside") ?? null
  );
}

export interface ScopeProgress {
  essential: { total: number; finished: number };
  optional: { total: number; finished: number };
  outside: number;
  /** Finished works not (or no longer) in the essential/optional scope. */
  finishedOutside: number;
}

/**
 * Progress against the season's selected scope. A work counts once however
 * many sessions or editions it has; nothing here describes the author's
 * entire output.
 */
export function scopeProgress(
  seasonWorks: Pick<ApprenticeshipWork, "work_id" | "scope">[],
  sessions: Pick<ReadingSession, "work_id" | "status">[],
): ScopeProgress {
  const finished = finishedWorkIds(sessions);
  const result: ScopeProgress = {
    essential: { total: 0, finished: 0 },
    optional: { total: 0, finished: 0 },
    outside: 0,
    finishedOutside: 0,
  };
  for (const sw of seasonWorks) {
    if (sw.scope === "outside") {
      result.outside += 1;
      if (finished.has(sw.work_id)) result.finishedOutside += 1;
      continue;
    }
    result[sw.scope].total += 1;
    if (finished.has(sw.work_id)) result[sw.scope].finished += 1;
  }
  return result;
}

/**
 * Move target months of unfinished steps by n months. Finished reading keeps
 * its history; steps without a target month are left alone. Nothing is
 * compressed into a tighter schedule.
 */
export function shiftRemainingTargets(
  steps: RouteStep[],
  sessions: Pick<ReadingSession, "work_id" | "status">[],
  months: number,
): { id: string; target_month: string }[] {
  const finished = finishedWorkIds(sessions);
  return steps
    .filter((s) => s.target_month && !finished.has(s.work_id))
    .map((s) => ({ id: s.id, target_month: addMonths(s.target_month!, months) }));
}

/** Move an item within a list (for keyboard / button reordering). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list.slice();
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
