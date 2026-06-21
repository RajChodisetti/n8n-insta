# Instagram Token Exchange Runbook

This repo includes [scripts/exchange_instagram_long_lived_token.sh](/Users/rajchodisetti/n8n-insta/scripts/exchange_instagram_long_lived_token.sh) to exchange a short-lived Meta Graph token for a long-lived token and write the new value back into repo-root `.env`.

## Required `.env` keys

- `INSTAGRAM_GRAPH_API_TOKEN` or `SHORT_LIVED_INSTAGRAM_GRAPH_API_TOKEN`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- optional: `GRAPH_API_VERSION`

## Run it

```bash
bash scripts/exchange_instagram_long_lived_token.sh
```

What it does:

- exchanges the current short-lived Graph user token
- validates the new token with `/me` and `/me/accounts`
- writes the new token into `INSTAGRAM_GRAPH_API_TOKEN`
- keeps a timestamped backup of `.env`

## Restart runtime after exchange

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --force-recreate n8n studio-ui
```

## Verify

```bash
bash scripts/check_instagram_permissions.sh
```

If the new token is valid, the publish workflows will use it on the next run.
