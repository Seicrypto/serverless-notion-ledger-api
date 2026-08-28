# Settlement State Machine

This document defines the V1 business lifecycle for `settlements`.

A settlement is one financial decision record. It may represent a sale, reward, bonus, salary, subsidy, or adjustment.

## Purpose

A settlement answers:

- what financial action is being made
- how much gross value exists
- what fees apply
- what net amount is available
- how that net amount should be distributed

It is broader than the old `sales_db` concept and should not be limited to item sale scenarios.

## V1 States

### `draft`

Meaning:

- the settlement exists but is not ready to be treated as a finalized financial decision

Typical characteristics:

- gross amount may exist
- fee handling may still be under review
- allocation mode may still change
- allocations may not yet exist

This is the safe editing state.

### `calculated`

Meaning:

- the settlement has enough confirmed data to compute or confirm the final distributable amount
- the distribution plan is now stable enough to proceed

Typical characteristics:

- gross amount is known
- fee logic is known
- net amount is known
- allocation mode is fixed for this decision
- allocations may already exist or be ready to create

### `paying`

Meaning:

- payout or claim handling has started
- at least some beneficiary handling is underway

Typical characteristics:

- one or more allocations exist
- at least one allocation has started moving toward an actual claim outcome

This state exists to clearly separate:

- a completed calculation
- an actually active payout process

### `paid`

Meaning:

- the settlement is operationally complete
- the intended payout handling is finished

Typical characteristics:

- all relevant allocations are terminal
- any expected claim work is complete

This is the normal successful terminal state.

### `cancelled`

Meaning:

- the settlement should no longer remain active in the normal payout flow

Typical characteristics:

- settlement was created in error
- settlement was superseded before payout completion
- settlement is no longer valid

Use this instead of destructive deletion when history should remain inspectable.

## Expected State Flow

Normal flow:

`draft -> calculated -> paying -> paid`

Exceptional flow:

`draft -> cancelled`

Possible administrative flow:

`calculated -> cancelled`

V1 should strongly avoid moving a `paying` or `paid` settlement back into earlier active states. Corrections should usually be handled by new adjustment settlements instead.

## Entry Conditions

### Enter `draft`

Required:

- settlement record exists
- organization context exists
- a settlement reason or type exists

Optional:

- linked event
- fee rule reference
- payer reference

### Enter `calculated`

Required:

- gross amount is confirmed
- fee method is confirmed
- net amount is confirmed
- allocation mode is confirmed

Suggested checks:

- if `fee_mode = percent`, the percent value exists
- if `fee_mode = fixed`, the fee amount exists
- if `fee_mode = rule`, a valid rule key exists

### Enter `paying`

Required:

- allocations exist or are being treated as fixed
- at least one payout path has started

### Enter `paid`

Required:

- all intended allocations are terminal
- the settlement no longer has pending payout work

### Enter `cancelled`

Required:

- settlement should no longer produce or continue live payout handling

## Transition Rules

### `draft -> calculated`

Allowed when:

- the settlement data is financially coherent
- downstream distribution can now be trusted

### `calculated -> paying`

Allowed when:

- allocations are created or confirmed
- payout processing actually begins

### `paying -> paid`

Allowed when:

- the payout process is fully concluded

### `draft -> cancelled`

Allowed when:

- the settlement was a mistaken draft
- it should never enter live payout handling

### `calculated -> cancelled`

Allowed when:

- payout has not begun
- the settlement must be abandoned or replaced

## Fee Mode Notes

`fee_mode` changes how the net amount is derived, but it does not change the lifecycle itself.

### `none`

- net amount is effectively gross amount

### `percent`

- fee is derived from an explicit percent

### `fixed`

- fee is derived from a fixed amount

### `rule`

- fee is derived from a named preset rule

The state machine should only require that the selected fee method is complete and understandable before entering `calculated`.

## Settlement Type Notes

`settlement_type` helps with business classification, defaults, and reporting. It should not be used as a hidden substitute for actual financial fields.

Examples of how type may influence defaults:

- `sale` may commonly use fee logic
- `bonus` may commonly use equal distribution
- `salary` may commonly use manual allocation
- `adjustment` may exist to correct previous outcomes

But final meaning should still come from the settlement row itself.

## Operational Notes

- The settlement is the main financial decision layer.
- Allocation records should not exist without a meaningful settlement context.
- If a previously paid settlement needs correction, prefer a new compensating or adjustment settlement over rewriting business history invisibly.
