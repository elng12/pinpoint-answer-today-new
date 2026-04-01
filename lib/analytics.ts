"use client";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackClientEvent(action: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return false;
  }

  window.gtag("event", action, params);
  return true;
}

export function trackClientEventWhenReady(
  action: string,
  params?: Record<string, unknown>,
  attemptsRemaining = 8,
) {
  if (trackClientEvent(action, params) || typeof window === "undefined" || attemptsRemaining <= 0) {
    return;
  }

  window.setTimeout(() => {
    trackClientEventWhenReady(action, params, attemptsRemaining - 1);
  }, 500);
}

export function getScrollDepthPercent() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return 0;
  }

  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = Math.max(window.scrollY, doc.scrollTop, body?.scrollTop ?? 0);
  const scrollHeight = Math.max(doc.scrollHeight, body?.scrollHeight ?? 0);
  const viewportHeight = Math.max(window.innerHeight, doc.clientHeight);
  const maxScrollable = Math.max(scrollHeight - viewportHeight, 1);
  const ratio = Math.min(Math.max(scrollTop / maxScrollable, 0), 1);
  return Math.round(ratio * 100);
}
