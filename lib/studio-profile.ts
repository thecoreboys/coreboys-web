import { z } from "zod";

const OptionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const StudioProfilePatch = z.object({
  bio: OptionalText(2_000),
  commName: OptionalText(80),
  favoriteGame: OptionalText(120),
  description: OptionalText(4_000),
  nickname: OptionalText(80),
}).refine((value) => Object.keys(value).length > 0, "No changes supplied.");

export type StudioProfile = {
  slug: string;
  stageName: string;
  bio: string;
  commName: string;
  favoriteGame: string;
  description: string;
  nickname: string;
};

export function nullableProfileValue(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
