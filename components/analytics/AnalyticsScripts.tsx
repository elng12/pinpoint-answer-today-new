import Script from "next/script";

const ENABLE_GA = process.env.NEXT_PUBLIC_ENABLE_GA === "true";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "";
export function AnalyticsScripts() {
  if (!ENABLE_GA || !GA_MEASUREMENT_ID) {
    return null;
  }

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
        script.src = "https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}";
        document.head.appendChild(script);

        window.gtag("js", new Date());
        window.gtag("config", "${GA_MEASUREMENT_ID}", {
          anonymize_ip: true,
          transport_type: "beacon"
        });
      }

      eventNames.forEach(function(eventName) {
        window.addEventListener(eventName, loadAnalytics, { once: true, passive: true });
      });

    })();
  `;

  return (
    <Script id="gtag-bootstrap" strategy="afterInteractive">
      {bootstrapAnalytics}
    </Script>
  );
}
