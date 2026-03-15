# ---------------------------------------------------------------------------
# Makefile — convenience commands for the Image Hosting project
#
# All targets are designed to be run from the project root.
# Alembic targets (revision / upgrade / downgrade) exec into the running
# backend container so they have access to the correct Python environment
# and database connection.
# ---------------------------------------------------------------------------

.PHONY: up down restart logs shell revision upgrade downgrade

## Build images and start all containers in detached mode
up:
	docker compose up --build -d

## Stop and remove all containers (data volumes are preserved)
down:
	docker compose down

## Restart all containers without rebuilding
restart:
	docker compose restart

## Tail backend logs  (Ctrl-C to exit)
logs:
	docker compose logs -f backend

## Open an interactive shell inside the backend container
shell:
	docker exec -it fastapi-backend bash

## Generate a new Alembic migration  Usage: make revision m="your message"
revision:
	docker exec -it fastapi-backend poetry run alembic revision --autogenerate -m "$(m)"

## Apply all pending Alembic migrations
upgrade:
	docker exec -it fastapi-backend poetry run alembic upgrade head

## Roll back the most recent Alembic migration
downgrade:
	docker exec -it fastapi-backend poetry run alembic downgrade -1
