import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...props,
});

export const DeskIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 19V9.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 9.5V19" />
    <path d="M2.5 19h19" />
    <path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V8" />
    <path d="M12 12v3" />
  </svg>
);

export const WorksIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4.5h3.5v15H4z" />
    <path d="M7.5 6.5H11v13H7.5z" />
    <path d="m12.5 6.2 3.3-.9 3.7 13.6-3.3.9z" />
  </svg>
);

export const RouteIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="18" r="2" />
    <path d="M8 6h6.5a3.5 3.5 0 0 1 0 7h-5a3.5 3.5 0 0 0 0 7H16" />
  </svg>
);

export const NotebookIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3.5h11.5A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5H6z" />
    <path d="M6 3.5v17M3.5 7.5H6M3.5 12H6M3.5 16.5H6" />
    <path d="M10 8.5h5.5M10 12h5.5" />
  </svg>
);

export const InheritanceIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21c-4.5-3-7.5-6.2-7.5-10A4.5 4.5 0 0 1 12 7.6 4.5 4.5 0 0 1 19.5 11c0 3.8-3 7-7.5 10Z" />
    <path d="M12 7.6V3.5" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const PenIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14.5 5.5 18.5 9.5" />
    <path d="M4 20l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19 4 20Z" />
  </svg>
);

export const BackIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);

export const UpIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 15 6-6 6 6" />
  </svg>
);

export const DownIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);

export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? "currentColor" : "none"}>
    <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8z" />
  </svg>
);

export const BookmarkIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? "currentColor" : "none"}>
    <path d="M6.5 3.5h11v17L12 16.5l-5.5 4z" />
  </svg>
);

export const MoreIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const LinkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);

export function BrandMark(p: IconProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden focusable={false} {...p}>
      <rect x="6" y="6" width="52" height="52" rx="12" fill="#7b2d1e" />
      <path d="M20 44V20.5c4.5-1.6 8.6-1.3 12 1.2 3.4-2.5 7.5-2.8 12-1.2V44c-4.5-1.6-8.6-1.3-12 1.2-3.4-2.5-7.5-2.8-12-1.2Z" fill="none" stroke="#f5e9d3" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 21.7v23.5" stroke="#f5e9d3" strokeWidth="2.4" />
    </svg>
  );
}
