export const MEMBERSHIP_MINIMUM_CENTS = 500;
export const MEMBERSHIP_MAXIMUM_CENTS = 50_000;
export const MEMBERSHIP_DEFAULT_CENTS = 1_000;
export const SUPPORTER_TERMS_VERSION = "2026-08-28";
export const SUPPORTER_PRICE_NOTICE_MINIMUM_DAYS = 30;

export type SupporterBillingControls = {
  minimumAmountCents: number;
  maximumAmountCents: number;
  defaultAmountCents: number;
  subscriberNotice: string | null;
  noticeEffectiveAt: string | null;
  noticePublishedAt: string | null;
  renewalsDisabledAt: string | null;
  updatedAt: string | null;
};

export const DEFAULT_SUPPORTER_BILLING_CONTROLS: SupporterBillingControls = {
  minimumAmountCents: MEMBERSHIP_MINIMUM_CENTS,
  maximumAmountCents: MEMBERSHIP_MAXIMUM_CENTS,
  defaultAmountCents: MEMBERSHIP_DEFAULT_CENTS,
  subscriberNotice: null,
  noticeEffectiveAt: null,
  noticePublishedAt: null,
  renewalsDisabledAt: null,
  updatedAt: null,
};

export function validSupporterBillingControls(
  controls: Pick<SupporterBillingControls, "minimumAmountCents" | "maximumAmountCents" | "defaultAmountCents">,
): boolean {
  const { minimumAmountCents, maximumAmountCents, defaultAmountCents } = controls;
  return [minimumAmountCents, maximumAmountCents, defaultAmountCents].every(Number.isSafeInteger)
    && minimumAmountCents >= MEMBERSHIP_MINIMUM_CENTS
    && maximumAmountCents <= MEMBERSHIP_MAXIMUM_CENTS
    && minimumAmountCents <= defaultAmountCents
    && defaultAmountCents <= maximumAmountCents;
}

export function supporterAmountAllowed(
  amountCents: number,
  controls: Pick<SupporterBillingControls, "minimumAmountCents" | "maximumAmountCents" | "defaultAmountCents">,
): boolean {
  return Number.isSafeInteger(amountCents)
    && validSupporterBillingControls(controls)
    && amountCents >= controls.minimumAmountCents
    && amountCents <= controls.maximumAmountCents;
}
