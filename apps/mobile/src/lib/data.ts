import { useCallback, useEffect, useRef, useState } from "react";
import { api, errText } from "./api";

/** GET a path with loading / pull-to-refresh / silent (background) reloads. `null` path = do nothing yet. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);
  const live = useRef(true);
  const seq = useRef(0);

  const load = useCallback(
    async (mode: "load" | "refresh" | "silent") => {
      if (!path) return;
      const my = ++seq.current;
      if (mode === "refresh") setRefreshing(true);
      else if (mode === "load") setLoading(true);
      try {
        const r = await api.get<T>(path);
        if (live.current && my === seq.current) {
          setData(r);
          setError(null);
        }
      } catch (e) {
        if (live.current && my === seq.current && mode !== "silent") setError(errText(e));
      } finally {
        if (live.current && my === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  useEffect(() => {
    live.current = true;
    void load("load");
    return () => {
      live.current = false;
    };
  }, [load]);

  return {
    data,
    setData,
    error,
    loading,
    refreshing,
    reload: useCallback(() => load("refresh"), [load]),
    silent: useCallback(() => load("silent"), [load]),
  };
}
