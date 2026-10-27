import { useCallback, useEffect, useRef, useState } from "react";
import { blob } from "../api/client";

/** Load data from the API; `reload()` after every action, because the backend owns all state (R11). */
export function useApi<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what `load` depends on
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await run();
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** A protected image as a `blob:` URL (an <img> cannot send the Authorization header). */
export function useBlobUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    let made: string | null = null;
    blob(path)
      .then((b) => {
        made = URL.createObjectURL(b);
        if (alive) setUrl(made);
        else URL.revokeObjectURL(made);
      })
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path]);
  return url;
}

/** Open a protected file (PDF) in a new tab. The tab opens at once, so pop-up blockers allow it. */
export async function openProtected(path: string) {
  const w = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await blob(path));
    if (w) w.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    w?.close();
    throw e;
  }
}
