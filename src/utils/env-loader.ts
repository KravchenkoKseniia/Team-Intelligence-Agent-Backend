import { existsSync, readFileSync } from "fs";
import { join } from "path";

export function loadEnv(envPath = ".env") {
  const file = join(process.cwd(), envPath);
  if (!existsSync(file)) return;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (key && process.env[key] === undefined)
      process.env[key] = stripQuotes(val);
  }
}

export function normalizeEnv(v?: string | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? stripQuotes(t) : undefined;
}

export function stripQuotes(s: string) {
  return s.replace(/^['"]|['"]$/g, "");
}
