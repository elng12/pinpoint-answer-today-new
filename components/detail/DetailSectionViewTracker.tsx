"use client";

import { useEffect, useRef } from "react";
import {
  getScrollDepthPercent,
  trackClientEventWhenReady,
} from "@/lib/analytics";

type DetailSectionViewTrackerProps = {
  sectionId: string;
  eventName: string;
  eventParams?: Record<string, unknown>;
  threshold?: number;
};

export function DetailSectionViewTracker({
  sectionId,
  eventName,
  eventParams,
  threshold = 0.25,
}: DetailSectionViewTrackerProps) {
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    let retryTimer: number | null = null;

    const attachObserver = () => {
      if (hasTrackedRef.current) {
        return;
      }

      const section = document.getElementById(sectionId);
      if (!section) {
        retryTimer = window.setTimeout(attachObserver, 250);
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry?.isIntersecting || hasTrackedRef.current) {
            return;
          }

          hasTrackedRef.current = true;
          trackClientEventWhenReady(eventName, {
            ...eventParams,
            scroll_depth_percent: getScrollDepthPercent(),
          });
          observer?.disconnect();
        },
        { threshold },
      );

      observer.observe(section);
    };

    attachObserver();

    return () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      observer?.disconnect();
    };
  }, [eventName, eventParams, sectionId, threshold]);

  return null;
}
