/** A new registration can still be installing when register() resolves. */
export function waitForPushWorker(registration: ServiceWorkerRegistration, timeoutMs = 15_000): Promise<void> {
  if (registration.active?.state === "activated") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const workers = new Set<ServiceWorker>();
    const cleanup = () => {
      clearTimeout(timer);
      registration.removeEventListener("updatefound", watch);
      for (const worker of workers) worker.removeEventListener("statechange", watch);
    };
    const watch = () => {
      if (registration.active?.state === "activated") {
        cleanup();
        resolve();
        return;
      }
      for (const worker of [registration.installing, registration.waiting, registration.active]) {
        if (worker && !workers.has(worker)) {
          workers.add(worker);
          worker.addEventListener("statechange", watch);
        }
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Browser alerts could not start. Please try again."));
    }, timeoutMs);
    registration.addEventListener("updatefound", watch);
    watch();
  });
}
