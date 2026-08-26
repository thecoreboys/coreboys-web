"use client";

import { createContext, useCallback, useContext } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

export type FanUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  createdAt: string;
};

type AuthCtx = {
  user: FanUser | null;
  loading: boolean;
  refresh: () => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  refresh: () => {},
  logout: async () => {},
});

async function fetchMe(url: string): Promise<FanUser | null> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: FanUser | null };
  return data.user ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<FanUser | null>("/api/auth/me", fetchMe, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    await mutate(null, { revalidate: false });
    router.refresh();
  }, [mutate, router]);

  return (
    <Ctx.Provider value={{ user: data ?? null, loading: isLoading, refresh, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
