# Ledger State Machines

This folder contains the business-layer state machine drafts for Raid Ledger V1.

These documents are intentionally written from a workflow and operations perspective instead of a code-first perspective.

Use them to define:

- what each record means in business terms
- when a record is allowed to move forward
- what conditions block a transition
- which downstream records are expected to exist

## Files

- `event-state-machine.md`
- `settlement-state-machine.md`
- `allocation-state-machine.md`
- `claim-state-machine.md`

## Reading Order

Recommended reading order:

1. `event-state-machine.md`
2. `settlement-state-machine.md`
3. `allocation-state-machine.md`
4. `claim-state-machine.md`

That order matches the normal V1 operational flow:

`event -> settlement -> allocation -> claim`

## Scope

These documents define business intent and lifecycle rules.

They do not define:

- API contracts
- repository implementation
- validation library details
- UI component behavior

Those implementation details should follow these state rules, not replace them.
