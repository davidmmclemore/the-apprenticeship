"use client";

import { useState } from "react";

const CLOTHS = ["#6b2f24", "#2f4b3b", "#2c4560", "#7a5a2a", "#4a3a5c", "#5b4636", "#3b5157", "#6d3b47", "#425236", "#33363d"];

export function clothFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CLOTHS[h % CLOTHS.length];
}

interface CoverProps {
  title: string;
  author?: string | null;
  url?: string | null;
  width?: number;
  /** Decorative when the title is already shown next to the cover. */
  decorative?: boolean;
}

export function Cover({ title, author, url, width = 96, decorative = true }: CoverProps) {
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;
  return (
    <div
      className="cover"
      style={{ ["--cover-w" as string]: `${width}px`, ["--cloth" as string]: clothFor(title) }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `Cover of ${title}`}
      aria-hidden={decorative || undefined}
    >
      {showImage ? (
        // Covers are arbitrary external URLs the reader chose; next/image would need a domain allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <div className="cover-placeholder">
          <div className="cover-title">{title}</div>
          <div>
            <div className="cover-rule" />
            {author && <div className="cover-author">{author}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
