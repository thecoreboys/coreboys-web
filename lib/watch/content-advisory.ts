const CONTENT_ADVISORY_STORAGE_KEY = "coretv.content-advisory-seen.v2";

let acknowledgedInMemory = false;

/** Keeps the mature-audience advisory to one acknowledgement per browser. */
export function hasAcknowledgedContentAdvisory() {
  if (acknowledgedInMemory) return true;
  try {
    acknowledgedInMemory = window.localStorage.getItem(CONTENT_ADVISORY_STORAGE_KEY) === "1";
  } catch {
    // Some privacy modes deny storage. The in-memory fallback still prevents
    // duplicate notices during the current visit.
  }
  return acknowledgedInMemory;
}

export function acknowledgeContentAdvisory() {
  acknowledgedInMemory = true;
  try {
    window.localStorage.setItem(CONTENT_ADVISORY_STORAGE_KEY, "1");
  } catch {
    // The in-memory acknowledgement remains active for this visit.
  }
}
