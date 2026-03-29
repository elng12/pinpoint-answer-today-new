import type { FooterBadge } from "@/lib/site/badges";

type FooterBadgeWallProps = {
  badges: FooterBadge[];
  heading: string;
};

const FOOTER_BADGE_DOFOLLOW_REL = "noopener noreferrer";
const FOOTER_BADGE_NOFOLLOW_REL = "noopener noreferrer nofollow sponsored";

function normalizeRel(rel: string): string {
  const tokens = rel
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const tokenSet = new Set(tokens);
  tokenSet.add("noopener");
  tokenSet.add("noreferrer");
  return Array.from(tokenSet).join(" ");
}

function getFooterBadgeRel(badge: FooterBadge): string {
  const fallbackRel = badge.dofollow ? FOOTER_BADGE_DOFOLLOW_REL : FOOTER_BADGE_NOFOLLOW_REL;
  const overrideRel = badge.rel?.trim();

  if (!overrideRel) {
    return fallbackRel;
  }

  return normalizeRel(overrideRel);
}

function shouldOpenFooterBadgeInNewTab(badge: FooterBadge): boolean {
  return badge.newTab !== false;
}

export function FooterBadgeWall({ badges, heading }: FooterBadgeWallProps) {
  if (!badges.length) {
    return null;
  }

  return (
    <section aria-label={heading} className="footer-badge-wall">
      <p className="eyebrow footer-badge-heading">{heading}</p>
      <ul className="footer-badge-list">
        {badges.map((badge) => {
          const rel = getFooterBadgeRel(badge);
          const openInNewTab = shouldOpenFooterBadgeInNewTab(badge);
          const isTextBadge = badge.kind === "text";
          const className = `footer-badge-link${isTextBadge ? " footer-badge-link-text" : ""}`;

          return (
            <li key={badge.name} className="footer-badge-item">
              {/* eslint-disable-next-line react/jsx-no-target-blank -- rel is normalized to include noopener/noreferrer for new-tab badges. */}
              <a
                href={badge.url}
                target={openInNewTab ? "_blank" : undefined}
                rel={openInNewTab ? rel : undefined}
                aria-label={badge.alt}
                className={className}
              >
                {isTextBadge ? (
                  badge.text
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={badge.image}
                    alt={badge.alt}
                    width={badge.width}
                    height={badge.height}
                    loading="lazy"
                    decoding="async"
                    className="footer-badge-image"
                  />
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
