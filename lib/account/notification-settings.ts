/** Keep a concurrent change to another delivery channel when a save returns. */
export function mergeSavedNotificationChannel<T extends { emailEnabled: boolean; smsEnabled: boolean; updatedAt: string | null }>(
  current: T,
  saved: T,
  field: "emailEnabled" | "smsEnabled",
): T {
  return { ...current, [field]: saved[field], updatedAt: saved.updatedAt };
}
