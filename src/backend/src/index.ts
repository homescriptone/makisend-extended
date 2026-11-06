/**
 * Cloudflare Worker entry point.
 *
 * The implementation lives in `src/runtime/cloudflare/entry.ts` (runtime shape)
 * and `src/app/` (runtime-agnostic composition). This file stays at the path
 * declared by both wrangler.jsonc files so deployments and tests keep working;
 * it also re-exports the types and helpers other modules import from `@/index`.
 */
export { app, default } from "@/runtime/cloudflare/entry";
export { SendEmailWorkflow } from "@/runtime/cloudflare/entry";
export { withPublicUrls } from "@/app/env";
export type { Bindings, UserInfoVariables } from "@/app/env";
