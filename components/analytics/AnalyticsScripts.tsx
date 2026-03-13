"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const ENABLE_GA = process.env.NEXT_PUBLIC_ENABLE_GA === "true";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "";
const ANALYTICS_IDLE_TIMEOUT_MS = 15000;

export function AnalyticsScripts() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!ENABLE_GA || !GA_MEASUREMENT_ID || typeof window === "undefined") {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      ((...args: unknown[]) => {
        window.dataLayer?.push(args);
      });

    const activate = () => {
      setShouldLoad(true);
    };

    const interactionEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, activate, { once: true, passive: true });
    });

    const timeoutId = window.setTimeout(activate, ANALYTICS_IDLE_TIMEOUT_MS);

    return () => {
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, activate);
      });
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!ENABLE_GA || !GA_MEASUREMENT_ID) {
    return null;
  }

  if (!shouldLoad) {
    return null;
  }

  return (
    <>
      <Script
        id="gtag-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-config" strategy="afterInteractive">
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
