export const locales = ["en", "pt-BR", "fr", "de"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const publicLocales: readonly Locale[] = [defaultLocale];

