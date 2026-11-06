# MakiSend Extended — Development Roadmap

> **Purpose:** Guide the progressive evolution of MakiSend Extended from a Cloudflare-oriented transactional email application into a modular, self-hostable email delivery and newsletter management platform.
>
> **Audience:** Maintainers, contributors, and AI coding agents (including OpenCode).
>
> **Working rule:** Treat this document as the product and architecture direction. Before changing code, inspect the current repository, verify assumptions against the implementation, and propose a small, testable plan. Do not assume that every planned capability already exists.

---

## 1. Vision

MakiSend Extended aims to become a modular, self-hostable email delivery and newsletter management platform.

The application should be easy to install, configure, run, extend, and maintain without requiring Docker or a paid infrastructure subscription. Cloudflare remains a first-class deployment option, but must not be the only supported runtime.

Development must be incremental. Preserve existing working functionality while introducing new capabilities in small, reviewable steps.

## 2. Primary objectives

### 2.1 Runtime independence

Enable the complete application to run directly on a machine without Docker.

Requirements:

- Support native Node.js execution.
- Preserve the existing Cloudflare Workers deployment.
- Provide standalone API and dashboard execution.
- Support local background processing.
- Avoid mandatory external infrastructure for local development.
- Keep Docker as an optional deployment and development tool.
- Document supported Node.js and package-manager versions.

**Acceptance criteria**

- A developer can clone the repository, install dependencies, configure the application, initialize local storage, and run it without Docker.
- The standalone runtime does not require a Cloudflare account or Cloudflare bindings.
- Existing Cloudflare functionality remains operational.
- Startup failures identify missing or invalid configuration clearly.

### 2.2 Database flexibility

Provide a common application-facing database layer with these initial providers:

- **Cloudflare D1:** Cloudflare deployment.
- **SQLite:** Local and standalone installations.
- **Turso:** Remote SQLite-compatible database.

Requirements:

- Select the provider through configuration.
- Keep provider-specific code out of business logic.
- Define and document migration behavior for each provider.
- Provide database initialization, migration, backup, and restoration procedures.
- Test supported SQL features and transaction behavior across providers.
- Document any provider-specific limitations.

Example configuration (illustrative; adapt names to the existing configuration conventions):

```env
DATABASE_PROVIDER=sqlite
# DATABASE_PROVIDER=d1
# DATABASE_PROVIDER=turso
```

Do not assume that D1, SQLite, and Turso are perfectly interchangeable. Verify ORM/driver compatibility, migrations, transactions, concurrency, and supported SQL features.

**Important design decision:** Treat Turso as a selectable backend first, not as automatic overflow storage when D1 reaches a quota. Automatic fallback, replication, or migration requires data synchronization, consistency, failure recovery, and operational rules. Consider those only as a separately designed future feature.

**Acceptance criteria**

- The application can select a supported database backend through configuration.
- Application services use a shared repository/database interface.
- Migrations and integration tests cover each supported backend.
- Switching providers is documented and does not require editing business logic.

### 2.3 Newsletter management

Extend transactional email capabilities with a separate newsletter domain.

Planned capabilities:

- Subscriber registration and management.
- Mailing lists and audience segmentation.
- Subscription forms and public API endpoints.
- Subscription verification and configurable double opt-in.
- Campaign creation, editing, and preview.
- Campaign scheduling and cancellation.
- Bulk delivery with throttling and batching.
- Bounce and complaint processing.
- Unsubscribe and suppression management.
- Delivery events and campaign analytics.
- Import and export with validation and duplicate handling.

Keep transactional messages and marketing communications logically separate. Do not turn the existing transactional send endpoint into a catch-all newsletter system.

**Acceptance criteria**

- Users can create and manage lists and subscribers.
- A subscriber's subscription status and consent evidence can be inspected.
- Campaigns can be created, scheduled, delivered, paused/cancelled where feasible, and reported on.
- Unsubscribed or suppressed recipients are excluded from marketing sends.
- Bulk sends use persistent background jobs rather than a single long-running HTTP request.

### 2.4 Privacy, security, and regulatory safeguards

Build privacy-supporting controls into the design from the beginning.

Planned capabilities:

- Purpose-specific consent records and consent history.
- Record of consent source, timestamp, relevant notice/policy version, and verification status where applicable.
- Subscription verification workflows.
- Withdrawal of consent.
- One-click unsubscribe support, including appropriate `List-Unsubscribe` and `List-Unsubscribe-Post` headers where applicable.
- Global and per-list suppression lists.
- Personal data access and export workflows.
- Deletion and configurable retention workflows.
- Audit logs for relevant administrative and subscriber actions.
- Protection of personal information in storage, logs, exports, and API responses.
- Rate limiting and abuse prevention for public subscription endpoints.
- Authentication, authorization, and least-privilege access.

The application should provide tools that help operators meet applicable privacy and electronic-marketing requirements. Do not claim that installing the software automatically makes an operator GDPR-compliant. Legal requirements depend on the operator, recipients, purposes, and jurisdictions. Document the operator's responsibilities and encourage appropriate legal review.

**Acceptance criteria**

- Consent and subscription status are represented explicitly and are auditable.
- Withdrawal/unsubscribe is straightforward and reliably enforced.
- Suppression is checked before marketing delivery.
- Data export and deletion behavior is documented and tested.
- Sensitive data is not unnecessarily exposed in logs or API responses.

### 2.5 Extensible delivery infrastructure

Introduce provider-independent interfaces for delivery and background processing.

Potential components:

- SMTP delivery.
- Existing Cloudflare email delivery integration, if present.
- Cloudflare Queues and Workflows adapters.
- Local persistent job processing.
- Retry policies with backoff.
- Dead-letter handling and operator visibility.
- Scheduled tasks.
- Delivery event tracking.
- Provider-specific rate limits and error classification.

Add new providers through adapters rather than embedding provider-specific behavior throughout core services.

**Acceptance criteria**

- Business logic submits delivery jobs through a common interface.
- Cloudflare and standalone runtimes have supported job-processing implementations.
- Pending jobs survive process restarts in standalone production mode.
- Retries are bounded and observable.
- Duplicate processing is handled safely through idempotency or equivalent safeguards.

### 2.6 Developer experience

Introduce a Makefile as a consistent command interface across supported machines and environments.

The Makefile should orchestrate package scripts and existing tools; it should not duplicate application logic.

Planned commands (adjust to actual repository scripts):

```sh
make help
make install
make setup
make dev
make start
make worker
make build
make test
make test-integration
make lint
make typecheck
make migrate
make db-reset
make docker-up
make docker-down
make deploy
```

Requirements:

- Commands should fail clearly when prerequisites are missing.
- `make help` should describe available targets.
- Destructive commands must be clearly named and documented.
- Docker targets must remain optional.
- CI should use the same core commands where practical.

---

## 3. Architecture principles

1. **Runtime independence:** Cloudflare is an adapter/runtime, not an assumption embedded in all business logic.
2. **No mandatory Docker:** Docker may simplify deployment, but native execution must remain supported.
3. **Infrastructure adapters:** Database, queue, scheduler, email transport, logging, and configuration should have clear boundaries.
4. **Domain separation:** Transactional email and newsletter/campaign management should have distinct responsibilities.
5. **Persistent processing:** Production background jobs must survive restarts.
6. **Privacy by design:** Collect only necessary personal data and protect it throughout its lifecycle.
7. **Safe extensibility:** New providers and modules should not require invasive changes to unrelated code.
8. **Incremental delivery:** Each change should be small, testable, documented, and reversible where practical.
9. **Configuration clarity:** Keep configuration centralized, validated, and documented.
10. **Backward compatibility:** Preserve existing APIs and behavior where reasonably possible; document any intentional breaking changes.

### 3.1 Illustrative adapter boundaries

Use this as a direction, not as a requirement to create these exact filenames or abstractions before inspecting the repository.

```text
Application services
    |
    +-- Database interface
    |      +-- Cloudflare D1 adapter
    |      +-- Local SQLite adapter
    |      +-- Turso adapter
    |
    +-- Job queue interface
    |      +-- Cloudflare Queues / Workflows adapter
    |      +-- Local persistent queue adapter
    |
    +-- Email transport interface
    |      +-- SMTP adapter
    |      +-- Other supported provider adapters
    |
    +-- Scheduler interface
           +-- Cloudflare scheduler adapter
           +-- Local scheduler adapter
```

Avoid scattering runtime checks such as `if (isCloudflare)` through domain services. Resolve runtime-specific implementations at the application composition/startup boundary.

---

## 4. Development roadmap

### Phase 0 — Repository audit and baseline

Before architectural changes:

- Inspect the repository structure, package scripts, runtime entry points, and current deployment configuration.
- Identify Cloudflare-specific APIs and bindings.
- Map existing database access, migrations, queues, workflows, scheduler, email transports, authentication, and frontend serving.
- Identify current tests and establish a passing baseline.
- Document current features and known limitations.
- Identify existing Docker usage and distinguish required dependencies from optional tooling.

**Deliverables**

- Architecture/dependency map.
- List of Cloudflare-specific dependencies.
- Current local-development instructions.
- Baseline test/build results.
- Proposed implementation sequence with risks.

**Exit criteria:** The team can explain what currently prevents native standalone execution and has a verified baseline before refactoring.

#### Phase 0 audit — results (6 Nov 2026)

The repository was moved into a `src/` layout (`src/backend`, `src/frontend`) without updating the references around it, so the application could not install, build, test or deploy from the documented commands. This audit records what was broken, what was repaired, the verified baseline, and the Cloudflare couplings that still block native execution.

**Repaired in this slice (no behavior change):** developer documentation (`README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/*.md`, `.dev.vars.example`) was updated to the same `src/` paths; it is part of the repair, not a separate phase.

| Area | Stale reference | Fix |
|---|---|---|
| Workspace | `pnpm-workspace.yaml` listed `backend` and `frontend` (removed directories) | `src/backend`, `src/frontend`; lockfile refreshed because pnpm keys importers by directory |
| Wrangler (root, "Deploy to Cloudflare" button) | `main`, `tsconfig`, `assets.directory`, D1 `migrations_dir` / `migrations_pattern`, `$schema` | all point under `src/` |
| Docker (dev) | `COPY backend/…`, `WORKDIR /workspace/backend` | `src/backend`, `src/frontend` |
| Docker (published image) | `COPY backend/…`, `WORKDIR /app/backend`, `node ../docker/runtime-config.cjs /app/backend` | `src/` paths, absolute `/app/docker/runtime-config.cjs` |
| docker-compose | working directories and `node_modules` volumes | `src/backend`, `src/frontend` |
| GitHub Actions | every `working-directory: backend` / `frontend`, `frontend/dist` artifacts, `backend/src/core/version.ts` in release.yml | `src/…` paths |
| Tests | repo-root discovery (`root-wrangler.test.ts`, `updates.test.ts`) and the root asset-path assertion | one level deeper, `./src/frontend/dist` |

**Verified baseline (commands run from the repository root unless noted):**

| Check | Command | Result |
|---|---|---|
| Install | `pnpm install --no-frozen-lockfile` (lockfile updated for the new importer paths) | pass |
| Lint | `pnpm lint` in `src/backend` | pass |
| Typecheck backend | `pnpm exec tsc --noEmit` in `src/backend` | pass |
| Backend tests | `pnpm test:run` in `src/backend` | 46 files, 537 tests pass |
| Typecheck frontend | `pnpm exec tsc --noEmit -p .` in `src/frontend` | pass |
| Frontend tests | `pnpm test:run` in `src/frontend` | 12 tests pass |
| Frontend build | `pnpm --filter frontend build` | 12 pages built into `src/frontend/dist` |
| Worker bundle (button config) | `pnpm exec wrangler deploy --dry-run --minify` at the root | bundles, reads 83 assets from `src/frontend/dist`, all bindings resolve |
| Worker bundle (own deployments) | `pnpm exec wrangler deploy --dry-run --minify` in `src/backend` | same |
| Image config | `node docker/runtime-config.cjs src/backend <out>` | valid config generated from `src/backend/wrangler.jsonc` |
| Migrations | `pnpm exec wrangler d1 migrations list makisend_db --local` | 7 migrations listed |
| Local boot | `pnpm exec wrangler dev --local` in `src/backend`, then `GET /api/setup-status` | boots, applies the schema and answers `{"needsSetup":true}` |

**Cloudflare couplings that still block native Node.js execution:**

1. `src/backend/src/index.ts` is the only entry point: it exports the Worker shape (`fetch`, `queue`, `scheduled`) plus the `SendEmailWorkflow` class, and owns the lazy dependency container.
2. The `Bindings` type is imported by `src/backend/src/config/config.ts` and `src/backend/src/lib/auth.ts`, so configuration depends on Cloudflare binding types.
3. `src/backend/src/db/connection.ts` hardcodes `drizzle-orm/d1`; `src/backend/src/lib/auth.ts` creates a second D1-backed Drizzle instance for Better Auth.
4. `src/backend/src/send-email/send-email.controller.ts` calls `c.env.SEND_EMAIL_QUEUE.send(...)` directly — queue access leaks into the HTTP layer.
5. `src/backend/src/queue/send-email.consumer.ts` depends on the Cloudflare `MessageBatch` API (`ack`, `retry`, `attempts`).
6. `src/backend/src/workflows/send-email.workflow.ts` and `send-email.flow.ts` depend on `cloudflare:workers` (`WorkflowEntrypoint`, `WorkflowStep`); the Vitest config already shims the module with `test/mocks/cloudflare-workers.ts`, which proves the coupling.
7. The `scheduled` handler relies on `ctx.waitUntil` and cron strings declared in `wrangler.jsonc`; the VPS image reimplements this with `docker/scheduler.mjs` calling `/cdn-cgi/handler/scheduled`.
8. Cloudflare Email Service (`send_email` binding) branches are spread across `transport-resolver.ts`, `smtp-config.service.ts` and `smtp-health.ts`.
9. Static files are served by the platform (`assets.directory`); there is no Node static server.
10. Tests run D1 through Miniflare/workerd (`test/helpers/d1-setup.ts`); there is no local SQLite driver path yet, although `better-sqlite3` is already a dev dependency.

#### Target structure (adapter boundaries)

The target keeps the existing module internals and only moves the runtime-specific edges behind explicit boundaries. Composition happens once, at the entry points; no `if (isCloudflare)` in domain services.

```text
src/backend/src/
├── app/                      # runtime-agnostic composition root
│   ├── env.ts                # AppEnv: typed configuration (no D1/Queue/Workflow types)
│   ├── container.ts          # lazy DI container (today inside index.ts)
│   └── app.ts                # buildApp(container) -> Hono (controllers + middleware)
├── core/                     # unchanged shared kernel
├── db/
│   ├── schema.ts             # unchanged Drizzle schema
│   └── client.ts             # Database type + createDatabase(provider)
├── domain/                   # business modules, unchanged internals
│   ├── send-email/  templates/  smtp-config/  email-logs/  dashboard/
│   ├── idempotency/  api-keys/  send-rate-limit/  key-rotation/  updates/
├── http/                     # controllers + middleware (Hono-specific)
├── infrastructure/
│   ├── database/             # d1.ts, sqlite.ts, turso.ts
│   ├── queue/                # port.ts, cloudflare.ts, local.ts
│   ├── workflow/             # port.ts, cloudflare.ts, local.ts
│   ├── scheduler/            # port.ts, cloudflare.ts, local.ts
│   └── email/                # smtp.ts, cloudflare.ts
└── runtime/
    ├── cloudflare/entry.ts   # fetch/queue/scheduled + Workflow class export
    └── node/
        ├── server.ts         # @hono/node-server + static assets + graceful shutdown
        ├── worker.ts         # persistent local queue poller
        └── scheduler.ts      # local cron for key rotation and health checks
```

The current `src/index.ts` keeps working during the migration: it becomes a thin Cloudflare adapter that imports `buildApp(...)`.

#### Implementation sequence (small, testable slices)

| Slice | Scope | Exit criterion | Status |
|---|---|---|---|
| S0 | Repair the `src/` restructure | install, lint, typecheck, tests, build and both `wrangler deploy --dry-run` pass | done (6 Nov 2026) |
| S1 | Extract `app/env.ts`, `app/container.ts`, `app/app.ts`; `src/index.ts` becomes `runtime/cloudflare/entry.ts` re-exported from the old path | no behavior change, tests unchanged | next |
| S2 | Database port: `createDatabase({ provider: "d1" \| "sqlite" \| "turso" })`; Better Auth receives the shared `Database` instance | D1 tests pass; new SQLite integration test applies the same migrations | planned |
| S3 | Job queue port: `JobQueue.enqueue(emailId)` injected into the send-email controller; Cloudflare and local adapters | controller no longer reads `c.env`; queue tests cover both adapters | planned |
| S4 | Workflow port: `SendEmailFlow` runs steps through a `StepRunner`; Cloudflare adapter wraps `WorkflowStep`, local adapter executes with the same retry budget | workflow tests run against both runners | planned |
| S5 | Scheduler port: cron dispatch behind `Scheduler`; Cloudflare events and local timer share one dispatcher | `docker/scheduler.mjs` replaced by the Node runtime scheduler | planned |
| S6 | Node runtime: `runtime/node/server.ts` (API + dashboard + static assets), `worker.ts` (persistent queue), health/readiness, graceful shutdown | `pnpm start` serves the complete app without Docker or Cloudflare bindings | planned |

Documentation updates (README, AGENTS.md, CONTRIBUTING.md, `docs/*.md`) follow each slice; they are not a separate phase.

### Phase 1 — Architecture and runtime decoupling

- Introduce only the infrastructure interfaces justified by the audit.
- Separate application/domain services from Cloudflare-specific implementations.
- Centralize runtime and provider composition.
- Standardize environment configuration and validation.
- Preserve current Cloudflare behavior.
- Add tests around the new boundaries.
- Introduce the initial Makefile and `make help`.

**Exit criteria:** Existing Cloudflare deployment and behavior continue to work, while infrastructure-specific dependencies are isolated behind explicit boundaries.

### Phase 2 — Native Node.js execution

- Add a native Node.js application entry point.
- Support standalone API startup.
- Serve or integrate the dashboard in standalone mode.
- Add graceful startup and shutdown.
- Add health/readiness checks.
- Support local environment configuration.
- Ensure local data persistence.
- Document installation and startup without Docker.

**Exit criteria:** A developer can run the complete application natively without Docker, Cloudflare bindings, or a Cloudflare account.

### Phase 3 — Database providers

- Implement or complete local SQLite support.
- Preserve and test Cloudflare D1 support.
- Add Turso support using a compatible driver/ORM integration.
- Standardize migration execution and migration tracking.
- Add provider-specific integration tests.
- Document backup, restoration, and provider switching.

**Exit criteria:** Each supported database backend can be selected through configuration and passes the relevant integration tests.

### Phase 4 — Background processing

- Define a job-processing interface.
- Preserve Cloudflare Queues and Workflows through adapters.
- Implement a local persistent queue for standalone production use.
- Add safe job claiming/locking and concurrency controls.
- Add retry/backoff policies and dead-letter handling.
- Add scheduling and recovery behavior.
- Ensure delivery operations are idempotent where needed.
- Add worker startup and monitoring commands.

**Exit criteria:** Cloudflare and standalone installations can process delivery jobs reliably, including after process restarts.

### Phase 5 — Newsletter functionality

Implement in small vertical slices:

1. Subscriber and list data model.
2. Subscriber management API and UI.
3. Public subscription forms and verification.
4. Consent records and unsubscribe flow.
5. Campaign creation and preview.
6. Persistent campaign scheduling and bulk delivery.
7. Bounce, complaint, and suppression processing.
8. Campaign reporting and analytics.

**Exit criteria:** An operator can create a list, collect and verify subscribers, manage subscription status, send a campaign, and inspect delivery outcomes.

### Phase 6 — Privacy and regulatory safeguards

- Complete consent evidence and history.
- Implement access/export workflows.
- Implement deletion and retention policies.
- Verify one-click unsubscribe behavior and email headers.
- Ensure suppression is enforced across all marketing send paths.
- Add audit logging and data-protection checks.
- Review authentication, authorization, rate limits, and abuse controls.
- Document operator responsibilities and supported compliance workflows.

**Exit criteria:** Core privacy workflows are implemented, documented, and covered by automated tests. Do not describe this as a legal certification.

### Phase 7 — Testing and operational maturity

- Expand unit and integration tests.
- Test all database adapters.
- Test queue recovery, retries, and duplicate processing.
- Add standalone end-to-end tests.
- Add Cloudflare deployment smoke tests.
- Improve structured logging and health checks.
- Document upgrades, backups, restoration, and troubleshooting.
- Add CI validation for supported environments.

**Exit criteria:** The application can be installed, upgraded, operated, and maintained predictably in both supported runtime environments.

### Phase 8 — Progressive extensions

Potential future modules:

- Webhooks and event integrations.
- Additional email providers.
- Advanced campaign analytics.
- Advanced audience segmentation.
- Multi-user workspaces and team management.
- Role-based permissions.
- Import/export tooling.
- Plugin or extension architecture.
- Additional database providers.
- Automated backups and recovery.
- Deliverability monitoring and domain setup assistance.

Only introduce these when there is a clear use case. Keep optional modules separate from the core.

---

## 5. Makefile command expectations

The final Makefile must reflect the repository's real package scripts and deployment tools. The following is a target contract, not a copy-paste implementation:

| Target | Expected responsibility |
|---|---|
| `help` | List commands and descriptions |
| `install` | Install dependencies using the selected package manager |
| `setup` | Validate prerequisites and create local configuration safely |
| `dev` | Start the local application in development mode |
| `start` | Start the standalone production application |
| `worker` | Start standalone background processing |
| `build` | Build all required application components |
| `test` | Run unit tests |
| `test-integration` | Run database, queue, and provider integration tests |
| `lint` | Run lint checks |
| `typecheck` | Run static type checks |
| `migrate` | Apply database migrations |
| `db-reset` | Reset local development data; warn before destructive action |
| `docker-up` | Optional Docker-based environment |
| `docker-down` | Stop optional Docker environment |
| `deploy` | Run the documented deployment workflow |

---

## 6. OpenCode / AI-agent working instructions

When using this roadmap with OpenCode or another coding agent:

1. Read this roadmap and the repository's existing README and contributor instructions first.
2. Inspect the actual code before proposing file changes.
3. Do not assume the architecture, filenames, scripts, or dependencies described here already exist.
4. Start with the repository audit (Phase 0) unless a later phase has explicitly been selected.
5. Report findings with exact file paths and explain which current dependencies create the limitation.
6. Propose a small implementation plan before making broad architectural changes.
7. Work in small, reviewable steps. Do not attempt to implement the entire roadmap in one operation.
8. Preserve current behavior and APIs unless a change is explicitly approved.
9. Add or update tests for every meaningful behavior change.
10. Run relevant tests, linting, type checking, and builds; report commands and actual results.
11. Update documentation and environment examples when configuration changes.
12. Never claim a feature works unless it has been verified.
13. Do not add dependencies without explaining why they are needed.
14. Do not introduce automatic D1-to-Turso failover or data replication without a separate design and explicit approval.
15. Do not weaken authentication, authorization, consent, unsubscribe, or suppression behavior to make a test pass.
16. If a requirement conflicts with the existing implementation, explain the conflict and propose options rather than silently rewriting working functionality.

### Suggested first task for OpenCode

> Perform Phase 0 only. Audit the current repository to determine what is required to run the complete application natively without Docker and without Cloudflare services. Map the current runtime entry points, Cloudflare bindings/APIs, database access, migrations, queues/workflows, scheduler, email delivery, authentication, frontend serving, package scripts, and tests. Do not modify application code yet. Produce a concise audit report with exact file paths, blockers, reusable components, risks, and a phased implementation proposal. Run the existing relevant checks and report their actual results.

---

## 7. Definition of done for each change

A change is not complete merely because the code has been written.

For each meaningful change:

- [ ] The implementation matches the selected phase and approved scope.
- [ ] Existing behavior has been preserved or intentional changes documented.
- [ ] Tests cover the new behavior and relevant failure cases.
- [ ] Linting and type checking pass where configured.
- [ ] Relevant builds and integration checks pass.
- [ ] Configuration examples and documentation are updated.
- [ ] Security and privacy implications have been considered.
- [ ] Limitations and manual verification steps are reported.

## 8. Roadmap maintenance

This roadmap is a living document.

- **Canonical file:** `REDESIGN_HOMESCRIPT.md`. `MAKISEND_EXTENDED_ROADMAP.md` is a byte-identical copy and is kept only until this file is confirmed as the single source; delete it then.
- Mark phases and tasks as planned, in progress, blocked, or completed in a separate progress tracker or issue list.
- Update this document when a significant architectural decision changes.
- Record important decisions in architecture decision records (ADRs).
- Add future features progressively rather than expanding the initial implementation scope.
- Prefer verified repository behavior over assumptions in this document.

**Long-term goal:** A dependable email delivery and newsletter platform that can run locally or on a self-hosted server without Docker, while retaining Cloudflare as an optional, well-supported deployment environment.
