# Event State Machine

This document defines the V1 business lifecycle for `events`.

An event is the source activity record that may later lead to one or more settlements.

## Purpose

An event represents something that happened.

Examples:

- a loot drop
- a raid result
- a short-term activity reward
- a guild-run internal event
- a non-sale reward-triggering activity

An event is not the payout itself. It is the upstream context that later financial records may reference.

## V1 States

### `open`

Meaning:

- the event has been created
- the record is still being prepared or reviewed
- participant data or event details may still change
- no finalized settlement has been established yet

Typical characteristics:

- event exists
- participants may already exist
- asset may or may not be linked
- no settlement exists yet, or only abandoned draft work exists

### `ready_for_settlement`

Meaning:

- the event has enough information to start financial handling
- the event can now produce one or more settlements

Typical characteristics:

- core participants are confirmed
- the event should no longer need structural edits
- any required holder or asset references are settled enough for payout work

### `partially_settled`

Meaning:

- at least one settlement has been created from this event
- but the event is not fully concluded from a financial perspective

Typical characteristics:

- one or more valid settlements exist
- there may still be pending settlement work
- additional settlements may still be legitimate

This state is important because one event may later produce:

- a sale settlement
- a bonus settlement
- a salary-like settlement
- a later corrective adjustment

So multiple settlement records do not automatically imply an error.

### `settled`

Meaning:

- all intended settlement work for the event is complete
- no further normal payout activity is expected

Typical characteristics:

- all known settlements for the event are complete, cancelled, or otherwise terminal
- operationally, the event is treated as finished

This does not mean the record is immutable forever. It means the normal flow is complete.

### `cancelled`

Meaning:

- the event should no longer participate in the normal ledger flow

Typical characteristics:

- event was created in error
- event was duplicated
- event was invalidated before legitimate settlement completion

Cancelled should be used instead of destructive deletion when history matters.

## Expected State Flow

Normal flow:

`open -> ready_for_settlement -> partially_settled -> settled`

Exceptional flow:

`open -> cancelled`

Possible administrative flow:

`ready_for_settlement -> cancelled`

V1 should avoid routinely moving a `partially_settled` or `settled` event backward. If a later correction is required, prefer creating a new settlement adjustment instead of rolling business history back.

## Entry Conditions

### Enter `open`

Required:

- organization exists
- core event record exists
- minimal title and occurred time exist

Optional:

- asset reference
- holder reference
- participant list

### Enter `ready_for_settlement`

Required:

- event is legitimate and not a draft mistake
- participant list is good enough for payout planning, or the event explicitly does not require participant-based payout
- event metadata is stable enough for downstream financial work

Suggested checks:

- event type is known
- organization context is clear
- if payout depends on participants, the participant list is present

### Enter `partially_settled`

Required:

- at least one non-cancelled settlement has been created from the event

### Enter `settled`

Required:

- all expected settlements have reached a terminal business outcome
- no additional normal settlement is expected

### Enter `cancelled`

Required:

- the event should no longer be handled in the active ledger flow

## Transition Rules

### `open -> ready_for_settlement`

Allowed when:

- the event record is no longer only a draft
- downstream payout work can safely begin

### `ready_for_settlement -> partially_settled`

Allowed when:

- the first real settlement is created

### `partially_settled -> settled`

Allowed when:

- all related intended settlements are complete enough for operational closure

### `open -> cancelled`

Allowed when:

- the event was created accidentally
- the event should never have entered processing

### `ready_for_settlement -> cancelled`

Allowed when:

- the event became invalid before real payout handling completed

## Things That Should Not Alone Force an Error

The following situations should not automatically be treated as invalid:

- one event having multiple settlements
- an event not having an asset
- an event not representing a sale
- an event later producing an adjustment-related settlement

Those cases are expected in the broader V1 design.

## Operational Notes

- Event status should represent business readiness, not merely database completeness.
- The event should be the anchor context for later human review.
- If financial handling becomes more complicated later, prefer adding new settlements instead of overloading the event record itself.
