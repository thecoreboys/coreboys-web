"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  MY_LIST_EVENT,
  readMyList,
  refreshMyListFromStorage,
  selectMyListAccount,
  syncMyList,
} from "@/lib/watch/mylist";

export function useMyList() {
  const { user, loading } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const onListChange = (event: Event) => {
      const detail = (event as CustomEvent<string[]>).detail;
      setIds(Array.isArray(detail) ? detail : readMyList());
    };
    const onStorage = () => setIds(refreshMyListFromStorage());
    window.addEventListener(MY_LIST_EVENT, onListChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MY_LIST_EVENT, onListChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    if (!user) {
      selectMyListAccount(null);
      setIds([]);
      return;
    }
    setIds(selectMyListAccount(user.id));
    void syncMyList(user.id).then((nextIds) => {
      if (!cancelled) setIds(nextIds);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  return {
    ids,
    loading,
    signedIn: Boolean(user),
    user,
  };
}
