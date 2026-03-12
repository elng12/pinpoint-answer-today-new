import type { Metadata } from "next";
import { ContactFeedbackForm } from "@/components/contact/ContactFeedbackForm";
import { StructuredData } from "@/components/seo/StructuredData";
import { routes } from "@/lib/paths/routes";
import { absoluteUrl, buildPageMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "Contact Us | Pinpoint Answer Today",
    description:
      "Contact Pinpoint Answer Today for corrections, support, and feedback about puzzle answers or archive quality.",
    path: routes.contact,
  });
}

export default function ContactPage() {
  const supportEmail = "support@pinpointanswertoday.app";
  const detailItems = [
    "Include the puzzle number if you know it.",
    "Tell us where the walkthrough felt thin, confusing, or too late.",
    "Share whether you wanted faster hints, clearer analysis, or better archive filters.",
  ];
  const structuredDataItems = [
    {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      name: "Contact Pinpoint Answer Today",
      url: absoluteUrl(routes.contact),
      mainEntity: {
        "@type": "Organization",
        name: "Pinpoint Answer Today",
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: supportEmail,
          },
        ],
      },
    },
  ];

  return (
    <main className="container contact-page-shell">
      <StructuredData items={structuredDataItems} />
      <section className="surface surface-block">
        <div className="contact-hero-grid">
          <div>
            <p className="eyebrow">Support</p>
            <h1 className="section-title">Contact Us</h1>
            <p className="copy">
              This page now absorbs the old feedback flow. Use it for corrections, archive issues,
              feature requests, or anything that would make the new site more useful.
            </p>

            <div className="contact-card-row">
              <div className="contact-info-card">
                <p className="detail-overview-kicker">Email</p>
                <a className="contact-email-link" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
                <p className="copy contact-email-copy">
                  Best for direct support or anything sensitive that should not sit in a form.
                </p>
              </div>

              <div className="contact-info-card">
                <p className="detail-overview-kicker">What to include</p>
                <ul className="contact-note-list">
                  {detailItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <aside className="contact-side-card">
            <p className="detail-overview-kicker">Fast review checklist</p>
            <h2 className="contact-side-title">What helps most</h2>
            <ul className="contact-note-list">
              {detailItems.map((item) => (
                <li key={`side-${item}`}>{item}</li>
              ))}
            </ul>
            <p className="muted-small contact-side-note">
              We review feedback daily and use repeated issues to prioritize updates.
            </p>
          </aside>
        </div>

        <div className="contact-form-wrap">
          <ContactFeedbackForm />
        </div>
      </section>
    </main>
  );
}
