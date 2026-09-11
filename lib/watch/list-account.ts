/** Older callers may omit an account id; identified callers must match the cookie. */
export function listAccountMatches(expectedAccountId: string | undefined | null, authenticatedAccountId: string): boolean {
  return expectedAccountId == null || expectedAccountId === authenticatedAccountId;
}
