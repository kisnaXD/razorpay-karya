import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { tokenCss } from "@karya/tokens";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["italic", "normal"],
  variable: "--font-newsreader",
  display: "swap",
});

const ibmSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-sans",
  display: "swap",
});

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-ibm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Karya",
  description: "Operations console for Arka Atelier",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${ibmSans.variable} ${ibmMono.variable} h-full`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokenCss }} />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root {
  --font-display: var(--font-newsreader), Georgia, serif;
  --font-sans: var(--font-ibm-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-ibm-mono), ui-monospace, monospace;
}`,
          }}
        />
      </head>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
