"use client";

import { formatTimestamp, htmlToText, truncate } from "@/lib/format";
import { ENTRY_KINDS, PROVENANCE, QUESTION_STATUS } from "@/lib/labels";
import type { Entry } from "@/lib/types";
import { BookmarkIcon, StarIcon } from "../icons";
import { RichText } from "../rich-editor";
import { SaveBadge } from "../ui";
import { useSeason } from "./context";

/** Labels material that isn't simply the reader's own words. */
export function EntryProvenance({ entry }: { entry: Entry }) {
  if (entry.provenance === "mine") return null;
  return (
    <p className="small" style={{ margin: "0.4rem 0 0" }}>
      <span className={entry.provenance === "ai_suggested" ? "chip chip-gold" : "chip chip-blue"}>{PROVENANCE[entry.provenance]}</span>
      {entry.provenance_note && <span className="muted"> {entry.provenance_note}</span>}
    </p>
  );
}

/** The author's words, with their source, kept visually distinct from commentary. */
export function QuoteBlock({ entry, clamp }: { entry: Entry; clamp?: number }) {
  const { workById } = useSeason();
  if (!entry.quote_text) return null;
  const work = entry.work_id ? workById.get(entry.work_id) : null;
  const source = [entry.quote_locator, entry.quote_source].filter(Boolean).join(" · ");
  return (
    <figure style={{ margin: 0 }}>
      <blockquote className="quote">{clamp ? truncate(entry.quote_text, clamp) : entry.quote_text}</blockquote>
      {(work || source) && (
        <figcaption className="quote-source">
          — {work && <em>{work.title}</em>}
          {work && source && ", "}
          {source}
        </figcaption>
      )}
    </figure>
  );
}

export function EntrySummary({ entry, selected, onOpen }: { entry: Entry; selected?: boolean; onOpen: () => void }) {
  const { workById, themeById, themesForEntry, saveState } = useSeason();
  const work = entry.work_id ? workById.get(entry.work_id) : null;
  const themes = themesForEntry(entry.id).map((id) => themeById.get(id)).filter(Boolean);
  const state = saveState(entry.id);
  const text = htmlToText(entry.body_html);
  return (
    <button type="button" className="list-button" aria-current={selected ? "true" : undefined} onClick={onOpen} style={{ display: "block" }}>
      <span className="row" style={{ ["--gap" as string]: "0.4rem", marginBottom: "0.35rem" }}>
        <span className={entry.kind === "quotation" ? "chip chip-accent" : entry.kind === "question" ? "chip chip-blue" : "chip"}>{ENTRY_KINDS[entry.kind].label}</span>
        {entry.kind === "question" && entry.question_status && <span className="chip chip-outline">{QUESTION_STATUS[entry.question_status].label}</span>}
        {entry.provenance !== "mine" && <span className="chip chip-gold">{PROVENANCE[entry.provenance]}</span>}
        {entry.keep_for_guide && <BookmarkIcon filled width={14} height={14} aria-label="Kept for reader’s guide" style={{ color: "var(--green)" }} />}
        {entry.favorite && <StarIcon filled width={14} height={14} aria-label="Favorite" style={{ color: "var(--gold)" }} />}
        <span className="small muted grow" style={{ textAlign: "right" }}>
          {formatTimestamp(entry.captured_at)}
        </span>
      </span>
      {entry.prompt && <span className="small muted" style={{ display: "block", fontStyle: "italic" }}>{entry.prompt}</span>}
      {entry.title && (
        <span className="serif" style={{ display: "block", fontSize: "1.08rem", fontWeight: 500 }}>
          {entry.title}
        </span>
      )}
      {entry.quote_text && (
        <span className="serif" style={{ display: "block", borderLeft: "3px solid var(--accent)", paddingLeft: "0.75rem", margin: "0.25rem 0", color: "var(--ink)" }}>
          {truncate(entry.quote_text, 220)}
        </span>
      )}
      {text && (
        <span className={entry.quote_text ? "small" : "serif"} style={{ display: "block", color: entry.quote_text ? "var(--muted)" : "var(--ink-soft)" }}>
          {entry.quote_text && <span style={{ color: "var(--green)", fontWeight: 600 }}>My note: </span>}
          {truncate(text, 240)}
        </span>
      )}
      <span className="row small muted" style={{ ["--gap" as string]: "0.4rem", marginTop: "0.35rem" }}>
        {work && <em>{work.title}</em>}
        {entry.quote_locator && <span>· {entry.quote_locator}</span>}
        {themes.map((t) => (
          <span key={t!.id} className="chip chip-outline">
            {t!.name}
          </span>
        ))}
        {state !== "saved" && <SaveBadge state={state} />}
      </span>
    </button>
  );
}

/** Full rendering of an entry (detail view). */
export function EntryBody({ entry }: { entry: Entry }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "0.75rem" }}>
      {entry.prompt && <p className="small muted" style={{ margin: 0, fontStyle: "italic" }}>{entry.prompt}</p>}
      {entry.title && <h3 style={{ margin: 0 }}>{entry.title}</h3>}
      {entry.kind === "quotation" && (
        <div>
          <p className="my-words-label" style={{ color: "var(--accent)" }}>
            The author’s words
          </p>
          <QuoteBlock entry={entry} />
        </div>
      )}
      {entry.body_html && (
        <div className={entry.kind === "quotation" ? "my-words" : undefined}>
          <p className="my-words-label">{entry.provenance === "mine" ? "My words" : PROVENANCE[entry.provenance]}</p>
          <RichText html={entry.body_html} />
        </div>
      )}
      <EntryProvenance entry={entry} />
    </div>
  );
}
