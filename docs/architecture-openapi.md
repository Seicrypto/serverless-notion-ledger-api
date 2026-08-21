# OpenAPI Flow

This API uses `Hono + @hono/zod-openapi` as the single source of truth for routes and API contracts.

## Structure

- `src/app.ts`
  Creates the Hono app, mounts feature modules, and exposes:
  - `/openapi.json` for the generated OpenAPI document
  - `/docs` for Swagger UI
- `src/modules/*/schema.ts`
  Defines route contracts with `createRoute(...)`
- `src/modules/*/route.ts`
  Binds each contract to its real handler with `router.openapi(route, handler)`

## Flow

1. A module defines request and response schemas in `schema.ts`.
2. The module registers the route in `route.ts`.
3. `src/app.ts` mounts the module into the main app.
4. Hono generates `/openapi.json` from those registered route definitions.
5. Frontend or external tools can use that OpenAPI document to generate typed clients.

## Why This Shape

- Route behavior and API contract stay in sync.
- Swagger docs do not need to be maintained by hand.
- Frontend code generation can directly consume the live OpenAPI output.
- Feature modules stay small and easy to extend.
