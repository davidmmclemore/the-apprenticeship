import type { SeasonBundle } from "./bundle";
import { formatDay, formatOriginalYear, formatPosition, htmlToText } from "./format";
import { ENTRY_KINDS, INHERITANCE_CATEGORIES, LINK_RELATIONS, PROVENANCE, QUESTION_STATUS, SCOPES, SEASON_STATUS } from "./labels";
import { finishedWorkIds } from "./route";
import type { Entry, Retrospective } from "./types";

/**
 * Retrospective / reader's guide assembly and export. Everything here is
 * gathered from saved records and the reader's own retrospective writing;
 * no conclusions are generated.
 */

export const RETRO_SECTIONS: { key: keyof Retrospective; title: string; prompt: string }[] = [
  { key: "why_began_html", title: "Why I began", prompt: "What drew you to this author when the season began?" },
  { key: "works_read_html", title: "Works read", prompt: "Anything to say about the works as a whole?" },
  { key: "favorites_html", title: "Favorite works and why", prompt: "Which works mattered most, and why?" },
  { key: "quotations_html", title: "Selected quotations", prompt: "A note on the passages you kept." },
  { key: "themes_html", title: "Recurring themes", prompt: "What kept returning?" },
  { key: "questions_html", title: "Unresolved questions", prompt: "What are you still asking?" },
  { key: "recommended_order_html", title: "My recommended reading order", prompt: "How would you guide someone else through this author?" },
  { key: "carrying_forward_html", title: "What I’m carrying forward", prompt: "What will you take into your life and writing?" },
  { key: "concluding_essay_html", title: "Concluding essay", prompt: "Write as much or as little as you like." },
];

export interface AssembledGuide {
  worksRead: { workId: string; title: string; year: string; sessions: number; finishedOn: string | null }[];
  favorites: { workId: string; title: string; note: string | null }[];
  quotations: Entry[];
  themes: { id: string; name: string; synthesis: string; entryCount: number }[];
  openQuestions: Entry[];
  routeOrder: { title: string; rationale: string | null }[];
  inheritance: { id: string; title: string; takeaway: string; category: string; intention: string | null }[];
  keptEntries: Entry[];
}

export function assembleGuide(b: SeasonBundle): AssembledGuide {
  const workById = new Map(b.works.map((w) => [w.id, w]));
  const finished = finishedWorkIds(b.sessions);
  const live = b.entries.filter((e) => !e.archived_at);

  const worksRead = [...finished]
    .map((workId) => {
      const work = workById.get(workId);
      const sessions = b.sessions.filter((s) => s.work_id === workId);
      const finishedOn =
        sessions
          .filter((s) => s.status === "finished" && s.finished_on)
          .map((s) => s.finished_on!)
          .sort()
          .at(-1) ?? null;
      return work ? { workId, title: work.title, year: formatOriginalYear(work), sessions: sessions.length, finishedOn } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b2) => (a.finishedOn ?? "").localeCompare(b2.finishedOn ?? ""));

  const favorites = b.seasonWorks
    .filter((sw) => sw.favorite)
    .map((sw) => ({ workId: sw.work_id, title: workById.get(sw.work_id)?.title ?? "Untitled", note: sw.favorite_note }));

  const quotations = live.filter((e) => e.kind === "quotation" && (e.keep_for_guide || e.favorite));
  const entryCountByTheme = new Map<string, number>();
  for (const et of b.entryThemes) entryCountByTheme.set(et.theme_id, (entryCountByTheme.get(et.theme_id) ?? 0) + 1);
  const themes = b.themes
    .filter((t) => !t.archived_at && (t.keep_for_guide || (entryCountByTheme.get(t.id) ?? 0) > 0))
    .map((t) => ({ id: t.id, name: t.name, synthesis: htmlToText(t.synthesis_html), entryCount: entryCountByTheme.get(t.id) ?? 0 }))
    .sort((a, c) => c.entryCount - a.entryCount);
  const openQuestions = live.filter((e) => e.kind === "question" && e.question_status !== "resolved");
  const routeOrder = [...b.steps]
    .sort((a, c) => a.position - c.position)
    .map((s) => ({ title: workById.get(s.work_id)?.title ?? "Untitled", rationale: s.rationale }));
  const inheritance = b.inheritance
    .filter((i) => !i.archived_at && (i.keep_for_guide || i.favorite))
    .map((i) => ({
      id: i.id,
      title: i.title,
      takeaway: htmlToText(i.takeaway_html),
      category: INHERITANCE_CATEGORIES[i.category],
      intention: i.practical_intention,
    }));
  const keptEntries = live.filter((e) => e.keep_for_guide && e.kind !== "quotation");

  return { worksRead, favorites, quotations, themes, openQuestions, routeOrder, inheritance, keptEntries };
}

function mdEscape(text: string): string {
  return text.replace(/([\\`*_{}[\]#|])/g, "\\$1");
}

function quoteBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export function guideToMarkdown(b: SeasonBundle): string {
  const g = assembleGuide(b);
  const r = b.retrospective;
  const workById = new Map(b.works.map((w) => [w.id, w]));
  const out: string[] = [];
  const own = (key: keyof Retrospective) => {
    const text = r ? htmlToText(r[key] as string | null) : "";
    if (text) out.push(text, "");
  };

  out.push(`# ${mdEscape(b.season.title)}`, "");
  out.push(`*A reader’s guide to ${mdEscape(b.author.name)}*`, "");
  const dates = [b.season.start_date && `Began ${formatDay(b.season.start_date)}`, b.season.completed_on && `completed ${formatDay(b.season.completed_on)}`]
    .filter(Boolean)
    .join(", ");
  out.push(`Status: ${SEASON_STATUS[b.season.status]}${dates ? ` · ${dates}` : ""}`, "");

  out.push("## Why I began", "");
  if (b.season.purpose) out.push(quoteBlock(b.season.purpose), "", "*— from my stated purpose at the start*", "");
  own("why_began_html");

  out.push("## Works read", "");
  if (g.worksRead.length) {
    for (const w of g.worksRead) {
      out.push(`- *${mdEscape(w.title)}* (${w.year})${w.finishedOn ? ` — finished ${formatDay(w.finishedOn)}` : ""}${w.sessions > 1 ? ` · ${w.sessions} readings` : ""}`);
    }
    out.push("");
  } else out.push("_No works marked finished._", "");
  own("works_read_html");

  out.push("## Favorite works and why", "");
  for (const f of g.favorites) out.push(`- *${mdEscape(f.title)}*${f.note ? ` — ${mdEscape(f.note)}` : ""}`);
  if (g.favorites.length) out.push("");
  own("favorites_html");

  out.push("## Selected quotations", "");
  for (const q of g.quotations) {
    const work = q.work_id ? workById.get(q.work_id) : null;
    out.push(quoteBlock(q.quote_text ?? ""), "");
    const source = [work?.title && `*${mdEscape(work.title)}*`, q.quote_locator, q.quote_source].filter(Boolean).join(", ");
    if (source) out.push(`— ${source}`, "");
    const mine = htmlToText(q.body_html);
    if (mine) out.push(`**My note:** ${mine}`, "");
  }
  own("quotations_html");

  out.push("## Recurring themes", "");
  for (const t of g.themes) {
    out.push(`### ${mdEscape(t.name)}`, "", `${t.entryCount} ${t.entryCount === 1 ? "note" : "notes"}`, "");
    if (t.synthesis) out.push(t.synthesis, "");
  }
  own("themes_html");

  out.push("## Unresolved questions", "");
  for (const q of g.openQuestions) {
    const text = q.title || htmlToText(q.body_html);
    out.push(`- ${mdEscape(text.split("\n")[0])} *(${QUESTION_STATUS[q.question_status ?? "open"].label.toLowerCase()})*`);
  }
  if (g.openQuestions.length) out.push("");
  own("questions_html");

  out.push("## My recommended reading order", "");
  own("recommended_order_html");
  if (g.routeOrder.length) {
    out.push("*The route as I arranged it this season:*", "");
    g.routeOrder.forEach((s, i) => out.push(`${i + 1}. *${mdEscape(s.title)}*${s.rationale ? ` — ${mdEscape(s.rationale)}` : ""}`));
    out.push("");
  }

  out.push("## What I’m carrying forward", "");
  for (const i of g.inheritance) {
    out.push(`- **${mdEscape(i.title)}** (${i.category})${i.takeaway ? ` — ${i.takeaway.replace(/\n+/g, " ")}` : ""}${i.intention ? ` *Intention:* ${mdEscape(i.intention)}` : ""}`);
  }
  if (g.inheritance.length) out.push("");
  own("carrying_forward_html");

  if (g.keptEntries.length) {
    out.push("## Notes kept for this guide", "");
    for (const e of g.keptEntries) {
      out.push(`**${ENTRY_KINDS[e.kind].label}**${e.title ? `: ${mdEscape(e.title)}` : ""}`, "", htmlToText(e.body_html), "");
    }
  }

  out.push("## Concluding essay", "");
  own("concluding_essay_html");

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export const EXPORT_FORMAT = "the-apprenticeship/season@1";

/**
 * Structured export of one season with every record and relationship needed
 * to recover it later: ids are preserved, and provenance, sources and links
 * are kept as stored.
 */
export function seasonToJson(b: SeasonBundle) {
  const seasonWorkIds = new Set(b.seasonWorks.map((sw) => sw.work_id));
  const works = b.works.filter((w) => seasonWorkIds.has(w.id));
  const workIds = new Set(works.map((w) => w.id));
  return {
    format: EXPORT_FORMAT,
    exported_at: new Date().toISOString(),
    notes: {
      provenance: PROVENANCE,
      scopes: Object.fromEntries(Object.entries(SCOPES).map(([k, v]) => [k, v.label])),
      relations: Object.fromEntries(Object.entries(LINK_RELATIONS).map(([k, v]) => [k, v.label])),
      positions: "reading_sessions.position_kind + position_value; e.g. " + formatPosition("page", "12"),
    },
    author: b.author,
    author_facts: b.authorFacts,
    apprenticeship: b.season,
    season_events: b.events,
    season_snapshots: b.snapshots,
    works,
    editions: b.editions.filter((e) => workIds.has(e.work_id)),
    collection_members: b.collectionMembers.filter((c) => workIds.has(c.collection_work_id) || workIds.has(c.member_work_id)),
    apprenticeship_works: b.seasonWorks,
    route_sections: b.sections,
    route_steps: b.steps,
    route_intentions: b.intentions,
    reading_sessions: b.sessions,
    entries: b.entries,
    themes: b.themes,
    entry_themes: b.entryThemes,
    entry_links: b.links,
    question_carries: b.carries,
    inheritance_entries: b.inheritance,
    inheritance_links: b.inheritanceLinks,
    retrospective: b.retrospective,
    external_links: b.externalLinks,
  };
}

export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "season";
}
