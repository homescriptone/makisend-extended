import { Hono } from "hono";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";

import { errorHandler } from "@/middleware/error.handler";
import { requestLoggerMiddleware } from "@/middleware/request-logger.middleware";
import { securityHeadersMiddleware } from "@/middleware/security-headers.middleware";
import { configMiddleware } from "@/middleware/config.middleware";
import { apiKeyMiddleware } from "@/middleware/api-key.middleware";
import { sessionMiddleware } from "@/middleware/session.middleware";

import { createSendEmailController } from "@/send-email";
import { createSmtpConfigController } from "@/smtp-config";
import { createApiKeysController } from "@/api-keys";
import { createEmailLogsController } from "@/email-logs";
import { createDashboardController } from "@/dashboard";
import { createTemplatesController } from "@/templates";
import { idempotencyMiddleware } from "@/idempotency";
import { sendRateLimitMiddleware } from "@/send-rate-limit";
import { openApiDocument } from "@/openapi";
import { createUpdatesController } from "@/updates";
import { checkEncryptionKeys } from "@/config/config";
import { needsSetup } from "@/lib/owner-lock";

import type { Container } from "./container";
import type { Bindings, UserInfoVariables } from "./env";

/**
 * CORS allowlist: the dashboard origin (`FRONTEND_URL`) and nothing else.
 *
 * The session cookie is `SameSite=None` (dashboard and API live on different sites),
 * and credentialed responses include decrypted SMTP credentials. Reflecting any
 * origin would let every website a logged-in admin visits read them, so an origin
 * that is not exactly the dashboard gets no CORS headers at all.
 */
function allowedOrigin(origin: string | undefined, env: Bindings): string | null {
  const frontend = env.FRONTEND_URL?.replace(/\/+$/, "");
  return origin && frontend && origin === frontend ? origin : null;
}

function addCorsHeaders(
  result: Response,
  origin: string | undefined,
  env: Bindings,
): Response {
  const headers = new Headers(result.headers);
  const allowed = allowedOrigin(origin, env);
  if (allowed) {
    headers.set("Access-Control-Allow-Origin", allowed);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.append("Vary", "Origin");
  }
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}

/**
 * Builds the Hono application: global middleware, auth forwarding, and the
 * mounted domain controllers.
 *
 * Runtime-agnostic on purpose: the Cloudflare entry point and the future Node
 * server both call this function with their own container. Cloudflare-specific
 * work (queue consumer, workflow class, cron dispatch) stays in the runtime
 * entry point.
 */
export function createApp(container: Container) {
  const { deps, getAuthInstance, getDatabase } = container;
  const app = new Hono<{ Bindings: Bindings; Variables: UserInfoVariables }>();

  // Global middleware: security headers, CORS, request logging, error handling, config injection
  app.use("*", securityHeadersMiddleware());
  app.use("*", async (c, next) => {
    // Any other origin gets no CORS headers at all (Hono's middleware would still send
    // `Allow-Credentials: true` once `credentials` is on): a preflight is answered
    // empty, so the browser refuses the request.
    if (!allowedOrigin(c.req.header("origin"), c.env)) {
      if (c.req.method === "OPTIONS") return c.body(null, 204);
      return next();
    }
    return cors({
      origin: (origin) => allowedOrigin(origin, c.env),
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization", "x-api-key", "Idempotency-Key"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      exposeHeaders: ["Idempotency-Replayed"],
    })(c, next);
  });
  app.use("*", requestLoggerMiddleware());
  app.onError(errorHandler);

  // Public: whether the instance still has to be set up, and whether its encryption secrets are
  // usable. Registered before configMiddleware, which refuses every request when the keys are
  // missing or malformed: the dashboard reads `configError` here and sends the owner to the page
  // explaining how to generate a key (instead of a sign-in form that can only fail). While no
  // account exists the dashboard sends every visitor to the set-up page, where the first
  // connection creates the super admin.
  app.get("/api/setup-status", async (c) => {
    const setup = await needsSetup(getDatabase(c.env));
    const keyError = checkEncryptionKeys(c.env);
    if (!keyError) return c.json({ needsSetup: setup });
    return c.json({ needsSetup: setup, configError: { code: keyError.code, variables: keyError.variables } });
  });

  app.use(configMiddleware());

  // Public API documentation. Registered before the lazily initialized DB
  // middleware so the schema and reference work even if D1 is unavailable.
  app.get("/openapi.json", (c) => c.json(openApiDocument));
  app.get(
    "/docs",
    Scalar((c) => ({
      url: "/openapi.json",
      pageTitle: "MakiSend API Reference",
      nonce: c.get("cspNonce"),
      theme: "default",
      cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.1",
    })),
  );

  // Better Auth: forward raw Request to auth.handler() for all /api/auth/* routes.
  // We wrap the result to add CORS headers that Hono's middleware can't inject into
  // raw Response objects.

  // Better Auth hardcodes `name: z.string()` in its sign-up body schema and offers no
  // option to relax it, while our product only asks for email + password. We fill it in
  // with the local part of the email before handing the request over to Better Auth.
  // Whether an account may be created at all is decided by the owner lock (src/lib/auth.ts,
  // src/lib/owner-lock.ts), on every creation path, atomically.
  app.post("/api/auth/sign-up/email", async (c) => {
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const fallbackName = String(body.email ?? "").split("@")[0];
    const auth = getAuthInstance(c.env, c.req.url);
    const result = await auth.handler(
      new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
        body: JSON.stringify({ ...body, name: body.name || fallbackName }),
      }),
    );
    return addCorsHeaders(result, c.req.header("origin"), c.env);
  });

  app.all("/api/auth/*", async (c) => {
    const auth = getAuthInstance(c.env, c.req.url);
    const result = await auth.handler(c.req.raw);
    return addCorsHeaders(result, c.req.header("origin"), c.env);
  });

  // API key auth (Better Auth) on send-email routes
  app.use("/send-email/*", async (c, next) => {
    const config = c.get("appConfig");
    const auth = getAuthInstance(c.env, c.req.url);
    await apiKeyMiddleware(config, auth)(c, next);
  });

  // Initialize DB deps on first request (doesn't need smtpConfig)
  app.use("*", async (c, next) => {
    if (!deps.dbInitialized) {
      deps.initDb(c.env, c.req.url);
    }
    if (!deps.smtpConfigService) {
      deps.initServices();
    }
    await next();
  });

  // Optional per-key send quota (SEND_RATE_LIMIT). Before idempotency on purpose: a 429
  // must not be stored as the key's response, or a retry after the window would replay it.
  app.use(
    "/send-email/*",
    sendRateLimitMiddleware(() => deps.sendRateLimit, () => deps.sendRateLimitRepository!),
  );

  // HTTP-level idempotency for POST /send-email. Runs after API-key auth, so the
  // key is scoped to the caller, and after DB deps are initialized.
  app.use("/send-email/*", idempotencyMiddleware(() => deps.idempotencyService!));

  // Mount send-email controller — produces to the Cloudflare Queue
  const sendEmailController = createSendEmailController(
    () => deps.emailRepository!,
    () => deps.templateRepository!,
  );
  app.route("/send-email", sendEmailController);

  // Mount SMTP config controller with session auth
  const smtpConfigController = createSmtpConfigController(
    () => deps.smtpConfigService!,
  );
  app.use("/smtp-config/*", async (c, next) => {
    const auth = getAuthInstance(c.env, c.req.url);
    return sessionMiddleware(auth)(c, next);
  });
  app.route("/smtp-config", smtpConfigController);

  // Mount API keys controller with session auth
  const apiKeysController = createApiKeysController(
    () => deps.apiKeyService!,
  );
  app.use("/api-keys/*", async (c, next) => {
    const auth = getAuthInstance(c.env, c.req.url);
    return sessionMiddleware(auth)(c, next);
  });
  app.route("/api-keys", apiKeysController);

  // Mount email logs controller with session auth
  const emailLogsController = createEmailLogsController(
    () => deps.emailLogService!,
  );
  app.use("/email-logs*", async (c, next) => {
    const auth = getAuthInstance(c.env, c.req.url);
    return sessionMiddleware(auth)(c, next);
  });
  app.route("/email-logs", emailLogsController);

  // Mount dashboard controller with session auth
  const dashboardController = createDashboardController(
    () => deps.dashboardService!,
  );
  app.use("/dashboard/*", async (c, next) => {
    const auth = getAuthInstance(c.env, c.req.url);
    return sessionMiddleware(auth)(c, next);
  });
  app.route("/dashboard", dashboardController);

  // Mount templates controller with session auth (dashboard CRUD)
  const templatesController = createTemplatesController(
    () => deps.templateService!,
  );
  app.use("/templates*", async (c, next) => {
    const auth = getAuthInstance(c.env, c.req.url);
    return sessionMiddleware(auth)(c, next);
  });
  app.route("/templates", templatesController);

  // New-release check, shown as a banner on the dashboard (session auth).
  const updatesController = createUpdatesController(() => deps.updateService!);
  app.use("/updates/*", async (c, next) => {
    const auth = getAuthInstance(c.env, c.req.url);
    return sessionMiddleware(auth)(c, next);
  });
  app.route("/updates", updatesController);

  return app;
}
