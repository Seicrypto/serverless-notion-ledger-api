# Claim State Machine

This document defines the V1 business lifecycle for `settlement_claims`.

A claim record represents actual receipt or payout confirmation activity against one allocation.

## Purpose

A claim exists to record that money, value, or equivalent benefit was actually transferred, received, or confirmed.

This is the most operationally concrete layer in the ledger flow.

## V1 State Model

V1 can remain intentionally simple here.

The current migration stores claims as concrete records without a dedicated `status` column. Business-wise, the lifecycle can still be expressed in states so the future model stays clear.

Recommended V1 business states:

- `recorded`
- `confirmed`
- `voided`

These may remain conceptual states until a dedicated status field is introduced in a later migration.

## V1 States

### `recorded`

Meaning:

- a claim record has been created because a receipt or payout action was reported
- the action has been logged, but business confirmation may still be pending depending on workflow

Typical characteristics:

- allocation reference exists
- amount exists
- claimed time exists
- claim method exists

### `confirmed`

Meaning:

- the claim is accepted as valid for business purposes
- the corresponding allocation can safely be treated as satisfied

Typical characteristics:

- the organization considers this claim final enough to count
- no further confirmation step is expected

### `voided`

Meaning:

- the claim record should no longer be treated as valid for active business totals

Typical characteristics:

- claim was entered by mistake
- claim was superseded by a corrected record
- claim should remain visible historically but should not count as successful receipt

## Expected State Flow

Normal flow:

`recorded -> confirmed`

Exceptional flow:

`recorded -> voided`

Possible administrative flow:

`confirmed -> voided`

The last flow should be rare and audited clearly, because it changes the meaning of previously completed business handling.

## Entry Conditions

### Enter `recorded`

Required:

- allocation exists
- amount exists
- claim time exists
- claim method exists

### Enter `confirmed`

Required:

- the organization accepts the claim as valid
- any needed verification step is complete

### Enter `voided`

Required:

- the claim should no longer count as a valid receipt record

## Transition Rules

### `recorded -> confirmed`

Allowed when:

- the reported payout or receipt is accepted as complete

### `recorded -> voided`

Allowed when:

- the record was entered incorrectly
- it should not count operationally

### `confirmed -> voided`

Allowed when:

- a correction is unavoidable
- a legitimate audit reason exists

This transition should be rare and visible in future audit tooling.

## Relationship to Allocation State

Claims are evidence rows.

Allocations are business obligation rows.

Typical relationship:

- a valid confirmed claim supports an allocation becoming `claimed`
- a voided claim should not justify a satisfied allocation

V1 may temporarily simplify implementation by treating claim creation itself as enough to satisfy an allocation, but the business language should still preserve the distinction between:

- a receipt record existing
- a receipt record being trusted

## Why This Layer Is Separate

This layer exists so the system can grow later without redesigning the ledger model.

Future examples:

- partial claims
- multiple claims per allocation
- delegated pickup
- corrected payout logs
- admin confirmation workflows

Without a separate claim layer, those future paths become much harder to support cleanly.

## Operational Notes

- Claims are the most audit-sensitive layer.
- The business should prefer preserving a visible correction trail instead of silently rewriting history.
- Even if V1 implementation stays simple, the state machine should already reflect the future need for explicit confirmation and void handling.
