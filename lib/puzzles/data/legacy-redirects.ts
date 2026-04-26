import { cache } from "react";
import { fetchRegistry } from "@/lib/puzzles/data-sources";
import {
  buildLegacyFamilyRedirectIndex,
  getLegacyResolvedSlug,
  resolveLegacyConnectorRedirect,
  resolveLegacyThemeOrConnectorRedirect,
  resolveLegacyThemeRedirect,
  type LegacyFamilyRedirectIndex,
} from "@/lib/puzzles/data/legacy-redirect-index";

const getLegacyRedirectIndex = cache(async (): Promise<LegacyFamilyRedirectIndex> => {
  return buildLegacyFamilyRedirectIndex(await fetchRegistry());
});

export async function getLegacyThemeRedirectSlug(legacySlug: string): Promise<string | null> {
  return getLegacyResolvedSlug(resolveLegacyThemeRedirect(await getLegacyRedirectIndex(), legacySlug));
}

export async function getLegacyThemeOrConnectorRedirectSlug(
  legacySlug: string,
): Promise<string | null> {
  return getLegacyResolvedSlug(
    resolveLegacyThemeOrConnectorRedirect(await getLegacyRedirectIndex(), legacySlug),
  );
}

export async function getLegacyConnectorRedirectSlug(legacySlug: string): Promise<string | null> {
  return getLegacyResolvedSlug(resolveLegacyConnectorRedirect(await getLegacyRedirectIndex(), legacySlug));
}
