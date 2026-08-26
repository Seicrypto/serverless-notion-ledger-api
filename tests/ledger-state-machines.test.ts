import assert from "node:assert/strict";
import test from "node:test";
import { InvalidStateTransitionError } from "../src/services/ledger/errors";
import { allocationStateMachine } from "../src/services/ledger/state-machines/allocation-state-machine";
import { claimStateMachine } from "../src/services/ledger/state-machines/claim-state-machine";
import { eventStateMachine } from "../src/services/ledger/state-machines/event-state-machine";
import { settlementStateMachine } from "../src/services/ledger/state-machines/settlement-state-machine";

test("event state machine allows expected transitions and blocks invalid ones", () => {
  assert.deepEqual(eventStateMachine.allowedTransitions("open"), [
    "ready_for_settlement",
    "cancelled",
  ]);
  assert.doesNotThrow(() =>
    eventStateMachine.assertTransition("open", "ready_for_settlement"),
  );
  assert.throws(
    () => eventStateMachine.assertTransition("open", "settled"),
    InvalidStateTransitionError,
  );
});

test("settlement state machine enforces draft to paid workflow", () => {
  assert.deepEqual(settlementStateMachine.allowedTransitions("draft"), [
    "calculated",
    "cancelled",
  ]);
  assert.doesNotThrow(() =>
    settlementStateMachine.assertTransition("draft", "calculated"),
  );
  assert.doesNotThrow(() =>
    settlementStateMachine.assertTransition("calculated", "paying"),
  );
  assert.doesNotThrow(() =>
    settlementStateMachine.assertTransition("paying", "paid"),
  );
  assert.throws(
    () => settlementStateMachine.assertTransition("draft", "paid"),
    InvalidStateTransitionError,
  );
});

test("allocation state machine keeps terminal states closed", () => {
  assert.deepEqual(allocationStateMachine.allowedTransitions("pending"), [
    "claimed",
    "waived",
    "cancelled",
  ]);
  assert.doesNotThrow(() =>
    allocationStateMachine.assertTransition("pending", "claimed"),
  );
  assert.throws(
    () => allocationStateMachine.assertTransition("claimed", "pending"),
    InvalidStateTransitionError,
  );
});

test("claim state machine supports confirm and void flows", () => {
  assert.deepEqual(claimStateMachine.allowedTransitions("recorded"), [
    "confirmed",
    "voided",
  ]);
  assert.doesNotThrow(() =>
    claimStateMachine.assertTransition("recorded", "confirmed"),
  );
  assert.doesNotThrow(() =>
    claimStateMachine.assertTransition("confirmed", "voided"),
  );
  assert.throws(
    () => claimStateMachine.assertTransition("voided", "confirmed"),
    InvalidStateTransitionError,
  );
});
