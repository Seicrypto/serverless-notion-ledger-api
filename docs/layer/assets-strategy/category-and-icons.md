# Asset Category And Icons

This document outlines the V1 direction for category and icon support across assets, characters, and organization-level filtering workflows.

It is intentionally separate from the ledger core documents because categories serve discovery, filtering, and visual identification rather than financial correctness.

## Purpose

The category module exists to improve how people find and recognize records quickly.

Representative V1 use cases:

- filter assets by broad item family
- filter characters by class, role, or position
- help large organizations narrow down participants faster
- improve visual recognition with lightweight icons

## Core Direction

- categories are not assets
- categories are reusable classification records
- icons are attached to categories, not treated as tradeable or ledger assets
- the module should support both asset-facing and character-facing use cases

## Recommended V1 Tables

Recommended future direction:

- `categories`
- `asset_categories`
- `character_categories`

Suggested category types:

- `asset_type`
- `asset_family`
- `character_role`
- `character_class`
- `guild_group`
- `tag`

## Scope Direction

Categories should support both shared and local usage patterns.

Recommended scope direction:

- global shared categories for well-known game taxonomies
- organization-local categories for guild-specific grouping and workflows

This mirrors the asset module's broader direction of supporting both cross-organization and local records.

## Icon Strategy

V1 should strongly prefer `SVG` icons.

Reasoning:

- icons are rendered frequently in search, filtering, and selection flows
- users often change filters quickly while browsing
- large raster assets create avoidable render and network cost
- consistent SVG handling improves predictability in the frontend

## V1 Icon Rules

Recommended V1 rules:

- icons should be SVG-first
- category creation should accept either:
  - trusted inline SVG content
  - a URL that resolves to an SVG asset
- non-SVG formats should be rejected in normal category creation flows

This keeps the UI fast and reduces the likelihood of oversized or unpredictable images appearing in common picker surfaces.

## Validation Direction

When a user submits a category icon, the system should validate that the icon format matches the product's rendering expectations.

Recommended V1 validation direction:

- if inline content is submitted, validate that it is parseable SVG markup
- if a URL is submitted, validate that the path or file type is SVG-oriented
- reject unsupported or obviously oversized icon payloads
- normalize how the stored icon reference is represented before the frontend consumes it

V1 does not need full remote fetch-and-verify behavior if that adds too much operational complexity. A lighter first step is still valuable as long as the accepted shape is intentionally narrow.

## Why Categories Should Be Separate From Assets

Assets answer:

- what item, currency, or reward is this

Categories answer:

- how should people group and visually recognize this record

Keeping those responsibilities separate avoids turning the asset model into a catch-all structure and makes it easier to reuse the same category logic for characters and organization workflows.

## Future Direction

Likely future expansions:

- game-specific default category sets
- organization-level custom icon packs
- category ordering and pinning
- translated category labels
- category analytics based on usage frequency
