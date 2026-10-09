import createDOMPurify, { type DOMPurify, type WindowLike } from "dompurify";

/**
 * The only markup notes may contain: paragraphs, line breaks, emphasis,
 * block quotes and lists. No attributes, links, images, styles or scripts.
 * Applied both before saving and again before rendering.
 */
export const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "del", "blockquote", "ul", "ol", "li"];

const CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR: [] as string[],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
} as const;

let purifier: DOMPurify | null = null;

/** Lets tests (or a server context) supply a DOM window, e.g. from jsdom. */
export function configureSanitizer(win: WindowLike) {
  purifier = createDOMPurify(win);
}

function getPurifier(): DOMPurify | null {
  if (purifier) return purifier;
  if (typeof window !== "undefined") {
    purifier = createDOMPurify(window);
    return purifier;
  }
  return null;
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  const p = getPurifier();
  if (!p) {
    // No DOM available: degrade to plain, escaped text rather than trusting markup.
    return `<p>${escapeText(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())}</p>`;
  }
  return String(p.sanitize(html, CONFIG));
}

/** True when sanitized HTML has no visible text. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;| /g, " ").trim().length === 0;
}

/** Convert plain text (with line breaks) into safe paragraph HTML. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeText(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
