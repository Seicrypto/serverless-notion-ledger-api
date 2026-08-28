# Asset Duplicate Detection

This document defines the V1 duplicate detection strategy for assets.

The goal is not to guarantee perfect uniqueness. The goal is to help the system and the user avoid obvious duplication while keeping creation lightweight.

## Purpose

Duplicate detection should answer:

- is there an exact existing match
- is there an alias match
- are there likely similar candidates the user should see before creating a new record

## V1 Matching Layers

Recommended V1 matching order:

1. canonical exact match by normalized asset name
2. exact alias match by normalized alias
3. possible match by token overlap or name containment

## Recommended Inputs

Duplicate detection should consider:

- `game_id`
- normalized asset name
- organization context
- canonical asset names
- alias records
- current asset lifecycle status

## Scope Awareness

V1 duplicate detection should not blindly compare every asset equally.

It should respect:

- same game first
- same organization context when local candidates matter
- merged assets should not appear as normal selectable matches

## Recommended Outcomes

V1 should return structured outcomes rather than only true or false.

Recommended result shape:

- exact match
- possible matches
- normalized comparison form
- recommended action

Examples of recommended action:

- `use_existing`
- `confirm_create`
- `block_create`

## Relationship To Trust Lifecycle

Duplicate detection and trust lifecycle are related but separate.

Duplicate detection answers:

- does this resemble an existing asset

Trust lifecycle answers:

- how visible and trustworthy is this asset right now

An asset may be:

- unique but still low-trust
- similar to another asset but still temporarily retained until merge review

## Relationship To Identity Resolution

Duplicate detection produces signals.

It should not automatically decide canonical merge in every case.

That decision belongs to identity resolution.

## Future Direction

Likely future expansion:

- stronger token weighting
- per-game naming heuristics
- alias confidence ranking
- suspicious duplicate queues
- machine-assisted merge suggestions

## Document Scope

This document defines duplicate detection strategy only.
