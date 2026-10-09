import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "The Apprenticeship",
    short_name: "Apprenticeship",
    description: "A sustained season inside an author’s work.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5efe3",
    theme_color: "#f5efe3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
