const DEFAULT_API_URL = "http://localhost:4000";

/**
 * Base URL for the Fastify API.
 * - unset → http://localhost:4000 (local dev with CORS)
 * - empty string → same-origin relative paths (Docker + Caddy)
 * - https://… → cross-origin (Vercel frontend → EC2 API)
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (fromEnv !== undefined) return fromEnv;
  return DEFAULT_API_URL;
}

/** Resolve an API path against the configured base URL. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  if (!base) return normalized;
  return `${base.replace(/\/$/, "")}${normalized}`;
}
