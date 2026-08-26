export type PassportChatIdentity = {
  /** This Twitch account is linked to a real CORE site account. */
  siteUser: boolean;
  title: string | null;
  nameplate: string | null;
  frame: string | null;
  theme: string | null;
  accent: string;
  featuredCard: {
    name: string;
    artworkUrl: string | null;
    rarity: string;
    serialNumber: number | null;
  } | null;
  badges: Array<{
    code: string;
    name: string;
    tier: string;
  }>;
  reactions: string[];
};

export function passportIdentityAccent(...assets: Array<Record<string, unknown> | null | undefined>): string {
  for (const asset of assets) {
    if (!asset) continue;
    for (const key of ["accent", "color", "hex"]) {
      const value = asset[key];
      if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return value;
    }
  }
  return "#e31b36";
}
