import { formatPosition, htmlToText, relativeTime, truncate } from "./format";
import type { Entry, EntryTheme, ReadingSession, Theme, Work } from "./types";

/**
 * "You were reading this work, exploring this theme, and asking this
 * question." Built only from what the reader actually saved; any part that
 * has no saved basis is simply left out. Nothing is summarised or invented.
 */

export type OrientationPart =
  | { kind: "reading"; workTitle: string; position: string | null; when: string | null }
  | { kind: "theme"; name: string }
  | { kind: "question"; text: string; entryId: string };

export interface OrientationInput {
  primarySession: ReadingSession | null;
  works: Map<string, Work>;
  entries: Entry[];
  entryThemes: EntryTheme[];
  themes: Map<string, Theme>;
  now?: Date;
}

export function buildOrientation(input: OrientationInput): OrientationPart[] {
  const parts: OrientationPart[] = [];
  const { primarySession, works, entries, entryThemes, themes } = input;

  if (primarySession) {
    const work = works.get(primarySession.work_id);
    if (work) {
      const position = formatPosition(primarySession.position_kind, primarySession.position_value) || null;
      const when = primarySession.position_updated_at ? relativeTime(primarySession.position_updated_at, input.now) : null;
      parts.push({ kind: "reading", workTitle: work.title, position, when });
    }
  }

  const live = entries.filter((e) => !e.archived_at).sort((a, b) => b.captured_at.localeCompare(a.captured_at));

  // The theme most recently written about.
  const themeByEntry = new Map<string, string[]>();
  for (const et of entryThemes) themeByEntry.set(et.entry_id, [...(themeByEntry.get(et.entry_id) ?? []), et.theme_id]);
  for (const entry of live) {
    const themeId = themeByEntry.get(entry.id)?.find((id) => themes.get(id) && !themes.get(id)!.archived_at);
    if (themeId) {
      parts.push({ kind: "theme", name: themes.get(themeId)!.name });
      break;
    }
  }

  // The most recent open question, preferring one about the current work.
  const open = live.filter((e) => e.kind === "question" && e.question_status !== "resolved");
  const currentWorkId = primarySession?.work_id;
  const question = open.find((e) => currentWorkId && e.work_id === currentWorkId) ?? open[0];
  if (question) {
    const text = truncate(question.title?.trim() || htmlToText(question.body_html), 180);
    if (text) parts.push({ kind: "question", text, entryId: question.id });
  }

  return parts;
}
