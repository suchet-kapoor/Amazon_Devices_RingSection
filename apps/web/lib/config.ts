/**
 * Environment loading for the demo.
 *
 * Only a few concerns read from env: where the database lives, the vision
 * model that identifies the animal (OpenRouter), and - optional - the Ring
 * knowledge MCP gateway override (the default comes from `mcp.json`).
 * Ring's device API (OAuth, webhooks, HMAC, token vault) stays out of scope.
 */

export interface AppConfig {
  /** Postgres connection string; when absent the embedded PGlite database is used. */
  databaseUrl: string | undefined;
  /** PGlite data directory; a path persists across restarts. */
  pgliteDataDir: string;
  /** OpenRouter key - the classifier for the demo. */
  openRouterApiKey: string | undefined;
  openRouterModel: string | undefined;
  openRouterBaseUrl: string | undefined;
  /** Ring knowledge MCP gateway URL; when absent it is read from `mcp.json`. */
  ringMcpUrl: string | undefined;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    databaseUrl: readEnv(env, 'DATABASE_URL'),
    pgliteDataDir: readEnv(env, 'PGLITE_DATA_DIR') ?? '.pglite',
    openRouterApiKey: readEnv(env, 'OPENROUTER_API_KEY'),
    openRouterModel: readEnv(env, 'OPENROUTER_VISION_MODEL'),
    openRouterBaseUrl: readEnv(env, 'OPENROUTER_BASE_URL'),
    ringMcpUrl: readEnv(env, 'RING_MCP_URL'),
  };
}
