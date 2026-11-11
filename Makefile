# Faro · atajos de automatización. `make help` lista los objetivos.
.DEFAULT_GOAL := help
SHELL := /bin/bash
COMPOSE := docker compose
OPS := python3 ops/faro_ops.py
VENV := apps/sentinel/.venv

.PHONY: help setup init certs doctor up down restart ps logs smoke backup restore vpn vpn-qr vpn-status \
        letsencrypt-issue letsencrypt-renew test lint design-check hooks clean

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-18s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------- entorno de desarrollo
setup: ## Instala dependencias de desarrollo (API, web y sentinel)
	cd apps/api && npm ci
	cd apps/web && npm ci
	python3 -m venv $(VENV) && $(VENV)/bin/pip install -q -r apps/sentinel/requirements-dev.txt

hooks: ## Activa el hook que valida los mensajes de commit
	git config core.hooksPath .githooks

# -------------------------------------------------------------------------- despliegue
init: ## Genera secretos aleatorios y el archivo .env
	@$(OPS) init $(ARGS)

certs: ## Genera el certificado TLS local (CA propia)
	@$(OPS) certs $(ARGS)

doctor: ## Revisa requisitos (Docker, secretos, certificados, puertos)
	@$(OPS) doctor

up: init certs ## Construye y levanta todo el entorno
	$(COMPOSE) up -d --build --wait
	@echo; echo "  Sitio:    $$(grep ^PUBLIC_URL .env | cut -d= -f2)"; echo "  Prueba:   make smoke"

down: ## Detiene los contenedores (los datos se conservan)
	$(COMPOSE) down

restart: ## Reinicia un servicio: make restart S=api
	$(COMPOSE) restart $(S)

ps: ## Estado de los contenedores
	$(COMPOSE) ps

logs: ## Logs en vivo (opcional: make logs S=api)
	$(COMPOSE) logs -f --tail=100 $(S)

smoke: ## Prueba de humo de extremo a extremo
	@$(OPS) smoke

# ------------------------------------------------------------------------ operaciones
backup: ## Copia de seguridad comprimida de MySQL (conserva las 7 últimas)
	@$(OPS) backup

restore: ## Restaura una copia: make restore FILE=backups/faro-XXXX.sql.gz
	@$(OPS) restore $(FILE)

vpn: ## Muestra la configuración de un cliente: make vpn PEER=laptop
	@$(OPS) vpn show $(PEER)

vpn-qr: ## Código QR de un cliente (para el móvil): make vpn-qr PEER=celular
	@$(OPS) vpn qr $(PEER)

vpn-status: ## Estado del túnel WireGuard (clientes conectados)
	@$(OPS) vpn status

letsencrypt-issue: ## Emite un certificado público (requiere dominio real y puerto 80)
	@$(OPS) letsencrypt issue $(ARGS)

letsencrypt-renew: ## Renueva el certificado público y recarga Nginx (programar con cron)
	@$(OPS) letsencrypt renew

clean: ## ¡Destructivo! Borra contenedores Y volúmenes (base de datos incluida)
	$(COMPOSE) down -v

# ---------------------------------------------------------------------------- calidad
test: ## Ejecuta todas las pruebas
	cd apps/api && npm run typecheck && npm test
	cd apps/web && npm run check
	cd apps/sentinel && .venv/bin/python -m pytest -q
	python3 -m unittest discover -s ops/tests

design-check: ## Detector de patrones de "diseño genérico" de Impeccable
	cd apps/web && npx --yes impeccable detect src/

lint: ## Valida mensajes de commit del historial y separación diseño/código
	python3 tools/check-commit-msg.py --log
	cd apps/web && npm run lint:design
