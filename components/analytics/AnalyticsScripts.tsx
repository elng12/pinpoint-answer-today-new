import Script from "next/script";

const ENABLE_GA = process.env.NEXT_PUBLIC_ENABLE_GA === "true";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "";
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_ID?.trim() || "";

export function AnalyticsScripts() {
  if (!ENABLE_GA || !GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      {ADSENSE_CLIENT_ID ? (
        <Script
          id="adsense-loader"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
          crossOrigin="anonymous"
          strategy="lazyOnload"
        />
      ) : null}
      <Script
        id="gtag-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="lazyOnload"
      />
      <Script id="gtag-config" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            anonymize_ip: true,
            transport_type: 'beacon'
          });
        `}
      </Script>
    </>
  );
}
