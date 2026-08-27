# Asset Identity Resolution

This document defines how V1 should think about canonical asset identity, merge behavior, and future split direction.

Identity resolution is separate from trust.

Trust answers:

- how visible and credible is this asset right now

Identity resolution answers:

- is this actually the same thing as another asset

## Core Direction

- canonical asset identity lives in `assets`
- alternate names live in `asset_aliases`
- low-trust records are not automatically wrong
- merge is preferred over destructive deletion
- split should remain a future correction path if a merge was too aggressive

## Why This Layer Matters

Two assets may both be real and still need different decisions:

- one may be low-trust but unique
- one may be high-trust but still a duplicate of another record

That is why trust lifecycle should not directly own canonical merge decisions.

## Recommended V1 Canonical Model

Recommended responsibilities:

- one canonical asset record remains selectable
- merged records point to the canonical target
- aliases can be consolidated under the canonical asset
- old references should resolve through canonical lookup instead of being deleted

## Merge Direction

V1 merge should be conservative.

Recommended triggers:

- strong duplicate evidence
- repeated user confusion around the same records
- future backend scoring that suggests a high-confidence canonical target

Recommended outcomes:

- source asset becomes `merged`
- source points at `canonical_asset_id`
- alias coverage is preserved
- historical references remain intact

## Split Direction

V1 does not need a full split workflow yet, but the design should leave room for one.

Future split examples:

- two similar assets were merged too early
- one localized nickname actually refers to a different item
- one organization-local reward was incorrectly treated as a shared asset

## Relationship To Duplicate Detection

Duplicate detection creates candidate signals.

Identity resolution decides:

- keep separate
- merge later
- expose as similar only

## Relationship To Trust Lifecycle

Trust should not automatically force merge.

Possible combinations:

- `candidate` and unique
- `candidate` and likely duplicate
- `active` and still mergeable into a better canonical asset

## Strategy Direction

Recommended V1 pattern:

1. normalize and compare
2. create a candidate when creation is still allowed
3. observe real usage and trust signals
4. merge only when confidence is meaningfully high

## Future Direction

Likely future additions:

- merge suggestion queues
- split workflows
- admin-only canonical review tools
- alias confidence scoring
- cross-locale resolution helpers

## Document Scope

This document defines identity resolution strategy only.
