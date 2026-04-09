export const ANTHROPIC_KEY_COOKIE = "psv_anthropic_key";

/**
 * Returns the Anthropic API key from the environment variable (priority)
 * or from the request cookie set via the Settings page.
 */
export function getAnthropicApiKey(cookieValue?: string): string | undefined {
  return process.env.ANTHROPIC_API_KEY || cookieValue || undefined;
}
