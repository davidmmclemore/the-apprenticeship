import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import { Providers } from "@/components/providers";
import { ConnectionBanner, ServiceWorker } from "@/components/app-shell";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  style: ["normal", "italic"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The Apprenticeship",
    template: "%s · The Apprenticeship",
  },
  description: "A season inside an author’s work: where you are, what you notice, what to read next, and what you carry forward.",
  applicationName: "The Apprenticeship",
  appleWebApp: {
    capable: true,
    title: "Apprenticeship",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5efe3" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1814" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Providers>
          <ConnectionBanner />
          {children}
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
