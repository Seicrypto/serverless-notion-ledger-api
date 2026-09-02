# Org Member Management V1

## Purpose

This document defines the first practical membership-management design for organizations.

The V1 goal is not to build a fully featured guild-management system.
The goal is to make the current org workflow safe enough to operate with real members by:

- defining a clear member lifecycle
- defining a clear character assignment lifecycle
- preventing common accidental or abusive admin actions
- providing the minimum route set needed for day-to-day org operations

This document is intentionally product-facing and implementation-aware.
It is meant to serve as the V1 decision baseline before implementation starts.

## Why V1 Is Needed

The current codebase already includes part of the workflow foundation:

- org roles: `owner`, `admin`, `member`
- member statuses: `pending`, `active`, `left`, `removed`
- pending action records for `apply` and `invite`
- character claim request records for `pending_confirmation`

However, the current behavior is still only partially closed:

- some pending flows can still be bypassed by direct manager actions
- pending reservations can live too long without expiry enforcement
- self-leave and manager kick flows are not yet exposed as real APIs
- pending draft characters are too close to real active characters
- no single document defines the intended org membership rules

V1 should close those gaps before the org module becomes harder to evolve.

## V1 Product Principles

- keep the role system simple: `owner`, `admin`, `member`
- use explicit statuses instead of relying only on role checks
- prefer reversible soft-state transitions over destructive deletion
- separate membership approval from character ownership confirmation
- require extra protection for actions that change who controls a character
- support common guild operations before edge-case governance features

## Actor Model

V1 should distinguish between org roles and org relationship states.

The 3 org roles are still:

- `owner`
- `admin`
- `member`

But those roles apply only after a user is an active org member.

In practice, the API also needs to support a non-member actor class.

Recommended V1 actor groups:

- `non_member`
- `pending_member`
- `active_member`
- `active_admin`
- `active_owner`

### Non-Member

A non-member is an authenticated user who is not currently an active member of the org.

This includes:

- users with no org membership record yet
- users who were invited but have not accepted yet
- users who applied but are not approved yet
- users whose prior membership is `left`
- users whose prior membership is `removed`

Recommended V1 permissions:

- view public org detail surfaces
- apply to an organization
- accept an invite sent to them
- decline an invite sent to them
- cancel their own pending apply or invite workflow if product wants self-cancel

Recommended V1 restrictions:

- non-members do not receive org member permissions
- non-members cannot view management surfaces
- non-members cannot directly control org characters unless a pending workflow explicitly reserves one for them

### Pending Member

A pending member is not yet an active org member.
This is a workflow state, not a true org role.

Recommended V1 permissions:

- view their own pending workflow state
- accept or decline their own invite
- cancel their own pending application if that route is exposed

Recommended V1 restrictions:

- pending members must not be treated as active members for auth
- pending members must not receive member-only org permissions
- pending members may reserve a character, but do not fully own it yet

## Role Model

### Owner

The owner is the highest org role in V1.

Recommended permissions:

- update org profile
- delete org
- invite members
- approve or reject member applications
- remove members
- appoint admins
- remove admins
- assign, transfer, or unassign characters
- view pending and active member management lists

Recommended V1 protection:

- an owner cannot be demoted through normal role routes
- org must always have exactly one effective owner in V1
- ownership transfer is out of scope for V1 unless deliberately added later

### Admin

Admins are org managers but not org owners.

Recommended permissions:

- invite members
- approve or reject member applications
- remove members
- assign characters to members
- create claim requests
- unassign characters
- view pending and active member management lists

Recommended V1 restrictions:

- cannot appoint or remove admins
- cannot delete org
- cannot change owner privileges
- cannot bypass confirmation rules for protected transfer flows unless explicitly allowed

### Member

Members are active org participants.

Recommended permissions:

- view their org memberships
- leave an organization
- view public or allowed org member/character surfaces
- respond to character claim confirmation flows if those are exposed in V1 UI/API

Recommended V1 restrictions:

- cannot approve members
- cannot invite others
- cannot remove others
- cannot directly assign or transfer characters

### Summary Rule

`apply to organizations` and `accept or decline invites` should not be modeled as `member` permissions.

They belong to:

- `non_member`
- or more precisely `pending_member` when a pending row already exists

This distinction matters because those actions happen before the user becomes an active org member.

## Membership Lifecycle

### Membership States

Recommended V1 states:

- `pending`
- `active`
- `left`
- `removed`

### Membership State Meaning

- `pending`: a membership workflow exists but is not yet fully accepted or approved
- `active`: user is an accepted org member and counts for normal org permissions
- `left`: member voluntarily exited the org
- `removed`: membership was rejected, cancelled, declined, or forcibly removed by org management

### Membership State Machine

```text
apply            -> pending
invite           -> pending
approve apply    -> active
accept invite    -> active
reject apply     -> removed
decline invite   -> removed
cancel pending   -> removed
leave            -> left
remove member    -> removed
reapply/reinvite -> pending
reactivate       -> active or pending
```

### Membership Transition Rules

- only `pending` memberships can be approved, rejected, accepted, declined, or cancelled
- only `active` memberships can leave or be removed as active members
- `left` and `removed` are non-active historical states
- rejoin behavior should reuse the historical membership row when practical
- all membership permission checks must only treat `active` as authorized

## Character Assignment Lifecycle

Membership status and character control should be treated as related but separate concerns.

V1 should define a lightweight character assignment state model even if it is not stored as a single enum column yet.

### Logical Assignment States

Recommended logical states:

- `available`
- `reserved_for_pending_member`
- `claimed`
- `pending_transfer_confirmation`
- `unassigned`
- `deleted`

### State Meaning

- `available`: no one currently controls the character and it may be used in apply/invite/assign flows
- `reserved_for_pending_member`: character is temporarily held by a pending apply or invite flow
- `claimed`: character is currently owned by an active member
- `pending_transfer_confirmation`: the org wants to move control to another member and is waiting for confirmation
- `unassigned`: equivalent to `available` for API behavior, but useful for business wording
- `deleted`: soft deleted and unavailable

### Character Assignment State Machine

```text
available -> reserved_for_pending_member
reserved_for_pending_member -> claimed
reserved_for_pending_member -> available
claimed -> pending_transfer_confirmation
pending_transfer_confirmation -> claimed
claimed -> available
available -> claimed
any non-deleted -> deleted
```

### V1 Protection Rules

- a character reserved by a pending member flow must not appear as generally available
- a pending draft character should not be treated as a normal roster character until approval or invite acceptance completes
- direct reassignment from one member to another should not silently overwrite ownership without explicit transfer behavior
- cancelling or expiring a pending membership must release the reserved character
- removing or leaving a member must define what happens to their claimed characters

## Character Ownership Policy In V1

To keep V1 predictable, character ownership should follow these rules:

- one org member may control zero or more characters only if product explicitly wants alt-character support
- if V1 wants simpler governance, limit one active claimed character per member for now
- one character can belong to only one user at a time
- pending members may reserve one character during apply or invite
- transfer between active members should require a dedicated transfer flow

Recommended first-pass policy:

- keep the current one-active-character-per-member guard
- allow multiple unclaimed org characters to exist
- do not allow a manager to silently transfer a claimed character without a confirmation step

## Pending Workflow Model

V1 should distinguish two related but different pending concepts.

### 1. Pending Membership

Used for:

- member application
- org invitation

Backed by:

- `organization_members.status = pending`
- `organization_member_pending_actions`

### 2. Pending Character Transfer Confirmation

Used for:

- assigning a claimed character to a different active member
- requesting confirmation before final reassignment

Backed by:

- `character_claim_requests`

### Important V1 Rule

Do not use a generic `pending` label for every workflow without naming what is pending.

At minimum the API and docs should differentiate:

- pending membership
- pending invite
- pending character transfer confirmation

## Recommended V1 API Surface

This is the minimum route set recommended for V1.

### Membership Intake

- `POST /organizations/{organization}/members/apply`
  - authenticated user applies to join an org
  - creates `pending` membership
  - reserves existing character or creates pending character draft

- `POST /organizations/{organization}/members/invite`
  - owner/admin invites a user
  - creates `pending` membership with `invite` pending action

- `POST /organizations/{organization}/members/{memberId}/approve`
  - owner/admin approves a pending apply
  - activates membership
  - finalizes reserved character assignment

- `POST /organizations/{organization}/members/{memberId}/reject`
  - owner/admin rejects a pending apply
  - marks membership `removed`
  - releases reserved character

- `POST /organizations/{organization}/members/{memberId}/accept-invite`
  - invited user accepts invite
  - activates membership
  - finalizes reserved character assignment

- `POST /organizations/{organization}/members/{memberId}/decline-invite`
  - invited user declines invite
  - marks membership `removed`
  - releases reserved character

### Membership Exit And Cleanup

- `POST /organizations/{organization}/members/{memberId}/leave`
  - active member leaves their org
  - target must be self unless owner-level override is intentionally added
  - marks membership `left`
  - applies configured character-release policy

- `POST /organizations/{organization}/members/{memberId}/remove`
  - owner/admin removes an active member
  - marks membership `removed`
  - applies configured character-release policy

- `POST /organizations/{organization}/members/{memberId}/cancel`
  - cancel a pending membership before completion
  - owner/admin can cancel pending invite or pending apply
  - invited/applying user can cancel their own pending workflow

### Role Management

- `POST /organizations/{organization}/members/{memberId}/appoint-admin`
  - owner only

- `POST /organizations/{organization}/members/{memberId}/remove-admin`
  - owner only

### Character Assignment

- `POST /organizations/{organization}/characters/{characterId}/assign`
  - direct assign only when character is currently unclaimed and target member is active
  - should not be the same route as transfer if the rules differ

- `POST /organizations/{organization}/characters/{characterId}/unassign`
  - owner/admin unassigns a currently claimed character
  - clears ownership

- `POST /organizations/{organization}/characters/{characterId}/claim-request`
  - create transfer or confirmation request
  - preferred for any flow that changes ownership from one active user to another

- `POST /organizations/{organization}/character-claim-requests/{requestId}/accept`
  - target user accepts reassignment

- `POST /organizations/{organization}/character-claim-requests/{requestId}/decline`
  - target user declines reassignment

- `POST /organizations/{organization}/character-claim-requests/{requestId}/cancel`
  - requester or manager cancels outstanding request

### Member Management Views

- `GET /organizations/{organization}/members`
  - public or semi-public active member list if product wants it

- `GET /organizations/{organization}/management/members/active`
  - owner/admin member management list

- `GET /organizations/{organization}/management/members/pending`
  - owner/admin pending workflow list

- `GET /organizations/me`
  - current user's org memberships

- `GET /organizations/current/members`
  - optional compatibility route, but not necessary if `me` routes cover the need

## Recommended Route Semantics

V1 should avoid overloading a single route with too many behaviors.

Recommended direction:

- keep `apply`, `invite`, `approve`, `reject`, `accept-invite`, `decline-invite`
- split `claim` into clearer routes such as `assign`, `unassign`, and `claim-request`
- treat transfer confirmation as its own resource instead of embedding too many modes in one body

This will make frontend integration and permission review much easier.

## Character Release Policy When Membership Ends

This needs an explicit V1 decision.

Recommended V1 default:

- when a pending membership ends, release the reserved character immediately
- when an active member leaves or is removed, unassign their claimed characters by default
- do not delete real active characters when a member leaves
- only delete character drafts that were created solely for a pending membership and never became active

This gives the safest and most reversible behavior.

## Expiry Policy

V1 should treat pending workflows as expirable.

Recommended first-pass policy:

- invite expires after 30 days
- apply may expire after 30 days, or remain until manager action if product prefers
- expired pending workflows become non-actionable
- expiry cleanup must release reserved characters

Recommended implementation direction:

- enforce expiry during read and action routes
- optionally add later cleanup job, but route-level enforcement is enough for V1

## Audit And History Direction

Full audit logs can wait until later, but V1 should preserve enough history for support and debugging.

Recommended fields to rely on or add:

- membership `created_at`
- membership `approved_at`
- membership `joined_at`
- membership `left_at`
- membership `removed_at`
- pending action `kind`
- pending action `invited_by_user_id`
- claim request `requested_by_user_id`
- claim request `created_at`
- claim request `updated_at`

If V1 wants one additional improvement, add actor fields for removal and approval actions.

## Recommended V1 Data Adjustments

These are not all mandatory before first implementation, but they should guide the technical design.

### Strongly Recommended

- prevent pending draft characters from appearing in the normal roster
- enforce pending expiry at action time
- add explicit leave/remove/cancel APIs
- split direct assign from transfer-confirmation flows

### Nice To Have

- add `approved_by_user_id` on org memberships
- add `removed_by_user_id` on org memberships
- add dedicated character reservation state instead of inferring it only from pending-action joins
- add request acceptance routes for `character_claim_requests`

## Out Of Scope For V1

The following can wait:

- owner transfer
- multi-step admin elections
- ban lists
- probation roles
- granular per-feature permissions
- complex alt-character policies
- guild subdivisions, squads, teams, or ranks beyond the base 3 roles
- full event-sourced audit history

## Recommended V1 Implementation Order

1. finalize membership and character-lifecycle rules in this document
2. split or tighten character assignment routes so pending confirmation cannot be bypassed accidentally
3. add leave/remove/cancel membership routes
4. enforce expiry and character release rules
5. hide pending draft characters from normal roster surfaces
6. add route-level tests for apply, invite, approve, reject, leave, remove, assign, and transfer confirmation

## V1 Decision Checklist

The following should be treated as the proposed V1 decisions.

### Actor And Permission Decisions

- `apply to organization` is a `non_member` action
- `accept invite` is a `non_member` or `pending_member` action
- `decline invite` is a `non_member` or `pending_member` action
- only `active` membership unlocks org member permissions
- `pending` membership does not count as org membership for authorization

### Membership Decisions

- V1 membership statuses are `pending`, `active`, `left`, `removed`
- apply and invite both enter `pending`
- approved apply becomes `active`
- accepted invite becomes `active`
- rejected, declined, and cancelled pending workflows become `removed`
- self-exit from an active member becomes `left`
- manager-forced exit from an active member becomes `removed`
- rejoin should reuse the historical membership row when practical

### Character Decisions

- keep one active claimed character per member in V1
- allow many unclaimed org characters to exist
- allow a pending membership to reserve one character
- a reserved character must not appear in general availability lists
- a pending draft character must not appear in the normal active roster
- leaving or removing a member unassigns their claimed character by default

### Assignment And Transfer Decisions

- direct assign is allowed only for currently unclaimed characters
- direct assign requires an active target member
- transfer of an already claimed character always requires confirmation
- unassign is an explicit management action
- assignment and transfer should not share one overloaded route if their rules differ

### Pending Workflow Decisions

- pending invite expires after 30 days
- pending apply should also expire after 30 days in V1 unless product explicitly wants manual-only expiry
- expired pending workflows are non-actionable
- expiry cleanup must release reserved characters
- route-level expiry enforcement is enough for first implementation

### API Decisions

- keep explicit routes for `apply`, `invite`, `approve`, `reject`, `accept-invite`, `decline-invite`
- add explicit routes for `leave`, `remove`, and `cancel`
- split `claim` into clearer assignment and transfer-related routes
- `GET /organizations/me` is sufficient for V1 member self-view
- `GET /organizations/current*` convenience routes are optional and not required for first implementation

### Audit Decisions

- preserve `created_at`, `approved_at`, `joined_at`, `left_at`, `removed_at`
- preserve pending action metadata and claim-request metadata
- adding `approved_by_user_id` and `removed_by_user_id` is recommended but not required for first implementation

## Notes For Implementation

When implementation starts, auth checks should be written against actor state, not only role labels.

In practice that means:

- `non_member` routes should not require active org membership
- `pending_member` routes should validate that the pending workflow belongs to the caller
- `member` routes should require `active`
- `admin` routes should require `active + admin`
- `owner` routes should require `active + owner`
