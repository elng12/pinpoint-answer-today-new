import localFont from "next/font/local";

export const inter = localFont({
  src: [
    { path: "../public/fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  preload: true,
  display: "swap",
  variable: "--font-sans",
  adjustFontFallback: "Arial",
});

export const spaceGrotesk = localFont({
  src: [
    { path: "../public/fonts/space-grotesk-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/space-grotesk-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  preload: false,
  display: "swap",
  variable: "--font-space-grotesk",
  adjustFontFallback: "Arial",
});
