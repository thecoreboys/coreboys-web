/**
 * Select the secret for Meta's X-Hub-Signature-256 without silently choosing
 * the wrong app when both Instagram and Facebook app families are configured.
 */
export function resolveMetaWebhookAppSecret(input: {
  metaAppSecret?: string | null;
  facebookAppSecret?: string | null;
  instagramClientSecret?: string | null;
}): string | null {
  const explicit = input.metaAppSecret?.trim();
  if (explicit) return explicit;

  const facebook = input.facebookAppSecret?.trim() || null;
  const instagram = input.instagramClientSecret?.trim() || null;
  if (facebook && instagram && facebook !== instagram) return null;
  return facebook || instagram;
}
