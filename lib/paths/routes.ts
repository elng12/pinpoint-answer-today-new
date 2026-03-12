export const routes = {
  home: "/",
  preview: "/next-pinpoint-preview",
  archive: "/puzzles",
  detail: (slug: string) => `/linkedin-pinpoint-answers/${slug}`,
  featured: "/featured",
  about: "/about-us",
  contact: "/contact-us",
  feedback: "/feedback",
  privacy: "/privacy",
  terms: "/terms",
  disclaimer: "/disclaimer",
} as const;
