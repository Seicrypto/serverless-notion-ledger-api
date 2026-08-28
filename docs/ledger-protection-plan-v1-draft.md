# Ledger Protection Plan V1 Draft

## Purpose

This document records the first protection plan for high-traffic ledger APIs.

It is intentionally a planning document only.
The current priority remains MVP core business flow validation for internal guild/member testing.
Protection middleware, snapshot caching, and Cloudflare edge rules can be implemented later when:

- internal testing confirms the dashboard and disbursement flows are stable
- public traffic becomes meaningful
- ko-fi or paid-plan related modules start introducing stronger abuse incentives

## Why This Is Deferred

At the current stage, over-investing in protection can slow down validation of the core product loop:

- create event
- create settlement
- generate allocations
- record claims / disbursements
- render organization and character dashboard views

The current strategy is:

1. finish the core ledger workflow first
2. validate it with real member usage
3. add request protection where hot paths are confirmed

## Main Risk Areas

The most likely early abuse or accidental overuse cases are:

- repeated refreshes on dashboard summary endpoints
- repeated character detail queries from public or semi-public pages
- scripted scraping of organization ledger snapshots
- member-side rapid refresh after disbursement actions
- unnecessary recomputation of aggregate D1 queries

## Priority Routes

The first protection rollout should focus on these routes:

- `GET /organizations/{organization}/ledger/dashboard/summary`
- `POST /organizations/{organization}/ledger/dashboard/character-summaries/query`
- `GET /organizations/{organization}/ledger/dashboard/characters/{characterId}`

The next protection wave can extend to:

- `GET /organizations/{organization}/ledger/claimable-recipients`
- `GET /organizations/{organization}/ledger/claimable-recipients/{characterId}`
- `POST /organizations/{organization}/ledger/claims/batch`

## Protection Layers

### 1. Cloudflare Edge Layer

This is the outermost protection layer and should absorb obvious abuse before Worker CPU is spent.

Suggested responsibilities:

- IP-based rate limiting for public ledger reads
- challenge or block rules for suspicious request bursts
- bot filtering where clearly safe
- optional ASN / country / UA rules if abuse patterns appear

This layer should be conservative at first so it does not interfere with legitimate guild usage.

### 2. Worker Application Layer

This is the route-aware protection layer.
It should understand whether a request is:

- public-ish snapshot reading
- authenticated member reading
- member-triggered post-settlement refresh

Suggested responsibilities:

- route-specific rate limiting
- snapshot cache lookups
- query-key based throttling for repeated identical requests
- different rules for public callers vs authenticated members

### 3. Business Exception Layer

This layer exists for product experience rather than general abuse control.

When a member has just created or updated:

- a settlement
- allocations
- claims / disbursement records

that member may need a short refresh window to verify the result.

Suggested responsibilities:

- short-lived refresh unlock
- limited to specific dashboard routes only
- still bounded by per-second limits

## Draft Rate-Limit Policy

These values are intentionally draft values and should be tuned after real usage is observed.

### Public Dashboard Requests

Recommended first-pass behavior:

- apply IP-based throttling
- keep burst allowance small
- prefer snapshot responses over recomputation

Example draft target:

- sustained: around 1 request per second per IP for hot dashboard routes
- burst: around 3 to 5 requests per second per IP for a very short window

### Authenticated Member Dashboard Requests

Recommended first-pass behavior:

- rate limit by `IP + userId` when JWT is present
- still keep per-route protection
- allow slightly higher short-term refresh tolerance than public traffic

Example draft target:

- sustained: around 1 to 2 requests per second
- short burst: around 3 to 5 requests per second

### Refresh Unlock Window

For members who just changed ledger state, allow a temporary higher-frequency read window.

Example draft target:

- TTL: 90 to 180 seconds
- applies only to selected dashboard routes
- does not disable rate limits entirely

## Snapshot Strategy

Snapshotting is the main CPU-saving strategy for dashboard reads.

### Summary Snapshot

For `GET /dashboard/summary`:

- use a coarse time bucket such as 30 minutes
- same route + same organization within the bucket can reuse the same payload
- public callers should prefer snapshot-first behavior

### Character Summaries Snapshot

For `POST /dashboard/character-summaries/query`:

- key by organization + normalized character id set + time bucket
- frontends usually request small fixed batches, so snapshot reuse should be good

### Character Detail Snapshot

For `GET /dashboard/characters/{characterId}`:

- key by organization + character id + time bucket
- public or non-member traffic should strongly prefer snapshot reuse

### Member Refresh Behavior

During the short post-update window:

- members may bypass stale snapshots if needed
- fresh results should still be written back as the newest snapshot

This keeps member verification fast without making public traffic expensive.

## Refresh Unlock Scope

The unlock mechanism should be narrow.

Recommended scope:

- only dashboard routes
- only the member who triggered the recent settlement-related change
- only for a short TTL

It should not automatically whitelist:

- all organization members
- all ledger routes
- write routes
- unrelated public endpoints

## Recommended Data Inputs For Protection

When implementation starts, the protection module will likely need:

- requester IP
- authenticated user id if present
- organization id
- route identity
- normalized query key
- recent settlement-change activity markers

Possible storage options can be decided later based on implementation preference:

- KV for snapshot payloads and short TTL unlock markers
- Durable Object if stricter coordination is later required
- pure Cloudflare WAF rules for edge-only controls

## Interaction With Product Design

This plan follows the current product direction:

- keep member UX smooth after settlement operations
- avoid spending Worker CPU on repeated identical public reads
- protect the most visible dashboard APIs first
- delay stricter controls until the MVP usage pattern is clearer

## Relationship To Future Monetization

When ko-fi support or paid-plan modules are added, this protection plan should evolve into a broader quota policy.

Likely future extensions:

- plan-based API refresh budgets
- higher dashboard refresh allowance for paid orgs
- stronger anti-scraping controls on public ledger views
- clearer abuse handling and temporary restriction flows

## Non-Goals For Current MVP

The following are intentionally out of scope for now:

- full edge + app rate-limit implementation
- billing-aware quota enforcement
- automated bot scoring
- advanced anomaly detection
- user-facing admin controls for protection tuning

## Recommended Rollout Order

When protection work resumes, the recommended order is:

1. add snapshot support for dashboard hot routes
2. add route-specific Worker rate limits
3. add member refresh unlock TTL for settlement-related updates
4. add Cloudflare edge rules
5. integrate protection rules with monetization / quota design

