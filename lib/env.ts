import { z } from "zod";

const ServerEnvSchema = z.object({
  TWITCH_CLIENT_ID: z.string().min(1, "TWITCH_CLIENT_ID is required"),
  TWITCH_CLIENT_SECRET: z.string().min(1, "TWITCH_CLIENT_SECRET is required"),
});

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

let cachedServer: z.infer<typeof ServerEnvSchema> | null = null;

export function serverEnv(): z.infer<typeof ServerEnvSchema> {
  if (cachedServer) return cachedServer;
  const parsed = ServerEnvSchema.safeParse({
    TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Missing or invalid server env:\n${issues}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export const publicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
