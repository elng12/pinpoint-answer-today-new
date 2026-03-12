import { createSocialImageResponse, socialImageSize } from "@/lib/seo/social-image";
import { siteName } from "@/lib/site/config";

export const runtime = "edge";
export const alt = `${siteName} social preview`;
export const size = {
  width: socialImageSize.width,
  height: socialImageSize.height,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return createSocialImageResponse({
    eyebrow: siteName,
    title: "Daily LinkedIn Pinpoint answers, hints, and archive walkthroughs.",
    subtitle:
      "Fast reveal for today. Clear explanation for every clue. Clean archive for past puzzles.",
  });
}
