export const routes = {
  home: "/",
  preview: "/next-pinpoint-preview",
  archive: "/puzzles",
  detail: (slug: string) => `/linkedin-pinpoint-answers/${slug}/`,
  about: "/about-us",
  contact: "/contact-us",
  privacy: "/privacy",
  terms: "/terms",
  disclaimer: "/disclaimer",
} as const;
