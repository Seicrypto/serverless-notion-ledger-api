# Allocation State Machine

This document defines the V1 business lifecycle for `settlement_allocations`.

An allocation is one beneficiary's expected share of a settlement.

## Purpose

An allocation answers:

- who should receive value from the settlement
- how much that beneficiary should receive
- whether that beneficiary is still pending, already handled, waived, or cancelled

This is the normalized business replacement for storing all beneficiaries inside one settlement row.

## V1 States

### `pending`

Meaning:

- this beneficiary should receive value
- actual receipt or payout completion has not been confirmed yet

Typical characteristics:

- allocation exists
- amount exists
- no final claim outcome exists yet

This is the default active state.

### `claimed`

Meaning:

- the allocation has been satisfied
- the expected value has been actually received or confirmed

Typical characteristics:

- one or more claim records exist
- the allocation is no longer actionable in normal payout flow

In V1, even if the implementation begins with one allocation mapping to one claim, the business meaning should remain broader so future partial claims remain possible.

### `waived`

Meaning:

- the beneficiary's expected share is intentionally not being claimed

Typical characteristics:

- the allocation existed legitimately
- the share was intentionally given up, forfeited, or administratively skipped

This should not be treated the same as cancellation or mistaken data.

### `cancelled`

Meaning:

- this allocation should no longer be part of the active payout handling

Typical characteristics:

- the allocation was created in error
- the allocation became invalid because the settlement structure changed before completion

Cancelled should usually mean the allocation should no longer count as an owed share.

## Expected State Flow

Normal flow:

`pending -> claimed`

Alternative business flow:

`pending -> waived`

Exceptional flow:

`pending -> cancelled`

V1 should avoid moving a `claimed` allocation backward. If something went wrong later, that should normally be corrected by follow-up financial records rather than pretending the original business event never happened.

## Entry Conditions

### Enter `pending`

Required:

- a valid settlement exists
- beneficiary context exists, or the business has a legitimate placeholder reason
- the owed amount is known

### Enter `claimed`

Required:

- the allocation has been satisfied through real claim handling

Suggested checks:

- claim records exist
- the allocation no longer has unresolved owed value in the intended V1 flow

### Enter `waived`

Required:

- the beneficiary's entitlement is intentionally being relinquished or administratively closed without claim

### Enter `cancelled`

Required:

- the allocation should be removed from active payout responsibility

## Transition Rules

### `pending -> claimed`

Allowed when:

- actual claim handling is complete for this beneficiary

### `pending -> waived`

Allowed when:

- the beneficiary's share is intentionally not being taken

### `pending -> cancelled`

Allowed when:

- the allocation was invalid before completion
- the settlement structure was corrected before this allocation was legitimately fulfilled

## Relationship to Settlement State

Allocation state contributes to settlement state.

Typical relationship:

- all allocations still `pending` usually means settlement is not fully paid
- some allocations terminal and some active usually means settlement is `paying`
- all allocations terminal usually supports settlement becoming `paid`

Allocation state should therefore be treated as a key driver of payout progress.

## Relationship to Claims

Allocations are expected-value records.

Claims are actual receipt records.

That means:

- allocation status is business summary
- claim rows are detailed receipt evidence

An allocation should not become `claimed` without corresponding real-world confirmation behavior.

## Operational Notes

- `waived` and `cancelled` are not the same.
- `waived` preserves the idea that a valid share existed but was intentionally not taken.
- `cancelled` means the share should not count as a valid active obligation anymore.
- Allocation status is the cleanest business layer to drive member-facing pending and received views.
