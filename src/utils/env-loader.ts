// src/utils/env-loader.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const LOG_PREFIX = "[EnvLoader]";
const ENV_FILE_NAME = ".env";
let envLoaded = false;

export function loadEnv() {
  if (envLoaded) return;
  envLoaded = true;

  try {
    const envPath = join(process.cwd(), ENV_FILE_NAME);
    if (!existsSync(envPath)) {
      console.warn(`${LOG_PREFIX} ⚠️ No ${ENV_FILE_NAME} file found`);
      return;
    }
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      const [key, ...rest] = line.split("=");
      if (!key) continue;
      const value = rest
        .join("=")
        .trim()
        .replace(/^['"]|['"]$/g, "");
      process.env[key.trim()] = value;
    }
    console.log(`${LOG_PREFIX} ✅ Loaded env from ${ENV_FILE_NAME}`);
  } catch (e) {
    console.warn(`${LOG_PREFIX} ❌ Failed to load ${ENV_FILE_NAME}`, e);
  }
}
