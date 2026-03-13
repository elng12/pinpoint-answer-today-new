import localFont from "next/font/local";

export const inter = localFont({
  src: [{ path: "../public/fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" }],
  preload: true,
  display: "swap",
  variable: "--font-sans",
  adjustFontFallback: "Arial",
});
