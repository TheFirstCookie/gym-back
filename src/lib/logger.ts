import { env } from "../config/env.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

type Level = keyof typeof LEVELS;
type Context = Record<string, unknown>;

const threshold = LEVELS[env.LOG_LEVEL ?? (env.isProduction ? "info" : "debug")];

// Error properties are non-enumerable, so JSON.stringify would log them as {}.
function serialize(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/cs_(?:test|live)_[A-Za-z0-9]+/g, "[checkout]");
  if (Array.isArray(value)) return value.map(serialize);
  if (!(value instanceof Error)) {
    return value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)])) : value;
  }
  return {
    name: value.name,
    message: serialize(value.message),
    stack: serialize(value.stack),
    ...(value.cause !== undefined && { cause: serialize(value.cause) }),
  };
}

function write(level: Level, message: string, context: Context = {}) {
  message = String(serialize(message));
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
