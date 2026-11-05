"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PagedState<T> {
  items: T[];
  status: "idle" | "loading" | "ok" | "error";
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  retry: () => void;
}

/**
 * Loads a buyer-scoped, cursor-paged list the first time it is wanted (`enabled`), again when `version` changes (something was saved),
 * and further pages on request. A request that is no longer the latest is ignored, so a slow answer never overwrites a newer one.
 */
export function usePagedFetch<T>(url: string, enabled: boolean, version: number, pick: (body: unknown) => T[], cursorName = "after"): PagedState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<PagedState<T>["status"]>("idle");
  const [meta, setMeta] = useState<{ hasMore: boolean; nextCursor: string | null }>({ hasMore: false, nextCursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);
  const seen = useRef(version);
  const pickRef = useRef(pick);
  pickRef.current = pick;

  const fetchPage = useCallback(
    async (cursor: string | null, replace: boolean) => {
      const mine = ++counter.current;
      if (replace) setStatus("loading");
      else setLoadingMore(true);
      setError(null);
      try {
        const response = await fetch(`${url}${cursor ? `?${cursorName}=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (mine !== counter.current) return;
        if (!response.ok || !body?.ok) throw new Error(body?.message ?? "This could not be loaded.");
        const page = pickRef.current(body);
        setItems((cur) => (replace ? page : [...cur, ...page]));
        setMeta({ hasMore: Boolean(body.meta?.hasMore), nextCursor: body.meta?.nextCursor ?? null });
        setStatus("ok");
      } catch (e) {
        if (mine !== counter.current) return;
        setError((e as Error).message || "This could not be loaded.");
        setStatus(replace ? "error" : "ok");
      } finally {
        if (mine === counter.current) setLoadingMore(false);
      }
    },
    [url, cursorName],
  );

  useEffect(() => {
    if (seen.current !== version) {
      seen.current = version;
      counter.current++;
      setStatus("idle");
      setItems([]);
      return;
    }
    if (enabled && status === "idle") void fetchPage(null, true);
  }, [enabled, status, version, fetchPage]);

  return {
    items,
    status,
    hasMore: meta.hasMore,
    loadingMore,
    error,
    loadMore: () => meta.nextCursor && void fetchPage(meta.nextCursor, false),
    retry: () => void fetchPage(null, true),
  };
}
