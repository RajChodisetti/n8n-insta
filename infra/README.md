# Local Infra

This stack brings up the local services needed to start building the workflow:

- `n8n`
- `postgres`
- `redis`
- `minio`

## Ports

Host ports are intentionally set to high random-looking values instead of defaults to reduce collisions with other local apps:

- `n8n`: `35678`
- `postgres`: `36432`
- `redis`: `36379`
- `minio api`: `39000`
- `minio console`: `42173`

They live in [`.env.example`](./.env.example) and should be copied to `infra/.env` before first run.

## Start

```bash
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

Open:

- n8n: `http://localhost:35678`
- MinIO console: `http://localhost:42173`

## Notes

- The compose file also loads the repo root `.env` so n8n can access project secrets without duplicating them.
- Persistent runtime state is stored under `infra/state/`.
- Seed workflow exports live under [`workflows/n8n`](../workflows/n8n).
- The initial schema is applied from [`postgres/init/001_init.sql`](./postgres/init/001_init.sql).

## Test This Backlog Item

This local infra setup is currently in `implemented_awaiting_test`.

Run:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
docker exec n8n-insta-postgres psql -U n8n_insta -d n8n_insta -c "\\dt"
```

Verify:

- `n8n` is reachable at `http://localhost:35678`
- MinIO console is reachable at `http://localhost:42173`
- Postgres custom tables from `001_init.sql` exist

After you test it, report pass or fail. If it passes, this item should be moved to `complete` and then you should raise a PR.
