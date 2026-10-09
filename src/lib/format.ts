import { POSITION_KINDS } from "./labels";
import type { PositionKind, Work } from "./types";

/** Parse a YYYY-MM-DD date as a local calendar date (no timezone shift). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDay(day: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!day) return "";
  return parseDay(day).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", ...opts });
}

export function formatMonth(month: string | null | undefined): string {
  if (!month) return "";
  return parseDay(month).toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A gentle relative phrase ("today", "3 days ago", "in March"). Never "overdue". */
export function relativeTime(ts: string | null | undefined, now = new Date()): string {
  if (!ts) return "";
  const then = new Date(ts);
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(then).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `in ${then.toLocaleDateString(undefined, { month: "long", year: then.getFullYear() === now.getFullYear() ? undefined : "numeric" })}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** First day of the month for a YYYY-MM or YYYY-MM-DD value. */
export function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

/** Shift a month (YYYY-MM-01) by n months. */
export function addMonths(month: string, n: number): string {
  const d = parseDay(month);
  const shifted = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return todayISO(shifted).slice(0, 7) + "-01";
}

export function formatPosition(kind: PositionKind | null, value: string | null): string {
  if (!value) return "";
  if (!kind) return value;
  return `${POSITION_KINDS[kind].prefix}${value}`;
}

/** Original publication year as shown to the reader, keeping uncertainty visible. */
export function formatOriginalYear(work: Pick<Work, "original_year" | "original_year_approximate" | "year_note">): string {
  if (work.original_year == null) return work.year_note ? work.year_note : "Date unknown";
  const year = work.original_year < 0 ? `${-work.original_year} BC` : String(work.original_year);
  return work.original_year_approximate ? `c. ${year}` : year;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Strip HTML to plain text for previews (input is already-sanitized HTML). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|blockquote|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}
