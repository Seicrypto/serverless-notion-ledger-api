# Ledger V1 Data Architecture Draft

This document captures the current V1 design direction for the Raid Ledger data model.

It is intentionally focused on concepts, table responsibilities, and future direction instead of implementation details. The goal is to keep the document stable even while services, repositories, and API handlers continue to evolve.

## Core Direction

- `D1` is the source of truth for ledger data.
- `Notion` is a content and projection layer, not the primary ledger database.
- Ledger-critical data should be queryable, auditable, and safe to normalize.
- User-facing wording can change in the frontend, but storage keys should stay stable and English-first.

## Why D1 Owns the Ledger

The V1 product centers on:

- event records
- participant relationships
- asset references
- settlement calculations
- per-character allocations
- claim and payout tracking

Those records are highly relational and will gradually require:

- stronger validation
- clearer status transitions
- historical corrections
- deduplication
- rollups by organization, game, character, and time period

For that shape of data, `D1` is a better long-term home than `Notion`.

## Role of Notion in V1

`Notion` still has an important role, but not as the primary ledger store.

Recommended V1 uses:

- organization descriptions
- game or asset reference pages
- dashboard presentation pages
- manually curated digest pages
- rich text explanations and visual content

Avoid using Notion as the source of truth for:

- event records
- settlement calculations
- allocation correctness
- claim state
- payout tracking

## Data Ownership Split

### Source of Truth in D1

- events
- event participants
- assets
- settlements
- settlement allocations
- settlement claims
- organization-specific ledger rules

### Human-Edited Content

- organization descriptions
- game notes
- asset detail pages
- event summaries
- dashboard presentation text

### Projection or Digest Data

- pending claims overview
- pending payouts overview
- organization revenue summaries
- monthly and event digest pages
- dashboard snapshot numbers

## V1 Core Tables

### `assets`

Purpose:

- represent anything that can later be referenced by events, listings, or price history
- provide a stable asset key even before a richer encyclopedia exists

Important notes:

- V1 assets are not meant to be a full item wiki
- users can add assets manually
- duplicate prevention should be advisory first, not overly strict
- later cleanup should happen through merge workflows instead of destructive deletion

Recommended responsibilities:

- keep a stable `asset_key`
- store the display name and normalized name
- record the owning game
- support merge and deprecation states
- leave room for richer metadata later

### `events`

Purpose:

- represent any event that may later lead to distribution or settlement

Examples:

- loot drop
- raid result
- short-term in-game activity
- guild-hosted event
- bonus-triggering activity

Important notes:

- an event does not have to mean a sold item
- the same event model should support both loot-like and non-loot scenarios
- the event should remain valid even if later financial handling changes

### `event_participants`

Purpose:

- normalize participants out of the event record
- keep the event itself clean while supporting future weighting rules

Important notes:

- V1 defaults to equal participation weight
- future versions can support richer weighting logic without rewriting the event table

### `settlements`

Purpose:

- represent one settlement or payout decision
- generalize the old `sales_db` idea into a broader financial record

Examples:

- a sold loot item
- an event bonus
- a guild salary payment
- a subsidy or reimbursement
- a later adjustment record

Important notes:

- `settlement_type` is a classification and default-behavior hint
- it should not hide the actual financial logic
- the actual calculation should still be determined by the stored fields

### `settlement_allocations`

Purpose:

- split one settlement into one row per beneficiary

Important notes:

- a settlement stores the total decision
- allocations store who should receive how much
- this is the normalized replacement for storing all receivers inside one record

Conceptually:

- `settlement` = total amount and decision context
- `allocation` = one receiver's expected share

### `settlement_claims`

Purpose:

- store actual claim or payout records after money is received

Important notes:

- allocations are expected amounts
- claims are actual received records
- this separation preserves room for partial claims, manual adjustments, and audit history

Conceptually:

- `allocation` = account receivable
- `claim` = actual receipt or payout confirmation

## Fee Handling in V1

V1 settlements support several fee modes:

- `none`
- `percent`
- `fixed`
- `rule`

### `none`

Used when there is no fee deduction.

### `percent`

Used when the user directly enters a percentage such as a market tax.

### `fixed`

Used when the fee is a fixed amount.

### `rule`

Used when the fee should come from a reusable preset rule instead of being manually entered each time.

Examples of future rule-based fee presets:

- in-game market sale fee
- guild auction handling fee
- cross-organization transfer fee

The purpose of `rule` is to help new users follow standard behavior while still allowing advanced users to override details when needed.

## Settlement Types in V1

Suggested V1 types:

- `sale`
- `bonus`
- `salary`
- `reward`
- `subsidy`
- `adjustment`

These types are intended to:

- improve classification
- help dashboard grouping
- provide frontend defaults
- support auditing and filtering

They should not be treated as the only source of business logic. The actual fields on the settlement row should remain authoritative.

## Asset Strategy in V1

Asset management is expected to be much harder than game management.

Games can gradually rely on external identifiers such as `steam appid`, but assets usually cannot. Because of that, V1 should avoid overpromising perfect deduplication.

Recommended V1 asset strategy:

- allow manual creation by users
- require a linked game
- generate a normalized name for similarity checks
- warn on likely duplicates instead of hard-blocking every case
- support merge workflows later through canonical asset references

This keeps asset creation practical while preserving a path toward cleaner data over time.

## Why Assets Still Exist in V1

Even if the first product version could technically survive with event descriptions only, a minimal `assets` table is still useful because it unlocks future directions such as:

- item-specific sales listings
- shared trade boards
- historical price tracking
- cross-event asset lookup
- asset detail pages

V1 should therefore keep assets lightweight, but it should still establish the asset identity layer early.

## Asset Content and Notion

Detailed asset descriptions are a good future fit for `Notion`.

Long, complex asset notes may eventually include:

- acquisition details
- use cases
- patch-specific notes
- rich formatting
- screenshots or manual guides

A good long-term split is:

- `D1` stores structured asset identity and transaction-linked data
- `Notion` stores rich asset reference content

That allows the frontend to:

- use `D1` for fast lists, lookups, and price history
- fetch linked Notion content only when detailed reading is needed

## Currency and Amount Storage

Financial amounts should be stored in integer minor units where practical.

Examples:

- cents for fiat-like currencies
- the smallest meaningful unit chosen by the game or organization

This reduces ambiguity and avoids introducing floating-point money issues into the core ledger.

## Status Design Direction

V1 should explicitly model lifecycle states instead of inferring everything from nullable fields.

The main areas that need status machines are:

- events
- settlements
- settlement allocations
- settlement claims or payout confirmation flows

Suggested direction:

- events track whether they are still open, ready, partially settled, or finished
- settlements track whether they are draft, calculated, currently paying, or fully paid
- allocations track whether a beneficiary is still pending, already claimed, waived, or cancelled

The exact status machine should be defined separately before service logic is implemented.

## Future Direction

After V1 stabilizes, likely follow-up areas include:

- richer status machine definitions
- organization-level fee and payout rules
- asset merge tools
- market listing projections
- price history analytics
- linked Notion pages for assets and organization content
- snapshot-based dashboard sync from `D1` into `Notion`

## Document Scope

This document is meant to preserve:

- the data ownership split
- the intent of each table
- the reasons behind key modeling choices

It is not meant to mirror the codebase line by line.
