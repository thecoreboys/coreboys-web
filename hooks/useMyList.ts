"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  MY_LIST_EVENT,
  MY_LIST_STATUS_EVENT,
  readMyList,
  readMyListStatus,
  refreshMyListFromStorage,
  selectMyListAccount,
  syncMyList,
} from "@/lib/watch/mylist";

export function useMyList() {
  const { user, loading } = useAuth();
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState(readMyListStatus);

  useEffect(() => {
    const onListChange = (event: Event) => {
      const detail = (event as CustomEvent<string[]>).detail;
      setIds(Array.isArray(detail) ? detail : readMyList());
    };
    const onStorage = () => setIds(refreshMyListFromStorage());
    const onStatus = () => setStatus(readMyListStatus());
    window.addEventListener(MY_LIST_EVENT, onListChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener(MY_LIST_STATUS_EVENT, onStatus);
    return () => {
      window.removeEventListener(MY_LIST_EVENT, onListChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MY_LIST_STATUS_EVENT, onStatus);
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
  }, [loading, user?.id]);

  return {
    ids,
    loading: loading || status.syncing,
    error: status.error,
    refresh: () => user ? syncMyList(user.id, true) : Promise.resolve([]),
    signedIn: Boolean(user),
    user,
  };
}
