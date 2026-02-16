# Synapse - Self-hosted AI Gateway
# Usage: make <target>

.PHONY: dev build start stop test backup deploy-convex docker-up docker-down clean lint help

CONVEX_URL := http://127.0.0.1:3220
CONVEX_KEY := convex-self-hosted|015a6a54173badd2432fb2672664854f894fa873b17d6be425afd24c1f4db709bb4d4690f2

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Start dev server
	npm run dev

build: ## Production build
	npm run build

start: build ## Build and start with PM2
	pm2 restart synapse-hub || pm2 start npm --name synapse-hub -- start

stop: ## Stop PM2 process
	pm2 stop synapse-hub

test: ## Run test suite
	npm test

test-build: build ## Smoke test (build succeeds)
	@echo "Build succeeded - smoke test passed"

backup: ## Run backup script
	@if [ -f scripts/backup.sh ]; then bash scripts/backup.sh; else echo "No backup script found"; fi

deploy-convex: ## Deploy Convex schema and functions
	CONVEX_SELF_HOSTED_URL=$(CONVEX_URL) CONVEX_SELF_HOSTED_ADMIN_KEY="$(CONVEX_KEY)" npx convex dev --once --typecheck=disable

docker-up: ## Start all services via Docker Compose
	docker compose -f docker/docker-compose.yml up -d

docker-down: ## Stop all Docker services
	docker compose -f docker/docker-compose.yml down

clean: ## Clean build artifacts
	rm -rf .next node_modules/.cache

lint: ## Run linter
	npx next lint

.DEFAULT_GOAL := help
