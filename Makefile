# MakiSend — developer command interface.
#
# A thin wrapper around the repository's package scripts: no application logic
# lives here. `make` (or `make help`) lists every target. Targets marked
# "planned" fail with a clear message until the matching redesign slice lands
# (see REDESIGN_HOMESCRIPT.md, "Implementation sequence").

SHELL := /bin/sh
BACKEND := src/backend
FRONTEND := src/frontend
PNPM ?= pnpm

.DEFAULT_GOAL := help

.PHONY: help install setup dev dev-ui build test test-integration test-e2e \
        test-e2e-attachments lint lint-fix typecheck cf-typegen migrate db-reset \
        docker-build docker-up docker-down docker-test docker-lint docker-migrate \
        deploy start worker

help: ## List available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install workspace dependencies (frozen lockfile)
	$(PNPM) install --frozen-lockfile

setup: ## Check prerequisites and create src/backend/.env if missing
	@command -v node >/dev/null 2>&1 || { echo "Node.js 22+ is required: https://nodejs.org"; exit 1; }
	@command -v $(PNPM) >/dev/null 2>&1 || { echo "pnpm is required: corepack enable && corepack prepare pnpm@11 --activate"; exit 1; }
	@node -e 'const [major] = process.versions.node.split(".").map(Number); if (major < 22) { console.error("Node.js 22+ is required (found " + process.version + ")"); process.exit(1); }'
	@if [ -f $(BACKEND)/.env ]; then \
		echo "$(BACKEND)/.env already exists — left untouched."; \
	else \
		cp $(BACKEND)/.env.example $(BACKEND)/.env; \
		echo "Created $(BACKEND)/.env. Fill in ENCRYPTION_KEY and BETTER_AUTH_SECRET:"; \
		echo "  openssl rand -hex 32      # ENCRYPTION_KEY"; \
		echo "  openssl rand -base64 32   # BETTER_AUTH_SECRET"; \
	fi

dev: ## Start the Worker API (Miniflare) on http://localhost:8787
	cd $(BACKEND) && $(PNPM) dev

dev-ui: ## Start the dashboard dev server on http://localhost:4321
	$(PNPM) --filter ./$(FRONTEND) dev

build: ## Build the dashboard the Worker serves
	$(PNPM) run build

test: ## Run unit tests (backend + frontend)
	cd $(BACKEND) && $(PNPM) test:run
	cd $(FRONTEND) && $(PNPM) test:run

test-integration: ## Run the backend integration tests
	cd $(BACKEND) && $(PNPM) exec vitest run test/integration

test-e2e: ## Run the Docker end-to-end test (real SMTP via Mailpit)
	cd $(BACKEND) && $(PNPM) test:e2e:docker

test-e2e-attachments: ## Run the attachments end-to-end test (Cloudflare Email Service)
	cd $(BACKEND) && $(PNPM) test:e2e:attachments

lint: ## Lint the backend
	cd $(BACKEND) && $(PNPM) lint

lint-fix: ## Auto-fix backend lint issues
	cd $(BACKEND) && $(PNPM) lint:fix

typecheck: ## Typecheck backend and frontend
	cd $(BACKEND) && $(PNPM) exec tsc --noEmit
	cd $(FRONTEND) && $(PNPM) exec tsc --noEmit -p .

cf-typegen: ## Regenerate Cloudflare binding types
	cd $(BACKEND) && $(PNPM) cf-typegen

migrate: ## Apply D1 migrations to the local database
	cd $(BACKEND) && $(PNPM) exec wrangler d1 migrations apply makisend_db --local

db-reset: ## Delete local D1/queue/workflow state (requires CONFIRM=1)
	@if [ "$$CONFIRM" != "1" ]; then \
		echo "Refusing to delete $(BACKEND)/.wrangler (local D1, queues, workflow state)."; \
		echo "Re-run with: make db-reset CONFIRM=1"; \
		exit 1; \
	fi
	rm -rf $(BACKEND)/.wrangler
	@echo "Local state removed. Run 'make migrate' to recreate the schema."

docker-build: ## Build the development image
	$(PNPM) run docker:build

docker-up: ## Start the Docker development stack (API :8787, dashboard :4321)
	$(PNPM) run docker:up

docker-down: ## Stop the Docker development stack
	$(PNPM) run docker:down

docker-test: ## Run the backend test suite inside Docker
	$(PNPM) run docker:test

docker-lint: ## Run backend lint inside Docker
	$(PNPM) run docker:lint

docker-migrate: ## Apply migrations to the local D1 inside Docker
	$(PNPM) run docker:migrate

deploy: ## Deploy the Worker with Wrangler (CI is the normal path)
	cd $(BACKEND) && $(PNPM) deploy

start: ## Planned: run the standalone production server (REDESIGN_HOMESCRIPT.md S6)
	@echo "Not available yet: the standalone Node runtime is planned (slice S6)."
	@echo "Today: 'make dev' runs the Worker locally; the VPS image runs it in workerd (docs/SELF_HOST_VPS.md)."
	@exit 1

worker: ## Planned: run standalone background processing (REDESIGN_HOMESCRIPT.md S6)
	@echo "Not available yet: standalone background processing is planned (slice S6)."
	@echo "Today: Cloudflare Queues/Workflows in production, emulated by Miniflare under 'make dev'."
	@exit 1
