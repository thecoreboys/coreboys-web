import assert from "node:assert/strict";
import test from "node:test";
import { waitForPushWorker } from "../lib/notifications/browser-push";

class Worker extends EventTarget { state = "installing"; }
class Registration extends EventTarget { active: Worker | null = null; installing: Worker | null = new Worker(); waiting: Worker | null = null; }

test("first-time push setup waits for activation before subscribing", async () => {
  const registration = new Registration();
  let subscribed = false;
  const pending = waitForPushWorker(registration as unknown as ServiceWorkerRegistration).then(() => { subscribed = true; });
  await Promise.resolve();
  assert.equal(subscribed, false);
  registration.active = registration.installing;
  registration.active!.state = "activated";
  registration.active!.dispatchEvent(new Event("statechange"));
  await pending;
  assert.equal(subscribed, true);
});

test("existing active workers are ready immediately and failed installation times out", async () => {
  const registration = new Registration();
  registration.active = new Worker();
  registration.active.state = "activated";
  await waitForPushWorker(registration as unknown as ServiceWorkerRegistration, 5);
  registration.active = null;
  await assert.rejects(waitForPushWorker(registration as unknown as ServiceWorkerRegistration, 5), /could not start/);
});
