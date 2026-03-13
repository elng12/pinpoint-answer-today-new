export type LogLevel = "info" | "warn" | "error";

type LogOptions = {
  component?: string;
} & Record<string, unknown>;

function normalizePayload(options?: LogOptions) {
  if (!options) return {};
  try {
    return JSON.parse(
      JSON.stringify(options, (_key, value) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }
        return value;
      }),
    ) as Record<string, unknown>;
  } catch (error) {
    return {
      serializationError: (error as Error)?.message ?? "unknown",
    };
  }
}

function log(level: LogLevel, message: string, options?: LogOptions) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...normalizePayload(options),
  };

  console[level](JSON.stringify(entry));
}

export const appLogger = {
  info(message: string, options?: LogOptions) {
    log("info", message, options);
  },
  warn(message: string, options?: LogOptions) {
    log("warn", message, options);
  },
  error(message: string, options?: LogOptions) {
    log("error", message, options);
  },
};

