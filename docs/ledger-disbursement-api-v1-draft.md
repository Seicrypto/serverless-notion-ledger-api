# Ledger Disbursement API V1 Draft

This document defines the recommended V1 draft for the higher-level settlement disbursement API.

It is intentionally written from the product and API contract perspective, not from the repository or route implementation perspective.

The goal is to align the frontend interaction model with the user mental model:

`event -> settlement -> disburse`

instead of forcing the frontend to manually orchestrate:

`event -> settlement -> allocations -> claims`

## Core Position

V1 should keep `settlement_allocations` and `settlement_claims` as separate normalized records in storage.

However, the main frontend payout flow should not need to understand or manually stage both layers in most normal cases.

Recommended direction:

- keep low-level `allocations` and `claims` APIs for admin tooling, debugging, and advanced operations
- add one higher-level `disburse` API for the normal frontend flow
- let the backend decide whether allocations already exist or need to be created

## Why This Matches Product Direction

- the product goal is low maintenance
- the frontend should stay close to how guild users think
- backend rules are easier to evolve centrally than duplicated frontend orchestration
- normalized storage is still preserved for auditability and future expansion

## V1 Route

Recommended route:

- `POST /{organization}/ledger/settlements/{settlementId}/disburse`

Recommended access:

- organization manager or above

Reason:

- this action represents a payout or distribution operation
- it changes multiple downstream records
- it should remain more restricted than read-only ledger views

## V1 Request Shape

Recommended request body:

```json
{
  "claimedAt": "2026-08-28T12:00:00.000Z",
  "method": "manual",
  "notes": "August raid payout batch 1",
  "items": [
    {
      "characterId": 101,
      "amount": 500,
      "weight": 1,
      "ratio": null
    },
    {
      "characterId": 102,
      "amount": 500,
      "weight": 1,
      "ratio": null
    }
  ]
}
```

### Field Intent

- `claimedAt`
  - when this payout batch was recorded as distributed
- `method`
  - same semantic meaning as claim method in the existing lower-level model
- `notes`
  - batch-level annotation
- `items`
  - each item describes one intended recipient payout

### Item Fields

- `characterId`
  - target recipient
- `amount`
  - payout amount in the settlement unit
- `weight`
  - optional future-friendly trace of why the split exists
- `ratio`
  - optional explicit share marker

## V1 Behavior Rules

The backend should treat this endpoint as an orchestration endpoint, not a simple insert endpoint.

Recommended V1 behavior:

1. verify organization access
2. verify settlement exists and belongs to the organization
3. reject paid or cancelled settlements
4. if settlement is `draft`, move it to `calculated`
5. inspect whether allocations already exist
6. if no allocations exist, create allocations from request items
7. if allocations already exist, validate that request items match or intentionally target those allocations
8. record `claims` as `recorded`
9. if needed, push settlement from `calculated` to `paying`
10. let future confirmation workflows move claims to `confirmed`

## Allocation Creation Strategy

This is the most important design choice.

Recommended V1 rule:

- if the settlement has no allocations yet, `disburse` is allowed to create them
- if the settlement already has allocations, `disburse` should not silently replace them

That means V1 should split into two internal modes.

### Mode A: First-Time Disbursement

Conditions:

- settlement exists
- settlement has zero allocations

Behavior:

- create one allocation per request item
- use request amounts as source of truth
- set allocation status to `pending`
- immediately record one `recorded` claim per created allocation

### Mode B: Existing Allocation Disbursement

Conditions:

- settlement already has one or more allocations

Behavior:

- backend should treat allocations as the payout plan already chosen
- the request should either:
  - reference those existing allocations directly in a future advanced route, or
  - match them by recipient and amount in this higher-level route
- V1 should reject ambiguous mismatches instead of guessing

Recommended conflict examples:

- request includes a character not present in existing allocations
- request amount differs from the existing pending allocation amount
- request tries to repoint an allocation to a different recipient

## Recommended V1 Validation Rules

- request must include at least one item
- every `characterId` must belong to the same organization
- duplicate `characterId` rows in one request should be rejected unless the product explicitly wants split rows
- all amounts must be non-negative
- total request amount should not exceed settlement `net_amount`
- if allocations already exist, request total should not exceed remaining undistributed pending amount
- settlement with existing non-voided claims should not allow silent re-planning

## Recommended V1 Response

Recommended response shape:

```json
{
  "settlement": {
    "id": 88,
    "status": "paying"
  },
  "createdAllocations": [
    {
      "id": 501,
      "characterId": 101,
      "amount": 500,
      "status": "pending"
    }
  ],
  "recordedClaims": [
    {
      "id": 9001,
      "settlementAllocationId": 501,
      "claimedByCharacterId": 101,
      "amount": 500,
      "status": "recorded"
    }
  ],
  "summary": {
    "allocationMode": "created",
    "claimCount": 2,
    "settlementStatusChanged": true
  }
}
```

## Relationship With Existing Routes

The current low-level routes remain useful:

- `POST /{organization}/ledger/allocations`
- `POST /{organization}/ledger/claims`
- `POST /{organization}/ledger/claims/batch`

Recommended product role for each:

- `allocations`
  - internal admin tooling
  - future power-user workflows
  - repair or correction operations
- `claims`
  - low-level primitive
  - audit-friendly unit operation
- `claims/batch`
  - batch record for already-existing allocations
- `settlements/{settlementId}/disburse`
  - main frontend workflow endpoint

## Interaction With Current Lifecycle Services

Recommended internal orchestration order:

1. `SettlementLifecycleService`
   - validate settlement state
   - move `draft -> calculated` if needed
2. `AllocationLifecycleService`
   - create missing allocations only when settlement has none
3. `ClaimLifecycleService`
   - create `recorded` claims
4. `SettlementLifecycleService`
   - move `calculated -> paying` when payout recording begins

This keeps the domain rules inside existing lifecycle services while exposing a simpler product-facing API.

## What V1 Should Not Do

To stay safe and low-maintenance, V1 should avoid:

- silently replacing existing allocations
- auto-merging repeated payout batches without explicit intent
- guessing recipient mappings when existing allocations differ
- marking `confirmed` automatically
- hiding conflicts that should be surfaced to managers

## Recommended Future Extensions

After V1 is stable, future versions can add:

- partial disbursement against one settlement
- disbursement retry or repair flows
- explicit idempotency keys for batch safety
- allocation preview mode
- auto-allocation from event participants and equal weight
- auto-allocation from custom weight rules
- recipient-side confirmation workflows

## Recommended V1 Decision

The recommended V1 product direction is:

- frontend uses `settlement -> disburse`
- backend owns `allocation -> claim` orchestration
- low-level routes remain available but are not the main user path

This gives the product the simpler user experience you want without sacrificing normalized data, audit history, or future extensibility.
