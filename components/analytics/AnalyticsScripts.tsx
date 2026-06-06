import Script from "next/script";

const DEFAULT_GA_MEASUREMENT_ID = "G-29HBZ29S1Y";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || DEFAULT_GA_MEASUREMENT_ID;

export function AnalyticsScripts() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  const measurementIdLiteral = JSON.stringify(GA_MEASUREMENT_ID);
  const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

  const bootstrapAnalytics = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag("js", new Date());
    gtag("config", ${measurementIdLiteral}, {
      anonymize_ip: true,
      transport_type: "beacon"
    });
  `;

  return (
    <>
      <Script async src={scriptSrc} strategy="afterInteractive" />
      <Script id="gtag-bootstrap" strategy="afterInteractive">
        {bootstrapAnalytics}
      </Script>
    </>
  );
}
