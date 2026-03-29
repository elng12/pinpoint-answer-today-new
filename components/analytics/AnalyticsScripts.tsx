import Script from "next/script";

const ENABLE_GA = process.env.NEXT_PUBLIC_ENABLE_GA === "true";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "";
const ANALYTICS_IDLE_TIMEOUT_MS = 15000;

export function AnalyticsScripts() {
  if (!ENABLE_GA || !GA_MEASUREMENT_ID) {
    return null;
  }

  const measurementIdLiteral = JSON.stringify(GA_MEASUREMENT_ID);
  const scriptSrcLiteral = JSON.stringify(
    `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
  );

  const bootstrapAnalytics = `
    (function() {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };

      var hasLoaded = false;
      var eventNames = ["pointerdown", "keydown", "touchstart"];

      function loadAnalytics() {
        if (hasLoaded) {
          return;
        }

        hasLoaded = true;
        eventNames.forEach(function(eventName) {
          window.removeEventListener(eventName, loadAnalytics);
        });

        var script = document.createElement("script");
        script.async = true;
        script.src = ${scriptSrcLiteral};
        document.head.appendChild(script);

        window.gtag("js", new Date());
        window.gtag("config", ${measurementIdLiteral}, {
          anonymize_ip: true,
          transport_type: "beacon"
        });
      }

      eventNames.forEach(function(eventName) {
        window.addEventListener(eventName, loadAnalytics, { once: true, passive: true });
      });

      window.setTimeout(loadAnalytics, ${ANALYTICS_IDLE_TIMEOUT_MS});
    })();
  `;

  return (
    <Script id="gtag-bootstrap" strategy="afterInteractive">
      {bootstrapAnalytics}
    </Script>
  );
}
