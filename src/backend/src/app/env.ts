import type { SendEmailQueueMessage } from "@/send-email/send-email.types";

/**
 * Cloudflare Worker environment bindings.
 *
 * Kept here (instead of the entry point) so configuration code never imports the
 * runtime entry. The standalone runtime will introduce a portable `AppEnv` and
 * keep this type as the Cloudflare adapter's shape (REDESIGN_HOMESCRIPT.md, S2).
 */
export type Bindings = {
  // Current AES-256 key (64 hex). Encrypts every new value.
  ENCRYPTION_KEY?: string;
  // Decrypt-only keys kept during a rotation, comma-separated. Remove once the
  // key-rotation job reports nothing left to re-encrypt.
  ENCRYPTION_KEY_PREVIOUS?: string;
  // Legacy name of the key: still read (see resolveEncryptionKeys) until it is deleted.
  AES_256_KEY?: string;
  makisend_db: D1Database;
  BETTER_AUTH_SECRET: string;
  // Optional: unset, both default to the origin the request arrived on (withPublicUrls).
  BETTER_AUTH_URL?: string;
  FRONTEND_URL?: string;
  // "off" disables the auth rate limiter (local dev and tests only). Anything else, or
  // unset, keeps it on: production and preview never set it.
  RATE_LIMIT?: string;
  // Optional per-API-key send quota on POST /send-email, e.g. "100/min" or "5000/day".
  // Unset (the default): no quota. Over the limit: 429 + Retry-After.
  SEND_RATE_LIMIT?: string;
  // New-release check (src/updates): "off" stops every request to GitHub. Unset: on.
  UPDATE_CHECK?: string;
  // Repository the releases are read from, `owner/name`. Default: lixalistudio-oss/makisend.
  UPDATE_SOURCE_REPOSITORY?: string;
  // This instance's own copy of the repo (`owner/name`): links "Update" to its sync workflow.
  MAKISEND_REPOSITORY?: string;
  SEND_EMAIL_QUEUE: Queue<SendEmailQueueMessage>;
  SEND_EMAIL_DLQ: Queue<SendEmailQueueMessage>;
  SEND_EMAIL_WORKFLOW: Workflow;
  // Cloudflare Email Service. Optional: unused unless an SMTP configuration points at
  // smtp.mx.cloudflare.net, which only this binding can reach from a Worker.
  EMAIL?: SendEmail;
  // Static assets binding (frontend/dist) — handled by the platform before the
  // Worker script; declared so the Bindings type matches wrangler.jsonc.
  ASSETS: Fetcher;
};

/** Hono context variables set per request (session or API key). */
export type UserInfoVariables = {
  userConfig: UserConfig;
  smtpConfig: SmtpConfig;
  userId: string;
  apiKeyId: string;
  smtpConfigId: string;
};

export interface SmtpConfig {
  smtpHostName: string;
  /** Optional only for rows read before the port/security columns existed. */
  smtpPort?: number;
  smtpSecurity?: "tls" | "starttls";
  senderEmail: string;
  smtpUsername: string;
  smtpPassword: string;
}

export interface UserConfig {
  userId: string;
}

/**
 * `BETTER_AUTH_URL` and `FRONTEND_URL` are optional: the Worker serves the dashboard and the
 * API on one origin, so when they are unset the origin the request arrived on is used. That
 * lets the "Deploy to Cloudflare" button install MakiSend before its workers.dev URL is known.
 * On Workers the request URL's host is the hostname Cloudflare routed to this Worker.
 */
export function withPublicUrls(env: Bindings, requestUrl?: string): Bindings {
  const origin = requestUrl ? new URL(requestUrl).origin : undefined;
  const baseUrl = env.BETTER_AUTH_URL?.trim() || origin;
  const frontendUrl = env.FRONTEND_URL?.trim() || baseUrl;
  if (baseUrl === env.BETTER_AUTH_URL && frontendUrl === env.FRONTEND_URL) return env;
  return { ...env, BETTER_AUTH_URL: baseUrl ?? "", FRONTEND_URL: frontendUrl ?? "" };
}
