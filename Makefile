# -----------------------------------------------------------------------------
# MediClinic — raccourcis de développement
#
# Cibles principales :
#   make install    installe les dépendances du monorepo
#   make env        crée le fichier .env
#   make up         démarre MySQL, phpMyAdmin et MailHog (Docker)
#   make db-reset   recrée la base avec le jeu de démonstration
#   make dev        lance l'API et le front en parallèle
#
# Toutes les cibles qui manipulent la base passent par Node (et non plus par
# bash) afin de fonctionner à l'identique sous Windows, macOS et Linux.
# -----------------------------------------------------------------------------

SHELL := /bin/bash
DB ?= mediclinic
MYSQL ?= mysql -u root -p

.PHONY: help install env up down db-init db-views db-seed db-reset db-verify \
        screenshots dev api web build test test-api test-web lint format clean

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Installe toutes les dépendances du monorepo
	npm install

env: ## Crée .env depuis .env.example si absent
	@test -f .env || (cp .env.example .env && echo "Fichier .env créé — adaptez-le.")

up: ## Démarre MySQL, phpMyAdmin et MailHog
	docker compose up -d

down: ## Arrête les conteneurs
	docker compose down

db-init: ## Crée le schéma et les tables (via le client mysql)
	$(MYSQL) $(DB) < database/migrations/001_init.sql

db-views: ## Crée les vues métier (via le client mysql)
	$(MYSQL) $(DB) < database/migrations/002_views.sql

db-seed: ## Insère les données de démonstration (via le client mysql)
	$(MYSQL) $(DB) < database/migrations/003_seed.sql

db-reset: ## Recrée complètement la base (init + vues + seed), multiplateforme
	node database/scripts/reset-db.mjs --seed --yes

db-verify: ## Contrôle statique des scripts SQL (21 vérifications)
	node database/scripts/verify-sql.mjs

screenshots: ## Régénère les visuels de documentation
	python database/scripts/generate-screenshots.py

dev: ## Lance API et web en parallèle
	npm run dev

api: ## Lance uniquement l'API
	npm run dev:api

web: ## Lance uniquement le front
	npm run dev:web

build: ## Build de production
	npm run build

test: ## Exécute tous les tests
	npm test

test-api: ## Tests de l'API uniquement
	npm run test:api

test-web: ## Tests du front uniquement
	npm run test:web

lint: ## Analyse statique
	npm run lint

format: ## Formate le code
	npm run format

clean: ## Supprime les artefacts de build
	rm -rf dist apps/*/dist packages/*/dist
	rm -rf coverage apps/*/coverage
