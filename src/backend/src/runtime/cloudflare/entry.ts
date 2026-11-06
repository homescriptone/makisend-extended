import { createApp } from "@/app/app";
import { createContainer } from "@/app/container";
import { KEY_ROTATION_CRON, runKeyRotation } from "@/key-rotation";
import { sendEmailQueueConsumer } from "@/queue/send-email.consumer";
import { runSmtpHealthChecks } from "@/smtp-config/smtp-health";
import { runUpdateCheck } from "@/updates";

import type { Bindings } from "@/app/env";

/**
 * Cloudflare Worker runtime entry point.
 *
 * Keeps every Cloudflare-specific concern at the edge of the application:
 * the HTTP app is built by `createApp`, while the queue consumer, the durable
 * workflow class and the cron dispatch stay here. The Node runtime (S6) will
 * compose the same `createApp`/`createContainer` pair.
 */
const container = createContainer();
export const app = createApp(container);

// SendEmailWorkflow must be exported from the entrypoint for wrangler's
// `class_name` to resolve.
export { SendEmailWorkflow } from "@/workflows";

export default {
  fetch: app.fetch,
  queue: sendEmailQueueConsumer,
  scheduled: async (
    _controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ) => {
    // Daily (17 3 * * *): SMTP health checks and the new-release check. Hourly (17 * * * *): key rotation, which
    // re-encrypts values still on a previous encryption key (a no-op when nothing is stale).
    if (_controller.cron === KEY_ROTATION_CRON) {
      ctx.waitUntil(runKeyRotation(env));
      return;
    }
    ctx.waitUntil(runSmtpHealthChecks(env));
    ctx.waitUntil(runUpdateCheck(env));
  },
};
