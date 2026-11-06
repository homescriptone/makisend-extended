import { resolveEncryptionKeys } from "@/config/config";
import { createDatabase } from "@/db/d1";
import { createAuth } from "@/lib/auth";
import { SendEmailRepository } from "@/send-email/send-email.repository";
import { SmtpConfigRepository, SmtpConfigService } from "@/smtp-config";
import { ApiKeyRepository, ApiKeyService } from "@/api-keys";
import { EmailLogRepository, EmailLogService } from "@/email-logs";
import { DashboardRepository, DashboardService } from "@/dashboard";
import { TemplateRepository, TemplateService } from "@/templates";
import { AudienceRepository, AudienceService } from "@/audiences";
import { IdempotencyRepository, IdempotencyService } from "@/idempotency";
import {
  parseSendRateLimit,
  SendRateLimitRepository,
  type ISendRateLimitRepository,
  type SendRateLimit,
} from "@/send-rate-limit";
import { createUpdateService, type UpdateService } from "@/updates";
import { withPublicUrls, type Bindings } from "./env";

import type { EncryptionKeys } from "@/core/crypto";
import type { Database } from "@/db/client";
import type { IEmailRepository } from "@/send-email/send-email.types";
import type { ISmtpConfigRepository } from "@/smtp-config/smtp-config.types";
import type { IApiKeyRepository } from "@/api-keys/api-keys.types";
import type { IEmailLogRepository } from "@/email-logs/email-logs.types";
import type { IDashboardRepository } from "@/dashboard/dashboard.types";
import type { ITemplateRepository } from "@/templates/templates.types";
import type { IAudienceRepository } from "@/audiences/audiences.types";
import type { IIdempotencyRepository } from "@/idempotency";

/**
 * Lazily initialized dependency container.
 *
 * Created once per runtime entry point (src/runtime/cloudflare/entry.ts today,
 * src/runtime/node/server.ts later). Nothing runtime-specific lives here: the
 * container needs a database factory, the bindings' encryption keys and the
 * optional Cloudflare Email Service binding.
 */
export interface ContainerOptions {
  /**
   * Opens the shared database for a request's bindings. Defaults to Cloudflare
   * D1; the Node runtime passes the SQLite adapter instead.
   */
  database?: (env: Bindings) => Database;
}

export function createContainer(options: ContainerOptions = {}) {
  const openDatabase =
    options.database ?? ((env: Bindings) => createDatabase({ provider: "d1", binding: env.makisend_db }));

  // One Database per bindings object: the repositories and Better Auth must see
  // the same instance (a SQLite file adapter opens one connection, not two).
  // Tests build a fresh env per case, which re-opens the database for that case.
  let database: Database | null = null;
  let databaseEnv: Bindings | null = null;

  function getDatabase(rawEnv: Bindings): Database {
    if (!database || databaseEnv !== rawEnv) {
      database = openDatabase(rawEnv);
      databaseEnv = rawEnv;
    }
    return database;
  }

  // Auth instance: recreate if baseURL, frontend URL or database changes.
  let authInstance: ReturnType<typeof createAuth> | null = null;
  let authBaseUrl: string | null = null;
  let authFrontendUrl: string | null = null;
  let authDatabase: Database | null = null;

  function getAuthInstance(rawEnv: Bindings, requestUrl?: string) {
    const env = withPublicUrls(rawEnv, requestUrl);
    const db = getDatabase(rawEnv);
    if (
      !authInstance ||
      env.BETTER_AUTH_URL !== authBaseUrl ||
      env.FRONTEND_URL !== authFrontendUrl ||
      db !== authDatabase
    ) {
      authInstance = createAuth(env, db);
      authBaseUrl = env.BETTER_AUTH_URL ?? null;
      authFrontendUrl = env.FRONTEND_URL ?? null;
      authDatabase = db;
    }
    return authInstance;
  }

  const deps = {
    emailRepository: null as IEmailRepository | null,
    smtpConfigRepository: null as ISmtpConfigRepository | null,
    apiKeyRepository: null as IApiKeyRepository | null,
    emailLogRepository: null as IEmailLogRepository | null,
    dashboardRepository: null as IDashboardRepository | null,
    templateRepository: null as ITemplateRepository | null,
    audienceRepository: null as IAudienceRepository | null,
    idempotencyRepository: null as IIdempotencyRepository | null,
    sendRateLimitRepository: null as ISendRateLimitRepository | null,
    sendRateLimit: null as SendRateLimit | null,
    smtpConfigService: null as SmtpConfigService | null,
    apiKeyService: null as ApiKeyService | null,
    emailLogService: null as EmailLogService | null,
    dashboardService: null as DashboardService | null,
    templateService: null as TemplateService | null,
    audienceService: null as AudienceService | null,
    idempotencyService: null as IdempotencyService | null,
    updateService: null as UpdateService | null,
    aesKey: null as EncryptionKeys | null,
    emailBinding: undefined as SendEmail | undefined,
    dbInitialized: false,
    // The Database the current deps were built against. The singleton container
    // is reused across tests that pass a fresh env/D1 per case, so we rebind when
    // the request resolves to a different database (a no-op in the Worker).
    initializedDatabase: null as Database | null,

    initDb(env: Bindings, requestUrl: string) {
      const db = getDatabase(env);
      if (this.dbInitialized && this.initializedDatabase === db) return;

      const auth = getAuthInstance(env, requestUrl);
      this.emailRepository = new SendEmailRepository(db);
      this.smtpConfigRepository = new SmtpConfigRepository(db);
      this.apiKeyRepository = new ApiKeyRepository(db, auth);
      this.emailLogRepository = new EmailLogRepository(db);
      this.dashboardRepository = new DashboardRepository(db);
      this.templateRepository = new TemplateRepository(db);
      this.audienceRepository = new AudienceRepository(db);
      this.idempotencyRepository = new IdempotencyRepository(db);
      this.sendRateLimitRepository = new SendRateLimitRepository(db);
      this.sendRateLimit = parseSendRateLimit(env.SEND_RATE_LIMIT);
      this.aesKey = resolveEncryptionKeys(env);
      this.emailBinding = env.EMAIL;
      this.updateService = createUpdateService(env);
      this.dbInitialized = true;
      this.initializedDatabase = db;
      // Services hold the old repositories; rebuild them for the new database.
      this.smtpConfigService = null;
      this.apiKeyService = null;
      this.emailLogService = null;
      this.dashboardService = null;
      this.templateService = null;
      this.audienceService = null;
      this.idempotencyService = null;
    },

    initServices() {
      if (this.smtpConfigService) return;
      this.smtpConfigService = new SmtpConfigService(this.smtpConfigRepository!, this.aesKey!, {
        emailBinding: this.emailBinding,
        emailLogs: this.emailRepository!,
      });
      this.apiKeyService = new ApiKeyService(this.apiKeyRepository!);
      this.emailLogService = new EmailLogService(this.emailLogRepository!, this.aesKey!);
      this.dashboardService = new DashboardService(this.dashboardRepository!, this.aesKey!);
      this.templateService = new TemplateService(this.templateRepository!);
      this.audienceService = new AudienceService(this.audienceRepository!);
      this.idempotencyService = new IdempotencyService(this.idempotencyRepository!);
    },
  };

  return { deps, getAuthInstance, getDatabase };
}

export type Container = ReturnType<typeof createContainer>;
