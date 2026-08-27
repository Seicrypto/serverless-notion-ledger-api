# Asset Trust Lifecycle

This document describes the V1 trust, visibility, and promotion model for user-created assets.

It exists to solve a practical V1 problem:

- users should be able to create assets freely
- low-maintenance operations should remain possible
- irrelevant or malicious asset creation should not immediately pollute every picker and search flow

The goal is not perfect moderation. The goal is controlled exposure.

## Core Direction

- user creation stays open
- immediate global exposure does not
- trust is earned through real usage
- promotion is handled by backend rules, not manual guild review
- thresholds should remain internal and not be shown to users

## Why V1 Needs This Layer

Duplicate detection only answers:

- does this look like an existing asset

It does not answer:

- is this asset relevant to the selected game
- is this a serious submission or spam
- should this record appear in global search right away

Without a trust lifecycle, a malicious or careless user could create many unrelated assets and quickly degrade the experience for everyone else.

## V1 Lifecycle States

Recommended V1 lifecycle:

- `candidate`
- `org_verified`
- `active`
- `merged`
- `deprecated`

### `candidate`

Meaning:

- newly created
- not yet trusted globally
- may still be valid

Behavior:

- can be referenced by the creating organization
- should appear only in limited candidate or similar-result surfaces
- should not appear in default global search results

### `org_verified`

Meaning:

- enough evidence exists inside one organization to treat the asset as locally credible

Behavior:

- safe to show normally inside that organization
- may appear as a similar suggestion for other organizations
- still not considered a fully global canonical active asset

### `active`

Meaning:

- enough cross-organization evidence exists to trust this as a broadly real asset

Behavior:

- appears in default search results
- can be recommended globally
- can serve as a stable canonical asset for future merge and pricing flows

### `merged`

Meaning:

- this record has been merged into another canonical asset

Behavior:

- no longer selectable as the canonical target in normal flows
- old references should resolve to the canonical asset

### `deprecated`

Meaning:

- intentionally retired from active use

Behavior:

- hidden from normal selection
- preserved for historical reference and audit

## Promotion Logic

V1 should avoid human guild moderation and instead promote assets using backend rules derived from usage.

Recommended evidence order:

1. create the asset
2. let same-organization users reference it in real ledger workflows
3. once enough distinct same-organization usage exists, promote to `org_verified`
4. once enough distinct cross-organization usage exists, promote to `active`

## What Counts As Evidence

V1 should count real business references rather than raw creation attempts.

Recommended qualifying usage:

- referenced by an `event`
- referenced by a `settlement unit` only if that use is meaningful for the game
- referenced by other future business records that represent actual ledger use

Avoid counting:

- repeated create attempts
- repeated edits by the same user
- repeated references by the same user to artificially inflate trust

Distinct users and distinct organizations matter more than raw reference count.

## Recommended V1 Trust Signals

The backend can evaluate trust using signals like:

- distinct users inside the same organization who referenced the asset
- distinct organizations that referenced the asset
- number of completed ledger records that used the asset
- age of the asset
- whether the asset was later merged into another canonical asset

V1 should keep this simple.

Recommended first-pass signals:

- same game
- same organization
- different users
- different organizations

## Exposure Rules

The most important protection is not blocking creation. It is controlling what other users see by default.

Recommended visibility rules:

### `candidate`

- creator can find it
- same organization can see it in candidate or similar-result sections
- should not appear in default cross-organization search
- should not dominate normal pickers

### `org_verified`

- same organization can use it normally
- other organizations can see it only in similar-result or exploratory surfaces
- should still rank below `active` assets

### `active`

- visible in standard search
- eligible for global recommendation
- suitable for default picker results

### `merged` and `deprecated`

- hidden from normal create and picker flows
- accessible only through history, admin, or canonical resolution logic

## Search And Picker Ranking

V1 search should rank by trust before broad text matching.

Recommended ranking direction:

1. exact matches among `active`
2. exact matches among `org_verified`
3. exact matches among same-organization `candidate`
4. similar matches among `active`
5. similar matches among `org_verified`
6. similar matches among same-organization `candidate`

## Why Thresholds Should Stay Private

Thresholds should not be visible to users in V1.

Reasons:

- prevents easy gaming
- keeps the product flexible while tuning rules
- avoids user confusion when the scoring model changes

The UI may later show broad labels such as:

- suggested
- locally trusted
- globally trusted

But V1 does not need to expose exact counts or formulas.

## Relationship To Other Asset Modules

- duplicate detection suggests whether a new record looks unnecessary
- trust lifecycle decides whether that record should be broadly shown
- identity resolution decides whether it should later merge into another canonical asset

## Suggested Future Data Needs

V1 does not need to implement all of these immediately, but the lifecycle suggests the system will likely need some form of:

- asset usage rollups
- distinct user usage counts
- distinct organization usage counts
- first used / last used timestamps
- trust evaluation jobs
- promotion history

## Suggested V1 Implementation Strategy

Recommended phased implementation:

1. add lifecycle states for trust
2. default new assets to `candidate`
3. change picker queries so `candidate` is not treated like `active`
4. record enough usage context to evaluate promotion
5. add backend promotion logic
6. later add scoring, reporting, and deeper moderation

## Non-Goals For V1

V1 does not need:

- manual guild owner approval
- public trust scores
- complex reputation graphs
- full anti-spam moderation tooling
- automatic semantic understanding of every game's item system

The V1 target is narrower:

- let people create assets
- avoid instant global pollution
- let trust emerge from real usage
