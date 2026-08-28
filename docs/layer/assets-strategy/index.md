# Assets Strategy Layer

This layer describes how Raid Ledger treats assets as a product system rather than only as a table.

It exists because the asset problem is not only about storage.

The system must also decide:

- how asset names are normalized
- how duplicate candidates are detected
- how low-trust records are exposed
- how canonical identity is merged over time
- how category and icon support improves search and selection

## Why This Layer Is Separate

The main ledger architecture document should stay focused on data ownership and table responsibilities.

The asset strategy layer is more specific:

- operational quality control
- trust and exposure rules
- identity resolution
- future merge and split direction

That makes it a better place for iterative product rules that may evolve faster than the rest of the ledger model.

## Submodules

- [normalization.md](/Users/sei/Documents/GitHub/serverless-notion-ledger-api/docs/layer/assets-strategy/normalization.md)
- [duplicate-detection.md](/Users/sei/Documents/GitHub/serverless-notion-ledger-api/docs/layer/assets-strategy/duplicate-detection.md)
- [trust-lifecycle.md](/Users/sei/Documents/GitHub/serverless-notion-ledger-api/docs/layer/assets-strategy/trust-lifecycle.md)
- [identity-resolution.md](/Users/sei/Documents/GitHub/serverless-notion-ledger-api/docs/layer/assets-strategy/identity-resolution.md)
- [category-and-icons.md](/Users/sei/Documents/GitHub/serverless-notion-ledger-api/docs/layer/assets-strategy/category-and-icons.md)

## How The Submodules Work Together

Recommended V1 flow:

1. a user submits an asset candidate
2. normalization produces a stable comparison form
3. duplicate detection checks for exact or likely existing matches
4. if creation is still allowed, the asset is stored in a low-trust state
5. trust lifecycle rules decide when that asset becomes more visible
6. identity resolution rules decide whether it should remain separate, merge into a canonical asset, or later be split
7. category and icon support improves how users discover and recognize assets in the UI

## Responsibility Split

### Normalization

Answers:

- how should text be transformed before comparison

### Duplicate Detection

Answers:

- does this look like something that already exists

### Trust Lifecycle

Answers:

- who should see this asset now
- how much confidence should the system place in it

### Identity Resolution

Answers:

- should this asset remain separate
- should it be merged into another canonical asset
- how should aliases and canonical references behave

### Category And Icons

Answers:

- how should users visually find and classify assets faster

## Strategy Direction

These modules are not fully independent and should not be collapsed into one service either.

Recommended relationship:

- normalization is foundational
- duplicate detection depends on normalization
- trust lifecycle depends on actual usage evidence
- identity resolution may use duplicate and trust signals, but it is a separate decision layer
- category support improves discovery, not financial correctness

## Development Direction

Recommended V1 implementation order:

1. normalization
2. duplicate detection
3. trust lifecycle
4. identity resolution and merge workflows
5. category and icon support refinements

Recommended future expansion:

- scoring and reputation systems
- scheduled trust recomputation
- review queues for suspicious merge candidates
- split workflows for incorrectly merged assets
- richer multilingual alias and description content

## Current Product Stance

V1 should prefer:

- low-maintenance backend rules
- controlled exposure instead of manual approval
- non-destructive cleanup through merge and deprecation
- keeping canonical identity separate from UI convenience features

## Document Scope

This layer defines the strategy, boundaries, and interaction model for assets.

It does not lock in exact migration steps, SQL schema, or route contracts.
