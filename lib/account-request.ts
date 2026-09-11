/** Scope an existing UI request to the account it was rendered for. */
export function accountRequestMatches(request: Request, userId: string): boolean {
  const expected = request.headers.get("x-core-account-id") ?? new URL(request.url).searchParams.get("accountId");
  // Older callers remain compatible; current account UI always supplies it.
  return expected === null || expected === userId;
}

export const ACCOUNT_CHANGED_MESSAGE = "Your signed-in account changed. Refresh this page to continue.";
