import { appLogger } from "@/lib/logger";

export type DebugLogger = (message: string, details?: Record<string, unknown>) => void;

const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_AI === "true";

export const debugInfo: DebugLogger = (message, details) => {
  if (!DEBUG) return;
  appLogger.info(message, { component: "puzzle-generation", ...details });
};

export const debugError: DebugLogger = (message, details) => {
  if (!DEBUG) return;
  appLogger.error(message, { component: "puzzle-generation", ...details });
};

