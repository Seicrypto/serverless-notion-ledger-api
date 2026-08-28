# Layer Documents

This folder contains business-layer strategy documents for Raid Ledger V1.

These documents are intentionally written from a workflow, product, and operations perspective instead of a code-first perspective.

Use them to define:

- what each record means in business terms
- when a record is allowed to move forward
- what conditions block a transition
- which downstream records are expected to exist
- how cross-cutting product strategy modules interact

## Folders

- `assets-strategy/`
- state machine documents in this folder root

## Assets Strategy

The asset strategy documents live in:

- [assets-strategy/index.md](/Users/sei/Documents/GitHub/serverless-notion-ledger-api/docs/layer/assets-strategy/index.md)

Recommended reading order:

1. `normalization.md`
2. `duplicate-detection.md`
3. `trust-lifecycle.md`
4. `identity-resolution.md`
5. `category-and-icons.md`

## Ledger State Machines

The ledger state machine documents are:

- `event-state-machine.md`
- `settlement-state-machine.md`
- `allocation-state-machine.md`
- `claim-state-machine.md`

Recommended reading order:

1. `event-state-machine.md`
2. `settlement-state-machine.md`
3. `allocation-state-machine.md`
4. `claim-state-machine.md`

That order matches the normal V1 operational flow:

`event -> settlement -> allocation -> claim`

## Scope

These documents define business intent, lifecycle rules, and strategic boundaries.

They do not define:

- API contracts
- repository implementation
- validation library details
- UI component behavior

Those implementation details should follow these state rules, not replace them.
