# serverless-notion-ledger-api

Cloudflare Worker API for the Raid Ledger project. The current stack uses:

- `Cloudflare Workers`
- `D1`
- `KV`
- `Durable Objects`
- `Hono + zod-openapi`
- `Resend`

## First Deploy Checklist

After the Worker has been deployed once and exists in Cloudflare, configure the following runtime values in the Worker dashboard.

### Secrets

Set these in:

- Cloudflare Dashboard
- `Workers & Pages`
- select this Worker
- `Settings`
- `Variables and Secrets`

Required secrets:

- `RESEND_API_KEY`
- `JWT_SECRET`
- `PASSWORD_PEPPER`

### Vars

Set these as normal Worker variables:

- `APP_BASE_URL`
  - Example: `https://api.example.com`
- `APP_FRONTEND_URL`
  - Optional frontend base URL used in email links
  - Example: `https://app.example.com` or `https://app.example.com/`
- `RESEND_FROM_EMAIL`
  - Example: `Raid Ledger <no-reply@mail.sideweaver.com>`
- `OFFICIAL_ADMIN_EMAILS`
  - Comma-separated whitelist emails
  - Example: `you@example.com,another-admin@example.com`

## Notes

- `RESEND_API_KEY` must be configured on the Worker runtime. A GitHub secret alone is not enough for runtime email sending.
- `RESEND_FROM_EMAIL` must use a sender identity that is authorized in Resend for the same account as `RESEND_API_KEY`. If the key is scoped to `mail.sideweaver.com`, values like `no-reply@sideweaver.com` will be rejected with `403`.
- `APP_FRONTEND_URL` should point to the frontend site if email links need to open a UI page such as `/{lang}/account-status`. If omitted, email links fall back to `APP_BASE_URL`.
- Registration `lang` values are normalized to the frontend-supported set: `zh-tw`, `en`, `ja`. Unknown values fall back to `en`.
- `OFFICIAL_ADMIN_EMAILS` is treated as configuration, not a secret. It can be injected during deployment or set in the Cloudflare dashboard.
- `wrangler.toml` declares required secrets so deploys fail early if they are missing.
- KV naming and TTL strategy are documented in [docs/kv-key-strategy.md](/Users/sei/Documents/GitHub/serverless-notion-ledger-api/docs/kv-key-strategy.md).

## OpenAPI Export

The Hono app already serves a live OpenAPI document at `/openapi.json`, but frontend code generation usually works better with a committed or generated static file.

The generated document is currently **OpenAPI 3.1.0**.

Generate a static OpenAPI JSON file with:

```bash
npm run openapi:export
```

By default it writes to:

```text
openapi/openapi.json
```

You can also pass a custom output path:

```bash
node scripts/run-ts-entry.mjs scripts/export-openapi.ts ./some/path/openapi.json
```

## Wrangler Logs

Use Wrangler tail to inspect Worker runtime logs during internal testing.

Tail the deployed Worker:

```bash
npx wrangler tail
```

Tail a specific environment:

```bash
npx wrangler tail --env production
```

Readable JSON logs are useful when checking organization search behavior:

```bash
npx wrangler tail --format pretty
```

Current organization search logs include:

- `[organizations.search.validation_failed]`
- `[organizations.search.completed]`
