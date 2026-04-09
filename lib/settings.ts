import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const SETTINGS_PATH = join(process.cwd(), "config", "settings.json");

export interface AppSettings {
  anthropicApiKey?: string;
}

export function readSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_PATH)) return {};
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    return JSON.parse(raw) as AppSettings;
  } catch {
    return {};
  }
}

export function writeSettings(settings: AppSettings): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || readSettings().anthropicApiKey;
}
