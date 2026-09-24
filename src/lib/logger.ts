import { env } from "../config/env.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

type Level = keyof typeof LEVELS;
type Context = Record<string, unknown>;

const threshold = LEVELS[env.LOG_LEVEL ?? (env.isProduction ? "info" : "debug")];

// Error properties are non-enumerable, so JSON.stringify would log them as {}.
function serialize(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  return {
    name: value.name,
    message: value.message,
    stack: value.stack,
    ...(value.cause !== undefined && { cause: serialize(value.cause) }),
  };
}

function write(level: Level, message: string, context: Context = {}) {
  if (LEVELS[level] < threshold) return;

  const fields = Object.fromEntries(Object.entries(context).map(([key, value]) => [key, serialize(value)]));
  const print = level === "warn" || level === "error" ? console.error : console.log;

  // One JSON object per line in production so Render's log search can filter on fields.
  if (env.isProduction) {
    print(JSON.stringify({ time: new Date().toISOString(), level, message, ...fields }));
    return;
  }

  const time = new Date().toISOString().slice(11, 23);
  const extra = Object.keys(fields).length > 0 ? [fields] : [];
  print(`${time} ${level.toUpperCase().padEnd(5)} ${message}`, ...extra);
}

export const logger = {
  debug: (message: string, context?: Context) => write("debug", message, context),
  info: (message: string, context?: Context) => write("info", message, context),
  warn: (message: string, context?: Context) => write("warn", message, context),
  error: (message: string, context?: Context) => write("error", message, context),
};
